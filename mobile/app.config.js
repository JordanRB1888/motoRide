/**
 * Las claves de Google Maps, resueltas de verdad.
 *
 * POR QUÉ ESTE FICHERO EXISTE
 *
 * `app.json` es JSON estático: una cadena como `"$EXPO_PUBLIC_..."` se queda
 * ahí escrita, literal, y acaba en el manifiesto de Android tal cual. Google
 * la recibe como clave y la rechaza, así que el mapa sale gris. Sólo un
 * `app.config.js` puede leer el entorno de verdad, porque es JavaScript y se
 * ejecuta al construir.
 *
 * Y hay una segunda razón. El complemento de `react-native-maps` lee la clave
 * de SUS PROPIAS opciones —`androidGoogleMapsApiKey`, `iosGoogleMapsApiKey`—,
 * no de `android.config.googleMaps.apiKey`. Es más: si no se la pasan,
 * ELIMINA `com.google.android.geo.API_KEY` del manifiesto. Ponerla en el sitio
 * antiguo no sólo no funcionaba: el complemento borraba después lo poco que
 * hubiera. Comprobado sobre el manifiesto generado.
 *
 * TRES CLAVES DISTINTAS, Y NUNCA LA DEL SERVIDOR
 *
 * Cada plataforma tiene la suya porque cada una se restringe de forma
 * distinta: Android por paquete y huella SHA-1, iOS por identificador, la web
 * por referente HTTP. Una sola clave para las tres tendría que aceptarlo todo,
 * y una clave que lo acepta todo la puede usar cualquiera con tu factura.
 *
 * `DISPATCH_ROUTES_API_KEY` —la que calcula rutas en el despacho— no aparece
 * aquí ni puede aparecer: no tiene restricción de plataforma y publicada en
 * una aplicación es una factura abierta.
 *
 * SI NO HAY CLAVE, NO SE INVENTA
 *
 * Sin variable no se escribe ninguna: el mapa falla cerrado y lo dice. Escribir
 * una cadena vacía sería peor, porque Google contesta un error distinto y
 * cuesta más entender qué falta.
 */

const path = require('path');

const CLAVE_DE_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
const CLAVE_DE_IOS = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY;

/**
 * LA VARIANTE QUE SE LES MANDA A LOS AMIGOS.
 *
 * Se enciende con `APP_VARIANT=beta` al construir. Cambia lo que hay que poder
 * distinguir de un vistazo --el nombre bajo el icono-- y NADA MAS.
 *
 * POR QUE NO CAMBIA EL PAQUETE
 *
 * Seria lo natural: un `applicationId` propio deja convivir la beta con la
 * aplicacion de verdad en el mismo telefono. Pero en Android el paquete es la
 * identidad con la que se firman TRES credenciales distintas:
 *
 *   - `google-services.json`, que ata FCM a `com.plus58express.app`. Con otro
 *     paquete, las notificaciones dejan de llegar.
 *   - La clave de Maps de Android, restringida por paquete y huella SHA-1. Con
 *     otro paquete, el mapa sale gris.
 *   - Los clientes OAuth de Google Sign-In, atados igual. Con otro paquete, no
 *     se puede entrar con Google.
 *
 * Cambiarlo obliga a dar de alta las tres otra vez, en tres consolas, antes de
 * que la beta pueda siquiera arrancar. Mientras no exista una version en
 * produccion instalada en ningun telefono, no hay con que convivir y ese precio
 * no compra nada. El dia que la haya, se cambia el paquete Y se dan de alta las
 * tres credenciales a la vez: por separado no funciona.
 */
const ES_BETA = process.env.APP_VARIANT === 'beta';
const NOMBRE_DE_LA_BETA = '+58Express Beta';

/**
 * De qué worktree sale este bundle, para poder decirlo al arrancar.
 *
 * Este fichero se evalúa EN EL PROYECTO QUE SIRVE EL BUNDLE, así que
 * `__dirname` es la única fuente honesta: si quien responde es el Metro de otra
 * rama, aquí saldrá el nombre de esa otra rama, que es justo lo que se quiere
 * poder leer. En `dev/procedenciaDelBundle.ts` está por qué hace falta.
 *
 * SÓLO FUERA DE PRODUCCIÓN. El nombre de una carpeta del ordenador de quien
 * compila no pinta nada en una aplicación que se instala la gente.
 */
function worktreeDeDesarrollo() {
  if (process.env.NODE_ENV === 'production') return null;
  return path.basename(path.resolve(__dirname, '..'));
}

/**
 * El esquema de URL con el que iOS vuelve de Google (AUTH-FINAL-3).
 *
 * Es el client ID de iOS AL REVÉS: `123-abc.apps.googleusercontent.com` se
 * convierte en `com.googleusercontent.apps.123-abc`. Se DERIVA en vez de pedir
 * otra variable, porque son el mismo dato escrito de dos formas y dos
 * variables que tienen que coincidir acaban no coincidiendo.
 *
 * Sin client ID de iOS no se escribe ninguno: el complemento se queda como
 * está y el flujo de iOS no arranca, que es lo correcto cuando falta la
 * configuración. Inventar un esquema daría un error de Google mucho más
 * difícil de leer que la ausencia.
 */
function esquemaInvertidoDeGoogle(clienteDeIos) {
  const sufijo = '.apps.googleusercontent.com';
  if (!clienteDeIos || !clienteDeIos.endsWith(sufijo)) return null;
  return `com.googleusercontent.apps.${clienteDeIos.slice(0, -sufijo.length)}`;
}

module.exports = ({ config }) => {
  const opciones = {};
  if (CLAVE_DE_ANDROID) opciones.androidGoogleMapsApiKey = CLAVE_DE_ANDROID;
  if (CLAVE_DE_IOS) opciones.iosGoogleMapsApiKey = CLAVE_DE_IOS;

  const esquemaDeGoogle = esquemaInvertidoDeGoogle(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);

  // La lista de complementos sigue viviendo en `app.json`; aquí sólo se le
  // añaden las opciones a uno. Redefinirla entera dejaría una trampa: quien
  // añadiera mañana un complemento en `app.json` lo vería ignorado sin que
  // nada avisara.
  const plugins = (config.plugins ?? []).map((entrada) => {
    const nombre = Array.isArray(entrada) ? entrada[0] : entrada;
    if (nombre === 'react-native-maps') return ['react-native-maps', opciones];
    if (nombre === '@react-native-google-signin/google-signin' && esquemaDeGoogle) {
      return ['@react-native-google-signin/google-signin', { iosUrlScheme: esquemaDeGoogle }];
    }
    return entrada;
  });

  const worktree = worktreeDeDesarrollo();
  const extra = worktree === null
    ? config.extra
    : { ...config.extra, worktreeDeDesarrollo: worktree };

  // El nombre bajo el icono. Que quien la tenga instalada sepa SIEMPRE que
  // esta mirando la beta: si no se distingue, un fallo de staging se reporta
  // como un fallo de la aplicacion de verdad.
  const name = ES_BETA ? NOMBRE_DE_LA_BETA : config.name;

  return { ...config, name, plugins, extra };
};
