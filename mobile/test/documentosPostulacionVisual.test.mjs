import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

test('DocumentosPostulacion define el sistema de 4 grupos y tarjetas consistentes', () => {
  const codigo = leer('ui/DocumentosPostulacion.tsx');

  // Los 4 grupos documentales
  assert.match(codigo, /'identidad'/);
  assert.match(codigo, /'conduccion'/);
  assert.match(codigo, /'vehiculo'/);
  assert.match(codigo, /'presentacion'/);

  // Estados visuales de tarjeta de foto
  assert.match(codigo, /'PENDIENTE'/);
  assert.match(codigo, /'SUBIENDO'/);
  assert.match(codigo, /'SUBIDO'/);
  assert.match(codigo, /'REQUIERE_CAMBIOS'/);
  assert.match(codigo, /'CORREGIDO'/);

  // Estados de tarjeta de vídeo
  assert.match(codigo, /'SIN_VIDEO'/);
  assert.match(codigo, /'LISTO'/);
  assert.match(codigo, /'REPETIR'/);

  // Destaca el motivo de corrección de administración
  assert.match(codigo, /Motivo de Administración/);

  // Tokens del sistema de diseño
  assert.match(codigo, /tema\.color\.acento/);
  assert.match(codigo, /tema\.color\.exito/);
  assert.match(codigo, /tema\.color\.aviso/);
  assert.match(codigo, /tema\.color\.superficieElevada/);
  assert.match(codigo, /tema\.radio\.tarjeta/);

  // Es UI pura sin llamadas externas
  assert.doesNotMatch(codigo, /useRouter\(/);
  assert.doesNotMatch(codigo, /fetch\(/);
  assert.doesNotMatch(codigo, /router\.push\(/);
  assert.doesNotMatch(codigo, /AsyncStorage/);
});

test('pantallaPostulacionDocumentos estructura el Paso 3 con progreso y 4 secciones', () => {
  const preview = leer('preview/pantallaPostulacionDocumentos.tsx');

  // Exporta la pantalla C2
  assert.match(preview, /export function C2PostulacionDocumentos/);

  // Cabecera de 4 pasos con documentos activo
  assert.match(preview, /paso="documentos"/);
  assert.match(preview, /hechos=\{(\['personal',\s*'vehiculo'\])\}/);

  // Resumen de progreso
  assert.match(preview, /<ResumenProgresoDocumentos/);

  // Agrupación en 4 secciones
  assert.match(preview, /GRUPOS_DOCUMENTALES\.map/);
  assert.match(preview, /<CabeceraGrupoDocumental/);
  assert.match(preview, /<TarjetaDocumento/);
  assert.match(preview, /<TarjetaVideoPresentacion/);

  // Botones de navegación inferior
  assert.match(preview, /Atrás/);
  assert.match(preview, /Siguiente/);
});
