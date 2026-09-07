import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

test('Registro.tsx implementa la experiencia visual de alta para pasajero y conductor', () => {
  const codigo = leer('ui/Registro.tsx');

  // Los dos caminos con el selector de camino
  assert.match(codigo, /SelectorDeCaminoAuth/);
  assert.match(codigo, /Ya tengo cuenta/);
  assert.match(codigo, /Soy nuevo/);

  // Los 6 campos del formulario de registro
  assert.match(codigo, /etiqueta="Nombre"/);
  assert.match(codigo, /etiqueta="Apellido"/);
  assert.match(codigo, /etiqueta="Correo electrónico"/);
  assert.match(codigo, /etiqueta="Teléfono móvil"/);
  assert.match(codigo, /etiqueta="Contraseña"/);
  assert.match(codigo, /etiqueta="Confirmar contraseña"/);

  // Conductor: no promete rol directo, usa contexto claro de postulación
  assert.match(codigo, /Crear cuenta y postularme/);
  assert.match(codigo, /BannerContextoConductor/);
  assert.match(codigo, /Paso 1 de 2 · Cuenta/);
  assert.match(codigo, /documentos de tu vehículo para trabajar con \+58Express/);

  // Pasajero: copy claro
  assert.match(codigo, /'Crear cuenta'/);

  // Preservación del login hermano y enlaces
  assert.match(codigo, /Iniciar sesión/);
  assert.match(codigo, /Términos y Condiciones/);
  assert.match(codigo, /Política de Privacidad/);
  assert.match(codigo, /Disponible próximamente/);

  // UI pura sin lógica de backend ni llamadas de auth
  assert.doesNotMatch(codigo, /fetch\(/);
  assert.doesNotMatch(codigo, /AsyncStorage/);
  assert.doesNotMatch(codigo, /\/api\/auth\/register/);
});

test('DocumentosPostulacion cuenta con ContenedorAvisoAnimado para salida suave de errores', () => {
  const codigo = leer('ui/DocumentosPostulacion.tsx');

  // Componente animado para salida limpia de avisos de error y correcciones
  assert.match(codigo, /export function ContenedorAvisoAnimado/);
  assert.match(codigo, /Reanimated/);
  assert.match(codigo, /useSharedValue/);
  assert.match(codigo, /withTiming/);
});
