/**
 * Genera una maqueta HTML de las direcciones visuales.
 *
 * POR QUÉ EXISTE, Y QUÉ NO ES
 *
 * NO son capturas de la aplicación. Son una representación construida a partir
 * de los MISMOS tokens que consume el código —se importan de
 * `theme/directions.ts`, no se copian—, así que los colores, espacios, radios y
 * escalas tipográficas son exactamente los que verá el teléfono.
 *
 * Se hizo así porque la vía habitual está cerrada: renderizar la aplicación en
 * un navegador exige `react-native-web`, y ese paquete —igual que
 * `@expo/vector-icons` y AsyncStorage— **declara incompatibilidad con
 * `react@19.2.3`**, la versión que trae Expo SDK 57. No se fuerza con
 * `--legacy-peer-deps` para sacar unas capturas.
 *
 * Lo que la maqueta sí permite es lo que esta fase necesita: que el dueño
 * compare las tres direcciones y decida. Lo que no reproduce es el
 * comportamiento nativo —gestos, transiciones, el teclado real—, y para eso
 * está Expo Go.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOGO, DIRECCIONES } from '../theme/directions.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = process.argv[2] ?? path.resolve(aqui, '../../..', 'agent-reports/visual-preview-1');

fs.mkdirSync(salida, { recursive: true });

const ANCHO = 390;
const ALTO = 844;

/** Convierte los tokens de una dirección en variables CSS. */
function variables(tema) {
  const c = tema.color;
  return `
    --fondo:${c.fondo}; --superficie:${c.superficie}; --elevada:${c.superficieElevada};
    --borde:${c.borde}; --acento:${c.acento}; --sobre-acento:${c.sobreAcento};
    --texto:${c.textoPrimario}; --texto-2:${c.textoSecundario}; --texto-3:${c.textoTenue};
    --exito:${c.exito}; --peligro:${c.peligro};
    --margen:${tema.ritmo.margenPantalla}px; --bloques:${tema.ritmo.entreBloques}px;
    --tarjeta-pad:${tema.ritmo.dentroDeTarjeta}px; --gap:${tema.ritmo.entreElementos}px;
    --r-boton:${tema.radio.boton}px; --r-tarjeta:${tema.radio.tarjeta}px;
    --r-campo:${tema.radio.campo}px; --r-insignia:${tema.radio.insignia}px;
    --t-display:${tema.texto.display.tamano}px; --lh-display:${tema.texto.display.alto}px;
    --p-display:${tema.texto.display.peso};
    --t-titulo:${tema.texto.titulo.tamano}px; --lh-titulo:${tema.texto.titulo.alto}px;
    --p-titulo:${tema.texto.titulo.peso};
    --t-enc:${tema.texto.encabezado.tamano}px; --lh-enc:${tema.texto.encabezado.alto}px;
    --p-enc:${tema.texto.encabezado.peso};
    --t-cuerpo:${tema.texto.cuerpo.tamano}px; --lh-cuerpo:${tema.texto.cuerpo.alto}px;
    --t-pie:${tema.texto.pie.tamano}px; --lh-pie:${tema.texto.pie.alto}px;
    --ajuste:${tema.texto.ajusteDeTitular}px;
    --borde-ancho:${tema.superficie.conBorde ? 1 : 0}px;
    --sombra:${tema.superficie.sombra.elevation > 0
      ? `0 ${tema.superficie.sombra.shadowOffset.height}px ${tema.superficie.sombra.shadowRadius}px rgba(0,0,0,${tema.superficie.sombra.shadowOpacity})`
      : 'none'};
  `.replace(/\s+/g, ' ').trim();
}

/** El filo amarillo: la firma de la dirección C. */
const filo = tema => tema.presenciaDelAcento === 'firma'
  ? '<span style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acento)"></span>'
  : '';

const tarjeta = (tema, contenido, destacada = false) => `
<div style="position:relative;overflow:hidden;background:${destacada ? 'var(--elevada)' : 'var(--superficie)'};
     border-radius:var(--r-tarjeta);padding:var(--tarjeta-pad);
     border:var(--borde-ancho) solid ${destacada && tema.presenciaDelAcento === 'presente' ? 'var(--acento)' : 'var(--borde)'};
     box-shadow:var(--sombra)">
  ${destacada ? filo(tema) : ''}${contenido}
</div>`;

const boton = (texto, principal = true) => `
<div style="min-height:48px;display:flex;align-items:center;justify-content:center;
     border-radius:var(--r-boton);padding:12px 16px;font-weight:600;font-size:var(--t-cuerpo);
     background:${principal ? 'var(--acento)' : 'var(--superficie)'};
     color:${principal ? 'var(--sobre-acento)' : 'var(--texto)'};
     border:${principal ? 'none' : '1px solid var(--borde)'}">${texto}</div>`;

const insignia = (texto, color = 'var(--acento)') => `
<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;
      border-radius:var(--r-insignia);border:1px solid ${color}55;background:${color}18;
      color:${color};font-size:12px;font-weight:600">
  <span style="width:6px;height:6px;border-radius:3px;background:${color}"></span>${texto}</span>`;

const mapa = (alto = 180) => `
<div style="height:${alto}px;border-radius:var(--r-tarjeta);background:var(--superficie);
     border:var(--borde-ancho) solid var(--borde);position:relative;overflow:hidden;
     display:flex;align-items:center;justify-content:center">
  ${[22, 45, 68, 90].map(p => `<span style="position:absolute;left:0;right:0;top:${p}%;height:1px;background:var(--borde);opacity:.7"></span>`).join('')}
  ${[18, 50, 82].map(p => `<span style="position:absolute;top:0;bottom:0;left:${p}%;width:1px;background:var(--borde);opacity:.7"></span>`).join('')}
  <span style="width:46px;height:46px;border-radius:23px;background:color-mix(in srgb,var(--acento) 13%,transparent);
        display:flex;align-items:center;justify-content:center">
    <span style="width:14px;height:14px;border-radius:7px;background:var(--acento);border:2px solid var(--fondo)"></span>
  </span>
</div>`;

const barra = (activa = 'Inicio') => `
<div style="display:flex;background:var(--superficie);border-top:1px solid var(--borde);padding:8px 6px 14px">
  ${['Inicio', 'Viajes', 'Seguro', 'Perfil'].map(nombre => `
  <div style="flex:1;text-align:center">
    <div style="height:3px;width:22px;margin:0 auto 6px;border-radius:2px;
         background:${nombre === activa ? 'var(--acento)' : 'transparent'}"></div>
    <div style="width:20px;height:20px;margin:0 auto;border-radius:5px;
         border:2px solid ${nombre === activa ? 'var(--acento)' : 'var(--texto-3)'}"></div>
    <div style="margin-top:4px;font-size:11px;color:${nombre === activa ? 'var(--texto)' : 'var(--texto-3)'};
         font-weight:${nombre === activa ? 600 : 400}">${nombre}</div>
  </div>`).join('')}
</div>`;

// ---------------------------------------------------------------------------
// Las pantallas
// ---------------------------------------------------------------------------

const PANTALLAS = {
  rol: tema => `
<div style="flex:1;display:flex;flex-direction:column;padding:0 var(--margen)">
  <div style="padding-top:48px;text-align:center">
    <div style="font-size:var(--t-titulo);font-weight:var(--p-titulo);color:var(--texto);letter-spacing:var(--ajuste)">
      <span style="color:var(--acento)">+58</span>Express</div>
    <div style="font-size:var(--t-pie);color:var(--texto-3);margin-top:4px">Mototaxi en Maracaibo</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:var(--bloques)">
    <div style="font-size:var(--t-display);line-height:var(--lh-display);font-weight:var(--p-display);
         color:var(--texto);text-align:center;letter-spacing:var(--ajuste)">¿Cómo quieres continuar?</div>
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      ${tarjeta(tema, `<div style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:var(--r-campo);background:var(--acento);
             display:flex;align-items:center;justify-content:center">
          <span style="width:14px;height:14px;border-radius:7px;background:var(--sobre-acento)"></span></div>
        <div style="flex:1">
          <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Pasajero</div>
          <div style="font-size:var(--t-pie);color:var(--texto-2)">Pide una carrera y llega a donde vas</div>
        </div></div>`, true)}
      ${tarjeta(tema, `<div style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:var(--r-campo);background:var(--elevada);
             display:flex;align-items:center;justify-content:center">
          <span style="width:16px;height:16px;border-radius:4px;border:2px solid var(--texto-2)"></span></div>
        <div style="flex:1">
          <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Conductor</div>
          <div style="font-size:var(--t-pie);color:var(--texto-2)">Recibe carreras y gestiona tu jornada</div>
        </div></div>`)}
    </div>
    ${boton('Continuar')}
  </div>
  <div style="padding-bottom:var(--bloques);text-align:center;font-size:var(--t-pie);color:var(--texto-3)">
    Puedes cambiar de modo cuando quieras desde tu perfil.</div>
</div>`,

  acceso: tema => `
<div style="flex:1;display:flex;flex-direction:column;padding:0 var(--margen)">
  <div style="padding-top:var(--bloques)">
    <div style="font-size:var(--t-titulo);line-height:var(--lh-titulo);font-weight:var(--p-titulo);
         color:var(--texto);letter-spacing:var(--ajuste)">Acceso de pasajera</div>
    <div style="font-size:var(--t-cuerpo);color:var(--texto-2);margin-top:6px">Entra con la cuenta que ya tienes.</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:var(--gap)">
    ${tarjeta(tema, `<div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div><div style="font-size:12px;font-weight:600;color:var(--texto-2);margin-bottom:6px">Correo o teléfono</div>
        <div style="min-height:48px;display:flex;align-items:center;padding:0 var(--gap);border-radius:var(--r-campo);
             background:var(--elevada);border:1px solid var(--borde);color:var(--texto-2);font-size:var(--t-cuerpo)">demo@ejemplo.test</div></div>
      <div><div style="font-size:12px;font-weight:600;color:var(--texto-2);margin-bottom:6px">Contraseña</div>
        <div style="min-height:48px;display:flex;align-items:center;padding:0 var(--gap);border-radius:var(--r-campo);
             background:var(--elevada);border:1px solid var(--acento);color:var(--texto-2);font-size:var(--t-cuerpo)">••••••••</div></div>
    </div>`, true)}
    ${boton('Entrar')}
    ${boton('Cambiar de modo', false)}
  </div>
</div>`,

  pasajera: tema => `
<div style="flex:1;display:flex;flex-direction:column">
  <div style="flex:1;overflow:hidden;padding:var(--bloques) var(--margen);display:flex;flex-direction:column;gap:var(--bloques)">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div><div style="font-size:var(--t-pie);color:var(--texto-3)">Buen día</div>
        <div style="font-size:var(--t-titulo);font-weight:var(--p-titulo);color:var(--texto);letter-spacing:var(--ajuste)">Demo Pasajera</div></div>
      <div style="width:44px;height:44px;border-radius:22px;background:var(--elevada);border:1px solid var(--borde);
           display:flex;align-items:center;justify-content:center;color:var(--acento);font-weight:700">DP</div>
    </div>
    ${mapa(160)}
    ${tarjeta(tema, `<div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">¿A dónde vas?</div>
      <div style="min-height:48px;display:flex;align-items:center;padding:0 var(--gap);border-radius:var(--r-campo);
           background:var(--elevada);color:var(--texto-3);font-size:var(--t-cuerpo)">Escribe tu destino</div>
      <div style="font-size:var(--t-pie);color:var(--texto-2)">Zona demo · Maracaibo</div></div>`, true)}
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Servicios</div>
      ${tarjeta(tema, `<div style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:var(--r-campo);background:var(--acento)"></div>
        <div style="flex:1"><div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Mototaxi</div>
          <div style="font-size:var(--t-pie);color:var(--texto-2)">Lo más rápido en ciudad</div></div>
        <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--acento)">$1,50</div></div>`, true)}
      ${tarjeta(tema, `<div style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:var(--r-campo);background:var(--elevada)"></div>
        <div style="flex:1"><div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Transporte Seguro</div>
          <div style="font-size:var(--t-pie);color:var(--texto-2)">Traslados programados</div></div>
        <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Plan</div></div>`)}
    </div>
  </div>
  ${barra('Inicio')}
</div>`,

  conductor: tema => `
<div style="flex:1;display:flex;flex-direction:column">
  <div style="flex:1;overflow:hidden;padding:var(--bloques) var(--margen);display:flex;flex-direction:column;gap:var(--bloques)">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div><div style="font-size:var(--t-pie);color:var(--texto-3)">Tu jornada</div>
        <div style="font-size:var(--t-titulo);font-weight:var(--p-titulo);color:var(--texto);letter-spacing:var(--ajuste)">Demo Conductor</div></div>
      <div style="width:44px;height:44px;border-radius:22px;background:var(--elevada);border:1px solid var(--borde);
           display:flex;align-items:center;justify-content:center;color:var(--acento);font-weight:700">DC</div>
    </div>
    ${tarjeta(tema, `<div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Estás conectado</div>
        ${insignia('Recibiendo', 'var(--exito)')}</div>
      <div style="font-size:var(--t-pie);color:var(--texto-2)">Zona demo · Maracaibo</div>
      ${boton('Desconectarme', false)}</div>`, true)}
    <div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Hoy</div>
      <div style="display:flex;gap:var(--gap)">
        ${tarjeta(tema, `<div style="font-size:var(--t-pie);color:var(--texto-3)">Carreras</div>
          <div style="font-size:var(--t-titulo);font-weight:var(--p-titulo);color:var(--texto)">8</div>`)
          .replace('<div style="position:relative', '<div style="flex:1;position:relative')}
        ${tarjeta(tema, `<div style="font-size:var(--t-pie);color:var(--texto-3)">En ruta</div>
          <div style="font-size:var(--t-titulo);font-weight:var(--p-titulo);color:var(--texto)">5 h 20 m</div>`)
          .replace('<div style="position:relative', '<div style="flex:1;position:relative')}
      </div>
      ${tarjeta(tema, `<div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:var(--t-cuerpo);color:var(--texto-2)">Saldo</div>
        <div style="font-size:var(--t-enc);color:var(--texto-3)">—</div></div>
        <div style="font-size:var(--t-pie);color:var(--texto-3);margin-top:6px">
        Cifras de ejemplo: la cartera todavía no está conectada.</div>`)}
    </div>
  </div>
  ${barra('Inicio')}
</div>`,

  viaje: tema => `
<div style="flex:1;display:flex;flex-direction:column">
  <div style="padding:var(--margen) var(--margen) 0">${mapa(240)}</div>
  <div style="flex:1;padding:var(--bloques) var(--margen);display:flex;flex-direction:column;gap:var(--gap)">
    <div style="display:flex;align-items:center;justify-content:space-between">
      ${insignia('En camino')}
      <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--acento)">4 min</div>
    </div>
    ${tarjeta(tema, `<div style="display:flex;flex-direction:column;gap:var(--gap)">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:24px;background:var(--elevada);border:1px solid var(--borde);
             display:flex;align-items:center;justify-content:center;color:var(--acento);font-weight:700">DC</div>
        <div style="flex:1"><div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">Demo Conductor</div>
          <div style="font-size:var(--t-pie);color:var(--texto-2)">Moto demo · DEMO-000</div></div>
        <div style="color:var(--acento);font-size:var(--t-cuerpo)">★ 4,9</div></div>
      <div style="height:1px;background:var(--borde)"></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:10px;height:10px;border-radius:5px;background:var(--acento)"></span>
        <span style="font-size:var(--t-pie);color:var(--texto-2)">Punto de recogida de ejemplo</span></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="width:10px;height:10px;border-radius:2px;background:var(--texto)"></span>
        <span style="font-size:var(--t-pie);color:var(--texto-2)">Destino de ejemplo 1</span></div>
    </div>`, true)}
    <div style="display:flex;gap:var(--gap)">
      <div style="flex:1">${boton('Llamar', false)}</div>
      <div style="flex:1">${boton('Mensaje', false)}</div>
    </div>
    ${tarjeta(tema, `<div style="display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:var(--t-cuerpo);color:var(--texto-2)">Total del viaje</div>
      <div style="font-size:var(--t-enc);font-weight:var(--p-enc);color:var(--texto)">$1,50</div></div>`)}
  </div>
</div>`
};

const NOMBRES = {
  rol: 'Selector de experiencia',
  acceso: 'Acceso',
  pasajera: 'Inicio de pasajera',
  conductor: 'Jornada del conductor',
  viaje: 'Viaje en curso'
};

/** Un teléfono con su pantalla dentro. */
function telefono(claveDireccion, clavePantalla) {
  const tema = CATALOGO[claveDireccion];
  return `
<figure style="margin:0">
  <div style="width:${ANCHO}px;height:${ALTO}px;background:var(--fondo);color:var(--texto);
       border-radius:34px;border:1px solid #2a2a2a;overflow:hidden;display:flex;flex-direction:column;
       font-family:-apple-system,'Segoe UI',Roboto,sans-serif;${variables(tema)}">
    <div style="height:34px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px">
      <div style="width:100px;height:5px;border-radius:3px;background:#3a3a3a"></div>
    </div>
    ${PANTALLAS[clavePantalla](tema)}
    <div style="height:20px;display:flex;align-items:center;justify-content:center">
      <div style="width:120px;height:4px;border-radius:2px;background:#3a3a3a"></div>
    </div>
  </div>
  <figcaption style="margin-top:10px;color:#8a8a8a;font-size:13px;text-align:center;
       font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
    ${claveDireccion} · ${NOMBRES[clavePantalla]}
  </figcaption>
</figure>`;
}

const OBLIGATORIAS = {
  A: ['rol', 'pasajera'],
  B: ['rol', 'pasajera'],
  C: ['rol', 'acceso', 'pasajera', 'conductor', 'viaje']
};

let generadas = 0;
for (const clave of DIRECCIONES) {
  for (const pantalla of OBLIGATORIAS[clave]) {
    const html = `<!doctype html><meta charset="utf-8">
<title>+58Express · ${clave} · ${NOMBRES[pantalla]}</title>
<body style="margin:0;padding:28px;background:#111;display:flex;justify-content:center">
${telefono(clave, pantalla)}
</body>`;
    const nombre = `${clave.toLowerCase()}-${pantalla}.html`;
    fs.writeFileSync(path.join(salida, nombre), html);
    generadas += 1;
  }
}

// Una hoja de comparación con todo junto.
const comparacion = `<!doctype html><meta charset="utf-8">
<title>+58Express · direcciones visuales</title>
<body style="margin:0;padding:32px;background:#0d0d0d;color:#eee;
     font-family:-apple-system,'Segoe UI',Roboto,sans-serif">
<h1 style="font-size:22px;margin:0 0 6px">+58Express · direcciones visuales</h1>
<p style="color:#8a8a8a;font-size:14px;margin:0 0 8px;max-width:70ch">
  Representación generada a partir de los tokens reales del código
  (<code>theme/directions.ts</code>). Los colores, espacios, radios y escalas son
  exactamente los que verá el teléfono; el comportamiento nativo —gestos,
  transiciones, teclado— sólo se aprecia en Expo Go.
</p>
${DIRECCIONES.map(clave => `
<section style="margin-top:34px">
  <h2 style="font-size:17px;margin:0 0 2px">${clave} · ${CATALOGO[clave].nombre}
    ${clave === 'C' ? '<span style="color:#ffd21f;font-size:13px;font-weight:600"> · recomendada</span>' : ''}</h2>
  <p style="color:#8a8a8a;font-size:13px;margin:0 0 16px">${CATALOGO[clave].caracter}</p>
  <div style="display:flex;gap:22px;flex-wrap:wrap">
    ${OBLIGATORIAS[clave].map(pantalla => telefono(clave, pantalla)).join('')}
  </div>
</section>`).join('')}
</body>`;
fs.writeFileSync(path.join(salida, 'comparacion.html'), comparacion);

console.log(`Maqueta generada en: ${salida}`);
console.log(`  ${generadas} pantallas + comparacion.html`);
