/**
 * Servidor de mantenimiento de +58express.
 *
 * Existe por una razón concreta y aprendida a golpes: el servicio de Railway
 * tiene un healthcheck en `/api/health`, y ese healthcheck decide si el
 * despliegue vive. Durante el tercer cutover se intentó congelar las escrituras
 * arrancando el contenedor con `sleep infinity` y luego con `tail -f /dev/null`.
 * El primero no existía en la imagen; el segundo mantiene el proceso vivo pero
 * no sirve HTTP, así que la sonda recibió "service unavailable" durante los dos
 * minutos de la ventana y Railway marcó el despliegue como FAILED. Sin
 * contenedor sano no hay SSH, y sin SSH no hay instantánea: la congelación se
 * convirtió en una caída.
 *
 * Este archivo es la respuesta correcta: un proceso que satisface la sonda y no
 * hace absolutamente nada más. En particular NO abre SQLite, NO abre
 * PostgreSQL, NO levanta Socket.IO y NO ejecuta ningún trabajo de fondo, de
 * modo que mientras corre el número de escritores sobre la base de datos es
 * exactamente cero y la instantánea que se tome es consistente.
 *
 * La garantía no es una promesa del comentario: este módulo importa únicamente
 * `node:http`. Como los imports de ESM son estáticos, un grafo de módulos que
 * solo contiene `node:http` no puede inicializar nada de lo anterior. La prueba
 * `maintenanceServer.test.js` lo verifica leyendo el propio archivo, de forma
 * que cualquier import futuro que rompa la propiedad hace fallar la suite.
 */

import http from 'node:http';

// Mismo valor por defecto que index.js, para que un arranque sin PORT en local
// se comporte igual en los dos modos.
export const PUERTO_POR_DEFECTO = 4000;

// 0.0.0.0 y no localhost: Railway enruta desde fuera del contenedor, y un
// servidor atado al bucle local supera cualquier prueba local mientras falla la
// sonda real. Es exactamente la clase de error que este archivo evita.
export const HOST = '0.0.0.0';

export const RUTA_SALUD = '/api/health';

/**
 * La carga útil que ve el healthcheck. `maintenance: true` es lo que permite
 * distinguir sin ambigüedad este proceso del servidor normal --cuyo `/api/health`
 * responde `status: 'ok'` y no incluye esta clave--, y `databaseWriters: 0` deja
 * escrito en la propia respuesta el invariante que justifica la ventana.
 *
 * No lleva versión, ni rama, ni commit, ni nada derivado del entorno: la
 * respuesta es pública y no debe filtrar configuración.
 */
export function cuerpoDeSalud() {
  return { ok: true, maintenance: true, databaseWriters: 0 };
}

function responderJson(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    // Ni la sonda ni un proxy intermedio deben reutilizar esta respuesta: el
    // estado de mantenimiento cambia justo cuando termina la ventana.
    'cache-control': 'no-store'
  });
  res.end(texto);
}

export function manejar(req, res) {
  // Se compara solo la ruta: la sonda de Railway no manda query, pero un
  // `?t=` de un navegador no debería sacar al proceso de mantenimiento.
  const ruta = (req.url || '').split('?')[0];

  if (ruta === RUTA_SALUD && (req.method === 'GET' || req.method === 'HEAD')) {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end();
    }
    return responderJson(res, 200, cuerpoDeSalud());
  }

  // Todo lo demás se rechaza con 503. Importa que sea 503 y no 404: un cliente
  // de la aplicación debe entender que el servicio existe y volverá, no que la
  // ruta ha desaparecido. `retry-after` es orientativo, en segundos.
  res.setHeader('retry-after', '60');
  return responderJson(res, 503, { ok: false, maintenance: true, error: 'MAINTENANCE_MODE' });
}

export function createMaintenanceServer() {
  return http.createServer(manejar);
}

export function start({ port = process.env.PORT || PUERTO_POR_DEFECTO, host = HOST } = {}) {
  const server = createMaintenanceServer();
  server.listen(Number(port), host, () => {
    // Una sola línea, reconocible y distinta de la del servidor normal, para
    // que los registros de Railway digan sin lugar a dudas en qué modo está el
    // contenedor.
    console.log(`[+58express Maintenance] escuchando en ${host}:${port} · escritores de base de datos = 0`);
  });
  return server;
}

if (import.meta.main) start();
