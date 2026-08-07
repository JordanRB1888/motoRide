import { audioEffects } from '../utils/audioEffects.js';
import { socket } from './mockSocket.js';

class NotificationService {
    constructor() {
        this.prefix = '58express_notifications_';
    }

    getNotifications(userId) {
        try {
            const key = `${this.prefix}${userId || 'global'}`;
            const data = localStorage.getItem(key);
            if (data) return JSON.parse(data);

            // Seed default initial notifications if empty
            const seed = [
                {
                    id: 'notif_1',
                    title: '🇻🇪 Tasa BCV Euro Actualizada',
                    message: 'La tasa oficial del Banco Central de Venezuela se fijó en Bs. 874.50 por Euro.',
                    category: 'ANNOUNCEMENT',
                    icon: '🇪🇺',
                    read: false,
                    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString()
                },
                {
                    id: 'notif_2',
                    title: '🛵 Moto Asignada Exitosamente',
                    message: 'Tu servicio en Maracaibo con Carlos Mendoza (Bera AC3M49P) ha sido confirmado.',
                    category: 'TRIP',
                    icon: '🚀',
                    read: false,
                    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString()
                },
                {
                    id: 'notif_3',
                    title: '💵 Saldo Acreditado por Pago Móvil',
                    message: 'Se acreditó un saldo equivalente a €25.00 EUR en tu Wallet.',
                    category: 'FINANCE',
                    icon: '💳',
                    read: true,
                    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString()
                }
            ];

            localStorage.setItem(key, JSON.stringify(seed));
            return seed;
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
                    const reg = await navigator.serviceWorker.ready;
                    if (reg && reg.showNotification) {
                        reg.showNotification(title, {
                            body: message,
                            icon: '/app-logo.png',
                            badge: '/app-logo.png',
                            vibrate: [300, 100, 300],
                            ...options
                        });
                        return;
                    }
                }
                new Notification(title, {
                    body: message,
                    icon: '/app-logo.png',
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
