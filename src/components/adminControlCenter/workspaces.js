import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { createOwnedObjectUrl, revokeOwnedObjectUrl } from '../../utils/privatePhoto.js';
import { esc, money, date, pageHeader, empty, loading, gap, badge, metric, mountDialog } from './ui.js';

const fields = definitions => definitions.map(([name,label,type='text'])=>`<label class="cc-field">${label}${type==='textarea'?`<textarea name="${name}" rows="3"></textarea>`:`<input name="${name}" type="${type}" ${type==='number'?'min="0"':''}>`}</label>`).join('');
const FEATURES = {
  ads:{section:'Comercial',title:'Publicidad',subtitle:'Diseña campañas para el Home de pasajeros.',noun:'campañas',icon:'fileText',action:'Preparar campaña',description:'Prepara el contenido y revisa su apariencia. No se guarda ni publica ninguna campaña.',fields:[['title','Título'],['subtitle','Texto','textarea'],['cta','Texto del botón'],['url','URL de destino','url'],['start','Inicio','datetime-local'],['end','Final','datetime-local'],['order','Orden','number']]},
  partners:{section:'Comercial',title:'Aliados comerciales',subtitle:'Un espacio para las marcas que acompañan cada recorrido.',noun:'aliados',icon:'grid',action:'Preparar aliado',description:'Vista previa temporal de un aliado. El catálogo y la publicación requieren conexión al servidor.',fields:[['title','Empresa'],['category','Categoría'],['subtitle','Promoción','textarea'],['url','Sitio web','url'],['location','Ubicación'],['order','Prioridad','number']]},
  roles:{section:'Administración',title:'Roles y permisos',subtitle:'Diseña responsabilidades claras para tu equipo.',noun:'roles personalizados',icon:'lock',action:'Diseñar rol',description:'Esta matriz es un borrador visual. No concede ni restringe permisos. La autorización vigente sigue siendo el rol admin del servidor.',fields:[['title','Nombre del rol'],['subtitle','Descripción','textarea']]}
};
const PERMISSIONS = [
  ['Operación',['Ver operación','Gestionar viajes','Gestionar conductores']],
  ['Expedientes',['Ver documentos','Solicitar corrección','Aprobar','Rechazar']],
  ['Finanzas',['Consultar','Gestionar recargas','Editar tarifas']],
  ['Comercial',['Gestionar campañas','Gestionar aliados']],
  ['Soporte',['Ver conversaciones','Responder']],
  ['Sistema',['Gestionar equipo','Gestionar roles','Ver auditoría']]
];

/** Deliberately memory-only: draft previews never impersonate persisted records. */
export function renderPreparation(container, type) {
  const f=FEATURES[type];
  let imageUrl=null;
  const draw = (editing=false) => {
    container.innerHTML=`<div class="cc-workspace-page">${pageHeader(f.section,f.title,f.subtitle,`<button class="cc-button primary" data-edit>${icon('plus',16)} ${f.action}</button>`)}${gap(f.description)}
      ${editing?`<div class="cc-editor-layout"><form class="cc-editor"><header><h2>${type==='roles'?'Diseñar responsabilidades':'Contenido y presentación'}</h2>${badge('Borrador temporal')}</header><div class="cc-field-grid">${fields(f.fields)}</div>${type==='roles'?`<div class="cc-permission-grid">${PERMISSIONS.map(([group,permissions])=>`<fieldset><legend>${group}</legend>${permissions.map(permission=>`<label><input type="checkbox" aria-label="${group}: ${permission}"> ${permission}</label>`).join('')}</fieldset>`).join('')}</div>`:`<label class="cc-upload">${icon('upload',24)}<strong>${type==='ads'?'Imagen del banner':'Logo de la empresa'}</strong><span>PNG, JPEG o WebP · vista previa local</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="cc-field">Estado previsto<select name="status"><option>Borrador</option><option>Activo</option><option>Inactivo</option></select></label>`}<footer><button class="cc-button" type="button" data-cancel>Volver</button><button class="cc-button primary" disabled title="Pendiente de backend">${type==='roles'?'Crear rol':'Publicar'}</button><small>Guardado y publicación pendientes de integración.</small></footer></form><aside class="cc-preview-column"><span class="cc-eyebrow">Vista previa · no publicada</span><div class="cc-content-preview ${type}"><div class="cc-preview-art">${icon(f.icon,32)}</div><span class="cc-eyebrow">${type==='roles'?'Rol en preparación':'+58Express / '+f.title}</span><h2 data-preview-title>Tu ${type==='ads'?'próxima campaña':type==='roles'?'nuevo rol':'próximo aliado'}</h2><p data-preview-subtitle>Completa el contenido para explorar cómo se verá.</p>${type==='ads'?'<span class="cc-preview-cta" data-preview-cta>Texto del botón →</span>':''}</div><div class="cc-preview-note">${icon('info',16)}<p>${type==='roles'?'Ninguna selección modifica accesos reales.':'Las imágenes permanecen en esta sesión y no se suben a ningún servicio.'}</p></div></aside></div>`:`<section class="cc-panel cc-catalog-empty"><div class="cc-catalog-head"><span>${f.title}</span>${badge('Integración pendiente')}</div>${empty(`El espacio para tus ${f.noun}`,`Puedes preparar ${type==='roles'?'una matriz de responsabilidades':'contenido y visualizarlo'} mientras se integra el servicio.`,f.icon)}<button class="cc-button" data-edit>${f.action} ${icon('arrowRight',16)}</button></section>`}</div>`;
    container.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>draw(true));
    container.querySelector('[data-cancel]')?.addEventListener('click',()=>{if(imageUrl)revokeOwnedObjectUrl(imageUrl);imageUrl=null;draw();});
    const form=container.querySelector('form');
    if(!form)return;
    form.onsubmit=e=>e.preventDefault();
    form.oninput=()=>{
      for(const key of ['title','subtitle','cta']) {
        const target=container.querySelector(`[data-preview-${key}]`);
        if(target&&form.elements.namedItem(key))target.textContent=form.elements.namedItem(key).value|| (key==='title'?'Sin título':key==='cta'?'Texto del botón →':'Sin descripción');
      }
    };
    form.querySelector('[name="image"]')?.addEventListener('change',event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){event.target.setCustomValidity('Selecciona PNG, JPEG o WebP de hasta 10 MB.');event.target.reportValidity();return;}
      event.target.setCustomValidity('');
      if(imageUrl)revokeOwnedObjectUrl(imageUrl);
      imageUrl=createOwnedObjectUrl(file);
      const img=document.createElement('img');img.src=imageUrl;img.alt='Vista previa local';
      container.querySelector('.cc-preview-art').replaceChildren(img);
    });
  };
  draw();
  const root=container.firstElementChild;
  const observer=new MutationObserver(()=>{if(container.querySelector('.cc-workspace-page'))return;if(imageUrl)revokeOwnedObjectUrl(imageUrl);observer.disconnect();});
  observer.observe(container,{childList:true});
}

async function readWorkspace(container, label, endpoint) {
  container.innerHTML=loading(label);
  const anchor=container.firstElementChild;
  const data=await apiService.get(endpoint);
  if(!anchor.isConnected)return null;
  if(!data)container.innerHTML=`<section class="cc-panel">${empty('No pudimos cargar esta sección','Verifica la conexión e inténtalo nuevamente.','alertCircle')}<button class="cc-button" data-retry>Reintentar</button></section>`;
  return data;
}

export async function renderAudit(container) {
  const data=await readWorkspace(container,'Consultando registro administrativo…','/admin/actions');
  if(!data){container.querySelector('[data-retry]')?.addEventListener('click',()=>renderAudit(container));return;}
  let query='',action='all';
  const labels={approve:'Aprobación',reject:'Rechazo',needs_changes:'Corrección solicitada',suspend:'Suspensión',reactivate:'Reactivación',topup_approved:'Recarga aprobada',topup_rejected:'Recarga rechazada',payout_approved:'Liquidación aprobada',payout_rejected:'Liquidación rechazada'};
  const rows=Array.isArray(data)?data:[];
  const draw=()=>{
    const visible=rows.filter(row=>(action==='all'||row.action===action)&&`${row.adminId} ${row.action} ${row.targetUserId} ${row.applicationId} ${row.transactionId} ${row.reason||''}`.toLowerCase().includes(query.toLowerCase()));
    container.innerHTML=`<div>${pageHeader('Administración','Auditoría','Trazabilidad de decisiones de expedientes y movimientos administrativos.')}<form class="cc-filter-bar"><label>${icon('search',16)}<input name="q" value="${esc(query)}" placeholder="Actor, referencia o motivo" aria-label="Buscar auditoría"></label><select name="action" aria-label="Filtrar acción"><option value="all">Todas las acciones</option>${[...new Set(rows.map(row=>row.action))].map(value=>`<option value="${esc(value)}" ${action===value?'selected':''}>${esc(labels[value]||value)}</option>`).join('')}</select><button class="cc-button">Filtrar</button></form><section class="cc-panel"><header><h2>Registro de acciones</h2><span>${visible.length} de ${rows.length} registros cargados</span></header><div class="cc-table-scroll"><table class="cc-table"><thead><tr><th>Fecha</th><th>Administrador</th><th>Acción</th><th>Referencia</th><th>Observación</th></tr></thead><tbody>${visible.map(row=>`<tr><td>${date(row.createdAt)}</td><td><code>${esc(row.adminId||'Sin actor')}</code></td><td>${badge(labels[row.action]||row.action)}</td><td><code>${esc(row.applicationId||row.transactionId||row.targetUserId||'—')}</code></td><td>${esc(row.reason||'—')}</td></tr>`).join('')||`<tr><td colspan="5">${empty('Sin acciones con este filtro','Las decisiones registradas por el servidor aparecerán aquí.','history')}</td></tr>`}</tbody></table></div><footer class="cc-footnote">El servidor entrega hasta 500 acciones recientes. Este registro no representa todavía una auditoría completa de todos los módulos.</footer></section></div>`;
    container.querySelector('form').onsubmit=e=>{e.preventDefault();const form=new FormData(e.currentTarget);query=String(form.get('q')||'');action=String(form.get('action'));draw();};
  };draw();
}

export async function renderTeam(container) {
  const data=await readWorkspace(container,'Consultando equipo administrativo…','/users?role=admin&limit=100');
  if(!data){container.querySelector('[data-retry]')?.addEventListener('click',()=>renderTeam(container));return;}
  let people=[...(data.items||[])];
  let query='';

  // Default mock team roles mapping if user has no assigned role title
  const memberRoles = {
    'SUPER_ADMIN': 'Superadministrador',
    'OPS_OPERATOR': 'Operaciones',
    'DOC_REVIEWER': 'Revisión de Expedientes',
    'SUPPORT_AGENT': 'Atención al Cliente',
    'FINANCE_OFFICER': 'Finanzas'
  };

  const openInviteModal=()=>{
    const {overlay,close}=mountDialog(container,`
      <header class="cc-command-search" style="border-bottom:1px solid var(--cc-line);padding:18px 20px;">
        <div>
          <h3 style="margin:0;font-size:16px;">Invitar nuevo miembro al equipo</h3>
          <small style="color:var(--cc-muted);font-size:11px;">Configura los datos personales y el rol operativo de acceso.</small>
        </div>
        <button data-dialog-close style="border:1px solid var(--cc-line);background:none;color:var(--cc-muted);border-radius:4px;padding:4px 8px;font-size:11px;">Esc</button>
      </header>
      <form style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <label class="cc-field">Nombre<input required name="firstName" placeholder="Ej.: María"></label>
          <label class="cc-field">Apellido<input required name="lastName" placeholder="Ej.: Morales"></label>
        </div>
        <label class="cc-field">Correo corporativo<input required type="email" name="email" placeholder="usuario@58express.com"></label>
        <label class="cc-field">Rol asignado
          <select name="role">
            <option value="Superadministrador">Superadministrador (Acceso total)</option>
            <option value="Operaciones">Operaciones (Operaciones de flota)</option>
            <option value="Revisión de Expedientes" selected>Revisión de Expedientes (Verificador documental)</option>
            <option value="Finanzas">Finanzas (Oficial de finanzas y pagos)</option>
            <option value="Atención al Cliente">Atención al Cliente (Agente de soporte)</option>
            <option value="Comercial y Marketing">Comercial y Marketing (Banners y aliados)</option>
          </select>
        </label>
        <label class="cc-field">Notas o turno asignado<textarea name="notes" rows="2" placeholder="Ej.: Verificación documental turno mañana."></textarea></label>
        <footer style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
          <button type="button" class="cc-button" data-dialog-close>Cancelar</button>
          <button type="submit" class="cc-button primary" disabled title="Integración pendiente: no envía invitaciones">${icon('check',14)} Enviar invitación</button>
        </footer>
      </form>
    `,'Invitar miembro al equipo');

    overlay.querySelector('form').onsubmit=e=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      const name=`${fd.get('firstName')} ${fd.get('lastName')}`.trim();
      const newMember = {
        id: `adm_${Date.now()}`,
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        email: fd.get('email'),
        roleTitle: fd.get('role'),
        status: 'active',
        createdAt: new Date().toISOString()
      };
      people.unshift(newMember);
      close();
      const toastEl=document.createElement('div');
      toastEl.className='cc-gap';
      toastEl.style.cssText='position:fixed;bottom:24px;right:24px;z-index:20000;max-width:400px;box-shadow:0 10px 30px #0008;';
      toastEl.innerHTML=`${icon('info',16)}<div><strong>Invitación preparada en sesión</strong><p>Invitación registrada para ${esc(name)} como ${esc(newMember.roleTitle)}.</p></div>`;
      document.body.appendChild(toastEl);
      setTimeout(()=>toastEl.remove(),4500);
      draw();
    };
  };

  const openChangeRoleModal=(person)=>{
    const currentTitle = person.roleTitle || 'Superadministrador';
    const {overlay,close}=mountDialog(container,`
      <header class="cc-command-search" style="border-bottom:1px solid var(--cc-line);padding:18px 20px;">
        <div>
          <span class="cc-eyebrow">Asignación RBAC</span>
          <h3 style="margin:0;font-size:16px;">Cambiar rol de ${esc(person.firstName||person.id)}</h3>
        </div>
        <button data-dialog-close style="border:1px solid var(--cc-line);background:none;color:var(--cc-muted);border-radius:4px;padding:4px 8px;font-size:11px;">Esc</button>
      </header>
      <form style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <label class="cc-field">Rol asignado
          <select name="newRole">
            <option value="Superadministrador" ${currentTitle==='Superadministrador'?'selected':''}>Superadministrador (Acceso total)</option>
            <option value="Operaciones" ${currentTitle==='Operaciones'?'selected':''}>Operaciones (Tráfico y flota)</option>
            <option value="Revisión de Expedientes" ${currentTitle==='Revisión de Expedientes'?'selected':''}>Revisión de Expedientes (Verificador documental)</option>
            <option value="Finanzas" ${currentTitle==='Finanzas'?'selected':''}>Finanzas (Oficial de finanzas)</option>
            <option value="Atención al Cliente" ${currentTitle==='Atención al Cliente'?'selected':''}>Atención al Cliente (Atención y tickets)</option>
            <option value="Comercial y Marketing" ${currentTitle==='Comercial y Marketing'?'selected':''}>Comercial y Marketing (Campañas y aliados)</option>
            <option value="Personalizado" ${currentTitle==='Personalizado'?'selected':''}>Personalizado (Permisos específicos)</option>
          </select>
        </label>
        <footer style="display:flex;justify-content:flex-end;gap:10px;margin-top:10px;">
          <button type="button" class="cc-button" data-dialog-close>Cancelar</button>
          <button type="submit" class="cc-button primary">${icon('check',14)} Actualizar rol</button>
        </footer>
      </form>
    `,'Cambiar rol');

    overlay.querySelector('form').onsubmit=e=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      person.roleTitle=String(fd.get('newRole'));
      close();
      draw();
    };
  };

  const toggleSuspendMember=(person)=>{
    const isSuspended = person.status === 'suspended';
    const actionLabel = isSuspended ? 'Reactivar' : 'Suspender';
    if(window.confirm(`¿Confirmas que deseas ${actionLabel.toLowerCase()} el acceso administrativo de ${person.firstName||person.id}?`)){
      person.status = isSuspended ? 'active' : 'suspended';
      draw();
    }
  };

  const draw=()=>{
    const visible=people.filter(p=>`${p.firstName||''} ${p.lastName||''} ${p.email||''} ${p.id}`.toLowerCase().includes(query.toLowerCase()));
    container.innerHTML=`<div>
      ${pageHeader('Administración','Equipo Administrativo','Gestión de colaboradores con credenciales de acceso al Control Center.', `<button class="cc-button primary" id="btn-invite-admin">${icon('plus',14)} + Invitar miembro</button>`)}
      <section class="cc-metric-strip">
        ${metric('Administradores',data.total??people.length,'Cuentas registradas')}
        ${metric('Sesión actual','Activa','Administrador vigente','success')}
        ${metric('Integración','Parcial','Consulta conectada; gestión pendiente')}
        ${metric('Gobernanza','Rol admin','Autorización vigente del servidor')}
      </section>
      <section class="cc-panel">
        <header>
          <div>
            <h2>Cuentas del equipo administrativo (${visible.length})</h2>
            <p>Acceso y credenciales operativas del panel</p>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <label class="cc-filter-bar" style="margin-bottom:0;padding:0;">
              <span style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--cc-line);background:var(--cc-bg);border-radius:6px;">
                ${icon('search',14)}
                <input id="team-search" value="${esc(query)}" placeholder="Buscar por nombre o correo" style="border:0;background:none;color:var(--cc-text);outline:none;font-size:11px;min-width:180px;">
              </span>
            </label>
            <span>${visible.length} de ${people.length}</span>
          </div>
        </header>
        <div class="cc-table-scroll">
          <table class="cc-table">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último acceso / Registro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>${visible.map(p=>`<tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="width:32px;height:32px;display:grid;place-items:center;border-radius:6px;background:var(--cc-raised);border:1px solid var(--cc-line);font-size:12px;font-weight:600;color:var(--cc-accent);">${esc((p.firstName?.[0]||'A').toUpperCase())}</span>
                  <div>
                    <strong>${esc(`${p.firstName||''} ${p.lastName||''}`.trim()||p.id)}</strong>
                    <small>ID: ${esc(p.id)}</small>
                  </div>
                </div>
              </td>
              <td>${esc(p.email||'—')}</td>
              <td><span class="cc-badge info">${esc(p.role || 'No disponible')}</span></td>
              <td><span class="cc-badge ${p.status === 'suspended' ? 'danger' : 'success'}">${p.status === 'suspended' ? 'Suspendido' : 'Activo'}</span></td>
              <td><small>${date(p.lastLogin || p.createdAt)}</small></td>
              <td>
                <div style="display:flex;gap:6px;">
                  <button class="cc-button" disabled data-change-role="${p.id}" title="Integración pendiente: no modifica permisos">${icon('edit',14)} Cambiar rol</button>
                  <button class="cc-button" disabled data-suspend-member="${p.id}" title="Integración pendiente: no modifica acceso">
                    ${icon(p.status==='suspended'?'check':'lock',14)} ${p.status==='suspended'?'Reactivar':'Suspender'}
                  </button>
                </div>
              </td>
            </tr>`).join('')||`<tr><td colspan="6">${empty('No se encontraron administradores','Prueba con otro término de búsqueda.','users')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;

    container.querySelector('#btn-invite-admin')?.addEventListener('click',openInviteModal);
    const searchInput=container.querySelector('#team-search');
    if(searchInput){
      searchInput.oninput=e=>{query=e.target.value;draw();};
    }

    container.querySelectorAll('[data-change-role]').forEach(btn => {
      btn.onclick = () => {
        const found = people.find(p => p.id === btn.dataset.changeRole);
        if (found) openChangeRoleModal(found);
      };
    });

    container.querySelectorAll('[data-suspend-member]').forEach(btn => {
      btn.onclick = () => {
        const found = people.find(p => p.id === btn.dataset.suspendMember);
        if (found) toggleSuspendMember(found);
      };
    });
  };
  draw();
}

export async function renderTrips(container) {
  let page=1, status='all', query='', generation=0;
  const load=async()=>{
    const current=++generation;
    const endpoint=`/trips?limit=25&page=${page}${status==='all'?'':`&status=${status}`}`;
    const data=await readWorkspace(container,'Consultando viajes…',endpoint);
    if(current!==generation)return;
    if(!data){container.querySelector('[data-retry]')?.addEventListener('click',load);return;}
    const items=(data.items||[]).filter(t=>`${t.id} ${t.pickup?.address||''} ${t.destination?.address||''}`.toLowerCase().includes(query.toLowerCase()));
    container.innerHTML=`<div>${pageHeader('Operación','Viajes','Explora servicios y estados registrados por la plataforma.')}<form class="cc-filter-bar"><label>${icon('search',16)}<input name="q" placeholder="Buscar en esta página" value="${esc(query)}" aria-label="Buscar viajes en esta página"></label><select name="status" aria-label="Estado de viaje">${[['all','Todos los estados'],['active','En curso'],['completed','Completados'],['cancelled','Cancelados']].map(([v,l])=>`<option value="${v}" ${v===status?'selected':''}>${l}</option>`).join('')}</select><button class="cc-button">Aplicar</button></form><section class="cc-panel"><div class="cc-table-scroll"><table class="cc-table"><thead><tr><th>Viaje</th><th>Ruta</th><th>Estado</th><th>Tarifa</th><th>Registro</th></tr></thead><tbody>${items.map(t=>`<tr><td><code>${esc(t.id)}</code></td><td><strong>${esc(t.pickup?.address||'Origen no disponible')}</strong><small>${esc(t.destination?.address||'Destino no disponible')}</small></td><td>${badge(t.status)}</td><td>${money(t.fareUSD??t.pricing?.fareUSD)}</td><td>${date(t.createdAt)}</td></tr>`).join('')||`<tr><td colspan="5">${empty('No hay viajes con este filtro','Los servicios aparecerán cuando se registren.','navigation')}</td></tr>`}</tbody></table></div><footer class="cc-pagination"><span>Página ${data.page||page} · ${data.total||0} registros</span><button class="cc-button" data-prev ${page<=1?'disabled':''}>Anterior</button><button class="cc-button" data-next ${page>=(data.totalPages||1)?'disabled':''}>Siguiente</button></footer></section></div>`;
    container.querySelector('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);status=String(f.get('status'));query=String(f.get('q'));page=1;load();};
    container.querySelector('[data-prev]').onclick=()=>{page--;load();};container.querySelector('[data-next]').onclick=()=>{page++;load();};
  };await load();
}

export async function renderSystem(container) {
  const health=await readWorkspace(container,'Comprobando disponibilidad…','/health');
  if(!health){container.querySelector('[data-retry]')?.addEventListener('click',()=>renderSystem(container));return;}
  container.innerHTML=`<div>${pageHeader('Administración','Sistema','Disponibilidad de los servicios y capacidades del Control Center.')}<section class="cc-metric-strip">${metric('API','Disponible','Consulta de salud correcta','success')}${metric('Entorno',location.hostname==='localhost'||location.hostname==='127.0.0.1'?'Local':'Servidor','Instancia actual')}${metric('Autorización','Servidor','Rol administrativo vigente')}</section><section class="cc-panel"><header><h2>Capacidades del producto</h2><span>Estado de integración</span></header><div class="cc-capabilities">${[['Operación y flota','Conectado'],['Expedientes y documentos','Conectado'],['Finanzas y recargas','Conectado'],['Auditoría administrativa','Conectado · alcance parcial'],['Publicidad y aliados','Editor disponible · backend pendiente'],['Roles delegados e invitaciones','Diseño disponible · backend pendiente'],['Búsqueda global de entidades','Pendiente · búsqueda de secciones disponible'],['Soporte: asignación, prioridad y estado compartido','Pendiente · conversaciones conectadas']].map(([label,state])=>`<div><strong>${label}</strong>${badge(state)}</div>`).join('')}</div></section></div>`;
  const root=container.firstElementChild;
  root.classList.add('cc-system-page');
  const capabilities=root.querySelector('.cc-panel');
  const layout=document.createElement('div');
  layout.className='cc-system-layout';
  root.append(layout);
  layout.append(capabilities);
  capabilities.querySelectorAll('.cc-capabilities > div').forEach((cell,index)=>{
    cell.classList.add('cc-capability',index<3?'connected':index===3||index===7?'partial':'pending');
  });
  const rail=document.createElement('aside');
  rail.className='cc-system-rail';
  rail.setAttribute('aria-label','Contexto técnico');
  rail.innerHTML=`<section class="cc-panel"><header><h2>Contexto de la instancia</h2></header><dl class="cc-technical"><div><dt>API URL</dt><dd>${esc(apiService.baseUrl)}</dd></div><div><dt>Comprobación de API</dt><dd>${esc(new Date().toLocaleTimeString('es-VE'))} · puntual</dd></div><div><dt>Build / versión del servidor</dt><dd>No disponible</dd></div><div><dt>Salud de realtime y media</dt><dd>No disponible · sin diagnóstico independiente</dd></div></dl></section><section class="cc-panel"><header><h2>Continuar trabajando</h2></header><div class="cc-system-shortcuts">${[['applications','Revisar solicitudes'],['ads','Preparar publicidad'],['roles','Diseñar permisos'],['audit','Consultar auditoría']].map(([id,label])=>`<button class="cc-button" data-system-nav="${id}">${label} ${icon('arrowRight',16)}</button>`).join('')}</div></section><section class="cc-panel"><header><h2>Actividad administrativa</h2><span>Últimas acciones registradas</span></header><div data-system-activity>${loading('Consultando registro…')}</div></section>`;
  layout.append(rail);
  rail.querySelectorAll('[data-system-nav]').forEach(button=>button.onclick=()=>container.closest('.cc-app')?.querySelector(`[data-target="${button.dataset.systemNav}"]`)?.click());
  const activity=await apiService.request('/admin/actions');
  if(!root.isConnected)return;
  const target=rail.querySelector('[data-system-activity]');
  target.innerHTML=Array.isArray(activity)&&activity.length?`<ol class="cc-system-timeline">${activity.slice(0,5).map(row=>`<li><strong>${esc(row.action||'Acción registrada')}</strong><small>${date(row.createdAt)}</small><span>Admin: ${esc(row.adminId||'No disponible')}</span></li>`).join('')}</ol><p class="cc-footnote">Alcance parcial: decisiones registradas por el servidor.</p>`:empty(Array.isArray(activity)?'Aún no hay actividad registrada':'Actividad no disponible',Array.isArray(activity)?'El registro cubre decisiones administrativas, no todos los módulos.':'No fue posible consultar el registro.','history');
}
