/**
 * El servidor de revisión visual. SÓLO EN LOCAL.
 *
 * PARA QUÉ
 *
 * Para poder mirar +58express en un navegador, señalar un botón concreto con
 * las herramientas del inspector y cambiarlo sin pasar por capturas.
 *
 * POR QUÉ NO ES EXPO WEB
 *
 * Sería lo suyo, y no se puede. Expo Web necesita `react-native-web`, y npm no
 * lo instala: `expo-router@57.0.17` arrastra `react-dom@19.2.8`, que exige
 * `react@^19.2.8`, mientras el SDK 57 fija `react@19.2.3`. Es una
 * inconsistencia del propio SDK.
 *
 * La salida fácil sería subir React. No se hace: Android e iOS son el producto
 * y funcionan, y no se arriesgan por tener una vista previa cómoda.
 *
 * CÓMO SE EVITA QUE ESTO SE SEPARE DEL PRODUCTO
 *
 * Es el riesgo de verdad de un dibujo paralelo: que se convierta en una maqueta
 * bonita que luego haya que volver a diseñar. La defensa es que todo lo que sea
 * DATO venga de un solo sitio —los mismos ficheros que consume el teléfono— y
 * que aquí no se escriba ni un color ni una cadena a mano:
 *
 *   theme/directions.ts   colores, espacios, radios, tipografía
 *   theme/hoja.ts         alturas de la hoja inferior
 *   theme/navegacion.ts   los destinos de las dos barras
 *   assets/marca/         vehículos, logotipo, emblema, avatares
 *
 * Lo único propio de aquí es el pintado, porque un navegador no dibuja como
 * React Native. Hay pruebas que comprueban que no se cuelan valores a mano.
 *
 * SÓLO LOCAL
 *
 * Escucha en 127.0.0.1 y no en todas las interfaces: un servidor de desarrollo
 * abierto a la red es una puerta que nadie recuerda haber dejado puesta.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Del modulo de pantallas, no del generador: importar el generador lo
// EJECUTA, y escribiria las capturas cada vez que arranca el servidor.
import { ALTO, ANCHO, BASE, C2, NOMBRES, PANTALLAS, variables } from './pantallasWeb.mjs';
import { esquemaAutomatico } from '../theme/horaVenezuela.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const PUERTO = Number(process.env.PUERTO ?? 4600);

/**
 * Las pantallas, agrupadas por a quién sirven.
 *
 * El orden es el del recorrido real, no alfabético: quien revisa va siguiendo
 * lo que hace una persona, no buscando un nombre.
 */
const GRUPOS = [
  {
    nombre: 'Entrada',
    claves: ['splash', 'rol', 'acceso']
  },
  {
    nombre: 'Pasajera',
    claves: ['pasajera', 'pedir', 'para-quien', 'punto-en-mapa', 'confirmar', 'buscando-moto', 'viaje',
      'aliados', 'comercio']
  },
  {
    nombre: 'Conductor',
    claves: ['conductor-offline', 'conductor-online', 'panel-jornada', 'saldo-conductor']
  }
];

/** Las que existen en el código pero aún no están dibujadas para navegador. */
const PENDIENTES = [
  'Historial', 'Viaje seguro', 'Perfil', 'Saldo pasajera',
  'Avisos', 'Ayuda', 'Configuración', 'Seguridad de cuenta',
  'Legal', 'Eliminar cuenta'
];

const primera = GRUPOS[0].claves[0];

// ---------------------------------------------------------------------------
// La página
// ---------------------------------------------------------------------------

function pagina(clave, esquemaPedido) {
  const activa = PANTALLAS[clave] ? clave : primera;

  // `auto` deja mandar la hora de Venezuela, como en la aplicación. Los otros
  // dos la ignoran, y es lo que hace útil el selector: comparar día y noche a
  // las cuatro de la tarde sin tocar el reloj del equipo.
  const modo = ['claro', 'oscuro'].includes(esquemaPedido) ? esquemaPedido : 'auto';
  const esquema = modo === 'auto' ? esquemaAutomatico(new Date()) : modo;
  const conModo = ruta => `${ruta}${modo === 'auto' ? '' : `&tema=${modo}`}`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${NOMBRES[activa] ?? activa} · Revisión visual C2</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d0d0d;color:#e8e8e8;display:flex;min-height:100vh;
    font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif}

  /* El panel. Va en gris neutro a propósito: no forma parte del diseño que se
     está evaluando, y si llevara los colores de la marca contaminaría lo que
     se mira. */
  .panel{width:230px;flex:0 0 230px;background:#141414;border-right:1px solid #262626;
    padding:20px 0;overflow-y:auto;height:100vh;position:sticky;top:0}
  .panel h1{font-size:13px;font-weight:700;color:#ffd21f;padding:0 18px 4px}
  .panel .aviso{font-size:11px;color:#777;padding:0 18px 16px;line-height:1.5}
  .panel h2{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#6e6e6e;
    padding:16px 18px 6px}
  .panel a{display:block;padding:8px 18px;font-size:13px;color:#bdbdbd;text-decoration:none}
  .panel a:hover{background:#1e1e1e;color:#fff}
  .panel a.on{background:#242424;color:#ffd21f;font-weight:600;
    box-shadow:inset 3px 0 0 #ffd21f}
  .panel .pendiente{padding:6px 18px;font-size:12px;color:#5a5a5a}
  .temas{display:flex;gap:6px;padding:0 18px 8px}
  .tema{padding:5px 11px;border-radius:7px;background:#222;border:1px solid #333;
    color:#9a9a9a;font-size:11px;font-weight:600;text-decoration:none}
  .tema:hover{color:#fff}
  .tema.on{background:#3a3a3a;border-color:#585858;color:#fff}

  .escena{flex:1;display:flex;flex-direction:column;align-items:center;
    justify-content:flex-start;padding:34px 24px;gap:16px}
  .rotulo{font-size:12px;color:#8a8a8a;text-align:center}
  .rotulo b{color:#e8e8e8;font-size:14px;display:block;margin-bottom:3px}
  .marco{border-radius:34px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.65)}
  .pie{font-size:11px;color:#5f5f5f;text-align:center;max-width:390px;line-height:1.6}

  ${BASE}
</style></head>
<body>
  <nav class="panel">
    <h1>Revisión visual · C2</h1>
    <p class="aviso">Sólo local. Se recarga sola al guardar un cambio.</p>

    <div class="temas">
      ${[['auto', 'Auto'], ['claro', 'Día'], ['oscuro', 'Noche']].map(([valor, etiqueta]) => `
        <a href="/?p=${activa}${valor === 'auto' ? '' : `&tema=${valor}`}"
           class="tema ${valor === modo ? 'on' : ''}" data-tema="${valor}">${etiqueta}</a>`).join('')}
    </div>
    <p class="aviso" style="padding-top:0">
      ${modo === 'auto'
        ? `Ahora en Venezuela: ${esquema === 'claro' ? 'día' : 'noche'}`
        : 'Forzado sólo para revisar'}
    </p>
    ${GRUPOS.map(grupo => `
      <h2>${grupo.nombre}</h2>
      ${grupo.claves.filter(clave => PANTALLAS[clave]).map(clave => `
        <a href="${conModo(`/?p=${clave}`)}" class="${clave === activa ? 'on' : ''}"
           data-pantalla="${clave}">${NOMBRES[clave] ?? clave}</a>`).join('')}
    `).join('')}
    <h2>Aún sin dibujar aquí</h2>
    ${PENDIENTES.map(nombre => `<div class="pendiente">${nombre}</div>`).join('')}
  </nav>

  <main class="escena">
    <div class="rotulo">
      <b>${NOMBRES[activa] ?? activa}</b>
      ${ANCHO}×${ALTO} · modo ${esquema === 'claro' ? 'día' : 'noche'}
    </div>
    <div class="marco" data-pantalla="${activa}" data-tema="${esquema}"
      style="${variables(C2, esquema)}">
      ${PANTALLAS[activa]()}
    </div>
    <p class="pie">
      Los colores, espacios y activos salen de los mismos ficheros que usa el
      teléfono. El comportamiento nativo —gestos, animaciones, teclado— sólo se
      ve en Expo Go.
    </p>
  </main>

  <script>
    // Recarga automática.
    //
    // El servidor se reinicia solo al guardar (node --watch), así que lo que se
    // detecta aquí es que ha vuelto con OTRO identificador de arranque. La
    // primera versión avisaba desde el propio servidor sin reiniciarlo, y no
    // servía de nada: el navegador recargaba y recibía exactamente el mismo
    // HTML, porque Node tenía el módulo viejo cacheado en memoria.
    const canal = new EventSource('/eventos');
    let arranqueConocido = null;

    canal.onmessage = evento => {
      if (arranqueConocido === null) { arranqueConocido = evento.data; return; }
      if (evento.data !== arranqueConocido) location.reload();
    };
  </script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Recarga automática
// ---------------------------------------------------------------------------

/**
 * Quién es este arranque.
 *
 * Cambia cada vez que el proceso se levanta. El navegador lo compara con el que
 * tenía: si es otro, es que el servidor se reinició por un cambio y recarga.
 *
 * POR QUÉ SE REINICIA EL PROCESO Y NO BASTA CON AVISAR
 *
 * La primera versión vigilaba los ficheros desde aquí y le decía al navegador
 * que recargara. No servía de nada: Node cachea los módulos, así que el
 * servidor seguía con el código viejo en memoria y devolvía exactamente el
 * mismo HTML. Se veía «recargar» y no cambiaba nada.
 *
 * Recargar módulos de ES a mano es peor remedio que la enfermedad —hay que
 * invalidar todo el grafo—. Reiniciar el proceso entero es una línea, `node
 * --watch`, y no deja nada viejo por medio.
 */
const ARRANQUE = String(Date.now());

/** Quién está mirando. */
const escuchando = new Set();

// Un latido cada pocos segundos: mantiene viva la conexión a través de
// proxies y hace que el navegador note enseguida cuando el servidor cae.
setInterval(() => {
  for (const respuesta of escuchando) respuesta.write(`data: ${ARRANQUE}\n\n`);
}, 4000).unref();

// ---------------------------------------------------------------------------
// El servidor
// ---------------------------------------------------------------------------

const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const servidor = http.createServer((peticion, respuesta) => {
  const url = new URL(peticion.url ?? '/', `http://localhost:${PUERTO}`);

  if (url.pathname === '/eventos') {
    respuesta.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    respuesta.write(`data: ${ARRANQUE}\n\n`);
    escuchando.add(respuesta);
    peticion.on('close', () => escuchando.delete(respuesta));
    return;
  }

  // Los activos de marca, servidos desde donde viven de verdad.
  if (url.pathname.startsWith('/marca/')) {
    const nombre = path.basename(url.pathname);
    const fichero = nombre === 'emblema.png'
      ? path.join(raizMovil, 'assets/splash-icon.png')
      : path.join(raizMovil, 'assets/marca', nombre);

    if (fs.existsSync(fichero)) {
      respuesta.writeHead(200, {
        'content-type': TIPOS[path.extname(fichero)] ?? 'application/octet-stream',
        'cache-control': 'no-store'
      });
      fs.createReadStream(fichero).pipe(respuesta);
      return;
    }
    respuesta.writeHead(404).end('no está');
    return;
  }

  if (url.pathname === '/') {
    respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    respuesta.end(pagina(
      url.searchParams.get('p') ?? primera,
      url.searchParams.get('tema') ?? 'auto'
    ));
    return;
  }

  respuesta.writeHead(404).end('no está');
});

// 127.0.0.1 y no 0.0.0.0: un servidor de desarrollo abierto a la red es una
// puerta que nadie recuerda haber dejado puesta.
servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`\n  Revisión visual C2 en  http://127.0.0.1:${PUERTO}`);
  console.log('  Arráncalo con `npm run revisar` para que se recargue al guardar.');
  console.log('  Ctrl+C para parar.\n');
});
