import { authService } from '../services/authService.js';
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
                    <div class="landing-brand-icon"><img src="/app-icon-brand-192.png" alt="+58 Express"></div>
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
                        <div id="passenger-register-fields" class="hidden">
                            <div class="landing-register-grid">
                                <div class="input-group"><input type="text" id="register-first-name" placeholder="Nombre"></div>
                                <div class="input-group"><input type="text" id="register-last-name" placeholder="Apellido"></div>
                            </div>
                            <div class="input-group"><input type="tel" id="register-phone" placeholder="Teléfono +58"></div>
                        </div>
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
    const passengerRegisterFields = container.querySelector('#passenger-register-fields');
    const btnOpenDriverReg = container.querySelector('#btn-open-driver-reg');
    const submitButton = authForm.querySelector('[type="submit"]');

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
            passengerRegisterFields.classList.add('hidden');
            submitButton.textContent = 'Ingresar';
        });
    });

    backBtn.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        roleSelection.classList.remove('hidden');
    });

    btnOpenDriverReg?.addEventListener('click', () => {
        const modal = createDriverRegistrationModal({ onSuccess: () => window.navigateTo('#/passenger') });
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
                ? await authService.register({
                    firstName: container.querySelector('#register-first-name')?.value.trim(),
                    lastName: container.querySelector('#register-last-name')?.value.trim(),
                    phone: container.querySelector('#register-phone')?.value.trim(),
                    email,
                    password
                }, selectedRole)
                : await authService.login(email, password, selectedRole);
            if (result?.success && result.user) window.navigateTo(`#/${selectedRole}`);
            // El limitador va primero: un 429 no es una credencial mala, y
            // mostrarlo como tal lleva a reintentar, que es justo lo peor que
            // se puede hacer cuando el cupo ya está agotado.
            else if (result?.status === 429 || result?.error === 'RATE_LIMITED') {
                showToast('Demasiados intentos. Espera unos minutos e inténtalo nuevamente.', 'error');
            }
            else if (result?.error === 'USER_EXISTS') showToast('El correo o teléfono ya está registrado.', 'error');
            else if (result?.error === 'DRIVER_APPLICATION_NOT_APPROVED') showToast(`Tu solicitud está en estado: ${result.applicationStatus}. Ingresa como pasajero para revisarla.`, 'warning', 6500);
            else if (result?.fields) showToast(Object.values(result.fields)[0], 'error');
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
        passengerRegisterFields.classList.toggle('hidden', !registrationMode);
        submitButton.textContent = registrationMode ? 'Crear mi cuenta' : 'Ingresar';
        container.querySelectorAll('#passenger-register-fields input').forEach(input => { input.required = registrationMode; });
        emailInput.placeholder = registrationMode ? 'Correo electrónico' : 'Correo o Teléfono';
    });
}
