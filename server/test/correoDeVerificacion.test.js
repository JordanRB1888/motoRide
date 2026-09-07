import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASUNTO_DEL_CORREO,
  construirPeticion,
  cuerpoDelCorreo,
  cuerpoHtmlDelCorreo
} from '../services/verificationProviders.js';

/**
 * EL CORREO DEL CÓDIGO
 *
 * LO QUE SE PROTEGE
 *
 * 1. Que no lleve NI UN ENLACE. Es la razón por la que este correo era texto
 *    plano, y darle formato no relaja la regla: un correo de código que pide un
 *    clic enseña justo lo contrario de lo que hay que enseñar sobre phishing, y
 *    ese hábito es la puerta por la que después entra un correo falso.
 *
 * 2. Que no lleve imágenes. Una imagen remota es un píxel de seguimiento
 *    aunque no se pretenda, y media docena de clientes la bloquean, así que el
 *    correo se vería roto además de espiar.
 *
 * 3. Que el código llegue igual sin HTML. El texto plano viaja siempre: es lo
 *    que ven los clientes que no pintan HTML y los lectores de pantalla.
 *
 * 4. Que el código no se quede fuera de lo que Gmail muestra. Por encima de
 *    unos 102 KB recorta el mensaje y esconde el final tras «ver todo».
 */

const CODIGO = '482913';

test('el correo con formato no lleva un solo enlace', () => {
  const html = cuerpoHtmlDelCorreo(CODIGO);
  assert.doesNotMatch(html, /<a[\s>]/i, 'hay una etiqueta de enlace');
  assert.doesNotMatch(html, /https?:\/\//i, 'hay una dirección web dentro');
  assert.doesNotMatch(html, /href=/i, 'hay un href');
});

test('no lleva imágenes: ni logotipo remoto ni píxel de seguimiento', () => {
  const html = cuerpoHtmlDelCorreo(CODIGO);
  assert.doesNotMatch(html, /<img/i, 'hay una imagen');
  assert.doesNotMatch(html, /background-image/i, 'hay una imagen de fondo');
});

test('el código va dentro, y de las dos formas', () => {
  assert.match(cuerpoHtmlDelCorreo(CODIGO), new RegExp(CODIGO));
  assert.match(cuerpoDelCorreo(CODIGO), new RegExp(CODIGO));
});

test('el aviso de que nadie lo pedirá sobrevive en las dos versiones', () => {
  // Es la única defensa que lleva el correo contra que alguien llame por
  // teléfono diciendo ser de +58express. No puede perderse al maquetar.
  for (const cuerpo of [cuerpoDelCorreo(CODIGO), cuerpoHtmlDelCorreo(CODIGO)]) {
    assert.match(cuerpo, /nunca/i, 'se perdió el aviso de que nunca se pide el código');
    assert.match(cuerpo, /5 minutos/, 'no se dice cuánto dura');
  }
});

test('los estilos van en línea: es lo único que pintan igual todos', () => {
  const html = cuerpoHtmlDelCorreo(CODIGO);
  // Una hoja de estilos en la cabecera la descartan varios clientes, y el
  // correo llegaría sin formato justo donde más gente lo abre.
  assert.doesNotMatch(html, /<style[\s>]/i, 'hay una hoja de estilos que muchos clientes tiran');
  assert.match(html, /style="[^"]+"/, 'no hay estilos en línea');
  assert.match(html, /<table/i, 'sin tablas, Outlook lo desmonta');
});

test('cabe entero en lo que Gmail muestra sin recortar', () => {
  // Gmail recorta por encima de ~102 KB y esconde el final. Un código escondido
  // tras «ver todo el mensaje» es un código que no llega.
  const bytes = Buffer.byteLength(cuerpoHtmlDelCorreo(CODIGO), 'utf8');
  assert.ok(bytes < 60_000, `el correo pesa ${bytes} bytes y se acerca al recorte`);
});

test('los dos proveedores mandan las dos versiones', () => {
  const entorno = {
    EMAIL_FROM: 'no-reply@ejemplo.com',
    RESEND_API_KEY: 'clave-de-prueba',
    SENDGRID_API_KEY: 'clave-de-prueba'
  };

  const resend = construirPeticion('EMAIL', {
    env: { ...entorno, EMAIL_PROVIDER: 'resend' },
    destination: 'alguien@ejemplo.com',
    codigo: CODIGO
  });
  assert.equal(resend.body.subject, ASUNTO_DEL_CORREO);
  assert.match(resend.body.text, new RegExp(CODIGO));
  assert.match(resend.body.html, new RegExp(CODIGO));

  const sendgrid = construirPeticion('EMAIL', {
    env: { ...entorno, EMAIL_PROVIDER: 'sendgrid' },
    destination: 'alguien@ejemplo.com',
    codigo: CODIGO
  });
  const tipos = sendgrid.body.content.map(parte => parte.type);
  assert.deepEqual(tipos, ['text/plain', 'text/html'],
    'SendGrid prefiere el ÚLTIMO: el HTML tiene que ir después');
});

test('ni el código ni la clave del proveedor acaban donde no deben', () => {
  const peticion = construirPeticion('EMAIL', {
    env: {
      EMAIL_PROVIDER: 'resend',
      EMAIL_FROM: 'no-reply@ejemplo.com',
      RESEND_API_KEY: 'secreto-de-prueba'
    },
    destination: 'alguien@ejemplo.com',
    codigo: CODIGO
  });
  // La clave viaja en la cabecera, que es su sitio, y en ninguna otra parte.
  assert.match(peticion.headers.authorization, /^Bearer /);
  assert.equal(JSON.stringify(peticion.body).includes('secreto-de-prueba'), false,
    'la clave del proveedor acabó dentro del cuerpo del correo');
});
