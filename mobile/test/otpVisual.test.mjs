/**
 * Pruebas unitarias visuales y de contrato para AUTH-OTP-VISUAL
 * (Verificación OTP y Recuperación de Contraseña en +58Express).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const raizMovil = path.resolve(__dirname, '..');

function leer(fichero) {
  return fs.readFileSync(path.resolve(raizMovil, fichero), 'utf8');
}

test('AUTH-OTP-VISUAL: VerificacionOTP.tsx exporta todos los componentes necesarios', () => {
  const contenido = leer('ui/VerificacionOTP.tsx');

  // 1. Selector de canal con WhatsApp preferido/recomendado
  assert.match(contenido, /export function SelectorCanalOTP/);
  assert.match(contenido, /tipo:\s*'whatsapp'/);
  assert.match(contenido, /recomendado:\s*true/);
  assert.match(contenido, /Recomendado/);
  assert.match(contenido, /tipo:\s*'sms'/);
  assert.match(contenido, /tipo:\s*'email'/);
  assert.match(contenido, /export function IconoWhatsApp/);

  // 2. Entrada de código de 6 dígitos
  assert.match(contenido, /export function EntradaCodigoOTP/);
  assert.match(contenido, /longitud\s*=\s*6/);
  assert.match(contenido, /celda-otp-\$\{idx\}/);
  assert.match(contenido, /oneTimeCode/);

  // 3. Temporizador y Reenvío
  assert.match(contenido, /export function ContadorReenvioOTP/);
  assert.match(contenido, /Reenviar código en/);
  assert.match(contenido, /boton-reenviar-codigo/);

  // 4 y 5. Avisos de error y expiración
  assert.match(contenido, /export function AvisoEstadoOTP/);
  assert.match(contenido, /Código incorrecto/);
  assert.match(contenido, /Este código ha expirado/);
  assert.match(contenido, /boton-solicitar-nuevo-codigo/);

  // 6. Verificación exitosa
  assert.match(contenido, /export function EstadoVerificacionExitosa/);
  assert.match(contenido, /¡Identidad verificada!/);
  assert.match(contenido, /boton-continuar-exito/);

  // 7. Flujo de Recuperación de contraseña
  assert.match(contenido, /export function SuperficieRecuperarContrasena/);
  assert.match(contenido, /Recupera tu contraseña/);
  assert.match(contenido, /campo-recuperar-contacto/);
  assert.match(contenido, /campo-nueva-contrasena/);
  assert.match(contenido, /campo-confirmar-nueva-contrasena/);
  assert.match(contenido, /boton-actualizar-contrasena/);

  // Pantalla C2 completa
  assert.match(contenido, /export function C2VerificacionOTP/);
  assert.match(contenido, /testID="hoja-de-verificacion"/);
});

test('AUTH-OTP-VISUAL: pantallaVerificacionOTP.tsx implementa el laboratorio para los 7 estados', () => {
  const contenido = leer('preview/pantallaVerificacionOTP.tsx');

  assert.match(contenido, /PantallaPreviewVerificacionOTP/);
  assert.match(contenido, /'1\. Canal'/);
  assert.match(contenido, /'2\. 6 Dígitos'/);
  assert.match(contenido, /'3\. Reenvío'/);
  assert.match(contenido, /'4\. Error'/);
  assert.match(contenido, /'5\. Expirado'/);
  assert.match(contenido, /'6\. Éxito'/);
  assert.match(contenido, /'7\. Recuperar'/);
});
