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
import { configuracion } from '../config/environment';
import { leerToken } from './session';

/** Cuánto se espera antes de dar una petición por perdida. */
const TIEMPO_MAXIMO_MS = 15_000;

// La forma del resultado vive en el dominio, no aqui: una decision que se
// apoyara en estos tipos quedaria atrapada detras de `expo-secure-store` y no
// se podria ejecutar fuera de un emulador.
export { MOTIVOS_DE_ERROR, type MotivoDeError, type Resultado } from '../domain/apiResult';

const fallo = (motivo: MotivoDeError, mensaje: string, codigo: string | null = null): Resultado<never> =>
  ({ ok: false, motivo, codigo, mensaje });

export interface OpcionesDePeticion {
  readonly metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
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

  const cabeceras: Record<string, string> = { accept: 'application/json' };
  if (opciones.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';

  if (opciones.conSesion !== false) {
    const token = await leerToken();
    if (token) cabeceras.authorization = `Bearer ${token}`;
  }

  const cancelador = new AbortController();
  const temporizador = setTimeout(() => { cancelador.abort(); }, opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS);

  let respuesta: Response;
  try {
    respuesta = await fetch(`${configuracion.urlBase}${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
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

  // 204 y compañía: correcto y sin cuerpo.
  if (respuesta.status === 204) return { ok: true, datos: undefined as T };

  let cuerpo: unknown;
  try {
    cuerpo = await respuesta.json();
  } catch {
    if (respuesta.ok) return fallo('RESPUESTA_INVALIDA', 'El servidor respondió algo que no es JSON.');
    cuerpo = {};
  }

  if (respuesta.ok) return { ok: true, datos: cuerpo as T };

  // El contrato de error del backend: `{ error: CÓDIGO }` más el estado HTTP.
  const codigo = leerCodigoDeError(cuerpo);

  if (respuesta.status === 401) {
    return fallo('NO_AUTENTICADO', 'La sesión no es válida o caducó.', codigo);
  }
  return fallo('ERROR_DEL_SERVIDOR', codigo ?? `El servidor respondió ${respuesta.status}.`, codigo);
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
