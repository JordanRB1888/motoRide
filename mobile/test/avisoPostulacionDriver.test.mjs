import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

test('AvisoPostulacionDriver define las 3 variantes requeridas sin acoplar lógica', () => {
  const codigo = leer('ui/AvisoPostulacionDriver.tsx');

  // Variantes soportadas
  assert.match(codigo, /'review'\s*\|\s*'changes_required'\s*\|\s*'approved'/);

  // Textos y estados requeridos
  assert.match(codigo, /Solicitud en revisión/);
  assert.match(codigo, /Solicitud requiere cambios/);
  assert.match(codigo, /Solicitud aprobada/);

  // CTAs de las variantes que lo requieren
  assert.match(codigo, /Revisar solicitud/);
  assert.match(codigo, /Entrar como Driver/);

  // Sistema de diseño y tokens de +58Express
  assert.match(codigo, /tema\.color\.acento/);
  assert.match(codigo, /tema\.color\.exito/);
  assert.match(codigo, /tema\.color\.superficieElevada/);
  assert.match(codigo, /tema\.radio\.tarjeta/);

  // No acopla navegación directa ni backend (UI pura)
  assert.doesNotMatch(codigo, /useRouter\(/);
  assert.doesNotMatch(codigo, /fetch\(/);
  assert.doesNotMatch(codigo, /router\.push\(/);
});

test('C2InicioPasajera integra el aviso de postulación contextual bajo el buscador', () => {
  const inicio = leer('preview/pantallaInicioPasajera.tsx');

  // Importa y expone el componente
  assert.match(inicio, /import \{ AvisoPostulacionDriver/);
  assert.match(inicio, /avisoPostulacion\?: PropiedadesAvisoPostulacion \| null/);
  assert.match(inicio, /<AvisoPostulacionDriver \{\.\.\.avisoPostulacion\} \/>/);
});
