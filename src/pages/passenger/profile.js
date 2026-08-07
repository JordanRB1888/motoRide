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
      <div class="profile-page" style="padding: 20px 16px 100px; max-width: 480px; margin: 0 auto; text-align: left;">
        <div class="page-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
          <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Mi Perfil Pasajero</h2>
        <div class="page-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
          <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Mi Perfil Pasajero</h2>
          <span class="badge badge-success" style="font-size: 0.8rem; padding: 6px 12px; font-weight: 800; display:inline-flex; align-items:center; gap:4px;">
            ${icon('check', 14)} PASAJERO VERIFICADO
          </span>
        </div>

        <!-- VIP Passport Card with Real Photo Upload -->
        <div class="diorama-card-3d" style="
          background: var(--surface-card); border-radius: 26px; padding: 28px 24px; text-align: center;
          border: 1.5px solid var(--border-gold); box-shadow: 0 15px 35px rgba(0,0,0,0.6); margin-bottom: 20px;
          position: relative; overflow: hidden;
        ">
          <div style="position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #FFC107 0%, #00D2FF 50%, #00E676 100%);"></div>

          <!-- Avatar with Real Photo Upload Button -->
          <div style="position: relative; display: inline-block; margin-bottom: 14px;">
            <input type="file" id="profile-photo-input" accept="image/*" style="display: none;" />
            <img src="${avatarUrl}" id="profile-avatar-img" style="
              width: 104px; height: 104px; border-radius: 50%;
              border: 3.5px solid var(--accent-primary);
              box-shadow: 0 0 25px rgba(255,193,7,0.4);
              object-fit: cover;
            ">
            
            <button id="btn-trigger-photo-upload" style="
              position: absolute; bottom: -4px; right: -4px;
              background: var(--accent-primary); color: #121824; font-size: 0.85rem;
              padding: 6px 10px; border-radius: 16px; font-weight: 900;
              box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer; border: 1.5px solid #121824;
              display: flex; align-items: center; gap: 4px;
            " title="Subir Foto Real de Perfil">
              Foto Real
            </button>
          </div>

          <h2 style="color: var(--text-primary); font-size: 1.4rem; font-weight: 900; margin-bottom: 2px;">
            ${user.firstName || 'Pasajero'} ${user.lastName || ''}
          </h2>
          
          <p style="color: var(--text-secondary); font-size: 0.88rem; font-weight: 700; margin-bottom: 6px; display:flex; align-items:center; justify-content:center; gap:6px;">
            ${icon('phone', 14)} ${user.phone || '+58 412-555-0001'} ${user.cedula ? `· ${user.cedula}` : ''}
          </p>

          <p style="color: var(--accent-secondary); font-size: 0.82rem; font-weight: 700; margin-bottom: 18px; display:flex; align-items:center; justify-content:center; gap:6px;">
            ${user.email || 'jordan@58express.com'} ${user.age ? `· ${user.age} años` : ''}
          </p>

          <!-- Edit Info Button -->
          <button id="btn-toggle-edit-info" class="btn" style="
            padding: 8px 16px; border-radius: 14px; background: rgba(0, 210, 255, 0.15);
            border: 1px solid var(--accent-secondary); color: var(--accent-secondary);
            font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          ">
            ${icon('edit', 16)} ${isEditing ? 'Cancelar Edición' : 'Editar Datos Personales'}
          </button>
        </div>

        ${isEditing ? `
          <!-- Inline Edit Information Card -->
          <div class="diorama-card-3d" style="
            background: var(--surface-card); border-radius: 22px; padding: 20px;
            border: 1.5px solid var(--accent-secondary); margin-bottom: 20px;
          ">
            <h4 style="color: var(--text-primary); font-size: 1rem; font-weight: 800; margin-bottom: 14px; display:flex; align-items:center; gap:6px;">
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

        <!-- Only Logout Button (Cleaned as requested by user) -->
        <div style="margin-top: 20px;">
          <button id="profile-logout-btn" class="btn" style="
            width: 100%; padding: 16px; font-weight: 900; font-size: 1.05rem;
            background: rgba(255, 77, 77, 0.15); border: 2px solid var(--danger);
            color: var(--danger); border-radius: 20px;
            display: flex; align-items: center; justify-content: center; gap: 10px;
            box-shadow: 0 6px 15px rgba(255, 77, 77, 0.2); cursor: pointer;
          ">
            ${icon('logout', 20)} Cerrar Sesión / Salir de la App
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
