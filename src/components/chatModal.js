import { icon } from '../utils/icons.js';
import { socket } from '../services/socketClient.js';
import { apiService } from '../services/apiService.js';
import { formatTime } from '../utils/helpers.js';

import { neutralizePrivatePhoto } from '../utils/privatePhoto.js';
import { localAvatarHtml } from '../utils/localAvatar.js';
export function createChatModal({ tripId, currentUser, recipientUser }) {
    const storageKey = `58express_chat_${tripId}`;
    
    // Load existing messages
    let messages = [];
    try {
        const saved = localStorage.getItem(storageKey);
        messages = saved ? JSON.parse(saved) : [];
    } catch (e) {
        messages = [];
    }

    const modal = document.createElement('div');
    modal.className = 'chat-modal-overlay hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const isDriver = currentUser.role === 'driver';
    const quickReplies = isDriver ? [
        "🧾 Enviar Comprobante de Pago",
        "🚦 Hay un poco de tráfico, voy en camino",
        "📍 Ya llegué al punto de encuentro",
        "👋 Te estoy esperando en la acera"
    ] : [
        "🧾 Enviar Comprobante de Pago Móvil",
        "Ya estoy afuera esperándote 👋",
        "¿Llevas casco extra? 🪖",
        "Estoy cerca del punto de encuentro 📍"
    ];

    modal.innerHTML = `
        <div class="chat-modal-content glass-panel" style="max-width: 460px;">
            <header class="chat-header">
                <div class="recipient-info">
                    ${localAvatarHtml({ name: recipientUser.firstName, role: recipientUser.role, className: 'recipient-avatar', label: recipientUser.firstName })}
                    <div>
                        <h4 class="recipient-name">${recipientUser.firstName} ${recipientUser.lastName || ''}</h4>
                        <span class="recipient-role-badge">${isDriver ? 'Pasajero' : 'Conductor'}</span>
                    </div>
                </div>
                <button class="close-chat-btn" id="close-chat">${icon('close', 20)}</button>
            </header>

            <div class="chat-messages" id="chat-messages-container" style="min-height: 260px; max-height: 380px;">
                <!-- Messages render here -->
            </div>

            <div class="chat-quick-replies" style="display:flex; gap: 6px; overflow-x: auto; padding: 6px 12px;">
                ${quickReplies.map(reply => `<button class="quick-chip" data-text="${reply}" style="white-space:nowrap; font-size:0.78rem;">${reply}</button>`).join('')}
            </div>

            <form class="chat-input-form" id="chat-form" style="display:flex; align-items:center; gap: 8px; padding: 10px 14px;">
                <input type="file" id="chat-file-input" accept="image/*" style="display: none;" />
                <button type="button" id="btn-attach-image" style="
                    background: rgba(255,193,7,0.15); border: 1px solid var(--accent-primary); color: var(--accent-primary);
                    padding: 8px 12px; border-radius: 14px; font-weight: 800; font-size: 1.1rem; cursor: pointer; flex-shrink: 0;
                " title="Adjuntar Captura o Comprobante">
                    📷
                </button>
                <input type="text" id="chat-input" placeholder="Escribe o adjunta comprobante..." autocomplete="off" style="flex:1;">
                <button type="submit" class="chat-send-btn" style="flex-shrink:0;">${icon('send', 20)}</button>
            </form>
        </div>
    `;

    const container = modal.querySelector('#chat-messages-container');
    const form = modal.querySelector('#chat-form');
    const input = modal.querySelector('#chat-input');
    const closeBtn = modal.querySelector('#close-chat');
    const fileInput = modal.querySelector('#chat-file-input');
    const attachBtn = modal.querySelector('#btn-attach-image');

    function saveMessages() {
        localStorage.setItem(storageKey, JSON.stringify(messages));
    }

    function renderMessages() {
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-state" style="text-align:center; padding: 30px; color: var(--text-muted);">
                    <p>💬 Inicia la conversación o envía la captura de tu comprobante de Pago Móvil</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages.map(msg => {
            const isMe = msg.senderId === currentUser.id;
            const imageSrc = safeImageSrc(msg.image);
            return `
                <div class="chat-bubble-row ${isMe ? 'sent' : 'received'}" style="margin-bottom: 10px;">
                    <div class="chat-bubble" style="
                        background: ${isMe ? 'linear-gradient(135deg, #FFC107 0%, #FF8F00 100%)' : 'var(--surface-elevated)'};
                        color: ${isMe ? '#121824' : 'var(--text-primary)'};
                        padding: 10px 14px; border-radius: 16px; max-width: 85%;
                    ">
                        ${imageSrc ? `
                            <div style="margin-bottom: 8px; border-radius: 12px; overflow: hidden; border: 1.5px solid rgba(255,255,255,0.3);">
                                <img src="${escapeHtml(imageSrc)}" alt="Comprobante adjunto" loading="lazy" style="width: 100%; max-height: 200px; object-fit: contain; display: block; background:#111827;" />
                            </div>
                        ` : ''}
                        <p class="msg-text" style="margin: 0; font-weight: 600; font-size: 0.9rem;">${escapeHtml(msg.text || '')}</p>
                        <span class="msg-time" style="font-size: 0.7rem; opacity: 0.75; display: block; text-align: right; margin-top: 4px;">
                            ${formatTime(msg.timestamp)}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    /**
     * Fuente admisible para una imagen de chat.
     *
     * Solo formatos raster. Un SVG es contenido activo y llega desde el
     * mensaje, es decir, desde una fuente que no controlamos: no se acepta por
     * ninguna via -MIME, codificacion, charset, mayusculas ni parametros- y la
     * extension nunca decide nada.
     */
    /**
     * Fuente admisible para una imagen de chat.
     *
     * Exactamente el mismo contrato que acepta el backend: data URL raster en
     * base64, y solo JPEG, PNG o WebP. Nada mas.
     *
     * No se admite ninguna URL remota, ni siquiera https con apariencia de
     * imagen: quien la sirve decide el `Content-Type` en el momento de la
     * respuesta, puede redirigir a otra cosa y, solo por cargarse, filtra la IP
     * y el Referer de quien lee el chat. Con una data URL el contenido viaja en
     * el propio valor y no se pide nada a nadie.
     *
     * Tampoco `blob:`, ni rutas relativas, ni GIF o `image/jpg`, que el
     * servidor rechaza; ni parametros adicionales en el MIME.
     */
    const CHAT_IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

    function safeImageSrc(value) {
        if (typeof value !== 'string') return '';
        const limpio = value.trim();
        if (!limpio) return '';
        return CHAT_IMAGE_DATA_URL.test(limpio) ? limpio : '';
    }



    /**
     * Comprobante de ejemplo como texto estructurado.
     *
     * Antes se generaba un SVG y se enviaba como data URL, lo que obligaba a
     * abrir una excepcion en la validacion de imagenes. Sin SVG no hace falta
     * excepcion alguna: viaja como texto y se escapa al pintarlo.
     */
    function createSampleReceiptText() {
        const reference = Math.floor(100000 + Math.random() * 900000);
        return [
            'Comprobante de Pago Movil',
            'Referencia: ' + reference,
            'Estado: confirmado',
            'Tasa: BCV'
        ].join(' | ');
    }


    function sendMessage(text, imageDataUrl = null) {
        if (!text.trim() && !imageDataUrl) return;

        const msgObj = {
            id: 'msg_' + Date.now(),
            tripId,
            senderId: currentUser.id,
            senderName: currentUser.firstName,
            recipientId: recipientUser.id,
            text: text.trim(),
            image: imageDataUrl,
            timestamp: new Date().toISOString()
        };

        messages.push(msgObj);
        saveMessages();
        renderMessages();

        // Emit to socket for real-time sync
        socket.emit('chat:send_message', msgObj);
    }

    // Attach File Trigger
    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                sendMessage('🧾 Comprobante de Pago Móvil adjuntado', evt.target.result);
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
        }
    });

    // Quick chips handler
    modal.querySelectorAll('.quick-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.dataset.text;
            if (text.includes('Comprobante')) {
                // Texto, no imagen: no se adjunta ningun contenido activo.
                  sendMessage('🧾 ' + createSampleReceiptText());
            } else {
                sendMessage(text);
            }
        });
    });

    // Form submit
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) {
            sendMessage(input.value);
            input.value = '';
        }
    });

    // Close button
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.classList.add('hidden');
    });

    // Socket listener for incoming message
    const socketHandler = (incomingMsg) => {
        if (incomingMsg.tripId === tripId && incomingMsg.senderId !== currentUser.id) {
            if (!messages.find(m => m.id === incomingMsg.id)) {
                messages.push(incomingMsg);
                saveMessages();
                renderMessages();
            }
        }
    };

    socket.on('chat:message', socketHandler);

    async function loadServerHistory() {
        const serverMessages = await apiService.get(`/trips/${encodeURIComponent(tripId)}/messages`);
        if (!Array.isArray(serverMessages)) return;
        const byId = new Map(messages.map(message => [message.id, message]));
        serverMessages.forEach(message => byId.set(message.id, message));
        messages = [...byId.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        saveMessages();
        renderMessages();
    }

    return {
        element: modal,
        open() {
            modal.classList.remove('hidden');
            renderMessages();
            loadServerHistory();
            input.focus();
        },
        close() {
            modal.classList.add('hidden');
        },
        isOpen() {
            return !modal.classList.contains('hidden');
        },
        destroy() {
            socket.off('chat:message', socketHandler);
            modal.remove();
        }
    };
}
