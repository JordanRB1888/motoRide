/**
 * La polilínea codificada de Google, traducida a coordenadas.
 *
 * QUÉ ES
 *
 * Google no devuelve la geometría de una ruta como una lista de puntos: la
 * devuelve como una cadena. Cada punto se guarda como la DIFERENCIA con el
 * anterior, multiplicada por cien mil, en zigzag —para que los negativos no
 * gasten bits de más— y troceada en grupos de cinco bits que se escriben como
 * caracteres imprimibles. Una ruta de doscientos puntos ocupa así unos
 * seiscientos bytes en vez de varios miles.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN EL CLIENTE DE RED
 *
 * Porque es una función pura y hay que poder comprobarla sin llamar a Google.
 * Una decodificación mal hecha no falla: dibuja la ruta en otro sitio, y eso se
 * ve como un mapa roto, no como un error.
 *
 * POR QUÉ VIVE EN EL SERVIDOR Y NO EN EL TELÉFONO
 *
 * El servidor es la autoridad de la geometría, igual que ya lo es de la
 * distancia y la duración (`tripMetrics.js`). Al teléfono le llega la lista de
 * puntos ya hecha: no decide por dónde va la ruta, sólo la pinta.
 */

/**
 * Cuánto se multiplica cada grado antes de guardarlo.
 *
 * Es el factor del formato de Google, no una elección nuestra: cinco decimales,
 * o sea algo más de un metro. Cambiarlo produce una ruta desplazada, que es
 * justo el fallo silencioso del que habla la cabecera.
 */
const ESCALA = 1e5;

/**
 * Decodifica una polilínea codificada a una lista de coordenadas.
 *
 * Devuelve una lista VACÍA ante cualquier entrada que no sea una cadena
 * utilizable. No lanza: una ruta ilegible tiene que degradar a «no hay ruta»,
 * que es honesto, y nunca tumbar la petición que la pidió.
 *
 * @param {string} codificada
 * @returns {Array<{lat:number,lng:number}>}
 */
export function decodificarPolilinea(codificada) {
  if (typeof codificada !== 'string' || codificada === '') return [];

  const puntos = [];
  let indice = 0;
  let lat = 0;
  let lng = 0;

  while (indice < codificada.length) {
    const deLatitud = siguienteValor(codificada, indice);
    if (deLatitud === null) return [];
    lat += deLatitud.valor;
    indice = deLatitud.indice;

    const deLongitud = siguienteValor(codificada, indice);
    if (deLongitud === null) return [];
    lng += deLongitud.valor;
    indice = deLongitud.indice;

    const punto = { lat: lat / ESCALA, lng: lng / ESCALA };
    // Una coordenada fuera del mundo significa que la cadena no era lo que
    // decía ser. Mejor ninguna ruta que una ruta en el vacío.
    if (!esCoordenadaDelMundo(punto)) return [];
    puntos.push(punto);
  }

  return puntos;
}

/**
 * Lee UN número del flujo: grupos de cinco bits, el de continuación marcado, y
 * zigzag al final.
 *
 * Devuelve `null` si la cadena se acaba a mitad de un número o si trae un
 * carácter fuera del alfabeto. Es la única forma de distinguir «se acabó» de
 * «esto no era una polilínea».
 */
function siguienteValor(cadena, desde) {
  let indice = desde;
  let desplazamiento = 0;
  let acumulado = 0;
  let trozo = 0;

  do {
    if (indice >= cadena.length) return null;
    trozo = cadena.charCodeAt(indice) - 63;
    indice += 1;
    // 63 es el desplazamiento del formato; por debajo de cero o por encima de
    // cinco bits con continuación, la cadena no es una polilínea.
    if (trozo < 0 || trozo > 0x3f) return null;
    acumulado |= (trozo & 0x1f) << desplazamiento;
    desplazamiento += 5;
    // Treinta y cinco bits es más de lo que cabe en una coordenada del mundo:
    // si se llega ahí, la entrada está corrupta y seguiría leyendo para siempre.
    if (desplazamiento > 35) return null;
  } while (trozo >= 0x20);

  // Zigzag: el bit bajo es el signo.
  const valor = (acumulado & 1) ? ~(acumulado >> 1) : (acumulado >> 1);
  return { valor, indice };
}

function esCoordenadaDelMundo(punto) {
  return Number.isFinite(punto.lat) && Number.isFinite(punto.lng)
    && punto.lat >= -90 && punto.lat <= 90
    && punto.lng >= -180 && punto.lng <= 180;
}

/**
 * Adelgaza una ruta sin cambiar su forma (Ramer–Douglas–Peucker).
 *
 * POR QUÉ HACE FALTA
 *
 * Google devuelve un punto por cada matiz del asfalto: una carrera de quince
 * minutos por Maracaibo puede traer cuatrocientos. Dibujar cuatrocientos puntos
 * en un `<Polyline>` de Android que además se repinta con cada movimiento del
 * conductor es trabajo desperdiciado — a la escala a la que se mira el mapa,
 * doscientos de esos puntos caen dentro del mismo píxel.
 *
 * Se descartan sólo los puntos que están a menos de `toleranciaGrados` de la
 * línea que forman sus vecinos, así que las curvas se conservan enteras y lo
 * que desaparece son los tramos rectos partidos en cachitos. La forma que se
 * pinta es la misma; lo que baja es la cuenta.
 *
 * NO es una simplificación de la ruta como decisión de producto: la ruta sigue
 * siendo la que dijo el proveedor. Es sólo cuántos puntos hacen falta para
 * dibujar exactamente esa ruta.
 */
export function adelgazarRuta(puntos, toleranciaGrados = 0.00004) {
  if (!Array.isArray(puntos) || puntos.length <= 2) return Array.isArray(puntos) ? [...puntos] : [];

  const conservar = new Array(puntos.length).fill(false);
  conservar[0] = true;
  conservar[puntos.length - 1] = true;

  const pendientes = [[0, puntos.length - 1]];
  while (pendientes.length > 0) {
    const [inicio, fin] = pendientes.pop();
    if (fin - inicio < 2) continue;

    let peor = -1;
    let distanciaPeor = 0;
    for (let i = inicio + 1; i < fin; i += 1) {
      const d = distanciaAlSegmento(puntos[i], puntos[inicio], puntos[fin]);
      if (d > distanciaPeor) {
        distanciaPeor = d;
        peor = i;
      }
    }

    if (distanciaPeor > toleranciaGrados && peor !== -1) {
      conservar[peor] = true;
      pendientes.push([inicio, peor], [peor, fin]);
    }
  }

  return puntos.filter((_, i) => conservar[i]);
}

/**
 * Distancia perpendicular de un punto al segmento, en grados.
 *
 * En grados y no en metros a propósito: es una comparación contra una
 * tolerancia también en grados, y convertir a metros aquí sólo añadiría un
 * coseno por punto para tomar exactamente la misma decisión.
 */
function distanciaAlSegmento(punto, extremoA, extremoB) {
  const dx = extremoB.lng - extremoA.lng;
  const dy = extremoB.lat - extremoA.lat;
  const largoAlCuadrado = dx * dx + dy * dy;

  if (largoAlCuadrado === 0) {
    return Math.hypot(punto.lng - extremoA.lng, punto.lat - extremoA.lat);
  }

  // Dónde cae la proyección del punto sobre el segmento, acotada a sus extremos.
  let t = ((punto.lng - extremoA.lng) * dx + (punto.lat - extremoA.lat) * dy) / largoAlCuadrado;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(
    punto.lng - (extremoA.lng + t * dx),
    punto.lat - (extremoA.lat + t * dy)
  );
}
