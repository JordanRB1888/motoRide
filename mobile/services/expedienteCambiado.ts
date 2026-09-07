/**
 * Un aviso de que el expediente acaba de cambiar.
 *
 * PARA QUÉ
 *
 * Cuando alguien sube un documento o manda su solicitud, lo que el inicio tenga
 * guardado deja de valer en ese instante. Sin esto, el inicio seguiría diciendo
 * «solicitud en revisión» después de que la persona acabara de corregir algo.
 *
 * POR QUÉ ES UN MÓDULO APARTE
 *
 * El servicio de postulación avisa; el que guarda el estado escucha. Si se
 * llamaran directamente, cada uno importaría al otro y el ciclo rompería la
 * carga de módulos. Este fichero no importa nada, y por eso puede estar en
 * medio de los dos.
 */

type Oyente = () => void;

const oyentes = new Set<Oyente>();

/** Se escucha mientras haga falta; la función que devuelve deja de escuchar. */
export function alCambiarElExpediente(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

/**
 * Avisa a quien esté escuchando. No lanza nunca: un oyente que falle no puede
 * tumbar la subida de un documento que ya funcionó.
 */
export function avisarDeCambioDelExpediente(): void {
  for (const oyente of [...oyentes]) {
    try { oyente(); } catch { /* Un oyente roto no es asunto de quien avisa. */ }
  }
}

/** Sólo para pruebas: deja el registro como estaba al principio. */
export function olvidarOyentesDelExpediente(): void {
  oyentes.clear();
}
