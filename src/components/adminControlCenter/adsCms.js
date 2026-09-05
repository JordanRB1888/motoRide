import { icon } from '../../utils/icons.js';
import { createOwnedObjectUrl, revokeOwnedObjectUrl } from '../../utils/privatePhoto.js';
import { esc, pageHeader, empty, metric } from './ui.js';

// No catalog endpoint exists yet. Only user-authored session drafts are shown.
const INITIAL_CAMPAIGNS = [];

const ADS_TABS = [
  ['all', 'Todas'],
  ['active', 'Activas'],
  ['scheduled', 'Programadas'],
  ['paused', 'Pausadas'],
  ['ended', 'Finalizadas']
];

export function renderAdsCms(container) {
  let campaigns = [...INITIAL_CAMPAIGNS];
  let filter = 'all';
  let query = '';
  let viewMode = 'list'; // 'list' | 'editor'
  let editingCampaign = null;
  let previewPlacement = 'top'; // 'top' | 'feed'
  let activePreviewUrl = null;
  let hasUnsavedChanges = false;

  const cleanupImage = () => {
    if (activePreviewUrl) {
      revokeOwnedObjectUrl(activePreviewUrl);
      activePreviewUrl = null;
    }
  };

  const openEditor = (campaignToEdit = null) => {
    cleanupImage();
    hasUnsavedChanges = false;
    const isNew = !campaignToEdit;
    editingCampaign = campaignToEdit ? { ...campaignToEdit } : {
      id: `camp-${Date.now()}`,
      name: '',
      title: '',
      subtitle: '',
      cta: 'Ver promoción',
      url: '',
      status: 'active',
      placement: 'home_top',
      start: new Date().toISOString().slice(0, 16),
      end: '',
      order: campaigns.length + 1,
      views: 0,
      clicks: 0,
      imageBlob: null
    };
    previewPlacement = editingCampaign.placement === 'home_feed' ? 'feed' : 'top';
    viewMode = 'editor';
    render();
  };

  const closeEditor = () => {
    cleanupImage();
    editingCampaign = null;
    viewMode = 'list';
    hasUnsavedChanges = false;
    render();
  };

  const render = () => {
    if (viewMode === 'editor' && editingCampaign) {
      renderWorkspaceEditor();
    } else {
      renderListView();
    }
  };

  const renderWorkspaceEditor = () => {
    const isNew = !campaigns.some(c => c.id === editingCampaign.id);
    const campaignTitle = editingCampaign.title || 'Nueva campaña';
    let tempImageUrl = editingCampaign.imageBlob || null;

    container.innerHTML = `
      <div class="cc-campaign-workspace">
        <!-- TOPBAR CON BREADCRUMB E INDICADOR DE ESTADO -->
        <header class="cc-workspace-topbar">
          <nav class="cc-breadcrumb-trail" aria-label="Ruta de navegación">
            <button type="button" class="cc-breadcrumb-btn" id="btn-back-to-ads">
              ${icon('arrowLeft', 14)} Publicidad
            </button>
            <span class="cc-breadcrumb-sep">/</span>
            <span class="cc-breadcrumb-current">${isNew ? 'Nueva campaña' : `Editar: ${esc(campaignTitle)}`}</span>
          </nav>

          <div class="cc-workspace-status-indicator">
            <span class="cc-autosave-pill" id="autosave-status-pill">
              <i></i> ${hasUnsavedChanges ? 'Cambios sin guardar en sesión' : 'Borrador guardado localmente'}
            </span>
          </div>
        </header>

        <!-- LAYOUT SPLIT: EDITOR (62%) | LIVE PREVIEW PASSENGER (38%) -->
        <div class="cc-workspace-split">
          <!-- COLUMNA IZQUIERDA: EDITOR ESTRUCTURADO POR SECCIONES -->
          <main class="cc-workspace-editor-col">
            <form id="campaign-workspace-form" onsubmit="return false;" style="display:flex;flex-direction:column;">

              <!-- SECCIÓN 1: INFORMACIÓN DE LA CAMPAÑA -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">1</span> Información de la campaña
                  </h3>
                  <p class="cc-form-section-desc">Identificación interna y redacción publicitaria que leerán los pasajeros.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field" style="grid-column:1/-1;">
                    Nombre interno de campaña
                    <input name="name" value="${esc(editingCampaign.name || editingCampaign.title || '')}" placeholder="Ej.: Promoción nocturna Maracaibo Q4" required>
                  </label>

                  <label class="cc-field" style="grid-column:1/-1;">
                    Título del anuncio
                    <input name="title" id="form-field-title" value="${esc(editingCampaign.title)}" placeholder="Ej.: Viaja seguro con 20% de descuento" required>
                  </label>

                  <label class="cc-field" style="grid-column:1/-1;">
                    Descripción / Subtítulo
                    <textarea name="subtitle" id="form-field-subtitle" rows="3" placeholder="Detalla el beneficio, código o condiciones del servicio..." required>${esc(editingCampaign.subtitle)}</textarea>
                  </label>
                </div>
              </section>

              <!-- SECCIÓN 2: CREATIVIDAD VISUAL -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">2</span> Creatividad visual
                  </h3>
                  <p class="cc-form-section-desc">Arte gráfico adaptado al carrusel y tarjetas de Passenger Home.</p>
                </div>

                <div id="media-container-box">
                  ${tempImageUrl ? `
                    <div class="cc-dropzone-preview-card">
                      <div class="cc-dropzone-image-wrap">
                        <img src="${tempImageUrl}" id="campaign-banner-image-preview" alt="Arte de campaña">
                      </div>
                      <div class="cc-dropzone-actions">
                        <div class="cc-dropzone-actions-left">
                          ${icon('check', 14)} Arte cargado en memoria protegida
                        </div>
                        <div class="cc-dropzone-actions-right">
                          <button type="button" class="cc-clean-dropzone-btn" id="btn-trigger-media">${icon('upload', 14)} Cambiar imagen</button>
                          <button type="button" class="cc-clean-dropzone-btn" style="color:var(--cc-bad);border-color:rgba(255,101,118,0.3);" id="btn-delete-media">${icon('trash', 14)} Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ` : `
                    <div class="cc-clean-dropzone" id="dropzone-trigger-box">
                      <div class="cc-clean-dropzone-icon">${icon('upload', 20)}</div>
                      <strong class="cc-clean-dropzone-title">Subir creatividad del banner</strong>
                      <p class="cc-clean-dropzone-meta">Formatos aceptados: PNG, JPG o WebP · Proporción recomendada 1200×600 px</p>
                      <button type="button" class="cc-clean-dropzone-btn" id="btn-trigger-media">
                        ${icon('plus', 14)} Seleccionar imagen
                      </button>
                    </div>
                  `}
                  <input type="file" id="hidden-media-input" accept="image/png,image/jpeg,image/webp" style="display:none;">
                </div>
              </section>

              <!-- SECCIÓN 3: UBICACIÓN & PRIORIDAD -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">3</span> Ubicación & Prioridad
                  </h3>
                  <p class="cc-form-section-desc">Define el espacio en la interfaz del pasajero y el orden de rotación.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field">
                    Ubicación en inicio de Pasajeros
                    <select name="placement" id="form-field-placement">
                      <option value="home_top" ${editingCampaign.placement === 'home_top' ? 'selected' : ''}>Inicio superior (carrusel principal)</option>
                      <option value="home_feed" ${editingCampaign.placement === 'home_feed' ? 'selected' : ''}>Contenido central (tarjeta destacada)</option>
                    </select>
                  </label>

                  <label class="cc-field">
                    Prioridad / Orden de rotación
                    <input type="number" min="1" max="99" name="order" value="${Number(editingCampaign.order || 1)}">
                  </label>
                </div>
              </section>

              <!-- SECCIÓN 4: PROGRAMACIÓN & VIGENCIA -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">4</span> Programación & Vigencia
                  </h3>
                  <p class="cc-form-section-desc">Control de calendario y estado operativo de la campaña.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field">
                    Fecha y hora de inicio
                    <input type="datetime-local" name="start" value="${editingCampaign.start ? editingCampaign.start.slice(0, 16) : ''}">
                  </label>

                  <label class="cc-field">
                    Fecha y hora de finalización
                    <input type="datetime-local" name="end" value="${editingCampaign.end ? editingCampaign.end.slice(0, 16) : ''}">
                  </label>

                  <label class="cc-field" style="grid-column:1/-1;">
                    Estado de la campaña
                    <select name="status">
                      <option value="active" ${editingCampaign.status === 'active' ? 'selected' : ''}>Activa (en circulación)</option>
                      <option value="scheduled" ${editingCampaign.status === 'scheduled' ? 'selected' : ''}>Programada</option>
                      <option value="paused" ${editingCampaign.status === 'paused' ? 'selected' : ''}>Pausada</option>
                      <option value="ended" ${editingCampaign.status === 'ended' ? 'selected' : ''}>Finalizada</option>
                    </select>
                  </label>
                </div>
              </section>

              <!-- SECCIÓN 5: ACCIÓN & DESTINO -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">5</span> Acción & Enlace de destino
                  </h3>
                  <p class="cc-form-section-desc">Interacción que se ejecutará cuando el usuario presione el anuncio.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field">
                    Texto del botón de acción (CTA)
                    <input name="cta" id="form-field-cta" value="${esc(editingCampaign.cta || 'Ver promoción')}" placeholder="Ej.: Ver promoción" required>
                  </label>

                  <label class="cc-field">
                    Destino / Enlace / Deep Link
                    <input type="text" name="url" value="${esc(editingCampaign.url)}" placeholder="https://... o express://promo">
                  </label>
                </div>
              </section>

              <!-- BARRA DE ACCIONES FLOTANTE STICKY -->
              <footer class="cc-sticky-action-bar">
                <div class="cc-action-bar-left">
                  <span>Guardado local en sesión · Integración remota pendiente</span>
                </div>
                <div class="cc-action-bar-right">
                  <button type="button" class="cc-btn-ghost" id="btn-cancel-workspace">Cancelar</button>
                  <button type="button" class="cc-btn-secondary" id="btn-save-draft-local">${icon('check', 14)} Guardar borrador local</button>
                  <button type="button" class="cc-btn-primary" id="btn-publish-campaign">${icon('arrowRight', 14)} ${isNew ? 'Publicar campaña' : 'Guardar cambios'}</button>
                </div>
              </footer>

            </form>
          </main>

          <!-- COLUMNA DERECHA: VISTA PREVIA REALISTA DEL INICIO DEL PASAJERO -->
          <aside class="cc-workspace-preview-col">
            <!-- SELECTOR DE VISTA PREVIA (INNOVACIÓN UX) -->
            <div class="cc-preview-switcher" role="tablist" aria-label="Modo de vista previa">
              <button type="button" class="cc-preview-switch-btn ${previewPlacement === 'top' ? 'active' : ''}" data-placement-mode="top">
                Vista superior (Home)
              </button>
              <button type="button" class="cc-preview-switch-btn ${previewPlacement === 'feed' ? 'active' : ''}" data-placement-mode="feed">
                Vista central (Feed)
              </button>
            </div>

            <!-- SMARTPHONE SHELL MOCKUP -->
            <div class="cc-phone-preview-shell" aria-label="Vista previa en smartphone de pasajero">
              <div class="cc-phone-dynamic-island"></div>

              <div class="cc-phone-statusbar">
                <span>9:41</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              <!-- PANTALLA DESPLAZABLE DEL PASAJERO -->
              <div class="cc-phone-screen">
                <!-- CABECERA DE LA APP DE PASAJERO -->
                <div class="cc-pass-header">
                  <div class="cc-pass-greeting">
                    <small>Bienvenido</small>
                    <strong>+58Express</strong>
                  </div>
                  <div class="cc-pass-avatar">J</div>
                </div>

                <!-- BUSCADOR "¿A DÓNDE VAMOS HOY?" -->
                <div class="cc-pass-search">
                  ${icon('search', 14)}
                  <span>¿A dónde vamos hoy?</span>
                </div>

                <!-- CATEGORÍAS RÁPIDAS DE TRANSPORTE -->
                <div class="cc-pass-services">
                  <div class="cc-pass-service-chip">
                    <div class="cc-pass-service-icon">${icon('navigation', 14)}</div>
                    <span class="cc-pass-service-label">Moto</span>
                  </div>
                  <div class="cc-pass-service-chip">
                    <div class="cc-pass-service-icon">${icon('mapPin', 14)}</div>
                    <span class="cc-pass-service-label">Carro</span>
                  </div>
                  <div class="cc-pass-service-chip">
                    <div class="cc-pass-service-icon">${icon('grid', 14)}</div>
                    <span class="cc-pass-service-label">Envíos</span>
                  </div>
                </div>

                <!-- BANNER PROMOCIONAL REACTIVO EN TIEMPO REAL -->
                <div class="cc-phone-banner-card ${previewPlacement === 'feed' ? 'feed-mode' : ''}" id="phone-banner-card">
                  <div class="cc-phone-banner-img" id="phone-banner-img-container">
                    ${tempImageUrl ? `
                      <img src="${tempImageUrl}" id="live-phone-img" alt="Vista previa del banner">
                    ` : `
                      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;color:#6b7280;">
                        ${icon('fileText', 24)}
                        <span style="font-size:9px;">Sin imagen cargada</span>
                      </div>
                    `}
                  </div>
                  <div class="cc-phone-banner-body">
                    <span class="cc-phone-banner-tag">Promoción destacada</span>
                    <h4 class="cc-phone-banner-title" id="live-phone-title">${esc(editingCampaign.title || 'Título de la campaña')}</h4>
                    <p class="cc-phone-banner-desc" id="live-phone-desc">${esc(editingCampaign.subtitle || 'El texto descriptivo del anuncio aparecerá aquí en tiempo real.')}</p>
                    <span class="cc-phone-banner-cta" id="live-phone-cta">${esc(editingCampaign.cta || 'Ver promoción')} →</span>
                  </div>
                </div>

                <!-- CONTEXTO ADICIONAL DE LA APP PASAJERO -->
                <div style="margin-top:6px;padding-top:10px;border-top:1px solid #1f2125;display:flex;flex-direction:column;gap:8px;">
                  <span style="font-size:9px;font-weight:600;color:#8c929c;text-transform:uppercase;letter-spacing:0.5px;">Aliados cercanos</span>
                  <div class="cc-phone-partner-card">
                    <div class="cc-phone-partner-logo">${icon('star', 14)}</div>
                    <div class="cc-phone-partner-info">
                      <p class="cc-phone-partner-name">Farmatodo Express</p>
                      <p class="cc-phone-partner-benefit">10% de descuento en viajes</p>
                    </div>
                  </div>
                </div>

                <!-- BARRA DE NAVEGACIÓN INFERIOR DE LA APP -->
                <nav class="cc-pass-bottom-bar" aria-label="Navegación de pasajero">
                  <div class="cc-pass-nav-tab active">
                    ${icon('home', 14)}
                    <span>Inicio</span>
                  </div>
                  <div class="cc-pass-nav-tab">
                    ${icon('clock', 14)}
                    <span>Actividad</span>
                  </div>
                  <div class="cc-pass-nav-tab">
                    ${icon('wallet', 14)}
                    <span>Billetera</span>
                  </div>
                  <div class="cc-pass-nav-tab">
                    ${icon('users', 14)}
                    <span>Perfil</span>
                  </div>
                </nav>

              </div>
            </div>
          </aside>
        </div>
      </div>
    `;

    // Event handlers inside Workspace Editor
    const form = container.querySelector('#campaign-workspace-form');
    const liveTitle = container.querySelector('#live-phone-title');
    const liveDesc = container.querySelector('#live-phone-desc');
    const liveCta = container.querySelector('#live-phone-cta');
    const mediaInput = container.querySelector('#hidden-media-input');
    const autosavePill = container.querySelector('#autosave-status-pill');

    const markDirty = () => {
      hasUnsavedChanges = true;
      if (autosavePill) {
        autosavePill.innerHTML = `<i></i> Cambios sin guardar en sesión`;
        autosavePill.style.color = 'var(--cc-accent)';
      }
    };

    // Live reactive typing updates
    form?.addEventListener('input', () => {
      markDirty();
      const fd = new FormData(form);
      const titleVal = String(fd.get('title') || '').trim();
      const subtitleVal = String(fd.get('subtitle') || '').trim();
      const ctaVal = String(fd.get('cta') || '').trim();

      if (liveTitle) liveTitle.textContent = titleVal || 'Título de la campaña';
      if (liveDesc) liveDesc.textContent = subtitleVal || 'El texto descriptivo del anuncio aparecerá aquí en tiempo real.';
      if (liveCta) liveCta.textContent = (ctaVal || 'Ver promoción') + ' →';
    });

    // Placement switcher
    container.querySelectorAll('[data-placement-mode]').forEach(btn => {
      btn.onclick = () => {
        previewPlacement = btn.dataset.placementMode;
        container.querySelectorAll('[data-placement-mode]').forEach(b => b.classList.toggle('active', b === btn));
        const bannerCard = container.querySelector('#phone-banner-card');
        if (bannerCard) {
          bannerCard.classList.toggle('feed-mode', previewPlacement === 'feed');
        }
        const selectEl = form.querySelector('#form-field-placement');
        if (selectEl) {
          selectEl.value = previewPlacement === 'feed' ? 'home_feed' : 'home_top';
        }
      };
    });

    form.querySelector('#form-field-placement')?.addEventListener('change', e => {
      previewPlacement = e.target.value === 'home_feed' ? 'feed' : 'top';
      container.querySelectorAll('[data-placement-mode]').forEach(b => b.classList.toggle('active', b.dataset.placementMode === previewPlacement));
      const bannerCard = container.querySelector('#phone-banner-card');
      if (bannerCard) {
        bannerCard.classList.toggle('feed-mode', previewPlacement === 'feed');
      }
    });

    // Dropzone / Media management
    const attachMediaTriggers = () => {
      container.querySelector('#btn-trigger-media')?.addEventListener('click', () => {
        mediaInput?.click();
      });

      container.querySelector('#dropzone-trigger-box')?.addEventListener('click', e => {
        if (e.target.id !== 'btn-trigger-media') {
          mediaInput?.click();
        }
      });

      container.querySelector('#btn-delete-media')?.addEventListener('click', () => {
        cleanupImage();
        tempImageUrl = null;
        editingCampaign.imageBlob = null;
        markDirty();
        renderWorkspaceEditor();
      });
    };

    attachMediaTriggers();

    mediaInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        event.target.setCustomValidity('Formato no soportado. Selecciona PNG, JPEG o WebP.');
        event.target.reportValidity();
        return;
      }
      event.target.setCustomValidity('');
      cleanupImage();
      activePreviewUrl = createOwnedObjectUrl(file);
      tempImageUrl = activePreviewUrl;
      editingCampaign.imageBlob = tempImageUrl;
      markDirty();
      renderWorkspaceEditor();
    });

    // Save and navigation actions
    const commitCampaign = () => {
      if (!form.reportValidity()) return false;
      const fd = new FormData(form);
      const updated = {
        ...editingCampaign,
        name: String(fd.get('name') || fd.get('title') || '').trim(),
        title: String(fd.get('title') || '').trim(),
        subtitle: String(fd.get('subtitle') || '').trim(),
        cta: String(fd.get('cta') || 'Ver promoción').trim(),
        url: String(fd.get('url') || '').trim(),
        placement: String(fd.get('placement') || 'home_top'),
        order: Number(fd.get('order') || 1),
        start: String(fd.get('start') || ''),
        end: String(fd.get('end') || ''),
        status: String(fd.get('status') || 'active'),
        imageBlob: tempImageUrl
      };

      if (isNew) {
        campaigns.unshift(updated);
      } else {
        const idx = campaigns.findIndex(c => c.id === editingCampaign.id);
        if (idx !== -1) campaigns[idx] = updated;
      }
      return true;
    };

    container.querySelector('#btn-back-to-ads')?.addEventListener('click', closeEditor);
    container.querySelector('#btn-cancel-workspace')?.addEventListener('click', closeEditor);

    container.querySelector('#btn-save-draft-local')?.addEventListener('click', () => {
      if (commitCampaign()) {
        hasUnsavedChanges = false;
        if (autosavePill) {
          autosavePill.innerHTML = `<i></i> Borrador guardado localmente`;
          autosavePill.style.color = 'var(--cc-muted)';
        }
      }
    });

    container.querySelector('#btn-publish-campaign')?.addEventListener('click', () => {
      if (commitCampaign()) {
        closeEditor();
      }
    });
  };

  const renderListView = () => {
    const visible = campaigns.filter(c => {
      const matchFilter = filter === 'all' || c.status === filter;
      const matchQuery = `${c.name || ''} ${c.title} ${c.subtitle} ${c.cta}`.toLowerCase().includes(query.toLowerCase());
      return matchFilter && matchQuery;
    });

    const counts = {
      all: campaigns.length,
      active: campaigns.filter(c => c.status === 'active').length,
      scheduled: campaigns.filter(c => c.status === 'scheduled').length,
      paused: campaigns.filter(c => c.status === 'paused').length,
      ended: campaigns.filter(c => c.status === 'ended').length
    };

    container.innerHTML = `
      <div class="cc-workspace-page">
        ${pageHeader(
          'Comercial',
          'Publicidad y Campañas',
          'Gestión visual y segmentación de campañas publicitarias en el Home de pasajeros.',
          `<button class="cc-button primary" id="btn-new-campaign">${icon('plus', 16)} + Nueva campaña</button>`
        )}

        <section class="cc-metric-strip">
          ${metric('Borradores locales', campaigns.length, 'Guardados en sesión')}
          ${metric('Publicadas', '—', 'No disponible')}
          ${metric('Interacciones', '—', 'No disponible')}
          ${metric('Integración', 'Pendiente', 'Sincronización remota')}
        </section>

        <section class="cc-panel">
          <header class="cc-catalog-head">
            <div>
              <h2>Catálogo de campañas (${visible.length})</h2>
              <p>Control de banners y promociones en la app de pasajeros de +58Express</p>
            </div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div class="cc-filter-bar" style="margin-bottom:0;">
                <label>
                  ${icon('search', 16)}
                  <input id="ads-search" value="${esc(query)}" placeholder="Buscar por título o texto" aria-label="Buscar campañas">
                </label>
              </div>
              <div class="driver-admin-filters" style="display:inline-flex;">
                ${ADS_TABS.map(([tabKey, tabLabel]) => `
                  <button data-ads-filter="${tabKey}" class="${filter === tabKey ? 'active' : ''}">
                    ${tabLabel} <em>${counts[tabKey]}</em>
                  </button>
                `).join('')}
              </div>
            </div>
          </header>

          <div class="cc-table-scroll">
            <table class="cc-table">
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Ubicación</th>
                  <th>Vigencia</th>
                  <th>Métricas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${visible.map(c => `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:flex-start;gap:12px;">
                        <div style="width:48px;height:48px;border-radius:8px;background:var(--cc-raised);border:1px solid var(--cc-line);display:grid;place-items:center;color:var(--cc-accent);flex-shrink:0;overflow:hidden;">
                          ${c.imageBlob ? `<img src="${c.imageBlob}" style="width:100%;height:100%;object-fit:cover;" alt="Banner">` : icon('fileText', 24)}
                        </div>
                        <div>
                          <strong style="font-size:12px;">${esc(c.title)}</strong>
                          <small style="color:var(--cc-muted);">${esc(c.subtitle)}</small>
                          <small style="color:var(--cc-accent);margin-top:2px;display:block;">CTA: ${esc(c.cta)} →</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="cc-badge">${c.placement === 'home_top' ? 'Home superior' : 'Feed central'}</span>
                      <small style="display:block;color:var(--cc-subtle);margin-top:4px;">Prioridad #${c.order || 1}</small>
                    </td>
                    <td>
                      <div style="font-size:11px;">
                        <span>${c.start ? new Date(c.start).toLocaleDateString('es-VE') : '—'}</span>
                        <small style="color:var(--cc-subtle);"> hasta ${c.end ? new Date(c.end).toLocaleDateString('es-VE') : 'Indefinido'}</small>
                      </div>
                    </td>
                    <td>
                      <div style="font-size:11px;">
                        <strong>No disponible</strong>
                        <small style="color:var(--cc-subtle);">Borrador sin métricas</small>
                      </div>
                    </td>
                    <td>
                      <span class="cc-badge ${c.status === 'active' ? 'success' : c.status === 'paused' ? 'danger' : ''}">
                        ${c.status === 'active' ? 'Activa' : c.status === 'scheduled' ? 'Programada' : c.status === 'paused' ? 'Pausada' : 'Finalizada'}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;">
                        <button class="cc-button" data-edit-campaign="${c.id}" title="Editar campaña">${icon('edit', 14)} Editar</button>
                        <button class="cc-button" data-toggle-status="${c.id}" title="${c.status === 'active' ? 'Pausar' : 'Activar'}">
                          ${icon(c.status === 'active' ? 'eyeOff' : 'eye', 14)}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td colspan="6">
                      <div class="cc-empty">
                        ${icon('fileText', 32)}
                        <h3>No hay campañas con este filtro</h3>
                        <p>Crea una nueva campaña para mostrar contenido publicitario relevante a los pasajeros de +58Express.</p>
                        <button class="cc-button primary" id="btn-empty-new-campaign" style="margin-top:14px;">${icon('plus', 14)} Nueva campaña</button>
                      </div>
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    container.querySelector('#btn-new-campaign')?.addEventListener('click', () => openEditor(null));
    container.querySelector('#btn-empty-new-campaign')?.addEventListener('click', () => openEditor(null));

    container.querySelectorAll('[data-ads-filter]').forEach(btn => {
      btn.onclick = () => {
        filter = btn.dataset.adsFilter;
        render();
      };
    });

    const searchInput = container.querySelector('#ads-search');
    if (searchInput) {
      searchInput.oninput = e => {
        query = e.target.value;
        render();
      };
    }

    container.querySelectorAll('[data-edit-campaign]').forEach(btn => {
      btn.onclick = () => {
        const found = campaigns.find(c => c.id === btn.dataset.editCampaign);
        if (found) openEditor(found);
      };
    });

    container.querySelectorAll('[data-toggle-status]').forEach(btn => {
      btn.onclick = () => {
        const found = campaigns.find(c => c.id === btn.dataset.toggleStatus);
        if (found) {
          found.status = found.status === 'active' ? 'paused' : 'active';
          render();
        }
      };
    });
  };

  render();

  const observer = new MutationObserver(() => {
    if (container.querySelector('.cc-workspace-page') || container.querySelector('.cc-campaign-workspace')) return;
    cleanupImage();
    observer.disconnect();
  });
  observer.observe(container, { childList: true });
}
