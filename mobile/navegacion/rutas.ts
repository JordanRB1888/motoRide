/**
 * A dónde lleva cada destino.
 *
 * POR QUÉ ESTO EXISTE
 *
 * La barra inferior y las casillas del inicio hablan en CLAVES —`inicio`,
 * `saldo`, `comercios`— porque una clave es una decisión de producto y una ruta
 * es un detalle del router. Aquí se traducen las unas a las otras, en un solo
 * sitio.
 *
 * Repartir `router.push('/diseno/saldo')` por veinte componentes ata el diseño
 * a la forma de las rutas: mover una pantalla de sitio obligaría a buscar y
 * reemplazar por toda la aplicación, y el día que estas pantallas se monten
 * dentro de las rutas con sesión —`/pasajero/saldo` en vez de
 * `/diseno/saldo`— sólo hay que cambiar este fichero.
 *
 * LO QUE NO ESTÁ CONSTRUIDO NO SE OCULTA
 *
 * Comida, Mercado, Envíos y Compra y vende no existen. Sus claves llevan a
 * `pronto`, que es una pantalla de verdad que explica qué falta. Es mejor que
 * las tres alternativas: un botón muerto miente, esconderlas deja la rejilla
 * coja, y una pantalla vacía no dice nada.
 */

/** Las claves que usan la barra, las casillas y las filas del perfil. */
export type DestinoDeDiseno =
  | 'inicio' | 'pedir' | 'para-quien' | 'punto' | 'confirmar' | 'buscando' | 'viaje'
  | 'historial' | 'viaje-detalle' | 'viaje-seguro' | 'perfil' | 'saldo' | 'avisos' | 'ayuda'
  | 'configuracion' | 'comercios' | 'comercio' | 'pronto'
  | 'conductor' | 'conductor-jornada' | 'conductor-saldo'
  | 'splash' | 'acceso' | 'rol';

const RAIZ = '/diseno';

export const RUTA_DE_DESTINO: Readonly<Record<DestinoDeDiseno, string>> = Object.freeze({
  inicio: `${RAIZ}`,
  pedir: `${RAIZ}/pedir`,
  'para-quien': `${RAIZ}/para-quien`,
  punto: `${RAIZ}/punto`,
  confirmar: `${RAIZ}/confirmar`,
  buscando: `${RAIZ}/buscando`,
  viaje: `${RAIZ}/viaje`,
  historial: `${RAIZ}/historial`,
  'viaje-detalle': `${RAIZ}/viaje-detalle`,
  'viaje-seguro': `${RAIZ}/viaje-seguro`,
  perfil: `${RAIZ}/perfil`,
  saldo: `${RAIZ}/saldo`,
  avisos: `${RAIZ}/avisos`,
  ayuda: `${RAIZ}/ayuda`,
  configuracion: `${RAIZ}/configuracion`,
  comercios: `${RAIZ}/comercios`,
  comercio: `${RAIZ}/comercio`,
  pronto: `${RAIZ}/pronto`,
  conductor: `${RAIZ}/conductor`,
  'conductor-jornada': `${RAIZ}/conductor/jornada`,
  'conductor-saldo': `${RAIZ}/conductor/saldo`,
  splash: `${RAIZ}/splash`,
  acceso: `${RAIZ}/acceso`,
  rol: `${RAIZ}/rol`
});

/**
 * Qué destino le toca a cada casilla del inicio.
 *
 * Los servicios que no están listos van todos a la misma pantalla de «pronto»:
 * la casilla dice cuál es, y la pantalla explica lo mismo para todas.
 */
export const DESTINO_DE_SERVICIO: Readonly<Record<string, DestinoDeDiseno>> = Object.freeze({
  viajes: 'pedir',
  comercios: 'comercios',
  seguro: 'viaje-seguro',
  envios: 'pronto',
  comida: 'pronto',
  mercado: 'pronto',
  tienda: 'pronto'
});
