import './styles/design-system.css';
import './styles/index.css';
import './styles/passenger.css';
import './styles/driver.css';
import './styles/admin.css';
import './styles/finance.css';
import './styles/fleet.css';
import './styles/support.css';
import './styles/users.css';
import './styles/receipt.css';
import './styles/local-avatar.css';
import './styles/diorama.css';
import './styles/modern-yellow-lab.css';
import { seedDatabase } from './services/clientCache.js';
import { authService } from './services/authService.js';
import { renderLanding } from './pages/landing.js';
import { renderPassengerApp } from './pages/passenger/passengerApp.js';
import { renderDriverApp } from './pages/driver/driverApp.js';
import { renderAdminApp } from './pages/admin/adminApp.js';
import { disposeAllPrivateDocumentViewers } from './pages/admin/driverApplicationsManagement.js';
import { disposeAllPrivatePhotos } from './utils/privatePhoto.js';
import { notificationService } from './services/notificationService.js';
import { installPushMessageHandler } from './services/pushClientMessages.js';
import {
    MODERN_EXPERIENCE_CLASS,
    applyTheme,
    isModernExperienceEnabled,
    readStoredTheme,
    resolveInitialTheme
} from './utils/themePreference.js';

const appContainer = document.getElementById('app');
const appSplash = document.getElementById('app-splash');
const modernExperienceEnabled = isModernExperienceEnabled(window.location.search);
const motionExperienceEnabled = new URLSearchParams(window.location.search).get('motionPreview') !== '0';
document.documentElement.classList.toggle(MODERN_EXPERIENCE_CLASS, modernExperienceEnabled);
document.documentElement.classList.toggle('um-motion-preview', motionExperienceEnabled);
// El tema se resuelve con el helper compartido y nunca se sobrescribe la
// preferencia guardada: sin preferencia se arranca en oscuro, y quien haya
// elegido modo claro lo conserva entre recargas.
applyTheme(
    resolveInitialTheme({
        storedValue: readStoredTheme(window.localStorage),
        search: window.location.search
    }),
    document.documentElement
);

// La experiencia moderna es ahora la interfaz oficial de +58Express.
// ?classic=1 queda disponible solo como comparación temporal de diagnóstico.

// Lenguaje visual aprobado para +58Express. Sigue siendo una capa separada de
// la lógica y puede desactivarse temporalmente con ?motionPreview=0 para
// diagnóstico sin alterar viajes, pagos, mapas ni comunicación en tiempo real.
if (motionExperienceEnabled) {
    import('./styles/um-motion-preview.css').catch(error => {
        console.warn('[+58express] No se pudo cargar la experiencia visual aprobada:', error?.message);
        document.documentElement.classList.remove('um-motion-preview');
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
    // Vaciar el contenedor desconecta el DOM pero no libera las Blob URLs de
    // los documentos protegidos. Toda salida interna del panel administrativo
    // —logout, navegación por hash o cualquier cambio de ruta— pasa por aquí.
    disposeAllPrivateDocumentViewers();
    disposeAllPrivatePhotos();
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
        // Puente con el service worker. Se instala una sola vez y solo
        // reacciona a dos mensajes conocidos; cualquier otro se ignora.
        installPushMessageHandler({
            getCurrentUser: () => authService.getCurrentUser(),
            getPushService: () => import('./services/pushSubscriptionService.js')
                .then(modulo => modulo.getPushSubscriptionService())
        });
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
