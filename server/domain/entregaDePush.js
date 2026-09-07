/**
 * Que un aviso salga UNA vez, y a quien no lo esté viendo ya.
 *
 * Reglas puras: sin red, sin base de datos, sin Express. Entra el estado y sale
 * una decisión. Es lo que permite comprobar la idempotencia entera sin levantar
 * un socket ni un proveedor.
 *
 * POR QUÉ HACE FALTA IDEMPOTENCIA AQUÍ
 *
 * Un mismo hecho puede llegar dos veces a este servidor por caminos que nada
 * tienen que ver entre sí: un socket que reintenta, una reconexión que reproduce
 * lo pendiente, dos oyentes registrados sobre el mismo evento, o una transición
 * que se intenta dos veces desde dos pantallas. La máquina de estados ya impide
 * que el VIAJE cambie dos veces —eso está resuelto— pero no impide que el sitio
 * que avisa se ejecute dos veces.
 *
 * Y el usuario no percibe «una transición idempotente»: percibe que el teléfono
 * sonó tres veces por lo mismo. Por eso la clave vive aquí y no en el sitio que
 * llama: un sitio nuevo que se olvide de deduplicar es un error probable, y
 * pasar por esta puerta es lo que lo hace imposible.
 *
 * LA CLAVE ES DEL HECHO, NO DEL INTENTO
 *
 * `viaje:ACEPTADO` ocurre una vez por viaje. `mensaje:msg_123` ocurre una vez
 * por mensaje. Dos intentos de avisar del mismo hecho comparten clave, y el
 * segundo no sale. Dos hechos distintos nunca la comparten.
 *
 * LA CLAVE ES EL IDENTIFICADOR DE LA FILA
 *
 * La persistencia de este proyecto guarda `(id, payload)`, así que la clave del
 * hecho ES el `id` de la entrada. Un segundo campo que dijera lo mismo podría
 * desincronizarse; con uno solo, eso no puede pasar.
 *
 * POR QUÉ SE PODAN
 *
 * Una colección que solo crece acaba siendo el problema. Un aviso que se
 * intenta repetir un día después no es un duplicado: es otra cosa, y
 * probablemente un error en otro sitio. Veinticuatro horas es de sobra para
 * cubrir reintentos, reconexiones y reproducciones.
 */

/** Cuánto se recuerda que un aviso ya salió. */
export const MEMORIA_DE_ENTREGA_MS = 24 * 60 * 60 * 1000;

/** Techo de entradas, para que la memoria no crezca sin final. */
export const MAXIMO_DE_ENTREGAS = 2000;

/**
 * La clave de un hecho del viaje.
 *
 * Un viaje pasa por cada estado UNA vez, así que el par identifica el hecho sin
 * necesidad de marca de tiempo. Si algún día un viaje pudiera volver a un
 * estado anterior, esta clave tendría que llevar también el intento — y ese día
 * fallaría esta prueba antes que la aplicación.
 */
export function claveDeViaje(tripId, tipo) {
  return `viaje:${tripId}:${tipo}`;
}

/** La clave de un mensaje. El identificador del mensaje ya es único. */
export function claveDeMensaje(messageId) {
  return `mensaje:${messageId}`;
}

/**
 * ¿Ya salió este aviso?
 *
 * Las entradas caducadas se tratan como inexistentes aunque todavía no se hayan
 * podado: el resultado no puede depender de cuándo pasó el podador.
 */
export function yaSeEntrego(colección, clave, ahora = Date.now()) {
  const entrada = (Array.isArray(colección) ? colección : []).find(item => item?.id === clave);
  if (!entrada) return false;
  return ahora - Number(entrada.at ?? 0) < MEMORIA_DE_ENTREGA_MS;
}

/**
 * Anota que salió, y poda de paso.
 *
 * Devuelve la colección modificada EN EL SITIO —es la misma que vive en la base
 * de datos— y la entrada nueva, para que quien llame la persista.
 */
export function anotarEntrega(colección, clave, ahora = Date.now()) {
  if (!Array.isArray(colección)) return { entrada: null, podadas: 0 };

  const previa = colección.findIndex(item => item?.id === clave);
  const entrada = { id: clave, at: ahora };
  if (previa >= 0) colección[previa] = entrada;
  else colección.push(entrada);

  const antes = colección.length;
  podar(colección, ahora);
  return { entrada, podadas: antes - colección.length };
}

/** Fuera las caducadas y, si aun así sobran, las más viejas. */
export function podar(colección, ahora = Date.now()) {
  if (!Array.isArray(colección)) return;

  for (let i = colección.length - 1; i >= 0; i -= 1) {
    if (ahora - Number(colección[i]?.at ?? 0) >= MEMORIA_DE_ENTREGA_MS) colección.splice(i, 1);
  }
  if (colección.length > MAXIMO_DE_ENTREGAS) {
    colección.sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));
    colección.splice(0, colección.length - MAXIMO_DE_ENTREGAS);
  }
}

/**
 * ¿Hace falta avisar, o esa persona ya lo está viendo?
 *
 * Un push que suena mientras tienes la pantalla delante no informa de nada:
 * molesta, y enseña en la pantalla de bloqueo algo que ya estabas leyendo.
 *
 * LA SEÑAL ES DEL SERVIDOR, NO DEL CLIENTE
 *
 * `conexionesVivas` sale de contar los sockets de esa persona en su propia sala
 * —`io.in('user:X').fetchSockets()`— y no de que el teléfono declare «estoy
 * mirando». Un cliente que mintiera podría silenciarse a sí mismo los avisos,
 * y eso es exactamente lo que no puede pasar con la oferta de una carrera.
 *
 * SE SUPRIME POCO, Y NUNCA LO QUE URGE
 *
 * Tener un socket vivo NO significa estar mirando: la aplicación en segundo
 * plano puede conservarlo unos segundos. Por eso sólo se suprime lo que se
 * puede permitir perder —el aviso de un mensaje cuyo chat ya está abierto— y
 * jamás una oferta de carrera ni un cambio de estado del viaje: ahí un aviso de
 * más es barato y uno de menos cuesta una carrera.
 */
export function convieneAvisar({ tipoSuprimible, conexionesVivas = 0 } = {}) {
  if (!tipoSuprimible) return true;
  return conexionesVivas === 0;
}
