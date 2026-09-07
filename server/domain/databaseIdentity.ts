/**
 * Identificación del entorno de base de datos ANTES de escribir en él.
 *
 * POR QUÉ EXISTE
 *
 * La versión anterior decidía «esto es Test» mirando el contenido: si
 * `public.users` tenía cincuenta filas o menos, adelante. Eso no identifica
 * nada. Producción también puede tener pocas filas —un despliegue nuevo, una
 * base recién migrada, un mal día— y entonces la heurística da luz verde para
 * escribir en la base real.
 *
 * Aquí la identidad es POSITIVA y por configuración declarada: hay que decir
 * explícitamente cuál es el proyecto de Test, y el destino observado tiene que
 * ser exactamente ese. Todo lo demás se rechaza.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN
 *
 *  1. **Producción se deniega primero.** Antes que cualquier otra cosa. Si el
 *     destino coincide con una identidad conocida de producción, se rechaza
 *     aunque alguien la haya declarado como Test — esa combinación no es un
 *     permiso, es un error de configuración, y es justo el error que más daño
 *     hace.
 *
 *  2. **Sin declaración no se escribe.** No hay valor por defecto, no hay
 *     «si no se sabe, probablemente sea Test». Fallar cerrado.
 *
 *  3. **No hay puerta trasera.** No existe ninguna variable que salte estas
 *     comprobaciones. Si hiciera falta una, sería lo primero que alguien
 *     pondría en un script un viernes por la tarde.
 *
 * SOBRE LOS SECRETOS
 *
 * Nada de lo que sale de aquí contiene la URI, el usuario ni la contraseña.
 * Los identificadores de proyecto se reducen a una huella corta, suficiente
 * para diagnosticar y insuficiente para reconstruir nada.
 */

export const VEREDICTOS_DE_IDENTIDAD = [
  'APTO_PARA_ESCRITURA',
  'RECHAZO_ES_PRODUCCION',
  'RECHAZO_IDENTIDAD_DESCONOCIDA',
  'RECHAZO_SIN_DECLARACION',
  'RECHAZO_IDENTIDAD_ILEGIBLE'
] as const;
export type VeredictoDeIdentidad = (typeof VEREDICTOS_DE_IDENTIDAD)[number];

export interface ResultadoDeIdentidad {
  readonly veredicto: VeredictoDeIdentidad;
  /** `true` sólo con `APTO_PARA_ESCRITURA`. Es lo único que debe consultarse para escribir. */
  readonly puedeEscribir: boolean;
  /** Explicación sin secretos, apta para registros. */
  readonly detalle: string;
}

/**
 * Reduce un identificador a una huella corta.
 *
 * Ni siquiera los identificadores de proyecto se imprimen enteros: no son
 * contraseñas, pero tampoco hay razón para dejarlos en un registro.
 */
export function huellaDeIdentidad(valor: string): string {
  const limpio = String(valor ?? '').trim();
  if (limpio === '') return '(vacío)';
  if (limpio.length <= 8) return `${limpio.slice(0, 2)}…`;
  return `${limpio.slice(0, 4)}…${limpio.slice(-3)}`;
}

/**
 * Saca el identificador de proyecto de una URI de PostgreSQL.
 *
 * En Supabase vive en dos sitios según cómo se conecte: en el usuario cuando se
 * pasa por el pooler (`postgres.<ref>`) y en el host en conexión directa
 * (`db.<ref>.supabase.co`). Se miran los dos.
 *
 * Devuelve `null` si no se puede determinar, y ese `null` acaba en un rechazo:
 * no saber dónde se está a punto de escribir es motivo suficiente para no
 * escribir.
 */
export function extraerIdentidadDeProyecto(uri: string): string | null {
  if (typeof uri !== 'string' || uri.trim() === '') return null;

  let analizada: URL;
  try {
    analizada = new URL(uri);
  } catch {
    return null;
  }

  const usuario = decodeURIComponent(analizada.username ?? '');
  const punto = usuario.indexOf('.');
  if (punto !== -1) {
    const ref = usuario.slice(punto + 1).trim();
    if (ref !== '') return ref.toLowerCase();
  }

  const anfitrion = (analizada.hostname ?? '').toLowerCase();
  const directo = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/.exec(anfitrion);
  if (directo?.[1]) return directo[1];

  return null;
}

export interface EntradaDeIdentidad {
  /** La URI a la que se escribiría. Nunca se imprime. */
  readonly uriObservada: string;
  /** El proyecto que se declara como Test. Sin esto no se escribe. */
  readonly refTestDeclarado: string | null | undefined;
  /** Identidades conocidas de producción. Cualquier coincidencia es un rechazo. */
  readonly refsDeProduccion?: readonly (string | null | undefined)[];
}

const normalizar = (valor: string | null | undefined): string =>
  String(valor ?? '').trim().toLowerCase();

/**
 * Decide si se puede escribir en el destino.
 *
 * El orden de las comprobaciones ES la seguridad: producción se deniega antes
 * de mirar nada más.
 */
export function evaluarIdentidadDeBaseDeDatos(entrada: EntradaDeIdentidad): ResultadoDeIdentidad {
  const observado = extraerIdentidadDeProyecto(entrada.uriObservada);

  if (observado === null) {
    return {
      veredicto: 'RECHAZO_IDENTIDAD_ILEGIBLE',
      puedeEscribir: false,
      detalle: 'no se pudo determinar la identidad del proyecto de destino'
    };
  }

  // PRIMERO la denegación. Una identidad de producción se rechaza pase lo que
  // pase, incluso si viene declarada como Test: esa contradicción es un error
  // de configuración, y tratarla como permiso sería exactamente el fallo que
  // este módulo existe para impedir.
  const produccion = (entrada.refsDeProduccion ?? []).map(normalizar).filter(ref => ref !== '');
  if (produccion.includes(observado)) {
    return {
      veredicto: 'RECHAZO_ES_PRODUCCION',
      puedeEscribir: false,
      detalle: `el destino ${huellaDeIdentidad(observado)} es una identidad de PRODUCCIÓN`
    };
  }

  const declarado = normalizar(entrada.refTestDeclarado);
  if (declarado === '') {
    return {
      veredicto: 'RECHAZO_SIN_DECLARACION',
      puedeEscribir: false,
      detalle: 'no se declaró qué proyecto es el de Test; sin declaración no se escribe'
    };
  }

  if (declarado !== observado) {
    return {
      veredicto: 'RECHAZO_IDENTIDAD_DESCONOCIDA',
      puedeEscribir: false,
      detalle:
        `el destino ${huellaDeIdentidad(observado)} no es el Test declarado ` +
        `${huellaDeIdentidad(declarado)}`
    };
  }

  return {
    veredicto: 'APTO_PARA_ESCRITURA',
    puedeEscribir: true,
    detalle: `identidad de Test confirmada: ${huellaDeIdentidad(observado)}`
  };
}

/**
 * Las variables que declaran la identidad. Nombres estables, sin secretos.
 *
 * `FX_TEST_DB_PROJECT_REF` es obligatoria para que las pruebas con escritura se
 * ejecuten. Sin ella se saltan enteras, que es el comportamiento correcto.
 */
export const VARIABLE_DE_TEST = 'FX_TEST_DB_PROJECT_REF';
export const VARIABLE_DE_PRODUCCION = 'FX_PRODUCTION_DB_PROJECT_REFS';

/**
 * Reúne las identidades de producción conocidas desde el entorno.
 *
 * Además de la lista explícita, se deducen de `DATABASE_URL` y
 * `PRODUCTION_DATABASE_URL` si están presentes: si la base real está
 * configurada en este mismo entorno, su identidad queda automáticamente
 * denegada sin que nadie tenga que acordarse de declararla.
 */
export function identidadesDeProduccionDelEntorno(
  entorno: Record<string, string | undefined> = process.env
): readonly string[] {
  const lista = String(entorno[VARIABLE_DE_PRODUCCION] ?? '')
    .split(',')
    .map(normalizar)
    .filter(ref => ref !== '');

  const deducidas = ['DATABASE_URL', 'PRODUCTION_DATABASE_URL']
    .map(clave => extraerIdentidadDeProyecto(String(entorno[clave] ?? '')))
    .filter((ref): ref is string => ref !== null);

  return [...new Set([...lista, ...deducidas])];
}
