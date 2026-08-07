import { notificationService } from '../services/notificationService.js';
import { audioEffects } from '../utils/audioEffects.js';
import { showToast } from './toast.js';

export function createNotificationCenterModal(user, onClose) {
    const userId = user?.id || 'global';
    let filterCategory = 'ALL';

    const overlay = document.createElement('div');
    overlay.className = 'diorama-card-3d fade-in';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 25000;
        background: rgba(10, 15, 24, 0.92); backdrop-filter: blur(20px);
        display: flex; align-items: center; justify-content: center; padding: 16px;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 100%; max-width: 460px; height: 600px; max-height: 88vh;
        background: var(--surface-card); border-radius: 28px;
        border: 2px solid var(--accent-primary);
        box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 35px rgba(255,193,7,0.3);
        display: flex; flex-direction: column; overflow: hidden;
        animation: dioramaLand 0.35s ease-out;
    `;

    const updateHeaderBadges = () => {
        const unreadCount = notificationService.getUnreadCount(userId);
        const passBadge = document.querySelector('#notif-badge-passenger');
        if (passBadge) {
            passBadge.textContent = unreadCount;
            passBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        const driverBadge = document.querySelector('#header-notif-btn-driver span');
        if (driverBadge) {
            driverBadge.textContent = unreadCount;
            driverBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        const adminBadge = document.querySelector('#header-notif-btn-admin span');
        if (adminBadge) {
            adminBadge.textContent = unreadCount;
            adminBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
    };

    const render = () => {
        let notifications = notificationService.getNotifications(userId);
        if (filterCategory !== 'ALL') {
            notifications = notifications.filter(n => n.category === filterCategory);
        }

        const isMuted = audioEffects.isMuted();

        modal.innerHTML = `
            <!-- Header -->
            <div style="padding: 16px 20px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div style="width:38px; height:38px; border-radius:50%; background:rgba(255,193,7,0.15); display:flex; align-items:center; justify-content:center; color:var(--accent-primary); font-size:1.2rem;">
                        🔔
                    </div>
                    <div>
                        <strong style="display:block; color:var(--text-primary); font-size: 1.05rem;">Centro de Notificaciones</strong>
                        <small style="color:var(--text-secondary); font-size: 0.78rem;">Avisos, alertas de carreras y finanzas</small>
                    </div>
                </div>
                
                <div style="display:flex; align-items:center; gap: 8px;">
                    <button id="btn-toggle-sound" style="
                        padding: 6px 12px; border-radius: 14px; font-size: 0.78rem; font-weight: 800; cursor: pointer;
                        background: ${isMuted ? 'rgba(255,77,77,0.15)' : 'rgba(0,230,118,0.15)'};
                        color: ${isMuted ? 'var(--danger)' : 'var(--success)'};
                        border: 1px solid ${isMuted ? 'var(--danger)' : 'var(--success)'};
                    " title="Alternar Sonidos Neón">
                        ${isMuted ? '🔇 Silenciado' : '🔊 Sonido Activado'}
                    </button>
                    <button id="close-notif-btn" style="color:var(--text-secondary); font-size: 1.3rem; background:none; border:none; cursor:pointer;">✕</button>
                </div>
            </div>

            <!-- Category Filter Bar -->
            <div style="padding: 10px 16px; background: rgba(255,193,7,0.04); display:flex; gap: 6px; overflow-x:auto; border-bottom: 1px solid var(--border-color);">
                <button class="cat-filter-btn" data-cat="ALL" style="
                    padding: 6px 12px; border-radius: 14px; font-size: 0.78rem; font-weight: 800; white-space: nowrap; cursor: pointer;
                    background: ${filterCategory === 'ALL' ? 'var(--accent-primary)' : 'var(--surface-card)'};
                    color: ${filterCategory === 'ALL' ? '#121824' : 'var(--text-primary)'};
                    border: 1px solid var(--border-color);
                ">Todas</button>

                <button class="cat-filter-btn" data-cat="TRIP" style="
                    padding: 6px 12px; border-radius: 14px; font-size: 0.78rem; font-weight: 800; white-space: nowrap; cursor: pointer;
                    background: ${filterCategory === 'TRIP' ? 'var(--accent-secondary)' : 'var(--surface-card)'};
                    color: ${filterCategory === 'TRIP' ? '#121824' : 'var(--accent-secondary)'};
                    border: 1px solid var(--border-color);
                ">🚀 Carreras</button>

                <button class="cat-filter-btn" data-cat="FINANCE" style="
                    padding: 6px 12px; border-radius: 14px; font-size: 0.78rem; font-weight: 800; white-space: nowrap; cursor: pointer;
                    background: ${filterCategory === 'FINANCE' ? 'var(--success)' : 'var(--surface-card)'};
                    color: ${filterCategory === 'FINANCE' ? '#121824' : 'var(--success)'};
                    border: 1px solid var(--border-color);
                ">💵 Finanzas</button>

                <button class="cat-filter-btn" data-cat="ANNOUNCEMENT" style="
                    padding: 6px 12px; border-radius: 14px; font-size: 0.78rem; font-weight: 800; white-space: nowrap; cursor: pointer;
                    background: ${filterCategory === 'ANNOUNCEMENT' ? 'var(--warning)' : 'var(--surface-card)'};
                    color: ${filterCategory === 'ANNOUNCEMENT' ? '#121824' : 'var(--warning)'};
                    border: 1px solid var(--border-color);
                ">📢 Anuncios</button>
            </div>

            <!-- Notifications Body -->
            <div style="flex:1; padding: 16px; overflow-y: auto; display:flex; flex-direction:column; gap: 10px;">
                ${notifications.length > 0 ? notifications.map(n => `
                    <div class="notif-item-card" data-id="${n.id}" style="
                        padding: 14px; border-radius: 18px; transition: all 0.2s ease; cursor: pointer;
                        background: ${n.read ? 'var(--surface-elevated)' : 'linear-gradient(135deg, rgba(255,193,7,0.14) 0%, rgba(255,143,0,0.08) 100%)'};
                        border: ${n.read ? '1px solid var(--border-color)' : '1.5px solid var(--border-gold)'};
                        display:flex; gap: 12px; align-items: flex-start;
                    ">
                        <div style="font-size: 1.5rem; line-height: 1;">${n.icon || '🔔'}</div>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                                <strong style="color:var(--text-primary); font-size: 0.9rem;">${n.title}</strong>
                                <small style="color:var(--text-muted); font-size: 0.72rem;">${new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                            </div>
                            <p style="color:var(--text-secondary); font-size: 0.82rem; margin:0; line-height: 1.4;">${n.message}</p>
                        </div>
                    </div>
                `).join('') : `
                    <div style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
                        <p style="font-size: 2.5rem; margin-bottom: 10px;">🔕</p>
                        <p>No tienes notificaciones en esta categoría</p>
                    </div>
                `}
            </div>

            <!-- Footer Action Bar -->
            <div style="padding: 12px 16px; background: var(--surface-elevated); border-top: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <button id="btn-mark-read" style="color: var(--accent-primary); font-size: 0.82rem; font-weight: 800; background:none; border:none; cursor:pointer;">
                    ✓ Marcar todas como leídas
                </button>
                <button id="btn-test-sound" style="color: var(--accent-secondary); font-size: 0.82rem; font-weight: 800; background:none; border:none; cursor:pointer;">
                    🔊 Probar Sonido
                </button>
            </div>
        `;

        overlay.innerHTML = '';
        overlay.appendChild(modal);

        modal.querySelector('#close-notif-btn').addEventListener('click', () => {
            overlay.remove();
            if (onClose) onClose();
        });

        modal.querySelector('#btn-toggle-sound').addEventListener('click', () => {
            const muted = audioEffects.toggleMute();
            showToast(muted ? '🔇 Sonidos desactivados' : '🔊 Sonidos neón activados', 'info');
            render();
        });

        modal.querySelector('#btn-test-sound').addEventListener('click', () => {
            audioEffects.playNotification();
            showToast('🔊 Sonido de notificación probado exitosamente', 'success');
        });

        modal.querySelector('#btn-mark-read').addEventListener('click', () => {
            notificationService.markAllAsRead(userId);
            updateHeaderBadges();
            showToast('Todas las notificaciones marcadas como leídas', 'success');
            render();
        });

        modal.querySelectorAll('.cat-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filterCategory = btn.dataset.cat;
                render();
            });
        });

        modal.querySelectorAll('.notif-item-card').forEach(card => {
            card.addEventListener('click', () => {
                const notifId = card.dataset.id;
                const list = notificationService.getNotifications(userId);
                const item = list.find(n => n.id === notifId);
                if (item) {
                    item.read = true;
                    notificationService.saveNotifications(userId, list);
                    updateHeaderBadges();
                    render();
                }
            });
        });
    };

    render();
    return overlay;
}
