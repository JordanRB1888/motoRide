import { showToast } from '../components/toast.js';

export function initThemeToggle(containerId = null) {
    const savedTheme = localStorage.getItem('58express_theme') || 'dark';
    
    if (savedTheme === 'light') {
        document.documentElement.classList.add('theme-light');
    } else {
        document.documentElement.classList.remove('theme-light');
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'theme-toggle-btn';
    toggleBtn.title = 'Alternar Modo Día / Noche';
    toggleBtn.innerHTML = savedTheme === 'light' ? '☀️ Día' : '🌙 Noche';

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
        const isLight = document.documentElement.classList.toggle('theme-light');
        const newTheme = isLight ? 'light' : 'dark';
        localStorage.setItem('58express_theme', newTheme);
        toggleBtn.innerHTML = isLight ? '☀️ Día' : '🌙 Noche';
        showToast(isLight ? '☀️ Modo Día activado' : '🌙 Modo Noche activado', 'info');
    });

    return toggleBtn;
}
