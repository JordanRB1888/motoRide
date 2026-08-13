import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';
import { createPrivateDocumentViewer } from './privateDocumentViewer.js';

/**
 * Los eventos de Socket.IO vuelven a montar esta pantalla sobre el mismo
 * contenedor. Sin registro, cada remontaje abandonaría las Blob URLs y los
 * controladores de la instancia anterior, que ya nadie podría revocar.
 */
const instances = new WeakMap();
const liveViewers = new Set();
let unloadHooked = false;

function hookUnloadOnce() {
  if (unloadHooked || typeof window === 'undefined') return;
  unloadHooked = true;
  // Abandonar la aplicación administrativa libera cuanto quedara abierto.
  window.addEventListener('pagehide', () => { liveViewers.forEach(viewer => viewer.destroy()); });
}

/** Destruye la instancia montada sobre un contenedor, si la hubiera. */
export function disposeDriverApplicationsManagement(container) {
  const previous = instances.get(container);
  if (!previous) return;
  instances.delete(container);
  previous.destroy();
}

const STATUS = { draft:'Incompleta', pending:'Pendiente', approved:'Aprobada', rejected:'Rechazada', needs_changes:'Requiere cambios', suspended:'Suspendida' };
const DOCS = { identity_front:'Cédula (frente)',identity_back:'Cédula (reverso)',driver_license:'Licencia de conducir',vehicle_registration:'Registro del vehículo',vehicle_insurance:'Seguro del vehículo',vehicle_photo:'Foto del vehículo',plate_photo:'Foto de la placa',driver_selfie:'Selfie del conductor' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderDriverApplicationsManagement(container) {
  // Un remontaje sustituye a la instancia previa: primero se cierra la vieja.
  disposeDriverApplicationsManagement(container);
  hookUnloadOnce();

  let status = 'pending';
  let query = '';
  let data = { applications: [], counts: {} };
  let selected = null;

  const viewer = createPrivateDocumentViewer({
    loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint),
    onError: () => showToast('No se pudo abrir el documento protegido.', 'error')
  });
  liveViewers.add(viewer);
  const instance = {
    destroy() {
      liveViewers.delete(viewer);
      viewer.destroy();
    }
  };
  instances.set(container, instance);

  const closeDetail = () => {
    selected = null;
    // Salir del expediente revoca lo que se hubiera abierto en él.
    viewer.releaseAll();
    render();
  };

  const load = async () => {
    container.innerHTML = '<div class="admin-loading">Consultando solicitudes reales…</div>';
    const result = await apiService.get(`/admin/driver-applications?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`);
    if (!result) return container.innerHTML = '<div class="admin-empty">No fue posible cargar las solicitudes.</div>';
    data = result; render();
  };

  const openDetail = async id => {
    // Cambiar de expediente invalida las Blob URLs del anterior antes de pedir
    // nada nuevo, aunque la petición del detalle acabe fallando.
    viewer.releaseAll();
    const detail = await apiService.get(`/admin/driver-applications/${id}`);
    if (!detail) return showToast('No se pudo abrir el expediente.', 'error');
    selected = detail;
    render();
    // Abrir el expediente solo trae metadatos: los botones quedan preparados,
    // pero el contenido protegido no se pide hasta que alguien los pulse.
    container.querySelectorAll('[data-private-document]').forEach(element => viewer.attach(element));
  };

  const decide = async action => {
    let reason = '';
    if (action !== 'approve' && action !== 'reactivate') {
      reason = window.prompt(action === 'needs_changes' ? 'Indica claramente qué debe corregir el solicitante:' : 'Escribe la razón administrativa:')?.trim() || '';
      if (!reason) return;
    }
    const requestedChanges = action === 'needs_changes'
      ? [...container.querySelectorAll('[data-doc-change]:checked')].map(input => input.value)
      : [];
    const result = await apiService.patch(`/admin/driver-applications/${selected.id}/decision`, { action, reason, requestedChanges });
    if (!result) return showToast(apiService.lastError?.error === 'MISSING_DOCUMENTS' ? 'Faltan documentos obligatorios.' : 'No se pudo registrar la decisión.', 'error');
    showToast('Decisión guardada y usuario notificado.', 'success');
    selected = null; await load();
  };

  const render = () => {
    // Cualquier repintado desconecta los botones anteriores: sus URLs mueren aquí.
    viewer.releaseAll();
    const apps = data.applications || [];
    container.innerHTML = `<div class="driver-admin-page">
      <header class="driver-admin-heading"><div><span class="eyebrow"><i></i> VERIFICACIÓN OPERATIVA</span><h1>Solicitudes de conductores</h1><p>Identidad, vehículo y documentos protegidos en un solo expediente.</p></div><b>${Number(data.counts?.pending || 0)} pendientes</b></header>
      <section class="driver-admin-toolbar">
        <div class="driver-admin-filters">${['pending','approved','rejected','needs_changes','suspended','all'].map(item=>`<button data-filter="${item}" class="${status===item?'active':''}">${item==='all'?'Todas':STATUS[item]} <em>${item==='all'?'':Number(data.counts?.[item]||0)}</em></button>`).join('')}</div>
        <form id="driver-application-search"><span>${icon('search',16)}</span><input value="${escape(query)}" placeholder="Nombre, cédula, teléfono, correo o placa"><button>Buscar</button></form>
      </section>
      <section class="driver-admin-table-card"><div class="ops-table-wrap"><table class="data-table"><thead><tr><th>Solicitante</th><th>Vehículo</th><th>Documentos</th><th>Enviada</th><th>Estado</th><th></th></tr></thead><tbody>${apps.map(app=>`<tr><td><div class="applicant-cell"><span>${escape(app.applicantName?.[0]||'C')}</span><div><strong>${escape(app.applicantName)}</strong><small>${escape(app.id.slice(-8).toUpperCase())}</small></div></div></td><td><strong>${app.vehicleType==='CAR'?'Automóvil':'Moto'}</strong><small class="table-subline">${escape(app.vehiclePlate)}</small></td><td><strong>${app.documentCount} archivo${app.documentCount===1?'':'s'}</strong><small class="table-subline">${app.documentsPendingCount?app.documentsPendingCount+' por revisar':'todos revisados'}</small></td><td>${new Date(app.submittedAt||app.createdAt).toLocaleDateString('es-VE')}</td><td><span class="application-status-badge ${app.status}">${STATUS[app.status]}</span></td><td><button class="review-application" data-review="${app.id}">${icon('eye',15)} Revisar</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">No hay solicitudes con este filtro.</td></tr>'}</tbody></table></div></section>
      ${selected ? detailTemplate(selected) : ''}
    </div>`;
    container.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { status=button.dataset.filter; selected=null; load(); });
    container.querySelector('#driver-application-search').onsubmit = event => { event.preventDefault(); query=event.currentTarget.querySelector('input').value.trim(); selected=null; load(); };
    container.querySelectorAll('[data-review]').forEach(button => button.onclick = () => openDetail(button.dataset.review));
    container.querySelector('[data-close-application]')?.addEventListener('click',closeDetail);
    container.querySelectorAll('[data-decision]').forEach(button=>button.onclick=()=>decide(button.dataset.decision));
  };

  const detailTemplate = app => `<div class="application-review-backdrop"><article class="application-review-panel">
    <header><div><small>EXPEDIENTE ${escape(app.id.slice(-8).toUpperCase())}</small><h2>${escape(app.personal.firstName)} ${escape(app.personal.lastName)}</h2><span class="application-status-badge ${app.status}">${STATUS[app.status]}</span></div><button data-close-application>${icon('close',20)}</button></header>
    <div class="application-review-scroll"><section><h3>Información personal</h3><div class="review-data-grid">${[['Cédula',app.personal.identityNumber],['Nacimiento',app.personal.birthDate],['Teléfono',app.personal.phone],['Correo',app.personal.email],['Dirección',app.personal.address],['Ciudad / región',`${app.personal.city}, ${app.personal.region}`]].map(([a,b])=>`<label><small>${a}</small><strong>${escape(b)}</strong></label>`).join('')}</div></section>
    <section><h3>Vehículo</h3><div class="review-data-grid">${[['Tipo',app.vehicle.type],['Marca / modelo',`${app.vehicle.brand} ${app.vehicle.model}`],['Año',app.vehicle.year],['Color',app.vehicle.color],['Placa',app.vehicle.plate],['Información adicional',app.vehicle.additionalInfo||'—']].map(([a,b])=>`<label><small>${a}</small><strong>${escape(b)}</strong></label>`).join('')}</div></section>
    <section><h3>Documentos privados</h3><p class="security-note">${icon('shield',15)} Solo administradores autorizados y el propietario pueden abrir estos archivos.</p><div class="private-documents-grid">${app.documents.map(doc=>`<label class="private-document-card"><input type="checkbox" data-doc-change value="${doc.type}"><button type="button" class="private-document-open" data-private-document="${escape(doc.id)}" data-mime="${escape(doc.mimeType)}">Ver documento protegido</button><span>${escape(DOCS[doc.type]||doc.type)}</span><small>${Math.round(doc.size/1024)} KB · ${escape(doc.status)}</small></label>`).join('')}</div></section>
    ${app.decisionReason?`<section class="previous-decision"><h3>Última observación</h3><p>${escape(app.decisionReason)}</p></section>`:''}</div>
    <footer>${app.status==='suspended'?`<button class="approve" data-decision="reactivate">Reactivar conductor</button>`:`<button class="approve" data-decision="approve">${icon('check',16)} Aprobar conductor</button><button class="changes" data-decision="needs_changes">Solicitar cambios</button><button class="reject" data-decision="reject">Rechazar</button>${app.status==='approved'?'<button class="reject" data-decision="suspend">Suspender</button>':''}`}</footer>
  </article></div>`;

  load();
}
