/**
 * +58express — MAQUETA DE CONCEPTO V2
 *
 * NO ES PRODUCCIÓN. Ruta de desarrollo aislada, sin conexión con la
 * navegación real, sin llamadas a la API, sin estado de negocio.
 * Datos simulados de Maracaibo.
 *
 * Contrato de la dirección en src/styles/design-v2.css.
 */

import { icon } from '../utils/icons.js';
import '../styles/design-v2.css';

/* --- Datos simulados, Maracaibo ------------------------------------------ */
const DESTINOS = [
  { i: 'clock', t: 'C.C. Sambil Maracaibo', s: 'Av. 16 Guajira · 4,2 km', e: '9 min' },
  { i: 'mapPin', t: 'Plaza de la República', s: 'Bella Vista · 2,8 km', e: '6 min' },
  { i: 'mapPin', t: 'Hospital Universitario', s: 'Av. El Milagro · 6,1 km', e: '14 min' },
  { i: 'mapPin', t: 'Terminal de Pasajeros', s: 'Av. 15 Delicias · 7,5 km', e: '17 min' }
];

const VIAJES = [
  { est: 'ok', t: 'Bella Vista → Sambil', f: 'Hoy, 3:24 p. m.', p: '$2,40', c: 'Completado' },
  { est: 'ok', t: 'Sambil → Av. El Milagro', f: 'Ayer, 8:10 p. m.', p: '$3,10', c: 'Completado' },
  { est: 'pend', t: 'Casa → Terminal', f: 'Mañana, 6:30 a. m.', p: '$4,00', c: 'Programado' },
  { est: 'bad', t: 'Delicias → Centro', f: '19 ago, 11:02 a. m.', p: '—', c: 'Cancelado' }
];

const TABLA = [
  ['#4821', 'María G.', 'Luis P.', 'Bella Vista → Sambil', '$2,40', 'ok', 'Completado'],
  ['#4820', 'Carlos R.', 'Ana M.', 'Milagro → Terminal', '$3,80', 'ok', 'Completado'],
  ['#4819', 'José L.', 'Luis P.', 'Centro → Delicias', '$1,90', 'curso', 'En curso'],
  ['#4818', 'Rosa V.', '—', 'Sambil → Bella Vista', '—', 'bad', 'Cancelado'],
  ['#4817', 'Pedro N.', 'Ana M.', 'Delicias → Norte', '$5,20', 'ok', 'Completado'],
  ['#4816', 'Luisa T.', 'Jorge D.', 'Guajira → Sambil', '$2,10', 'ok', 'Completado'],
  ['#4815', 'Andrés M.', 'Luis P.', 'Terminal → Centro', '$3,40', 'ok', 'Completado'],
  ['#4814', 'Yamile C.', 'Ana M.', 'Bella Vista → Norte', '$4,60', 'curso', 'En curso']
];

const ic = (n, s = 18) => icon(n, s);

/* ========================================================================= */
/* 1 · PASSENGER HOME                                                        */
/* ========================================================================= */
const passengerHome = () => `
  <div class="v2-device">
    <div class="v2-ground"></div>
    <div class="v2-pin origin"></div>

    <div class="v2-rail">
      <div class="v2-avatar">JR</div>
      <div class="v2-rail-id">
        <strong>Bella Vista</strong>
        <span><i class="v2-dot"></i> Ubicación activa</span>
      </div>
      <button class="v2-icon-btn">${ic('bell')}</button>
      <button class="v2-icon-btn">${ic('moon')}</button>
    </div>

    <div class="v2-sheet">
      <div class="v2-grip"></div>
      <h2>¿A dónde vas?</h2>
      <p class="v2-sub">Maracaibo · Zulia</p>

      <div class="v2-field">${ic('search', 20)} Ingresa tu destino</div>

      <div style="margin-top:12px" class="v2-seg">
        <button class="on">
          <span>${ic('motorcycle', 20)}</span>
          <span><strong>Moto</strong><small>1 pasajero</small></span>
          <span class="price">$1,50</span>
        </button>
        <button>
          <span>${ic('car', 20)}</span>
          <span><strong>Auto</strong><small>1–4 pasajeros</small></span>
          <span class="price">$2,50</span>
        </button>
      </div>

      <button class="v2-cta">${ic('navigation', 20)} Pedir moto ahora</button>
    </div>

    <nav class="v2-nav">
      <button class="on">${ic('home', 20)} Inicio</button>
      <button>${ic('history', 20)} Viajes</button>
      <button>${ic('wallet', 20)} Wallet</button>
      <button>${ic('user', 20)} Perfil</button>
    </nav>
  </div>`;

/* ========================================================================= */
/* 2 · REQUEST RIDE — la hoja rota, rehecha                                  */
/* ========================================================================= */
const passengerRequest = () => `
  <div class="v2-device">
    <div class="v2-ground"></div>
    <div class="v2-route"></div>
    <div class="v2-pin origin"></div>
    <div class="v2-pin dest"></div>

    <div class="v2-rail">
      <button class="v2-icon-btn">${ic('back')}</button>
      <div class="v2-rail-id">
        <strong>Elige tu destino</strong>
        <span>Desde Bella Vista</span>
      </div>
    </div>

    <div class="v2-sheet">
      <div class="v2-grip"></div>

      <div class="v2-field focus">${ic('search', 20)} Sambil</div>

      <div class="v2-list" style="margin-top:6px">
        ${DESTINOS.map(d => `
          <div class="v2-row">
            <i>${ic(d.i, 18)}</i>
            <span><strong>${d.t}</strong><small>${d.s}</small></span>
            <span class="v2-end">${d.e}</span>
          </div>`).join('')}
      </div>

      <button class="v2-cta">Confirmar destino ${ic('arrowRight', 20)}</button>
    </div>
  </div>`;

/* ========================================================================= */
/* 3 · TRIP HISTORY                                                          */
/* ========================================================================= */
const passengerHistory = () => `
  <div class="v2-device" style="background:var(--v2-ground)">
    <div class="v2-rail">
      <button class="v2-icon-btn">${ic('back')}</button>
      <div class="v2-rail-id"><strong>Mis viajes</strong><span>18 en total</span></div>
      <button class="v2-icon-btn">${ic('filter')}</button>
    </div>

    <div style="flex:1;min-height:0;overflow:hidden;padding:18px 16px 0">
      <div class="v2-metrics" style="padding-bottom:16px;border-bottom:1px solid var(--v2-line)">
        <div><small>Total</small><strong>18</strong></div>
        <div><small>Completados</small><strong>15</strong></div>
        <div><small>Programados</small><strong>2</strong></div>
      </div>

      <div class="v2-seg" style="margin-top:16px;grid-template-columns:repeat(3,1fr)">
        <button class="on"><strong>Todos</strong></button>
        <button><strong>Completados</strong></button>
        <button><strong>Programados</strong></button>
      </div>

      <div class="v2-list" style="margin-top:8px">
        ${VIAJES.map(v => `
          <div class="v2-row">
            <i>${ic(v.est === 'bad' ? 'close' : v.est === 'pend' ? 'calendar' : 'check', 18)}</i>
            <span>
              <strong>${v.t}</strong>
              <small>${v.f} · <b class="v2-state ${v.est === 'ok' ? 'ok' : v.est === 'bad' ? 'bad' : ''}">${v.c}</b></small>
            </span>
            <span class="v2-end" style="font-weight:700;color:var(--v2-ink)">${v.p}</span>
          </div>`).join('')}
      </div>
    </div>

    <nav class="v2-nav">
      <button>${ic('home', 20)} Inicio</button>
      <button class="on">${ic('history', 20)} Viajes</button>
      <button>${ic('wallet', 20)} Wallet</button>
      <button>${ic('user', 20)} Perfil</button>
    </nav>
  </div>`;

/* ========================================================================= */
/* 4 · DRIVER HOME                                                           */
/* ========================================================================= */
const driverHome = () => `
  <div class="v2-device">
    <div class="v2-ground"></div>

    <div class="v2-rail">
      <div class="v2-avatar">LP</div>
      <div class="v2-rail-id">
        <strong>Luis Parra</strong>
        <span><i class="v2-dot"></i> En línea · GPS activo</span>
      </div>
      <button class="v2-icon-btn">${ic('bell')}</button>
      <button class="v2-switch"><i></i></button>
    </div>

    <div style="position:relative;z-index:3;margin:12px 12px 0;padding:12px 14px;
                border:1px solid var(--v2-line);border-radius:var(--v2-r-control);
                background:color-mix(in srgb, var(--v2-surface) 86%, transparent);
                backdrop-filter:blur(18px)">
      <div class="v2-metrics">
        <div><small>Hoy</small><strong>$18,40</strong></div>
        <div><small>Viajes</small><strong>7</strong></div>
        <div><small>Rating</small><strong>4,9</strong></div>
      </div>
    </div>

    <div class="v2-sheet">
      <div class="v2-grip"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <h2 style="margin-bottom:2px">Nueva solicitud</h2>
          <p class="v2-sub" style="margin:0">Bella Vista → C.C. Sambil</p>
        </div>
        <div style="text-align:right">
          <div style="font:700 1.5rem/1 'Sora Variable',sans-serif;letter-spacing:-.04em;
                      font-variant-numeric:tabular-nums;color:var(--v2-accent)">$2,40</div>
          <small style="font-size:.68rem;color:var(--v2-ink-3)">4,2 km · 9 min</small>
        </div>
      </div>

      <div class="v2-metrics" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--v2-line)">
        <div><small>Recoger en</small><strong style="font-size:.95rem">3 min</strong></div>
        <div><small>Pasajero</small><strong style="font-size:.95rem">María G.</strong></div>
        <div><small>Pago</small><strong style="font-size:.95rem">Efectivo</strong></div>
      </div>

      <button class="v2-cta">Aceptar viaje ${ic('arrowRight', 20)}</button>
      <div style="height:8px"></div>
      <button class="v2-ghost">Rechazar</button>
    </div>

    <nav class="v2-nav">
      <button class="on">${ic('home', 20)} Inicio</button>
      <button>${ic('wallet', 20)} Ganancias</button>
      <button>${ic('history', 20)} Viajes</button>
      <button>${ic('user', 20)} Perfil</button>
    </nav>
  </div>`;

/* ========================================================================= */
/* 5 · DRIVER PROFILE                                                        */
/* ========================================================================= */
const driverProfile = () => `
  <div class="v2-device" style="background:var(--v2-ground)">
    <div class="v2-rail">
      <button class="v2-icon-btn">${ic('back')}</button>
      <div class="v2-rail-id"><strong>Mi perfil</strong><span>Conductor +58</span></div>
      <button class="v2-icon-btn">${ic('settings')}</button>
    </div>

    <div style="flex:1;min-height:0;overflow:hidden;padding:20px 16px 0">

      <div style="display:flex;align-items:center;gap:14px;padding-bottom:18px;
                  border-bottom:1px solid var(--v2-line)">
        <div class="v2-avatar" style="width:60px;height:60px;border-radius:18px;font-size:1.15rem">LP</div>
        <div style="min-width:0">
          <div style="font:700 1.22rem/1.1 'Sora Variable',sans-serif;letter-spacing:-.03em">Luis Parra</div>
          <div class="v2-state ok" style="margin-top:6px">${ic('checkCircle', 14)} Cuenta verificada</div>
        </div>
      </div>

      <div class="v2-section">
        <h3>Rendimiento</h3>
        <div class="v2-metrics">
          <div><small>Rating</small><strong>4,9</strong></div>
          <div><small>Viajes</small><strong>412</strong></div>
          <div><small>Meses</small><strong>14</strong></div>
        </div>
      </div>

      <div class="v2-section">
        <h3>Vehículo</h3>
        <div class="v2-kv">
          <div><span>Modelo</span><span>Bera SBR 150</span></div>
          <div><span>Placa</span><span>VIS58A</span></div>
        </div>
      </div>

      <div class="v2-section v2-balance">
        <small>Balance disponible</small>
        <b>$142,80</b>
        <em>≈ Bs. 124.842,00 · Tasa BCV 874,50</em>
        <button class="v2-cta" style="margin-top:12px">${ic('wallet', 20)} Solicitar retiro</button>
      </div>

      <div class="v2-section" style="padding-bottom:0">
        <div class="v2-list">
          <div class="v2-row"><i>${ic('fileText', 18)}</i><span><strong>Documentos</strong><small>Al día</small></span><span class="v2-end">${ic('chevronRight', 16)}</span></div>
          <div class="v2-row"><i>${ic('message', 18)}</i><span><strong>Administración</strong><small>Atención directa</small></span><span class="v2-end">${ic('chevronRight', 16)}</span></div>
          <div class="v2-row"><i>${ic('logout', 18)}</i><span><strong style="color:var(--v2-bad)">Cerrar sesión</strong></span><span class="v2-end"></span></div>
        </div>
      </div>
    </div>

    <nav class="v2-nav">
      <button>${ic('home', 20)} Inicio</button>
      <button>${ic('wallet', 20)} Ganancias</button>
      <button>${ic('history', 20)} Viajes</button>
      <button class="on">${ic('user', 20)} Perfil</button>
    </nav>
  </div>`;

/* ========================================================================= */
/* 6 · ADMIN DASHBOARD                                                       */
/* ========================================================================= */
const adminDashboard = () => `
  <div class="v2-desktop">
    <aside class="v2-side">
      <div class="brand">
        <div class="v2-avatar" style="border-radius:10px;color:var(--v2-accent)">58</div>
        <div><strong>+58express</strong><small>Maracaibo · Zulia</small></div>
      </div>
      <a class="on">${ic('grid', 18)} Operaciones</a>
      <a>${ic('map', 18)} Mapa de flota</a>
      <a>${ic('fileText', 18)} Solicitudes</a>
      <a>${ic('users', 18)} Usuarios</a>
      <a>${ic('dollarSign', 18)} Tarifas</a>
      <a>${ic('wallet', 18)} Recargas</a>
      <a>${ic('trending', 18)} Finanzas</a>
      <a>${ic('message', 18)} Soporte</a>
    </aside>

    <main class="v2-main">
      <header>
        <h1>Operación en vivo</h1>
        <p>21 de agosto de 2026 · 3:24 p. m. · Todos los sistemas operativos</p>
      </header>

      <div class="v2-kpi">
        <div><small><i class="v2-dot"></i> Viajes activos</small><strong>12</strong><em>Ahora mismo</em></div>
        <div><small>Conductores</small><strong>28</strong><em>19 prestando servicio</em></div>
        <div><small>Facturación hoy</small><strong>$486,20</strong><em>Bs. 425.182,00</em></div>
        <div><small>Calificación</small><strong>4,8</strong><em>Promedio 30 días</em></div>
      </div>

      <div class="v2-grid2">
        <div class="v2-panel">
          <header><h3>Viajes recientes</h3><span>8 de 128 registros</span></header>
          <table class="v2-table">
            <thead><tr><th>Viaje</th><th>Pasajero</th><th>Conductor</th><th>Ruta</th><th>Tarifa</th><th>Estado</th></tr></thead>
            <tbody>
              ${TABLA.map(r => `
                <tr>
                  <td class="num">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td>
                  <td style="color:var(--v2-ink-2)">${r[3]}</td>
                  <td class="num">${r[4]}</td>
                  <td><span class="v2-state ${r[5] === 'ok' ? 'ok' : r[5] === 'bad' ? 'bad' : ''}">
                    <i class="v2-dot" style="background:currentColor"></i>${r[6]}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="v2-panel">
          <header><h3>Actividad</h3></header>
          <div style="padding:4px 18px 14px">
            <div class="v2-list">
              <div class="v2-row"><i>${ic('checkCircle', 18)}</i><span><strong>Viaje #4821 completado</strong><small>hace 2 min</small></span><span class="v2-end">$2,40</span></div>
              <div class="v2-row"><i>${ic('user', 18)}</i><span><strong>Conductor conectado</strong><small>Luis P. · hace 6 min</small></span><span class="v2-end"></span></div>
              <div class="v2-row"><i>${ic('wallet', 18)}</i><span><strong>Recarga verificada</strong><small>Ana M. · hace 11 min</small></span><span class="v2-end">$20,00</span></div>
              <div class="v2-row"><i>${ic('fileText', 18)}</i><span><strong>Solicitud recibida</strong><small>José R. · hace 18 min</small></span><span class="v2-end"></span></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>`;

/* ========================================================================= */
const PANTALLAS = [
  ['passenger-home', 'Passenger · Home', passengerHome],
  ['passenger-request', 'Passenger · Pedir viaje', passengerRequest],
  ['passenger-history', 'Passenger · Mis viajes', passengerHistory],
  ['driver-home', 'Driver · Home', driverHome],
  ['driver-profile', 'Driver · Perfil', driverProfile],
  ['admin', 'Admin · Operaciones', adminDashboard]
];

export function renderDesignV2Preview(container) {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const tema = params.get('tema') === 'light' ? 'light' : 'dark';
  const solo = params.get('pantalla');

  const lista = solo ? PANTALLAS.filter(([id]) => id === solo) : PANTALLAS;

  container.innerHTML = `
    <div class="v2 ${tema === 'light' ? 'v2-light' : ''}">
      <div class="v2-stage ${tema === 'light' ? 'light-stage' : ''} ${solo ? 'bare' : ''}">
        ${solo ? '' : `<p class="v2-warn-banner">${ic('alertTriangle', 16)} DESIGN PREVIEW — NOT PRODUCTION</p>`}
        <div style="display:flex;flex-wrap:wrap;gap:${solo ? 0 : 34}px;align-items:flex-start">
          ${lista.map(([id, titulo, fn]) => `
            <figure style="margin:0" data-pantalla="${id}">
              ${solo ? '' : `<figcaption class="v2-caption"><b>V2</b><span>${titulo}</span></figcaption>`}
              ${fn()}
            </figure>`).join('')}
        </div>
      </div>
    </div>`;
}
