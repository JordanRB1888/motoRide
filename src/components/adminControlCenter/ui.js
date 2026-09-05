import { icon } from '../../utils/icons.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(Number(value));
export const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('es-VE', {dateStyle:'medium', timeStyle:'short'}) : 'Sin registro';
export const pageHeader = (section, title, description, actions = '') => `<header class="cc-page-header"><div><span class="cc-eyebrow">${esc(section)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="cc-page-actions">${actions}</div></header>`;
export const empty = (title, description, symbol = 'grid') => `<div class="cc-empty">${icon(symbol,32)}<h3>${esc(title)}</h3><p>${esc(description)}</p></div>`;
export const loading = label => `<div class="cc-loading" role="status"><div class="cc-skeleton"></div><div class="cc-skeleton"></div><p>${esc(label)}</p></div>`;
export const gap = message => `<div class="cc-gap" role="note">${icon('info',16)}<div><strong>En preparación · sin conexión al servidor</strong><p>${esc(message)}</p></div></div>`;
export const metric = (label, value, detail, tone = '') => `<article class="cc-metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
export const badge = (label, tone = '') => `<span class="cc-badge ${tone}">${esc(label)}</span>`;

/** Shared keyboard contract for our dialogs. Does not change authorization. */
export function mountDialog(parent, html, label) {
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'cc-dialog-backdrop';
  overlay.innerHTML = `<section class="cc-dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</section>`;
  const close = () => { overlay.remove(); if(previous?.isConnected) previous.focus(); };
  overlay.onclick = event => { if(event.target === overlay || event.target.closest('[data-dialog-close]')) close(); };
  overlay.onkeydown = event => {
    if(event.key === 'Escape') { event.preventDefault(); close(); }
    if(event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
    if(!items.length) { event.preventDefault(); return; }
    if(event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if(!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  };
  parent.appendChild(overlay);
  (overlay.querySelector('input,button') || overlay.firstElementChild).focus();
  return { overlay, close };
}

export const SECTIONS = [
  ['dashboard','grid','Centro de Operaciones','Resumen'],
  ['fleet','mapPin','Mapa de Flota','Operación'],
  ['trips','navigation','Viajes','Operación'],
  ['applications','fileText','Solicitudes','Operación'],
  ['users','users','Usuarios','Operación'],
  ['finances','barChart','Finanzas','Finanzas'],
  ['topups','wallet','Recargas','Finanzas'],
  ['tariffs','dollarSign','Tarifas','Finanzas'],
  ['ads','fileText','Publicidad','Comercial'],
  ['partners','grid','Aliados','Comercial'],
  ['support','message','Soporte','Atención'],
  ['communications','bell','Comunicaciones','Atención'],
  ['team','users','Equipo','Administración'],
  ['roles','lock','Roles y permisos','Administración'],
  ['audit','history','Auditoría','Administración'],
  ['system','settings','Sistema','Administración']
];

const QUICK_ACTIONS = [
  { section: 'applications', icon: 'fileText', title: 'Revisar solicitudes de conductores', group: 'Acción rápida', keywords: 'aprobar rechazar documentos recaudos chofer' },
  { section: 'ads', icon: 'fileText', title: 'Crear campaña publicitaria', group: 'Acción rápida', keywords: 'banner marketing anuncio passenger home' },
  { section: 'partners', icon: 'grid', title: 'Gestionar aliados comerciales', group: 'Acción rápida', keywords: 'marcas convenios descuentos comercios' },
  { section: 'roles', icon: 'lock', title: 'Configurar roles y permisos (RBAC)', group: 'Acción rápida', keywords: 'seguridad privilegios accesos matriz' },
  { section: 'topups', icon: 'wallet', title: 'Conciliar recargas y pagos móviles', group: 'Acción rápida', keywords: 'banesco dinero saldo bancos' },
  { section: 'tariffs', icon: 'dollarSign', title: 'Ajustar tarifas y precios de viaje', group: 'Acción rápida', keywords: 'precio carrera km noche base' },
  { section: 'fleet', icon: 'mapPin', title: 'Monitorear mapa de flota en vivo', group: 'Acción rápida', keywords: 'gps ubicacion maracaibo carros motos' },
  { section: 'team', icon: 'users', title: 'Consultar equipo administrativo', group: 'Acción rápida', keywords: 'personal miembros accesos' }
  ,{ section: 'communications', icon: 'bell', title: 'Emitir un comunicado operativo', group: 'Acción rápida', keywords: 'aviso notificacion anuncio pasajeros conductores' }
];

export function openCommandPalette(parent, navigate) {
  const {overlay, close} = mountDialog(parent, `<header class="cc-command-search">${icon('search',20)}<input aria-label="Buscar sección o acción" placeholder="¿A dónde quieres ir o qué deseas hacer?" autocomplete="off"><button data-dialog-close>Esc</button></header><div class="cc-command-results"></div><footer>Navega con ↑ ↓ y pulsa Enter para ir a la sección · Esc para salir</footer>`, 'Buscar en el Control Center');
  const list = overlay.querySelector('.cc-command-results');
  const input = overlay.querySelector('input');

  const draw = query => {
    const q = query.trim().toLocaleLowerCase();
    const sectionMatches = SECTIONS.filter(item => `${item[2]} ${item[3]}`.toLocaleLowerCase().includes(q));
    const actionMatches = QUICK_ACTIONS.filter(act => `${act.title} ${act.group} ${act.keywords}`.toLocaleLowerCase().includes(q));

    let html = '';
    if (actionMatches.length && q.length > 0) {
      html += `<div style="padding:6px 12px;font-size:9px;color:var(--cc-accent);font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Acciones sugeridas</div>`;
      html += actionMatches.map(act => `<button data-section="${act.section}" class="cc-command-item action">${icon(act.icon,16)}<span>${esc(act.title)}<small>${esc(act.group)}</small></span>${icon('arrowRight',14)}</button>`).join('');
    }

    if (sectionMatches.length) {
      if (actionMatches.length && q.length > 0) {
        html += `<div style="padding:6px 12px 2px;font-size:9px;color:var(--cc-muted);font-weight:600;letter-spacing:0.8px;text-transform:uppercase;margin-top:6px;">Secciones</div>`;
      }
      html += sectionMatches.map(([id,ic,title,group])=>`<button data-section="${id}" class="cc-command-item">${icon(ic,16)}<span>${esc(title)}<small>${esc(group)}</small></span>${icon('arrowRight',14)}</button>`).join('');
    }

    list.innerHTML = html || empty('Sin coincidencias', 'Prueba con otra palabra clave como "solicitudes", "campañas", "bancos" o "mapa".', 'search');

    const buttons = [...list.querySelectorAll('button[data-section]')];
    buttons.forEach((button, idx) => {
      button.onclick = () => { close(); navigate(button.dataset.section); };
      button.onkeydown = e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); buttons[idx + 1]?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (idx === 0) input.focus(); else buttons[idx - 1]?.focus(); }
      };
    });
  };

  input.oninput = e => draw(e.target.value);
  input.onkeydown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list.querySelector('button[data-section]')?.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      list.querySelector('button[data-section]')?.click();
    }
  };
  draw('');
}

/** Reusable Side Drawer for slide-in editors without navigating away from the workspace. */
export function mountSideDrawer(parent, html, label, width = '860px') {
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'cc-drawer-overlay';
  overlay.innerHTML = `<aside class="cc-drawer-panel" style="max-width:${width};" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">${html}</aside>`;
  const close = () => { overlay.remove(); if(previous?.isConnected) previous.focus(); };
  overlay.onclick = event => { if(event.target === overlay || event.target.closest('[data-drawer-close]')) close(); };
  overlay.onkeydown = event => {
    if(event.key === 'Escape') { event.preventDefault(); close(); }
    if(event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
    if(!items.length) { event.preventDefault(); return; }
    if(event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if(!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  };
  parent.appendChild(overlay);
  (overlay.querySelector('input,button') || overlay.firstElementChild).focus();
  return { overlay, close };
}
