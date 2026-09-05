import { icon } from '../../utils/icons.js';
import { createOwnedObjectUrl, revokeOwnedObjectUrl } from '../../utils/privatePhoto.js';
import { esc, pageHeader, empty, metric } from './ui.js';

// No catalog endpoint exists yet. Only user-authored session drafts are shown.
const INITIAL_PARTNERS = [];

const CATEGORIES = ['Todos', 'Restaurantes', 'Farmacias', 'Supermercados', 'Repuestos', 'Servicios'];

export function renderPartnersManagement(container) {
  let partners = [...INITIAL_PARTNERS];
  let categoryFilter = 'Todos';
  let query = '';
  let viewMode = 'list'; // 'list' | 'editor'
  let editingPartner = null;
  let activeLogoUrl = null;
  let hasUnsavedChanges = false;

  const cleanupLogo = () => {
    if (activeLogoUrl) {
      revokeOwnedObjectUrl(activeLogoUrl);
      activeLogoUrl = null;
    }
  };

  const openEditor = (partnerToEdit = null) => {
    cleanupLogo();
    hasUnsavedChanges = false;
    const isNew = !partnerToEdit;
    editingPartner = partnerToEdit ? { ...partnerToEdit } : {
      id: `partner-${Date.now()}`,
      name: '',
      legalName: '',
      category: 'Restaurantes',
      promo: '',
      location: 'Maracaibo, Zulia',
      url: '',
      status: 'active',
      order: partners.length + 1,
      logoBlob: null
    };
    viewMode = 'editor';
    render();
  };

  const closeEditor = () => {
    cleanupLogo();
    editingPartner = null;
    viewMode = 'list';
    hasUnsavedChanges = false;
    render();
  };

  const render = () => {
    if (viewMode === 'editor' && editingPartner) {
      renderWorkspaceEditor();
    } else {
      renderListView();
    }
  };

  const renderWorkspaceEditor = () => {
    const isNew = !partners.some(p => p.id === editingPartner.id);
    const partnerName = editingPartner.name || 'Nuevo aliado';
    let tempLogoUrl = editingPartner.logoBlob || null;

    container.innerHTML = `
      <div class="cc-campaign-workspace">
        <!-- TOPBAR CON BREADCRUMB E INDICADOR DE ESTADO -->
        <header class="cc-workspace-topbar">
          <nav class="cc-breadcrumb-trail" aria-label="Ruta de navegación">
            <button type="button" class="cc-breadcrumb-btn" id="btn-back-to-partners">
              ${icon('arrowLeft', 14)} Aliados comerciales
            </button>
            <span class="cc-breadcrumb-sep">/</span>
            <span class="cc-breadcrumb-current">${isNew ? 'Nuevo aliado comercial' : `Editar: ${esc(partnerName)}`}</span>
          </nav>

          <div class="cc-workspace-status-indicator">
            <span class="cc-autosave-pill" id="partner-autosave-pill">
              <i></i> ${hasUnsavedChanges ? 'Cambios sin guardar en sesión' : 'Borrador guardado localmente'}
            </span>
          </div>
        </header>

        <!-- LAYOUT SPLIT: EDITOR (62%) | LIVE PREVIEW PASSENGER (38%) -->
        <div class="cc-workspace-split">
          <!-- COLUMNA IZQUIERDA: EDITOR ESTRUCTURADO POR SECCIONES -->
          <main class="cc-workspace-editor-col">
            <form id="partner-workspace-form" onsubmit="return false;" style="display:flex;flex-direction:column;">

              <!-- SECCIÓN 1: INFORMACIÓN COMERCIAL -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">1</span> Información comercial
                  </h3>
                  <p class="cc-form-section-desc">Identidad de la empresa y clasificación dentro del catálogo de +58Express.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field">
                    Nombre comercial / Marca
                    <input name="name" id="field-partner-name" value="${esc(editingPartner.name)}" placeholder="Ej.: Farmatodo Express" required>
                  </label>

                  <label class="cc-field">
                    Razón social o RIF (opcional)
                    <input name="legalName" value="${esc(editingPartner.legalName || '')}" placeholder="Ej.: Farmatodo C.A. · J-00000000-0">
                  </label>

                  <label class="cc-field" style="grid-column:1/-1;">
                    Categoría comercial
                    <select name="category" id="field-partner-category">
                      ${CATEGORIES.filter(c => c !== 'Todos').map(cat => `
                        <option value="${cat}" ${editingPartner.category === cat ? 'selected' : ''}>${cat}</option>
                      `).join('')}
                    </select>
                  </label>
                </div>
              </section>

              <!-- SECCIÓN 2: IDENTIDAD VISUAL -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">2</span> Logotipo oficial
                  </h3>
                  <p class="cc-form-section-desc">Isotipo o imagotipo de la marca para su tarjeta y presencia en la app.</p>
                </div>

                <div id="partner-media-container">
                  ${tempLogoUrl ? `
                    <div class="cc-dropzone-preview-card">
                      <div class="cc-dropzone-image-wrap" style="height:140px;padding:16px;">
                        <img src="${tempLogoUrl}" id="partner-logo-preview" style="object-fit:contain;" alt="Logotipo">
                      </div>
                      <div class="cc-dropzone-actions">
                        <div class="cc-dropzone-actions-left">
                          ${icon('check', 14)} Logotipo cargado en memoria protegida
                        </div>
                        <div class="cc-dropzone-actions-right">
                          <button type="button" class="cc-clean-dropzone-btn" id="btn-trigger-partner-logo">${icon('upload', 14)} Cambiar logo</button>
                          <button type="button" class="cc-clean-dropzone-btn" style="color:var(--cc-bad);border-color:rgba(255,101,118,0.3);" id="btn-delete-partner-logo">${icon('trash', 14)} Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ` : `
                    <div class="cc-clean-dropzone" id="partner-dropzone-trigger">
                      <div class="cc-clean-dropzone-icon">${icon('upload', 20)}</div>
                      <strong class="cc-clean-dropzone-title">Subir logotipo de la marca</strong>
                      <p class="cc-clean-dropzone-meta">Formatos: PNG, JPG o WebP con fondo transparente o contrastado</p>
                      <button type="button" class="cc-clean-dropzone-btn" id="btn-trigger-partner-logo">
                        ${icon('plus', 14)} Seleccionar imagen
                      </button>
                    </div>
                  `}
                  <input type="file" id="hidden-partner-logo-input" accept="image/png,image/jpeg,image/webp" style="display:none;">
                </div>
              </section>

              <!-- SECCIÓN 3: PROMOCIÓN & BENEFICIO -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">3</span> Beneficio & Promoción
                  </h3>
                  <p class="cc-form-section-desc">Descuento o cortesía que recibirán los pasajeros o conductores de la comunidad.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr;gap:18px;">
                  <label class="cc-field">
                    Descripción del beneficio o promoción
                    <textarea name="promo" id="field-partner-promo" rows="3" placeholder="Ej.: 15% de descuento en medicamentos presentando la app +58Express..." required>${esc(editingPartner.promo)}</textarea>
                  </label>
                </div>
              </section>

              <!-- SECCIÓN 4: VISIBILIDAD & PRIORIDAD -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">4</span> Visibilidad & Ubicación
                  </h3>
                  <p class="cc-form-section-desc">Sucursal física de atención y orden de recomendación en el feed.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field">
                    Ubicación / Sucursal principal
                    <input name="location" id="field-partner-loc" value="${esc(editingPartner.location)}" placeholder="Ej.: Bella Vista / 5 de Julio, Maracaibo" required>
                  </label>

                  <label class="cc-field">
                    Prioridad en catálogo (1 a 99)
                    <input type="number" min="1" max="99" name="order" value="${Number(editingPartner.order || 1)}">
                  </label>
                </div>
              </section>

              <!-- SECCIÓN 5: ENLACE & ESTADO -->
              <section class="cc-form-section">
                <div class="cc-form-section-head">
                  <h3 class="cc-form-section-title">
                    <span class="step-num">5</span> Enlace & Estado operativo
                  </h3>
                  <p class="cc-form-section-desc">Canal de contacto web o redes sociales y disponibilidad pública.</p>
                </div>

                <div class="cc-field-grid" style="grid-template-columns:1fr 1fr;gap:18px;">
                  <label class="cc-field">
                    Sitio web o red social
                    <input type="url" name="url" value="${esc(editingPartner.url)}" placeholder="https://instagram.com/marca">
                  </label>

                  <label class="cc-field">
                    Estado en la aplicación
                    <select name="status">
                      <option value="active" ${editingPartner.status === 'active' ? 'selected' : ''}>Activo (visible en la app)</option>
                      <option value="inactive" ${editingPartner.status === 'inactive' ? 'selected' : ''}>Inactivo (pausado temporalmente)</option>
                    </select>
                  </label>
                </div>
              </section>

              <!-- BARRA DE ACCIONES STICKY -->
              <footer class="cc-sticky-action-bar">
                <div class="cc-action-bar-left">
                  <span>Guardado local en sesión · Integración remota pendiente</span>
                </div>
                <div class="cc-action-bar-right">
                  <button type="button" class="cc-btn-ghost" id="btn-cancel-partner">Cancelar</button>
                  <button type="button" class="cc-btn-secondary" id="btn-save-partner-draft">${icon('check', 14)} Guardar borrador local</button>
                  <button type="button" class="cc-btn-primary" id="btn-submit-partner">${icon('arrowRight', 14)} ${isNew ? 'Registrar aliado' : 'Guardar cambios'}</button>
                </div>
              </footer>

            </form>
          </main>

          <!-- COLUMNA DERECHA: LIVE PREVIEW REALISTA PASSENGER HOME -->
          <aside class="cc-workspace-preview-col">
            <div class="cc-preview-switcher" role="tablist">
              <span style="font-size:11px;font-weight:600;color:var(--cc-text);padding:4px 8px;">
                Vista previa · Pasajero
              </span>
            </div>

            <div class="cc-phone-preview-shell" aria-label="Vista previa de aliado en smartphone">
              <div class="cc-phone-dynamic-island"></div>

              <div class="cc-phone-statusbar">
                <span>9:41</span>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              <div class="cc-phone-screen">
                <div class="cc-pass-header">
                  <div class="cc-pass-greeting">
                    <small>Aliados y Comercios</small>
                    <strong>+58Express</strong>
                  </div>
                  <div class="cc-pass-avatar">J</div>
                </div>

                <div class="cc-pass-search">
                  ${icon('search', 14)}
                  <span>Explorar marcas con beneficios...</span>
                </div>

                <!-- TARJETA DESTACADA DEL ALIADO EN PASSENGER -->
                <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px;">
                  <span style="font-size:9px;font-weight:600;color:var(--cc-accent);text-transform:uppercase;letter-spacing:0.5px;">Tarjeta en la app</span>
                  
                  <div class="cc-phone-partner-card" style="border:1px solid color-mix(in srgb, var(--cc-accent) 30%, #26292e);padding:14px;">
                    <div class="cc-phone-partner-logo" style="width:48px;height:48px;background:#1a1c1f;" id="live-partner-logo-box">
                      ${tempLogoUrl ? `
                        <img src="${tempLogoUrl}" alt="Logo">
                      ` : `
                        <span style="color:var(--cc-accent);font-size:16px;font-weight:700;">${(editingPartner.name?.[0] || 'A').toUpperCase()}</span>
                      `}
                    </div>
                    <div class="cc-phone-partner-info">
                      <p class="cc-phone-partner-name" id="live-partner-name" style="font-size:13px;font-weight:650;">${esc(editingPartner.name || 'Nombre del comercio')}</p>
                      <span style="font-size:9px;color:#8c929c;" id="live-partner-category">${esc(editingPartner.category || 'Restaurantes')}</span>
                      <p class="cc-phone-partner-benefit" id="live-partner-promo" style="font-size:10px;font-weight:600;margin-top:4px;">${esc(editingPartner.promo || 'Detalle del descuento para usuarios.')}</p>
                      <p class="cc-phone-partner-loc" id="live-partner-loc" style="font-size:9px;margin-top:2px;">${icon('mapPin', 14)} ${esc(editingPartner.location || 'Maracaibo, Zulia')}</p>
                    </div>
                  </div>
                </div>

                <!-- CONTEXTO ADICIONAL DE ALIADOS -->
                <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px;">
                  <span style="font-size:9px;font-weight:600;color:#7f858f;text-transform:uppercase;letter-spacing:0.5px;">Otros aliados sugeridos</span>
                  <div class="cc-phone-partner-card" style="opacity:0.6;">
                    <div class="cc-phone-partner-logo">${icon('star', 14)}</div>
                    <div class="cc-phone-partner-info">
                      <p class="cc-phone-partner-name">Burger King Express</p>
                      <p class="cc-phone-partner-benefit">Bebida gratis en compras</p>
                    </div>
                  </div>
                </div>

                <nav class="cc-pass-bottom-bar" style="margin-top:auto;">
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

    // Event handlers in Partner Workspace
    const form = container.querySelector('#partner-workspace-form');
    const liveName = container.querySelector('#live-partner-name');
    const liveCat = container.querySelector('#live-partner-category');
    const livePromo = container.querySelector('#live-partner-promo');
    const liveLoc = container.querySelector('#live-partner-loc');
    const logoInput = container.querySelector('#hidden-partner-logo-input');
    const autosavePill = container.querySelector('#partner-autosave-pill');

    const markDirty = () => {
      hasUnsavedChanges = true;
      if (autosavePill) {
        autosavePill.innerHTML = `<i></i> Cambios sin guardar en sesión`;
        autosavePill.style.color = 'var(--cc-accent)';
      }
    };

    form?.addEventListener('input', () => {
      markDirty();
      const fd = new FormData(form);
      const nameVal = String(fd.get('name') || '').trim();
      const catVal = String(fd.get('category') || '').trim();
      const promoVal = String(fd.get('promo') || '').trim();
      const locVal = String(fd.get('location') || '').trim();

      if (liveName) liveName.textContent = nameVal || 'Nombre del comercio';
      if (liveCat) liveCat.textContent = catVal || 'Comercio aliado';
      if (livePromo) livePromo.textContent = promoVal || 'Detalle del descuento para usuarios.';
      if (liveLoc) liveLoc.textContent = locVal || 'Maracaibo, Zulia';
    });

    // Logo dropzone triggers
    const attachLogoTriggers = () => {
      container.querySelector('#btn-trigger-partner-logo')?.addEventListener('click', () => {
        logoInput?.click();
      });

      container.querySelector('#partner-dropzone-trigger')?.addEventListener('click', e => {
        if (e.target.id !== 'btn-trigger-partner-logo') {
          logoInput?.click();
        }
      });

      container.querySelector('#btn-delete-partner-logo')?.addEventListener('click', () => {
        cleanupLogo();
        tempLogoUrl = null;
        editingPartner.logoBlob = null;
        markDirty();
        renderWorkspaceEditor();
      });
    };

    attachLogoTriggers();

    logoInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        event.target.setCustomValidity('Formato no soportado. Selecciona PNG, JPEG o WebP.');
        event.target.reportValidity();
        return;
      }
      event.target.setCustomValidity('');
      cleanupLogo();
      activeLogoUrl = createOwnedObjectUrl(file);
      tempLogoUrl = activeLogoUrl;
      editingPartner.logoBlob = tempLogoUrl;
      markDirty();
      renderWorkspaceEditor();
    });

    const commitPartner = () => {
      if (!form.reportValidity()) return false;
      const fd = new FormData(form);
      const updated = {
        ...editingPartner,
        name: String(fd.get('name') || '').trim(),
        legalName: String(fd.get('legalName') || '').trim(),
        category: String(fd.get('category') || 'Restaurantes'),
        promo: String(fd.get('promo') || '').trim(),
        location: String(fd.get('location') || '').trim(),
        url: String(fd.get('url') || '').trim(),
        status: String(fd.get('status') || 'active'),
        order: Number(fd.get('order') || 1),
        logoBlob: tempLogoUrl
      };

      if (isNew) {
        partners.unshift(updated);
      } else {
        const idx = partners.findIndex(p => p.id === editingPartner.id);
        if (idx !== -1) partners[idx] = updated;
      }
      return true;
    };

    container.querySelector('#btn-back-to-partners')?.addEventListener('click', closeEditor);
    container.querySelector('#btn-cancel-partner')?.addEventListener('click', closeEditor);

    container.querySelector('#btn-save-partner-draft')?.addEventListener('click', () => {
      if (commitPartner()) {
        hasUnsavedChanges = false;
        if (autosavePill) {
          autosavePill.innerHTML = `<i></i> Borrador guardado localmente`;
          autosavePill.style.color = 'var(--cc-muted)';
        }
      }
    });

    container.querySelector('#btn-submit-partner')?.addEventListener('click', () => {
      if (commitPartner()) {
        closeEditor();
      }
    });
  };

  const renderListView = () => {
    const visible = partners.filter(p => {
      const matchCat = categoryFilter === 'Todos' || p.category === categoryFilter;
      const matchQuery = `${p.name} ${p.category} ${p.promo} ${p.location}`.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });

    container.innerHTML = `
      <div class="cc-workspace-page">
        ${pageHeader(
          'Comercial',
          'Aliados Comerciales',
          'Convenios con marcas, establecimientos y promociones asociadas para la comunidad.',
          `<button class="cc-button primary" id="btn-new-partner">${icon('plus', 16)} + Nuevo aliado</button>`
        )}

        <section class="cc-metric-strip">
          ${metric('Aliados registrados', partners.length, 'Guardados en sesión')}
          ${metric('Activos en app', partners.filter(p => p.status === 'active').length, 'Visibles para usuarios')}
          ${metric('Categorías', CATEGORIES.length - 1, 'Segmentos disponibles')}
          ${metric('Integración', 'Pendiente', 'Sincronización remota')}
        </section>

        <section class="cc-panel">
          <header class="cc-catalog-head">
            <div>
              <h2>Directorio de aliados comerciales (${visible.length})</h2>
              <p>Marcas y comercios asociados con beneficios en +58Express</p>
            </div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div class="cc-filter-bar" style="margin-bottom:0;">
                <label>
                  ${icon('search', 16)}
                  <input id="partner-search" value="${esc(query)}" placeholder="Buscar por nombre, categoría o ubicación" aria-label="Buscar aliados">
                </label>
              </div>
              <div class="driver-admin-filters" style="display:inline-flex;">
                ${CATEGORIES.map(cat => `
                  <button data-cat-filter="${cat}" class="${categoryFilter === cat ? 'active' : ''}">
                    ${cat}
                  </button>
                `).join('')}
              </div>
            </div>
          </header>

          <div class="cc-table-scroll">
            <table class="cc-table">
              <thead>
                <tr>
                  <th>Logo & Marca</th>
                  <th>Categoría</th>
                  <th>Beneficio / Descuento</th>
                  <th>Ubicación</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${visible.map(p => `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:8px;background:var(--cc-raised);border:1px solid var(--cc-line);display:grid;place-items:center;color:var(--cc-accent);flex-shrink:0;overflow:hidden;">
                          ${p.logoBlob ? `<img src="${p.logoBlob}" style="width:100%;height:100%;object-fit:contain;" alt="Logo">` : icon('star', 20)}
                        </div>
                        <div>
                          <strong style="font-size:12px;">${esc(p.name)}</strong>
                          ${p.legalName ? `<small style="color:var(--cc-subtle);">${esc(p.legalName)}</small>` : ''}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="cc-badge">${esc(p.category)}</span>
                    </td>
                    <td>
                      <div style="max-width:240px;">
                        <span style="font-size:11px;font-weight:550;color:var(--cc-text);">${esc(p.promo)}</span>
                      </div>
                    </td>
                    <td>
                      <small style="color:var(--cc-muted);">${esc(p.location)}</small>
                    </td>
                    <td>
                      <span class="cc-badge ${p.status === 'active' ? 'success' : 'danger'}">
                        ${p.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <small style="color:var(--cc-subtle);">#${Number(p.order || 1)}</small>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;">
                        <button class="cc-button" data-edit-partner="${p.id}" title="Editar aliado">${icon('edit', 14)} Editar</button>
                        <button class="cc-button" data-toggle-partner="${p.id}" title="${p.status === 'active' ? 'Desactivar' : 'Activar'}">
                          ${icon(p.status === 'active' ? 'eyeOff' : 'eye', 14)}
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td colspan="7">
                      <div class="cc-empty">
                        ${icon('grid', 32)}
                        <h3>No hay aliados registrados en esta categoría</h3>
                        <p>Incorpora marcas y establecimientos comerciales que ofrezcan descuentos a la comunidad de +58Express.</p>
                        <button class="cc-button primary" id="btn-empty-new-partner" style="margin-top:14px;">${icon('plus', 14)} Nuevo aliado</button>
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

    container.querySelector('#btn-new-partner')?.addEventListener('click', () => openEditor(null));
    container.querySelector('#btn-empty-new-partner')?.addEventListener('click', () => openEditor(null));

    container.querySelectorAll('[data-cat-filter]').forEach(btn => {
      btn.onclick = () => {
        categoryFilter = btn.dataset.catFilter;
        render();
      };
    });

    const searchInput = container.querySelector('#partner-search');
    if (searchInput) {
      searchInput.oninput = e => {
        query = e.target.value;
        render();
      };
    }

    container.querySelectorAll('[data-edit-partner]').forEach(btn => {
      btn.onclick = () => {
        const found = partners.find(p => p.id === btn.dataset.editPartner);
        if (found) openEditor(found);
      };
    });

    container.querySelectorAll('[data-toggle-partner]').forEach(btn => {
      btn.onclick = () => {
        const found = partners.find(p => p.id === btn.dataset.togglePartner);
        if (found) {
          found.status = found.status === 'active' ? 'inactive' : 'active';
          render();
        }
      };
    });
  };

  render();

  const observer = new MutationObserver(() => {
    if (container.querySelector('.cc-workspace-page') || container.querySelector('.cc-campaign-workspace')) return;
    cleanupLogo();
    observer.disconnect();
  });
  observer.observe(container, { childList: true });
}
