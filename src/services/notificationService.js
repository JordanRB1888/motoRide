import { audioEffects } from '../utils/audioEffects.js';
import { socket } from './socketClient.js';

class NotificationService {
    constructor() {
        this.prefix = '58express_notifications_';
        socket.on('platform:notification', (payload = {}) => {
            let session = null;
            try { session = JSON.parse(localStorage.getItem('58express_session') || 'null'); } catch {}
            const user = session?.user;
            if (!user?.id || (payload.targetRole && payload.targetRole !== 'all' && payload.targetRole !== user.role)) return;
            this.notify(user.id, {
                title: payload.title || 'Aviso de +58express',
                message: payload.message || '',
                category: payload.category || 'SYSTEM',
                icon: payload.icon || '🔔'
            });
        });
    }

    getNotifications(userId) {
        try {
            const key = `${this.prefix}${userId || 'global'}`;
            const data = localStorage.getItem(key);
            if (data) {
                const parsed = JSON.parse(data);
                const realNotifications = parsed.filter(item => !['notif_1', 'notif_2', 'notif_3'].includes(item.id));
                if (realNotifications.length !== parsed.length) localStorage.setItem(key, JSON.stringify(realNotifications));
                return realNotifications;
            }
            return [];
        } catch (e) {
            console.error('Error fetching notifications', e);
            return [];
        }
    }

    saveNotifications(userId, list) {
        try {
            const key = `${this.prefix}${userId || 'global'}`;
            localStorage.setItem(key, JSON.stringify(list));
            socket.emit('notifications:updated', { userId, count: list.filter(n => !n.read).length });
            window.dispatchEvent(new CustomEvent('58express:notifications-updated', {
                detail: { userId, count: list.filter(n => !n.read).length }
            }));
        } catch (e) {
            console.error('Error saving notifications', e);
        }
    }

    addNotification(userId, { title, message, category = 'SYSTEM', icon = '🔔' }) {
        const list = this.getNotifications(userId);
        const newNotif = {
            id: 'notif_' + Date.now(),
            title,
            message,
            category,
            icon,
            read: false,
            timestamp: new Date().toISOString()
        };

        list.unshift(newNotif);
        if (list.length > 100) list.length = 100;
        this.saveNotifications(userId, list);

        // Play audio effect
        if (category === 'TRIP') {
            audioEffects.playRideIncoming();
        } else if (category === 'FINANCE') {
            audioEffects.playSuccess();
        } else {
            audioEffects.playNotification();
        }

        return newNotif;
    }

    async notify(userId, payload, nativeOptions = {}) {
        const notification = this.addNotification(userId, payload);
        await this.triggerNativeNotification(payload.title, payload.message, { tag: notification.id, ...nativeOptions });
        return notification;
    }

    async requestBrowserPermission() {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    }

    async triggerNativeNotification(title, message, options = {}) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.getRegistration();
                    if (reg && reg.showNotification) {
                        await reg.showNotification(title, {
                            body: message,
                            icon: '/notification-pin-v2.png',
                            badge: '/notification-pin-v2.png',
                            vibrate: [300, 100, 300],
                            ...options
                        });
                        return;
                    }
                }
                new Notification(title, {
                    body: message,
                    icon: '/notification-pin-v2.png',
                    badge: '/notification-pin-v2.png',
                    ...options
                });
            } catch (e) {
                console.warn('Native notification error:', e);
            }
        }
    }

    broadcastAnnouncement(targetRole, title, message) {
        const globalNotif = this.addNotification('global', {
            title: `📢 ${title}`,
            message,
            category: 'ANNOUNCEMENT',
            icon: '📢'
        });
        this.triggerNativeNotification(`📢 ${title}`, message);
        return globalNotif;
    }

    markAllAsRead(userId) {
        const list = this.getNotifications(userId);
        list.forEach(n => n.read = true);
        this.saveNotifications(userId, list);
    }

    getUnreadCount(userId) {
        const list = this.getNotifications(userId);
        return list.filter(n => !n.read).length;
    }
}

export const notificationService = new NotificationService();
