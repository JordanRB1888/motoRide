import { apiService } from '../services/apiService.js';
import { authService } from '../services/authService.js';
import { showToast } from './toast.js';
import { icon } from '../utils/icons.js';

const LABELS = {
  draft: ['Incompleta', 'Termina los datos o documentos requeridos.', 'warning'],
  pending: ['En revisión', 'Tu solicitud está siendo revisada por el equipo de +58Express.', 'pending'],
  approved: ['Aprobada', '¡Felicidades! Ya puedes comenzar a trabajar con +58Express.', 'approved'],
  rejected: ['Rechazada', 'Revisa el motivo y corrige tu solicitud antes de reenviarla.', 'rejected'],
  needs_changes: ['Requiere cambios', 'Debes actualizar la información indicada por administración.', 'warning'],
  suspended: ['Suspendida', 'Contacta con administración para conocer los pasos necesarios.', 'rejected']
};
const DOC_LABELS = { identity_front:'Cédula frontal',identity_back:'Cédula posterior',driver_license:'Licencia',vehicle_registration:'Registro del vehículo',vehicle_insurance:'Seguro / RCV',vehicle_photo:'Foto del vehículo',plate_photo:'Foto de placa',driver_selfie:'Selfie' };

export function renderDriverApplicationStatus(container) {
  if (!container) return;
  let application = null;

  const load = async () => {
    container.innerHTML = '<div class="driver-application-status loading">Consultando solicitud…</div>';
    application = await apiService.get('/driver-applications/me');
    if (!application) { container.innerHTML = ''; return; }
    render();
  };

  const replaceDocument = async (type, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast('El archivo supera los 5 MB.', 'error');
    const form = new FormData(); form.append('file', file);
    const updated = await apiService.putForm(`/driver-applications/me/documents/${type}`, form);
    if (!updated) return showToast('No se pudo subir el documento.', 'error');
    application = updated;
    showToast('Documento actualizado de forma segura.', 'success');
    render();
  };

  const submitAgain = async () => {
    const updated = await apiService.post('/driver-applications/me/submit', {});
    if (!updated) return showToast(apiService.lastError?.error === 'MISSING_DOCUMENTS' ? 'Todavía faltan documentos obligatorios.' : 'No se pudo reenviar la solicitud.', 'error');
    application = updated;
    showToast('Solicitud reenviada a administración.', 'success');
    render();
  };

  const render = () => {
    const [label, message, tone] = LABELS[application.status] || LABELS.pending;
    const editable = ['draft','rejected','needs_changes'].includes(application.status);
    const requested = application.requestedChanges?.length ? new Set(application.requestedChanges) : null;
    container.innerHTML = `<section class="driver-application-status ${tone}"><header><span>${icon('shield',20)}</span><div><small>SOLICITUD DE CONDUCTOR</small><h3>${label}</h3></div><b>${label}</b></header><p>${message}</p>${application.decisionReason ? `<div class="application-decision-reason"><strong>Observación de administración</strong><span>${application.decisionReason}</span></div>` : ''}<div class="application-document-status">${application.documents.map(document => `<label class="application-document-row"><span><strong>${DOC_LABELS[document.type] || document.type}</strong><small>${document.status === 'approved' ? 'Aprobado' : document.status === 'rejected' ? 'Rechazado' : 'En revisión'}</small></span>${editable && (!requested || requested.has(document.type)) ? `<input type="file" data-replace-document="${document.type}" accept="image/jpeg,image/png,image/webp,application/pdf"><em>${icon('upload',15)} Reemplazar</em>` : `<i class="${document.status}">${document.status === 'approved' ? icon('check',15) : icon('clock',15)}</i>`}</label>`).join('')}</div>${editable ? `<button class="application-resubmit">${icon('arrowRight',16)} Reenviar solicitud a revisión</button>` : ''}${application.status === 'approved' ? '<button class="application-enter-driver">Entrar al modo conductor</button>' : ''}</section>`;
    container.querySelectorAll('[data-replace-document]').forEach(input => input.addEventListener('change', event => replaceDocument(event.target.dataset.replaceDocument, event.target.files?.[0])));
    container.querySelector('.application-resubmit')?.addEventListener('click', submitAgain);
    container.querySelector('.application-enter-driver')?.addEventListener('click', async () => {
      const user = await authService.refreshSession();
      if (user?.role === 'driver') window.navigateTo('#/driver');
      else showToast('Cierra sesión e ingresa nuevamente como conductor para actualizar el acceso.', 'info', 5500);
    });
  };

  load();
}
