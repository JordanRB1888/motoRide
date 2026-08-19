/**
 * Cuánto ocupa el formato heredado, para dimensionar la migración de 4D.
 *
 * Desde 4C los mensajes nuevos guardan la imagen en el volumen y solo dejan la
 * referencia en la fila, así que este recuento solo puede bajar. 4D necesita
 * saber cuántas filas quedan y cuánto pesan antes de tocarlas: cuánto espacio
 * hará falta, cuánto durará y qué margen deja el volumen.
 *
 * Es una función pura sobre colecciones ya cargadas. No abre la base, no lee el
 * disco y no expone ninguna ruta HTTP: la usan las pruebas y la usará el script
 * de migración. Nada de esto se ejecuta al arrancar el servidor.
 */

/** Prefijo de una data URL de imagen heredada. */
const LEGACY_PREFIX = /^data:image\/(jpeg|png|webp);base64,/;

/**
 * Bytes reales que representa una cadena base64, sin decodificarla.
 *
 * Cada cuatro caracteres son tres bytes, menos el relleno. Decodificar de
 * verdad para medir duplicaría el uso de memoria justo en el barrido que
 * pretende decidir si hay memoria suficiente.
 */
export function base64Bytes(base64) {
  const longitud = base64.length;
  if (longitud === 0) return 0;
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(longitud * 3 / 4) - relleno;
}

/** Recuento de una sola colección. */
function medirColeccion(mensajes) {
  const resumen = {
    total: 0,
    conImagenHeredada: 0,
    conReferencia: 0,
    caracteresBase64: 0,
    bytesAproximados: 0,
    mayorBase64: 0
  };

  for (const mensaje of Array.isArray(mensajes) ? mensajes : []) {
    resumen.total += 1;
    if (mensaje?.imageRef?.id) resumen.conReferencia += 1;

    const heredada = mensaje?.image;
    if (typeof heredada !== 'string' || !LEGACY_PREFIX.test(heredada)) continue;

    const base64 = heredada.slice(heredada.indexOf(',') + 1);
    resumen.conImagenHeredada += 1;
    resumen.caracteresBase64 += base64.length;
    resumen.bytesAproximados += base64Bytes(base64);
    if (base64.length > resumen.mayorBase64) resumen.mayorBase64 = base64.length;
  }

  return resumen;
}

/**
 * Métricas agregadas del formato heredado, separadas por canal.
 *
 * Devuelve solo números: ni un fragmento de imagen, ni un identificador, ni
 * nada que pueda identificar a una persona. Está pensado para poder imprimirse
 * tal cual.
 */
export function measureLegacyChatMedia({ messages = [], supportMessages = [] } = {}) {
  const viaje = medirColeccion(messages);
  const soporte = medirColeccion(supportMessages);

  return {
    trip: viaje,
    support: soporte,
    total: {
      total: viaje.total + soporte.total,
      conImagenHeredada: viaje.conImagenHeredada + soporte.conImagenHeredada,
      conReferencia: viaje.conReferencia + soporte.conReferencia,
      caracteresBase64: viaje.caracteresBase64 + soporte.caracteresBase64,
      bytesAproximados: viaje.bytesAproximados + soporte.bytesAproximados,
      mayorBase64: Math.max(viaje.mayorBase64, soporte.mayorBase64)
    }
  };
}
