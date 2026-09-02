/**
 * La entrada a la aplicación: lo que se elige ANTES de entrar, y lo que esa
 * elección NO significa.
 *
 * INTENCIÓN, NO AUTORIDAD
 *
 * La bienvenida pregunta «¿Cómo quieres continuar?» con dos tarjetas, Pasajero
 * y Conductor. Esa elección es una INTENCIÓN DE NAVEGACIÓN: decide qué contexto
 * se enseña en el acceso y, el día que exista el registro en la aplicación, qué
 * flujo de alta se abre. Nada más.
 *
 * No es el rol. El rol lo dice la cuenta —`/api/auth/me`— y sólo ella. Por eso
 * aquí hay dos funciones que existen para dejarlo escrito y probado:
 *
 *   · `credencialesParaEntrar` recibe la intención y la DESCARTA: al backend
 *     viajan identificador y contraseña, y nada más. Antes el acceso mandaba el
 *     rol elegido y el backend respondía 401 si no coincidía con la cuenta:
 *     elegir mal era «contraseña incorrecta» con la contraseña correcta.
 *
 *   · `destinoTrasEntrar` recibe la cuenta REAL y la intención, y decide sólo
 *     por la cuenta. Quien eligió Pasajero con una cuenta de conductor entra
 *     igual y va al inicio de conductor. Y al revés.
 *
 * LO QUE EXISTE Y LO QUE NO
 *
 * Aquí está también lo que la bienvenida reserva y todavía no es real: la
 * entrada con Google y con Apple, y los documentos legales. Están escritos como
 * datos —`disponible: false`, `publicado: false`— para que la pantalla no
 * pueda fingir: un botón social sin autenticación detrás se enseña deshabilitado
 * y dice «Disponible próximamente»; un documento no publicado abre una pantalla
 * que dice que no está publicado, no un texto jurídico inventado.
 */

import { experienciaDeLaIdentidad } from './authState';

// ---------------------------------------------------------------------------
// La intención
// ---------------------------------------------------------------------------

/** Lo que se puede elegir en la bienvenida. Coincide con los roles móviles. */
export const INTENCIONES_DE_ENTRADA = ['passenger', 'driver'] as const;
export type IntencionDeEntrada = (typeof INTENCIONES_DE_ENTRADA)[number];

/** Sin nada recordado, se preselecciona Pasajero: es la mayoría. */
export const INTENCION_POR_DEFECTO: IntencionDeEntrada = 'passenger';

export function esIntencionDeEntrada(valor: unknown): valor is IntencionDeEntrada {
  return typeof valor === 'string'
    && (INTENCIONES_DE_ENTRADA as readonly string[]).includes(valor);
}

export interface OpcionDeEntrada {
  readonly intencion: IntencionDeEntrada;
  readonly titulo: string;
  readonly detalle: string;
  /** Qué avatar de rol la ilustra. Son los activos oficiales del selector. */
  readonly avatar: 'pasajero' | 'conductor';
}

/** Las dos tarjetas, con el texto aprobado por el dueño. */
export const OPCIONES_DE_ENTRADA: readonly OpcionDeEntrada[] = Object.freeze([
  Object.freeze({
    intencion: 'passenger',
    titulo: 'Pasajero',
    detalle: 'Pide una carrera y llega a donde vas.',
    avatar: 'pasajero'
  }),
  Object.freeze({
    intencion: 'driver',
    titulo: 'Conductor',
    detalle: 'Recibe carreras y gestiona tu jornada.',
    avatar: 'conductor'
  })
] as const);

export function describirIntencion(intencion: IntencionDeEntrada): OpcionDeEntrada {
  const opcion = OPCIONES_DE_ENTRADA.find(candidata => candidata.intencion === intencion);
  if (!opcion) throw new Error(`intención desconocida: ${String(intencion)}`);
  return opcion;
}

// ---------------------------------------------------------------------------
// Lo que viaja al backend, y lo que no
// ---------------------------------------------------------------------------

export interface CredencialesConIntencion {
  readonly identificador: string;
  readonly contrasena: string;
  /** Se acepta para dejar claro que se recibe… y se descarta. */
  readonly intencion?: IntencionDeEntrada | null;
}

/**
 * Lo único que se manda al backend para entrar.
 *
 * La intención no está en el resultado, y no es un descuido: es la regla. No
 * hay ningún camino por el que la elección de una tarjeta llegue a
 * `/api/auth/login`.
 */
export function credencialesParaEntrar(credenciales: CredencialesConIntencion): {
  readonly identificador: string;
  readonly contrasena: string;
} {
  return { identificador: credenciales.identificador, contrasena: credenciales.contrasena };
}

/**
 * A dónde se va después de entrar. Lo decide la cuenta REAL.
 *
 * La intención se recibe como segundo argumento para que quede escrito que se
 * IGNORA: `destinoTrasEntrar(cuentaDeConductor, 'passenger')` es el inicio de
 * conductor.
 */
export function destinoTrasEntrar(
  usuario: Parameters<typeof experienciaDeLaIdentidad>[0],
  _intencion?: IntencionDeEntrada | null
): '/conductor' | '/pasajero' {
  return experienciaDeLaIdentidad(usuario) === 'driver' ? '/conductor' : '/pasajero';
}

// ---------------------------------------------------------------------------
// La entrada social: reservada, no fingida
// ---------------------------------------------------------------------------

/**
 * Google y Apple, tal como están HOY: sin autenticación detrás.
 *
 * `disponible` es `false` porque no hay infraestructura real —ni en el servidor
 * hay una ruta que las acepte, ni la aplicación lleva un cliente—. Cuando
 * exista, este es el único sitio que hay que cambiar, y entonces la prueba que
 * exige que no se finja pedirá también que haya un manejador de verdad.
 */
export const ENTRADA_SOCIAL = Object.freeze({
  google: Object.freeze({ titulo: 'Continuar con Google', disponible: false as boolean }),
  apple: Object.freeze({ titulo: 'Continuar con Apple', disponible: false as boolean })
});

/** Lo que se dice sobre un botón que todavía no hace nada. */
export const AVISO_DE_NO_DISPONIBLE = 'Disponible próximamente';

// ---------------------------------------------------------------------------
// Los documentos legales: enlazados, no inventados
// ---------------------------------------------------------------------------

export interface DocumentoLegal {
  readonly titulo: string;
  /** La ruta de la aplicación que lo enseña. */
  readonly ruta: '/legal/terminos' | '/legal/privacidad';
  /**
   * Si existe un documento real que enseñar.
   *
   * Con `false`, la pantalla dice que todavía no está publicado. No se redacta
   * nada jurídico aquí: eso lo entrega quien corresponda.
   */
  readonly publicado: boolean;
}

export const DOCUMENTOS_LEGALES = Object.freeze({
  terminos: Object.freeze({
    titulo: 'Términos y Condiciones',
    ruta: '/legal/terminos',
    publicado: false
  }),
  privacidad: Object.freeze({
    titulo: 'Política de Privacidad',
    ruta: '/legal/privacidad',
    publicado: false
  })
}) satisfies Readonly<Record<string, DocumentoLegal>>;

export type ClaveDeDocumentoLegal = keyof typeof DOCUMENTOS_LEGALES;

/** El aviso de la bienvenida, en tres trozos alrededor de los dos enlaces. */
export const AVISO_LEGAL = Object.freeze({
  antes: 'Al continuar, aceptas los ',
  entre: ' y confirmas que has leído la ',
  despues: '.'
});

// ---------------------------------------------------------------------------
// La salida de la moto
// ---------------------------------------------------------------------------

/**
 * Los tiempos de la animación al continuar, en milisegundos.
 *
 * Ignición (la sacudida), retroceso, y aceleración hacia la derecha con las
 * estelas. La suma queda dentro de los 450–650 ms que pidió el dueño.
 *
 * `navegarEn` es cuándo se pasa al acceso, y llega ANTES de que la animación
 * termine: la navegación no espera a la moto. Con movimiento reducido no hay
 * animación y se navega en el acto.
 */
export const SALIDA_DE_LA_MOTO = Object.freeze({
  ignicion: 120,
  retroceso: 110,
  aceleracion: 330,
  navegarEn: 440
});

export const DURACION_DE_LA_SALIDA =
  SALIDA_DE_LA_MOTO.ignicion + SALIDA_DE_LA_MOTO.retroceso + SALIDA_DE_LA_MOTO.aceleracion;
