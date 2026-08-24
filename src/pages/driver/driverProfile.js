import { icon } from '../../utils/icons.js';
import { authService } from '../../services/authService.js';
import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { createAdminSupportChat } from '../../components/adminSupportChat.js';
import { getBcvEuroRate, formatVes } from '../../utils/bcvRates.js';

import { createPrivatePhotoLoader } from '../../utils/privatePhoto.js';
import { localAvatarHtml } from '../../utils/localAvatar.js';
export function renderDriverProfile(container, options = {}) {
  // Aviso para que la cabecera de la aplicacion revoque su copia y la renueve.
  const notifyPhotoChanged = photoUrl => options.onPhotoChanged?.(photoUrl);
  // Dueno unico de la object URL de la fotografia propia.
  const privatePhotos = createPrivatePhotoLoader({ loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint) });
  const user = authService.getCurrentUser();
  if (!user) return;

  const bcvRate = getBcvEuroRate();
  const balanceEUR = Number(user.walletBalance || 0);
  const hasWalletDebt = balanceEUR < 0;
  const formattedVES = formatVes(balanceEUR);

  let isEditing = false;

  const renderView = () => {
    const driverFullName = `${user.firstName || 'Carlos'} ${user.lastName || 'Mendoza'}`;
    const avatarLocal = localAvatarHtml({ name: driverFullName, role: 'driver', label: driverFullName });

    container.innerHTML = `
      <div class="driver-profile-page driver-profile-premium fade-in" style="padding: 24px 16px 120px; max-width: 440px; margin: 0 auto;">

        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
          <div>
            <h2 style="color: var(--text-primary); font-size: 1.4rem; font-weight: 900; margin: 0; letter-spacing: -0.5px;">Mi Perfil Conductor</h2>
            <small style="color: var(--text-secondary); font-size: 0.8rem;">Mototaxista Oficial +58</small>
          </div>
          <span style="
            font-size: 0.78rem; padding: 6px 14px; border-radius: 20px; font-weight: 800;
            background: rgba(0, 230, 118, 0.12); color: var(--success); border: 1.5px solid var(--success);
            display: inline-flex; align-items: center; gap: 6px;
          ">
            ${icon('check', 14)} Cuenta Habilitada
          </span>
        </div>

        <!-- VIP Driver Passport Card -->
        <div class="diorama-card-3d driver-profile-identity-card" style="
          background: var(--surface-card); border-radius: 28px; padding: 28px 20px; text-align: center;
          border: 1.5px solid var(--border-gold); box-shadow: 0 20px 45px rgba(0,0,0,0.6); margin-bottom: 20px;
          position: relative; overflow: hidden;
        ">


          <!-- Avatar Container -->
          <div class="driver-profile-avatar-wrap" style="position: relative; width: 108px; height: 108px; margin: 0 auto 16px;">
            <input type="file" id="driver-photo-input" accept="image/*" style="display: none;" />
            ${avatarLocal}<img id="driver-avatar-img" hidden style="
              width: 100%; height: 100%; border-radius: 50%;
              border: 3.5px solid var(--x58-border-strong);
              box-shadow: 0 8px 24px rgba(0,0,0,.34);
              object-fit: cover;
            ">

            <button id="btn-trigger-driver-photo" style="
              position: absolute; bottom: 0; right: -2px;
              background: var(--x58-yellow); color: var(--x58-yellow-ink); font-size: 0.75rem;
              padding: 5px 10px; border-radius: 14px; font-weight: 900;
              box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer; border: 1.5px solid var(--x58-surface-0);
              display: flex; align-items: center; gap: 4px;
            " title="Subir Foto Real del Conductor">
              Foto Real
            </button>
          </div>

          <h3 style="color: var(--text-primary); font-size: 1.35rem; font-weight: 900; margin: 0 0 12px; letter-spacing: -0.3px;">
            ${driverFullName}
          </h3>

          <!-- Details Pill Grid -->
          <div class="driver-profile-details" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; text-align: left; background: var(--surface-elevated); padding: 14px 16px; border-radius: 18px; border: 1px solid var(--border-color);">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                ${icon('phone', 14)} Teléfono
              </span>
              <strong style="color: var(--text-primary); font-weight: 700;">${user.phone || '+58 414-000-0004'}</strong>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                ${icon('shield', 14)} Cédula / ID
              </span>
              <strong style="color: var(--text-primary); font-weight: 700;">${user.cedula || 'V-19.402.103'}</strong>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
              <span style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                ${icon('bike', 14)} Vehículo
              </span>
              <strong style="color: var(--x58-yellow-text); font-weight: 800;">${user.vehicleBrand || 'Bera'} ${user.vehicleModel || 'BR200'} (${user.vehiclePlate || 'AC3M49P'})</strong>
            </div>
          </div>

          <!-- Edit Driver Info Button -->
          <button id="btn-toggle-edit-driver" class="btn" style="
            width: 100%; padding: 12px; border-radius: 16px; background: rgba(0, 210, 255, 0.12);
            border: 1.5px solid var(--accent-secondary); color: var(--accent-secondary);
            font-weight: 800; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          ">
            ${icon('edit', 16)} ${isEditing ? 'Cancelar Edición' : 'Editar Datos de Moto y Conductor'}
          </button>
        </div>

        <div class="driver-profile-stats">
          <div><span>${icon('starFilled', 24)}</span><strong>${Number(user.rating || 4.9).toFixed(1)}</strong><small>Calificación promedio</small></div>
          <div><span>${icon('history', 24)}</span><strong>${Number(user.totalTrips || 0)}</strong><small>Viajes completados</small></div>
        </div>

        ${isEditing ? `
          <!-- Inline Edit Driver Information Card -->
          <div class="diorama-card-3d" style="
            background: var(--surface-card); border-radius: 22px; padding: 20px;
            border: 1.5px solid var(--accent-secondary); margin-bottom: 20px;
          ">
            <h4 style="color: var(--text-primary); font-size: 1rem; font-weight: 800; margin-bottom: 14px;">
              ${icon('edit', 16)} Modificar Vehículo y Datos Personales
            </h4>

            <form id="edit-driver-form" style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Nombre *</small>
                  <input type="text" id="edit-drv-fname" value="${user.firstName || ''}" required style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Apellido *</small>
                  <input type="text" id="edit-drv-lname" value="${user.lastName || ''}" required style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Teléfono *</small>
                  <input type="text" id="edit-drv-phone" value="${user.phone || ''}" required style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Edad / Cédula</small>
                  <input type="text" id="edit-drv-cedula" value="${user.cedula || 'V-19.402.103'}" style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Marca de Moto *</small>
                  <input type="text" id="edit-drv-brand" value="${user.vehicleBrand || 'Bera'}" required placeholder="Ej: Bera, Empire, UM" style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Modelo de Moto *</small>
                  <input type="text" id="edit-drv-model" value="${user.vehicleModel || 'BR200'}" required placeholder="Ej: SBR, BR200, Owen" style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Placa de la Moto *</small>
                  <input type="text" id="edit-drv-plate" value="${user.vehiclePlate || 'AC3M49P'}" required placeholder="Ej: AC3M49P" style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
                <div>
                  <small style="color: var(--text-secondary); font-weight:700;">Color de la Moto</small>
                  <input type="text" id="edit-drv-color" value="${user.vehicleColor || 'Negro'}" placeholder="Ej: Negro, Rojo, Azul" style="
                    width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-color);
                    background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.9rem; font-weight:700;
                  " />
                </div>
              </div>

              <button type="submit" id="btn-save-driver-info" class="btn btn-3d primary-btn" style="
                width: 100%; padding: 14px; font-weight: 900; font-size: 0.95rem; margin-top: 6px;
                background: linear-gradient(135deg, var(--x58-yellow), var(--x58-yellow-active)); color: var(--x58-text-inverse); cursor: pointer;
              ">
                ✓ GUARDAR DATOS DEL CONDUCTOR
              </button>
            </form>
          </div>
        ` : ''}

        <!-- Money Withdrawal Card in EUR -->
        <div class="diorama-card-3d driver-profile-balance-card" style="
          padding: 20px; border-radius: 24px; background: var(--surface-card);
          border: 1.5px solid var(--border-gold); margin-bottom: 20px;
        ">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
            <div>
              <small style="color:var(--text-secondary); display:block; font-size:0.78rem;">${hasWalletDebt ? 'SALDO DEUDOR / COMISIONES PENDIENTES' : 'BALANCE DISPONIBLE EN USD'}</small>
              <div style="font-size: 2rem; font-weight: 900; color: ${hasWalletDebt ? 'var(--x58-danger)' : 'var(--x58-yellow-text)'}; font-family:var(--x58-font-display); font-variant-numeric:tabular-nums;">
                ${hasWalletDebt ? '−' : ''}$${Math.abs(balanceEUR).toFixed(2)} USD
              </div>
              <div style="color:var(--text-secondary); font-size:0.85rem; font-weight:700;">
                ~ ${formattedVES} (Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)})
              </div>
            </div>
          </div>

          <button id="btn-request-withdrawal" class="btn btn-3d primary-btn" ${hasWalletDebt ? 'disabled' : ''} style="
            width: 100%; padding: 16px; font-weight: 900; font-size: 1rem;
            background: linear-gradient(135deg, var(--x58-yellow), var(--x58-yellow-active)); color: var(--x58-text-inverse);
            border-radius: 16px; margin-top: 6px;
          ">
            ${hasWalletDebt ? 'RECARGA DESDE GANANCIAS PARA QUEDAR AL DÍA' : icon('wallet', 16) + ' SOLICITAR RETIRO POR PAGO MÓVIL'}
          </button>
        </div>

        <div class="driver-profile-actions">
          <button type="button" id="btn-open-driver-documents" class="driver-profile-row">
            <span class="driver-profile-row-icon">${icon('shield', 20)}</span>
            <span class="driver-profile-row-text">
              <strong>Mis documentos</strong>
              <small>Cédula, licencia, RCV y vehículo</small>
            </span>
            <span class="driver-profile-row-go">${icon('chevronRight', 16)}</span>
          </button>

          <button type="button" id="btn-open-admin-chat" class="driver-profile-row">
            <span class="driver-profile-row-icon">${icon('message', 20)}</span>
            <span class="driver-profile-row-text">
              <strong>Hablar con Administración</strong>
              <small>Liquidaciones, documentos o viajes · 24/7</small>
            </span>
            <span class="driver-profile-row-go">${icon('chevronRight', 16)}</span>
          </button>

          <button type="button" id="driver-logout-btn" class="driver-profile-row driver-profile-row--salir">
            <span class="driver-profile-row-icon">${icon('logout', 20)}</span>
            <span class="driver-profile-row-text"><strong>Cerrar sesión</strong></span>
          </button>
        </div>
      </div>
    `;

      // Solo despues de pintar el estado neutro se pide la fotografia real.
      privatePhotos.applyTo(container.querySelector('#driver-avatar-img'), user.photoUrl, { key: 'propia' });

    // Photo Upload Triggers
    const driverPhotoInput = container.querySelector('#driver-photo-input');
    const driverPhotoBtn = container.querySelector('#btn-trigger-driver-photo');

    if (driverPhotoBtn && driverPhotoInput) {
      driverPhotoBtn.addEventListener('click', () => driverPhotoInput.click());
      driverPhotoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          const form = new FormData();
          form.append('file', file);
          const updated = await apiService.postForm('/auth/me/photo', form);
          if (!updated) return showToast('No se pudo guardar la foto.', 'error');
          authService.acceptSession(updated, authService.getSession().token);
          Object.assign(user, updated);
          // Antes se creaba una object URL que nunca se revocaba.
          privatePhotos.release('propia');
          await privatePhotos.applyTo(container.querySelector('#driver-avatar-img'), updated.photoUrl, { key: 'propia' });
          notifyPhotoChanged(updated.photoUrl);
          showToast('Foto guardada de forma segura.', 'success');
        }
      });
    }

    // Toggle Edit Info Trigger
    const toggleEditBtn = container.querySelector('#btn-toggle-edit-driver');
    if (toggleEditBtn) {
      toggleEditBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        renderView();
      });
    }

    // Edit Driver Form Submit
    const editForm = container.querySelector('#edit-driver-form');
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = container.querySelector('#edit-drv-fname').value.trim();
        const lastName = container.querySelector('#edit-drv-lname').value.trim();
        const phone = container.querySelector('#edit-drv-phone').value.trim();
        const cedula = container.querySelector('#edit-drv-cedula').value.trim();
        const vehicleBrand = container.querySelector('#edit-drv-brand').value.trim();
        const vehicleModel = container.querySelector('#edit-drv-model').value.trim();
        const vehiclePlate = container.querySelector('#edit-drv-plate').value.trim();
        const vehicleColor = container.querySelector('#edit-drv-color').value.trim();

        const result = await authService.updateProfile({ firstName, lastName, phone, cedula, vehicleBrand, vehicleModel, vehiclePlate, vehicleColor });
        if (!result.success) return showToast('No se pudieron guardar los datos.', 'error');
        Object.assign(user, result.user);
        showToast('Datos del conductor actualizados.', 'success');
        isEditing = false;
        renderView();
      });
    }

    // Request Withdrawal Modal Event
    container.querySelector('#btn-request-withdrawal')?.addEventListener('click', () => {
      openWithdrawalModal(container, balanceEUR, bcvRate);
    });

    // Open Admin Chat Event
    container.querySelector('#btn-open-admin-chat').addEventListener('click', () => {
      const chatModal = createAdminSupportChat(user);
      document.body.appendChild(chatModal);
    });

    container.querySelector('#btn-open-driver-documents')?.addEventListener('click', () => options.onOpenDocuments?.());

    // Logout Event
    container.querySelector('#driver-logout-btn').addEventListener('click', () => {
      authService.logout();
      window.navigateTo('#/');
    });
  };

  renderView();
}

function openWithdrawalModal(container, balanceEUR, bcvRate) {
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(10, 15, 24, 0.88); backdrop-filter: blur(20px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `;

  const vesAmount = balanceEUR * bcvRate;

  modalOverlay.innerHTML = `
    <div class="diorama-card-3d glass-panel" style="
      width: 100%; max-width: 440px; padding: 24px; border-radius: 28px;
      background: var(--surface-card); border: 2px solid var(--accent-primary);
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 35px rgba(255,193,7,0.3);
      animation: dioramaLand 0.35s ease-out;
    ">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 18px;">
        <h3 style="color: var(--text-primary); margin:0; font-size:1.3rem; font-weight:800;">💸 Retiro de Ganancias (Euros)</h3>
        <button id="close-withdrawal" style="color:var(--text-secondary); font-size:1.3rem; background:none; border:none; cursor:pointer;">✕</button>
      </div>

      <div style="background: rgba(255,193,7,0.08); padding: 14px; border-radius: 16px; border: 1px solid var(--border-gold); margin-bottom: 18px;">
        <small style="color:var(--text-secondary); display:block;">Disponible para transferir por Tasa BCV Euro (Bs. ${bcvRate.toFixed(2)}):</small>
        <div style="color:var(--x58-yellow-text); font-weight:900; font-size:1.5rem; font-family:var(--x58-font-display); font-variant-numeric:tabular-nums;">
          €${balanceEUR.toFixed(2)} EUR <span style="font-size:0.9rem; font-weight:700; color:var(--text-secondary);"> (~ Bs. ${vesAmount.toLocaleString('es-VE', {minimumFractionDigits:2})})</span>
        </div>
      </div>

      <form id="withdrawal-form" style="display:flex; flex-direction:column; gap: 14px;">
        <div>
          <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Monto a retirar (€ EUR):</label>
          <input type="number" id="withdraw-amount" value="${balanceEUR.toFixed(2)}" max="${balanceEUR}" min="1" step="0.5" required style="
            width:100%; padding:14px; border-radius:14px; border:1px solid var(--border-gold);
            background:var(--surface-input); color:white; font-size:1.1rem; font-weight:700; outline:none;
          ">
        </div>

        <div>
          <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Banco de Destino (Pago Móvil):</label>
          <select id="withdraw-bank" style="
            width:100%; padding:14px; border-radius:14px; border:1px solid var(--border-color);
            background:var(--surface-input); color:white; font-size:0.95rem; outline:none;
          ">
            <option value="0134">0134 - Banesco Banco Universal</option>
            <option value="0102">0102 - Banco de Venezuela</option>
            <option value="0105">0105 - Banco Mercantil</option>
            <option value="0108">0108 - BBVA Provincial</option>
          </select>
        </div>

        <div>
          <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Teléfono Pago Móvil:</label>
          <input type="text" id="withdraw-phone" value="+58 414-000-0004" required style="
            width:100%; padding:14px; border-radius:14px; border:1px solid var(--border-color);
            background:var(--surface-input); color:white; font-size:0.95rem; outline:none;
          ">
        </div>

        <div>
          <label style="color:var(--text-secondary); font-size:0.85rem; display:block; margin-bottom:6px;">Cédula / RIF:</label>
          <input type="text" id="withdraw-cedula" value="V-18920492" required style="
            width:100%; padding:14px; border-radius:14px; border:1px solid var(--border-color);
            background:var(--surface-input); color:white; font-size:0.95rem; outline:none;
          ">
        </div>

        <button type="submit" class="btn btn-3d primary-btn" style="
          width:100%; padding:16px; font-weight:900; font-size:1.1rem; margin-top:8px;
          background: linear-gradient(135deg, var(--x58-yellow), var(--x58-yellow-active)); color:var(--x58-text-inverse);
        ">
          ✓ CONFIRMAR SOLICITUD DE RETIRO
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  modalOverlay.querySelector('#close-withdrawal').addEventListener('click', () => modalOverlay.remove());

  modalOverlay.querySelector('#withdrawal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = modalOverlay.querySelector('#withdraw-amount').value;
    const result = await apiService.post('/wallet/payouts', { amount: Number(amount) });
    if (!result) return showToast(apiService.lastError?.error === 'PAYOUT_ALREADY_PENDING' ? 'Ya existe una liquidación pendiente.' : 'No se pudo enviar la liquidación.', 'error');
    showToast('Solicitud de liquidación enviada a Administración.', 'success');
    modalOverlay.remove();
  });
}
