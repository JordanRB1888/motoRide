import { notificationService } from '../services/notificationService.js';
import { audioEffects } from '../utils/audioEffects.js';
import { showToast } from './toast.js';
import { icon } from '../utils/icons.js';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export function createNotificationCenterModal(user, onClose) {
    const userId = user?.id || 'global';
    let filterCategory = 'ALL';

    const overlay = document.createElement('div');
    overlay.className = 'notification-center-overlay fade-in';

    const modal = document.createElement('section');
    modal.className = 'notification-center-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Centro de Notificaciones');

    const updateHeaderBadges = () => {
        const unreadCount = notificationService.getUnreadCount(userId);
        ['#notif-badge-passenger', '#header-notif-btn-driver span', '#header-notif-btn-admin span'].forEach(selector => {
            const badge = document.querySelector(selector);
            if (!badge) return;
            badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        });
    };

    const closeModal = () => {
        window.removeEventListener('58express:notifications-updated', liveUpdateHandler);
        overlay.remove();
        onClose?.();
    };

    const render = () => {
        let notifications = notificationService.getNotifications(userId);
        if (filterCategory !== 'ALL') notifications = notifications.filter(item => item.category === filterCategory);

        const isMuted = audioEffects.isMuted();
        const unreadCount = notificationService.getUnreadCount(userId);

        modal.innerHTML = `
            <header class="notification-center-header">
                <div class="notification-center-heading">
                    <div class="notification-center-bell">${icon('bell', 20)}</div>
                    <div class="notification-center-title">
                        <strong>Centro de Notificaciones</strong>
                        <small>Avisos, alertas de carreras y finanzas</small>
                    </div>
                </div>
                <div class="notification-center-actions">
                    <button id="btn-toggle-sound" class="notification-sound-toggle ${isMuted ? 'muted' : ''}" title="Alternar sonidos">
                        ${icon(isMuted ? 'volumeX' : 'volume2', 15)}
                        <span>${isMuted ? 'Silenciado' : 'Sonido activado'}</span>
                    </button>
                    <button id="close-notif-btn" class="notification-close" aria-label="Cerrar">${icon('close', 20)}</button>
                </div>
                ${unreadCount > 0 ? `<div class="notification-unread-summary"><strong>${unreadCount}</strong><span>${unreadCount === 1 ? 'nueva' : 'nuevas'}</span></div>` : ''}
            </header>

            <nav class="notification-category-tabs" aria-label="Filtrar notificaciones">
                <button class="cat-filter-btn ${filterCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">${icon('grid', 14)} Todas</button>
                <button class="cat-filter-btn trip ${filterCategory === 'TRIP' ? 'active' : ''}" data-cat="TRIP">${icon('navigation', 14)} Carreras</button>
                <button class="cat-filter-btn finance ${filterCategory === 'FINANCE' ? 'active' : ''}" data-cat="FINANCE">${icon('dollarSign', 14)} Finanzas</button>
                <button class="cat-filter-btn announcement ${filterCategory === 'ANNOUNCEMENT' ? 'active' : ''}" data-cat="ANNOUNCEMENT">${icon('bell', 14)} Anuncios</button>
            </nav>

            <div class="notification-list">
                ${notifications.length ? notifications.map(item => `
                    <article class="notif-item-card ${item.read ? 'is-read' : 'is-unread'} ${String(item.category || '').toLowerCase()}" data-id="${item.id}">
                        <div class="notification-item-icon">
                            ${item.category === 'TRIP' ? icon('navigation', 20) : item.category === 'FINANCE' ? icon('dollarSign', 20) : icon('bell', 20)}
                        </div>
                        <div class="notification-item-copy">
                            <div class="notification-item-heading">
                                <strong>${escapeHtml(item.title)}</strong>
                                <time>${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                            </div>
                            <p>${escapeHtml(item.message)}</p>
                        </div>
                        ${item.read ? '' : '<span class="notification-new-dot" aria-label="No leída"></span>'}
                        <span class="notification-chevron" aria-hidden="true">›</span>
                    </article>
                `).join('') : `
                    <div class="notification-empty">
                        ${icon('bell', 32)}
                        <p>No tienes notificaciones en esta categoría</p>
                    </div>
                `}
            </div>

            <footer class="notification-center-footer">
                <button id="btn-mark-read">${icon('check', 16)} Marcar todas como leídas</button>
                <button id="btn-test-sound">${icon('volume2', 16)} Probar sonido</button>
            </footer>
        `;

        modal.querySelector('#close-notif-btn').addEventListener('click', closeModal);
        modal.querySelector('#btn-toggle-sound').addEventListener('click', () => {
            const muted = audioEffects.toggleMute();
            showToast(muted ? 'Sonidos desactivados' : 'Sonidos activados', 'info');
            render();
        });
        modal.querySelector('#btn-test-sound').addEventListener('click', () => {
            audioEffects.playNotification();
            showToast('Sonido de notificación probado exitosamente', 'success');
        });
        modal.querySelector('#btn-mark-read').addEventListener('click', () => {
            notificationService.markAllAsRead(userId);
            updateHeaderBadges();
            showToast('Todas las notificaciones marcadas como leídas', 'success');
            render();
        });
        modal.querySelectorAll('.cat-filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                filterCategory = button.dataset.cat;
                render();
            });
        });
        modal.querySelectorAll('.notif-item-card').forEach(card => {
            card.addEventListener('click', () => {
                const list = notificationService.getNotifications(userId);
                const item = list.find(notification => notification.id === card.dataset.id);
                if (!item) return;
                item.read = true;
                notificationService.saveNotifications(userId, list);
                updateHeaderBadges();
                render();
            });
        });
    };

    const liveUpdateHandler = event => {
        if (event.detail?.userId === userId && overlay.isConnected) render();
    };

    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeModal();
    });
    overlay.appendChild(modal);
    render();
    window.addEventListener('58express:notifications-updated', liveUpdateHandler);
    return overlay;
}
