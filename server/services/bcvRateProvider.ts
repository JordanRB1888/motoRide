/**
 * Proveedor de la tasa oficial USD/VES del Banco Central de Venezuela.
 *
 * FUENTE ÚNICA Y OFICIAL
 *
 *     https://www.bcv.org.ve/   (host `www.bcv.org.ve`, bajo control del BCV)
 *
 * No hay una segunda fuente y no la habrá aquí. Binance, Monitor Dólar,
 * DolarToday, las APIs que republican al BCV y cualquier promedio de mercado
 * paralelo quedan EXPLÍCITAMENTE fuera: republicar no es publicar, y la tasa
 * oficial sólo la declara quien la emite. Si el BCV no responde, este módulo
 * falla y se conserva la última tasa buena conocida. Nunca se sustituye por
 * otra cosa, y no existe ningún valor de respaldo escrito a mano.
 *
 * EL PROBLEMA DE TLS, Y POR QUÉ NO SE RESOLVIÓ APAGANDO TLS
 *
 * `www.bcv.org.ve` presenta un certificado legítimo de Sectigo pero NO envía el
 * certificado intermedio que lo encadena a la raíz. Los navegadores lo
 * disimulan descargando el emisor por AIA; Node no hace eso, así que falla:
 *
 *     UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *
 * La salida fácil habría sido `rejectUnauthorized: false`, que apaga la
 * verificación entera y deja la conexión abierta a cualquiera que pueda
 * interponerse — para traer un número con el que se cobra dinero. En su lugar
 * se AÑADE el intermedio que falta al almacén de confianza del sistema, sin
 * sustituirlo. La validación sigue siendo completa: firma, cadena hasta una
 * raíz de confianza, caducidad y nombre de host. No se relaja nada; se completa
 * lo que el servidor omite.
 *
 * El intermedio está en `server/certs/`, obtenido del AIA del propio
 * certificado del BCV, con su huella documentada.
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

import { leerTasaDelBcv, type MotivoDeFallo } from '../domain/bcvRateParser.ts';

/** La fuente oficial. Constantes exportadas para que las pruebas las vigilen. */
export const HOST_OFICIAL_BCV = 'www.bcv.org.ve';
export const URL_OFICIAL_BCV = `https://${HOST_OFICIAL_BCV}/`;

/**
 * Los únicos hosts a los que se permite llegar, incluso siguiendo una redirección.
 *
 * Una redirección es una instrucción que da el servidor, y seguirla a ciegas
 * significa aceptar que un tercero decida de dónde sacamos la tasa. Sólo se
 * admite el dominio del BCV.
 */
const DOMINIO_DEL_BCV = 'bcv.org.ve';
const MAXIMO_DE_REDIRECCIONES = 3;

/** Cortafuegos de recursos: la portada del BCV pesa ~150 KB. */
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
const TIEMPO_MAXIMO_MS = 15_000;
const INTENTOS = 3;
const ESPERA_ENTRE_INTENTOS_MS = 2_000;

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RUTA_DEL_INTERMEDIO = path.join(
  aqui,
  '../certs/sectigo-public-server-authentication-ca-dv-r36.pem'
);

/** `true` para `bcv.org.ve` y sus subdominios; `false` para `malobcv.org.ve`. */
export function esHostDelBcv(host: string): boolean {
  const limpio = String(host ?? '').toLowerCase();
  return limpio === DOMINIO_DEL_BCV || limpio.endsWith(`.${DOMINIO_DEL_BCV}`);
}

let agenteCacheado: https.Agent | null = null;

/**
 * El agente HTTPS con la cadena completada y la verificación INTACTA.
 *
 * `ca` recibe el almacén del sistema MÁS el intermedio. Es importante que sea
 * `[...tls.rootCertificates, intermedio]` y no sólo el intermedio: pasar `ca`
 * reemplaza el almacén por defecto, así que omitir las raíces del sistema
 * dejaría fuera a la raíz que firma este mismo intermedio.
 */
export function crearAgenteDelBcv(): https.Agent {
  if (agenteCacheado) return agenteCacheado;
  const intermedio = fs.readFileSync(RUTA_DEL_INTERMEDIO, 'utf8');
  agenteCacheado = new https.Agent({
    ca: [...tls.rootCertificates, intermedio],
    // Explícito aunque sea el valor por defecto: que quede escrito que la
    // verificación está encendida, para que apagarla requiera editar esta línea
    // a conciencia y no sea nunca un descuido.
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    keepAlive: false
  });
  return agenteCacheado;
}

export interface RespuestaDescargada {
  readonly html: string;
  readonly urlFinal: string;
  readonly estado: number;
}

/**
 * Comprueba que un destino es admisible ANTES de conectar.
 *
 * Está extraída y exportada a propósito: es la regla que decide a dónde se
 * permite llegar, y una prueba que la reimplementara estaría comprobando su
 * propia copia en vez de este código. La usan tanto la petición inicial como
 * cada redirección.
 */
export function validarDestino(url: string): URL {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw new Error('URL inválida');
  }

  // HTTPS y sólo HTTPS. Sobre HTTP cualquiera en el camino puede cambiar el
  // número, y el número es con lo que se cobra.
  if (destino.protocol !== 'https:') {
    throw new Error(`sólo se admite HTTPS, no ${destino.protocol}`);
  }
  if (!esHostDelBcv(destino.hostname)) {
    throw new Error(`host fuera del dominio del BCV: ${destino.hostname}`);
  }
  return destino;
}

/** Descarga un documento del BCV con todas las protecciones puestas. */
export function descargarDelBcv(
  url: string,
  saltosRestantes = MAXIMO_DE_REDIRECCIONES
): Promise<RespuestaDescargada> {
  return new Promise((resolver, rechazar) => {
    let destino: URL;
    try {
      destino = validarDestino(url);
    } catch (error) {
      rechazar(error instanceof Error ? error : new Error('destino inválido'));
      return;
    }

    const peticion = https.get(
      destino,
      {
        agent: crearAgenteDelBcv(),
        timeout: TIEMPO_MAXIMO_MS,
        headers: {
          // Identificarse es lo correcto: si nuestro tráfico molesta, el BCV
          // tiene que poder saber quién es.
          'user-agent': 'plus58express-fx/1.0 (+tasa oficial USD/VES)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'es-VE,es'
        }
      },
      respuesta => {
        const estado = respuesta.statusCode ?? 0;

        if (estado >= 300 && estado < 400 && respuesta.headers.location) {
          respuesta.resume();
          if (saltosRestantes <= 0) {
            rechazar(new Error('demasiadas redirecciones'));
            return;
          }
          // Se resuelve contra la URL actual y se vuelve a validar entera con
          // `validarDestino`: el destino de una redirección pasa exactamente por
          // los mismos filtros de esquema y dominio que la petición original.
          const siguiente = new URL(respuesta.headers.location, destino).toString();
          resolver(descargarDelBcv(siguiente, saltosRestantes - 1));
          return;
        }

        if (estado !== 200) {
          respuesta.resume();
          rechazar(new Error(`el BCV respondió con estado ${estado}`));
          return;
        }

        let bytes = 0;
        const trozos: Buffer[] = [];
        respuesta.on('data', (trozo: Buffer) => {
          bytes += trozo.length;
          if (bytes > TAMANO_MAXIMO_BYTES) {
            respuesta.destroy();
            rechazar(new Error('la respuesta excede el tamaño máximo admitido'));
            return;
          }
          trozos.push(trozo);
        });
        respuesta.on('end', () => {
          resolver({
            html: Buffer.concat(trozos).toString('utf8'),
            urlFinal: destino.toString(),
            estado
          });
        });
        respuesta.on('error', rechazar);
      }
    );

    peticion.on('timeout', () => {
      peticion.destroy(new Error(`sin respuesta en ${TIEMPO_MAXIMO_MS} ms`));
    });
    peticion.on('error', rechazar);
  });
}

export interface TasaObtenida {
  readonly tasa: string;
  readonly fechaValor: string;
  readonly obtenidaEn: string;
}

export type ResultadoDelProveedor =
  | { readonly ok: true; readonly valor: TasaObtenida }
  | { readonly ok: false; readonly motivo: MotivoDeFallo | 'RED'; readonly detalle: string };

/** Descargador sustituible: es la costura por la que entran las pruebas. */
export type Descargador = (url: string) => Promise<RespuestaDescargada>;

export interface OpcionesDelProveedor {
  readonly descargador?: Descargador;
  readonly intentos?: number;
  readonly esperaMs?: number;
  readonly ahora?: () => Date;
}

const dormir = (ms: number) => new Promise(listo => { setTimeout(listo, ms); });

/**
 * Obtiene la tasa oficial vigente.
 *
 * Reintenta sólo los fallos de RED, con espera creciente. Un HTML que se
 * descarga bien pero no se puede interpretar NO se reintenta: repetir la misma
 * petición daría el mismo documento, y el problema es que la página cambió de
 * forma — eso lo tiene que ver una persona, no un bucle.
 *
 * Nunca lanza: devuelve el fallo descrito para que quien llame decida. Lo que
 * NO hace, pase lo que pase, es devolver un número inventado.
 */
export async function obtenerTasaOficial(
  opciones: OpcionesDelProveedor = {}
): Promise<ResultadoDelProveedor> {
  const descargar = opciones.descargador ?? (url => descargarDelBcv(url));
  const intentos = opciones.intentos ?? INTENTOS;
  const esperaMs = opciones.esperaMs ?? ESPERA_ENTRE_INTENTOS_MS;
  const ahora = opciones.ahora ?? (() => new Date());

  let ultimoFalloDeRed = 'sin detalle';

  for (let intento = 1; intento <= intentos; intento += 1) {
    let descarga: RespuestaDescargada;
    try {
      descarga = await descargar(URL_OFICIAL_BCV);
    } catch (error) {
      // Sólo el mensaje. Ni cabeceras, ni cuerpo, ni el documento entero: esto
      // acaba en los registros del servidor.
      ultimoFalloDeRed = error instanceof Error ? error.message : 'fallo desconocido';
      if (intento < intentos) await dormir(esperaMs * intento);
      continue;
    }

    const lectura = leerTasaDelBcv(descarga.html);
    if (!lectura.ok) {
      return { ok: false, motivo: lectura.motivo, detalle: lectura.detalle };
    }

    return {
      ok: true,
      valor: {
        tasa: lectura.lectura.tasa,
        fechaValor: lectura.lectura.fechaValor,
        obtenidaEn: ahora().toISOString()
      }
    };
  }

  return { ok: false, motivo: 'RED', detalle: ultimoFalloDeRed };
}
