/**
 * La frontera con el backend.
 *
 * PEQUEÑA A PROPÓSITO
 *
 * No es un puerto de `src/services/apiService.js`. Aquel cliente arrastra
 * historia del navegador —cookies, recarga de página, comportamiento del DOM—
 * que en un teléfono no aplica. Lo que se reutiliza son los CONTRATOS
 * (`shared/contracts/`), que es donde vive el acuerdo de verdad.
 *
 * EL BACKEND SIGUE SIENDO LA AUTORIDAD
 *
 * Aquí no se decide nada: ni si una persona es conductora aprobada, ni si tiene
 * saldo, ni si un viaje puede avanzar. Esto manda peticiones y traduce
 * respuestas. Cualquier lógica que parezca una decisión de negocio en el cliente
 * es una decisión que se puede saltar desmontando la aplicación.
 *
 * NADA SENSIBLE EN LOS REGISTROS
 *
 * No se registra el token, ni las cabeceras, ni el cuerpo de las respuestas. El
 * error que sale de aquí lleva un código y un mensaje, y nada más.
 */

import type { ApiError } from '../../shared/contracts/api';
import type { MotivoDeError, Resultado } from '../domain/apiResult';
import { Platform } from 'react-native';

import { configuracion, EN_DESARROLLO } from '../config/environment';
import { urlParaEstaPlataforma } from '../domain/backendDelEntorno';
import { leerToken } from './session';

/**
 * La dirección a la que se llama de verdad.
 *
 * `configuracion.urlBase` es lo que puso quien configuró el entorno; esto es
 * eso mismo traducido a lo que ESTE dispositivo puede alcanzar. En el emulador
 * de Android `localhost` es el propio emulador, no el ordenador, y hay que
 * pedirle las cosas a `10.0.2.2`. La decisión vive en
 * `domain/backendDelEntorno`, sin nada de React Native, para poder comprobarla
 * sin levantar un emulador.
 */
const esAndroid = Platform.OS === 'android';
const constantes = Platform.constants as { Model?: string; Brand?: string; Fingerprint?: string } | undefined;
const esEmulador = esAndroid && (
  Boolean(constantes?.Model?.toLowerCase().includes('sdk')) ||
  Boolean(constantes?.Model?.toLowerCase().includes('emulator')) ||
  Boolean(constantes?.Fingerprint?.toLowerCase().includes('generic')) ||
  Boolean(constantes?.Fingerprint?.toLowerCase().includes('sdk_gphone')) ||
  constantes?.Brand === 'generic'
);

const URL_BASE = configuracion.ok
  ? urlParaEstaPlataforma(configuracion.urlBase, {
    esAndroid,
    enDesarrollo: EN_DESARROLLO,
    esEmulador
  })
  : '';

/** Cuánto se espera antes de dar una petición por perdida. */
const TIEMPO_MAXIMO_MS = 15_000;

// La forma del resultado vive en el dominio, no aqui: una decision que se
// apoyara en estos tipos quedaria atrapada detras de `expo-secure-store` y no
// se podria ejecutar fuera de un emulador.
export { MOTIVOS_DE_ERROR, type MotivoDeError, type Resultado } from '../domain/apiResult';
import { anotarFalloDeApi } from '../observabilidad/sentry';

const fallo = (
  motivo: MotivoDeError,
  mensaje: string,
  codigo: string | null = null,
  detalle?: unknown,
  estadoHttp: number | null = null
): Resultado<never> => ({ ok: false, motivo, codigo, mensaje, detalle, estadoHttp });

export interface OpcionesDePeticion {
  readonly metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /**
   * El cuerpo. Un objeto viaja como JSON; un `FormData` viaja tal cual.
   *
   * La subida de la fotografía es multipart y no JSON, y no vale serializarla:
   * hay que dejar que la plataforma ponga su propio `content-type` con el
   * límite que ella genera. Escribirlo a mano lo rompe.
   */
  readonly cuerpo?: unknown;
  /** Adjunta el token de sesión. Por defecto sí, salvo en login y registro. */
  readonly conSesion?: boolean;
  readonly tiempoMaximoMs?: number;
}

/**
 * Llama al backend.
 *
 * Si la configuración no es válida —lo más habitual: falta
 * `EXPO_PUBLIC_API_BASE_URL`— falla aquí mismo con el detalle que explica cómo
 * arreglarlo. Nunca se inventa un servidor al que llamar.
 */
export async function llamar<T>(ruta: string, opciones: OpcionesDePeticion = {}): Promise<Resultado<T>> {
  if (!configuracion.ok) {
    return fallo('SIN_CONFIGURACION', configuracion.detalle, configuracion.motivo);
  }

  const esFormulario = typeof FormData !== 'undefined' && opciones.cuerpo instanceof FormData;

  const cabeceras: Record<string, string> = { accept: 'application/json' };
  if (opciones.cuerpo !== undefined && !esFormulario) cabeceras['content-type'] = 'application/json';

  if (opciones.conSesion !== false) {
    const token = await leerToken();
    if (token) cabeceras.authorization = `Bearer ${token}`;
  }

  const cancelador = new AbortController();
  const temporizador = setTimeout(() => { cancelador.abort(); }, opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_BASE}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      body: opciones.cuerpo === undefined
        ? undefined
        : (esFormulario ? (opciones.cuerpo as FormData) : JSON.stringify(opciones.cuerpo)),
      signal: cancelador.signal
    });
  } catch (error) {
    // `AbortError` es el temporizador; cualquier otra cosa es la red.
    const abortada = error instanceof Error && error.name === 'AbortError';
    return abortada
      ? fallo('TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder.')
      : fallo('SIN_RED', 'No hay conexión con el servidor.');
  } finally {
    clearTimeout(temporizador);
  }

  const resultado = resultadoDesde<T>(respuesta.status, respuesta.status === 204 ? '' : await respuesta.text());
  anotarSiMerecelaPena(ruta, opciones.metodo ?? 'GET', resultado);
  return resultado;
}

/**
 * Deja constancia de una llamada que falló, para el diagnóstico.
 *
 * NO SE ANOTA TODO, Y ESO ES LA MITAD DEL VALOR
 *
 * Un 401 al abrir la aplicación es la sesión caducada; un 404 de expediente es
 * que esa persona no tiene expediente; un 403 de contacto sin verificar es la
 * guardia haciendo su trabajo. Los tres son respuestas correctas, y anotarlos
 * llena las migas de ruido hasta que el fallo de verdad no se distingue.
 *
 * Se anota lo que nadie espera: que el servidor se rompa (5xx) o que no
 * conteste. Que es, además, lo que la persona vive como «no carga».
 */
function anotarSiMerecelaPena(ruta: string, metodo: string, resultado: Resultado<unknown>): void {
  if (resultado.ok) return;
  const estado = resultado.estadoHttp ?? null;
  const esFalloDelServidor = estado !== null && estado >= 500;
  const esFaltaDeRespuesta = resultado.motivo === 'SIN_RED' || resultado.motivo === 'TIEMPO_AGOTADO';
  if (!esFalloDelServidor && !esFaltaDeRespuesta) return;
  anotarFalloDeApi({ ruta, metodo, estadoHttp: estado, codigo: resultado.codigo ?? null });
}

/** Traduce el estado HTTP y el cuerpo a un `Resultado`, venga de donde venga. */
function resultadoDesde<T>(estado: number, texto: string): Resultado<T> {
  // 204 y compañía: correcto y sin cuerpo.
  if (estado === 204) return { ok: true, datos: undefined as T };
  const correcto = estado >= 200 && estado < 300;

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    if (correcto) return fallo('RESPUESTA_INVALIDA', 'El servidor respondió algo que no es JSON.');
    cuerpo = {};
  }

  if (correcto) return { ok: true, datos: cuerpo as T };

  // El contrato de error del backend: `{ error: CÓDIGO }` más el estado HTTP.
  const codigo = leerCodigoDeError(cuerpo);

  if (estado === 401) {
    return fallo('NO_AUTENTICADO', 'La sesión no es válida o caducó.', codigo, cuerpo, 401);
  }
  return fallo('ERROR_DEL_SERVIDOR', codigo ?? `El servidor respondió ${estado}.`, codigo, cuerpo, estado);
}

/** Un archivo del teléfono, por su ruta. Ni bytes ni base64: eso lo lee nativo. */
export interface ArchivoParaSubir {
  readonly uri: string;
  readonly nombre: string;
  /** `image/jpeg`, `image/png`… */
  readonly tipo: string;
}

/**
 * Sube un archivo como multipart, por `XMLHttpRequest`.
 *
 * ¿POR QUÉ NO `fetch`? Desde el SDK 57 el `fetch` global es el de Expo
 * (`expo/fetch`), que arma el multipart en JavaScript y sólo admite partes
 * `Blob` o con `bytes()`; una parte `{ uri }` termina en «Unsupported
 * FormDataPart implementation». Leer la foto a memoria para envolverla en un
 * Blob es pasar varios megas por el puente de JavaScript. El `XMLHttpRequest`
 * de React Native, en cambio, manda la parte `{ uri }` desde nativo y en
 * streaming: sin base64, sin copias y sin cargar la foto en JavaScript. Es el
 * camino que React Native documenta para subir archivos.
 *
 * Mismo token, mismos códigos de error y mismo `Resultado` que `llamar()`.
 */
export async function subirArchivo<T>(
  ruta: string,
  campo: string,
  archivo: ArchivoParaSubir,
  { metodo = 'PUT', tiempoMaximoMs = 60_000 }: { readonly metodo?: 'POST' | 'PUT'; readonly tiempoMaximoMs?: number } = {}
): Promise<Resultado<T>> {
  if (!configuracion.ok) {
    return fallo('SIN_CONFIGURACION', configuracion.detalle, configuracion.motivo);
  }
  // Se lee fuera de la promesa: dentro del cierre TypeScript ya no sabe que
  // la configuración es válida.
  const urlBase = URL_BASE;
  const token = await leerToken();

  return new Promise<Resultado<T>>(resolve => {
    const peticion = new XMLHttpRequest();
    peticion.open(metodo, `${urlBase}${ruta}`);
    peticion.timeout = tiempoMaximoMs;
    peticion.setRequestHeader('accept', 'application/json');
    if (token) peticion.setRequestHeader('authorization', `Bearer ${token}`);
    peticion.onload = () => { resolve(resultadoDesde<T>(peticion.status, peticion.responseText ?? '')); };
    peticion.onerror = () => { resolve(fallo('SIN_RED', 'No hay conexión con el servidor.')); };
    peticion.ontimeout = () => { resolve(fallo('TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder.')); };

    const formulario = new FormData();
    // La forma que React Native entiende para un archivo por ruta.
    formulario.append(campo, { uri: archivo.uri, name: archivo.nombre, type: archivo.tipo } as unknown as Blob);
    peticion.send(formulario);
  });
}

/** Saca el código del cuerpo de error sin asumir que venga bien formado. */
function leerCodigoDeError(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const posible = (cuerpo as Partial<ApiError>).error;
  return typeof posible === 'string' && posible !== '' ? posible : null;
}

/**
 * Rutas que la aplicación móvil NO debe llamar jamás.
 *
 * `POST /api/wallet/payouts` es el retiro ANTIGUO. Está deshabilitado en
 * producción por WALLET-PAYOUTS-1A y no forma parte del futuro móvil: cuando los
 * retiros lleguen al teléfono, será sobre la fundación nueva.
 *
 * Está aquí como lista explícita para que una prueba pueda comprobar que ningún
 * fichero del cliente móvil la menciona. Es más fiable que confiar en que nadie
 * la copie de la web por costumbre.
 */
export const RUTAS_PROHIBIDAS = ['/api/wallet/payouts'] as const;
