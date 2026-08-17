import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directorio = path.dirname(fileURLToPath(import.meta.url));

/**
 * Las pruebas que levantan un servidor eligen un puerto aleatorio dentro de un
 * bloque propio. Los bloques se habian ido solapando --6200-6899 con
 * 6400-6699, 6950-7649 con 7200-7499-- y dos archivos ejecutandose en paralelo
 * podian coincidir. El sintoma era un fallo intermitente a nivel de archivo,
 * sin ninguna asercion fallida, dificil de atribuir.
 */

const PATRON = /(\d{4,5}) \+ Math\.floor\(Math\.random\(\) \* (\d+)\)/g;

// Puertos que `fetch` rechaza con "bad port" y que por tanto ningun bloque
// puede contener. Es la lista estandar de puertos bloqueados.
const VETADOS = [
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6697, 10080
];

function bloques() {
  const encontrados = [];
  for (const archivo of fs.readdirSync(directorio).filter(nombre => nombre.endsWith('.test.js'))) {
    const fuente = fs.readFileSync(path.join(directorio, archivo), 'utf8');
    for (const coincidencia of fuente.matchAll(PATRON)) {
      const desde = Number(coincidencia[1]);
      const ancho = Number(coincidencia[2]);
      encontrados.push({ archivo, desde, hasta: desde + ancho - 1 });
    }
  }
  return encontrados;
}

test('cada archivo elige su puerto dentro de un bloque propio', () => {
  const encontrados = bloques();
  assert.ok(encontrados.length > 5, 'se esperaban varios archivos levantando servidor');

  // Un mismo archivo puede repetir su bloque en varios sitios; lo que no puede
  // es invadir el de otro.
  for (let i = 0; i < encontrados.length; i += 1) {
    for (let j = i + 1; j < encontrados.length; j += 1) {
      const uno = encontrados[i];
      const otro = encontrados[j];
      if (uno.archivo === otro.archivo) continue;
      const solapan = uno.desde <= otro.hasta && otro.desde <= uno.hasta;
      assert.ok(
        !solapan,
        `${uno.archivo} (${uno.desde}-${uno.hasta}) invade ${otro.archivo} (${otro.desde}-${otro.hasta})`
      );
    }
  }
});

test('ningún bloque contiene un puerto que fetch rechaza', () => {
  for (const bloque of bloques()) {
    const choque = VETADOS.filter(puerto => puerto >= bloque.desde && puerto <= bloque.hasta);
    assert.deepEqual(
      choque, [],
      `${bloque.archivo} (${bloque.desde}-${bloque.hasta}) incluye puertos vetados: ${choque.join(', ')}`
    );
  }
});

test('los bloques quedan en el rango efímero alto', () => {
  for (const bloque of bloques()) {
    // Por debajo de 10080 hay puertos vetados dispersos y mas riesgo de
    // tropezar con servicios reales de la maquina.
    assert.ok(bloque.desde > 10080, `${bloque.archivo} arranca demasiado bajo: ${bloque.desde}`);
    assert.ok(bloque.hasta < 65535, `${bloque.archivo} se sale del rango: ${bloque.hasta}`);
  }
});
