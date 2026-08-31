/**
 * Genera la evidencia visual de C2.
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * NO son capturas de la aplicación. Los colores, espacios, radios y escalas
 * tipográficas se importan de `theme/directions.ts` —los mismos que consume el
 * teléfono, no una copia—, las alturas de hoja de `theme/hoja.ts`, y los
 * vehículos, el emblema y el logotipo son los archivos de marca de verdad.
 *
 * La vía habitual sigue cerrada: renderizar la aplicación en un navegador exige
 * `react-native-web`, que declara incompatibilidad con `react@19.2.3`, la
 * versión que trae Expo SDK 57. No se fuerza con `--legacy-peer-deps` para
 * sacar unas capturas.
 *
 * Lo que no reproduce: el comportamiento nativo —gestos, arrastre de la hoja,
 * el latido del disco, las órbitas del arranque—. Para eso está Expo Go.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOGO } from '../theme/directions.ts';
import { FRACCION_POR_ESTADO } from '../theme/hoja.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const salida = process.argv[2] ?? path.resolve(aqui, '../../..', 'agent-reports/visual-preview-1b-c2');

fs.mkdirSync(path.join(salida, 'marca'), { recursive: true });

// Los activos van junto al HTML: pesan lo que pesan y así el informe se puede
// mover de carpeta entero sin que se rompan las imágenes.
for (const nombre of fs.readdirSync(path.join(raizMovil, 'assets/marca'))) {
  fs.copyFileSync(path.join(raizMovil, 'assets/marca', nombre), path.join(salida, 'marca', nombre));
}
fs.copyFileSync(path.join(raizMovil, 'assets/splash-icon.png'), path.join(salida, 'marca/emblema.png'));

const ANCHO = 390;
const ALTO = 844;

const C2 = CATALOGO.C2;

/** Convierte los tokens de una dirección en variables CSS. */
function variables(tema) {
  const c = tema.color;
  return `
    --fondo:${c.fondo}; --superficie:${c.superficie}; --elevada:${c.superficieElevada};
    --borde:${c.borde}; --acento:${c.acento}; --sobre-acento:${c.sobreAcento};
    --texto:${c.textoPrimario}; --texto-2:${c.textoSecundario}; --texto-3:${c.textoTenue};
    --exito:${c.exito}; --aviso:${c.aviso};
    --margen:${tema.ritmo.margenPantalla}px; --bloques:${tema.ritmo.entreBloques}px;
    --pad:${tema.ritmo.dentroDeTarjeta}px; --gap:${tema.ritmo.entreElementos}px;
    --r-boton:${tema.radio.boton}px; --r-tarjeta:${tema.radio.tarjeta}px;
    --r-campo:${tema.radio.campo}px;
    --t-titulo:${tema.texto.titulo.tamano}px; --lh-titulo:${tema.texto.titulo.alto}px;
    --t-enc:${tema.texto.encabezado.tamano}px; --lh-enc:${tema.texto.encabezado.alto}px;
    --t-cuerpo:${tema.texto.cuerpo.tamano}px; --lh-cuerpo:${tema.texto.cuerpo.alto}px;
    --t-etq:${tema.texto.etiqueta.tamano}px; --lh-etq:${tema.texto.etiqueta.alto}px;
    --t-pie:${tema.texto.pie.tamano}px; --lh-pie:${tema.texto.pie.alto}px;
    --ajuste:${tema.texto.ajusteDeTitular}px;
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Los iconos, dibujados a trazo.
 *
 * La aplicación usa su propia familia geométrica (`ui/Icono.tsx`, hecha con
 * vistas). Aquí se redibujan en SVG con el mismo espíritu —trazo uniforme,
 * formas simples— porque un cuadrado vacío haría parecer que la navegación
 * está sin terminar, y lo que hay que evaluar es la composición.
 */
const TRAZOS = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  destino: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  viajes: '<path d="M4 7h11M4 12h16M4 17h9"/><circle cx="19" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  perfil: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  escudo: '<path d="M12 3l7.5 3v6c0 4.6-3.2 8.2-7.5 9.5C7.7 20.2 4.5 16.6 4.5 12V6z"/><path d="M9 12.2l2.2 2.2 4-4.4"/>',
  moto: '<circle cx="5.5" cy="16.5" r="3.2"/><circle cx="18.5" cy="16.5" r="3.2"/><path d="M5.5 16.5 9 9h5l3.5 7.5M9 9h6.5"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.4l3.4 2"/>',
  rayo: '<path d="M13.5 2.5 5 13.5h5.5L9.5 21.5 19 10.5h-5.7z"/>',
  maletin: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  galon: '<path d="M6 9.5 12 15l6-5.5"/>'
};

const icono = (nombre, color = 'currentColor', tamano = 23) =>
  `<svg width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="none" stroke="${color}"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre]}</svg>`;

const BASE = `
  *{margin:0;padding:0;box-sizing:border-box}
  .tel{width:${ANCHO}px;height:${ALTO}px;position:relative;overflow:hidden;
    background:var(--fondo);color:var(--texto);
    font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif}
  .titulo{font-size:var(--t-titulo);line-height:var(--lh-titulo);font-weight:700;letter-spacing:var(--ajuste)}
  .enc{font-size:var(--t-enc);line-height:var(--lh-enc);font-weight:700}
  .cuerpo{font-size:var(--t-cuerpo);line-height:var(--lh-cuerpo)}
  .etq{font-size:var(--t-etq);line-height:var(--lh-etq);font-weight:600}
  .pie{font-size:var(--t-pie);line-height:var(--lh-pie)}
  .t2{color:var(--texto-2)} .t3{color:var(--texto-3)} .ac{color:var(--acento)} .ok{color:var(--exito)}
  .crece{flex:1}

  /* Calles claras sobre manzanas oscuras: es como se leen los mapas en tema
     oscuro, y es lo mismo que hace ui/Mapa.tsx. */
  .mapa{position:absolute;inset:0;background:var(--superficie);overflow:hidden}
  .calle{position:absolute;background:var(--texto-3);opacity:.28}
  .diag{position:absolute;left:-30%;right:-30%;top:58%;height:10px;background:var(--texto-3);
    opacity:.28;transform:rotate(-19deg)}
  .agua{position:absolute;right:-18%;bottom:-14%;width:58%;height:38%;border-radius:999px;
    background:#63c9ff;opacity:.09;transform:rotate(-12deg)}

  .veh{position:absolute;transform:translate(-50%,-50%)}
  .veh img{display:block}
  .halo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;
    background:color-mix(in srgb,var(--acento) 18%,transparent)}
  .hito{position:absolute;width:22px;height:22px;transform:translate(-50%,-50%);
    border:3px solid var(--fondo);border-radius:50%}
  .hito.dest{border-radius:5px;background:var(--acento)}
  .hito.orig{background:var(--texto)}
  .ruta{position:absolute;height:4px;border-radius:2px;background:var(--acento);opacity:.85;
    transform-origin:left center}
  .ctrl-mapa{position:absolute;right:14px;top:92px;width:42px;height:42px;border-radius:50%;
    background:var(--elevada);display:grid;place-items:center;box-shadow:0 5px 14px rgba(0,0,0,.4)}

  /* La hoja inferior. */
  .hoja{position:absolute;left:0;right:0;bottom:0;background:var(--superficie);
    border-radius:26px 26px 0 0;box-shadow:0 -8px 24px rgba(0,0,0,.45);
    padding:0 var(--margen) 14px;display:flex;flex-direction:column}
  .asa{width:38px;height:4px;border-radius:2px;background:var(--texto-3);opacity:.55;margin:10px auto 12px}
  .sep{height:1px;background:var(--borde)}

  .campo{display:flex;align-items:center;gap:11px;height:52px;padding:0 15px;
    border-radius:var(--r-campo);background:var(--fondo)}
  .lugar-fila{display:flex;align-items:center;gap:13px;padding:11px 0}
  .redondo{width:34px;height:34px;border-radius:50%;background:var(--elevada);display:grid;place-items:center}
  .pastilla{display:inline-flex;align-items:center;gap:8px;border-radius:999px;
    background:var(--fondo);padding:9px 13px}

  /* Trayecto: la línea se pone amarilla cuando el destino está puesto. */
  .trayecto{display:flex;align-items:center;gap:12px}
  .puntos{display:flex;flex-direction:column;align-items:center;padding:4px 0;align-self:stretch}
  .p-origen{width:13px;height:13px;border-radius:50%;border:3px solid var(--texto);flex:0 0 auto}
  .p-linea{width:2px;flex:1;min-height:22px;background:var(--acento)}
  .p-destino{width:13px;height:13px;border-radius:3px;background:var(--acento);flex:0 0 auto}
  .lugar{height:46px;display:flex;align-items:center;padding:0 14px;
    border-radius:var(--r-campo);background:var(--fondo)}
  .cuadrado{width:42px;height:42px;border-radius:var(--r-campo);background:var(--fondo);
    display:grid;place-items:center}

  .filo{position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acento)}

  /* Filas: los precios quedan alineados en una columna. */
  .veh-fila{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;
    padding:8px 14px 8px 12px;border-radius:var(--r-tarjeta)}
  .veh-fila.on{background:var(--elevada)}
  .veh-fila img{width:76px;height:51px;object-fit:contain}
  .veh-fila.off img{opacity:.55}

  .st{position:relative;overflow:hidden;display:flex;align-items:center;
    border-radius:var(--r-tarjeta);background:var(--superficie);padding:12px 8px 12px 16px}
  .st-escena{width:104px;height:56px;position:relative;flex:0 0 104px}
  .st-escena img{position:absolute;left:12px;top:8px;width:58px}
  .estela{position:absolute;left:0;height:2px;border-radius:1px;background:var(--acento);opacity:.35}
  .candado{position:absolute;right:2px;top:12px}
  .candado i{display:block;width:15px;height:9px;border:2.5px solid var(--acento);
    border-bottom:0;border-radius:8px 8px 0 0;margin:0 auto}
  .candado b{display:grid;place-items:center;width:26px;height:21px;border-radius:6px;background:var(--acento)}
  .check{width:11px;height:6px;border-left:2.4px solid var(--sobre-acento);
    border-bottom:2.4px solid var(--sobre-acento);transform:rotate(-45deg);margin-top:-3px}

  .boton{height:52px;border-radius:var(--r-boton);background:var(--acento);color:var(--sobre-acento);
    display:grid;place-items:center;font-size:16px;font-weight:700}
  .boton.sec{background:transparent;color:var(--texto-2);font-weight:600}
  .insignia{border:1px solid var(--exito);border-radius:10px;padding:3px 9px}

  /* Barra inferior con el disco central. */
  .barra{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-start;
    background:var(--superficie);border-top:1px solid var(--borde);padding:10px 6px 22px}
  .dest-nav{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
  .disco-zona{width:76px;display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:-30px}
  .disco{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;position:relative;
    background:var(--elevada);border:2px solid var(--borde);box-shadow:0 6px 12px rgba(0,0,0,.42)}
  .disco img{width:34px;height:34px;object-fit:contain}
  .disco.apagado img{opacity:.45}
  .disco.online{background:color-mix(in srgb,var(--exito) 22%,var(--elevada));border-color:var(--exito)}
  .disco.pedir{background:color-mix(in srgb,var(--acento) 15%,var(--elevada));border-color:var(--acento)}
  .disco.abierto{background:var(--elevada);border-color:var(--acento)}
  .latido{position:absolute;inset:-6px;border-radius:50%;background:var(--exito);opacity:.14}
  .aspa{position:relative;width:22px;height:22px}
  .aspa i{position:absolute;top:10px;left:0;width:21px;height:2.4px;border-radius:2px;background:var(--texto)}
  .aspa i:first-child{transform:rotate(45deg)} .aspa i:last-child{transform:rotate(-45deg)}

  .flotante{position:absolute;display:flex;align-items:center;border-radius:999px;
    background:var(--elevada);box-shadow:0 5px 14px rgba(0,0,0,.4)}
  .punto{width:8px;height:8px;border-radius:50%}
`;

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

const CALLES = `
  ${[[12, 2], [27, 7], [41, 2], [56, 3], [70, 8], [86, 2]]
    .map(([y, g]) => `<span class="calle" style="left:0;right:0;top:${y}%;height:${g}px"></span>`).join('')}
  ${[[9, 2], [24, 6], [43, 2], [61, 3], [79, 7], [93, 2]]
    .map(([x, g]) => `<span class="calle" style="top:0;bottom:0;left:${x}%;width:${g}px"></span>`).join('')}
  <span class="diag"></span><span class="agua"></span>`;

const vehiculo = (tipo, x, y, rumbo, destacado = false) => {
  const tam = destacado ? 62 : 42;
  const archivo = tipo === 'MOTO' ? 'moto-mapa.png' : 'auto-mapa.png';
  return `<span class="veh" style="left:${x}%;top:${y}%">
    ${destacado ? `<span class="halo" style="width:${tam * 1.5}px;height:${tam * 1.5}px"></span>` : ''}
    <img src="marca/${archivo}" width="${tam}" height="${tam}" style="transform:rotate(${rumbo}deg)" alt="">
  </span>`;
};

// Por encima del 40 %: es lo único que queda a la vista con la hoja subida.
const MOTOS = [
  ['MOTO', 26, 24, 24], ['MOTO', 69, 15, -68], ['MOTO', 80, 34, 155], ['AUTO', 38, 38, 96]
].map(v => vehiculo(...v)).join('');

const MOTOS_POCAS = [['MOTO', 26, 24, 24], ['MOTO', 69, 15, -68]].map(v => vehiculo(...v)).join('');
const MOTOS_TRES = [['MOTO', 26, 24, 24], ['MOTO', 69, 15, -68], ['MOTO', 80, 34, 155]]
  .map(v => vehiculo(...v)).join('');

const hito = (x, y, tipo) => `<span class="hito ${tipo}" style="left:${x}%;top:${y}%"></span>`;

function ruta(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const largo = Math.sqrt(dx * dx + dy * dy);
  const angulo = (Math.atan2(dy * (ALTO / ANCHO), dx) * 180) / Math.PI;
  return `<span class="ruta" style="left:${x1}%;top:${y1}%;width:${largo}%;transform:rotate(${angulo}deg)"></span>`;
}

// Con la hoja alta, del mapa sólo queda la franja de arriba: la ruta va ahí o
// no se ve. Los puntos de la ruta y los de las pantallas con hoja media son
// distintos por eso, no por descuido.
const RUTA = `${ruta(24, 19, 72, 9)}${hito(24, 19, 'orig')}${hito(72, 9, 'dest')}`;
const RUTA_MEDIA = `${ruta(28, 43, 73, 13)}${hito(28, 43, 'orig')}${hito(73, 13, 'dest')}`;
const CTRL = `<span class="ctrl-mapa">${icono('destino', 'var(--texto-2)', 20)}</span>`;

/** La cabecera de la pasajera: quién eres y a cómo está el dólar. */
const CABECERA_PASAJERA = `
  <div class="flotante" style="left:var(--margen);top:16px;gap:9px;padding:5px 14px 5px 5px">
    <span style="width:32px;height:32px;border-radius:50%;background:var(--fondo);display:grid;place-items:center">
      <span class="etq">DP</span></span>
    <span style="display:grid;gap:1px">
      <span class="etq">Demo Pasajera</span>
      <span class="pie t3">Zona demo · Maracaibo</span></span>
  </div>
  <div class="flotante" style="right:var(--margen);top:16px;flex-direction:column;align-items:flex-end;
    gap:1px;padding:7px 13px">
    <span class="pie t3">Tasa BCV</span>
    <span class="etq ac">Bs. 000,00</span>
  </div>`;

const LUGARES = `
  <div style="display:flex;gap:8px">
    <span class="pastilla">${icono('inicio', 'var(--acento)', 16)}<span class="etq">Casa</span></span>
    <span class="pastilla" style="opacity:.72">${icono('maletin', 'var(--texto-3)', 16)}
      <span class="etq t3">Trabajo</span>${icono('mas', 'var(--texto-3)', 14)}</span>
  </div>`;

const TRAYECTO = `
  <div class="trayecto">
    <div class="puntos">
      <span class="p-origen"></span><span class="p-linea"></span><span class="p-destino"></span>
    </div>
    <div style="flex:1;display:grid;gap:8px">
      <div class="lugar"><span class="cuerpo">Maracaibo · punto de ejemplo</span></div>
      <div class="lugar"><span class="cuerpo">Destino de ejemplo 1</span></div>
    </div>
    <span class="cuadrado">${icono('mas', 'var(--texto-2)', 18)}</span>
  </div>
  <div style="display:flex;align-items:center;gap:7px;justify-content:flex-end;margin-top:10px">
    ${icono('destino', 'var(--acento)', 15)}<span class="etq ac">Escoger en el mapa</span>
  </div>`;

const filasDeVehiculo = elegido => `
  <div style="display:grid;gap:8px">
    ${[['MOTO', 'moto.png', 'Moto', '1 persona · 4 min'],
       ['AUTO', 'auto.png', 'Auto', '4 personas · 7 min']].map(([t, img, nombre, detalle]) => `
      <div class="veh-fila ${t === elegido ? 'on' : 'off'}">
        ${t === elegido ? '<span class="filo"></span>' : ''}
        <img src="marca/${img}" alt="${nombre}">
        <span style="flex:1;display:grid;gap:2px">
          <span class="enc ${t === elegido ? '' : 't2'}">${nombre}</span>
          <span class="pie t3">${detalle}</span></span>
        <span style="display:grid;gap:1px;text-align:right">
          <span class="enc ${t === elegido ? 'ac' : 't2'}">$0,00</span>
          <span class="pie t3">Bs. 0,00</span></span>
      </div>`).join('')}
  </div>`;

const TRANSPORTE_SEGURO = `
  <div class="st">
    <span class="filo"></span>
    <div style="flex:1;display:grid;gap:3px">
      <div style="display:flex;align-items:center;gap:7px">
        ${icono('escudo', 'var(--acento)', 16)}
        <span class="enc">Transporte Seguro</span>
      </div>
      <span class="pie t2">Programa tus traslados con mayor tranquilidad</span>
    </div>
    <div class="st-escena">
      <span class="estela" style="top:18px;width:22px"></span>
      <span class="estela" style="top:30px;width:14px"></span>
      <img src="marca/moto.png" alt="">
      <span class="candado"><i></i><b><span class="check"></span></b></span>
    </div>
  </div>`;

/** El disco central: una forma, cuatro estados. */
const disco = modo => {
  if (modo === 'abierto') {
    return '<span class="disco abierto"><span class="aspa"><i></i><i></i></span></span>';
  }
  const clase = { pedir: 'pedir', online: 'online', offline: 'apagado' }[modo];
  return `<span class="disco ${clase}">
    ${modo === 'online' ? '<span class="latido"></span>' : ''}
    <img src="marca/moto-mapa.png" alt="">
  </span>`;
};

const barraPasajera = (modo = 'pedir') => `
  <div class="barra">
    ${[['Inicio', 'inicio'], ['Viajes', 'viajes']].map(([n, ic], i) => `
      <div class="dest-nav">${icono(ic, i === 0 ? 'var(--acento)' : 'var(--texto-3)')}
        <span class="etq ${i === 0 ? '' : 't3'}">${n}</span></div>`).join('')}
    <div class="disco-zona">
      ${disco(modo)}
      <span class="etq ${modo === 'abierto' ? 't3' : 'ac'}">${modo === 'abierto' ? 'Cerrar' : 'Pedir'}</span>
    </div>
    ${[['Seguridad', 'escudo'], ['Perfil', 'perfil']].map(([n, ic]) => `
      <div class="dest-nav">${icono(ic, 'var(--texto-3)')}
        <span class="etq t3">${n}</span></div>`).join('')}
  </div>`;

const barraConductor = enLinea => `
  <div class="barra">
    ${[['Mapa', 'inicio'], ['Jornada', 'reloj']].map(([n, ic], i) => `
      <div class="dest-nav">${icono(ic, i === 0 ? 'var(--acento)' : 'var(--texto-3)')}
        <span class="etq ${i === 0 ? '' : 't3'}">${n}</span></div>`).join('')}
    <div class="disco-zona">
      ${disco(enLinea ? 'online' : 'offline')}
      <span class="etq ${enLinea ? 'ok' : 't3'}">${enLinea ? 'En línea' : 'Conectar'}</span>
    </div>
    ${[['Viajes', 'viajes'], ['Perfil', 'perfil']].map(([n, ic]) => `
      <div class="dest-nav">${icono(ic, 'var(--texto-3)')}
        <span class="etq t3">${n}</span></div>`).join('')}
  </div>`;

const hojaAlta = `height:${Math.round(ALTO * FRACCION_POR_ESTADO.alta)}px`;
const hojaMedia = `height:${Math.round(ALTO * FRACCION_POR_ESTADO.media)}px`;

// ---------------------------------------------------------------------------
// Las pantallas
// ---------------------------------------------------------------------------

const PANTALLAS = {
  splash: () => `
    <div class="tel" style="display:grid;place-items:center;background:#070605">
      ${[[520, 'var(--fondo)'], [360, 'var(--superficie)'], [230, 'var(--elevada)']].map(([t, c]) => `
        <span style="position:absolute;width:${t}px;height:${t}px;border-radius:50%;background:${c};
          left:50%;top:50%;transform:translate(-50%,calc(-50% - 90px))"></span>`).join('')}
      <div style="position:relative;text-align:center;margin-bottom:180px">
        <div style="width:176px;height:176px;display:grid;place-items:center;margin:0 auto;position:relative">
          <span style="position:absolute;inset:0;border-radius:50%;border:1px solid color-mix(in srgb,var(--acento) 10%,transparent);border-left-color:color-mix(in srgb,var(--acento) 65%,transparent)"></span>
          <span style="position:absolute;inset:11px;border-radius:50%;border:2px solid color-mix(in srgb,var(--acento) 16%,transparent);border-top-color:var(--acento);border-right-color:var(--acento)"></span>
          <span style="width:138px;height:138px;border-radius:50%;border:3px solid var(--acento);display:grid;place-items:center;overflow:hidden">
            <img src="marca/emblema.png" width="132" height="132" style="border-radius:50%" alt="+58 Express">
          </span>
        </div>
        <div style="margin-top:30px;font-size:25px;font-weight:800;letter-spacing:-1.4px">
          <span class="ac">+58</span><span>express</span>
        </div>
        <div style="margin-top:10px;font-size:11px;font-weight:600;letter-spacing:1.1px;text-transform:uppercase" class="t2">
          Preparando tu viaje
        </div>
        <div style="margin-top:17px;display:flex;gap:6px;justify-content:center">
          ${[1, .6, .3].map(o => `<span style="width:6px;height:6px;border-radius:50%;background:var(--acento);opacity:${o}"></span>`).join('')}
        </div>
      </div>
    </div>`,

  rol: () => `
    <div class="tel" style="display:flex;flex-direction:column">
      <div style="padding:52px var(--margen) 28px;background:var(--superficie);
        border-radius:0 0 28px 28px;display:grid;justify-items:center;gap:18px">
        <img src="marca/logo-horizontal.png" width="210" alt="+58 Express">
        <div style="display:grid;gap:6px;text-align:center">
          <span class="titulo">¿Cómo quieres continuar?</span>
          <span class="pie t2">Puedes cambiar de modo cuando quieras.</span>
        </div>
      </div>

      <div style="flex:1;display:flex;flex-direction:column;gap:var(--gap);
        padding:var(--bloques) var(--margen) 0">
        <div style="flex:1"></div>

        <div class="veh-fila on" style="padding:var(--gap);gap:14px">
          <span class="filo"></span>
          <span style="width:108px;height:80px;border-radius:var(--r-campo);overflow:hidden;
            position:relative;background:var(--superficie);flex:0 0 108px;display:grid;place-items:center">
            <span style="position:absolute;left:0;right:0;top:62%;height:9px;
              background:var(--texto-3);opacity:.24"></span>
            <span style="position:absolute;top:0;bottom:0;left:26%;width:5px;
              background:var(--texto-3);opacity:.24"></span>
            <img src="marca/moto-mapa.png" width="46" height="46"
              style="position:relative;transform:rotate(16deg)" alt="">
          </span>
          <span style="flex:1;display:grid;gap:3px">
            <span class="enc">Pasajero</span>
            <span class="pie t2">Pide tu moto y sigue el viaje en el mapa</span></span>
        </div>

        <div class="veh-fila" style="padding:var(--gap);gap:14px;background:var(--superficie)">
          <span style="width:108px;height:80px;border-radius:var(--r-campo);background:var(--fondo);
            display:grid;place-items:center;flex:0 0 108px">
            <img src="marca/moto.png" style="width:104px;height:69px;object-fit:contain;opacity:.55" alt="">
          </span>
          <span style="flex:1;display:grid;gap:3px">
            <span class="enc">Conductor</span>
            <span class="pie t2">Conéctate, recibe viajes y gestiona tu jornada</span></span>
        </div>

        <div style="flex:1"></div>
        <div class="boton">Continuar</div>
        <div style="display:grid;justify-items:center;gap:2px;padding:12px 0 26px">
          <span class="pie t3">¿Necesitas ayuda para entrar?</span>
          <span class="etq ac">Contactar con soporte</span>
        </div>
      </div>
    </div>`,

  acceso: () => `
    <div class="tel" style="padding:58px var(--margen) 30px">
      <div style="text-align:center;display:grid;gap:22px;justify-items:center">
        <img src="marca/logo-horizontal.png" width="232" alt="+58 Express">
        <div style="display:grid;gap:6px">
          <span class="titulo">Entra a tu cuenta</span>
          <span class="cuerpo t2">Tu moto, a un toque.</span>
        </div>
      </div>
      <div style="margin-top:40px;display:grid;gap:var(--gap)">
        ${[['Correo o teléfono', 'demo@ejemplo.com'], ['Contraseña', '••••••••••']].map(([e, v]) => `
          <div style="display:grid;gap:7px">
            <span class="etq t2">${e}</span>
            <div style="height:54px;display:flex;align-items:center;padding:0 15px;
              border-radius:var(--r-campo);background:var(--superficie)">
              <span class="cuerpo t2">${v}</span></div>
          </div>`).join('')}
      </div>
      <div style="margin-top:var(--bloques);display:grid;gap:var(--gap)">
        <div class="boton">Entrar</div>
        <div class="boton sec">Crear una cuenta</div>
      </div>
    </div>`,

  pasajera: () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS}${hito(47, 29, 'orig')}${CTRL}</div>
      ${CABECERA_PASAJERA}
      <div class="hoja" style="${hojaMedia};bottom:76px">
        <span class="asa"></span>
        <div class="campo">${icono('destino', 'var(--acento)', 19)}
          <span class="cuerpo t2">¿A dónde vas?</span></div>
        <div style="height:var(--gap)"></div>
        ${LUGARES}
        <div style="height:var(--gap)"></div><span class="sep"></span>
        <div style="padding-top:4px">
          ${[['Destino de ejemplo 1', 'Guardado como «Casa»'],
             ['Destino de ejemplo 2', 'Guardado como «Trabajo»'],
             ['Destino de ejemplo 3', 'Visitado hace 2 días']].map(([t, d]) => `
            <div class="lugar-fila"><span class="redondo">${icono('reloj', 'var(--texto-2)', 17)}</span>
              <span style="flex:1;display:grid;gap:1px"><span class="cuerpo">${t}</span>
              <span class="pie t3">${d}</span></span></div>`).join('')}
        </div>
      </div>
      ${barraPasajera('pedir')}
    </div>`,

  pedir: () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS_TRES}</div>
      <div class="hoja" style="${hojaMedia};bottom:76px">
        <span class="asa"></span>
        <span class="pastilla" style="align-self:flex-start;padding:7px 9px 7px 11px">
          ${icono('perfil', 'var(--texto-2)', 15)}<span class="etq t2">Para mí</span>
          ${icono('galon', 'var(--texto-3)', 12)}</span>
        <div style="height:var(--gap)"></div>
        ${TRAYECTO}
        <div style="height:var(--gap)"></div>
        ${LUGARES}
        <div style="height:var(--gap)"></div><span class="sep"></span>
        <div style="padding-top:4px">
          ${[['Destino de ejemplo 1', 'Guardado como «Casa»'], ['Destino de ejemplo 2', 'Guardado como «Trabajo»']].map(([t, d]) => `
            <div class="lugar-fila"><span class="redondo">${icono('reloj', 'var(--texto-2)', 17)}</span>
              <span style="flex:1;display:grid;gap:1px"><span class="cuerpo">${t}</span>
              <span class="pie t3">${d}</span></span></div>`).join('')}
        </div>
        <div style="height:var(--gap)"></div>
        <div class="boton">Ver opciones</div>
      </div>
      ${barraPasajera('abierto')}
    </div>`,

  'para-quien': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS}</div>
      <div class="hoja" style="padding-top:0">
        <span class="asa"></span>
        <div style="display:grid;gap:var(--gap);padding-bottom:var(--pad)">
          <span class="titulo">¿Para quién es el viaje?</span>
          ${[['Para mí', 'Tú te montas', true], ['Para otra persona', 'Pídelo por alguien más', false]].map(([t, d, on]) => `
            <div class="veh-fila ${on ? 'on' : ''}" style="padding:14px;gap:13px;
              background:${on ? 'var(--elevada)' : 'var(--superficie)'}">
              ${on ? '<span class="filo"></span>' : ''}
              <span style="width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex:0 0 38px;
                background:${on ? 'color-mix(in srgb,var(--acento) 12%,transparent)' : 'var(--fondo)'}">
                ${icono('perfil', on ? 'var(--acento)' : 'var(--texto-2)', 19)}</span>
              <span style="flex:1;display:grid;gap:2px">
                <span class="cuerpo">${t}</span><span class="pie t3">${d}</span></span>
              <span style="width:21px;height:21px;border-radius:50%;flex:0 0 21px;
                border:2px solid ${on ? 'var(--acento)' : 'var(--borde)'};display:grid;place-items:center">
                ${on ? '<span style="width:11px;height:11px;border-radius:50%;background:var(--acento)"></span>' : ''}
              </span>
            </div>`).join('')}
          <div style="display:flex;align-items:center;gap:9px;padding:12px;
            border-radius:var(--r-campo);background:var(--fondo)">
            ${icono('escudo', 'var(--aviso)', 16)}
            <span class="pie t3">Pedir por otra persona todavía no está conectado al servidor.</span>
          </div>
          <div class="boton">Continuar</div>
        </div>
      </div>
    </div>`,

  confirmar: () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS_POCAS}${RUTA}${CTRL}</div>
      <div style="position:absolute;left:var(--margen);right:var(--margen);top:16px;
        display:flex;align-items:center;gap:9px;padding:11px 14px;
        border-radius:var(--r-campo);background:var(--elevada);box-shadow:0 5px 14px rgba(0,0,0,.4)">
        <span style="width:9px;height:9px;border-radius:50%;background:var(--texto);flex:0 0 9px"></span>
        <span class="etq t2">Maracaibo</span>
        <span style="width:14px;height:2px;border-radius:1px;background:var(--acento);flex:0 0 14px"></span>
        <span style="width:9px;height:9px;border-radius:2px;background:var(--acento);flex:0 0 9px"></span>
        <span class="etq">Destino de ejemplo 1</span>
      </div>
      <div class="hoja" style="padding-top:0">
        <span class="asa"></span>
        <div style="display:grid;gap:var(--gap);padding-bottom:var(--pad)">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="enc">Elige tu vehículo</span><span class="crece"></span>
            <span class="etq ok insignia">4 cerca</span>
          </div>
          ${filasDeVehiculo('MOTO')}
          ${TRANSPORTE_SEGURO}
          <span class="sep"></span>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="etq t2">Se calcula con la tasa del BCV</span>
            <span class="crece"></span><span class="pie t3">Bs. 000,00</span>
          </div>
          <div class="boton">Pedir viaje</div>
        </div>
      </div>
    </div>`,

  'conductor-offline': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${vehiculo('MOTO', 48, 30, 12, true)}${CTRL}</div>
      <div class="flotante" style="left:var(--margen);right:var(--margen);top:18px;gap:10px;padding:10px 14px">
        <span class="punto" style="background:var(--texto-3)"></span>
        <span class="etq t3">Fuera de línea</span><span class="crece"></span>
        <span class="etq t2">Zona demo · Maracaibo</span>
      </div>
      <div class="hoja" style="${hojaMedia};bottom:76px">
        <span class="asa"></span>
        <div style="display:grid;gap:var(--gap)">
          <div style="display:grid;gap:5px">
            <span class="titulo">Listo para salir</span>
            <span class="cuerpo t2">Conéctate con el botón de abajo y empieza a recibir viajes.</span>
          </div>
          <span class="sep"></span>
          <div style="display:flex;align-items:center;gap:10px">
            ${icono('moto', 'var(--texto-2)', 19)}
            <span class="pie t2">Moto demo · Placa DEMO-000</span><span class="crece"></span>
            <span class="etq ok insignia">Verificado</span>
          </div>
        </div>
      </div>
      ${barraConductor(false)}
    </div>`,

  'conductor-online': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${vehiculo('MOTO', 48, 30, 12, true)}${MOTOS_POCAS}${CTRL}</div>
      <div class="flotante" style="left:var(--margen);right:var(--margen);top:18px;gap:10px;padding:10px 14px">
        <span class="punto" style="background:var(--exito)"></span>
        <span class="etq ok">En línea · GPS activo</span><span class="crece"></span>
        <span class="etq t2">Zona demo · Maracaibo</span>
      </div>
      <div class="hoja" style="bottom:76px;padding-top:var(--pad)">
        <div style="display:flex;padding-bottom:var(--pad)">
          ${[['Viajes', '8'], ['En ruta', '5 h 20 m'], ['Resumen', '—']].map(([e, v], i) => `
            <div style="flex:1;display:flex">
              ${i > 0 ? '<span style="width:1px;background:var(--borde);margin-right:12px"></span>' : ''}
              <span style="display:grid;gap:3px"><span class="etq t3">${e}</span><span class="enc">${v}</span></span>
            </div>`).join('')}
        </div>
      </div>
      ${barraConductor(true)}
    </div>`,

  viaje: () => `
    <div class="tel">
      <div class="mapa">${CALLES}${RUTA_MEDIA}${vehiculo('MOTO', 46, 30, 38, true)}${CTRL}</div>
      <div class="hoja" style="${hojaMedia}">
        <span class="asa"></span>
        <div style="position:relative;overflow:hidden;border-radius:var(--r-tarjeta);background:var(--elevada);
          padding:var(--pad);display:flex;align-items:center">
          <span class="filo"></span>
          <span style="flex:1;display:grid;gap:3px"><span class="etq t2">ESTADO</span><span class="enc">En camino</span></span>
          <span style="display:grid;gap:3px;text-align:right"><span class="etq t2">LLEGA EN</span>
            <span class="titulo ac">4 min</span></span>
        </div>
        <div style="height:var(--gap)"></div>
        <div style="display:flex;align-items:center;gap:13px">
          <span style="width:44px;height:44px;border-radius:50%;background:var(--elevada);display:grid;place-items:center">
            <span class="etq">DC</span></span>
          <span style="flex:1;display:grid;gap:2px"><span class="cuerpo">Demo Conductor</span>
            <span class="pie t3">Moto demo · DEMO-000 · 4,9</span></span>
          ${['rayo', 'viajes'].map(ic => `<span style="width:42px;height:42px;border-radius:50%;
            background:var(--elevada);display:grid;place-items:center">${icono(ic, 'var(--texto-2)', 18)}</span>`).join('')}
        </div>
        <div style="height:var(--gap)"></div><span class="sep"></span>
        <div style="padding-top:var(--gap);display:grid;gap:10px">
          ${[['var(--texto)', 'Punto de recogida de ejemplo'], ['var(--acento)', 'Destino de ejemplo 1']].map(([c, t]) => `
            <div style="display:flex;align-items:center;gap:11px">
              <span style="width:9px;height:9px;border-radius:50%;background:${c}"></span>
              <span class="cuerpo t2">${t}</span></div>`).join('')}
        </div>
      </div>
    </div>`,

  'punto-en-mapa': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS}
        <span style="position:absolute;inset:0;background:var(--fondo);opacity:.25"></span>
        <span style="position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);text-align:center">
          <span style="display:inline-block;padding:6px 12px;margin-bottom:10px;border-radius:10px;background:var(--elevada)">
            <span class="etq">Mueve el mapa</span></span>
          <span style="display:block;width:26px;height:26px;margin:0 auto;border-radius:50%;
            border:3px solid var(--acento);background:color-mix(in srgb,var(--acento) 20%,transparent)"></span>
          <span style="display:block;width:2px;height:16px;margin:0 auto;background:var(--acento)"></span>
        </span>
      </div>
      <div class="hoja" style="padding-top:var(--pad)">
        <div style="display:grid;gap:var(--gap);padding-bottom:var(--pad)">
          <div style="display:grid;gap:3px"><span class="etq t2">PUNTO DE RECOGIDA</span>
            <span class="enc">Punto de ejemplo</span></div>
          <div class="boton">Confirmar recogida</div>
        </div>
      </div>
    </div>`
};

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const NOMBRES = {
  splash: 'Arranque',
  rol: 'Selector de rol',
  acceso: 'Acceso',
  pasajera: 'Inicio pasajera',
  pedir: 'Pedir viaje · disco abierto',
  'para-quien': '¿Para quién es el viaje?',
  confirmar: 'Confirmar el viaje',
  'punto-en-mapa': 'Elegir punto en el mapa',
  'conductor-offline': 'Conductor · fuera de línea',
  'conductor-online': 'Conductor · en línea',
  viaje: 'Viaje en curso'
};

function pagina(titulo, cuerpo) {
  return `<!doctype html><meta charset="utf-8"><title>${titulo} · C2</title>
<style>
  body{margin:0;padding:26px;background:#111;display:flex;flex-wrap:wrap;gap:26px;
    justify-content:center;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  .marco{border-radius:34px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  ${BASE}
</style>
<div style="${variables(C2)}">${cuerpo}</div>`;
}

for (const [clave, construir] of Object.entries(PANTALLAS)) {
  fs.writeFileSync(
    path.join(salida, `c2-${clave}.html`),
    pagina(NOMBRES[clave], `<div class="marco">${construir()}</div>`)
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
const ORDEN = [
  ['El arranque y la entrada', ['splash', 'rol', 'acceso']],
  ['La pasajera: del reposo a pedir', ['pasajera', 'pedir', 'confirmar']],
  ['Decisiones sobre el mapa', ['para-quien', 'punto-en-mapa']],
  ['El conductor', ['conductor-offline', 'conductor-online']],
  ['El viaje', ['viaje']]
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
      <div class="marco" style="${variables(C2)}">${PANTALLAS[clave]()}</div>
      <span>${NOMBRES[clave]}</span>
    </div>`).join('')}
</div>`).join('')}`);

console.log(`Evidencia de C2 generada en: ${salida}`);
