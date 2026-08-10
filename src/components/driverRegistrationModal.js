import { authService } from '../services/authService.js';
import { apiService } from '../services/apiService.js';
import { showToast } from './toast.js';
import { icon } from '../utils/icons.js';

const DOCUMENTS = [
  ['identity_front', 'Cédula por delante', true],
  ['identity_back', 'Cédula por detrás', true],
  ['driver_license', 'Licencia de conducir', true],
  ['vehicle_registration', 'Registro del vehículo', true],
  ['vehicle_insurance', 'Seguro / RCV', false],
  ['vehicle_photo', 'Foto completa del vehículo', true],
  ['plate_photo', 'Foto legible de la placa', true],
  ['driver_selfie', 'Selfie del conductor', true]
];

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const FIELD_STEPS = {
  firstName:1,lastName:1,identityNumber:1,birthDate:1,phone:1,email:1,password:1,address:1,city:1,region:1,
  vehicleBrand:2,vehicleModel:2,vehicleYear:2,vehicleColor:2,vehiclePlate:2
};

export function createDriverRegistrationModal({ onClose, onSuccess } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'driver-application-overlay';
  let step = 1;
  let submitting = false;
  const values = {
    firstName:'', lastName:'', identityNumber:'', birthDate:'', phone:'', email:'', password:'',
    address:'', city:'Maracaibo', region:'Zulia', vehicleType:'MOTO', vehicleBrand:'', vehicleModel:'',
    vehicleYear:'', vehicleColor:'', vehiclePlate:'', vehicleAdditionalInfo:''
  };
  const files = new Map();

  const close = () => {
    files.forEach(item => item.preview && URL.revokeObjectURL(item.preview));
    overlay.remove();
    onClose?.();
  };

  const capture = () => {
    overlay.querySelectorAll('[data-field]').forEach(input => { values[input.dataset.field] = input.value; });
  };

  const validateStep = () => {
    capture();
    if (step === 1) {
      const required = ['firstName','lastName','identityNumber','birthDate','phone','email','password','address','city','region'];
      const missing = required.find(key => !String(values[key]).trim());
      if (missing) return 'Completa todos los datos personales obligatorios.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return 'Introduce una dirección de correo válida.';
      if (values.phone.replace(/\D/g,'').length < 10) return 'Introduce un número telefónico válido.';
      if (values.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
      const identityDigits = values.identityNumber.replace(/\D/g, '');
      if (identityDigits.length < 5 || identityDigits.length > 12) return 'Introduce una cédula válida; puedes escribirla con o sin puntos.';
      const birth = new Date(`${values.birthDate}T00:00:00`);
      const age = Number.isNaN(birth.getTime()) ? -1 : Math.floor((Date.now() - birth.getTime()) / 31557600000);
      if (age < 18 || age > 80) return 'Para registrarte como conductor debes tener entre 18 y 80 años.';
    }
    if (step === 2) {
      const required = ['vehicleBrand','vehicleModel','vehicleYear','vehicleColor','vehiclePlate'];
      if (required.some(key => !String(values[key]).trim())) return 'Completa toda la información del vehículo.';
      const year = Number(values.vehicleYear);
      if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1) return 'Introduce un año válido para el vehículo.';
      if (!/^[A-Z0-9-]{4,12}$/i.test(values.vehiclePlate.replace(/\s+/g, ''))) return 'Introduce una placa válida, sin caracteres especiales.';
    }
    if (step === 3) {
      const missingDocument = DOCUMENTS.find(([key,,required]) => required && !files.has(key));
      if (missingDocument) return `Debes subir: ${missingDocument[1]}.`;
    }
    return null;
  };

  const personalStep = () => `
    <section class="driver-application-step">
      <h3>Información personal</h3><p>Estos datos deben coincidir con tus documentos.</p>
      <div class="driver-application-grid two">
        ${field('firstName','Nombre','text','Ej. Gabriel')}${field('lastName','Apellido','text','Ej. Zambrano')}
        ${field('identityNumber','Cédula / documento','text','V-12345678')}${field('birthDate','Fecha de nacimiento','date','')}
        ${field('phone','Teléfono / WhatsApp','tel','+58 414-000-0000')}${field('email','Correo electrónico','email','correo@ejemplo.com')}
      </div>
      ${field('address','Dirección','text','Urbanización, avenida, calle y referencia')}
      <div class="driver-application-grid two">${field('city','Ciudad','text','Maracaibo')}${field('region','Estado / región','text','Zulia')}</div>
      ${field('password','Contraseña','password','Mínimo 8 caracteres')}
    </section>`;

  const vehicleStep = () => `
    <section class="driver-application-step">
      <h3>Vehículo de trabajo</h3><p>Registra exactamente el vehículo que utilizarás en la plataforma.</p>
      <label class="driver-application-field"><span>Tipo de vehículo *</span><select data-field="vehicleType"><option value="MOTO" ${values.vehicleType==='MOTO'?'selected':''}>Motocicleta</option><option value="CAR" ${values.vehicleType==='CAR'?'selected':''}>Automóvil</option></select></label>
      <div class="driver-application-grid two">${field('vehicleBrand','Marca','text','Bera, Empire, Toyota...')}${field('vehicleModel','Modelo','text','BR200, SBR 150...')}</div>
      <div class="driver-application-grid three">${field('vehicleYear','Año','number','2024')}${field('vehicleColor','Color','text','Negro')}${field('vehiclePlate','Placa','text','AC3M49P')}</div>
      ${field('vehicleAdditionalInfo','Información adicional','text','Cilindraje, número de unidad u observaciones (opcional)',false)}
    </section>`;

  const documentsStep = () => `
    <section class="driver-application-step">
      <h3>Documentos privados</h3><p>JPG, PNG, WEBP o PDF. Máximo 5 MB por archivo. Solo administración podrá consultarlos.</p>
      <div class="driver-document-grid">${DOCUMENTS.map(([key,label,required]) => {
        const item = files.get(key);
        return `<label class="driver-document-input ${item?'ready':''}">
          <input type="file" data-document="${key}" accept="image/jpeg,image/png,image/webp,application/pdf">
          <span class="driver-document-icon">${item ? icon('check',18) : icon('upload',18)}</span>
          <span><strong>${escapeHtml(label)} ${required?'*':''}</strong><small>${item ? escapeHtml(item.file.name) : 'Toca para seleccionar'}</small></span>
          ${item?.preview && item.file.type.startsWith('image/') ? `<img src="${item.preview}" alt="Vista previa">` : ''}
        </label>`;
      }).join('')}</div>
    </section>`;

  const confirmationStep = () => `
    <section class="driver-application-step driver-application-review">
      <span class="review-shield">${icon('shield',30)}</span><h3>Revisa y envía tu solicitud</h3>
      <p>La cuenta no quedará habilitada como conductor hasta que administración revise la información y los documentos.</p>
      <div class="review-summary"><div><small>Solicitante</small><strong>${escapeHtml(values.firstName)} ${escapeHtml(values.lastName)}</strong></div><div><small>Vehículo</small><strong>${escapeHtml(values.vehicleBrand)} ${escapeHtml(values.vehicleModel)} · ${escapeHtml(values.vehiclePlate)}</strong></div><div><small>Documentos</small><strong>${files.size} archivos adjuntos</strong></div></div>
      <label class="driver-terms"><input type="checkbox" id="driver-terms"> <span>Confirmo que la información es auténtica y autorizo su revisión para fines operativos y de seguridad.</span></label>
    </section>`;

  function field(key, label, type = 'text', placeholder = '', required = true) {
    return `<label class="driver-application-field"><span>${label} ${required?'*':''}</span><input data-field="${key}" type="${type}" value="${escapeHtml(values[key])}" placeholder="${escapeHtml(placeholder)}" ${required?'required':''}></label>`;
  }

  const bind = () => {
    overlay.querySelector('[data-close]')?.addEventListener('click', close);
    overlay.querySelector('[data-back]')?.addEventListener('click', () => { capture(); step -= 1; render(); });
    overlay.querySelector('[data-next]')?.addEventListener('click', () => {
      const error = validateStep();
      if (error) return showToast(error, 'error');
      step += 1; render();
    });
    overlay.querySelectorAll('[data-document]').forEach(input => input.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return showToast('El archivo supera el máximo de 5 MB.', 'error');
      if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) return showToast('Formato de archivo no permitido.', 'error');
      const previous = files.get(event.target.dataset.document);
      if (previous?.preview) URL.revokeObjectURL(previous.preview);
      files.set(event.target.dataset.document, { file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
      render();
    }));
    overlay.querySelector('[data-submit]')?.addEventListener('click', submit);
  };

  const submit = async () => {
    if (submitting) return;
    if (!overlay.querySelector('#driver-terms')?.checked) return showToast('Debes confirmar que la información es auténtica.', 'error');
    submitting = true; render();
    const form = new FormData();
    Object.entries(values).forEach(([key,value]) => form.append(key, value));
    files.forEach((item,key) => form.append(key, item.file));
    const result = await apiService.postForm('/driver-applications', form);
    submitting = false;
    if (!result?.user || !result?.token) {
      const error = apiService.lastError;
      const fieldName = error?.fields ? Object.keys(error.fields)[0] : null;
      if (fieldName && FIELD_STEPS[fieldName]) step = FIELD_STEPS[fieldName];
      if (error?.error === 'USER_EXISTS') showToast('Ese correo o teléfono pertenece a otra cuenta. Inicia sesión o utiliza tus datos correctos.', 'error', 7000);
      else if (error?.error === 'EXISTING_ACCOUNT_AUTH_REQUIRED') showToast('Ya tienes cuenta de pasajero. Escribe la misma contraseña de esa cuenta para solicitar ser conductor.', 'error', 8000);
      else if (error?.error === 'DRIVER_APPLICATION_EXISTS') showToast(`Ya existe una solicitud de conductor en estado “${error.applicationStatus || 'pendiente'}”. Inicia sesión como pasajero para revisarla.`, 'warning', 8000);
      else if (error?.error === 'MISSING_DOCUMENTS') { step = 3; showToast('Faltan documentos obligatorios. Revisa los archivos marcados con *.', 'error', 7000); }
      else if (error?.error === 'FILE_TOO_LARGE' || error?.status === 413) { step = 3; showToast('Uno de los archivos supera 5 MB. Reduce su tamaño y vuelve a intentarlo.', 'error', 8000); }
      else if (error?.error === 'INVALID_FILE_TYPE') { step = 3; showToast('Un archivo no es válido. Usa JPG, PNG, WEBP o PDF.', 'error', 8000); }
      else showToast(error?.fields ? Object.values(error.fields)[0] : 'No se pudo enviar la solicitud. Verifica tu conexión y vuelve a intentarlo.', 'error', 7000);
      render(); return;
    }
    authService.acceptSession(result.user, result.token);
    showToast('Solicitud enviada. El equipo de +58Express comenzará la revisión.', 'success', 6000);
    files.forEach(item => item.preview && URL.revokeObjectURL(item.preview));
    overlay.remove();
    onSuccess?.(result);
  };

  const render = () => {
    overlay.innerHTML = `<div class="driver-application-modal"><header><div><span>SOLICITUD DE CONDUCTOR</span><h2>Trabaja con +58Express</h2></div><button data-close aria-label="Cerrar">${icon('close',20)}</button></header><div class="driver-application-progress">${[1,2,3,4].map((number,index)=>`<div class="${step>=number?'active':''}"><i>${number}</i><span>${['Personal','Vehículo','Documentos','Confirmación'][index]}</span></div>`).join('')}</div><main>${step===1?personalStep():step===2?vehicleStep():step===3?documentsStep():confirmationStep()}</main><footer>${step>1?`<button class="secondary" data-back ${submitting?'disabled':''}>${icon('chevronLeft',17)} Atrás</button>`:'<span></span>'}${step<4?`<button class="primary" data-next>Siguiente ${icon('arrowRight',17)}</button>`:`<button class="primary" data-submit ${submitting?'disabled':''}>${submitting?'Enviando de forma segura…':`${icon('check',17)} Enviar solicitud`}</button>`}</footer></div>`;
    bind();
  };

  render();
  return overlay;
}
