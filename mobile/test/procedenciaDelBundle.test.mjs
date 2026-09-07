import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { procedenciaDelBundle } from '../dev/procedenciaDelBundle.ts';

/**
 * De qué worktree salió el bundle — DISPATCH-DRIVER-SURFACES.
 *
 * QUÉ SE PROTEGE
 *
 * Que se pueda saber, en el primer segundo, si el código que corre en el
 * dispositivo es el que se está editando. Con varios worktrees del mismo
 * repositorio abiertos a la vez, el bundler del puerto por omisión puede ser el
 * de otra rama, y entonces los cambios propios «no aparecen» sin que nada
 * falle.
 *
 * Y que ese dato no acabe en una aplicación publicada: la carpeta del
 * ordenador de quien compila no es asunto de quien la instala.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));

test('dice la carpeta y quién sirvió el bundle', () => {
  assert.equal(
    procedenciaDelBundle({
      worktree: 'motoRide-current',
      urlDelBundle: 'http://10.0.2.2:8085/index.bundle?platform=android&dev=true'
    }),
    'código de «motoRide-current», servido por 10.0.2.2:8085'
  );
});

test('el worktree ajeno se lee tal cual, que es de lo que se trata', () => {
  const linea = procedenciaDelBundle({
    worktree: 'motoRide-design',
    urlDelBundle: 'http://10.0.2.2:8081/index.bundle'
  });
  assert.match(linea, /motoRide-design/);
  assert.match(linea, /10\.0\.2\.2:8081/);
});

test('acepta el «host:puerto» pelado que da Expo', () => {
  // `Constants.expoConfig.hostUri` viene sin esquema. Es la fuente real, así
  // que si esto se rompiera el aviso enmudecería justo donde hace falta.
  assert.equal(
    procedenciaDelBundle({ worktree: 'motoRide-current', urlDelBundle: '10.0.2.2:8085' }),
    'código de «motoRide-current», servido por 10.0.2.2:8085'
  );
});

test('con un dato suelto dice lo que sabe', () => {
  assert.equal(
    procedenciaDelBundle({ worktree: 'motoRide-current' }),
    'código de «motoRide-current»'
  );
  assert.equal(
    procedenciaDelBundle({ urlDelBundle: 'http://192.168.1.144:8081/index.bundle' }),
    'código servido por 192.168.1.144:8081'
  );
});

test('sin ningún dato NO escribe nada', () => {
  // Una línea que dijera «desconocido» en cada arranque se acabaría ignorando,
  // que es lo contrario de lo que se busca.
  assert.equal(procedenciaDelBundle({}), null);
  assert.equal(procedenciaDelBundle({ worktree: '', urlDelBundle: '' }), null);
  assert.equal(procedenciaDelBundle({ worktree: null, urlDelBundle: null }), null);
});

test('lo que no puede ser un servidor no se enseña a medias', () => {
  // Un host suelto sí vale —`hostUri` los da—, pero algo con barras o espacios
  // es una URL rota, y media URL en pantalla confunde más de lo que ayuda.
  assert.equal(procedenciaDelBundle({ urlDelBundle: 'esto no es un host' }), null);
  assert.equal(procedenciaDelBundle({ urlDelBundle: '/ruta/suelta' }), null);
  assert.equal(
    procedenciaDelBundle({ worktree: 'motoRide-current', urlDelBundle: 'file:///' }),
    'código de «motoRide-current»'
  );
});

test('el nombre del worktree NO se escribe en una compilación de publicación', () => {
  // La guarda vive en `app.config.js`, que es quien lo resuelve. Si alguien la
  // quita, la ruta del disco de quien compila viajaría dentro del APK.
  const fuente = fs.readFileSync(path.join(aqui, '..', 'app.config.js'), 'utf8');
  assert.match(fuente, /NODE_ENV === 'production'/);
  assert.match(fuente, /worktreeDeDesarrollo/);
});

test('el aviso sólo se escribe en desarrollo', () => {
  const fuente = fs.readFileSync(path.join(aqui, '..', 'app', '_layout.tsx'), 'utf8');
  const llamada = fuente.indexOf('procedenciaDelBundle({');
  assert.notEqual(llamada, -1, 'el arranque ya no consulta la procedencia');

  // La guarda tiene que estar por encima de la llamada, no en cualquier sitio.
  const guarda = fuente.lastIndexOf('if (!EN_DESARROLLO) return;', llamada);
  assert.notEqual(guarda, -1, 'la consulta quedó fuera de la guarda de desarrollo');
});

test('el aviso se emite al montar, no al cargar el módulo', () => {
  // Un `console.log` de nivel de módulo se emite antes de que el canal de
  // registro llegue a la consola de Metro: se ejecuta y no aparece en ningún
  // sitio. Es un fallo mudo, así que se protege.
  const fuente = fs.readFileSync(path.join(aqui, '..', 'app', '_layout.tsx'), 'utf8');
  const llamada = fuente.indexOf('procedenciaDelBundle({');
  const efecto = fuente.lastIndexOf('useEffect(() => {', llamada);
  assert.notEqual(efecto, -1, 'la consulta salió del efecto de montaje');
});
