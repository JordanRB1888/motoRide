import './styles/index.css';
import './styles/passenger.css';
import './styles/driver.css';
import './styles/admin.css';
import './styles/finance.css';
import './styles/fleet.css';
import './styles/support.css';
import './styles/users.css';
import './styles/receipt.css';
import './styles/diorama.css';
import { seedDatabase } from './services/clientCache.js';
import { authService } from './services/authService.js';
import { renderLanding } from './pages/landing.js';
import { renderPassengerApp } from './pages/passenger/passengerApp.js';
import { renderDriverApp } from './pages/driver/driverApp.js';
import { renderAdminApp } from './pages/admin/adminApp.js';
import { notificationService } from './services/notificationService.js';

const appContainer = document.getElementById('app');
const appSplash = document.getElementById('app-splash');
const modernExperienceEnabled = new URLSearchParams(window.location.search).get('classic') !== '1';
document.documentElement.classList.toggle('modern-yellow-lab', modernExperienceEnabled);
if (modernExperienceEnabled && new URLSearchParams(window.location.search).get('light') !== '1') {
    localStorage.setItem('58express_theme', 'dark');
    document.documentElement.classList.remove('theme-light');
}

// La experiencia moderna es ahora la interfaz oficial de +58Express.
// ?classic=1 queda disponible solo como comparación temporal de diagnóstico.
if (modernExperienceEnabled) {
    import('./styles/modern-yellow-lab.css').catch(error => {
        console.warn('[+58express] No se pudo cargar la experiencia visual moderna:', error?.message);
        document.documentElement.classList.remove('modern-yellow-lab');
    });
}

async function dismissAppSplash() {
    if (!appSplash) return;
    const startedAt = Number(window.__APP_SPLASH_STARTED_AT__) || performance.now();
    const remaining = Math.max(0, 1100 - (performance.now() - startedAt));
    if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));
    appSplash.classList.add('is-leaving');
    await new Promise(resolve => window.setTimeout(resolve, 400));
    appSplash.remove();
}

function clearApp() {
    appContainer.innerHTML = '';
}

window.navigateTo = (hash) => {
    window.location.hash = hash;
};

async function router() {
    clearApp();
    const hash = window.location.hash || '#/';
    const user = authService.getCurrentUser();

    if (hash === '#/') {
        if (user) {
            window.navigateTo(`#/${user.role}`);
            return;
        }
        renderLanding(appContainer);
    } else if (hash === '#/passenger') {
        if (!user || user.role !== 'passenger') {
            window.navigateTo('#/');
            return;
        }
        renderPassengerApp(appContainer);
    } else if (hash === '#/driver') {
        if (!user || user.role !== 'driver') {
            window.navigateTo('#/');
            return;
        }
        renderDriverApp(appContainer);
    } else if (hash === '#/admin') {
        if (!user || user.role !== 'admin') {
            window.navigateTo('#/');
            return;
        }
        renderAdminApp(appContainer);
    } else {
        window.navigateTo('#/');
    }
}

window.addEventListener('hashchange', router);

async function initApp() {
    try {
        await seedDatabase();
        if (authService.isAuthenticated()) {
            const refreshedUser = await authService.refreshSession();
            if (!refreshedUser) authService.logout();
            else await notificationService.syncFromServer(refreshedUser.id);
        }
        await router();
    } finally {
        await dismissAppSplash();
    }
}

document.addEventListener('DOMContentLoaded', initApp);
