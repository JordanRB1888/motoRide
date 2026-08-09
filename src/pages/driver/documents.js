import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';

const LABELS={identity_front:'Cédula (frente)',identity_back:'Cédula (reverso)',driver_license:'Licencia de conducir',vehicle_registration:'Registro del vehículo',vehicle_insurance:'Seguro del vehículo',vehicle_photo:'Foto del vehículo',plate_photo:'Foto de la placa',driver_selfie:'Selfie del conductor'};

export function renderDocuments() {
  const container=document.createElement('div');
  container.className='documents-page';
  container.style.cssText='padding:20px 16px 110px;max-width:480px;margin:0 auto';
  container.innerHTML='<div class="admin-loading">Cargando tus documentos protegidos…</div>';
  const hydrate=async()=>{
    const application=await apiService.get('/driver-applications/me');
    if(!application){container.innerHTML='<section class="document-real-empty"><h2>Mis documentos</h2><p>No existe un expediente de conductor asociado a esta cuenta.</p></section>';return;}
    container.innerHTML=`<header class="document-real-heading"><small>EXPEDIENTE PRIVADO</small><h2>Mis documentos</h2><p>Estos archivos no son públicos. Solo tú y administración pueden consultarlos.</p></header><section class="document-verification-summary ${application.status}"><span>${icon(application.status==='approved'?'check':'clock',24)}</span><div><h3>${application.status==='approved'?'Documentación verificada':'Documentación en revisión'}</h3><p>Estado de solicitud: ${application.status.replace('_',' ')}</p></div></section><div class="document-real-list">${application.documents.map(document=>`<article><button data-doc-url="${document.contentUrl}" data-mime="${document.mimeType}"><span>${icon('shield',22)}</span><div><strong>${LABELS[document.type]||document.type}</strong><small>${Math.round(document.size/1024)} KB · ${document.status}</small></div><em>${icon('eye',17)}</em></button></article>`).join('')}</div>`;
    container.querySelectorAll('[data-doc-url]').forEach(button=>button.onclick=async()=>{button.disabled=true;const url=await apiService.getPrivateFileUrl(button.dataset.docUrl);button.disabled=false;if(url)window.open(url,'_blank','noopener');});
  };
  hydrate();
  return container;
}
