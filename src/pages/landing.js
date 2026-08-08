import { authService } from '../services/mockAuth.js';
import { createDriverRegistrationModal } from '../components/driverRegistrationModal.js';
import { showToast } from '../components/toast.js';

export function renderLanding(container) {
    container.innerHTML = `
        <div class="landing-container">
            <div class="landing-background">
                <div class="grid-pattern"></div>
                <div class="glow-orb orb-1"></div>
                <div class="glow-orb orb-2"></div>
            </div>
            <div class="landing-card glass-panel" style="max-width: 460px;">
                <div class="landing-header">
                    <div style="width: 96px; height: 96px; margin: 0 auto 16px; border-radius: 26px; overflow: hidden; border: 2.5px solid var(--accent-primary); box-shadow: 0 15px 35px rgba(255,193,7,0.35); background: #0A0F18;">
                        <img src="/app-icon-v2.png" alt="+58 Express" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </div>
                    <h1 class="logo-text" style="font-size: 2.2rem; font-weight: 900; margin-bottom: 4px; letter-spacing: -0.5px;">
                        <span class="accent-text" style="color:var(--accent-primary);">+58</span>express
                    </h1>
                    <p class="tagline" style="color:var(--text-secondary); font-size:0.92rem; font-weight:700;">Tu moto, al instante 🇻🇪</p>
                </div>
                
                <div id="role-selection" class="role-selection">
                    <button class="role-btn passenger-btn" data-role="passenger">
                        <span class="icon">🧑</span>
                        <span class="text">Soy Pasajero</span>
                    </button>
                    <button class="role-btn driver-btn" data-role="driver">
                        <span class="icon">🏍️</span>
                        <span class="text">Soy Conductor</span>
                    </button>
                    <button class="role-btn admin-btn" data-role="admin">
                        <span class="icon">🛡️</span>
                        <span class="text">Administrador</span>
                    </button>
                </div>

                <div id="login-form" class="login-form hidden">
                    <button id="back-btn" class="back-btn">← Volver</button>
                    <h2 id="login-title">Ingreso</h2>
                    <form id="auth-form">
                        <div class="input-group">
                            <input type="text" id="email" placeholder="Correo o Teléfono" required>
                        </div>
                        <div class="input-group">
                            <input type="password" id="password" placeholder="Contraseña" required>
                        </div>
                        <button type="submit" class="primary-btn">Ingresar</button>
                        
                        <div id="driver-register-section" class="hidden" style="margin-top: 14px; text-align: center;">
                            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px;">¿Quieres trabajar como mototaxista con nosotros?</p>
                            <button type="button" id="btn-open-driver-reg" class="btn" style="
                                width: 100%; padding: 12px; border-radius: 16px; background: rgba(0, 230, 118, 0.15);
                                border: 1.5px solid var(--success); color: var(--success); font-weight: 800; font-size: 0.9rem; cursor: pointer;
                            ">
                                📝 Solicitar Trabajo (Enviar Requisitos)
                            </button>
                        </div>

                        <p class="register-link" id="passenger-reg-link" style="margin-top:14px; text-align:center;">
                            ¿No tienes cuenta? <a href="#" id="link-register">Registrarse</a>
                        </p>
                    </form>
                </div>
                <div id="pwa-install-banner" style="margin-top: 16px; text-align: center;">
                    <button id="btn-install-pwa" class="btn btn-3d" style="
                        width: 100%; max-width: 320px; padding: 12px 18px; border-radius: 20px;
                        background: linear-gradient(135deg, #00D2FF 0%, #0088B3 100%);
                        color: #121824; font-weight: 900; font-size: 0.9rem; cursor: pointer;
                        box-shadow: 0 5px 0 #006680, 0 10px 20px rgba(0,210,255,0.3); border:none;
                    ">
                        📲 INSTALAR APP EN MI TELÉFONO
                    </button>
                </div>
            </div>
            <footer class="landing-footer">
                <p>© 2026 +58express · Maracaibo, Estado Zulia, Venezuela 🇻🇪</p>
            </footer>
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

    container.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedRole = btn.dataset.role;
            registrationMode = false;
            roleSelection.classList.add('hidden');
            loginForm.classList.remove('hidden');
            
            const titles = { passenger: 'Ingreso Pasajero', driver: 'Ingreso Conductor', admin: 'Ingreso Admin' };
            loginTitle.textContent = titles[selectedRole];
            
            if (selectedRole === 'driver') {
                driverRegSection.classList.remove('hidden');
            } else {
                driverRegSection.classList.add('hidden');
            }
        });
    });

    backBtn.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        roleSelection.classList.remove('hidden');
    });

    if (btnOpenDriverReg) {
        btnOpenDriverReg.addEventListener('click', () => {
            const modal = createDriverRegistrationModal({
                onSuccess: () => {
                    window.navigateTo('#/driver');
                }
            });
            container.appendChild(modal);
        });
    }

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    const btnInstallPwa = container.querySelector('#btn-install-pwa');
    if (btnInstallPwa) {
        btnInstallPwa.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    console.log('App PWA instalada con éxito');
                }
                deferredPrompt = null;
            } else {
                alert('📱 Para instalar en tu teléfono:\n\n• En Android (Chrome): Toca los 3 puntos (⋮) arriba a la derecha y selecciona "Añadir a la pantalla de inicio".\n\n• En iPhone (Safari): Toca el botón Compartir (⎋) abajo y selecciona "Agregar al inicio".');
            }
        });
    }

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email) return;

        try {
            const result = registrationMode
                ? await authService.register({
                    firstName: email.split('@')[0] || 'Usuario',
                    lastName: 'Express',
                    email,
                    password
                }, selectedRole)
                : await authService.login(email, password, selectedRole);
            if (result && result.success && result.user) {
                window.navigateTo(`#/${selectedRole}`);
            } else {
                showToast(registrationMode ? 'No se pudo crear la cuenta' : 'Credenciales incorrectas', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showToast('No se pudo conectar con el servidor', 'error');
        }
    });

    const registerLink = container.querySelector('#link-register');
    registerLink?.addEventListener('click', (event) => {
        event.preventDefault();
        if (selectedRole !== 'passenger') return;
        registrationMode = !registrationMode;
        loginTitle.textContent = registrationMode ? 'Registro Pasajero' : 'Ingreso Pasajero';
        registerLink.textContent = registrationMode ? 'Ya tengo una cuenta' : 'Registrarse';
    });
}
