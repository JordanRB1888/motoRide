/**
 * Ayudas compartidas por las pruebas.
 *
 * POR QUÉ EXISTE `sinComentarios`
 *
 * Cada vez que una prueba busca una palabra PROHIBIDA —«no importes
 * SecureStore», «no menciones la cartera»— acaba encontrándola en el comentario
 * que explica por qué está prohibida. Explicar por qué algo no está obliga a
 * nombrarlo.
 *
 * Ha pasado cuatro veces en este proyecto, y las cuatro parecía un fallo del
 * código cuando era un fallo de la prueba. Vive aquí para que la quinta no
 * exista.
 *
 * Regla: si la prueba comprueba que algo NO aparece, se le pasa el código sin
 * comentarios. Si comprueba que algo SÍ aparece, se le pasa entero — los
 * comentarios también son parte de lo que se quiere conservar.
 */

import fs from 'node:fs';
import path from 'node:path';

/** El código sin sus comentarios de bloque ni de línea. */
export function despojarComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Todos los ficheros del laboratorio visual, con rutas normalizadas.
 *
 * Se descubren solos. Antes se listaban a mano y cada pantalla nueva quedaba
 * sin vigilar hasta que alguien se acordaba de añadirla a la lista.
 */
export function ficherosDelLaboratorio(raizMovil) {
  const carpeta = path.join(raizMovil, 'preview');
  const dentro = fs.readdirSync(carpeta, { recursive: true })
    .map(nombre => `preview/${String(nombre).replace(/\\/g, '/')}`)
    .filter(relativa => /\.(ts|tsx)$/.test(relativa));
  return [...dentro, 'app/preview.tsx'];
}

// ---------------------------------------------------------------------------
// El contraste, según WCAG 2.1
// ---------------------------------------------------------------------------

/**
 * Vive aquí y no dentro de una prueba porque hay dos que la necesitan: la de
 * los esquemas, que mide los tokens, y la del dibujo de revisión, que mide lo
 * que de verdad se pinta con ellos. Dos copias de una fórmula son dos sitios
 * donde equivocarse por separado.
 */

/** Un color a sus tres canales, de 0 a 255. */
export function canales(color) {
  const limpio = color.replace('#', '');
  const completo = limpio.length === 3
    ? limpio.split('').map(c => c + c).join('')
    : limpio;
  return [0, 2, 4].map(inicio => parseInt(completo.slice(inicio, inicio + 2), 16));
}

/** Luminancia relativa. */
export function luminancia(color) {
  const [r, g, b] = canales(color).map(valor => {
    const proporcion = valor / 255;
    return proporcion <= 0.03928
      ? proporcion / 12.92
      : ((proporcion + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** La relación de contraste entre dos colores, de 1 a 21. */
export function contraste(uno, otro) {
  const a = luminancia(uno);
  const b = luminancia(otro);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Redondeado a dos decimales, para que los mensajes de error se lean. */
export const medido = (uno, otro) => Math.round(contraste(uno, otro) * 100) / 100;
