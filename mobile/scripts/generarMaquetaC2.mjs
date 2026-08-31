/**
 * Escribe la evidencia visual de C2 en disco.
 *
 * Las pantallas viven en `pantallasWeb.mjs` y las comparte con el servidor de
 * revisión: si cada uno tuviera las suyas, el localhost dejaría de enseñar lo
 * que se entrega.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALTO, ANCHO, BASE, C2, CALLES, NOMBRES, PANTALLAS,
  copiarActivos, disco, variables, vehiculo
} from './pantallasWeb.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = process.argv[2] ?? path.resolve(aqui, '../../..', 'agent-reports/visual-preview-1b-c2');

fs.mkdirSync(salida, { recursive: true });
copiarActivos(salida);

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------


function pagina(titulo, cuerpo) {
  return `<!doctype html><meta charset="utf-8"><title>${titulo} · C2</title>
<style>
  body{margin:0;padding:26px;background:#111;display:flex;flex-wrap:wrap;gap:26px;
    justify-content:center;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  .marco{border-radius:34px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .col{text-align:center}
  .col span{display:block;color:#888;font-size:12px;margin-top:9px;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  ${BASE}
</style>
${cuerpo}`;
}

/**
 * Cada pantalla sale DOS veces, una por esquema.
 *
 * Antes salia solo en noche, que es donde se diseno. Casi todo lo que fallaba
 * fallaba de dia —superficies que se juntan, amarillos que dejan de leerse— y
 * una evidencia que solo ensena la mitad no sirve para revisar la otra.
 */
const ESQUEMAS = [['claro', 'Modo día'], ['oscuro', 'Modo noche']];

const parDeEsquemas = (clave, construir) => ESQUEMAS.map(([esquema, etiqueta]) => `
  <div class="col">
    <div class="marco" style="${variables(C2, esquema)}">${construir(esquema)}</div>
    <span>${etiqueta}</span>
  </div>`).join('');

for (const [clave, construir] of Object.entries(PANTALLAS)) {
  fs.writeFileSync(
    path.join(salida, `c2-${clave}.html`),
    pagina(NOMBRES[clave], parDeEsquemas(clave, construir))
  );
}

// El detalle del marcador, ampliado.
fs.writeFileSync(path.join(salida, 'c2-marcador.html'), `<!doctype html><meta charset="utf-8">
<title>Marcador de moto · C2</title>
<style>
  body{margin:0;padding:40px;background:#111;color:#eee;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  h1{font-size:17px;margin:0 0 6px} p{color:#999;font-size:13px;max-width:640px;line-height:1.6}
  .zona{margin-top:26px;position:relative;width:640px;height:340px;border-radius:18px;
    overflow:hidden;background:var(--superficie)}
  ${BASE}
</style>
<h1>El marcador sobre el mapa</h1>
<p>La toma cenital de la moto de marca, girada según el rumbo. Es la pieza de identidad más
pequeña y la que más se ve: cada vez que alguien mira dónde está su moto, mira esto. Un pin
amarillo genérico daría exactamente el mismo mapa que cualquier otra aplicación.</p>
<div class="zona" style="${variables(C2)}">${CALLES}
  ${vehiculo('MOTO', 30, 34, 0, true)}${vehiculo('MOTO', 52, 30, 45)}
  ${vehiculo('MOTO', 70, 52, 135)}${vehiculo('AUTO', 44, 66, -90)}
</div>
<p style="margin-top:18px">A la izquierda, el vehículo propio o el asignado: más grande y con halo,
porque hay que encontrarlo de un vistazo. Los demás, a tamaño normal.</p>`);

// El disco central: una forma, cuatro estados.
fs.writeFileSync(path.join(salida, 'c2-disco.html'), `<!doctype html><meta charset="utf-8">
<title>El disco central · C2</title>
<style>
  body{margin:0;padding:40px;background:#111;color:#eee;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  h1{font-size:17px;margin:0 0 6px} p{color:#999;font-size:13px;max-width:680px;line-height:1.6}
  .tira{display:flex;gap:38px;margin-top:30px;padding:36px;border-radius:18px;background:#1a1a1a;max-width:760px}
  .caso{display:grid;justify-items:center;gap:9px;text-align:center}
  .caso b{color:#eee;font-size:13px} .caso i{color:#888;font-size:12px;font-style:normal;max-width:132px;line-height:1.45}
  ${BASE}
</style>
<h1>El disco central: una forma, cuatro estados</h1>
<p>En el centro de la barra va siempre lo mismo: un disco con la moto de la marca y un aro que dice
en qué estás. Lo que cambia es el color del aro. Es una decisión de identidad, no una casualidad de
implementación: quien usa la aplicación aprende una sola forma y le sirve en las dos pantallas.</p>
<div class="tira" style="${variables(C2)}">
  ${[
    ['pedir', 'Pasajera', 'Aro amarillo: pedir un viaje'],
    ['abierto', 'Pasajera', 'Abierto: el mismo sitio cierra'],
    ['offline', 'Conductor', 'Apagado: tocar para conectarse'],
    ['online', 'Conductor', 'Aro verde con latido: en línea']
  ].map(([modo, rol, nota]) => `
    <div class="caso">${disco(modo)}<b>${rol}</b><i>${nota}</i></div>`).join('')}
</div>
<p style="margin-top:18px">En la pasajera, tocarlo despliega la petición completa sobre el mapa, y el
mismo disco la cierra convertido en aspa: no hay que buscar dónde se cierra lo que se abrió desde ahí.</p>`);

// La comparación: todas las pantallas juntas.
export const ORDEN = [
  ['El arranque y la entrada', ['splash', 'rol', 'acceso']],
  ['La pasajera: del reposo a pedir', ['pasajera', 'pedir', 'confirmar']],
  ['Esperando', ['buscando-moto']],
  ['Decisiones sobre el mapa', ['para-quien', 'punto-en-mapa']],
  ['El conductor', ['conductor-offline', 'conductor-online', 'panel-jornada', 'saldo-conductor']],
  ['El viaje', ['viaje']],
  ['Las secciones sin mapa', [
    'historial', 'viaje-seguro', 'perfil', 'saldo-pasajera',
    'avisos', 'ayuda', 'configuracion'
  ]]
];

fs.writeFileSync(path.join(salida, 'comparacion.html'), `<!doctype html><meta charset="utf-8">
<title>C2 · +58 Signature Refined</title>
<style>
  body{margin:0;padding:30px;background:#111;color:#eee;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  h1{font-size:21px;margin:0 0 10px} h2{font-size:15px;margin:38px 0 14px;color:#ccc}
  p{color:#999;font-size:13px;line-height:1.65;max-width:840px}
  ul{color:#999;font-size:13px;line-height:1.85;max-width:840px}
  b{color:#ffd21f}
  .par{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start}
  .col{text-align:center}
  .col span{display:block;color:#888;font-size:12px;margin-top:9px}
  .marco{border-radius:34px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.6)}
  ${BASE}
</style>
<h1>C2 — +58 Signature Refined</h1>
<p>Grafito profundo, <b>#ffd21f</b> y el filo amarillo de C, con el mapa convertido en el suelo de la
pantalla y los activos de marca dentro.</p>
<ul>
  <li><b>El disco central</b> es la misma forma en los dos roles: amarillo para pedir, verde para
      estar en línea. Se aprende una vez y sirve en las dos pantallas.</li>
  <li><b>Pedir un viaje</b> se despliega sobre el mapa, sin cambiar de pantalla, y el mismo disco
      lo cierra convertido en aspa.</li>
  <li><b>La línea del trayecto se enciende</b> en amarillo cuando ya se puede pedir.</li>
  <li><b>Los vehículos son los reales</b>, y en el mapa van girados según el rumbo.</li>
  <li><b>La tasa del BCV</b> está en la cabecera: es el dato con el que aquí se decide un gasto.</li>
</ul>
${ORDEN.map(([titulo, claves]) => `
<h2>${titulo}</h2>
<div class="par">
  ${claves.map(clave => `
    <div class="col">
      <div class="marco" style="${variables(C2, 'oscuro')}">${PANTALLAS[clave]('oscuro')}</div>
      <span>${NOMBRES[clave]}</span>
    </div>`).join('')}
</div>`).join('')}`);

console.log(`Evidencia de C2 generada en: ${salida}`);
