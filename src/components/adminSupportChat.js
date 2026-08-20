import { apiService } from '../services/apiService.js';
import { socket } from '../services/socketClient.js';
import { showToast } from './toast.js';
import { accumulatePage } from '../utils/liveUpdates.js';
import { createChatMediaLoader, chatImageSource, hydrateChatMedia } from '../utils/chatMedia.js';

/**
 * Marcado del adjunto de un mensaje de soporte.
 *
 * `imageRef` manda sobre `image`, asi que un mensaje con ambos se pinta una
 * sola vez. El heredado se sigue mostrando tal cual mientras exista.
 */
const adjunto = m => {
  const media = chatImageSource(m);
  if (!media) return '';
  return media.kind === 'ref'
    ? `<img data-chat-media="${esc(media.id)}" hidden alt="Adjunto" style="max-width:100%;max-height:180px;border-radius:9px">`
    : `<img src="${esc(media.dataUrl)}" alt="Adjunto" style="max-width:100%;max-height:180px;border-radius:9px">`;
};

const esc=value=>String(value||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

export function createAdminSupportChat(user) {
  /**
   * Un cargador por instancia, no uno de modulo.
   *
   * `disposeAllPrivatePhotos()` destruye todos los cargadores vivos en cada
   * cambio de ruta, y `destroy()` es irreversible a proposito. Con un cargador
   * de modulo, al volver a abrir el hilo se reutilizaba ese mismo objeto ya
   * muerto y ninguna imagen volvia a cargarse hasta recargar la pagina entera.
   * Naciendo con la instancia, cada apertura estrena el suyo.
   */
  const chatMedia = createChatMediaLoader({ loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint) });
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:#070b12dd;backdrop-filter:blur(12px);display:grid;place-items:center;padding:16px';
  const modal=document.createElement('div');modal.style.cssText='width:min(460px,100%);height:min(650px,90vh);background:var(--surface-card);border:2px solid var(--accent-secondary);border-radius:26px;display:flex;flex-direction:column;overflow:hidden';overlay.appendChild(modal);
  let messages=[];
  let olderCursor=null;
  // Al traer mensajes anteriores no se salta al final: se perderia el punto
  // de lectura y el boton quedaria inservible.
  let anclarAbajo=true;
  let loadingOlder=false;
  const render=()=>{modal.innerHTML=`<header style="padding:16px 18px;background:var(--surface-elevated);display:flex;justify-content:space-between"><div><b>🛡️ Soporte +58express</b><small style="display:block;color:var(--success)">Operación en tiempo real</small></div><button id="close" style="background:none;border:0;color:var(--text-primary);font-size:20px">×</button></header><div id="msgs" style="flex:1;padding:15px;overflow:auto;display:flex;flex-direction:column;gap:10px">${olderCursor?`<button id="older" style="align-self:center;background:var(--surface-elevated);color:var(--text-primary);border:1px solid var(--border-color);border-radius:14px;padding:8px 14px;font-size:13px" ${loadingOlder?'disabled':''}>${loadingOlder?'Cargando…':'Ver mensajes anteriores'}</button>`:''}${messages.map(m=>`<div style="align-self:${m.senderRole==='admin'?'flex-start':'flex-end'};max-width:82%;padding:11px 14px;border-radius:16px;background:${m.senderRole==='admin'?'var(--surface-elevated)':'var(--accent-primary)'};color:${m.senderRole==='admin'?'var(--text-primary)':'#121824'}">${adjunto(m)}<div>${esc(m.text)}</div><small>${new Date(m.createdAt).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')||'<p style="margin:auto;color:var(--text-secondary)">Cuéntanos cómo podemos ayudarte.</p>'}</div><form id="form" style="display:flex;gap:8px;padding:12px;border-top:1px solid var(--border-color)"><input id="input" required placeholder="Escribe a administración…" style="flex:1;padding:12px;border-radius:15px;border:1px solid var(--border-color);background:var(--surface-input);color:var(--text-primary)"><button class="btn primary-btn">Enviar</button></form>`;modal.querySelector('#older')?.addEventListener('click',loadOlder);modal.querySelector('#close').onclick=()=>{socket.off('support:message',onMessage);chatMedia.destroy();overlay.remove();};hydrateChatMedia(modal.querySelector('#msgs'),chatMedia);modal.querySelector('#form').onsubmit=async event=>{event.preventDefault();const input=modal.querySelector('#input');const sent=await apiService.post('/support/messages',{text:input.value.trim()});if(sent){messages.push(sent);render();}else showToast('No se pudo enviar el mensaje','error');};if(anclarAbajo)requestAnimationFrame(()=>{const body=modal.querySelector('#msgs');if(body)body.scrollTop=body.scrollHeight;});};
  // El hilo propio se pide directamente, en lugar de descargar el listado
  // completo para buscarse dentro. El endpoint devuelve del más reciente al
  // más antiguo; aquí se invierte para mostrarlo en orden de conversación.
  //
  // Se carga el tramo más reciente y se ofrece continuar hacia atrás con el
  // cursor. Subir el límite solo correría el problema más lejos: una
  // conversación larga seguiría quedando truncada sin aviso.
  const PAGINA=30;
  const conversationId=()=>user?.id||'d1';
  const cargarPagina=async cursor=>{
    const consulta=`/support/threads/${encodeURIComponent(conversationId())}/messages?limit=${PAGINA}`
      +(cursor?`&cursor=${encodeURIComponent(cursor)}`:'');
    return apiService.get(consulta);
  };
  const load=async()=>{
    const page=await cargarPagina(null);
    messages=Array.isArray(page?.items)?[...page.items].reverse():[];
    olderCursor=page?.nextCursor||null;
    render();
  };
  const loadOlder=async()=>{
    if(!olderCursor||loadingOlder)return;
    loadingOlder=true;anclarAbajo=false;render();
    const page=await cargarPagina(olderCursor);
    loadingOlder=false;
    if(Array.isArray(page?.items)){
      messages=accumulatePage(messages,[...page.items].reverse(),{posicion:'inicio'});
      olderCursor=page.nextCursor||null;
    }else olderCursor=null;
    render();
    anclarAbajo=true;
  };
  const onMessage=payload=>{if(payload?.conversationUserId===(user?.id||'d1')&&!messages.some(m=>m.id===payload.id)){messages.push(payload);render();showToast('Nueva respuesta de Soporte','info');}};
  socket.on('support:message',onMessage);render();load();return overlay;
}
