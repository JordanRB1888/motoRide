import { db } from '../../services/mockDatabase.js';
import { authService } from '../../services/mockAuth.js';
import { renderFleetMap } from './fleetMap.js';
import { renderUsersManagement } from './usersManagement.js';
import { renderTariffsConfig } from './tariffsConfig.js';
import { renderFinances } from './finances.js';
import { renderAdminSupport } from './adminSupport.js';
import { initThemeToggle } from '../../utils/themeToggle.js';
import { createNotificationCenterModal } from '../../components/notificationCenterModal.js';
import { socket } from '../../services/mockSocket.js';
import { eventLogger } from '../../utils/logger.js';

export function renderAdminApp(container) {
    const admin = authService.getCurrentUser();
    
    container.innerHTML = `
        <div class="admin-app">
            <aside class="admin-sidebar" id="sidebar">
                <div class="admin-logo">
                    <img src="/logo.jpg" alt="Logo" style="width:32px; height:32px; border-radius:8px; border:1.5px solid var(--accent-primary); flex-shrink:0;">
                    <div class="logo-text-full"><span class="accent-text" style="color:var(--accent-primary);">+58</span>express</div>
                </div>
                <nav class="admin-nav">
                    <button class="nav-item active" data-target="dashboard"><span class="nav-icon">📊</span> <span class="nav-text">Dashboard</span></button>
                    <button class="nav-item" data-target="fleet"><span class="nav-icon">🗺️</span> <span class="nav-text">Mapa de Flota</span></button>
                    <button class="nav-item" data-target="users"><span class="nav-icon">👥</span> <span class="nav-text">Usuarios</span></button>
                    <button class="nav-item" data-target="tariffs"><span class="nav-icon">💰</span> <span class="nav-text">Tarifas</span></button>
                    <button class="nav-item" data-target="finances"><span class="nav-icon">📈</span> <span class="nav-text">Finanzas</span></button>
                    <button class="nav-item" data-target="support"><span class="nav-icon">🎧</span> <span class="nav-text">Soporte</span></button>
                </nav>
            </aside>
            <main class="admin-main">
                <header class="admin-header">
                    <div class="header-left">
                        <button class="mobile-menu-btn" id="menu-btn">☰</button>
                        <h2 id="page-title">Dashboard</h2>
                    </div>
                    <div class="header-right" style="display:flex; align-items:center; gap:10px;">
                        <button id="header-notif-btn-admin" style="
                            background: rgba(255,193,7,0.15); border: 1.5px solid var(--accent-primary); color: var(--accent-primary);
                            width: 36px; height: 36px; border-radius: 50%; display:flex; align-items:center; justify-content:center;
                            font-size: 1.1rem; cursor: pointer; position: relative;
                        " title="Centro de Notificaciones">
                            🔔
                            <span style="
                                position: absolute; top: -3px; right: -3px; background: var(--danger); color: white;
                                font-size: 0.65rem; font-weight: 900; width: 16px; height: 16px; border-radius: 50%;
                                display: flex; align-items: center; justify-content: center; border: 1.5px solid #121824;
                            ">3</span>
                        </button>
                        <div id="admin-theme-toggle-slot"></div>
                        <span>👋 Hola, ${admin?.firstName || 'Admin'}</span>
                        <button class="logout-btn" id="logout-btn">Salir</button>
                    </div>
                </header>
                <div class="admin-content" id="admin-content">
                    <!-- Content injected here -->
                </div>
            </main>
        </div>
    `;

    const adminThemeSlot = container.querySelector('#admin-theme-toggle-slot');
    if (adminThemeSlot) adminThemeSlot.appendChild(initThemeToggle());

    const adminNotifBtn = container.querySelector('#header-notif-btn-admin');
    if (adminNotifBtn) {
        adminNotifBtn.addEventListener('click', () => {
            const modal = createNotificationCenterModal(admin);
            container.appendChild(modal);
        });
    }

    const contentArea = container.querySelector('#admin-content');
    const pageTitle = container.querySelector('#page-title');
    const navItems = container.querySelectorAll('.nav-item');
    const sidebar = container.querySelector('#sidebar');
    
    container.querySelector('#menu-btn').addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    container.querySelector('#logout-btn').addEventListener('click', () => {
        authService.logout();
        window.navigateTo('#/');
    });

    function renderDashboard() {
        const allTrips = db.getCollection('trips') || [];
        const allUsers = db.getCollection('users') || [];
        const activeTrips = allTrips.filter(t => ['SEARCHING','DRIVER_ASSIGNED','DRIVER_EN_ROUTE','DRIVER_ARRIVED','IN_TRIP'].includes(t.status)).length;
        const onlineDrivers = allUsers.filter(u => u.role === 'driver' && (u.status === 'ONLINE' || u.status === 'IN_TRIP')).length;
        const dayIncomeEUR = 245.50;
        const bcvRate = 874.50;
        const dayIncomeVES = dayIncomeEUR * bcvRate;
        
        contentArea.innerHTML = `
            <div class="dashboard-view">
                <div style="margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="margin: 0; color: var(--text-primary); font-weight: 800;">Panel de Control Administrativo</h3>
                        <small style="color: var(--text-secondary);">Maracaibo, ${new Date().toLocaleDateString('es-VE')}</small>
                    </div>
                    <span class="badge badge-warning" style="font-size: 0.85rem; padding: 8px 14px; border: 1px solid var(--accent-primary);">
                        🇪🇺 Tasa BCV Euro: Bs. ${bcvRate.toFixed(2)}
                    </span>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card cyan diorama-card-3d">
                        <span class="kpi-label">Viajes Activos</span>
                        <span class="kpi-value">${activeTrips}</span>
                    </div>
                    <div class="kpi-card green diorama-card-3d">
                        <span class="kpi-label">Conductores Activos</span>
                        <span class="kpi-value">${onlineDrivers}</span>
                    </div>
                    <div class="kpi-card yellow diorama-card-3d">
                        <span class="kpi-label">Ingresos del Día (€ EUR)</span>
                        <span class="kpi-value">€${dayIncomeEUR.toFixed(2)}</span>
                        <small style="color:var(--text-secondary); margin-top:4px;">~ Bs. ${dayIncomeVES.toLocaleString('es-VE', {minimumFractionDigits:2})}</small>
                    </div>
                    <div class="kpi-card orange diorama-card-3d">
                        <span class="kpi-label">Calificación Promedio</span>
                        <span class="kpi-value">4.8 ⭐</span>
                    </div>
                </div>
                
                <h4 style="color: var(--text-primary); font-weight: 800; margin-bottom: 14px;">Últimos Viajes Registrados</h4>
                <div class="data-table-container diorama-card-3d">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Pasajero</th>
                                <th>Conductor</th>
                                <th>Origen → Destino</th>
                                <th>Tarifa (€ EUR)</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${allTrips.slice(0, 10).map(t => `
                                <tr>
                                    <td>#${(t.id || '').substring(0, 5)}</td>
                                    <td>${t.passengerId || 'N/A'}</td>
                                    <td>${t.driverId || 'N/A'}</td>
                                    <td>${t.origin?.address || 'N/A'} → ${t.destination?.address || 'N/A'}</td>
                                    <td>€${t.fareEUR || t.fareUSD || '4.50'}</td>
                                    <td><span class="badge badge-${(t.status || '').toLowerCase()}">${t.status || 'COMPLETADO'}</span></td>
                                </tr>
                            `).join('') || `
                                <tr>
                                    <td>#TR-001</td>
                                    <td>Jordan Pérez</td>
                                    <td>Carlos Mendoza</td>
                                    <td>Basílica de Chiquinquirá → Sambil Maracaibo</td>
                                    <td style="color:var(--accent-primary); font-weight:800;">€4.50 EUR</td>
                                    <td><span class="badge badge-success">COMPLETADO</span></td>
                                </tr>
                                <tr>
                                    <td>#TR-002</td>
                                    <td>Valentina Rojas</td>
                                    <td>María González</td>
                                    <td>Vereda del Lago → Calle 72 5 de Julio</td>
                                    <td style="color:var(--accent-primary); font-weight:800;">€3.20 EUR</td>
                                    <td><span class="badge badge-warning">EN RUTA</span></td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function switchTab(target) {
        navItems.forEach(btn => btn.classList.remove('active'));
        const activeNavBtn = container.querySelector(`[data-target="${target}"]`);
        if (activeNavBtn) activeNavBtn.classList.add('active');
        
        contentArea.innerHTML = '';
        if (window.innerWidth <= 768) sidebar.classList.remove('open');

        switch(target) {
            case 'dashboard':
                pageTitle.textContent = 'Dashboard';
                renderDashboard();
                break;
            case 'fleet':
                pageTitle.textContent = 'Mapa de Flota';
                renderFleetMap(contentArea);
                break;
            case 'users':
                pageTitle.textContent = 'Gestión de Usuarios';
                renderUsersManagement(contentArea);
                break;
            case 'tariffs':
                pageTitle.textContent = 'Configuración de Tarifas';
                renderTariffsConfig(contentArea);
                break;
            case 'finances':
                pageTitle.textContent = 'Finanzas';
                renderFinances(contentArea);
                break;
            case 'support':
                pageTitle.textContent = 'Centro de Soporte';
                renderAdminSupport(contentArea);
                break;
        }
    }

    navItems.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

    // Real-Time Socket Subscription for Admin Live Feed
    socket.on('rideRequested', (data) => {
        eventLogger.log('ADMIN', `Panel Admin detectó nueva solicitud de viaje en Maracaibo [${data?.id}]`);
        const activeNav = container.querySelector('.nav-item.active');
        if (activeNav && activeNav.dataset.target === 'dashboard') {
            renderDashboard();
        }
    });

    socket.on('tripStatusUpdated', (data) => {
        eventLogger.log('ADMIN', `Panel Admin detectó actualización de estado de viaje ➔ ${data?.status}`, data);
        const activeNav = container.querySelector('.nav-item.active');
        if (activeNav && activeNav.dataset.target === 'dashboard') {
            renderDashboard();
        }
    });

    // Init
    renderDashboard();
}
