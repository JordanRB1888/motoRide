/**
 * Las pantallas de C2 dibujadas para navegador.
 *
 * QUÉ ES ESTO Y QUÉ NO ES
 *
 * NO es un segundo diseño. Los colores, espacios, radios y escalas se importan
 * de `theme/directions.ts`; las alturas de hoja, de `theme/hoja.ts`; los
 * destinos de la barra, de `theme/navegacion.ts`; y los vehículos, el emblema y
 * el logotipo son los archivos de marca de verdad. Lo único propio de aquí es
 * el PINTADO, porque un navegador no dibuja como React Native.
 *
 * POR QUÉ EXISTE
 *
 * La vía normal está cerrada: Expo Web necesita `react-native-web`, y no
 * instala porque `expo-router` arrastra `react-dom@19.2.8` mientras el SDK 57
 * fija `react@19.2.3`. Subir React sólo para tener web pondría en riesgo
 * Android e iOS, que son el producto.
 *
 * EL RIESGO DE ESTO, DICHO CLARO
 *
 * Un dibujo paralelo puede separarse del real sin que nadie lo note. La defensa
 * es que todo lo que sea DATO —tokens, medidas, textos, destinos, activos— se
 * importe de un solo sitio, y que aquí no se escriba ni un color ni una cadena
 * a mano. Hay pruebas que lo vigilan.
 *
 * Lo consumen dos cosas: `generarMaquetaC2.mjs`, que escribe las capturas, y
 * `servidorDeRevision.mjs`, que las sirve en localhost con recarga automática.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOGO } from '../theme/directions.ts';
import { FRACCION_POR_ESTADO } from '../theme/hoja.ts';
// El grafito mas hundido, el del fondo del arranque. Estaba escrito a mano y
// no habria seguido un cambio en los primitivos.
import { GRAFITO } from '../theme/primitives.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');

/** Copia los activos de marca junto a la salida, para que el HTML los vea. */
export function copiarActivos(destino) {
  fs.mkdirSync(path.join(destino, 'marca'), { recursive: true });
  for (const nombre of fs.readdirSync(path.join(raizMovil, 'assets/marca'))) {
    fs.copyFileSync(path.join(raizMovil, 'assets/marca', nombre), path.join(destino, 'marca', nombre));
  }
  fs.copyFileSync(path.join(raizMovil, 'assets/splash-icon.png'), path.join(destino, 'marca/emblema.png'));
}

export const ANCHO = 390;
export const ALTO = 844;

export const C2 = CATALOGO.C2;

/** Convierte los tokens de una dirección en variables CSS. */
export function variables(tema) {
  const c = tema.color;
  return `
    --fondo:${c.fondo}; --superficie:${c.superficie}; --elevada:${c.superficieElevada};
    --borde:${c.borde}; --acento:${c.acento}; --sobre-acento:${c.sobreAcento};
    --texto:${c.textoPrimario}; --texto-2:${c.textoSecundario}; --texto-3:${c.textoTenue};
    --exito:${c.exito}; --aviso:${c.aviso}; --peligro:${c.peligro};
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
  galon: '<path d="M6 9.5 12 15l6-5.5"/>',
  campana: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.4 5.6 2 6.2H4c.6-.6 2-2.2 2-6.2z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
  ajustes: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="17" r="2"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
  dolar: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M14.6 9.4a2.6 2.6 0 0 0-2.6-1.4h-.4a2.2 2.2 0 0 0 0 4.4h.8a2.2 2.2 0 0 1 0 4.4h-.4a2.6 2.6 0 0 1-2.6-1.4"/>'
};

const icono = (nombre, color = 'currentColor', tamano = 23) =>
  `<svg width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="none" stroke="${color}"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre]}</svg>`;

export const BASE = `
  *{margin:0;padding:0;box-sizing:border-box}
  /* El saldo del conductor es mas largo que una pantalla: en el telefono se
     hace scroll, y aqui se deja crecer para poder revisarlo entero. Es la
     unica pantalla que no va a 390x844. */
  .tel.crece{height:auto;min-height:${ALTO}px}
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
  .campo .cuerpo{line-height:1}
  .lugar-fila{display:flex;align-items:center;gap:13px;padding:11px 0}
  .redondo{width:34px;height:34px;border-radius:50%;background:var(--elevada);display:grid;place-items:center}
  /* line-height:1 en el texto: la caja de linea de la etiqueta es mas alta
     que la letra, y sin esto el texto queda un par de píxeles por debajo del
     icono aunque el contenedor esté centrado. */
  .pastilla{display:inline-flex;align-items:center;gap:8px;border-radius:999px;
    background:var(--fondo);padding:10px 14px}
  .pastilla .etq{line-height:1}

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
    background:var(--elevada);box-shadow:0 5px 14px rgba(0,0,0,.4);white-space:nowrap;
    max-width:calc(100% - var(--margen) * 2);overflow:hidden}
  /* El lugar se recorta; el estado, nunca: es lo primero que se lee. */
  .flotante .recorta{overflow:hidden;text-overflow:ellipsis}
  .punto{width:8px;height:8px;border-radius:50%}
`;

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

export const CALLES = `
  ${[[12, 2], [27, 7], [41, 2], [56, 3], [70, 8], [86, 2]]
    .map(([y, g]) => `<span class="calle" style="left:0;right:0;top:${y}%;height:${g}px"></span>`).join('')}
  ${[[9, 2], [24, 6], [43, 2], [61, 3], [79, 7], [93, 2]]
    .map(([x, g]) => `<span class="calle" style="top:0;bottom:0;left:${x}%;width:${g}px"></span>`).join('')}
  <span class="diag"></span><span class="agua"></span>`;

export const vehiculo = (tipo, x, y, rumbo, destacado = false) => {
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
  <span class="flotante" style="right:var(--margen);top:16px;width:40px;height:40px;
    border-radius:50%;display:grid;place-items:center">
    ${icono('campana', 'var(--texto-2)', 22)}
    <span style="position:absolute;top:7px;right:9px;width:9px;height:9px;border-radius:50%;
      background:var(--acento);border:2px solid var(--fondo)"></span>
  </span>`;

const LUGARES = `
  <div style="display:flex;gap:8px">
    <span class="pastilla">${icono('inicio', 'var(--acento)', 16)}<span class="etq">Casa</span></span>
    <span class="pastilla" style="opacity:.72">${icono('maletin', 'var(--texto-3)', 16)}
      <span class="etq t3">Trabajo</span>${icono('mas', 'var(--texto-3)', 14)}</span>
    <span class="pastilla" style="background:transparent;border:1px solid var(--borde);gap:7px">
      ${icono('mas', 'var(--acento)', 16)}<span class="etq t2">Añadir</span></span>
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
export const disco = modo => {
  if (modo === 'abierto') {
    return '<span class="disco abierto"><span class="aspa"><i></i><i></i></span></span>';
  }
  const clase = { pedir: 'pedir', online: 'online', offline: 'apagado' }[modo];
  return `<span class="disco ${clase}">
    ${modo === 'online' ? '<span class="latido"></span>' : ''}
    <img src="marca/moto-mapa.png" alt="">
  </span>`;
};

const barraPasajera = (modo = 'pedir', activo = 'inicio') => `
  <div class="barra">
    ${[['Inicio', 'inicio'], ['Historial', 'reloj']].map(([n, ic], i) => `
      <div class="dest-nav">${icono(ic, i === 0 && activo === 'inicio' ? 'var(--acento)' : 'var(--texto-3)')}
        <span class="etq ${i === 0 && activo === 'inicio' ? '' : 't3'}">${n}</span></div>`).join('')}
    <div class="disco-zona">
      ${disco(modo)}
      <span class="etq ${modo === 'abierto' ? 't3' : 'ac'}">${modo === 'abierto' ? 'Cerrar' : 'Pedir'}</span>
    </div>
    ${[['Viaje seguro', 'escudo'], ['Perfil', 'perfil']].map(([n, ic]) => `
      <div class="dest-nav">${icono(ic, 'var(--texto-3)')}
        <span class="etq t3">${n}</span></div>`).join('')}
  </div>`;

const barraConductor = (enLinea, activo = 'mapa') => `
  <div class="barra">
    ${[['Mapa', 'inicio'], ['Saldo', 'dolar']].map(([n, ic], i) => `
      <div class="dest-nav">${icono(ic, i === 0 && activo === 'mapa' ? 'var(--acento)' : 'var(--texto-3)')}
        <span class="etq ${i === 0 && activo === 'mapa' ? '' : 't3'}">${n}</span></div>`).join('')}
    <div class="disco-zona">
      ${disco(enLinea ? 'online' : 'offline')}
      <span class="etq ${enLinea ? 'ok' : 't3'}">${enLinea ? 'En línea' : 'Conectar'}</span>
    </div>
    ${[['Historial', 'viajes'], ['Perfil', 'perfil']].map(([n, ic]) => `
      <div class="dest-nav">${icono(ic, 'var(--texto-3)')}
        <span class="etq t3">${n}</span></div>`).join('')}
  </div>`;

const hojaAlta = `height:${Math.round(ALTO * FRACCION_POR_ESTADO.alta)}px`;
const hojaMedia = `height:${Math.round(ALTO * FRACCION_POR_ESTADO.media)}px`;

/** El sonar: tres anillos saliendo de tu posición. */
const pulso = tipo => `
  <span style="position:absolute;left:50%;top:22%;transform:translate(-50%,-50%);
    width:186px;height:186px;display:grid;place-items:center">
    ${[1, 0.68, 0.4].map((escala, i) => `
      <span style="position:absolute;width:${186 * escala}px;height:${186 * escala}px;border-radius:50%;
        border:2px solid var(--acento);opacity:${0.12 + i * 0.14}"></span>`).join('')}
    <img src="marca/${tipo === 'MOTO' ? 'moto-mapa.png' : 'auto-mapa.png'}"
      width="62" height="62" style="position:relative" alt="">
  </span>`;

// ---------------------------------------------------------------------------
// Las pantallas
// ---------------------------------------------------------------------------

export const PANTALLAS = {
  splash: () => `
    <div class="tel" style="display:grid;place-items:center;background:${GRAFITO.abismo}">
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
        ${[['pasajero', 'Pasajero', 'Pide tu moto y síguela en el mapa', true],
           ['conductor', 'Conductor', 'Conéctate y empieza a recibir viajes', false]
          ].map(([rol, titulo, detalle, on]) => `
          <div class="veh-fila ${on ? 'on' : ''}" style="padding:12px 14px;gap:13px;
            text-align:left;background:${on ? 'var(--elevada)' : 'var(--superficie)'}">
            ${on ? '<span class="filo"></span>' : ''}
            <span style="width:56px;height:56px;border-radius:var(--r-campo);overflow:hidden;
              flex:0 0 56px;display:grid;place-items:center">
              <img src="marca/rol-${rol}.png" width="56" height="56"
                style="object-fit:contain;opacity:${on ? 1 : 0.6}" alt="${titulo}">
            </span>
            <span style="flex:1;display:grid;gap:2px;text-align:left">
              <span class="enc">${titulo}</span>
              <span class="pie t2">${detalle}</span></span>
          </div>`).join('')}

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
      <div class="hoja" style="bottom:76px;padding-top:0">
        <span class="asa"></span>
        <div style="padding-bottom:var(--pad)">
          <div class="campo">${icono('destino', 'var(--acento)', 19)}
            <span class="cuerpo t2">¿A dónde vas?</span></div>
          <div style="height:var(--gap)"></div>
          ${LUGARES}
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
        <div style="height:var(--gap)"></div>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 13px;
          border-radius:var(--r-campo);background:var(--fondo)">
          ${icono('dolar', 'var(--texto-2)', 16)}
          <span class="etq t3">Tasa BCV</span><span class="crece"></span>
          <span class="etq ac">Bs. 000,00</span>
        </div>
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
      <div class="flotante" style="left:var(--margen);top:18px;gap:10px;padding:9px 14px">
        <span class="punto" style="background:var(--texto-3)"></span>
        <span class="etq t3">Fuera de línea</span>
        <span style="width:1px;height:13px;background:var(--borde)"></span>
        <span class="etq t2">Zona demo · Maracaibo</span>
      </div>
      <div class="hoja" style="bottom:76px;padding-top:var(--pad)">
        <div style="display:flex;align-items:center;gap:12px;padding-bottom:var(--pad)">
          ${icono('moto', 'var(--texto-2)', 20)}
          <span style="flex:1;display:grid;gap:2px">
            <span class="cuerpo">Listo para salir</span>
            <span class="pie t3">Moto demo · Placa DEMO-000</span></span>
          <span class="etq ok insignia">Verificado</span>
        </div>
      </div>
      ${barraConductor(false)}
    </div>`,

  'conductor-online': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${vehiculo('MOTO', 48, 30, 12, true)}${MOTOS_POCAS}${CTRL}</div>
      <div class="flotante" style="left:var(--margen);top:18px;gap:10px;padding:9px 14px">
        <span class="punto" style="background:var(--exito)"></span>
        <span class="etq ok">En línea</span>
        <span style="width:1px;height:13px;background:var(--borde)"></span>
        <span class="etq t2 recorta">Cerca de un punto de ejemplo · Vía de ejemplo</span>
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

  'buscando-moto': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS_TRES}
        <span style="position:absolute;inset:0;background:var(--fondo);opacity:.42"></span>
        ${pulso('MOTO')}
      </div>
      <div class="hoja" style="bottom:76px;padding-top:var(--pad)">
        <div style="display:grid;gap:var(--gap);padding-bottom:var(--pad)">
          <div style="display:grid;gap:4px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="titulo">Buscando tu moto</span>
              ${[1, .55, .3].map(o => `<span style="width:5px;height:5px;border-radius:50%;
                background:var(--acento);opacity:${o}"></span>`).join('')}
            </div>
            <span class="cuerpo t2">Avisando a los conductores que están cerca de ti.</span>
          </div>
          <div class="boton sec" style="border:1px solid var(--borde)">Cancelar</div>
        </div>
      </div>
      ${barraPasajera('abierto')}
    </div>`,

  'panel-jornada': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${vehiculo('MOTO', 48, 26, 12, true)}${MOTOS_POCAS}</div>
      <div class="flotante" style="left:var(--margen);top:18px;gap:10px;padding:9px 14px">
        <span class="punto" style="background:var(--exito)"></span>
        <span class="etq ok">En línea</span>
        <span style="width:1px;height:13px;background:var(--borde)"></span>
        <span class="etq t2 recorta">Cerca de un punto de ejemplo · Vía de ejemplo</span>
      </div>
      <div class="hoja" style="bottom:76px;padding-top:0">
        <span class="asa"></span>
        <div style="display:grid;gap:var(--gap);padding-bottom:var(--pad)">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="punto" style="background:var(--exito)"></span>
            <span class="enc">En línea</span><span class="crece"></span>
            ${icono('destino', 'var(--exito)', 14)}<span class="etq ok">GPS activo</span>
          </div>
          <div style="display:flex;flex-wrap:wrap">
            ${[['Vehículo', 'Moto demo · DEMO-000'], ['Zona', 'Zona demo · Maracaibo'],
               ['Viajes de hoy', '8'], ['En línea', '5 h 20 m'], ['Resumen', '—']].map(([e, v]) => `
              <span style="width:50%;padding:7px 12px 7px 0;display:grid;gap:2px;min-width:0">
                <span class="pie t3">${e}</span>
                <span class="cuerpo" style="overflow:hidden;text-overflow:ellipsis;
                  white-space:nowrap">${v}</span></span>`).join('')}
          </div>
          <div class="boton sec" style="border:1px solid var(--borde)">Salir de línea</div>
        </div>
      </div>
      ${barraConductor(true)}
    </div>`,

  'saldo-conductor': () => `
    <div class="tel crece">
      <div style="display:flex;align-items:center;padding:18px var(--margen) var(--gap)">
        <span class="titulo">Tu saldo</span><span class="crece"></span>
        <span class="pie t3">Tasa BCV · Bs. 000,00</span>
      </div>
      <div style="padding:0 var(--margen) 96px;display:grid;gap:var(--bloques)">
        <div style="position:relative;overflow:hidden;border-radius:var(--r-tarjeta);
          background:var(--superficie);padding:var(--pad);display:grid;gap:var(--gap)">
          <span class="filo"></span>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="etq t2">BALANCE DISPONIBLE</span><span class="crece"></span>
            <span class="etq t3" style="border:1px solid var(--borde);border-radius:10px;padding:3px 9px">0 viajes</span>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px">
            <span class="ac" style="font-size:32px;line-height:37px;font-weight:800;
              letter-spacing:var(--ajuste)">$0,00</span>
            <span class="cuerpo t3" style="padding-bottom:5px">USD</span>
          </div>
          <span class="pie t3">≈ Bs. 000,00 · tasa referencial del BCV</span>
          <div class="boton">Recargar saldo</div>
          <div class="boton sec" style="border:1px solid var(--borde)">Solicitar liquidación</div>
          <span class="pie t3">La cartera todavía no está encendida en el servidor:
            las cifras se muestran en cero a propósito.</span>
        </div>

        <div style="display:flex;align-items:center;gap:12px;padding:14px;
          border-radius:var(--r-campo);background:var(--superficie)">
          ${icono('escudo', 'var(--texto-2)', 18)}
          <span style="flex:1;display:grid;gap:2px">
            <span class="cuerpo">Cómo se reparte cada viaje</span>
            <span class="pie t3">Tu parte se acredita y la comisión se descuenta de esta
              cuenta. El porcentaje lo fija +58express en su configuración.</span></span>
        </div>

        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="enc">Movimientos</span><span class="crece"></span>
            <span class="pie t3">4 registros</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:var(--gap)">
            ${[['Todos', true], ['Comisiones', false], ['Recargas', false]].map(([n, on]) => `
              <span style="padding:8px 14px;border-radius:999px;
                background:${on ? 'var(--elevada)' : 'transparent'};
                border:1px solid ${on ? 'var(--acento)' : 'var(--borde)'}">
                <span class="etq ${on ? 'ac' : 't3'}">${n}</span></span>`).join('')}
          </div>
          <div style="margin-top:4px">
            ${[['Ganancia acreditada', 'Efectivo · Viaje de ejemplo', 'Hoy · 08:20', '+$0,00', 'Confirmado', false],
               ['Comisión +58Express', 'Viaje de ejemplo', 'Hoy · 08:20', '−$0,00', 'Aplicada', true],
               ['Recarga', 'Pago Móvil · Ref. de ejemplo', 'Ayer · 17:05', '+$0,00', 'Verificada', false],
               ['Liquidación', 'Transferencia de ejemplo', 'Hace 3 días', '−$0,00', 'Pagada', false]
              ].map(([t, d, c, imp, est, comision], i) => `
              ${i > 0 ? '<span class="sep"></span>' : ''}
              <div style="display:flex;align-items:center;gap:13px;padding:13px 0">
                <span style="width:36px;height:36px;border-radius:50%;display:grid;place-items:center;
                  flex:0 0 36px;background:${comision ? 'color-mix(in srgb,var(--peligro) 12%,transparent)' : 'var(--elevada)'}">
                  ${icono(comision ? 'dolar' : 'moto', comision ? 'var(--peligro)' : 'var(--texto-2)', 18)}</span>
                <span style="flex:1;display:grid;gap:2px;min-width:0">
                  <span class="cuerpo">${t}</span>
                  <span class="pie t3" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d}</span>
                  <span class="pie t3">${c}</span></span>
                <span style="display:grid;gap:2px;text-align:right">
                  <span class="cuerpo" style="color:${imp.startsWith('−') ? 'var(--texto-2)' : 'var(--exito)'}">${imp}</span>
                  <span class="pie t3">${est}</span></span>
              </div>`).join('')}
          </div>
        </div>
      </div>
      ${barraConductor(true, 'saldo')}
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

export const NOMBRES = {
  splash: 'Arranque',
  rol: 'Selector de rol',
  acceso: 'Acceso',
  pasajera: 'Inicio pasajera',
  pedir: 'Pedir viaje · disco abierto',
  'para-quien': '¿Para quién es el viaje?',
  confirmar: 'Confirmar el viaje',
  'buscando-moto': 'Buscando tu moto',
  'panel-jornada': 'Panel del disco',
  'saldo-conductor': 'Saldo del conductor',
  'punto-en-mapa': 'Elegir punto en el mapa',
  'conductor-offline': 'Conductor · fuera de línea',
  'conductor-online': 'Conductor · en línea',
  viaje: 'Viaje en curso'
};
