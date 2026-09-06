import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPlacesClient, PLACES_ERROR } from '../services/placesClient.js';
import { crearAuthDeMaps, MODO_DE_AUTH } from '../services/googleMapsAuth.js';

/**
 * LA BÚSQUEDA ESCRITA DEL DESTINO
 *
 * Lo que se protege:
 *
 * 1. Que la credencial se quede en el servidor. Una clave de Places dentro de
 *    un APK es pública, y la factura la paga quien la extraiga.
 * 2. Que la llamada no dependa de la IP: Places (New) acepta OAuth, así que
 *    con cuenta de servicio sobrevive a un cambio de servidor de la VPN.
 * 3. Que se pida la máscara mínima: cada campo de más sube el precio.
 * 4. Que un proveedor caído no invente sugerencias.
 */

const PAR = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CUENTA = Object.freeze({
  type: 'service_account',
  project_id: 'proyecto-de-prueba',
  client_email: 'maps@proyecto-de-prueba.iam.gserviceaccount.com',
  private_key: PAR.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: 'https://oauth2.googleapis.com/token'
});
const TOKEN = 'ya29.token-de-prueba';

const RESPUESTA = {
  places: [
    {
      id: 'ChIJ-uno',
      displayName: { text: 'Centro Comercial Sambil Maracaibo' },
      formattedAddress: 'Av. 16 Guajira, Maracaibo',
      location: { latitude: 10.6712, longitude: -71.6083 }
    },
    // Sin coordenada: no se puede fijar como destino, así que no debe llegar.
    { id: 'ChIJ-dos', displayName: { text: 'Sin coordenada' }, formattedAddress: 'Ninguna' }
  ]
};

function redFalsa({ api = { status: 200, cuerpo: RESPUESTA } } = {}) {
  const llamadas = [];
  const fetchImpl = async (url, opciones = {}) => {
    const destino = String(url);
    llamadas.push({ url: destino, opciones });
    if (destino.includes('oauth2.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ access_token: TOKEN, expires_in: 3600 }) };
    }
    return { ok: api.status === 200, status: api.status, json: async () => api.cuerpo };
  };
  return { fetchImpl, llamadas };
}

const aPlaces = llamadas => llamadas.filter(l => l.url.includes('places.googleapis.com'));

test('la búsqueda va con el token de la cuenta de servicio, no con una clave', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const auth = crearAuthDeMaps({ cuenta: CUENTA, fetchImpl, apiKey: 'clave-que-no-debe-viajar' });
  const cliente = createPlacesClient({ auth, fetchImpl });

  assert.equal(cliente.authMode, MODO_DE_AUTH.OAUTH);
  await cliente.buscar('sambil', { lat: 10.66, lng: -71.61 });

  const llamada = aPlaces(llamadas)[0];
  assert.match(llamada.url, /places:searchText/);
  assert.equal(llamada.opciones.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(llamada.opciones.headers['X-Goog-Api-Key'], undefined, 'viajó la clave además del token');
});

test('la máscara pide lo mínimo: identificar, pintar y fijar el destino', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const cliente = createPlacesClient({ auth: crearAuthDeMaps({ cuenta: CUENTA, fetchImpl }), fetchImpl });
  await cliente.buscar('sambil');

  const mascara = aPlaces(llamadas)[0].opciones.headers['X-Goog-FieldMask'];
  assert.equal(mascara, 'places.id,places.displayName,places.formattedAddress,places.location');
  // Nada de reseñas, fotos, horarios ni teléfonos: cada campo de más se paga.
  for (const caro of ['photos', 'reviews', 'rating', 'nationalPhoneNumber', 'openingHours']) {
    assert.equal(mascara.includes(caro), false, `la máscara pide ${caro}`);
  }
});

test('la posición de quien busca solo sesga; no es obligatoria', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const cliente = createPlacesClient({ auth: crearAuthDeMaps({ cuenta: CUENTA, fetchImpl }), fetchImpl });

  await cliente.buscar('sambil', { lat: 10.66, lng: -71.61 });
  const conSesgo = JSON.parse(aPlaces(llamadas)[0].opciones.body);
  assert.equal(conSesgo.locationBias.circle.center.latitude, 10.66);
  assert.equal(conSesgo.languageCode, 'es');
  assert.equal(conSesgo.regionCode, 'VE');

  await cliente.buscar('sambil', null);
  const sinSesgo = JSON.parse(aPlaces(llamadas)[1].opciones.body);
  assert.equal(sinSesgo.locationBias, undefined);
});

test('un resultado sin coordenada no llega: no se puede fijar como destino', async () => {
  const { fetchImpl } = redFalsa();
  const cliente = createPlacesClient({ auth: crearAuthDeMaps({ cuenta: CUENTA, fetchImpl }), fetchImpl });
  const resultados = await cliente.buscar('sambil');

  assert.equal(resultados.length, 1);
  assert.deepEqual(resultados[0], {
    id: 'ChIJ-uno',
    nombre: 'Centro Comercial Sambil Maracaibo',
    direccion: 'Av. 16 Guajira, Maracaibo',
    lat: 10.6712,
    lng: -71.6083
  });
});

test('dos letras no son una búsqueda, y no se le pregunta a nadie', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const cliente = createPlacesClient({ auth: crearAuthDeMaps({ cuenta: CUENTA, fetchImpl }), fetchImpl });

  await assert.rejects(() => cliente.buscar('sa'), new RegExp(PLACES_ERROR.INVALID_QUERY));
  await assert.rejects(() => cliente.buscar('   '), new RegExp(PLACES_ERROR.INVALID_QUERY));
  assert.equal(aPlaces(llamadas).length, 0, 'se llamó a Google por media palabra');
});

test('sin credencial no se llama a nadie y se dice por qué', async () => {
  const { fetchImpl, llamadas } = redFalsa();
  const cliente = createPlacesClient({
    auth: crearAuthDeMaps({ rutaDeLaCuenta: null, cuentaEnBase64: null, apiKey: '' }),
    fetchImpl
  });
  assert.equal(cliente.isConfigured(), false);
  await assert.rejects(() => cliente.buscar('sambil'), new RegExp(PLACES_ERROR.NOT_CONFIGURED));
  assert.equal(llamadas.length, 0);
});

test('un proveedor caído no produce sugerencias inventadas', async () => {
  const avisos = [];
  const { fetchImpl } = redFalsa({ api: { status: 500, cuerpo: {} } });
  const cliente = createPlacesClient({
    auth: crearAuthDeMaps({ cuenta: CUENTA, fetchImpl }),
    fetchImpl,
    logger: { warn: m => avisos.push(String(m)) }
  });

  await assert.rejects(() => cliente.buscar('sambil'), new RegExp(PLACES_ERROR.PROVIDER_ERROR));
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].includes(TOKEN), false, 'el token acabó en el registro');
});

test('el móvil no lleva ninguna credencial de Places', () => {
  // La razón de que esta búsqueda viva en el servidor. Si algún día alguien
  // mete una clave en el móvil, esta prueba lo cuenta.
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const movil = path.resolve(aqui, '..', '..', 'mobile');
  if (!fs.existsSync(movil)) return;

  const sospechosos = [];
  const mirar = directorio => {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
      const ruta = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) { mirar(ruta); continue; }
      if (!/\.(js|jsx|ts|tsx|json)$/.test(entrada.name)) continue;
      const texto = fs.readFileSync(ruta, 'utf8');
      if (/places\.googleapis\.com/.test(texto)) sospechosos.push(ruta);
      if (/EXPO_PUBLIC[A-Z_]*(PLACES|MAPS|ROUTES)[A-Z_]*_(API_)?KEY/.test(texto)) sospechosos.push(ruta);
    }
  };
  for (const carpeta of ['src', 'app', 'components']) {
    const ruta = path.join(movil, carpeta);
    if (fs.existsSync(ruta)) mirar(ruta);
  }
  assert.deepEqual(sospechosos, [], 'el móvil llama a Places o lleva una clave dentro');
});
