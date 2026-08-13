import { showToast } from '../components/toast.js';
import { icon } from './icons.js';
import {
    applyTheme,
    oppositeTheme,
    persistTheme,
    readAppliedTheme,
    readStoredTheme,
    resolveInitialTheme
} from './themePreference.js';

const themeLabel = theme => (theme === 'light' ? 'Modo Día' : 'Modo Noche');
const themeIcon = theme => icon(theme === 'light' ? 'sun' : 'moon', 18, 'theme-state-icon');

export function initThemeToggle(containerId = null) {
    // Misma resolución que main.js: una sola regla para toda la aplicación.
    const appliedTheme = applyTheme(
        resolveInitialTheme({
            storedValue: readStoredTheme(window.localStorage),
            search: window.location.search
        }),
        document.documentElement
    );

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'theme-toggle-btn';
    toggleBtn.title = 'Alternar Modo Día / Noche';
    // El botón anuncia el tema que está pintado de verdad, no el guardado.
    toggleBtn.innerHTML = themeIcon(appliedTheme);
    toggleBtn.setAttribute('aria-label', themeLabel(appliedTheme));
    toggleBtn.title = themeLabel(appliedTheme);
    toggleBtn.setAttribute('aria-pressed', String(appliedTheme === 'light'));

    Object.assign(toggleBtn.style, {
        background: 'var(--surface-elevated, #1e293b)',
        border: '1.5px solid var(--accent-primary, #FFC107)',
        color: 'var(--text-primary, #ffffff)',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '0.8rem',
        fontWeight: '800',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        transition: 'all 0.2s ease'
    });

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Se parte del tema realmente aplicado para que el botón no se
        // desincronice si otra pantalla ya lo cambió.
        const nextTheme = oppositeTheme(readAppliedTheme(document.documentElement));
        const activeTheme = applyTheme(nextTheme, document.documentElement);
        persistTheme(activeTheme, window.localStorage);
        window.dispatchEvent(new CustomEvent('58express:theme-change', { detail: { theme: activeTheme } }));
        toggleBtn.innerHTML = themeIcon(activeTheme);
        toggleBtn.setAttribute('aria-label', themeLabel(activeTheme));
        toggleBtn.title = themeLabel(activeTheme);
        toggleBtn.setAttribute('aria-pressed', String(activeTheme === 'light'));
        showToast(activeTheme === 'light' ? 'Modo Día activado' : 'Modo Noche activado', 'info');
    });

    return toggleBtn;
}
