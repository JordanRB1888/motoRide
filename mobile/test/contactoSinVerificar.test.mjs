import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { estadoDelFallo, mensajeDelFallo } from '../domain/pedirViaje.ts';

/**
 * CUANDO EL SERVIDOR DICE «ESE CONTACTO NO ESTÁ VERIFICADO»
 *
 * DE DÓNDE SALE ESTO
 *
 * De una prueba en el emulador con una cuenta recién creada. Al pedir precio,
 * debajo de las motos aparecía en rojo:
 *
 *     CONTACT_NOT_VERIFIED
 *
 * y al escribir un destino, «No pudimos buscar. Inténtalo otra vez.» —que
 * invita a reintentar algo que va a fallar igual—. El servidor hacía lo
 * correcto: buscar sitios y estimar recorridos cuestan dinero en Google, y no
 * se le dan a una cuenta que todavía no ha demostrado que ese correo es suyo.
 * Lo que fallaba era todo lo demás: el código crudo en la cara, y ninguna
 * puerta hacia donde se arregla.
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que el código se traduzca a algo que se pueda leer.
 * 2. Que NINGÚN código del backend acabe pintado en la pantalla.
 * 3. Que el aviso venga con la salida: un botón que lleva a verificar.
 * 4. Que la pantalla de verificación sepa a dónde mandar el código aunque
 *    quien la abre no se lo diga: con sesión, el dato lo tiene el servidor.
 */

const raizMovil = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = fichero => fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');

test('el contacto sin verificar es un estado propio, no un error de precio', () => {
  // Se distingue porque pide algo distinto: los demás fallos se reintentan y
  // éste no se arregla insistiendo.
  assert.equal(
    estadoDelFallo({ motivo: 'ERROR_DEL_SERVIDOR', codigo: 'CONTACT_NOT_VERIFIED', estadoHttp: 403 }),
    'SIN_VERIFICAR'
  );
});

test('se dice qué hay que hacer, no el código del servidor', () => {
  const texto = mensajeDelFallo('SIN_VERIFICAR', 'CONTACT_NOT_VERIFIED');
  assert.doesNotMatch(texto, /CONTACT_NOT_VERIFIED/);
  assert.match(texto, /[Cc]onfirma/);
  assert.match(texto, /correo/i);
});

test('ningún código del backend se le enseña a nadie', () => {
  // El contrato de error del backend es `{ error: CÓDIGO }`, y la capa de red
  // deja ese código en `mensaje` porque no hay otro texto. Servía para
  // diagnosticar; nunca para leerlo.
  for (const codigo of ['CONTACT_NOT_VERIFIED', 'DATABASE_WRITE_FAILED', 'PRICING_UNAVAILABLE']) {
    const texto = mensajeDelFallo('PRICING_ERROR', codigo);
    assert.doesNotMatch(texto, new RegExp(codigo), `${codigo} llegó a la pantalla`);
  }

  // Y un mensaje de verdad se conserva: la red de seguridad no tapa lo que el
  // servidor sí supo explicar.
  assert.equal(
    mensajeDelFallo('PRICING_ERROR', 'No hay tarifa para esa zona'),
    'No hay tarifa para esa zona'
  );
});

test('la búsqueda de sitios distingue no poder buscar de no estar verificada', () => {
  const servicio = leer('services/lugares.ts');
  assert.match(servicio, /'SIN_VERIFICAR'/);
  assert.match(servicio, /codigo === 'CONTACT_NOT_VERIFIED'/);

  const buscador = leer('app/destino.tsx');
  // El texto no invita a reintentar: reintentar no lo arregla.
  assert.match(buscador, /SIN_VERIFICAR: '[^']*[Cc]onfirma[^']*'/);
  assert.doesNotMatch(buscador, /SIN_VERIFICAR: '[^']*Inténtalo otra vez/);
});

test('el aviso trae la puerta a verificar, en las dos pantallas', () => {
  const buscador = leer('app/destino.tsx');
  assert.match(buscador, /fallo === 'SIN_VERIFICAR'/);
  assert.match(buscador, /titulo="Verificar mi cuenta"/);

  const pedir = leer('app/pedir.tsx');
  assert.match(pedir, /setFaltaVerificar\(estado === 'SIN_VERIFICAR'\)/);
  assert.match(pedir, /titulo="Verificar mi cuenta"/);

  // Y las dos vuelven a donde estaban en vez de dejar a la persona perdida.
  for (const pantalla of [buscador, pedir]) {
    assert.match(pantalla, /volverA: '\/pedir'/);
  }
});

test('verificar no exige que le digan a dónde mandar el código', () => {
  // Quien llega desde «confirma tu correo para pedir viajes» no viene de
  // ningún formulario: no tiene el correo a mano. El servidor sí.
  const pantalla = leer('app/verificacion.tsx');
  assert.match(pantalla, /pedirPerfil\(\)/);
  assert.match(pantalla, /correo: actual\.correo \|\| respuesta\.datos\.email/);
  // Sólo con sesión: sin ella no hay perfil que pedir.
  assert.match(pantalla, /if \(!faltaContacto \|\| !haySesion\) return;/);
});
