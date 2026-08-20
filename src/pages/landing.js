import { authService } from '../services/authService.js';
import { createDriverRegistrationModal } from '../components/driverRegistrationModal.js';
import { showToast } from '../components/toast.js';
import { icon } from '../utils/icons.js';
import { brandIcon } from '../utils/brandIcons.js';

export function renderLanding(container) {
    container.innerHTML = `
        <div class="landing-container landing-premium cyber-moto-experience">
            <!-- Background Cyber Grid & Ambient Energy Mesh -->
            <div class="landing-background">
                <div class="grid-pattern"></div>
                <div class="cyber-speed-lines"></div>
                <div class="glow-orb orb-top"></div>
                <div class="glow-orb orb-center"></div>
                <div class="glow-orb orb-bottom"></div>
            </div>

            <!-- Main Holographic Glass Card -->
            <main class="liquid-auth-card cyber-auth-card" id="liquid-card">
                <!-- Border Beam Energy Light -->
                <div class="card-border-beam"></div>

                <!-- Innovative Tachometer HUD & Bera SBR Hero -->
                <div class="cyber-hero-stage" id="cyber-hero-stage" title="¡Pasa el mouse o haz clic para acelerar la Bera SBR!">
                    <!-- Tachometer HUD Ring -->
                    <svg class="tachometer-svg" viewBox="0 0 200 200" width="190" height="190">
                        <defs>
                            <linearGradient id="tachoGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="#334155" stop-opacity="0.3" />
                                <stop offset="40%" stop-color="#FFC400" stop-opacity="0.8" />
                                <stop offset="85%" stop-color="#FF9800" />
                                <stop offset="100%" stop-color="#FF3B30" />
                            </linearGradient>
                            <radialGradient id="tachoAura" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stop-color="#FFC400" stop-opacity="0.25" />
                                <stop offset="70%" stop-color="#FF9800" stop-opacity="0.05" />
                                <stop offset="100%" stop-color="transparent" />
                            </radialGradient>
                        </defs>
                        
                        <!-- Background Glow Disc -->
                        <circle cx="100" cy="100" r="88" fill="url(#tachoAura)" />
                        
                        <!-- Outer Gauge Track -->
                        <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(255, 255, 255, 0.06)" stroke-width="3" stroke-dasharray="3, 6" />
                        
                        <!-- Dynamic RPM Progress Ring -->
                        <circle class="tacho-rpm-ring" id="tacho-rpm-ring" cx="100" cy="100" r="82" fill="none" stroke="url(#tachoGrad)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="515" stroke-dashoffset="380" transform="rotate(135 100 100)" />
                        
                        <!-- Gear & Speed HUD Overlay -->
                        <g class="hud-labels" font-family="monospace">
                            <text x="100" y="32" font-size="8.5" font-weight="900" fill="#FFC400" text-anchor="middle" letter-spacing="2">+58 EXPRESS</text>
                            <text x="32" y="160" font-size="7" fill="#64748B">0</text>
                            <text x="50" y="48" font-size="7" fill="#64748B">40</text>
                            <text x="100" y="20" font-size="7" fill="#FFC400">80</text>
                            <text x="150" y="48" font-size="7" fill="#FF9800">120</text>
                            <text x="168" y="160" font-size="7" fill="#FF3B30">150</text>
                        </g>
                    </svg>

                    <!-- Real +58 Express Center Vehicle with 3D Suspension Float -->
                    <div class="cyber-moto-container" id="moto-interactive-wrap">
                        <img src="/vehicles/moto-real.png" alt="+58 Express Moto Taxi" class="cyber-moto-img" draggable="false" />
                        <div class="cyber-ground-flare"></div>
                        <div class="speed-spark sp1"></div>
                        <div class="speed-spark sp2"></div>
                        <div class="speed-spark sp3"></div>
                    </div>

                    <!-- Digital Live Speed Badge -->
                    <div class="hud-speed-badge" id="hud-speed-badge">
                        <span class="speed-val" id="hud-speed-val">0</span>
                        <span class="speed-unit">KM/H</span>
                    </div>
                </div>

                <!-- Brand Header -->
                <header class="liquid-card-header">
                    <h1 class="liquid-brand-title"><span class="liquid-highlight">+58</span>express</h1>
                    <p class="liquid-brand-subtitle">Tu moto taxi al instante · Maracaibo 🇻🇪</p>
                </header>

                <!-- Initial Peek Button (Collapsed State) -->
                <button class="liquid-peek-btn" id="btn-peek-disclose" type="button" aria-expanded="false">
                    <span>Acceder</span>
                    <span class="peek-chevron">${icon('chevronDown', 16)}</span>
                </button>

                <!-- Disclosed Form Content (Liquid Wipe Stagger) -->
                <div class="liquid-disclose-wrap" id="liquid-disclose">
                    <!-- Role Selector Pills -->
                    <div id="role-selection" class="liquid-role-pills stagger-item s1">
                        <button class="role-tab active" data-role="passenger" type="button">
                            <span class="pill-tab-icon">${icon('user', 14)}</span>
                            <span>Pasajero</span>
                        </button>
                        <button class="role-tab" data-role="driver" type="button">
                            <span class="pill-tab-icon">${icon('motorcycle', 14)}</span>
                            <span>Conductor</span>
                        </button>
                        <button class="role-tab" data-role="admin" type="button">
                            <span class="pill-tab-icon">${icon('shield', 14)}</span>
                            <span>Admin</span>
                        </button>
                    </div>

                    <!-- Auth Mode Tabs (Iniciar Sesión vs Registrarse) -->
                    <div id="auth-mode-segmented" class="liquid-auth-tabs stagger-item s2">
                        <button type="button" class="auth-tab active" id="tab-mode-login">Iniciar Sesión</button>
                        <button type="button" class="auth-tab" id="tab-mode-register">Registrarse</button>
                    </div>

                    <!-- Form Body -->
                    <div id="login-form" class="liquid-form-body">
                        <h2 id="login-title" class="hidden">Ingreso Pasajero</h2>
                        <button id="back-btn" class="hidden" type="button"></button>

                        <form id="auth-form" autocomplete="on">
                            <!-- Passenger Registration Extra Fields -->
                            <div id="passenger-register-fields" class="hidden register-extra-fields stagger-item s3">
                                <div class="input-row-2">
                                    <div class="liquid-input-box">
                                        <span class="input-ico">${icon('user', 16)}</span>
                                        <input type="text" id="register-first-name" placeholder="Nombre" autocomplete="given-name">
                                    </div>
                                    <div class="liquid-input-box">
                                        <span class="input-ico">${icon('user', 16)}</span>
                                        <input type="text" id="register-last-name" placeholder="Apellido" autocomplete="family-name">
                                    </div>
                                </div>
                                <div class="liquid-input-box phone-box">
                                    <span class="country-pill">🇻🇪 +58</span>
                                    <input type="tel" id="register-phone" placeholder="412 1234567" autocomplete="tel">
                                </div>
                            </div>

                            <!-- Email / Identifier -->
                            <div class="liquid-input-box stagger-item s4">
                                <span class="input-ico">${icon('mail', 16)}</span>
                                <input type="text" id="email" placeholder="Correo o Teléfono" required autocomplete="username">
                            </div>

                            <!-- Password with Interactive Toggle -->
                            <div class="liquid-input-box password-box stagger-item s5">
                                <span class="input-ico">${icon('lock', 16)}</span>
                                <input type="password" id="password" placeholder="Contraseña" required autocomplete="current-password">
                                <button type="button" id="btn-toggle-password" class="liquid-eye-toggle" aria-label="Mostrar u ocultar contraseña">
                                    ${icon('eye', 16)}
                                </button>
                            </div>

                            <!-- Remember me / Helper row -->
                            <div class="liquid-helper-row stagger-item s6">
                                <label class="liquid-checkbox-label">
                                    <input type="checkbox" id="remember-me" class="liquid-checkbox">
                                    <span>Recordarme</span>
                                </label>
                                <a href="#" id="link-forgot-password" class="liquid-forgot-link">¿Olvidaste tu contraseña?</a>
                            </div>

                            <!-- Liquid Submit CTA Button -->
                            <button type="submit" class="primary-btn liquid-submit-btn stagger-item s7" id="btn-submit-cta">
                                <span class="submit-text">Iniciar Sesión</span>
                                <span class="btn-arrow-icon">${icon('arrowRight', 18)}</span>
                                <div class="btn-drip-container">
                                    <div class="btn-drip d1"></div>
                                    <div class="btn-drip d2"></div>
                                </div>
                            </button>

                            <!-- Acceso con proveedor externo. Los botones estan
                                 preparados visualmente; el intercambio con cada
                                 proveedor todavia no existe, asi que se
                                 muestran deshabilitados y lo dicen. -->
                            <div class="liquid-social-block stagger-item s7b">
                                <div class="liquid-social-divider"><span>o continuar con</span></div>
                                <div class="liquid-social-buttons">
                                    <button type="button" class="liquid-social-btn" data-social="google" disabled aria-disabled="true" title="Disponible próximamente">
                                        ${brandIcon('google', 18)}<span>Google</span>
                                    </button>
                                    <button type="button" class="liquid-social-btn" data-social="facebook" disabled aria-disabled="true" title="Disponible próximamente">
                                        ${brandIcon('facebook', 18)}<span>Facebook</span>
                                    </button>
                                    <button type="button" class="liquid-social-btn" data-social="apple" disabled aria-disabled="true" title="Disponible próximamente">
                                        ${brandIcon('apple', 18)}<span>Apple</span>
                                    </button>
                                </div>
                                <p class="liquid-social-note">Disponible próximamente</p>
                            </div>

                            <!-- Conductor Special Callout -->
                            <div id="driver-register-section" class="hidden conductor-recruitment-banner stagger-item s8">
                                <p>¿Quieres generar ingresos con tu moto?</p>
                                <button type="button" id="btn-open-driver-reg" class="conductor-apply-btn">
                                    ${icon('fileText', 14)} Solicitar registro de conductor →
                                </button>
                            </div>

                            <!-- Passenger footer toggle link -->
                            <p class="register-link stagger-item s9" id="passenger-reg-link">
                                ¿No tienes cuenta? <a href="#" id="link-register">Registrarse</a>
                            </p>
                        </form>
                    </div>
                </div>
            </main>

            <footer class="landing-footer">
                <p>© 2026 +58express · Maracaibo, Estado Zulia, Venezuela 🇻🇪</p>
            </footer>
        </div>
    `;

    const authForm = container.querySelector('#auth-form');
    const loginTitle = container.querySelector('#login-title');
    const emailInput = container.querySelector('#email');
    const passwordInput = container.querySelector('#password');
    const driverRegSection = container.querySelector('#driver-register-section');
    const passengerRegisterFields = container.querySelector('#passenger-register-fields');
    const btnOpenDriverReg = container.querySelector('#btn-open-driver-reg');
    const submitButton = authForm.querySelector('[type="submit"]');
    const submitText = submitButton.querySelector('.submit-text') || submitButton;
    const authModeSegmented = container.querySelector('#auth-mode-segmented');
    const tabModeLogin = container.querySelector('#tab-mode-login');
    const tabModeRegister = container.querySelector('#tab-mode-register');
    const btnTogglePassword = container.querySelector('#btn-toggle-password');
    const passengerRegLink = container.querySelector('#passenger-reg-link');
    const liquidCard = container.querySelector('#liquid-card');
    const btnPeekDisclose = container.querySelector('#btn-peek-disclose');
    const motoWrap = container.querySelector('#moto-interactive-wrap');
    const tachoRing = container.querySelector('#tacho-rpm-ring');
    const speedVal = container.querySelector('#hud-speed-val');
    const cyberStage = container.querySelector('#cyber-hero-stage');

    let selectedRole = 'passenger';
    let registrationMode = false;

    // --- Interactive Tachometer RPM & Speed Simulation ---
    let targetSpeed = 0;
    let currentSpeed = 0;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;
    let isRevving = false;
    let animationFrameId = null;

    function onMouseMove(event) {
        if (!cyberStage) return;
        const rect = cyberStage.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        targetTiltX = (event.clientX - centerX) * 0.05;
        targetTiltY = (event.clientY - centerY) * 0.05;
        
        // Tilt card glare
        const cardRect = liquidCard.getBoundingClientRect();
        const mouseX = ((event.clientX - cardRect.left) / cardRect.width) * 100;
        const mouseY = ((event.clientY - cardRect.top) / cardRect.height) * 100;
        liquidCard.style.setProperty('--glare-x', `${mouseX}%`);
        liquidCard.style.setProperty('--glare-y', `${mouseY}%`);
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // Rev engine on hover / press
    cyberStage?.addEventListener('mouseenter', () => { targetSpeed = 65; });
    cyberStage?.addEventListener('mouseleave', () => { if (!isRevving) targetSpeed = 0; });
    
    cyberStage?.addEventListener('mousedown', () => {
        isRevving = true;
        targetSpeed = 135;
        motoWrap?.classList.add('is-accelerating');
    });

    window.addEventListener('mouseup', () => {
        if (isRevving) {
            isRevving = false;
            targetSpeed = 0;
            motoWrap?.classList.remove('is-accelerating');
        }
    });

    cyberStage?.addEventListener('touchstart', () => {
        isRevving = true;
        targetSpeed = 135;
        motoWrap?.classList.add('is-accelerating');
    }, { passive: true });

    window.addEventListener('touchend', () => {
        if (isRevving) {
            isRevving = false;
            targetSpeed = 0;
            motoWrap?.classList.remove('is-accelerating');
        }
    }, { passive: true });

    // Rev up dynamically when user types in inputs!
    [emailInput, passwordInput].forEach(input => {
        input?.addEventListener('input', () => {
            targetSpeed = Math.min(145, targetSpeed + 25);
            setTimeout(() => { if (!isRevving) targetSpeed = 0; }, 600);
        });
    });

    function cyberLoop(time) {
        // Smooth speed & RPM interpolation
        currentSpeed += (targetSpeed - currentSpeed) * 0.12;
        if (currentSpeed < 0.5) currentSpeed = 0;

        if (speedVal) {
            speedVal.textContent = Math.round(currentSpeed);
        }

        // Map speed (0-150) to tachometer ring offset (380 to 140)
        if (tachoRing) {
            const offset = 380 - (currentSpeed / 150) * 240;
            tachoRing.style.strokeDashoffset = offset.toFixed(1);
        }

        // Moto 3D Leaning & Floating Vibration
        currentTiltX += (targetTiltX - currentTiltX) * 0.1;
        currentTiltY += (targetTiltY - currentTiltY) * 0.1;

        const floatY = Math.sin(time * 0.003) * 2.5;
        const revShake = isRevving ? (Math.random() - 0.5) * 2.2 : 0;
        const tiltDeg = currentTiltX * 0.5;

        if (motoWrap) {
            motoWrap.style.transform = `translate3d(0, ${(floatY + revShake).toFixed(1)}px, 0) rotate(${tiltDeg.toFixed(1)}deg)`;
        }

        animationFrameId = requestAnimationFrame(cyberLoop);
    }
    animationFrameId = requestAnimationFrame(cyberLoop);

    // --- Disclose / Peek Toggle Flow ---
    function openDisclose() {
        liquidCard.classList.add('is-open');
        btnPeekDisclose.setAttribute('aria-expanded', 'true');
        targetSpeed = 90;
        setTimeout(() => { targetSpeed = 0; }, 800);
    }

    btnPeekDisclose?.addEventListener('click', openDisclose);

    function syncUI() {
        container.querySelectorAll('.role-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.role === selectedRole);
        });

        if (selectedRole === 'passenger') {
            authModeSegmented.classList.remove('hidden');
            passengerRegLink.classList.remove('hidden');
            driverRegSection.classList.add('hidden');
            tabModeLogin.classList.toggle('active', !registrationMode);
            tabModeRegister.classList.toggle('active', registrationMode);
            passengerRegisterFields.classList.toggle('hidden', !registrationMode);
            loginTitle.textContent = registrationMode ? 'Registro Pasajero' : 'Ingreso Pasajero';
            
            if (registrationMode) {
                passengerRegLink.innerHTML = '¿Ya tienes una cuenta? <a href="#" id="link-register">Iniciar Sesión</a>';
            } else {
                passengerRegLink.innerHTML = '¿No tienes cuenta? <a href="#" id="link-register">Registrarse</a>';
            }
            bindRegisterLink();

            submitText.textContent = registrationMode ? 'Crear mi cuenta' : 'Iniciar Sesión';
            emailInput.placeholder = registrationMode ? 'Correo electrónico' : 'Correo o Teléfono';
            container.querySelectorAll('#passenger-register-fields input').forEach(input => {
                input.required = registrationMode;
            });
        } else {
            authModeSegmented.classList.add('hidden');
            passengerRegLink.classList.add('hidden');
            passengerRegisterFields.classList.add('hidden');
            registrationMode = false;
            driverRegSection.classList.toggle('hidden', selectedRole !== 'driver');
            loginTitle.textContent = selectedRole === 'driver' ? 'Ingreso Conductor' : 'Ingreso Administración';
            submitText.textContent = 'Iniciar Sesión';
            emailInput.placeholder = 'Correo o Teléfono';
            container.querySelectorAll('#passenger-register-fields input').forEach(input => {
                input.required = false;
            });
        }
    }

    function bindRegisterLink() {
        const link = container.querySelector('#link-register');
        link?.addEventListener('click', event => {
            event.preventDefault();
            if (selectedRole !== 'passenger') return;
            registrationMode = !registrationMode;
            syncUI();
        });
    }

    container.querySelectorAll('.role-tab').forEach(button => {
        button.addEventListener('click', () => {
            selectedRole = button.dataset.role;
            registrationMode = false;
            syncUI();
            targetSpeed = 80;
            setTimeout(() => { targetSpeed = 0; }, 500);
        });
    });

    tabModeLogin?.addEventListener('click', () => {
        if (selectedRole !== 'passenger') return;
        registrationMode = false;
        syncUI();
    });

    tabModeRegister?.addEventListener('click', () => {
        if (selectedRole !== 'passenger') return;
        registrationMode = true;
        syncUI();
    });

    btnTogglePassword?.addEventListener('click', () => {
        const isPassword = passwordInput.getAttribute('type') === 'password';
        passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
        btnTogglePassword.innerHTML = icon(isPassword ? 'eyeOff' : 'eye', 16);
    });

    btnOpenDriverReg?.addEventListener('click', () => {
        const modal = createDriverRegistrationModal({ onSuccess: () => window.navigateTo('#/passenger') });
        container.appendChild(modal);
    });

    container.querySelector('#link-forgot-password')?.addEventListener('click', event => {
        event.preventDefault();
        showToast('Comunícate con soporte para recuperar tu acceso.', 'info');
    });

    // --- Authentication Submit Handler with Melt animation ---
    authForm.addEventListener('submit', async event => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email) return;

        submitButton.classList.add('is-melting');
        targetSpeed = 150;

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
        } finally {
            submitButton.classList.remove('is-melting');
            targetSpeed = 0;
        }
    });

    syncUI();
}
