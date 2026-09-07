/**
 * Los avisos de la aplicación.
 *
 * QUÉ SON Y QUÉ NO SON
 *
 * Son las notificaciones INTERNAS: lo que se ve al abrir la campana. No tienen
 * nada que ver con las notificaciones del sistema operativo —esas son push, y
 * el teléfono todavía no las recibe—.
 *
 * LA FORMA VIENE DEL SERVIDOR, Y ES CORTA
 *
 * `GET /api/notifications/me` devuelve objetos con: `id`, `title`, `message`,
 * `category`, `read`, `createdAt`, y `readAt` cuando ya se leyó. Nada más.
 *
 * En concreto: NO traen destino. Ninguna notificación creada en
 * `server/index.js` lleva `tripId`, ni enlace, ni ruta. Eso decide cómo se
 * comporta tocarlas, y está explicado abajo en `destinoDeAviso`.
 */

/**
 * Las categorías que el servidor usa hoy.
 *
 * Salen de `server/index.js` y de los servicios: FINANCE, ANNOUNCEMENT,
 * SAFE_TRANSPORT y SYSTEM. Una categoría desconocida no se descarta —el aviso
 * se enseña igual— pero tampoco abre ninguna puerta.
 */
export const CATEGORIAS_DE_AVISO = ['FINANCE', 'ANNOUNCEMENT', 'SAFE_TRANSPORT', 'SYSTEM'] as const;
export type CategoriaDeAviso = (typeof CATEGORIAS_DE_AVISO)[number];

export interface Aviso {
  readonly id: string;
  readonly titulo: string;
  readonly mensaje: string;
  /** La del servidor, o cadena vacía si vino sin ella. */
  readonly categoria: string;
  readonly sinLeer: boolean;
  /** ISO-8601, o cadena vacía. */
  readonly cuando: string;
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

/**
 * Traduce la respuesta del backend.
 *
 * Un aviso SIN identificador se descarta: no se podría marcar como leído, y una
 * fila que no responde al tocarla es peor que una fila que no está. El resto de
 * campos pueden faltar y quedan vacíos.
 *
 * Si la respuesta entera no es una lista, devuelve lista vacía en vez de
 * fallar: la bandeja vacía es un estado legítimo y esto no puede tumbarla.
 */
export function leerAvisos(cuerpo: unknown): readonly Aviso[] {
  if (!Array.isArray(cuerpo)) return [];

  const avisos: Aviso[] = [];
  for (const posible of cuerpo) {
    if (typeof posible !== 'object' || posible === null) continue;
    const dato = posible as Record<string, unknown>;

    const id = texto(dato.id);
    if (id === '') continue;

    avisos.push({
      id,
      titulo: texto(dato.title),
      mensaje: texto(dato.message),
      categoria: texto(dato.category),
      // Sólo el `true` explícito cuenta como leído. Cualquier otra cosa se lee
      // como SIN leer, que es el lado que no esconde nada.
      sinLeer: dato.read !== true,
      cuando: texto(dato.createdAt) || texto(dato.timestamp)
    });
  }
  return avisos;
}

/** Cuántos quedan sin leer. Cuenta; nunca resta, así que no puede ser negativo. */
export function contarSinLeer(avisos: readonly Aviso[]): number {
  return avisos.filter(aviso => aviso.sinLeer).length;
}

/**
 * La lista con uno marcado como leído.
 *
 * Función pura: la lista vieja no se toca. Marcar dos veces el mismo aviso da
 * el mismo resultado, así que un toque repetido no puede descuadrar el
 * contador.
 */
export function conAvisoLeido(avisos: readonly Aviso[], id: string): readonly Aviso[] {
  return avisos.map(aviso => (aviso.id === id ? { ...aviso, sinLeer: false } : aviso));
}

/**
 * Todos leídos.
 *
 * Es lo que resuelve la carrera entre «marcar uno» y «marcar todos»: da igual
 * en qué orden lleguen las respuestas, porque esto no depende del estado
 * anterior. Aplicado después de un `conAvisoLeido` da lo mismo que antes.
 */
export function conTodosLeidos(avisos: readonly Aviso[]): readonly Aviso[] {
  return avisos.map(aviso => (aviso.sinLeer ? { ...aviso, sinLeer: false } : aviso));
}

// ---------------------------------------------------------------------------
// A dónde lleva un aviso
// ---------------------------------------------------------------------------

/**
 * Los destinos que un aviso PODRÍA abrir.
 *
 * La lista existe aunque hoy esté vacía de destinos activos, y esa es
 * justamente la defensa: el día que el servidor empiece a mandar destinos, sólo
 * podrá abrir los que estén aquí. Sin lista blanca, un servidor comprometido
 * —o un fallo de validación en el panel de administración— podría mandar una
 * ruta cualquiera y la aplicación la abriría.
 */
export const DESTINOS_DE_AVISO = ['viaje', 'saldo', 'viaje-seguro', 'ayuda'] as const;
export type DestinoDeAviso = (typeof DESTINOS_DE_AVISO)[number];

/**
 * A dónde lleva este aviso. HOY, a ninguna parte, y por dos razones.
 *
 * 1. EL SERVIDOR NO MANDA DESTINO. Ninguna notificación creada en el backend
 *    lleva `tripId`, enlace ni ruta: sólo título, mensaje y categoría. Deducir
 *    el destino de la categoría sería adivinar —«FINANCE» no dice CUÁL
 *    movimiento— y llevar a la pantalla equivocada es peor que no llevar.
 *
 * 2. LAS PANTALLAS DESTINO TODAVÍA SON MAQUETAS. El saldo, el viaje y
 *    Transporte Seguro enseñan datos de ejemplo. Mandar a una persona real a
 *    ver cifras inventadas desde un aviso suyo sería la peor forma de
 *    estrenar la navegación.
 *
 * Cuando ambas cosas cambien, esta función devuelve el destino y la pantalla ya
 * sabe qué hacer con él: no hay que tocar la interfaz.
 */
export function destinoDeAviso(_aviso: Aviso): DestinoDeAviso | null {
  return null;
}

/** `true` sólo si el destino está en la lista blanca. */
export function esDestinoPermitido(destino: string): destino is DestinoDeAviso {
  return (DESTINOS_DE_AVISO as readonly string[]).includes(destino);
}

// ---------------------------------------------------------------------------
// Cuándo fue
// ---------------------------------------------------------------------------

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/**
 * «Hace 2 h», «Ayer», «Hace 3 días».
 *
 * El mismo formato que ya tenía el diseño, para que las filas se vean igual con
 * datos reales. Sin fecha legible devuelve cadena vacía y la línea desaparece,
 * en vez de enseñar «Invalid Date».
 *
 * `ahora` entra por parámetro para poder probarlo sin depender del reloj.
 */
export function cuandoFue(iso: string, ahora: number = Date.now()): string {
  if (iso === '') return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';

  const diferencia = ahora - fecha.getTime();
  // Una fecha futura —relojes desincronizados— se lee como «ahora» en vez de
  // «hace -3 horas».
  if (diferencia < MINUTO) return 'Ahora';
  if (diferencia < HORA) return `Hace ${Math.floor(diferencia / MINUTO)} min`;
  if (diferencia < DIA) return `Hace ${Math.floor(diferencia / HORA)} h`;
  if (diferencia < 2 * DIA) return 'Ayer';
  return `Hace ${Math.floor(diferencia / DIA)} días`;
}
