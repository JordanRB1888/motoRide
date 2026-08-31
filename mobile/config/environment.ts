/**
 * A qué backend habla la aplicación móvil.
 *
 * LA REGLA QUE ORDENA ESTE FICHERO
 *
 * En desarrollo, si falta la configuración, la aplicación **no arranca contra
 * producción**. Falla y lo dice.
 *
 * No es una precaución teórica. Un valor por defecto que apunte a producción es
 * la forma más fácil de que alguien depure contra la base real sin enterarse:
 * crea viajes de prueba, mueve saldos de personas reales y deja rastro en datos
 * que no son suyos. Y el día que se descubre, ya pasó.
 *
 * Por eso aquí NO existe ninguna URL de producción escrita como respaldo. No
 * está comentada, no está en una constante «por si acaso» y no se deduce del
 * nombre del entorno. Si no se declara, no hay backend.
 *
 * TODO `EXPO_PUBLIC_*` ES PÚBLICO
 *
 * Cualquier variable con ese prefijo queda incrustada en el paquete que se
 * instala en el teléfono y se puede leer descompilándolo. Aquí sólo viven cosas
 * que no son secretas: la URL del backend y el nombre del entorno. Ninguna
 * clave, ningún token, ningún identificador de servicio privado.
 */

export const ENTORNOS = ['development', 'staging', 'production'] as const;
export type Entorno = (typeof ENTORNOS)[number];

/** Los nombres de las variables. Estables, para que las pruebas los vigilen. */
export const VARIABLE_URL = 'EXPO_PUBLIC_API_BASE_URL';
export const VARIABLE_ENTORNO = 'EXPO_PUBLIC_ENV';

export const MOTIVOS_DE_FALLO = [
  'URL_AUSENTE',
  'URL_INVALIDA',
  'URL_NO_SEGURA',
  'ENTORNO_DESCONOCIDO'
] as const;
export type MotivoDeFallo = (typeof MOTIVOS_DE_FALLO)[number];

export interface ConfiguracionValida {
  readonly ok: true;
  readonly entorno: Entorno;
  readonly urlBase: string;
}

export interface ConfiguracionRota {
  readonly ok: false;
  readonly motivo: MotivoDeFallo;
  /** Texto para enseñar en pantalla. Explica qué falta y cómo arreglarlo. */
  readonly detalle: string;
}

export type Configuracion = ConfiguracionValida | ConfiguracionRota;

const texto = (valor: unknown): string => String(valor ?? '').trim();

/**
 * Resuelve la configuración a partir de las variables.
 *
 * Se le pasan explícitamente para poder probarla; en la aplicación real recibe
 * `process.env`, que Expo sustituye en tiempo de compilación.
 */
export function resolverConfiguracion(
  variables: Record<string, string | undefined>,
  esDesarrollo: boolean
): Configuracion {
  const declarado = texto(variables[VARIABLE_ENTORNO]);
  // Sin declaración explícita se asume el entorno MÁS restrictivo que tiene
  // sentido: desarrollo. Nunca producción.
  const entorno: string = declarado === '' ? (esDesarrollo ? 'development' : 'production') : declarado;

  if (!ENTORNOS.includes(entorno as Entorno)) {
    return {
      ok: false,
      motivo: 'ENTORNO_DESCONOCIDO',
      detalle: `${VARIABLE_ENTORNO} vale "${entorno}". Los valores admitidos son: ${ENTORNOS.join(', ')}.`
    };
  }

  const url = texto(variables[VARIABLE_URL]);
  if (url === '') {
    // AQUÍ es donde otra aplicación caería a producción. Ésta no.
    return {
      ok: false,
      motivo: 'URL_AUSENTE',
      detalle:
        `Falta ${VARIABLE_URL}. La aplicación no elige un backend por su cuenta: ` +
        'defínela en tu .env local apuntando a tu servidor de desarrollo ' +
        '(por ejemplo http://192.168.1.10:4000, que es el puerto del servidor). ' +
        'Tienes una plantilla en mobile/.env.example. No se usará producción por omisión.'
    };
  }

  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    return { ok: false, motivo: 'URL_INVALIDA', detalle: `${VARIABLE_URL} no es una URL válida.` };
  }

  if (analizada.protocol !== 'https:' && analizada.protocol !== 'http:') {
    return {
      ok: false,
      motivo: 'URL_INVALIDA',
      detalle: `${VARIABLE_URL} debe empezar por http:// o https://.`
    };
  }

  // HTTP en claro sólo se tolera en desarrollo, donde el backend suele correr en
  // la red local sin certificado. Fuera de desarrollo es un error: mandar
  // credenciales por HTTP desde un teléfono, a menudo por wifi ajena, es
  // exactamente el escenario que TLS existe para cubrir.
  if (analizada.protocol === 'http:' && entorno !== 'development') {
    return {
      ok: false,
      motivo: 'URL_NO_SEGURA',
      detalle: `En ${entorno} el backend tiene que ser HTTPS.`
    };
  }

  return {
    ok: true,
    entorno: entorno as Entorno,
    // Sin barra final, para poder concatenar rutas sin duplicarla.
    urlBase: url.replace(/\/+$/, '')
  };
}

/**
 * La configuración real de esta ejecución.
 *
 * `process.env.EXPO_PUBLIC_*` lo sustituye Expo en tiempo de compilación, así
 * que hay que nombrar cada variable literalmente: un acceso dinámico
 * (`process.env[nombre]`) no se sustituiría y llegaría vacío al dispositivo.
 */
export const configuracion: Configuracion = resolverConfiguracion(
  {
    [VARIABLE_URL]: process.env.EXPO_PUBLIC_API_BASE_URL,
    [VARIABLE_ENTORNO]: process.env.EXPO_PUBLIC_ENV
  },
  // `__DEV__` es global de React Native: cierto en Metro, falso en release.
  typeof __DEV__ !== 'undefined' && __DEV__
);
