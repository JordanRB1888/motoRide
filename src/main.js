import './styles/index.css';
import './styles/passenger.css';
import './styles/driver.css';
import './styles/admin.css';
import './styles/diorama.css';
import { seedDatabase } from './services/clientCache.js';
import { authService } from './services/authService.js';
import { renderLanding } from './pages/landing.js';
import { renderPassengerApp } from './pages/passenger/passengerApp.js';
import { renderDriverApp } from './pages/driver/driverApp.js';
import { renderAdminApp } from './pages/admin/adminApp.js';
import { notificationService } from './services/notificationService.js';

const appContainer = document.getElementById('app');

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
    await seedDatabase();
    if (authService.isAuthenticated()) {
        const refreshedUser = await authService.refreshSession();
        if (!refreshedUser) authService.logout();
        else await notificationService.syncFromServer(refreshedUser.id);
    }
    await router();
}

document.addEventListener('DOMContentLoaded', initApp);
