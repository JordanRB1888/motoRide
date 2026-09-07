import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';

/**
 * La espera: «Buscando tu moto».
 *
 * Es el momento más largo de la aplicación. Lo que se comprueba aquí no es que
 * quede bonito —eso no se comprueba— sino las cosas que al romperse no dan
 * ningún error y sólo se ven mirando la pantalla: que en el centro del sonar
 * siga quien espera y no el vehículo, que el recorte del avatar no deje un
 * hueco, y que el dibujo de revisión y el teléfono sigan contando lo mismo.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

const ESTADOS = 'ui/Estados.tsx';
const MARCA = 'ui/Marca.tsx';
const DIBUJO = 'scripts/pantallasWeb.mjs';

/**
 * El encuadre se lee del fichero, no se importa.
 *
 * `theme/marca.ts` resuelve sus imágenes con el `require` de Metro, que aquí no
 * existe: importarlo revienta antes de llegar a la primera comprobación. Leer
 * los números del código cumple lo mismo y además falla si alguien los borra.
 */
function numeroDeMarca(nombre, patron) {
  const encontrado = leer('theme/marca.ts').match(patron);
  assert.ok(encontrado, `no se encontró ${nombre} en theme/marca.ts`);
  return encontrado;
}

const ACERCAMIENTO_DE_LA_PASAJERA = Number(
  numeroDeMarca(
    'el acercamiento',
    /ACERCAMIENTO_DE_LA_PASAJERA = ([\d.]+)/
  )[1]
);

const [, anchoX, ladoX, anchoY, ladoY] = numeroDeMarca(
  'el encuadre',
  /ENCUADRE_DE_LA_PASAJERA = Object\.freeze\(\{ x: (\d+) \/ (\d+), y: (\d+) \/ (\d+) \}\)/
);

const ENCUADRE_DE_LA_PASAJERA = {
  x: Number(anchoX) / Number(ladoX),
  y: Number(anchoY) / Number(ladoY)
};

// ---------------------------------------------------------------------------
// En el centro va quien espera
// ---------------------------------------------------------------------------

test('el sonar centra a la pasajera y NO un vehículo', () => {
  // La pasajera está de pie en la acera con el teléfono en la mano. La toma
  // cenital de la moto ahí decía que ya iba montada, que es justo lo que
  // todavía no ha pasado.
  //
  // Sin comentarios: lo que se busca es que el marcador de vehículo NO esté, y
  // explicar por qué obliga a nombrarlo.
  const estados = despojarComentarios(leer(ESTADOS));
  const sonar = estados.slice(
    estados.indexOf('export function PulsoDeBusqueda'),
    estados.indexOf('function Anillo')
  );

  assert.ok(sonar.includes('MarcadorDePersona'), 'el sonar no pinta a la pasajera');
  assert.ok(!sonar.includes('MarcadorDeVehiculo'), 'el sonar volvió a poner el vehículo en el centro');
});

test('el dibujo de revisión centra lo mismo que el teléfono', () => {
  const dibujo = despojarComentarios(leer(DIBUJO));
  const sonar = dibujo.slice(dibujo.indexOf('const pulso'), dibujo.indexOf('export const PANTALLAS'));

  assert.ok(sonar.includes('persona('), 'el dibujo no pinta a la pasajera en el centro');
  assert.ok(!/moto-mapa|auto-mapa/.test(sonar), 'el dibujo volvió a poner el vehículo en el centro');
});

test('la pasajera del mapa sale del avatar de marca, no de un pictograma', () => {
  // Un muñeco genérico al lado de una moto fotográfica canta. Ya pasó una vez
  // en la web con el icono que «se leía como bicicleta».
  assert.ok(leer(MARCA).includes('AVATARES_DE_ROL.pasajero'), 'el marcador no usa el avatar de marca');
  assert.ok(leer(DIBUJO).includes('rol-pasajero.png'), 'el dibujo no usa el avatar de marca');
});

// ---------------------------------------------------------------------------
// El recorte no puede dejar hueco
// ---------------------------------------------------------------------------

test('el avatar cubre el disco entero en cualquier tamaño', () => {
  // La ilustración es apaisada de contenido: la persona a la izquierda, la moto
  // y la ruta a la derecha. Encuadrarla desplazada es lo correcto, pero si se
  // pasa, el disco enseña un trozo vacío por el lado contrario.
  for (const diametro of [40, 64, 96, 140]) {
    const lado = diametro * ACERCAMIENTO_DE_LA_PASAJERA;
    const izquierda = diametro / 2 - ENCUADRE_DE_LA_PASAJERA.x * lado;
    const arriba = diametro / 2 - ENCUADRE_DE_LA_PASAJERA.y * lado;

    assert.ok(izquierda <= 0, `a ${diametro} puntos queda hueco por la izquierda`);
    assert.ok(arriba <= 0, `a ${diametro} puntos queda hueco por arriba`);
    assert.ok(izquierda + lado >= diametro, `a ${diametro} puntos queda hueco por la derecha`);
    assert.ok(arriba + lado >= diametro, `a ${diametro} puntos queda hueco por abajo`);
  }
});

test('el encuadre va en fracciones, no en píxeles del activo', () => {
  // El avatar está guardado a 288 y podría reexportarse a otro tamaño. En
  // píxeles, el encuadre se movería sin que nadie tocara nada.
  //
  // Que la expresión regular de arriba haya casado ya prueba la forma
  // «numerador / denominador»; aquí se comprueba que el resultado cae dentro
  // de la imagen.
  for (const valor of Object.values(ENCUADRE_DE_LA_PASAJERA)) {
    assert.ok(valor > 0 && valor < 1, `${valor} no es una fracción del lado`);
  }
});

// ---------------------------------------------------------------------------
// Los dos movimientos
// ---------------------------------------------------------------------------

test('la espera ya no se cuenta con tres puntos suspensivos', () => {
  // Tres puntos que se encienden dicen «cargando», que es lo que dice cualquier
  // aplicación mientras hace cualquier cosa. Aquí se está mirando ahí fuera.
  const estados = despojarComentarios(leer(ESTADOS));
  assert.ok(!estados.includes('PuntosSuspensivos'), 'volvieron los puntos suspensivos');
  assert.ok(estados.includes('TituloQueBusca'), 'falta el rastro sobre el título');
  assert.ok(estados.includes('CarrilDeBarrido'), 'falta el carril de barrido');
});

test('el dibujo y el teléfono barren al mismo compás', () => {
  const estados = leer(ESTADOS);
  const dibujo = leer(DIBUJO);

  const enElTelefono = estados.match(/const COMPAS = (\d+);/);
  assert.ok(enElTelefono, 'el teléfono no declara su compás');

  const segundos = Number(enElTelefono[1]) / 1000;
  const enElDibujo = [...dibujo.matchAll(/animation:(?:rastrea|barre) ([\d.]+)s/g)].map(m => Number(m[1]));
  assert.equal(enElDibujo.length, 2, 'el dibujo no tiene los dos movimientos');
  for (const medida of enElDibujo) {
    assert.equal(medida, segundos, `el dibujo barre en ${medida}s y el teléfono en ${segundos}s`);
  }
});

test('el tramo del carril mide lo mismo en los dos', () => {
  // En el teléfono es una fracción del ancho; en el dibujo, un porcentaje. Si
  // se separan, el laboratorio deja de enseñar lo que se entrega.
  const enElTelefono = leer(ESTADOS).match(/ancho \* (0\.\d+), 48/);
  assert.ok(enElTelefono, 'el teléfono no declara el tramo');

  const porcentaje = Number(enElTelefono[1]) * 100;
  assert.ok(
    leer(DIBUJO).includes(`.carril span{position:absolute;inset:0 auto 0 0;width:${porcentaje}%`),
    `el dibujo no usa un tramo del ${porcentaje} %`
  );
});

test('quien pide no ver movimiento no lo ve', () => {
  // No es un extra: es una preferencia del sistema, y aquí hay dos bucles
  // infinitos a la vez.
  assert.ok(leer(ESTADOS).includes('useMovimientoReducido'), 'el teléfono ignora la preferencia');
  assert.ok(
    leer(DIBUJO).includes('prefers-reduced-motion'),
    'el dibujo ignora la preferencia'
  );
});

test('sin movimiento, el carril sigue diciendo que hay algo en marcha', () => {
  // Esconderlo del todo dejaría una espera sin ninguna señal de vida. El tramo
  // se queda quieto pero visible.
  const estados = leer(ESTADOS);
  assert.ok(
    /quieto\s*\n?\s*\?\s*\[\{ translateX: \(ancho - tramo\) \/ 2 \}\]/.test(estados),
    'el carril desaparece cuando se pide no ver movimiento'
  );

  const dibujo = leer(DIBUJO);
  const reducido = dibujo.slice(dibujo.indexOf('prefers-reduced-motion'));
  assert.ok(
    /\.carril span\{animation:none;transform:translateX\([\d.]+%\)\}/.test(reducido),
    'en el dibujo el tramo no se queda a la vista'
  );
});
