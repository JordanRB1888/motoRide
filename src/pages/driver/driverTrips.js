import { authService } from '../../services/authService.js';
import { apiService } from '../../services/apiService.js';
import { icon } from '../../utils/icons.js';
import { createChatMediaLoader, chatImageSource, hydrateChatMedia } from '../../utils/chatMedia.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const money = trip => Number(trip.fareEUR || trip.fareUSD || trip.totalUSD || 0).toFixed(2);

export function renderDriverTrips() {
  /**
   * Un cargador por pantalla. Los comprobantes de un viaje archivado ya no
   * viajan dentro del mensaje: llevan `imageRef` y hay que pedirlos
   * autenticados. Al volver al listado se sueltan las URLs de la ficha que se
   * abandona, y al salir de la pantalla se destruye el cargador entero.
   */
  const chatMedia = createChatMediaLoader({ loadUrl: endpoint => apiService.getPrivateFileUrl(endpoint) });
  const container = document.createElement('div');
  container.className = 'driver-trips-page';
  const user = authService.getCurrentUser() || {};
  let trips = [];
  let loading = true;

  const drawList = () => {
    container.innerHTML = `<header class="driver-trips-header"><div><h2>Historial de viajes</h2><p>Consulta cada carrera, conversación y comprobante.</p></div><span>${trips.length} viajes</span></header>
      <div class="driver-trip-filters"><button class="active" data-filter="ALL">Todos</button><button data-filter="COMPLETED">Completados</button><button data-filter="CANCELLED">Cancelados</button></div>
      <div class="driver-trip-history-list"></div>`;
    const list = container.querySelector('.driver-trip-history-list');
    const renderFiltered = filter => {
      const selected = filter === 'ALL' ? trips : trips.filter(trip => trip.status === filter);
      list.innerHTML = loading ? '<div class="driver-trips-empty"><strong>Cargando historial real…</strong></div>' : selected.length ? selected.map(trip => `
        <article class="driver-history-card">
          <div class="history-card-top"><span class="history-id">#${esc(String(trip.id || '').slice(-7) || 'VIAJE')}</span><span class="history-status ${esc((trip.status || 'COMPLETED').toLowerCase())}">${trip.status === 'CANCELLED' ? 'Cancelado' : 'Completado'}</span></div>
          <div class="history-route"><span class="route-dot pickup"></span><div><small>RECOGIDA</small><strong>${esc(trip.pickup?.address || 'Ubicación del pasajero')}</strong></div><span class="route-line"></span><span class="route-dot destination"></span><div><small>DESTINO</small><strong>${esc(trip.destination?.address || 'Destino en Maracaibo')}</strong></div></div>
          <div class="history-card-meta"><div><small>Fecha</small><strong>${new Date(trip.completedAt || trip.createdAt || Date.now()).toLocaleDateString('es-VE')}</strong></div><div><small>Pago</small><strong>${esc(String(trip.paymentMethod || 'Efectivo').replace('_',' '))}</strong></div><div><small>Tarifa</small><strong>€${money(trip)}</strong></div></div>
          <button class="history-detail-btn" data-id="${esc(trip.id)}">Ver detalles del viaje ${icon('chevronRight', 16)}</button>
        </article>`).join('') : `<div class="driver-trips-empty">${icon('history', 32)}<strong>No hay viajes en esta categoría</strong><small>Las carreras aparecerán aquí automáticamente.</small></div>`;
      list.querySelectorAll('.history-detail-btn').forEach(button => button.addEventListener('click', () => openDetail(trips.find(trip => String(trip.id) === button.dataset.id))));
    };
    container.querySelectorAll('.driver-trip-filters button').forEach(button => button.addEventListener('click', () => {
      container.querySelectorAll('.driver-trip-filters button').forEach(item => item.classList.toggle('active', item === button));
      renderFiltered(button.dataset.filter);
    }));
    renderFiltered('ALL');
  };

  const openDetail = async trip => {
    if (!trip) return;
    let localMessages = [];
    try { localMessages = JSON.parse(localStorage.getItem(`58express_chat_${trip.id}`) || '[]'); } catch {}
    const serverMessages = await apiService.get(`/trips/${encodeURIComponent(trip.id)}/messages`) || [];
    const merged = [...new Map([...localMessages, ...serverMessages].map(message => [message.id || `${message.timestamp}:${message.text}`, message])).values()]
      .sort((a,b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
    // La abstraccion oficial decide de donde sale la imagen: `imageRef` manda
    // sobre `image`, de modo que un mensaje con los dos cuenta y se pinta una
    // sola vez. El contador sale de aqui, no del campo heredado.
    const conMedios = merged.map(message => ({ message, media: chatImageSource(message) }));
    const attachments = conMedios.filter(item => item.media);
    // El privado nace oculto y lo rellena `hydrateChatMedia` cuando llega; si
    // no llega --sesion caducada, sin acceso-- su hueco se queda asi y la
    // ficha se sigue leyendo.
    const adjuntoArchivado = (media, alt) => {
      if (!media) return '';
      return media.kind === 'ref'
        ? `<img data-chat-media="${esc(media.id)}" hidden alt="${esc(alt)}">`
        : `<img src="${esc(media.dataUrl)}" alt="${esc(alt)}">`;
    };
    const date = value => value ? new Date(value).toLocaleString('es-VE') : 'No registrado';
    container.innerHTML = `<button class="trip-detail-back">${icon('back',16)} Volver a mis viajes</button>
      <section class="driver-trip-detail">
        <header><div><small>EXPEDIENTE DE VIAJE</small><h2>#${esc(String(trip.id).slice(-8))}</h2></div><span class="history-status ${esc((trip.status || '').toLowerCase())}">${esc(trip.status || 'COMPLETED')}</span></header>
        <div class="trip-detail-route"><div><span>●</span><small>Recogida</small><strong>${esc(trip.pickup?.address || 'Ubicación del pasajero')}</strong></div><div><span>◆</span><small>Destino</small><strong>${esc(trip.destination?.address || 'Destino en Maracaibo')}</strong></div></div>
        <div class="trip-detail-grid"><div><small>Pasajero</small><strong>${esc(trip.passenger?.name || trip.passengerName || 'Pasajero +58')}</strong></div><div><small>Tarifa</small><strong>€${money(trip)}</strong></div><div><small>Método de pago</small><strong>${esc(String(trip.paymentMethod || 'Efectivo').replace('_',' '))}</strong></div><div><small>Distancia</small><strong>${Number(trip.distanceKm || 0).toFixed(1)} km</strong></div></div>
        <div class="trip-timeline"><h3>Historial del viaje</h3><div><span></span><p><strong>Solicitud creada</strong><small>${date(trip.createdAt)}</small></p></div><div><span></span><p><strong>Conductor asignado</strong><small>${date(trip.acceptedAt || trip.updatedAt)}</small></p></div><div><span></span><p><strong>Viaje finalizado</strong><small>${date(trip.completedAt || trip.closedAt)}</small></p></div></div>
        <div class="trip-conversation"><h3>Conversación (${merged.length})</h3>${conMedios.length ? conMedios.map(({ message, media }) => `<div class="archived-message ${message.senderId === user.id ? 'mine' : ''}">${adjuntoArchivado(media, 'Captura adjunta')}<p>${esc(message.text || 'Imagen adjunta')}</p><small>${date(message.timestamp || message.createdAt)}</small></div>`).join('') : '<p class="trip-detail-empty">No hubo mensajes durante este viaje.</p>'}</div>
        <div class="trip-attachments"><h3>Capturas y comprobantes (${attachments.length})</h3><div>${attachments.length ? attachments.map(({ media }) => media.kind === 'legacy' ? `<a href="${esc(media.dataUrl)}" target="_blank" rel="noopener"><img src="${esc(media.dataUrl)}" alt="Comprobante del viaje"></a>` : adjuntoArchivado(media, 'Comprobante del viaje')).join('') : '<p class="trip-detail-empty">No se adjuntaron capturas o comprobantes.</p>'}</div></div>
      </section>`;
    // Se piden despues de pintar: la ficha se ve de inmediato.
    hydrateChatMedia(container, chatMedia);
    container.querySelector('.trip-detail-back').addEventListener('click', () => {
      // La ficha se abandona: sus object URLs no tienen ya quien las mire.
      chatMedia.releaseAll();
      drawList();
    });
  };

  drawList();
  apiService.get('/trips/me/history').then(result => {
    trips = Array.isArray(result) ? result : [];
    loading = false;
    drawList();
  });

  // Desmontaje: mismo patron que el panel de soporte. El enrutador vacia el
  // contenedor al cambiar de ruta, y eso desconecta el DOM pero no libera las
  // object URLs. `disposeAllPrivatePhotos` tambien las alcanzaria --sigue
  // siendo la red de seguridad--, pero soltarlas aqui las devuelve en cuanto
  // la pantalla se va, sin esperar a la siguiente navegacion.
  const observer = new MutationObserver(() => {
    if (document.body.contains(container)) return;
    chatMedia.destroy();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return container;
}
