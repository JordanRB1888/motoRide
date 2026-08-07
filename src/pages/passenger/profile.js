import { icon } from '../../utils/icons.js';
import { authService } from '../../services/mockAuth.js';
import { db } from '../../services/mockDatabase.js';
import { showToast } from '../../components/toast.js';

export function renderProfile(container) {
  const user = authService.getCurrentUser() || {
    id: 'p1',
    firstName: 'Jordan',
    lastName: 'Pérez',
    phone: '+58 412-555-0001',
    email: 'jordan@58express.com',
    age: 28,
    cedula: 'V-24.891.042',
    rating: 5.0,
    walletBalance: 25.00,
    totalTrips: 18
  };

  const avatarUrl = user.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent((user.firstName || 'Pasajero') + ' ' + (user.lastName || ''))}&background=FFC107&color=121824&size=128&bold=true`;

  let isEditing = false;

  const renderView = () => {
    container.innerHTML = `
      <div class="profile-page fade-in" style="padding: 24px 16px 120px; max-width: 440px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <div>
            <h2 style="color: var(--text-primary); font-size: 1.4rem; font-weight: 900; margin: 0; letter-spacing: -0.5px;">Mi Perfil</h2>
            <small style="color: var(--text-secondary); font-size: 0.8rem;">Pasajero Registrado</small>
          </div>
          <span style="
            font-size: 0.78rem; padding: 6px 14px; border-radius: 20px; font-weight: 800;
            background: rgba(0, 230, 118, 0.12); color: var(--success); border: 1.5px solid var(--success);
            display: inline-flex; align-items: center; gap: 6px;
          ">
            ${icon('check', 14)} Pasajero Verificado
          </span>
        </div>

        <!-- Ultra-Premium Profile Card -->
        <div class="diorama-card-3d" style="
          background: var(--surface-card); border-radius: 28px; padding: 28px 20px; text-align: center;
          border: 1.5px solid var(--border-gold); box-shadow: 0 20px 45px rgba(0,0,0,0.6); margin-bottom: 20px;
          position: relative; overflow: hidden;
        ">
          <div style="position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #FFC107 0%, #00D2FF 50%, #00E676 100%);"></div>

          <!-- Avatar Container -->
          <div style="position: relative; width: 108px; height: 108px; margin: 0 auto 16px;">
            <input type="file" id="profile-photo-input" accept="image/*" style="display: none;" />
            <img src="${avatarUrl}" id="profile-avatar-img" style="
              width: 100%; height: 100%; border-radius: 50%;
              border: 3.5px solid var(--accent-primary);
              box-shadow: 0 0 25px rgba(255,193,7,0.35);
              object-fit: cover;
            ">
            
            <button id="btn-trigger-photo-upload" style="
              position: absolute; bottom: 0; right: -2px;
              background: var(--accent-primary); color: #121824; font-size: 0.75rem;
              padding: 5px 10px; border-radius: 14px; font-weight: 900;
              box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer; border: 1.5px solid #121824;
              display: flex; align-items: center; gap: 4px;
            " title="Subir Foto Real de Perfil">
              Foto Real
            </button>
          </div>

          <!-- User Info Title -->
          <h3 style="color: var(--text-primary); font-size: 1.35rem; font-weight: 900; margin: 0 0 12px; letter-spacing: -0.3px;">
            ${user.firstName || 'Pasajero'} ${user.lastName || ''}
          </h3>

          <!-- Details Pill Grid -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; text-align: left; background: var(--surface-elevated); padding: 14px 16px; border-radius: 18px; border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                ${icon('phone', 14)} Teléfono
              </span>
              <strong style="color: var(--text-primary); font-weight: 700;">${user.phone || '+58 412-555-0001'}</strong>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                ${icon('shield', 14)} Cédula / ID
              </span>
              <strong style="color: var(--text-primary); font-weight: 700;">${user.cedula || 'V-24.891.042'}</strong>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                ${icon('message', 14)} Correo
              </span>
              <strong style="color: var(--accent-secondary); font-weight: 700;">${user.email || 'jordan@58express.com'}</strong>
            </div>
          </div>

          <!-- Quick Stats inside Card -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
            <div style="background: rgba(255, 193, 7, 0.08); padding: 12px; border-radius: 16px; border: 1px solid rgba(255, 193, 7, 0.2);">
              <small style="color: var(--text-secondary); display: block; font-size: 0.72rem;">CARRERAS REALIZADAS</small>
              <strong style="color: var(--accent-primary); font-size: 1.15rem; font-weight: 900;">${user.totalTrips || 18} viajes</strong>
            </div>
            <div style="background: rgba(0, 230, 118, 0.08); padding: 12px; border-radius: 16px; border: 1px solid rgba(0, 230, 118, 0.2);">
              <small style="color: var(--text-secondary); display: block; font-size: 0.72rem;">CALIFICACIÓN</small>
              <strong style="color: var(--success); font-size: 1.15rem; font-weight: 900; display: inline-flex; align-items: center; gap: 4px;">
                ${user.rating || 5.0} ${icon('star', 14, 'fill-star')}
              </strong>
            </div>
          </div>

          <!-- Edit Info Button -->
          <button id="btn-toggle-edit-info" class="btn" style="
            width: 100%; padding: 12px; border-radius: 16px; background: rgba(0, 210, 255, 0.12);
            border: 1.5px solid var(--accent-secondary); color: var(--accent-secondary);
            font-weight: 800; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          ">
            ${icon('edit', 16)} ${isEditing ? 'Cancelar Edición' : 'Editar Datos Personales'}
          </button>
        </div>

        ${isEditing ? `
          <!-- Inline Edit Information Card -->
          <div class="diorama-card-3d" style="
            background: var(--surface-card); border-radius: 24px; padding: 20px;
            border: 1.5px solid var(--accent-secondary); margin-bottom: 20px;
          ">
            <h4 style="color: var(--text-primary); font-size: 1rem; font-weight: 800; margin: 0 0 14px; display:flex; align-items:center; gap:6px;">
              ${icon('edit', 16)} Modificar Información Personal
            </h4>

            <form id="edit-profile-form" style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Nombre *</small>
                  <input type="text" id="edit-fname" value="${user.firstName || ''}" required style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: white; outline: none; font-size: 0.9rem;
                  " />
                </div>
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Apellido *</small>
                  <input type="text" id="edit-lname" value="${user.lastName || ''}" required style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: white; outline: none; font-size: 0.9rem;
                  " />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Teléfono WhatsApp *</small>
                  <input type="text" id="edit-phone" value="${user.phone || ''}" required style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: white; outline: none; font-size: 0.9rem;
                  " />
                </div>
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Edad / Cédula</small>
                  <input type="text" id="edit-cedula" value="${user.cedula || 'V-24.891.042'}" style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: white; outline: none; font-size: 0.9rem;
                  " />
                </div>
              </div>

              <button type="submit" id="btn-save-profile-info" class="btn btn-3d primary-btn" style="
                width: 100%; padding: 14px; font-weight: 900; font-size: 0.95rem; margin-top: 6px;
                background: linear-gradient(135deg, #00E676 0%, #00B0FF 100%); color: #121824; cursor: pointer; display:flex; align-items:center; justify-content:center; gap:6px;
              ">
                ${icon('check', 18)} GUARDAR DATOS ACTUALIZADOS
              </button>
            </form>
          </div>
        ` : ''}

        <!-- Clean Logout Button -->
        <div>
          <button id="profile-logout-btn" class="btn" style="
            width: 100%; padding: 14px; font-weight: 800; font-size: 0.95rem;
            background: rgba(255, 77, 77, 0.12); border: 1.5px solid var(--danger);
            color: var(--danger); border-radius: 18px;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            cursor: pointer; transition: all 0.2s ease;
          ">
            ${icon('logout', 18)} Cerrar Sesión / Salir
          </button>
        </div>
      </div>
    `;

    // Photo Upload Triggers
    const photoInput = container.querySelector('#profile-photo-input');
    const photoUploadBtn = container.querySelector('#btn-trigger-photo-upload');

    if (photoUploadBtn && photoInput) {
      photoUploadBtn.addEventListener('click', () => photoInput.click());
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            user.photoUrl = evt.target.result;
            db.update('users', user.id, { photoUrl: evt.target.result });
            authService.updateProfile({ photoUrl: evt.target.result });
            showToast('¡Foto de perfil real actualizada con éxito!', 'success');
            renderView();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Toggle Edit Info
    const toggleEditBtn = container.querySelector('#btn-toggle-edit-info');
    if (toggleEditBtn) {
      toggleEditBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        renderView();
      });
    }

    // Save Edit Form
    const editForm = container.querySelector('#edit-profile-form');
    if (editForm) {
      editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const firstName = container.querySelector('#edit-fname').value.trim();
        const lastName = container.querySelector('#edit-lname').value.trim();
        const phone = container.querySelector('#edit-phone').value.trim();
        const cedula = container.querySelector('#edit-cedula').value.trim();

        user.firstName = firstName;
        user.lastName = lastName;
        user.phone = phone;
        user.cedula = cedula;

        db.update('users', user.id, { firstName, lastName, phone, cedula });
        authService.updateProfile({ firstName, lastName, phone, cedula });

        showToast('¡Información personal actualizada!', 'success');
        isEditing = false;
        renderView();
      });
    }

    // Logout Event
    container.querySelector('#profile-logout-btn').addEventListener('click', () => {
      authService.logout();
      window.navigateTo('#/');
    });
  };

  renderView();
}
