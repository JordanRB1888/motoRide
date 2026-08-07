import { icon } from '../utils/icons.js';
import { showToast } from './toast.js';

export function createAdminSupportChat(driver) {
  const overlay = document.createElement('div');
  overlay.className = 'diorama-card-3d fade-in';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(10, 15, 24, 0.88); backdrop-filter: blur(20px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  `;

  let messages = [
    { sender: 'admin', text: `¡Hola ${driver?.firstName || 'Carlos'}! Bienvenido al soporte directo con Administración +58express Maracaibo. Puedes enviarnos cualquier duda o captura del comprobante de Pago Móvil.`, time: '12:00 PM' }
  ];

  const modal = document.createElement('div');
  modal.style.cssText = `
    width: 100%; max-width: 440px; height: 580px; max-height: 88vh;
    background: var(--surface-card); border-radius: 28px;
    border: 2px solid var(--accent-secondary);
    box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 35px rgba(0,210,255,0.3);
    display: flex; flex-direction: column; overflow: hidden;
    animation: dioramaLand 0.35s ease-out;
  `;

  const renderContent = () => {
    modal.innerHTML = `
      <!-- Header -->
      <div style="padding: 16px 20px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap: 12px;">
          <div style="width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #00D2FF 0%, #0088b3 100%); display:flex; align-items:center; justify-content:center; color:#121824; font-size:1.3rem;">
            🛡️
          </div>
          <div>
            <strong style="display:block; color:var(--text-primary); font-size: 1rem;">Soporte Administración 🇻🇪</strong>
            <span style="color:var(--success); font-size: 0.8rem; font-weight:700;">🟢 En Línea · Respuesta Inmediata</span>
          </div>
        </div>
        <button id="close-admin-chat" style="color:var(--text-secondary); font-size: 1.3rem; background:none; border:none; cursor:pointer;">✕</button>
      </div>

      <!-- Quick Chips -->
      <div style="padding: 10px 16px; background: rgba(0,210,255,0.06); display:flex; gap:8px; overflow-x:auto; border-bottom: 1px solid var(--border-color);">
        <button class="chip-btn" data-type="receipt" style="padding: 6px 12px; border-radius: 16px; background: var(--surface-card); border: 1.5px solid var(--border-gold); color: var(--accent-primary); font-size: 0.78rem; font-weight: 800; white-space: nowrap; cursor: pointer;">
          🧾 Enviar Comprobante Pago Móvil
        </button>
        <button class="chip-btn" data-msg="Tengo una duda sobre mi liquidación de dinero" style="padding: 6px 12px; border-radius: 16px; background: var(--surface-card); border: 1px solid var(--border-color); color: var(--accent-secondary); font-size: 0.78rem; font-weight: 600; white-space: nowrap; cursor: pointer;">
          💵 Duda de Liquidación
        </button>
        <button class="chip-btn" data-msg="Quiero actualizar los documentos de mi moto" style="padding: 6px 12px; border-radius: 16px; background: var(--surface-card); border: 1px solid var(--border-color); color: var(--accent-primary); font-size: 0.78rem; font-weight: 600; white-space: nowrap; cursor: pointer;">
          🪪 Actualizar Documentos
        </button>
      </div>

      <!-- Messages Body -->
      <div id="chat-messages-body" style="flex:1; padding: 16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
        ${messages.map(m => `
          <div style="
            align-self: ${m.sender === 'driver' ? 'flex-end' : 'flex-start'};
            max-width: 82%;
            background: ${m.sender === 'driver' ? 'linear-gradient(135deg, #FFC107 0%, #FF8F00 100%)' : 'var(--surface-elevated)'};
            color: ${m.sender === 'driver' ? '#121824' : 'var(--text-primary)'};
            padding: 12px 16px; border-radius: 18px;
            font-size: 0.92rem; font-weight: 600; line-height: 1.4;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          ">
            ${m.image ? `
              <div style="margin-bottom: 8px; border-radius: 12px; overflow: hidden; border: 1.5px solid rgba(255,255,255,0.4);">
                <img src="${m.image}" style="width: 100%; max-height: 180px; object-fit: cover; display: block;" />
              </div>
            ` : ''}
            <div>${m.text}</div>
            <div style="font-size: 0.7rem; opacity: 0.7; text-align: right; margin-top: 4px;">${m.time}</div>
          </div>
        `).join('')}
      </div>

      <!-- Input Bar -->
      <form id="admin-chat-form" style="padding: 12px 16px; background: var(--surface-elevated); border-top: 1px solid var(--border-color); display:flex; gap: 8px; align-items: center;">
        <input type="file" id="file-upload-driver-admin" accept="image/*" style="display:none;" />
        <button type="button" id="btn-attach-screenshot" style="
          padding: 10px 12px; border-radius: 16px; background: rgba(255,193,7,0.15);
          border: 1.5px solid var(--accent-primary); color: var(--accent-primary); font-weight: 800; font-size: 1.1rem; cursor: pointer;
        " title="Adjuntar Captura de Pantalla / Comprobante">
          📷
        </button>
        <input type="text" id="admin-chat-input" placeholder="Escribe un mensaje o adjunta captura..." autocomplete="off" style="
          flex: 1; padding: 12px 16px; border-radius: 20px; border: 1px solid var(--border-color);
          background: var(--surface-input); color: white; outline: none; font-size: 0.92rem;
        " />
        <button type="submit" class="btn primary-btn" style="padding: 12px 18px; border-radius: 20px; background: var(--accent-secondary); color: #121824; font-weight: 800;">
          Enviar
        </button>
      </form>
    `;

    overlay.innerHTML = '';
    overlay.appendChild(modal);

    modal.querySelector('#close-admin-chat').addEventListener('click', () => overlay.remove());

    const fileInput = modal.querySelector('#file-upload-driver-admin');
    const attachBtn = modal.querySelector('#btn-attach-screenshot');
    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          sendMessage('🧾 Captura de Comprobante de Pago Móvil enviada a Administración', evt.target.result);
          fileInput.value = '';
        };
        reader.readAsDataURL(file);
      }
    });

    modal.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === 'receipt') {
          const sampleReceiptSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect width="300" height="150" fill="%23182232" rx="15"/><text x="20" y="35" fill="%2300E676" font-size="14" font-weight="bold">✓ PAGO MÓVIL BANESCO</text><text x="20" y="65" fill="%23FFFFFF" font-size="12">Origen: Carlos Mendoza (Conductor)</text><text x="20" y="85" fill="%23FFC107" font-size="14" font-weight="bold">Monto: €48.50 EUR (~ Bs. 42,413)</text><text x="20" y="110" fill="%2394A3B8" font-size="11">Ref: %23${Math.floor(100000 + Math.random()*900000)}</text><text x="20" y="130" fill="%2394A3B8" font-size="10">+58express Maracaibo</text></svg>`;
          sendMessage('🧾 Captura de Comprobante de Pago Móvil enviada', sampleReceiptSvg);
        } else {
          sendMessage(btn.dataset.msg);
        }
      });
    });

    modal.querySelector('#admin-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = modal.querySelector('#admin-chat-input');
      if (input.value.trim()) {
        sendMessage(input.value.trim());
        input.value = '';
      }
    });

    setTimeout(() => {
      const body = modal.querySelector('#chat-messages-body');
      if (body) body.scrollTop = body.scrollHeight;
    }, 50);
  };

  const sendMessage = (text, imageDataUrl = null) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messages.push({ sender: 'driver', text, image: imageDataUrl, time });
    renderContent();

    // Auto admin response simulation
    setTimeout(() => {
      const timeResp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (imageDataUrl) {
        messages.push({
          sender: 'admin',
          text: `✅ Recibimos tu comprobante de Pago Móvil correctamente, ${driver?.firstName || 'Carlos'}. Un operador verificó el número de referencia y procedió al registro.`,
          time: timeResp
        });
      } else {
        messages.push({
          sender: 'admin',
          text: `Entendido ${driver?.firstName || 'Carlos'}, recibimos tu mensaje sobre "${text}". Un operador de +58express Maracaibo está atendiendo tu caso.`,
          time: timeResp
        });
      }
      renderContent();
      showToast('Respuesta recibida de Administración', 'info');
    }, 1500);
  };

  renderContent();
  return overlay;
}
