import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { showToast } from '../../components/toast.js';
import { createPrivateDocumentViewer } from './privateDocumentViewer.js';

/**
 * Cuánto ocupa y, si es un vídeo, cuánto dura.
 *
 * «51200 KB» no le dice nada a nadie: por encima del mega se cuenta en megas.
 * La duración llega con los metadatos, así que se sabe sin descargar nada.
 */
const describirPeso = doc => {
  const kb = Math.round((doc.size || 0) / 1024);
  const peso = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  return typeof doc.durationSeconds === 'number' && doc.durationSeconds > 0
    ? `${peso} · ${Math.round(doc.durationSeconds)} s`
    : peso;
};

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
  // Un único listener para toda la vida del módulo: remontar el panel no puede
  // acumular manejadores globales duplicados.
  window.addEventListener('pagehide', disposeAllPrivateDocumentViewers);
}

/** Destruye la instancia montada sobre un contenedor, si la hubiera. */
export function disposeDriverApplicationsManagement(container) {
  const previous = instances.get(container);
  if (!previous) return;
  instances.delete(container);
  previous.destroy();
}

/**
 * Cierre incondicional, sin necesidad de conocer el contenedor. El enrutador
 * vacía #app al cambiar de ruta, así que ni el logout ni una navegación por
 * hash pasan por `disposeDriverApplicationsManagement`: este es su punto único.
 */
export function disposeAllPrivateDocumentViewers() {
  for (const viewer of [...liveViewers]) viewer.destroy();
  liveViewers.clear();
}

const STATUS = {
  draft: 'Incompleta',
  pending: 'Pendiente',
  in_review: 'En revisión',
  needs_changes: 'Requiere cambios',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  suspended: 'Suspendida'
};
const DOCS = { identity_front:'Cédula (frente)',identity_back:'Cédula (reverso)',rif:'RIF',driver_license:'Licencia de conducir',medical_certificate:'Certificado médico',vehicle_registration:'Documento legal del vehículo',vehicle_insurance:'Seguro del vehículo (RCV)',vehicle_photo:'Foto del vehículo',vehicle_front:'Vehículo (frente)',vehicle_rear:'Vehículo (atrás)',plate_photo:'Foto de la placa',driver_selfie:'Selfie del conductor',moto_helmets:'Cascos disponibles',car_rear_interior:'Interior trasero del carro',presentation_video:'Vídeo de presentación' };
const SERVICES = { PASSENGER_TRANSPORT:'Personas', DELIVERY:'Delivery' };
const LEGAL_DOCS = { CIRCULATION_CARD:'Carnet de circulación', OWNERSHIP_TITLE:'Título de propiedad', ORIGIN_CERTIFICATE:'Certificado de origen' };
const FILTER_TABS = [
  ['pending', 'Pendientes'],
  ['in_review', 'En revisión'],
  ['needs_changes', 'Requieren cambios'],
  ['approved', 'Aprobadas'],
  ['rejected', 'Rechazadas'],
  ['all', 'Todas']
];
const servicesLabel = list => (Array.isArray(list) && list.length ? list.map(item => SERVICES[item] || item).join(' · ') : '—');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderDriverApplicationsManagement(container) {
  disposeDriverApplicationsManagement(container);
  hookUnloadOnce();

  const viewer = createPrivateDocumentViewer({
    loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint),
    onError: () => showToast('No se pudo abrir el documento protegido.', 'error')
  });
  liveViewers.add(viewer);

  let status = 'pending';
  let query = '';
  let data = { applications: [], counts: {} };
  let selected = null;
  let disposed = false;
  let requestGeneration = 0;
  let sort = 'newest';
  let currentDocIndex = 0;
  let currentZoom = 1.0;
  let currentRotation = 0;
  const instance = {
    destroy() {
      disposed = true;
      requestGeneration++;
      liveViewers.delete(viewer);
      viewer.destroy();
    }
  };
  instances.set(container, instance);

  const closeDetail = () => {
    selected = null;
    currentDocIndex = 0;
    currentZoom = 1.0;
    currentRotation = 0;
    // Salir del expediente revoca lo que se hubiera abierto en él.
    viewer.releaseAll();
    render();
  };

  const load = async () => {
    const generation = ++requestGeneration;
    container.innerHTML = '<div class="admin-loading" role="status">Consultando solicitudes reales…</div>';
    const result = await apiService.get(`/admin/driver-applications?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`);
    if(disposed || generation !== requestGeneration)return;
    if (!result) return container.innerHTML = '<div class="admin-empty">No fue posible cargar las solicitudes.</div>';
    data = result; render();
  };

  const applyZoomAndRotation = () => {
    const activeMedia = container.querySelectorAll('.private-document-card img, .private-document-card video');
    activeMedia.forEach(el => {
      el.style.transform = `scale(${currentZoom}) rotate(${currentRotation}deg)`;
      el.style.transition = 'transform 180ms ease';
    });
    const zoomLevelEl = container.querySelector('#cc-zoom-indicator');
    if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(currentZoom * 100)}%`;
  };

  const scrollToDoc = (index) => {
    const cards = container.querySelectorAll('.private-document-card');
    if (!cards.length) return;
    const clampedIndex = Math.max(0, Math.min(index, cards.length - 1));
    currentDocIndex = clampedIndex;
    cards.forEach((card, idx) => {
      card.classList.toggle('active-inspection', idx === clampedIndex);
    });
    cards[clampedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const counterEl = container.querySelector('#cc-doc-nav-counter');
    if (counterEl) counterEl.textContent = `${clampedIndex + 1} / ${cards.length}`;
  };

  const openDetail = async id => {
    // Cambiar de expediente invalida las Blob URLs del anterior antes de pedir
    // nada nuevo, aunque la petición del detalle acabe fallando.
    viewer.releaseAll();
    currentDocIndex = 0;
    currentZoom = 1.0;
    currentRotation = 0;
    const generation = ++requestGeneration;
    const detail = await apiService.get(`/admin/driver-applications/${id}`);
    if(disposed || generation !== requestGeneration)return;
    if (!detail) return showToast('No se pudo abrir el expediente.', 'error');
    selected = detail;
    render();
    // Abrir el expediente solo trae metadatos: los botones quedan preparados,
    // pero el contenido protegido no se pide hasta que alguien los pulse.
    container.querySelectorAll('[data-private-document]').forEach(element => viewer.attach(element));
  };

  const decide = async action => {
    let reason = '';
    const checkedChanges = [...container.querySelectorAll('[data-doc-change]:checked')].map(input => {
      const docKey = input.value;
      const reasonSelect = container.querySelector(`[data-doc-reason="${docKey}"]`);
      const specificReason = reasonSelect ? reasonSelect.value.trim() : '';
      return specificReason ? `${docKey}:${specificReason}` : docKey;
    });

    if (action !== 'approve' && action !== 'reactivate') {
      const defaultPrompt = action === 'needs_changes'
        ? 'Indica claramente qué debe corregir el solicitante:'
        : 'Escribe la razón administrativa obligatoria para el rechazo:';
      reason = window.prompt(defaultPrompt)?.trim() || '';
      if (!reason) return;
    }

    const requestedChanges = action === 'needs_changes' ? checkedChanges : [];
    const result = await apiService.patch(`/admin/driver-applications/${selected.id}/decision`, { action, reason, requestedChanges });
    if (!result) return showToast(apiService.lastError?.error === 'MISSING_DOCUMENTS' ? 'Faltan documentos obligatorios.' : 'No se pudo registrar la decisión.', 'error');
    showToast('Decisión guardada y usuario notificado.', 'success');
    selected = null; await load();
  };

  const render = () => {
    // Cualquier repintado desconecta los botones anteriores: sus URLs mueren aquí.
    viewer.releaseAll();
    const apps = [...(data.applications || [])].sort((a,b)=>(new Date(b.submittedAt||b.createdAt)-new Date(a.submittedAt||a.createdAt))*(sort==='oldest'?-1:1));
    container.innerHTML = `<div class="driver-admin-page">
      <header class="driver-admin-heading"><div><span class="eyebrow"><i></i> VERIFICACIÓN OPERATIVA</span><h1>Solicitudes de conductores</h1><p>Identidad, vehículo y documentos protegidos en un solo expediente.</p></div><b>${Number(data.counts?.pending || 0)} pendientes</b></header>
      <section class="driver-admin-toolbar">
        <div class="driver-admin-filters">${FILTER_TABS.map(([itemKey, itemLabel])=>`<button data-filter="${itemKey}" class="${status===itemKey?'active':''}">${itemLabel} <em>${itemKey==='all'?'':Number(data.counts?.[itemKey]||0)}</em></button>`).join('')}</div>
        <form id="driver-application-search"><span>${icon('search',16)}</span><input value="${escape(query)}" placeholder="Nombre, cédula, teléfono, correo o placa"><button>Buscar</button></form>
      </section>
      <div class="cc-review-list-tools"><span>Cola de revisión documental</span><select id="application-sort" aria-label="Ordenar solicitudes"><option value="newest" ${sort==='newest'?'selected':''}>Más recientes</option><option value="oldest" ${sort==='oldest'?'selected':''}>Más antiguas primero</option></select></div><section class="driver-admin-table-card"><div class="ops-table-wrap"><table class="data-table"><thead><tr><th>Solicitante</th><th>Vehículo</th><th>Documentos</th><th>Enviada</th><th>Estado</th><th></th></tr></thead><tbody>${apps.map(app=>`<tr><td><div class="applicant-cell"><span>${escape(app.applicantName?.[0]||'C')}</span><div><strong>${escape(app.applicantName)}</strong><small>${escape(app.id.slice(-8).toUpperCase())}</small></div></div></td><td><div class="cc-vehicle-cell"><strong>${app.vehicleType==='CAR'?'Automóvil':'Moto'}</strong><span class="cc-badge ${app.vehicleType==='CAR'?'info':'warning'}">${app.vehicleType==='CAR'?'CAR':'MOTO'}</span></div><small class="table-subline">${escape(app.vehiclePlate)}</small><small class="table-subline">${escape(servicesLabel(app.servicesAppliedFor))}</small></td><td><strong>${app.documentCount} / ${app.documentCount + (app.documentsPendingCount || 0)} completados</strong><small class="table-subline">${app.documentsPendingCount?app.documentsPendingCount+' por revisar':'todos revisados'}</small></td><td>${new Date(app.submittedAt||app.createdAt).toLocaleDateString('es-VE')}</td><td><span class="application-status-badge ${app.status}">${STATUS[app.status] || app.status}</span></td><td><button class="review-application" data-review="${app.id}">${icon('eye',14)} Revisar</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">No hay solicitudes con este filtro.</td></tr>'}</tbody></table></div></section>
      ${selected ? detailTemplate(selected) : ''}
    </div>`;
    container.querySelector('#application-sort').onchange = event => {sort=event.target.value;render();};
    container.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { status=button.dataset.filter; selected=null; load(); });
    container.querySelector('#driver-application-search').onsubmit = event => { event.preventDefault(); query=event.currentTarget.querySelector('input').value.trim(); selected=null; load(); };
    container.querySelectorAll('[data-review]').forEach(button => button.onclick = () => openDetail(button.dataset.review));
    container.querySelector('[data-close-application]')?.addEventListener('click',closeDetail);
    container.querySelectorAll('[data-decision]').forEach(button=>button.onclick=()=>decide(button.dataset.decision));

    // Visor Pro controls
    container.querySelector('#cc-zoom-in')?.addEventListener('click', () => {
      if (currentZoom < 2.5) {
        currentZoom += 0.25;
        applyZoomAndRotation();
      }
    });
    container.querySelector('#cc-zoom-out')?.addEventListener('click', () => {
      if (currentZoom > 0.5) {
        currentZoom -= 0.25;
        applyZoomAndRotation();
      }
    });
    container.querySelector('#cc-zoom-reset')?.addEventListener('click', () => {
      currentZoom = 1.0;
      currentRotation = 0;
      applyZoomAndRotation();
    });
    container.querySelector('#cc-rotate')?.addEventListener('click', () => {
      currentRotation = (currentRotation + 90) % 360;
      applyZoomAndRotation();
    });
    container.querySelector('#cc-doc-prev')?.addEventListener('click', () => {
      scrollToDoc(currentDocIndex - 1);
    });
    container.querySelector('#cc-doc-next')?.addEventListener('click', () => {
      scrollToDoc(currentDocIndex + 1);
    });
  };

  const detailTemplate = app => `<div class="application-review-backdrop"><article class="application-review-panel" role="dialog" aria-modal="true" aria-label="Revisión de expediente">
    <header class="cc-review-panel-header">
      <div class="cc-review-header-info">
        <div class="cc-review-header-badges">
          <small class="cc-badge">EXPEDIENTE ${escape(app.id.slice(-8).toUpperCase())}</small>
          <span class="application-status-badge ${app.status}">${STATUS[app.status] || app.status}</span>
          <span class="cc-badge ${app.vehicleType === 'CAR' ? 'info' : 'warning'}">${app.vehicleType === 'CAR' ? 'CAR · Auto' : 'MOTO'}</span>
        </div>
        <h2>${escape(app.personal.firstName)} ${escape(app.personal.lastName)}</h2>
        <span class="cc-review-subline">Enviada el ${new Date(app.submittedAt || app.createdAt).toLocaleDateString('es-VE', { dateStyle: 'long' })}</span>
      </div>
      <button class="cc-dialog-close-btn" aria-label="Cerrar expediente" data-close-application>${icon('close', 20)}</button>
    </header>

    <div class="application-review-scroll cc-review-grid">
      <!-- COLUMNA 1: IDENTIDAD Y VEHÍCULO -->
      <aside class="cc-review-identity">
        <section class="cc-review-block">
          <div class="cc-review-section-head">
            ${icon('users', 14)}
            <h3>Datos personales</h3>
          </div>
          <div class="review-data-grid">
            ${[
              ['Cédula de identidad', app.personal.identityNumber],
              ['RIF', app.personal?.rif || '—'],
              ['Fecha de nacimiento', app.personal.birthDate],
              ['Teléfono móvil', app.personal.phone],
              ['Correo electrónico', app.personal.email],
              ['Dirección de residencia', app.personal.address],
              ['Ciudad / Región', `${app.personal.city || 'Maracaibo'}, ${app.personal.region || 'Zulia'}`]
            ].map(([a, b]) => `<label class="cc-data-item"><small>${a}</small><strong>${escape(b)}</strong></label>`).join('')}
          </div>
        </section>

        <section class="cc-review-block">
          <div class="cc-review-section-head">
            ${icon('navigation', 14)}
            <h3>Vehículo y servicios</h3>
          </div>
          <div class="review-data-grid">
            ${[
              ['Tipo de unidad', app.vehicle.type === 'CAR' ? 'Automóvil particular (CAR)' : 'Motocicleta (MOTO)'],
              ['Servicios solicitados', servicesLabel(app.servicesAppliedFor)],
              ['Marca / Modelo', `${app.vehicle.brand} ${app.vehicle.model}`],
              ['Año', app.vehicle.year],
              ['Color', app.vehicle.color],
              ['Placa visible', app.vehicle.plate],
              ['Documento legal', LEGAL_DOCS[app.vehicle.legalDocumentType] || app.vehicle.legalDocumentType || '—'],
              ['Licencia de conducir', app.license?.grade ? `${app.license.grade}.º grado · vence ${app.license.expiration || '—'}` : '—'],
              ['Certificado médico', app.medicalCertificate?.expiration ? `Vence ${app.medicalCertificate.expiration}` : '—'],
              ['Información adicional', app.vehicle.additionalInfo || '—']
            ].map(([a, b]) => `<label class="cc-data-item"><small>${a}</small><strong>${escape(b)}</strong></label>`).join('')}
          </div>
        </section>
      </aside>

      <!-- COLUMNA 2: DOCUMENTOS PRIVADOS Y EVIDENCIA (VISOR PRO) -->
      <section class="cc-review-documents">
        <div class="cc-review-documents-header">
          <div>
            <h3>Documentación protegida (${app.documents.length} archivos)</h3>
            <p class="security-note">${icon('shield', 14)} Descarga cifrada bajo demanda con token administrativo. Las Blob URLs se revocarán al salir del expediente.</p>
          </div>
          <span class="cc-badge">${app.documentsPendingCount ? `${app.documentsPendingCount} pendientes de revisión` : 'Todos revisados'}</span>
        </div>

        <!-- Visor Pro Inspector Toolbar -->
        <div class="cc-visor-pro-bar">
          <div class="cc-visor-pro-nav">
            <button type="button" class="cc-button" id="cc-doc-prev" title="Documento anterior">${icon('arrowLeft', 14)} Anterior</button>
            <span id="cc-doc-nav-counter">1 / ${app.documents.length}</span>
            <button type="button" class="cc-button" id="cc-doc-next" title="Documento siguiente">Siguiente ${icon('arrowRight', 14)}</button>
          </div>
          <div class="cc-visor-pro-zoom">
            <button type="button" class="cc-button" id="cc-zoom-out" title="Reducir zoom">${icon('minus', 14)}</button>
            <span id="cc-zoom-indicator">100%</span>
            <button type="button" class="cc-button" id="cc-zoom-in" title="Aumentar zoom">${icon('plus', 14)}</button>
            <button type="button" class="cc-button" id="cc-zoom-reset" title="Restablecer">100%</button>
            <button type="button" class="cc-button" id="cc-rotate" title="Rotar 90°">${icon('refresh', 14)}</button>
          </div>
        </div>

        <div class="private-documents-grid">
          ${app.documents.map((doc, idx) => `
            <div class="private-document-card ${idx === 0 ? 'active-inspection' : ''}" data-doc-card-idx="${idx}">
              <div class="private-doc-header">
                <span class="private-doc-title">${escape(DOCS[doc.type] || doc.type)}</span>
                <span class="private-doc-meta">${describirPeso(doc)}</span>
              </div>
              <button type="button" class="private-document-open" data-private-document="${escape(doc.id)}" data-mime="${escape(doc.mimeType)}">Ver documento protegido</button>
              <div class="private-doc-footer">
                <label class="cc-doc-change-checkbox" title="Marcar para pedir corrección al solicitante">
                  <input type="checkbox" data-doc-change value="${doc.type}">
                  <span>Pedir corrección</span>
                </label>
                <select class="cc-doc-reason-select" data-doc-reason="${doc.type}" aria-label="Motivo para ${escape(DOCS[doc.type] || doc.type)}">
                  <option value="">Motivo...</option>
                  <option value="Documento ilegible o borroso">Ilegible / Borroso</option>
                  <option value="Documento vencido">Vencido</option>
                  <option value="Datos no coinciden">Datos no coinciden</option>
                  <option value="Bordes o esquinas cortadas">Bordes cortados</option>
                  <option value="Tipo de documento incorrecto">Tipo incorrecto</option>
                  <option value="Foto oscura o reflejos">Oscuro / Reflejos</option>
                </select>
                <span class="cc-badge ${doc.status === 'APPROVED' ? 'success' : doc.status === 'NEEDS_CHANGES' ? 'danger' : ''}">${escape(doc.status || 'Enviado')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- COLUMNA 3: DECISIÓN ADMINISTRATIVA -->
      <aside class="cc-review-decision">
        <div class="cc-review-decision-inner">
          <span class="cc-eyebrow">Consola de Decisión</span>
          <h3>Resolución del expediente</h3>
          <p class="cc-decision-note">Inspecciona cada documento. Si encuentras observaciones, marca las casillas de corrección correspondientes antes de solicitar cambios.</p>

          <div class="cc-decision-actions">
            ${app.status === 'suspended' ? `
              <button class="approve" data-decision="reactivate">${icon('check', 16)} Reactivar conductor</button>
            ` : `
              <button class="approve" data-decision="approve">${icon('check', 16)} Aprobar conductor</button>
              <button class="changes" data-decision="needs_changes">${icon('alertCircle', 16)} Solicitar cambios</button>
              <button class="reject" data-decision="reject">${icon('close', 16)} Rechazar solicitud</button>
              ${app.status === 'approved' ? `<button class="reject" data-decision="suspend">${icon('lock', 16)} Suspender conductor</button>` : ''}
            `}
          </div>

          ${app.decisionReason ? `
            <section class="previous-decision">
              <small class="cc-eyebrow">Última observación registrada</small>
              <p>${escape(app.decisionReason)}</p>
            </section>
          ` : ''}

          <div class="cc-decision-meta">
            <div class="cc-decision-meta-item">
              <span>Estado actual</span>
              <strong>${STATUS[app.status] || app.status}</strong>
            </div>
            <div class="cc-decision-meta-item">
              <span>Auditoría</span>
              <small>La resolución queda sellada con tu firma administrativa y notifica al usuario.</small>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <footer class="cc-review-footer">
      <span>${app.documents.length} archivos verificados en este expediente</span>
      <span>Control Center · Protección de datos personales</span>
    </footer>
  </article></div>`;

  load();
}
