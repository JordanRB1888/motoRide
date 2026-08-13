import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPrivateDocumentViewer,
  documentContentEndpoint
} from '../src/pages/admin/privateDocumentViewer.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Doble mínimo de elemento: solo lo que el visor usa de verdad. Permite
 * desconectarlo del documento para reproducir cierres y cambios de pantalla.
 */
function makeButton({ id, mime = 'image/png' } = {}) {
  const element = {
    dataset: { privateDocument: id, mime },
    isConnected: true,
    textContent: '',
    children: [],
    listeners: {},
    ownerDocument: { createElement: tag => ({ tag, attributes: {} }) },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(event, handler) { (this.listeners[event] ||= []).push(handler); },
    click() { return Promise.all((this.listeners.click || []).map(handler => handler())); },
    disconnect() { this.isConnected = false; }
  };
  return element;
}

/** Registro de todo lo que el visor pide, crea y revoca. */
function makeHarness({ responder } = {}) {
  const requested = [];
  const created = [];
  const revoked = [];
  const openedInTab = [];
  const errors = [];
  let sequence = 0;

  const viewer = createPrivateDocumentViewer({
    loadUrl: async endpoint => {
      requested.push(endpoint);
      const url = responder
        ? await responder(endpoint, ++sequence)
        : `blob:documento-${++sequence}`;
      if (url) created.push(url);
      return url;
    },
    revokeUrl: url => revoked.push(url),
    openUrl: url => openedInTab.push(url),
    onError: id => errors.push(id)
  });

  return { viewer, requested, created, revoked, openedInTab, errors };
}

/** Promesa manual, para dejar una petición en vuelo mientras se cierra la pantalla. */
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('preparar los botones del expediente no solicita ningún contenido', async () => {
  const { viewer, requested, created } = makeHarness();
  const botones = ['doc_1', 'doc_2', 'doc_3'].map(id => makeButton({ id }));

  botones.forEach(boton => viewer.attach(boton));

  assert.deepEqual(requested, [], 'abrir el detalle no debe pedir documentos');
  assert.deepEqual(created, [], 'no debe existir ninguna Blob URL todavía');
  assert.equal(viewer.openCount, 0);
  // Y el botón invita a pedirlo, no anuncia que está cargando.
  for (const boton of botones) assert.equal(boton.textContent, 'Ver documento protegido');

  const pdf = makeButton({ id: 'doc_pdf', mime: 'application/pdf' });
  viewer.attach(pdf);
  assert.equal(pdf.textContent, 'Ver PDF protegido');
  assert.deepEqual(requested, [], 'tampoco el PDF se descarga al preparar');
});

test('pulsar un documento pide exactamente su endpoint por identificador', async () => {
  const { viewer, requested, openedInTab } = makeHarness();
  const boton = makeButton({ id: 'driver_document_abc-123' });
  viewer.attach(boton);

  await boton.click();

  assert.deepEqual(requested, ['/driver-documents/driver_document_abc-123/content']);
  assert.equal(documentContentEndpoint('driver_document_abc-123'), requested[0]);
  assert.equal(viewer.openCount, 1);
  assert.equal(openedInTab.length, 1, 'el documento se presenta al administrador');
});

test('no se solicita ningún documento que no se haya pulsado', async () => {
  const { viewer, requested } = makeHarness();
  const pulsado = makeButton({ id: 'doc_pulsado' });
  const otros = ['doc_a', 'doc_b', 'doc_c'].map(id => makeButton({ id }));
  [pulsado, ...otros].forEach(boton => viewer.attach(boton));

  await pulsado.click();

  assert.deepEqual(requested, ['/driver-documents/doc_pulsado/content']);
  for (const id of ['doc_a', 'doc_b', 'doc_c']) {
    assert.ok(!requested.some(endpoint => endpoint.includes(id)), `no debía pedirse ${id}`);
  }
});

test('pulsar dos veces el mismo documento no lo descarga otra vez', async () => {
  const { viewer, requested, created, openedInTab } = makeHarness();
  const boton = makeButton({ id: 'doc_repetido' });
  viewer.attach(boton);

  await boton.click();
  await boton.click();
  await boton.click();

  assert.equal(requested.length, 1, 'una sola descarga mientras siga abierto');
  assert.equal(created.length, 1, 'una sola Blob URL');
  assert.equal(openedInTab.length, 3, 'pero se puede volver a mostrar');
});

test('dos pulsaciones simultáneas comparten una única petición', async () => {
  const espera = deferred();
  const { viewer, requested, created } = makeHarness({ responder: () => espera.promise });
  const boton = makeButton({ id: 'doc_simultaneo' });
  viewer.attach(boton);

  const primera = viewer.open(boton);
  const segunda = viewer.open(boton);
  espera.resolve('blob:unica');
  await Promise.all([primera, segunda]);

  assert.equal(requested.length, 1, 'la segunda pulsación se suma a la petición en curso');
  assert.equal(created.length, 1);
});

test('cerrar el expediente revoca las Blob URLs abiertas', async () => {
  const { viewer, created, revoked } = makeHarness();
  const uno = makeButton({ id: 'doc_1' });
  const dos = makeButton({ id: 'doc_2' });
  [uno, dos].forEach(boton => viewer.attach(boton));

  await uno.click();
  await dos.click();
  assert.equal(viewer.openCount, 2);

  viewer.releaseAll();

  assert.deepEqual(revoked.sort(), created.sort(), 'se revoca todo lo creado');
  assert.equal(viewer.openCount, 0);
});

test('cambiar de expediente revoca lo anterior y vuelve a permitir la descarga', async () => {
  const { viewer, requested, revoked } = makeHarness();
  const primero = makeButton({ id: 'doc_expediente_1' });
  viewer.attach(primero);
  await primero.click();

  // Cambio de expediente: el DOM se rehace y las URLs anteriores mueren.
  viewer.releaseAll();
  primero.disconnect();
  assert.equal(revoked.length, 1);

  const segundo = makeButton({ id: 'doc_expediente_2' });
  viewer.attach(segundo);
  await segundo.click();

  assert.deepEqual(requested, [
    '/driver-documents/doc_expediente_1/content',
    '/driver-documents/doc_expediente_2/content'
  ]);
  assert.equal(viewer.openCount, 1, 'solo vive el documento del expediente actual');
});

test('destruir la pantalla revoca todo y bloquea nuevas aperturas', async () => {
  const { viewer, requested, created, revoked } = makeHarness();
  const boton = makeButton({ id: 'doc_destruido' });
  viewer.attach(boton);
  await boton.click();

  viewer.destroy();

  assert.deepEqual(revoked, created);
  assert.equal(viewer.destroyed, true);
  assert.equal(await viewer.open(boton), null, 'no se abre nada tras destruir');
  assert.equal(requested.length, 1, 'y no se lanza ninguna petición nueva');
});

test('una respuesta tardía tras cerrar se revoca y no toca el DOM', async () => {
  const espera = deferred();
  const { viewer, created, revoked, openedInTab } = makeHarness({ responder: () => espera.promise });
  const boton = makeButton({ id: 'doc_tardio' });
  viewer.attach(boton);

  const enVuelo = viewer.open(boton);
  // El administrador cierra el expediente antes de que llegue la respuesta.
  viewer.releaseAll();
  boton.disconnect();
  const textoAlCerrar = boton.textContent;

  espera.resolve('blob:llegada-tarde');
  assert.equal(await enVuelo, null);

  assert.deepEqual(created, ['blob:llegada-tarde']);
  assert.deepEqual(revoked, ['blob:llegada-tarde'], 'la URL tardía se revoca de inmediato');
  assert.equal(viewer.openCount, 0, 'no queda registrada');
  assert.equal(boton.textContent, textoAlCerrar, 'no se modifica un elemento desconectado');
  assert.equal(boton.children.length, 0);
  assert.deepEqual(openedInTab, [], 'ni se abre una pestaña sobre una pantalla cerrada');
});

test('una URL pedida antes del cierre no se adopta después, aunque el botón siga vivo', async () => {
  // Caso que aísla la invalidación por cierre: el elemento nunca se desconecta,
  // así que solo el cambio de generación puede impedir que la URL se adopte.
  const espera = deferred();
  const { viewer, created, revoked, openedInTab } = makeHarness({ responder: () => espera.promise });
  const boton = makeButton({ id: 'doc_generacion' });
  viewer.attach(boton);

  const enVuelo = viewer.open(boton);
  viewer.releaseAll();          // se cierra el expediente
  assert.equal(boton.isConnected, true, 'el botón sigue conectado a propósito');

  espera.resolve('blob:de-la-generacion-anterior');
  assert.equal(await enVuelo, null);

  assert.deepEqual(created, ['blob:de-la-generacion-anterior']);
  assert.deepEqual(revoked, ['blob:de-la-generacion-anterior']);
  assert.equal(viewer.openCount, 0, 'no queda adoptada por el expediente cerrado');
  assert.equal(boton.children.length, 0, 'ni se pinta sobre una vista ya cerrada');
  assert.deepEqual(openedInTab, []);
});

test('una respuesta tardía tras destruir la pantalla también se revoca', async () => {
  const espera = deferred();
  const { viewer, revoked, openedInTab } = makeHarness({ responder: () => espera.promise });
  const boton = makeButton({ id: 'doc_tardio_destruido' });
  viewer.attach(boton);

  const enVuelo = viewer.open(boton);
  viewer.destroy();
  espera.resolve('blob:tras-destruir');

  assert.equal(await enVuelo, null);
  assert.deepEqual(revoked, ['blob:tras-destruir']);
  assert.deepEqual(openedInTab, []);
});

test('un botón desconectado sin cierre explícito tampoco conserva la URL', async () => {
  const espera = deferred();
  const { viewer, revoked } = makeHarness({ responder: () => espera.promise });
  const boton = makeButton({ id: 'doc_desconectado' });
  viewer.attach(boton);

  const enVuelo = viewer.open(boton);
  boton.disconnect();
  espera.resolve('blob:huérfana');

  assert.equal(await enVuelo, null);
  assert.deepEqual(revoked, ['blob:huérfana']);
  assert.equal(viewer.openCount, 0);
});

test('el flujo de imagen pinta la vista previa con la Blob URL autorizada', async () => {
  const { viewer, openedInTab } = makeHarness();
  const imagen = makeButton({ id: 'doc_imagen', mime: 'image/jpeg' });
  viewer.attach(imagen);

  await imagen.click();

  assert.equal(imagen.children.length, 1, 'se inserta la vista previa');
  assert.equal(imagen.children[0].tag, 'img');
  assert.equal(imagen.children[0].src, 'blob:documento-1');
  assert.equal(imagen.children[0].alt, 'Documento privado');
  assert.deepEqual(openedInTab, ['blob:documento-1']);
});

test('el flujo de PDF ofrece abrirlo sin insertar una imagen', async () => {
  const { viewer, requested, openedInTab } = makeHarness();
  const pdf = makeButton({ id: 'doc_pdf', mime: 'application/pdf' });
  viewer.attach(pdf);

  await pdf.click();

  assert.deepEqual(requested, ['/driver-documents/doc_pdf/content']);
  assert.equal(pdf.textContent, 'Abrir PDF protegido');
  assert.equal(pdf.children.length, 0, 'un PDF no se pinta como imagen');
  assert.deepEqual(openedInTab, ['blob:documento-1']);
});

test('un 401 o un 404 no crea Blob URL ni rompe la pantalla', async () => {
  // getPrivateFileUrl devuelve null tanto en 401 como en 404: son indistinguibles.
  const { viewer, requested, created, revoked, openedInTab, errors } =
    makeHarness({ responder: () => null });
  const boton = makeButton({ id: 'doc_prohibido' });
  viewer.attach(boton);

  const [resultado] = await boton.click();
  assert.equal(resultado, null, 'sin autorización no se devuelve ninguna URL');

  assert.deepEqual(created, [], 'sin contenido no hay Blob URL');
  assert.deepEqual(revoked, [], 'y nada que revocar');
  assert.deepEqual(openedInTab, []);
  assert.equal(viewer.openCount, 0);
  assert.deepEqual(errors, ['doc_prohibido'], 'se avisa al administrador');
  assert.equal(boton.textContent, 'No disponible · reintentar');

  // La pantalla sigue viva: otro documento se abre con normalidad.
  assert.equal(viewer.destroyed, false);
  assert.equal(requested.length, 1);
});

test('tras un fallo se puede reintentar, y el reintento sí descarga', async () => {
  let intentos = 0;
  const { viewer, requested, created } = makeHarness({
    responder: () => (++intentos === 1 ? null : 'blob:al-segundo-intento')
  });
  const boton = makeButton({ id: 'doc_reintento' });
  viewer.attach(boton);

  await boton.click();
  await boton.click();

  assert.equal(requested.length, 2, 'un fallo no queda cacheado como éxito');
  assert.deepEqual(created, ['blob:al-segundo-intento']);
  assert.equal(viewer.openCount, 1);
});

test('la pantalla de solicitudes delega la descarga y no la hace por su cuenta', () => {
  // Pin de regresión: el bloqueo consistía en descargar todos los documentos al
  // abrir el expediente. La pantalla ya no llama a getPrivateFileUrl.
  const fuente = fs.readFileSync(
    path.resolve(here, '..', 'src', 'pages', 'admin', 'driverApplicationsManagement.js'),
    'utf8'
  );
  assert.ok(fuente.includes('createPrivateDocumentViewer'), 'debe delegar en el visor');
  assert.ok(!/getPrivateFileUrl\s*\(/.test(fuente.replace(/loadUrl: endpoint => apiService\.getPrivateFileUrl\(endpoint\)/, '')),
    'solo puede referirse a getPrivateFileUrl al inyectarlo en el visor');
  assert.ok(!fuente.includes('previewUrls'), 'el registro suelto de URLs ya no existe');
  assert.ok(!/Promise\.all\(\[\.\.\.previews\]/.test(fuente), 'no queda descarga masiva');
  assert.ok(fuente.includes('Ver documento protegido'), 'el botón invita a pedirlo');
});
