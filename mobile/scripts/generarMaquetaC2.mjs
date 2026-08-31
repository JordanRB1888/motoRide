/**
 * Genera la evidencia visual de C2.
 *
 * QUÉ ES Y QUÉ NO ES
 *
 * NO son capturas de la aplicación. Los colores, espacios, radios y escalas
 * tipográficas se importan de `theme/directions.ts` —los mismos que consume el
 * teléfono, no una copia— y los vehículos, el emblema y el logotipo son los
 * archivos de marca de verdad, copiados junto al HTML.
 *
 * La vía habitual sigue cerrada: renderizar la aplicación en un navegador exige
 * `react-native-web`, que declara incompatibilidad con `react@19.2.3`, la
 * versión que trae Expo SDK 57. No se fuerza con `--legacy-peer-deps` para
 * sacar unas capturas.
 *
 * Lo que no reproduce: el comportamiento nativo —gestos, arrastre de la hoja,
 * el latido del control— y la iconografía, que aquí va simplificada. Para eso
 * está Expo Go.
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
const C = CATALOGO.C;

/** Convierte los tokens de una dirección en variables CSS. */
function variables(tema) {
  const c = tema.color;
  return `
    --fondo:${c.fondo}; --superficie:${c.superficie}; --elevada:${c.superficieElevada};
    --borde:${c.borde}; --acento:${c.acento}; --sobre-acento:${c.sobreAcento};
    --texto:${c.textoPrimario}; --texto-2:${c.textoSecundario}; --texto-3:${c.textoTenue};
    --exito:${c.exito};
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
    --borde-ancho:${tema.superficie.conBorde ? 1 : 0}px;
  `.replace(/\s+/g, ' ').trim();
}

/**
 * Los iconos, dibujados a trazo.
 *
 * La aplicación usa su propia familia geométrica (`ui/Icono.tsx`, hecha con
 * vistas). Aquí se redibujan en SVG con el mismo espíritu —trazo uniforme,
 * formas simples— porque un cuadrado vacío de relleno haría parecer que la
 * navegación está sin terminar, y lo que hay que evaluar es la composición.
 */
const TRAZOS = {
  inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  destino: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  viajes: '<path d="M4 7h11M4 12h16M4 17h9"/><circle cx="19" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  perfil: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  escudo: '<path d="M12 3l7.5 3v6c0 4.6-3.2 8.2-7.5 9.5C7.7 20.2 4.5 16.6 4.5 12V6z"/><path d="M9 12.2l2.2 2.2 4-4.4"/>',
  moto: '<circle cx="5.5" cy="16.5" r="3.2"/><circle cx="18.5" cy="16.5" r="3.2"/><path d="M5.5 16.5 9 9h5l3.5 7.5M9 9h6.5"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.4l3.4 2"/>',
  rayo: '<path d="M13.5 2.5 5 13.5h5.5L9.5 21.5 19 10.5h-5.7z"/>'
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

  /* El mapa: el suelo de la pantalla. */
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
  .ruta{position:absolute;height:4px;border-radius:2px;background:var(--acento);opacity:.85;transform-origin:left center}

  .ctrl-mapa{position:absolute;right:14px;top:14px;width:42px;height:42px;border-radius:50%;
    background:var(--superficie);display:grid;place-items:center;box-shadow:0 4px 12px rgba(0,0,0,.3)}

  /* La hoja inferior. */
  .hoja{position:absolute;left:0;right:0;bottom:0;background:var(--superficie);
    border-radius:26px 26px 0 0;box-shadow:0 -8px 24px rgba(0,0,0,.45);
    padding:0 var(--margen) 14px;display:flex;flex-direction:column}
  .asa{width:38px;height:4px;border-radius:2px;background:var(--texto-3);opacity:.55;margin:10px auto 12px}
  .sep{height:1px;background:var(--borde)}

  .campo-dest{display:flex;align-items:center;gap:11px;height:52px;padding:0 15px;
    border-radius:var(--r-campo);background:var(--fondo)}
  .fila{display:flex;align-items:center;gap:13px;padding:11px 0}
  .redondo{width:34px;height:34px;border-radius:50%;background:var(--elevada);display:grid;place-items:center}

  /* Selector de vehículo: la firma sólo en el elegido. */
  .vehs{display:flex;gap:var(--gap)}
  .veh-op{flex:1;position:relative;overflow:hidden;border-radius:var(--r-tarjeta);
    background:var(--superficie);padding:10px 12px 12px;text-align:center}
  .veh-op.on{background:var(--elevada)}
  .veh-op img{width:104px;height:69px;object-fit:contain;display:block;margin:0 auto}
  .veh-op.off img{opacity:.55}
  .filo{position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acento)}

  .st{position:relative;overflow:hidden;display:flex;align-items:center;
    border-radius:var(--r-tarjeta);background:var(--superficie);padding:12px 8px 12px 16px}
  .st-escena{width:104px;height:56px;position:relative}
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

  /* Barra inferior con hueco central. */
  .barra{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:flex-start;
    background:var(--superficie);border-top:1px solid var(--borde);padding:10px 6px 22px}
  .dest-nav{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
  .fab{width:74px;display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:-24px}
  .disco{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;position:relative;
    background:var(--elevada);border:1px solid var(--borde);box-shadow:0 6px 12px rgba(0,0,0,.42)}
  .disco.on{background:color-mix(in srgb,var(--exito) 22%,var(--elevada));border:2px solid var(--exito)}
  .disco img{width:34px;height:34px;object-fit:contain;opacity:.45}
  .disco.on img{opacity:1;transform:scale(1.06)}
  .latido{position:absolute;inset:-6px;border-radius:50%;background:var(--exito);opacity:.14}

  .pastilla{position:absolute;top:18px;display:flex;align-items:center;gap:10px;
    border-radius:999px;background:var(--superficie);padding:8px 14px}
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

const hito = (x, y, tipo) => `<span class="hito ${tipo}" style="left:${x}%;top:${y}%"></span>`;

function ruta(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const largo = Math.sqrt(dx * dx + dy * dy);
  const angulo = (Math.atan2(dy * (ALTO / ANCHO), dx) * 180) / Math.PI;
  return `<span class="ruta" style="left:${x1}%;top:${y1}%;width:${largo}%;transform:rotate(${angulo}deg)"></span>`;
}

const CTRL = `<span class="ctrl-mapa">${icono('destino', 'var(--texto-2)', 20)}</span>`;

const selectorVehiculos = elegido => `
  <div class="vehs">
    ${[['MOTO', 'moto.png', 'Moto', '1 persona', '$1,50', '4 min'],
       ['AUTO', 'auto.png', 'Auto', '4 personas', '$3,20', '7 min']].map(([t, img, nombre, plazas, precio, min]) => `
      <div class="veh-op ${t === elegido ? 'on' : 'off'}">
        ${t === elegido ? '<span class="filo"></span>' : ''}
        <img src="marca/${img}" alt="${nombre}">
        <div style="margin-top:4px;display:grid;gap:2px">
          <span class="enc ${t === elegido ? '' : 't2'}">${nombre}</span>
          <span class="etq t3">${plazas}</span>
          <span class="enc ${t === elegido ? 'ac' : 't2'}">${precio}</span>
          <span class="etq t3">${min}</span>
        </div>
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

const barraPasajera = () => `
  <div class="barra">
    ${[['Inicio', 'inicio'], ['Viajes', 'viajes'], ['Seguridad', 'escudo'], ['Perfil', 'perfil']].map(([n, ic], i) => `
      <div class="dest-nav">
        ${icono(ic, i === 0 ? 'var(--acento)' : 'var(--texto-3)')}
        <span class="etq ${i === 0 ? '' : 't3'}">${n}</span>
      </div>`).join('')}
  </div>`;

const barraConductor = enLinea => `
  <div class="barra">
    ${[['Mapa', 'inicio'], ['Jornada', 'reloj']].map(([n, ic], i) => `
      <div class="dest-nav">
        ${icono(ic, i === 0 ? 'var(--acento)' : 'var(--texto-3)')}
        <span class="etq ${i === 0 ? '' : 't3'}">${n}</span>
      </div>`).join('')}
    <div class="fab">
      <span class="disco ${enLinea ? 'on' : ''}">
        ${enLinea ? '<span class="latido"></span>' : ''}
        <img src="marca/moto-mapa.png" alt="">
      </span>
      <span class="etq ${enLinea ? 'ok' : 't3'}">${enLinea ? 'En línea' : 'Conectar'}</span>
    </div>
    ${[['Viajes', 'viajes'], ['Perfil', 'perfil']].map(([n, ic]) => `
      <div class="dest-nav">
        ${icono(ic, 'var(--texto-3)')}
        <span class="etq t3">${n}</span>
      </div>`).join('')}
  </div>`;

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
    <div class="tel" style="padding:64px var(--margen) 32px;display:flex;flex-direction:column">
      <div style="text-align:center"><img src="marca/logo-horizontal.png" width="214" alt="+58 Express"></div>
      <div style="margin-top:52px;display:grid;gap:8px">
        <span class="titulo">¿Cómo quieres continuar?</span>
        <span class="cuerpo t2">Puedes cambiar de modo cuando quieras.</span>
      </div>
      <div style="margin-top:var(--bloques);display:grid;gap:var(--gap)">
        ${[['Pasajero', 'Pide un viaje ahora', true], ['Conductor', 'Conéctate y recibe viajes', false]].map(([t, d, on]) => `
          <div style="position:relative;overflow:hidden;display:flex;align-items:center;gap:15px;
            padding:var(--pad);border-radius:var(--r-tarjeta);background:${on ? 'var(--elevada)' : 'var(--superficie)'}">
            ${on ? '<span class="filo"></span>' : ''}
            <span style="width:46px;height:46px;border-radius:50%;display:grid;place-items:center;
              background:${on ? 'color-mix(in srgb,var(--acento) 12%,transparent)' : 'var(--fondo)'}">
              ${icono(on ? 'inicio' : 'moto', on ? 'var(--acento)' : 'var(--texto-2)')}</span>
            <span style="flex:1;display:grid;gap:2px">
              <span class="enc">${t}</span><span class="pie t2">${d}</span></span>
          </div>`).join('')}
      </div>
      <div style="flex:1"></div>
      <div class="boton">Continuar</div>
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
      <div class="pastilla" style="left:var(--margen);padding-left:6px">
        <span style="width:30px;height:30px;border-radius:50%;background:var(--elevada);display:grid;place-items:center"><span class="etq">DP</span></span>
        <span class="etq t2">Zona demo · Maracaibo</span>
      </div>
      <div class="hoja" style="height:${Math.round(ALTO * FRACCION_POR_ESTADO.media)}px;bottom:82px">
        <span class="asa"></span>
        <div class="campo-dest">${icono('destino', 'var(--acento)', 19)}
          <span class="cuerpo t2">¿A dónde vas?</span></div>
        <div style="height:var(--gap)"></div><span class="sep"></span>
        <div style="padding-top:4px">
          ${[['Destino de ejemplo 1', 'Guardado como «Casa»'], ['Destino de ejemplo 2', 'Guardado como «Trabajo»']].map(([t, d]) => `
            <div class="fila"><span class="redondo">${icono('reloj', 'var(--texto-2)', 17)}</span>
              <span style="flex:1;display:grid;gap:1px"><span class="cuerpo">${t}</span><span class="pie t3">${d}</span></span></div>`).join('')}
        </div>
        <span class="sep"></span>
        <div style="padding-top:var(--gap)">${TRANSPORTE_SEGURO}</div>
      </div>
      ${barraPasajera()}
    </div>`,

  servicio: () => `
    <div class="tel">
      <div class="mapa">${CALLES}${MOTOS}${hito(47, 29, 'orig')}${CTRL}</div>
      <div class="hoja" style="height:${Math.round(ALTO * FRACCION_POR_ESTADO.alta)}px;bottom:82px">
        <span class="asa"></span>
        <div class="campo-dest">${icono('destino', 'var(--acento)', 19)}
          <span class="cuerpo t2">¿A dónde vas?</span></div>
        <div style="height:var(--gap)"></div><span class="sep"></span>
        <div class="fila"><span class="redondo">${icono('reloj', 'var(--texto-2)', 17)}</span>
          <span style="flex:1;display:grid;gap:1px"><span class="cuerpo">Destino de ejemplo 1</span>
          <span class="pie t3">Guardado como «Casa»</span></span></div>
        <span class="sep"></span>
        <div style="padding-top:var(--gap);display:grid;gap:var(--gap)">
          <span class="etq t2">CÓMO QUIERES IR</span>
          ${selectorVehiculos('MOTO')}
          ${TRANSPORTE_SEGURO}
          <div class="boton">Pedir viaje</div>
        </div>
      </div>
      ${barraPasajera()}
    </div>`,

  'conductor-offline': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${vehiculo('MOTO', 48, 30, 12, true)}${CTRL}</div>
      <div class="pastilla" style="left:var(--margen);right:var(--margen)">
        <span class="punto" style="background:var(--texto-3)"></span>
        <span class="etq t3">Fuera de línea</span>
        <span style="flex:1"></span>
        <span class="etq t2">Zona demo · Maracaibo</span>
      </div>
      <div class="hoja" style="height:${Math.round(ALTO * FRACCION_POR_ESTADO.media)}px;bottom:92px">
        <span class="asa"></span>
        <div style="display:grid;gap:var(--gap)">
          <div style="display:grid;gap:5px">
            <span class="titulo">Listo para salir</span>
            <span class="cuerpo t2">Conéctate con el botón de abajo y empieza a recibir viajes.</span>
          </div>
          <span class="sep"></span>
          <div style="display:flex;align-items:center;gap:10px">
            ${icono('moto', 'var(--texto-2)', 19)}
            <span class="pie t2">Moto demo · Placa DEMO-000</span>
            <span style="flex:1"></span>
            <span class="etq ok" style="border:1px solid var(--exito);border-radius:10px;padding:3px 9px">Verificado</span>
          </div>
        </div>
      </div>
      ${barraConductor(false)}
    </div>`,

  'conductor-online': () => `
    <div class="tel">
      <div class="mapa">${CALLES}${vehiculo('MOTO', 48, 30, 12, true)}${vehiculo('MOTO', 26, 24, 24)}${vehiculo('MOTO', 69, 15, -68)}${CTRL}</div>
      <div class="pastilla" style="left:var(--margen);right:var(--margen)">
        <span class="punto" style="background:var(--exito)"></span>
        <span class="etq ok">En línea · GPS activo</span>
        <span style="flex:1"></span>
        <span class="etq t2">Zona demo · Maracaibo</span>
      </div>
      <div class="hoja" style="bottom:92px;padding-top:var(--pad)">
        <div style="display:flex">
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
      <div class="mapa">${CALLES}${ruta(28, 43, 73, 13)}${hito(28, 43, 'orig')}${hito(73, 13, 'dest')}${vehiculo('MOTO', 46, 30, 38, true)}${CTRL}</div>
      <div class="hoja" style="height:${Math.round(ALTO * FRACCION_POR_ESTADO.media)}px">
        <span class="asa"></span>
        <div style="position:relative;overflow:hidden;border-radius:var(--r-tarjeta);background:var(--elevada);padding:var(--pad);display:flex;align-items:center">
          <span class="filo"></span>
          <span style="flex:1;display:grid;gap:3px"><span class="etq t2">ESTADO</span><span class="enc">En camino</span></span>
          <span style="display:grid;gap:3px;text-align:right"><span class="etq t2">LLEGA EN</span><span class="titulo ac">4 min</span></span>
        </div>
        <div style="height:var(--gap)"></div>
        <div style="display:flex;align-items:center;gap:13px">
          <span style="width:44px;height:44px;border-radius:50%;background:var(--elevada);display:grid;place-items:center"><span class="etq">DC</span></span>
          <span style="flex:1;display:grid;gap:2px"><span class="cuerpo">Demo Conductor</span>
            <span class="pie t3">Moto demo · DEMO-000 · 4,9</span></span>
          ${['rayo', 'viajes'].map(ic => `<span style="width:42px;height:42px;border-radius:50%;background:var(--elevada);display:grid;place-items:center">${icono(ic, 'var(--texto-2)', 18)}</span>`).join('')}
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
        <span style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center">
          <span style="display:inline-block;padding:6px 12px;margin-bottom:10px;border-radius:10px;background:var(--elevada)">
            <span class="etq">Mueve el mapa</span></span>
          <span style="display:block;width:26px;height:26px;margin:0 auto;border-radius:50%;
            border:3px solid var(--acento);background:color-mix(in srgb,var(--acento) 20%,transparent)"></span>
          <span style="display:block;width:2px;height:16px;margin:0 auto;background:var(--acento)"></span>
        </span>
      </div>
      <div class="hoja" style="padding-top:var(--pad)">
        <div style="display:grid;gap:var(--gap)">
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
  pasajera: 'Inicio pasajera · hoja media',
  servicio: 'Selector Moto / Auto · hoja alta',
  'punto-en-mapa': 'Elegir punto en el mapa',
  'conductor-offline': 'Conductor · fuera de línea',
  'conductor-online': 'Conductor · en línea',
  viaje: 'Viaje en curso'
};

function pagina(titulo, cuerpo, extra = '') {
  return `<!doctype html><meta charset="utf-8"><title>${titulo} · C2</title>
<style>
  body{margin:0;padding:26px;background:#111;display:flex;flex-wrap:wrap;gap:26px;
    justify-content:center;font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  .marco{border-radius:34px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .pie-marco{color:#888;font-size:12px;text-align:center;margin-top:9px}
  h1{color:#eee;font-size:15px;font-weight:600;width:100%;text-align:center;margin:0 0 4px}
  ${BASE}${extra}
</style>
<div style="${variables(C2)}">${cuerpo}</div>`;
}

for (const [clave, construir] of Object.entries(PANTALLAS)) {
  const html = pagina(NOMBRES[clave], `<div class="marco">${construir()}</div>`);
  fs.writeFileSync(path.join(salida, `c2-${clave}.html`), html);
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

// La comparación: C anterior contra C2.
const comparacion = `<!doctype html><meta charset="utf-8"><title>C → C2</title>
<style>
  body{margin:0;padding:30px;background:#111;color:#eee;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  h1{font-size:20px;margin:0 0 8px} h2{font-size:15px;margin:34px 0 12px;color:#ccc}
  p{color:#999;font-size:13px;line-height:1.65;max-width:820px}
  .par{display:flex;gap:26px;flex-wrap:wrap}
  .col{text-align:center}
  .col span{display:block;color:#888;font-size:12px;margin-top:9px}
  .marco{border-radius:34px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.6)}
  ul{color:#999;font-size:13px;line-height:1.8;max-width:820px}
  b{color:#ffd21f}
  ${BASE}
</style>
<h1>C → C2</h1>
<p>La izquierda es la dirección C tal y como se presentó. La derecha es C2: la misma identidad
—mismo grafito, mismo <b>#ffd21f</b>, mismo filo— con el mapa convertido en el suelo de la
pantalla y los activos de marca dentro.</p>
<ul>
  <li>El mapa deja de ser una tarjeta de 220 puntos y pasa a ocupar la pantalla.</li>
  <li>Los vehículos amarillos reales sustituyen a los pictogramas del selector.</li>
  <li>La lista de tarjetas se convierte en una hoja con grupos separados por una línea.</li>
  <li>El control de disponibilidad del conductor pasa al centro de la barra, con la moto dentro.</li>
  <li>Las superficies pierden el borde: la única línea que llama la atención es la amarilla.</li>
</ul>

<h2>Inicio de la pasajera</h2>
<div class="par">
  <div class="col"><div class="marco" style="${variables(C)}">${PANTALLAS.pasajera()}</div><span>C2 sobre tokens de C</span></div>
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS.pasajera()}</div><span>C2</span></div>
</div>

<h2>Conductor</h2>
<div class="par">
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS['conductor-offline']()}</div><span>Fuera de línea</span></div>
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS['conductor-online']()}</div><span>En línea</span></div>
</div>

<h2>Pedir un viaje</h2>
<div class="par">
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS.servicio()}</div><span>Selector Moto / Auto</span></div>
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS.viaje()}</div><span>Viaje en curso</span></div>
</div>

<h2>Arranque y entrada</h2>
<div class="par">
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS.splash()}</div><span>Arranque</span></div>
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS.rol()}</div><span>Selector de rol</span></div>
  <div class="col"><div class="marco" style="${variables(C2)}">${PANTALLAS.acceso()}</div><span>Acceso</span></div>
</div>`;

fs.writeFileSync(path.join(salida, 'comparacion.html'), comparacion);

console.log(`Evidencia de C2 generada en: ${salida}`);
