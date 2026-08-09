import { icon } from '../../utils/icons.js';
import { authService } from '../../services/authService.js';
import { apiService } from '../../services/apiService.js';
import { showToast } from '../../components/toast.js';
import { createAdminSupportChat } from '../../components/adminSupportChat.js';
import { renderDriverApplicationStatus } from '../../components/driverApplicationStatus.js';

const avatarFallback = user => `https://ui-avatars.com/api/?name=${encodeURIComponent(`${user.firstName || 'Cliente'} ${user.lastName || ''}`)}&background=FFC107&color=07111d&size=192&bold=true`;

export function renderProfile(container) {
  const user = authService.getCurrentUser();
  if (!user) return;
  let editing = false;
  let privateAvatarUrl = null;

  const hydrateAvatar = async () => {
    if (!String(user.photoUrl || '').startsWith('/')) return;
    const url = await apiService.getPrivateFileUrl(user.photoUrl);
    if (!url) return;
    if (privateAvatarUrl) URL.revokeObjectURL(privateAvatarUrl);
    privateAvatarUrl = url;
    const image = container.querySelector('#profile-avatar-img');
    if (image) image.src = url;
  };

  const render = () => {
    container.innerHTML = `<div class="profile-page real-profile-page fade-in">
      <header class="real-profile-heading"><div><span>CUENTA +58EXPRESS</span><h2>Mi perfil</h2></div><b>${icon('check',14)} Cuenta activa</b></header>
      <section class="real-profile-card">
        <div class="real-profile-accent"></div>
        <div class="real-profile-avatar">
          <img id="profile-avatar-img" src="${String(user.photoUrl || '').startsWith('http') ? user.photoUrl : avatarFallback(user)}" alt="Foto de perfil">
          <input id="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden>
          <button id="profile-photo-button" type="button">${icon('camera',15)} Cambiar foto</button>
        </div>
        <h3>${user.firstName || ''} ${user.lastName || ''}</h3>
        <p>Pasajero registrado desde ${new Date(user.createdAt || Date.now()).toLocaleDateString('es-VE')}</p>
        <div class="real-profile-details">
          <label><span>${icon('phone',15)} Teléfono</span><strong>${user.phone || 'Sin registrar'}</strong></label>
          <label><span>${icon('message',15)} Correo</span><strong>${user.email || 'Sin registrar'}</strong></label>
          <label><span>${icon('shield',15)} Cédula / ID</span><strong>${user.cedula || 'Sin registrar'}</strong></label>
        </div>
        <div class="real-profile-stats"><article><small>VIAJES</small><strong>${Number(user.totalTrips || 0)}</strong></article><article><small>CALIFICACIÓN</small><strong>${Number(user.rating || 5).toFixed(1)} ★</strong></article></div>
        <button id="profile-edit-toggle" class="real-profile-secondary" type="button">${icon('edit',16)} ${editing ? 'Cancelar edición' : 'Editar datos personales'}</button>
      </section>
      ${editing ? `<form id="profile-edit-form" class="real-profile-form">
        <h3>Información personal</h3>
        <div><label>Nombre<input name="firstName" required minlength="2" value="${user.firstName || ''}"></label><label>Apellido<input name="lastName" required minlength="2" value="${user.lastName || ''}"></label></div>
        <label>Teléfono<input name="phone" required value="${user.phone || ''}"></label>
        <label>Cédula / ID<input name="cedula" value="${user.cedula || ''}"></label>
        <button type="submit">${icon('check',16)} Guardar cambios</button>
      </form>` : ''}
      ${user.driverApplicationId ? '<div id="driver-application-status-slot"></div>' : ''}
      <button id="passenger-support-btn" class="real-profile-support" type="button">${icon('message',17)} Atención directa con administración</button>
      <button id="profile-logout-btn" class="real-profile-logout" type="button">${icon('logout',17)} Cerrar sesión</button>
    </div>`;

    hydrateAvatar();
    if (user.driverApplicationId) renderDriverApplicationStatus(container.querySelector('#driver-application-status-slot'));
    container.querySelector('#profile-edit-toggle').onclick = () => { editing = !editing; render(); };
    container.querySelector('#profile-photo-button').onclick = () => container.querySelector('#profile-photo-input').click();
    container.querySelector('#profile-photo-input').onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return showToast('Usa JPG, PNG o WebP de hasta 5 MB.', 'error');
      const form = new FormData(); form.append('file', file);
      const button = container.querySelector('#profile-photo-button'); button.disabled = true;
      const updated = await apiService.postForm('/auth/me/photo', form); button.disabled = false;
      if (!updated) return showToast('No se pudo guardar la foto.', 'error');
      authService.acceptSession(updated, authService.getSession().token);
      Object.assign(user, updated);
      const preview = URL.createObjectURL(file);
      container.querySelector('#profile-avatar-img').src = preview;
      showToast('Foto guardada de forma segura.', 'success');
    };
    container.querySelector('#profile-edit-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await authService.updateProfile(values);
      if (!result.success) return showToast('No se pudo actualizar el perfil.', 'error');
      Object.assign(user, result.user); editing = false; showToast('Perfil actualizado.', 'success'); render();
    });
    container.querySelector('#passenger-support-btn').onclick = () => document.body.appendChild(createAdminSupportChat(user));
    container.querySelector('#profile-logout-btn').onclick = () => { authService.logout(); window.navigateTo('#/'); };
  };
  render();
}
