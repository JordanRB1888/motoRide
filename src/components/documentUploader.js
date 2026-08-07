import { icon } from '../utils/icons.js';
import { showToast } from './toast.js';

export function createDocumentCard({ docKey, title, description, currentDoc, onUpload }) {
    const card = document.createElement('div');
    card.className = 'diorama-card-3d';
    card.style.cssText = `
        background: var(--surface-card);
        border: 1.5px solid var(--border-color);
        border-radius: 24px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
        gap: 16px;
    `;

    const isApproved = currentDoc?.status === 'approved';
    const isPending = currentDoc?.status === 'pending';
    const isRejected = currentDoc?.status === 'rejected';

    let badgeHtml = '';
    let badgeBorderColor = 'var(--border-color)';
    if (isApproved) {
        badgeHtml = `<span style="background: rgba(0,230,118,0.15); color: var(--success); border: 1px solid var(--success); padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">✅ APROBADO</span>`;
        badgeBorderColor = 'rgba(0,230,118,0.4)';
    } else if (isRejected) {
        badgeHtml = `<span style="background: rgba(255,77,77,0.15); color: var(--danger); border: 1px solid var(--danger); padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">⚠️ RECHAZADO</span>`;
        badgeBorderColor = 'rgba(255,77,77,0.4)';
    } else {
        badgeHtml = `<span style="background: rgba(255,193,7,0.15); color: var(--accent-primary); border: 1px solid var(--accent-primary); padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px;">⏳ PENDIENTE</span>`;
        badgeBorderColor = 'rgba(255,193,7,0.4)';
    }

    card.style.borderColor = badgeBorderColor;

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 200px;">
                <h4 style="color: var(--text-primary); font-size: 1.05rem; font-weight: 800; margin: 0 0 4px 0;">${title}</h4>
                <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0;">${description}</p>
            </div>
            <div>${badgeHtml}</div>
        </div>

        <div style="
            background: var(--surface-elevated);
            border: 2px dashed ${currentDoc?.previewUrl ? 'var(--success)' : 'var(--border-color)'};
            border-radius: 18px;
            padding: 16px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        " class="upload-dropzone">
            ${currentDoc?.previewUrl ? `
                <div style="display:flex; align-items:center; gap: 14px; width: 100%;">
                    <img src="${currentDoc.previewUrl}" style="width: 64px; height: 64px; border-radius: 12px; object-fit: cover; border: 2px solid var(--success); flex-shrink:0;">
                    <div style="text-align: left; flex:1;">
                        <strong style="color:var(--text-primary); display:block; font-size: 0.9rem;">Documento Adjuntado</strong>
                        <span style="color:var(--success); font-size: 0.78rem; font-weight:700;">✓ Foto cargada correctamente</span>
                    </div>
                    <span style="color:var(--text-secondary); font-size: 0.8rem; background: var(--surface-card); padding: 6px 12px; border-radius: 12px; font-weight:700;">Ver / Cambiar</span>
                </div>
            ` : `
                <div style="display:flex; flex-direction:column; align-items:center; gap: 6px; color: var(--text-secondary);">
                    <span style="font-size: 1.8rem;">📷</span>
                    <strong style="color: var(--text-primary); font-size: 0.9rem;">Subir Foto de ${title}</strong>
                    <span style="font-size: 0.78rem; color: var(--text-muted);">Formato JPG, PNG (máx 5MB)</span>
                </div>
            `}
            <input type="file" accept="image/*" class="doc-file-input" style="position:absolute; inset:0; opacity:0; cursor:pointer;" />
        </div>
    `;

    const fileInput = card.querySelector('.doc-file-input');

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast('El archivo es demasiado grande (máx 5MB)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            showToast(`Documento "${title}" cargado con éxito para revisión`, 'success');
            
            if (onUpload) {
                onUpload(docKey, {
                    previewUrl: dataUrl,
                    status: 'pending',
                    uploadedAt: new Date().toISOString()
                });
            }
        };
        reader.readAsDataURL(file);
    });

    return card;
}
