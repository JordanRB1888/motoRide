import { authService } from '../services/mockAuth.js';
import { showToast } from './toast.js';

export function createDriverRegistrationModal({ onClose, onSuccess }) {
    const overlay = document.createElement('div');
    overlay.className = 'diorama-card-3d fade-in';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(10, 15, 24, 0.94); backdrop-filter: blur(24px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    let currentStep = 1;

    // Form State
    const formData = {
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        password: '',
        vehicleBrand: 'Bera',
        vehicleModel: 'BR200',
        vehiclePlate: '',
        vehicleColor: 'Rojo',
        vehicleYear: 2023,
        licenseNumber: '',
        documents: {
            cedula: { status: 'pending', previewUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80' },
            licencia: { status: 'pending', previewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80' },
            rcv: { status: 'pending', previewUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=400&q=80' },
            certificadoMedico: { status: 'pending', previewUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=400&q=80' },
            carnetCirculacion: { status: 'pending', previewUrl: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=400&q=80' }
        }
    };

    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 100%; max-width: 580px; max-height: 90vh; background: var(--surface-card); border-radius: 28px;
        border: 2px solid var(--accent-primary); padding: 24px; box-shadow: 0 30px 70px rgba(0,0,0,0.8);
        display: flex; flex-direction: column; overflow: hidden; animation: dioramaLand 0.35s ease-out;
    `;

    const renderStep = () => {
        modal.innerHTML = `
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 16px;">
                <div>
                    <h3 style="color: var(--text-primary); font-size: 1.25rem; font-weight: 900; margin: 0;">
                        📝 Registro de Nuevo Conductor
                    </h3>
                    <small style="color: var(--accent-primary); font-weight:700;">Paso ${currentStep} de 3 · Solicitud de Ingreso +58express Maracaibo</small>
                </div>
                <button id="close-reg-modal" style="color: var(--text-secondary); font-size: 1.3rem; background: none; border: none; cursor: pointer;">✕</button>
            </div>

            <!-- Steps Progress Bar -->
            <div style="display:flex; gap: 6px; margin-bottom: 20px;">
                <div style="flex:1; height:6px; border-radius:10px; background:${currentStep >= 1 ? 'var(--accent-primary)' : 'var(--surface-elevated)'}"></div>
                <div style="flex:1; height:6px; border-radius:10px; background:${currentStep >= 2 ? 'var(--accent-primary)' : 'var(--surface-elevated)'}"></div>
                <div style="flex:1; height:6px; border-radius:10px; background:${currentStep >= 3 ? 'var(--accent-primary)' : 'var(--surface-elevated)'}"></div>
            </div>

            <!-- Body Container -->
            <div style="flex:1; overflow-y: auto; padding-right: 4px; margin-bottom: 16px;">
                ${currentStep === 1 ? `
                    <div style="display:flex; flex-direction:column; gap: 14px;">
                        <h4 style="color:var(--text-primary); font-size:1rem; font-weight:800; margin:0;">1. Datos Personales y Cuenta</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <small style="color:var(--text-secondary);">Nombre *</small>
                                <input type="text" id="reg-fname" value="${formData.firstName}" placeholder="Ej: Gabriel" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                            <div>
                                <small style="color:var(--text-secondary);">Apellido *</small>
                                <input type="text" id="reg-lname" value="${formData.lastName}" placeholder="Ej: Zambrano" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <small style="color:var(--text-secondary);">Correo Electrónico *</small>
                                <input type="email" id="reg-email" value="${formData.email}" placeholder="correo@ejemplo.com" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                            <div>
                                <small style="color:var(--text-secondary);">Teléfono / WhatsApp *</small>
                                <input type="text" id="reg-phone" value="${formData.phone}" placeholder="+58 414-000-0000" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                        </div>

                        <div>
                            <small style="color:var(--text-secondary);">Contraseña para Iniciar Sesión *</small>
                            <input type="password" id="reg-pass" value="${formData.password}" placeholder="Mínimo 6 caracteres" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                    </div>
                ` : ''}

                ${currentStep === 2 ? `
                    <div style="display:flex; flex-direction:column; gap: 14px;">
                        <h4 style="color:var(--text-primary); font-size:1rem; font-weight:800; margin:0;">2. Datos de la Moto</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <small style="color:var(--text-secondary);">Marca de la Moto *</small>
                                <select id="reg-brand" style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;">
                                    <option value="Bera" ${formData.vehicleBrand === 'Bera' ? 'selected' : ''}>Bera</option>
                                    <option value="Empire Keeway" ${formData.vehicleBrand === 'Empire Keeway' ? 'selected' : ''}>Empire Keeway</option>
                                    <option value="Honda" ${formData.vehicleBrand === 'Honda' ? 'selected' : ''}>Honda</option>
                                    <option value="Yamaha" ${formData.vehicleBrand === 'Yamaha' ? 'selected' : ''}>Yamaha</option>
                                    <option value="UM" ${formData.vehicleBrand === 'UM' ? 'selected' : ''}>UM</option>
                                    <option value="Suzuki" ${formData.vehicleBrand === 'Suzuki' ? 'selected' : ''}>Suzuki</option>
                                </select>
                            </div>
                            <div>
                                <small style="color:var(--text-secondary);">Modelo *</small>
                                <input type="text" id="reg-model" value="${formData.vehicleModel}" placeholder="Ej: BR200, SBR, Keeway" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                            <div>
                                <small style="color:var(--text-secondary);">Placa de la Moto *</small>
                                <input type="text" id="reg-plate" value="${formData.vehiclePlate}" placeholder="Ej: AC9M11P" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                            <div>
                                <small style="color:var(--text-secondary);">Color *</small>
                                <input type="text" id="reg-color" value="${formData.vehicleColor}" placeholder="Ej: Rojo" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                            <div>
                                <small style="color:var(--text-secondary);">Año *</small>
                                <input type="number" id="reg-year" value="${formData.vehicleYear}" placeholder="2023" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                            </div>
                        </div>

                        <div>
                            <small style="color:var(--text-secondary);">Número de Licencia de Conducir *</small>
                            <input type="text" id="reg-licno" value="${formData.licenseNumber}" placeholder="Ej: L-984721" required style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--border-color); background:var(--surface-input); color:white;" />
                        </div>
                    </div>
                ` : ''}

                ${currentStep === 3 ? `
                    <div style="display:flex; flex-direction:column; gap: 14px;">
                        <h4 style="color:var(--text-primary); font-size:1rem; font-weight:800; margin:0;">3. Carga de Requisitos y Documentación Obligatoria</h4>
                        <small style="color:var(--text-secondary);">Adjunta foto legible de cada uno de los 5 requisitos para que la Administración revise tu solicitud:</small>

                        <div style="display:flex; flex-direction:column; gap: 10px;">
                            ${[
                                { key: 'cedula', label: '🪪 Cédula de Identidad 🇻🇪' },
                                { key: 'licencia', label: '📄 Licencia de Conducir (2do Grado)' },
                                { key: 'rcv', label: '📑 RCV (Seguro de Responsabilidad Civil)' },
                                { key: 'certificadoMedico', label: '🏥 Certificado Médico' },
                                { key: 'carnetCirculacion', label: '🏍️ Carnet de Circulación de la Moto' }
                            ].map(doc => `
                                <div style="display:flex; align-items:center; justify-content:space-between; padding: 12px 16px; background: var(--surface-elevated); border-radius: 14px; border: 1px solid var(--border-color);">
                                    <div>
                                        <strong style="color:var(--text-primary); font-size: 0.9rem; display:block;">${doc.label}</strong>
                                        <small style="color:var(--success); font-size:0.75rem; font-weight:700;">✓ Listo para revisión</small>
                                    </div>
                                    <label style="
                                        padding: 8px 14px; border-radius: 12px; background: rgba(255,193,7,0.15);
                                        border: 1px solid var(--accent-primary); color: var(--accent-primary);
                                        font-size: 0.8rem; font-weight: 800; cursor: pointer;
                                    ">
                                        📷 Adjuntar Foto
                                        <input type="file" class="doc-file-input" data-key="${doc.key}" accept="image/*" style="display:none;" />
                                    </label>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>

            <!-- Footer Action Bar -->
            <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border-color); padding-top: 14px;">
                ${currentStep > 1 ? `
                    <button id="prev-step-btn" class="btn" style="padding: 12px 20px; border-radius: 16px; background: var(--surface-elevated); color: white; font-weight: 700;">
                        ← Anterior
                    </button>
                ` : '<div></div>'}

                ${currentStep < 3 ? `
                    <button id="next-step-btn" class="btn btn-3d primary-btn" style="padding: 12px 24px; border-radius: 16px; font-weight: 900;">
                        Siguiente ➔
                    </button>
                ` : `
                    <button id="submit-reg-btn" class="btn btn-3d primary-btn" style="
                        padding: 14px 24px; border-radius: 16px; font-weight: 900;
                        background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
                    ">
                        🚀 ENVIAR SOLICITUD A ADMINISTRACIÓN
                    </button>
                `}
            </div>
        `;

        modal.querySelector('#close-reg-modal').addEventListener('click', () => overlay.remove());

        if (modal.querySelector('#prev-step-btn')) {
            modal.querySelector('#prev-step-btn').addEventListener('click', () => {
                currentStep--;
                renderStep();
            });
        }

        if (modal.querySelector('#next-step-btn')) {
            modal.querySelector('#next-step-btn').addEventListener('click', () => {
                if (saveStepData()) {
                    currentStep++;
                    renderStep();
                }
            });
        }

        if (modal.querySelector('#submit-reg-btn')) {
            modal.querySelector('#submit-reg-btn').addEventListener('click', () => {
                submitRegistration();
            });
        }

        modal.querySelectorAll('.doc-file-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const key = input.dataset.key;
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        formData.documents[key] = { status: 'pending', previewUrl: evt.target.result };
                        showToast(`Documento ${key} adjuntado con éxito`, 'success');
                    };
                    reader.readAsDataURL(file);
                }
            });
        });
    };

    function saveStepData() {
        if (currentStep === 1) {
            formData.firstName = modal.querySelector('#reg-fname').value.trim();
            formData.lastName = modal.querySelector('#reg-lname').value.trim();
            formData.email = modal.querySelector('#reg-email').value.trim();
            formData.phone = modal.querySelector('#reg-phone').value.trim();
            formData.password = modal.querySelector('#reg-pass').value.trim();

            if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || formData.password.length < 6) {
                showToast('Por favor completa todos los datos personales obligatorios', 'error');
                return false;
            }
        } else if (currentStep === 2) {
            formData.vehicleBrand = modal.querySelector('#reg-brand').value;
            formData.vehicleModel = modal.querySelector('#reg-model').value.trim();
            formData.vehiclePlate = modal.querySelector('#reg-plate').value.trim();
            formData.vehicleColor = modal.querySelector('#reg-color').value.trim();
            formData.vehicleYear = parseInt(modal.querySelector('#reg-year').value, 10) || 2023;
            formData.licenseNumber = modal.querySelector('#reg-licno').value.trim();

            if (!formData.vehicleModel || !formData.vehiclePlate || !formData.licenseNumber) {
                showToast('Por favor completa todos los datos de la moto y licencia', 'error');
                return false;
            }
        }
        return true;
    }

    async function submitRegistration() {
        const newDriver = {
            id: 'driver_' + Date.now(),
            role: 'driver',
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            vehicleBrand: formData.vehicleBrand,
            vehicleModel: formData.vehicleModel,
            vehiclePlate: formData.vehiclePlate,
            vehicleColor: formData.vehicleColor,
            vehicleYear: formData.vehicleYear,
            licenseNumber: formData.licenseNumber,
            photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(formData.firstName)}`,
            status: 'OFFLINE',
            isVerified: false,
            rating: 5.0,
            totalTrips: 0,
            documents: formData.documents,
            password: formData.password
        };

        const registration = await authService.register(newDriver, 'driver');
        if (!registration.success) {
            showToast('No se pudo registrar: el correo o teléfono ya existe', 'error');
            return;
        }
        Object.assign(newDriver, registration.user);

        // Show pending confirmation overlay
        modal.innerHTML = `
            <div style="text-align:center; padding: 20px 10px;">
                <div style="font-size: 3.5rem; margin-bottom: 12px;">✅</div>
                <h3 style="color: var(--text-primary); font-size: 1.4rem; font-weight: 900; margin-bottom: 8px;">
                    ¡Solicitud de conductor recibida!
                </h3>
                <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5; margin-bottom: 20px;">
                    Bienvenido <strong>${formData.firstName} ${formData.lastName}</strong>. La administración revisará tu moto <strong>${formData.vehicleBrand} (${formData.vehiclePlate})</strong> y tus documentos.
                </p>

                <div style="background: rgba(0,230,118,0.12); padding: 14px; border-radius: 16px; border: 1.5px solid var(--success); margin-bottom: 24px; text-align: left;">
                    <strong style="color: var(--success); font-size: 0.88rem; display:block; margin-bottom: 4px;">ESTADO DE TU CUENTA:</strong>
                    <span style="color: var(--text-primary); font-size: 0.85rem;">🟡 Pendiente de revisión administrativa</span>
                </div>

                <button id="close-success-reg-btn" class="btn btn-3d primary-btn" style="
                    width: 100%; padding: 16px; font-weight: 900; font-size: 1rem;
                    background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824;
                ">
                    🚀 ENTRAR AL APARTADO DE CONDUCTORES AHORA
                </button>
            </div>
        `;

        modal.querySelector('#close-success-reg-btn').addEventListener('click', () => {
            overlay.remove();
            window.navigateTo('#/driver');
            if (onSuccess) onSuccess(newDriver);
        });
    }

    overlay.appendChild(modal);
    renderStep();
    return overlay;
}
