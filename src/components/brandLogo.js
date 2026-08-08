export function createBrandLogo({ size = 80, showText = true } = {}) {
    const container = document.createElement('div');
    container.className = 'brand-logo-container';
    container.style.cssText = `
        display: inline-flex; align-items: center; justify-content: center; gap: 12px;
    `;

    container.innerHTML = `
        <div class="logo-mark" style="
            width: ${size}px; height: ${size}px; border-radius: 20px;
            background: #0A0F18;
            border: 2px solid var(--accent-primary);
            box-shadow: 0 10px 30px rgba(255,193,7,0.35);
            display: flex; align-items: center; justify-content: center; overflow: hidden;
            position: relative; flex-shrink: 0;
        ">
            <img src="/app-icon-v2.png" alt="+58 Express" style="width: 100%; height: 100%; object-fit: cover; border-radius: 18px;" />
        </div>
        ${showText ? `
            <div style="text-align: left;">
                <div style="font-size: ${Math.round(size * 0.38)}px; font-weight: 900; line-height: 1; color: var(--text-primary); font-family: 'Outfit', sans-serif; letter-spacing: -0.5px;">
                    <span style="color: var(--accent-primary);">+58</span><span style="color: var(--text-primary);">express</span>
                </div>
                <small style="color: var(--text-secondary); font-size: ${Math.round(size * 0.16)}px; font-weight: 700; letter-spacing: 0.5px;">
                    Tu moto, al instante 🇻🇪
                </small>
            </div>
        ` : ''}
    `;

    return container;
}
