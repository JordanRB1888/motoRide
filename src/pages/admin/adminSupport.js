import { db } from '../../services/mockDatabase.js';
import { showToast } from '../../components/toast.js';
import { notificationService } from '../../services/notificationService.js';

export function renderAdminSupport(container) {
    // Initial mock support conversations
    let driverThreads = [
        {
            id: 'driver_1',
            name: 'Carlos Mendoza',
            phone: '+58 414-000-0001',
            vehicle: 'Bera BR200 (AC3M49P)',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
            topic: '💵 Liquidación Pago Móvil',
            unread: 2,
            messages: [
                { sender: 'driver', text: '¡Buenas noches! Acabo de solicitar la liquidación de €48.50 EUR a mi Pago Móvil Banesco. ¿Podrían revisarlo?', time: '12:10 AM' },
                { sender: 'driver', text: 'Quedo atento a la confirmación de la transferencia.', time: '12:12 AM' }
            ]
        },
        {
            id: 'driver_3',
            name: 'José Rodríguez',
            phone: '+58 414-000-0003',
            vehicle: 'UM DSR200 (AD1L55R)',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jose',
            topic: '🪪 Actualización de RCV',
            unread: 1,
            messages: [
                { sender: 'driver', text: 'Hola soporte, acabo de subir la foto de mi nuevo RCV renovado para que por favor me aprueben el documento.', time: '11:45 PM' }
            ]
        },
        {
            id: 'driver_5',
            name: 'Ana Martínez',
            phone: '+58 414-000-0005',
            vehicle: 'Bera SuperStar (AF9P77T)',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana',
            topic: '🚨 Consulta de Ruta',
            unread: 0,
            messages: [
                { sender: 'driver', text: 'Hola, todo en orden en la ruta por Bella Vista.', time: '10:30 PM' },
                { sender: 'admin', text: 'Perfecto Ana, excelente servicio. Seguimos atentos.', time: '10:32 PM' }
            ]
        }
    ];

    let activeThreadId = 'driver_1';

    function renderView() {
        const activeThread = driverThreads.find(t => t.id === activeThreadId) || driverThreads[0];

        container.innerHTML = `
            <div class="support-view" style="padding: 10px 0;">
                <!-- Header -->
                <div class="header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h2 style="color: var(--text-primary); font-size: 1.5rem; font-weight: 800; margin: 0;">Centro de Soporte y Comunicados Masivos</h2>
                        <small style="color: var(--text-secondary);">Atención directa 24/7 y emisión de comunicados masivos con sonidos neón</small>
                    </div>
                    <div style="display:flex; gap: 10px;">
                        <button id="btn-open-broadcast-modal" class="btn btn-3d primary-btn" style="
                            padding: 8px 16px; border-radius: 14px; font-weight: 800; font-size: 0.85rem;
                            background: linear-gradient(135deg, #FF9800 0%, #FF5722 100%); color: white;
                        ">
                            📢 Emitir Comunicado Masivo
                        </button>
                        <span class="badge badge-success" style="font-size: 0.85rem; padding: 8px 14px;">
                            🟢 Operador Activo
                        </span>
                    </div>
                </div>

                <!-- Main Grid Layout -->
                <div style="display: grid; grid-template-columns: 320px 1fr; gap: 20px; height: 620px; min-height: 500px;">
                    <!-- Driver Chat Threads Sidebar -->
                    <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 24px; padding: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden;">
                        <h4 style="color: var(--text-primary); font-size: 0.95rem; font-weight: 800; margin-bottom: 14px; display:flex; align-items:center; justify-content:space-between;">
                            💬 Conversaciones (${driverThreads.length})
                        </h4>

                        <div style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap: 10px;">
                            ${driverThreads.map(t => {
                                const isActive = t.id === activeThreadId;
                                const lastMsg = t.messages[t.messages.length - 1] || {};

                                return `
                                    <div class="driver-thread-item" data-id="${t.id}" style="
                                        padding: 14px; border-radius: 16px; cursor: pointer; transition: all 0.2s ease;
                                        background: ${isActive ? 'linear-gradient(135deg, rgba(255,193,7,0.15) 0%, rgba(255,143,0,0.08) 100%)' : 'var(--surface-elevated)'};
                                        border: ${isActive ? '1.5px solid var(--border-gold)' : '1px solid var(--border-color)'};
                                    ">
                                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
                                            <div style="display:flex; align-items:center; gap: 10px;">
                                                <img src="${t.photo}" style="width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid var(--accent-primary);">
                                                <div>
                                                    <strong style="color: var(--text-primary); font-size: 0.9rem; display: block;">${t.name}</strong>
                                                    <small style="color: var(--accent-secondary); font-size: 0.75rem; font-weight: 700;">${t.topic}</small>
                                                </div>
                                            </div>
                                            ${t.unread > 0 ? `<span class="badge badge-warning" style="font-size:0.75rem;">${t.unread} nuevo</span>` : ''}
                                        </div>

                                        <p style="
                                            color: var(--text-secondary); font-size: 0.8rem; margin: 0;
                                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                                        ">
                                            ${lastMsg.sender === 'admin' ? ' You: ' : ''}${lastMsg.text || (lastMsg.image ? '📷 Captura adjunta' : 'Sin mensajes')}
                                        </p>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Active Chat Message Box -->
                    <div class="diorama-card-3d" style="background: var(--surface-card); border-radius: 24px; border: 1.5px solid var(--accent-secondary); display: flex; flex-direction: column; overflow: hidden;">
                        <!-- Chat Header -->
                        <div style="padding: 16px 20px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap: 12px;">
                                <img src="${activeThread.photo}" style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--accent-secondary);">
                                <div>
                                    <strong style="color: var(--text-primary); font-size: 1.05rem; display: block;">${activeThread.name} (${activeThread.phone})</strong>
                                    <small style="color: var(--text-secondary); font-size: 0.82rem;">${activeThread.vehicle}</small>
                                </div>
                            </div>
                            <span class="badge badge-info" style="font-size: 0.82rem; padding: 6px 12px;">
                                🛡️ ${activeThread.topic}
                            </span>
                        </div>

                        <!-- Admin Quick Reply Chips -->
                        <div style="padding: 10px 16px; background: rgba(0,210,255,0.06); border-bottom: 1px solid var(--border-color); display:flex; gap: 8px; overflow-x:auto;">
                            <button class="btn-quick-admin-reply" data-receipt="true" style="
                                padding: 6px 12px; border-radius: 14px; background: var(--surface-card); border: 1.5px solid var(--border-gold);
                                color: var(--accent-primary); font-size: 0.78rem; font-weight: 800; white-space: nowrap; cursor: pointer;
                            ">
                                🧾 Adjuntar Comprobante de Transferencia
                            </button>
                            <button class="btn-quick-admin-reply" data-text="✅ Tu solicitud de liquidación por Pago Móvil ha sido verificada y procesada con éxito." style="
                                padding: 6px 12px; border-radius: 14px; background: var(--surface-card); border: 1px solid var(--border-color);
                                color: var(--success); font-size: 0.78rem; font-weight: 700; white-space: nowrap; cursor: pointer;
                            ">
                                ✅ Confirmar Liquidación
                            </button>
                            <button class="btn-quick-admin-reply" data-text="🪪 Tus documentos han sido revisados y aprobados en el sistema." style="
                                padding: 6px 12px; border-radius: 14px; background: var(--surface-card); border: 1px solid var(--border-color);
                                color: var(--accent-primary); font-size: 0.78rem; font-weight: 700; white-space: nowrap; cursor: pointer;
                            ">
                                🪪 Aprobar Documentos
                            </button>
                        </div>

                        <!-- Chat Messages List -->
                        <div id="admin-support-messages" style="flex:1; padding: 20px; overflow-y: auto; display:flex; flex-direction:column; gap: 14px;">
                            ${activeThread.messages.map(m => `
                                <div style="
                                    align-self: ${m.sender === 'admin' ? 'flex-end' : 'flex-start'};
                                    max-width: 78%;
                                    background: ${m.sender === 'admin' ? 'linear-gradient(135deg, #00D2FF 0%, #0088b3 100%)' : 'var(--surface-elevated)'};
                                    color: ${m.sender === 'admin' ? '#121824' : 'var(--text-primary)'};
                                    padding: 12px 18px; border-radius: 18px;
                                    font-size: 0.92rem; font-weight: 600; line-height: 1.4;
                                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                                ">
                                    ${m.image ? `
                                        <div style="margin-bottom: 8px; border-radius: 12px; overflow: hidden; border: 1.5px solid rgba(255,255,255,0.4);">
                                            <img src="${m.image}" style="width: 100%; max-height: 200px; object-fit: cover; display: block;" />
                                        </div>
                                    ` : ''}
                                    <div>${m.text}</div>
                                    <div style="font-size: 0.72rem; opacity: 0.75; text-align: right; margin-top: 4px;">${m.time}</div>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Input Form with Screenshot Attachment Trigger -->
                        <form id="admin-reply-form" style="padding: 14px 20px; background: var(--surface-elevated); border-top: 1px solid var(--border-color); display:flex; gap: 10px; align-items: center;">
                            <input type="file" id="admin-file-upload-input" accept="image/*" style="display: none;" />
                            <button type="button" id="btn-admin-attach-file" style="
                                padding: 10px 14px; border-radius: 18px; background: rgba(255,193,7,0.15);
                                border: 1.5px solid var(--accent-primary); color: var(--accent-primary); font-weight: 800; font-size: 1.1rem; cursor: pointer;
                            " title="Adjuntar Captura de Pago o Comprobante">
                                📷 Captura
                            </button>
                            <input type="text" id="admin-reply-input" placeholder="Escribir mensaje o adjuntar comprobante oficial..." autocomplete="off" style="
                                flex: 1; padding: 12px 18px; border-radius: 20px; border: 1px solid var(--border-color);
                                background: var(--surface-input); color: var(--text-primary); outline: none; font-size: 0.95rem; font-weight: 600;
                            " />
                            <button type="submit" class="btn btn-3d primary-btn" style="
                                padding: 12px 24px; border-radius: 20px; font-weight: 900; background: var(--accent-primary); color: #121824;
                            ">
                                ENVIAR ➔
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        const broadcastBtn = container.querySelector('#btn-open-broadcast-modal');
        if (broadcastBtn) {
            broadcastBtn.addEventListener('click', openBroadcastModal);
        }

        // Switch threads
        container.querySelectorAll('.driver-thread-item').forEach(item => {
            item.addEventListener('click', () => {
                activeThreadId = item.dataset.id;
                const th = driverThreads.find(t => t.id === activeThreadId);
                if (th) th.unread = 0;
                renderView();
            });
        });

        // File upload trigger
        const fileInput = container.querySelector('#admin-file-upload-input');
        const attachBtn = container.querySelector('#btn-admin-attach-file');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        sendReply('🧾 Comprobante oficial de transferencia adjuntado por Administración', evt.target.result);
                        fileInput.value = '';
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // Quick replies
        container.querySelectorAll('.btn-quick-admin-reply').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.receipt) {
                    const sampleAdminReceiptSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect width="300" height="150" fill="%23121824" rx="15"/><text x="20" y="35" fill="%2300D2FF" font-size="14" font-weight="bold">✓ TRANSFERENCIA PROCESADA</text><text x="20" y="65" fill="%23FFFFFF" font-size="12">Emisor: Administración +58express</text><text x="20" y="85" fill="%23FFC107" font-size="14" font-weight="bold">Liquidado: €48.50 EUR (Bs. 42,413.25)</text><text x="20" y="110" fill="%2394A3B8" font-size="11">Ref: %23${Math.floor(100000 + Math.random()*900000)}</text><text x="20" y="130" fill="%2300E676" font-size="10">Pago Móvil Banesco Exitoso</text></svg>`;
                    sendReply('🧾 Comprobante Oficial de Transferencia por Pago Móvil (Administración)', sampleAdminReceiptSvg);
                } else {
                    sendReply(btn.dataset.text);
                }
            });
        });

        // Form submit
        container.querySelector('#admin-reply-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = container.querySelector('#admin-reply-input');
            if (input.value.trim()) {
                sendReply(input.value.trim());
                input.value = '';
            }
        });

        setTimeout(() => {
            const body = container.querySelector('#admin-support-messages');
            if (body) body.scrollTop = body.scrollHeight;
        }, 50);
    }

    function sendReply(text, imageDataUrl = null) {
        const th = driverThreads.find(t => t.id === activeThreadId);
        if (!th) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        th.messages.push({ sender: 'admin', text, image: imageDataUrl, time });
        showToast(`Mensaje enviado a ${th.name}`, 'success');
        renderView();
    }

    function openBroadcastModal() {
        const overlay = document.createElement('div');
        overlay.className = 'diorama-card-3d fade-in';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(10, 15, 24, 0.9); backdrop-filter: blur(20px);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;

        overlay.innerHTML = `
            <div style="
                width: 100%; max-width: 480px; background: var(--surface-card); border-radius: 28px;
                border: 2px solid var(--warning); padding: 24px; box-shadow: 0 30px 70px rgba(0,0,0,0.8);
            ">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                    <h3 style="color: var(--text-primary); font-size: 1.2rem; font-weight: 800; margin: 0;">📢 Emitir Comunicado Masivo</h3>
                    <button id="close-broadcast-modal" style="color: var(--text-secondary); font-size: 1.3rem; background: none; border: none; cursor: pointer;">✕</button>
                </div>

                <form id="broadcast-form" style="display:flex; flex-direction:column; gap: 14px;">
                    <div>
                        <small style="color:var(--text-secondary); font-weight:700;">Título del Anuncio</small>
                        <input type="text" id="bc-title" required placeholder="Ej: Bonificación Nocturna en Bella Vista 🌙" style="
                            width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color); background:var(--surface-input); color:var(--text-primary); font-size:0.95rem; font-weight:700;
                        " />
                    </div>

                    <div>
                        <small style="color:var(--text-secondary); font-weight:700;">Contenido del Mensaje</small>
                        <textarea id="bc-message" rows="3" required placeholder="Escribe el aviso oficial para la plataforma en Maracaibo..." style="
                            width:100%; padding:12px 16px; border-radius:14px; border:1px solid var(--border-color); background:var(--surface-input); color:var(--text-primary); font-size:0.95rem; font-weight:700;
                        "></textarea>
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap: 10px; margin-top: 10px;">
                        <button type="button" id="cancel-bc-btn" class="btn btn-cancel" style="padding:10px 18px; border-radius:14px; background:var(--surface-elevated); color:var(--text-primary); border: 1.5px solid var(--border-color); font-weight: 800;">Cancelar</button>
                        <button type="submit" class="btn btn-3d primary-btn" style="
                            padding:12px 22px; border-radius:14px; font-weight:900; background: linear-gradient(135deg, #FF9800 0%, #FF5722 100%); color: #ffffff;
                        ">
                            🚀 EMITIR COMUNICADO CON SONIDO
                        </button>
                    </div>
                </form>
            </div>
        `;

        overlay.querySelector('#close-broadcast-modal').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#cancel-bc-btn').addEventListener('click', () => overlay.remove());

        overlay.querySelector('#broadcast-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const title = overlay.querySelector('#bc-title').value.trim();
            const message = overlay.querySelector('#bc-message').value.trim();

            notificationService.broadcastAnnouncement('all', title, message);
            showToast('📢 Comunicado emitido exitosamente a toda la plataforma', 'success');
            overlay.remove();
        });

        container.appendChild(overlay);
    }

    renderView();
}
