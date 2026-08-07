import { icon } from '../../utils/icons.js';
import { authService } from '../../services/mockAuth.js';
import { db } from '../../services/mockDatabase.js';
import { createDocumentCard } from '../../components/documentUploader.js';
import { showToast } from '../../components/toast.js';

export function renderDocuments() {
    const container = document.createElement('div');
    container.className = 'documents-page';
    container.style.cssText = 'padding: 20px 16px 100px; max-width: 480px; margin: 0 auto;';
    
    const user = authService.getCurrentUser();
    const userDocs = user?.documents || {
        cedula: { status: 'approved', previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80' },
        licencia: { status: 'approved', previewUrl: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=150&auto=format&fit=crop&q=80' },
        rcv: { status: 'approved', previewUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=150&auto=format&fit=crop&q=80' },
        certificadoMedico: { status: 'approved', previewUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=150&auto=format&fit=crop&q=80' },
        carnetCirculacion: { status: 'approved', previewUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=150&auto=format&fit=crop&q=80' }
    };

    const docConfigs = [
        { key: 'cedula', title: '🪪 Cédula de Identidad', description: 'Documento de identidad laminado venezolano' },
        { key: 'licencia', title: '🪪 Licencia de Conducir (2do Grado)', description: 'Licencia vigente para conducción de motocicletas' },
        { key: 'rcv', title: '🛡️ RCV (Seguro Obligatorio)', description: 'Póliza RCV al día correspondiente a la moto' },
        { key: 'certificadoMedico', title: '⚕️ Certificado Médico Vial', description: 'Certificado de salud física y visual vigente' },
        { key: 'carnetCirculacion', title: '🏍️ Carnet de Circulación', description: 'Título de propiedad o carnet de la moto' }
    ];

    function handleUpload(docKey, docData) {
        userDocs[docKey] = docData;
        if (user && user.id) {
            db.update('users', user.id, { documents: userDocs });
        }
        refreshView();
    }

    function refreshView() {
        container.innerHTML = '';

        const allApproved = Object.values(userDocs).every(d => d?.status === 'approved');

        const header = document.createElement('div');
        header.innerHTML = `
            <div class="page-section-header" style="margin-bottom: 20px;">
                <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Mis Documentos Mototaxista</h2>
            </div>

            <div class="diorama-card-3d" style="
                padding: 20px; border-radius: 24px; text-align: center; margin-bottom: 24px;
                background: linear-gradient(135deg, rgba(0,230,118,0.12) 0%, rgba(0,210,255,0.08) 100%);
                border: 1.5px solid var(--success); box-shadow: 0 10px 30px rgba(0,230,118,0.2);
            ">
                <div style="font-size: 2.4rem; margin-bottom: 6px;">✅</div>
                <h3 style="color: var(--text-primary); font-size: 1.25rem; font-weight: 900; margin-bottom: 4px;">
                    Documentos 100% Verificados
                </h3>
                <p style="color: var(--text-secondary); font-size: 0.88rem; margin: 0; font-weight:600;">
                    Tu moto está habilitada para laborar en Maracaibo 🇻🇪. Puedes actualizar cualquier foto si vence tu documento.
                </p>
            </div>
        `;

        container.appendChild(header);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

        docConfigs.forEach(config => {
            const current = userDocs[config.key] || { status: 'approved' };
            const cardEl = createDocumentCard({
                docKey: config.key,
                title: config.title,
                description: config.description,
                currentDoc: current,
                onUpload: handleUpload
            });
            listContainer.appendChild(cardEl);
        });

        container.appendChild(listContainer);
    }

    refreshView();
    return container;
}
