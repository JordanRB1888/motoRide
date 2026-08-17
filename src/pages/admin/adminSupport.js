import { apiService } from '../../services/apiService.js';
import { socket } from '../../services/socketClient.js';
import { showToast } from '../../components/toast.js';
import { icon } from '../../utils/icons.js';
import { neutralizePrivatePhoto } from '../../utils/privatePhoto.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const fullName = user => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Usuario +58Express';
const initials = user => `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '58';
const dateValue = value => Number.isNaN(new Date(value).getTime()) ? new Date(0) : new Date(value);
const shortTime = value => dateValue(value).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
const fullDate = value => dateValue(value).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' });
const tripStatus = status => ({ SEARCHING: 'Buscando conductor', DRIVER_ASSIGNED: 'Conductor asignado', EN_ROUTE: 'En camino', ARRIVED: 'En recogida', IN_PROGRESS: 'En viaje', IN_TRIP: 'En viaje', COMPLETED: 'Completado', CANCELLED: 'Cancelado', SCHEDULED: 'Programado' }[status] || status || 'Sin actividad');
const ACTIVE_TRIP_STATUSES = new Set(['SEARCHING', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'IN_TRIP']);
const QUICK_REPLIES = ['Voy a revisar tu caso', '¿Puedes compartir más detalles?', 'Estamos asignando otro conductor'];

// El cálculo se movió al servidor: recorrerlo en el navegador exigía recibir el
// historial completo de todos los hilos, que es justo lo que el listado ha
// dejado de enviar. Aquí solo queda el formato, idéntico al anterior.
function formatResponseTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function latestTripFor(userId, trips) {
  return trips
    .filter(trip => trip.passengerId === userId || trip.driverId === userId || trip.assignedDriverId === userId)
    .sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt))[0] || null;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function renderAdminSupport(container) {
  let disposed = false;
  let threads = [];
  let trips = [];
  let activeId = localStorage.getItem('58express_support_focus') || null;
  let search = '';
  let filter = 'all';
  let pendingImage = null;
  // Los mensajes ya no viajan dentro del listado: se cargan del hilo abierto.
  let activeMessages = [];
  let averageResponseMs = null;
  let threadTotal = 0;
  let loading = true;
  const resolvedIds = new Set(JSON.parse(localStorage.getItem('58express_support_resolved') || '[]'));

  // El endpoint devuelve del más reciente al más antiguo; se invierte para
  // mostrar la conversación en su orden natural.
  const loadActiveMessages = async () => {
    if (!activeId) { activeMessages = []; return; }
    const page = await apiService.get(`/support/threads/${encodeURIComponent(activeId)}/messages?limit=50`);
    if (disposed) return;
    activeMessages = Array.isArray(page?.items) ? [...page.items].reverse() : [];
  };

  const load = async ({ preserveActive = true } = {}) => {
    const [threadData, tripData] = await Promise.all([
      apiService.get('/support/threads?limit=100'),
      apiService.get('/trips')
    ]);
    if (disposed) return;
    threads = Array.isArray(threadData?.items) ? threadData.items : [];
    threadTotal = Number(threadData?.total) || threads.length;
    averageResponseMs = Number.isFinite(threadData?.averageResponseMs) ? threadData.averageResponseMs : null;
    trips = Array.isArray(tripData) ? tripData : [];
    if (!preserveActive || !threads.some(thread => thread.user?.id === activeId)) activeId = threads[0]?.user?.id || null;
    localStorage.removeItem('58express_support_focus');
    await loadActiveMessages();
    if (disposed) return;
    loading = false;
    draw();
  };

  const saveResolved = () => localStorage.setItem('58express_support_resolved', JSON.stringify([...resolvedIds]));

  const visibleThreads = () => threads
    .filter(thread => {
      if (filter === 'unread' && !thread.unread) return false;
      if (filter === 'resolved' && !resolvedIds.has(thread.user?.id)) return false;
      if (filter === 'open' && resolvedIds.has(thread.user?.id)) return false;
      const haystack = `${fullName(thread.user)} ${thread.user?.email || ''} ${thread.user?.phone || ''} ${thread.lastMessage?.text || ''}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    })
    .sort((a, b) => dateValue(b.lastMessage?.createdAt) - dateValue(a.lastMessage?.createdAt));

  const threadCard = thread => {
    const user = thread.user || {};
    const last = thread.lastMessage;
    const resolved = resolvedIds.has(user.id);
    return `<button class="support-thread ${user.id === activeId ? 'active' : ''}" data-thread-id="${escapeHtml(user.id)}" type="button">
      <span class="support-avatar ${user.role === 'driver' ? 'driver' : ''}">${neutralizePrivatePhoto(user.avatar) ? `<img src="${escapeHtml(neutralizePrivatePhoto(user.avatar))}" alt="">` : escapeHtml(initials(user))}<i></i></span>
      <span class="support-thread-copy"><span><strong>${escapeHtml(fullName(user))}</strong><time>${last ? shortTime(last.createdAt) : ''}</time></span><small>${user.role === 'driver' ? 'Conductor' : 'Pasajero'} · ID ${escapeHtml(String(user.id || '').slice(-10))}</small><em>${escapeHtml(last?.text || (last?.image ? 'Archivo adjunto' : 'Nueva conversación'))}</em></span>
      ${thread.unread ? `<b class="support-unread">${thread.unread > 9 ? '9+' : thread.unread}</b>` : resolved ? `<b class="support-resolved">${icon('check', 12)}</b>` : ''}
    </button>`;
  };

  const messageBubble = message => `<article class="support-message ${message.senderRole === 'admin' ? 'admin' : 'customer'}">
    ${message.image ? `<a href="${escapeHtml(message.image)}" target="_blank" rel="noopener"><img src="${escapeHtml(message.image)}" alt="Adjunto de soporte"></a>` : ''}
    ${message.text ? `<p>${escapeHtml(message.text)}</p>` : ''}
    <small>${fullDate(message.createdAt)} ${message.senderRole === 'admin' ? icon('check', 11) : ''}</small>
  </article>`;

  const draw = () => {
    if (disposed) return;
    const active = threads.find(thread => thread.user?.id === activeId) || null;
    const user = active?.user;
    const latestTrip = user ? latestTripFor(user.id, trips) : null;
    const unread = threads.reduce((sum, thread) => sum + Number(thread.unread || 0), 0);
    const open = threads.filter(thread => !resolvedIds.has(thread.user?.id)).length;
    const resolved = threads.filter(thread => resolvedIds.has(thread.user?.id)).length;
    const filtered = visibleThreads();
    const activeTrip = latestTrip && ACTIVE_TRIP_STATUSES.has(latestTrip.status);
    const routeFrom = latestTrip?.pickup?.address || latestTrip?.pickupAddress || 'Origen no disponible';
    const routeTo = latestTrip?.destination?.address || latestTrip?.destinationAddress || 'Destino no disponible';

    container.innerHTML = `<div class="support-command-view">
      <header class="support-command-head">
        <div><div class="support-title-line"><h1>Centro de Soporte</h1><span><i></i> Operación en tiempo real</span></div><p>Conversaciones persistentes con pasajeros y conductores.</p></div>
        <div class="support-head-tools"><span class="support-operators"><i></i><small>Operadores en línea</small><strong>1</strong></span><label class="support-global-search">${icon('search', 17)}<input id="support-global-search" value="${escapeHtml(search)}" placeholder="Buscar conversación, pasajero o ID…"></label><button class="support-filter-trigger" type="button">${icon('filter', 16)} Filtros</button><button id="broadcast" class="support-broadcast" type="button">${icon('volume2', 17)} Nuevo comunicado</button></div>
      </header>

      <section class="support-metrics">
        <article class="amber"><span>${icon('message', 23)}</span><div><small>Conversaciones</small><strong>${open}</strong><em>Abiertas ahora</em></div></article>
        <article class="cyan"><span>${icon('bell', 23)}</span><div><small>Sin leer</small><strong>${unread}</strong><em>Requieren atención</em></div></article>
        <article class="green"><span>${icon('clock', 23)}</span><div><small>Tiempo medio</small><strong>${formatResponseTime(averageResponseMs)}</strong><em>Primera respuesta</em></div></article>
        <article class="lime"><span>${icon('checkCircle', 23)}</span><div><small>Resueltos</small><strong>${resolved}</strong><em>Casos cerrados</em></div></article>
      </section>

      <section class="support-workspace ${active ? '' : 'no-active'}">
        <aside class="support-inbox">
          <header><h2>Conversaciones</h2><span>${threadTotal}</span></header>
          <nav>${[['all','Todas',threadTotal],['unread','Sin leer',unread],['open','Abiertas',open],['resolved','Resueltas',resolved]].map(([id,label,count]) => `<button class="${filter === id ? 'active' : ''}" data-support-filter="${id}" type="button">${label}<b>${count}</b></button>`).join('')}</nav>
          <label class="support-list-search">${icon('search', 15)}<input id="support-list-search" value="${escapeHtml(search)}" placeholder="Buscar conversación"></label>
          <div class="support-thread-list">${loading ? '<div class="support-empty">Cargando conversaciones…</div>' : filtered.map(threadCard).join('') || '<div class="support-empty">No hay conversaciones con este filtro.</div>'}</div>
        </aside>

        <main class="support-chat-panel">
          ${active ? `<header class="support-chat-head"><div class="support-avatar ${user.role === 'driver' ? 'driver' : ''}">${neutralizePrivatePhoto(user.avatar) ? `<img src="${escapeHtml(neutralizePrivatePhoto(user.avatar))}" alt="">` : escapeHtml(initials(user))}<i></i></div><div><strong>${escapeHtml(fullName(user))}</strong><small>${user.role === 'driver' ? 'Conductor' : 'Pasajero'} · ID ${escapeHtml(String(user.id).slice(-10))}</small></div><div class="support-chat-actions"><button data-copy-user title="Copiar datos">${icon('info',17)}</button>${user.phone ? `<a href="tel:${escapeHtml(user.phone)}" title="Llamar">${icon('phone',17)}</a>` : ''}</div></header>
          <div id="support-messages" class="support-messages"><time class="support-day">Conversación de soporte</time>${activeMessages.map(messageBubble).join('') || '<div class="support-empty">Aún no hay mensajes en esta conversación.</div>'}</div>
          <div class="support-quick-replies">${QUICK_REPLIES.map(reply => `<button data-quick-reply="${escapeHtml(reply)}" type="button">${escapeHtml(reply)}</button>`).join('')}</div>
          <form id="reply-form" class="support-composer"><label class="support-attach" title="Adjuntar imagen">${icon('upload',18)}<input id="support-image" type="file" accept="image/jpeg,image/png,image/webp"></label><button class="support-template" type="button">Respuestas rápidas ${icon('chevronDown',13)}</button><label class="support-reply-wrap">${pendingImage ? `<span>Imagen lista ${icon('check',12)}</span>` : ''}<input id="reply" placeholder="Escribe una respuesta oficial…" autocomplete="off"></label><button class="support-send" type="submit">Enviar ${icon('send',16)}</button></form>` : '<div class="support-no-selection"><span>'+icon('message',30)+'</span><h3>Selecciona una conversación</h3><p>Los mensajes aparecerán aquí en tiempo real.</p></div>'}
        </main>

        ${active ? `<aside class="support-context">
          <section><header><h3>Información del ${user.role === 'driver' ? 'conductor' : 'pasajero'}</h3></header><div class="support-profile-row"><span class="support-avatar large ${user.role === 'driver' ? 'driver' : ''}">${neutralizePrivatePhoto(user.avatar) ? `<img src="${escapeHtml(neutralizePrivatePhoto(user.avatar))}" alt="">` : escapeHtml(initials(user))}</span><div><strong>${escapeHtml(fullName(user))}</strong><small>${user.role === 'driver' ? 'Conductor' : 'Pasajero'} verificado</small></div></div><dl><div><dt>${icon('phone',13)} Teléfono</dt><dd>${escapeHtml(user.phone || 'No disponible')}</dd></div><div><dt>${icon('message',13)} Correo</dt><dd>${escapeHtml(user.email || 'No disponible')}</dd></div></dl></section>
          <section class="support-trip-context"><header><h3>${activeTrip ? 'Viaje activo' : 'Último viaje'}</h3><span class="${activeTrip ? 'live' : ''}">${tripStatus(latestTrip?.status)}</span></header>${latestTrip ? `<code>#${escapeHtml(String(latestTrip.id).slice(-12))}</code><div class="support-route"><p><i class="pickup"></i><span>${escapeHtml(routeFrom)}</span></p><p><i class="destination"></i><span>${escapeHtml(routeTo)}</span></p></div><footer><span>${fullDate(latestTrip.updatedAt || latestTrip.createdAt)}</span><strong>$${Number(latestTrip.fareUSD || latestTrip.fareEUR || latestTrip.pricing?.fareUSD || 0).toFixed(2)}</strong></footer>` : '<p class="support-context-empty">Este usuario no tiene viajes registrados.</p>'}</section>
          <section class="support-case"><header><h3>Información del caso</h3><span>${active.unread ? 'Prioridad media' : resolvedIds.has(user.id) ? 'Resuelto' : 'En seguimiento'}</span></header><dl><div><dt>Estado</dt><dd>${resolvedIds.has(user.id) ? 'Resuelto' : 'En progreso'}</dd></div><div><dt>Asignado a</dt><dd>Admin Soporte</dd></div><div><dt>Última actividad</dt><dd>${shortTime(active.lastMessage?.createdAt)}</dd></div></dl><div class="support-tags"><span>soporte</span><span>${user.role === 'driver' ? 'conductor' : 'pasajero'}</span>${activeTrip ? '<span>viaje activo</span>' : ''}</div></section>
          <section class="support-context-actions"><button id="support-resolve" class="${resolvedIds.has(user.id) ? 'resolved' : ''}" type="button">${icon(resolvedIds.has(user.id) ? 'history' : 'checkCircle',17)} ${resolvedIds.has(user.id) ? 'Reabrir caso' : 'Marcar como resuelto'}</button><button data-copy-user type="button">${icon('copy',17)} Copiar datos</button></section>
        </aside>` : ''}
      </section>
    </div>`;

    bindEvents();
    requestAnimationFrame(() => { const body = container.querySelector('#support-messages'); if (body) body.scrollTop = body.scrollHeight; });
  };

  const bindEvents = () => {
    container.querySelectorAll('[data-thread-id]').forEach(button => button.addEventListener('click', async () => {
      activeId = button.dataset.threadId;
      pendingImage = null;
      // Se repinta antes de la peticion para que el cambio de hilo sea
      // inmediato y no se vea la conversacion anterior mientras carga.
      activeMessages = [];
      draw();
      await apiService.patch(`/support/threads/${encodeURIComponent(activeId)}/read`, {});
      const thread = threads.find(item => item.user?.id === activeId);
      if (thread) thread.unread = 0;
      await loadActiveMessages();
      draw();
    }));
    container.querySelectorAll('[data-support-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.supportFilter; draw(); }));
    ['support-global-search', 'support-list-search'].forEach(id => container.querySelector(`#${id}`)?.addEventListener('input', event => {
      search = event.target.value;
      const cursor = search.length;
      draw();
      const next = container.querySelector(`#${id}`);
      next?.focus(); next?.setSelectionRange(cursor, cursor);
    }));
    container.querySelectorAll('[data-quick-reply]').forEach(button => button.addEventListener('click', () => { const input = container.querySelector('#reply'); if (input) { input.value = button.dataset.quickReply; input.focus(); } }));
    container.querySelector('#support-image')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 700_000) return showToast('La imagen debe pesar menos de 700 KB', 'error');
      pendingImage = await readFileAsDataUrl(file);
      draw();
    });
    container.querySelector('#reply-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const input = container.querySelector('#reply');
      const text = input?.value.trim() || '';
      if (!text && !pendingImage) return showToast('Escribe un mensaje o adjunta una imagen', 'info');
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true;
      const sent = await apiService.post('/support/messages', { recipientId: activeId, text, image: pendingImage });
      if (!sent) { submit.disabled = false; return showToast('No se pudo enviar la respuesta', 'error'); }
      const thread = threads.find(item => item.user?.id === activeId);
      if (!activeMessages.some(message => message.id === sent.id)) activeMessages.push(sent);
      if (thread) { thread.lastMessage = sent; thread.messageCount = Number(thread.messageCount || 0) + 1; }
      pendingImage = null;
      resolvedIds.delete(activeId); saveResolved();
      draw();
    });
    container.querySelectorAll('[data-copy-user]').forEach(button => button.addEventListener('click', async () => {
      const active = threads.find(thread => thread.user?.id === activeId);
      if (!active) return;
      await navigator.clipboard?.writeText(`${fullName(active.user)}\n${active.user.phone || ''}\n${active.user.email || ''}`);
      showToast('Datos copiados', 'success');
    }));
    container.querySelector('#support-resolve')?.addEventListener('click', () => {
      if (resolvedIds.has(activeId)) resolvedIds.delete(activeId); else resolvedIds.add(activeId);
      saveResolved(); draw();
      showToast(resolvedIds.has(activeId) ? 'Caso marcado como resuelto' : 'Caso reabierto', 'success');
    });
    container.querySelector('#broadcast')?.addEventListener('click', openBroadcast);
  };

  const openBroadcast = () => {
    const overlay = document.createElement('div');
    overlay.className = 'support-broadcast-overlay';
    overlay.innerHTML = `<form class="support-broadcast-modal"><header><span>${icon('volume2',22)}</span><div><h3>Nuevo comunicado</h3><p>Envía una notificación en tiempo real.</p></div><button id="broadcast-close" type="button">${icon('close',18)}</button></header><label>Destinatarios<select id="role"><option value="all">Toda la plataforma</option><option value="passenger">Solo pasajeros</option><option value="driver">Solo conductores</option></select></label><label>Título<input id="title" required maxlength="120" placeholder="Título del comunicado"></label><label>Mensaje<textarea id="message" required maxlength="1000" rows="5" placeholder="Escribe el mensaje oficial"></textarea></label><footer><button id="broadcast-cancel" type="button">Cancelar</button><button class="support-broadcast-submit" type="submit">${icon('send',16)} Emitir ahora</button></footer></form>`;
    const close = () => overlay.remove();
    overlay.querySelector('#broadcast-close').onclick = close;
    overlay.querySelector('#broadcast-cancel').onclick = close;
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
      const result = await apiService.post('/admin/broadcasts', { role: overlay.querySelector('#role').value, title: overlay.querySelector('#title').value, message: overlay.querySelector('#message').value });
      showToast(result ? 'Comunicado entregado en tiempo real' : 'No se pudo emitir', result ? 'success' : 'error');
      if (result) close(); else submit.disabled = false;
    };
    document.body.appendChild(overlay);
  };

  const onSupportMessage = payload => {
    if (disposed) return;
    const thread = threads.find(item => item.user?.id === payload?.conversationUserId);
    if (thread && thread.lastMessage?.id !== payload.id) {
      thread.lastMessage = payload;
      thread.messageCount = Number(thread.messageCount || 0) + 1;
      if (payload.conversationUserId === activeId && !activeMessages.some(message => message.id === payload.id)) {
        activeMessages.push(payload);
      }
      if (payload.senderRole !== 'admin' && payload.conversationUserId !== activeId) thread.unread = Number(thread.unread || 0) + 1;
      if (payload.senderRole !== 'admin') { resolvedIds.delete(payload.conversationUserId); saveResolved(); }
      draw();
    } else load();
  };

  socket.on('support:message', onSupportMessage);
  const observer = new MutationObserver(() => {
    if (document.body.contains(container) && container.querySelector('.support-command-view')) return;
    disposed = true;
    socket.off('support:message', onSupportMessage);
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  draw();
  await load({ preserveActive: false });
}
