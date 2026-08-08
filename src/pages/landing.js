import { authService } from '../services/mockAuth.js';
import { createDriverRegistrationModal } from '../components/driverRegistrationModal.js';
import { showToast } from '../components/toast.js';
import { icon } from '../utils/icons.js';

export function renderLanding(container) {
    container.innerHTML = `
        <div class="landing-container landing-premium">
            <div class="landing-background">
                <div class="grid-pattern"></div>
                <div class="glow-orb orb-1"></div>
                <div class="glow-orb orb-2"></div>
            </div>

            <main class="landing-card landing-card-premium glass-panel">
                <header class="landing-header">
                    <div class="landing-brand-icon"><img src="/app-icon-v2.png" alt="+58 Express"></div>
                    <h1 class="logo-text"><span class="accent-text">+58</span>express</h1>
                    <p class="tagline">Tu moto, al instante 🇻🇪</p>
                    <div class="landing-location-line"><span></span>${icon('mapPin', 14)} Muévete por Maracaibo<span></span></div>
                </header>

                <div id="role-selection" class="role-selection">
                    <h2>¿Cómo quieres continuar?</h2>
                    <button class="role-btn passenger-btn" data-role="passenger">
                        <span class="role-icon">${icon('mapPin', 27)}</span>
                        <span class="role-copy"><strong>Soy Pasajero</strong><small>Solicita una moto o automóvil</small></span>
                        <span class="role-arrow">${icon('arrowRight', 18)}</span>
                    </button>
                    <button class="role-btn driver-btn" data-role="driver">
                        <span class="role-icon">${icon('bike', 27)}</span>
                        <span class="role-copy"><strong>Soy Conductor</strong><small>Conéctate y recibe carreras</small></span>
                        <span class="role-arrow">${icon('arrowRight', 18)}</span>
                    </button>
                    <button class="role-btn admin-btn" data-role="admin">
                        <span class="role-icon">${icon('shield', 27)}</span>
                        <span class="role-copy"><strong>Administración</strong><small>Gestiona la operación</small></span>
                        <span class="role-arrow">${icon('arrowRight', 18)}</span>
                    </button>
                </div>

                <div id="login-form" class="login-form hidden">
                    <button id="back-btn" class="back-btn">← Volver</button>
                    <h2 id="login-title">Ingreso</h2>
                    <form id="auth-form">
                        <div class="input-group"><input type="text" id="email" placeholder="Correo o Teléfono" required></div>
                        <div class="input-group"><input type="password" id="password" placeholder="Contraseña" required></div>
                        <button type="submit" class="primary-btn">Ingresar</button>
                        <div id="driver-register-section" class="hidden landing-driver-register">
                            <p>¿Quieres trabajar como conductor con nosotros?</p>
                            <button type="button" id="btn-open-driver-reg" class="btn">${icon('fileText', 17)} Solicitar trabajo y enviar requisitos</button>
                        </div>
                        <p class="register-link" id="passenger-reg-link">¿No tienes cuenta? <a href="#" id="link-register">Registrarse</a></p>
                    </form>
                </div>

                <div id="pwa-install-banner" class="landing-install">
                    <button id="btn-install-pwa" class="btn">${icon('smartphone', 18)} Instalar app en mi teléfono</button>
                    <small>Acceso rápido y notificaciones en tiempo real</small>
                </div>
            </main>

            <footer class="landing-footer"><p>© 2026 +58express · Maracaibo, Estado Zulia, Venezuela 🇻🇪</p></footer>
        </div>
    `;

    const roleSelection = container.querySelector('#role-selection');
    const loginForm = container.querySelector('#login-form');
    const loginTitle = container.querySelector('#login-title');
    const authForm = container.querySelector('#auth-form');
    const backBtn = container.querySelector('#back-btn');
    const emailInput = container.querySelector('#email');
    const passwordInput = container.querySelector('#password');
    const driverRegSection = container.querySelector('#driver-register-section');
    const btnOpenDriverReg = container.querySelector('#btn-open-driver-reg');

    let selectedRole = '';
    let registrationMode = false;

    container.querySelectorAll('.role-btn').forEach(button => {
        button.addEventListener('click', () => {
            selectedRole = button.dataset.role;
            registrationMode = false;
            roleSelection.classList.add('hidden');
            loginForm.classList.remove('hidden');
            loginTitle.textContent = { passenger: 'Ingreso Pasajero', driver: 'Ingreso Conductor', admin: 'Ingreso Administración' }[selectedRole];
            driverRegSection.classList.toggle('hidden', selectedRole !== 'driver');
        });
    });

    backBtn.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        roleSelection.classList.remove('hidden');
    });

    btnOpenDriverReg?.addEventListener('click', () => {
        const modal = createDriverRegistrationModal({ onSuccess: () => window.navigateTo('#/driver') });
        container.appendChild(modal);
    });

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
    });

    container.querySelector('#btn-install-pwa')?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            return;
        }
        alert('Para instalar en Android (Chrome), abre el menú y selecciona “Añadir a la pantalla de inicio”. En iPhone (Safari), toca Compartir y selecciona “Agregar al inicio”.');
    });

    authForm.addEventListener('submit', async event => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email) return;
        try {
            const result = registrationMode
                ? await authService.register({ firstName: email.split('@')[0] || 'Usuario', lastName: 'Express', email, password }, selectedRole)
                : await authService.login(email, password, selectedRole);
            if (result?.success && result.user) window.navigateTo(`#/${selectedRole}`);
            else showToast(registrationMode ? 'No se pudo crear la cuenta' : 'Credenciales incorrectas', 'error');
        } catch (error) {
            console.error('Login error:', error);
            showToast('No se pudo conectar con el servidor', 'error');
        }
    });

    container.querySelector('#link-register')?.addEventListener('click', event => {
        event.preventDefault();
        if (selectedRole !== 'passenger') return;
        registrationMode = !registrationMode;
        loginTitle.textContent = registrationMode ? 'Registro Pasajero' : 'Ingreso Pasajero';
        event.currentTarget.textContent = registrationMode ? 'Ya tengo una cuenta' : 'Registrarse';
    });
}
