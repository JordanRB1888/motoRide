import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLimit,
  encodeCursor,
  decodeCursor,
  paginate,
  PaginationError
} from '../domain/pagination.js';

const lista = n => Array.from({ length: n }, (_, i) => ({ id: `x_${i}`, fecha: `2026-01-${String((i % 28) + 1).padStart(2, '0')}` }));

// ------------------------------------------------------------------- limit

test('el límite tiene valor por defecto y tope máximo', () => {
  const opciones = { defaultLimit: 25, maxLimit: 100 };
  assert.equal(parseLimit(undefined, opciones), 25);
  assert.equal(parseLimit('', opciones), 25);
  assert.equal(parseLimit(null, opciones), 25);
  assert.equal(parseLimit('50', opciones), 50);
  assert.equal(parseLimit('100', opciones), 100);
});

test('el tope máximo es lo que impide que el cliente anule la paginación', () => {
  const opciones = { defaultLimit: 25, maxLimit: 100 };
  // Sin este rechazo, `?limit=999999` devolvería la colección entera y la
  // paginación sería voluntaria.
  assert.throws(() => parseLimit('101', opciones), /LIMIT_TOO_LARGE/);
  assert.throws(() => parseLimit('999999', opciones), /LIMIT_TOO_LARGE/);
});

test('un límite ilegible se rechaza en vez de interpretarse a medias', () => {
  const opciones = { defaultLimit: 25, maxLimit: 100 };
  // "50abc" pasaría como 50 con parseInt, y "-1" o "0" darían páginas vacías
  // que dejarían al cliente en un bucle sin avanzar.
  for (const malo of ['50abc', 'abc', '-1', '0', '1.5', ' 10', '10 ', '1e3', '+5']) {
    assert.throws(() => parseLimit(malo, opciones), PaginationError, `debía rechazarse: ${malo}`);
  }
});

// ------------------------------------------------------------------ cursor

test('el cursor va y vuelve sin perder información', () => {
  const cursor = encodeCursor({ sortKey: '2026-03-01T10:00:00.000Z', id: 'msg_42' });
  assert.deepEqual(decodeCursor(cursor), { sortKey: '2026-03-01T10:00:00.000Z', id: 'msg_42' });
});

test('el cursor lleva identificador además de la clave de orden', () => {
  // Dos registros con la misma fecha tendrían el mismo cursor si solo se
  // guardara la fecha, y la paginación repetiría o saltaría registros.
  const uno = encodeCursor({ sortKey: '2026-03-01', id: 'a' });
  const otro = encodeCursor({ sortKey: '2026-03-01', id: 'b' });
  assert.notEqual(uno, otro);
  assert.equal(decodeCursor(uno).id, 'a');
  assert.equal(decodeCursor(otro).id, 'b');
});

test('el cursor es opaco y seguro en una URL', () => {
  const cursor = encodeCursor({ sortKey: '2026-03-01T10:00:00.000Z', id: 'msg/con+raros=' });
  assert.match(cursor, /^[A-Za-z0-9_-]+$/, 'no debe necesitar escapado');
  assert.equal(cursor, encodeURIComponent(cursor), 'debe viajar intacto en la URL');
  assert.equal(decodeCursor(cursor).id, 'msg/con+raros=');
});

test('un cursor manipulado se rechaza, no se interpreta', () => {
  for (const malo of [
    '', '   ', null, undefined, 42, {},
    'no base64!', '../../etc/passwd', 'a b', 'AAAA===',
    encodeBase64Sin(''), encodeBase64Sin('sin-separador')
  ]) {
    assert.throws(() => decodeCursor(malo), PaginationError, `debía rechazarse: ${String(malo)}`);
  }
});

function encodeBase64Sin(texto) {
  return Buffer.from(texto, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('encodeCursor exige identificador', () => {
  assert.throws(() => encodeCursor({ sortKey: 'x', id: '' }), /INVALID_CURSOR_INPUT/);
  assert.throws(() => encodeCursor({ sortKey: 'x' }), /INVALID_CURSOR_INPUT/);
});

// ---------------------------------------------------------------- paginate

test('recorre la colección entera sin repetir ni saltarse nada', () => {
  const datos = lista(97);
  const vistos = [];
  let cursor = null;
  let vueltas = 0;
  do {
    const pagina = paginate(datos, { limit: 10, cursor, sortKeyOf: item => item.fecha });
    vistos.push(...pagina.items.map(item => item.id));
    cursor = pagina.nextCursor;
    vueltas += 1;
    assert.ok(vueltas < 50, 'la paginación no termina');
  } while (cursor);

  assert.equal(vistos.length, 97);
  assert.deepEqual(vistos, datos.map(item => item.id), 'mismo orden, sin huecos ni duplicados');
  assert.equal(new Set(vistos).size, 97);
});

test('la última página no ofrece cursor siguiente', () => {
  const datos = lista(20);
  const primera = paginate(datos, { limit: 20, cursor: null, sortKeyOf: item => item.fecha });
  assert.equal(primera.items.length, 20);
  assert.equal(primera.nextCursor, null, 'sin más registros no debe haber cursor');

  const justa = paginate(lista(10), { limit: 10, cursor: null, sortKeyOf: item => item.fecha });
  assert.equal(justa.nextCursor, null, 'una página exacta tampoco ofrece otra');
});

test('informa del total aunque devuelva una página', () => {
  const pagina = paginate(lista(97), { limit: 10, cursor: null, sortKeyOf: item => item.fecha });
  assert.equal(pagina.total, 97);
  assert.equal(pagina.items.length, 10);
});

test('una colección vacía o ausente devuelve una página vacía sin fallar', () => {
  for (const vacio of [[], null, undefined, 'texto']) {
    const pagina = paginate(vacio, { limit: 10, cursor: null });
    assert.deepEqual(pagina.items, []);
    assert.equal(pagina.nextCursor, null);
    assert.equal(pagina.total, 0);
  }
});

test('un cursor cuyo registro ya no existe reinicia en vez de atascarse', () => {
  const datos = lista(30);
  const cursor = encodeCursor({ sortKey: 'x', id: 'x_borrado' });
  const pagina = paginate(datos, { limit: 10, cursor, sortKeyOf: item => item.fecha });
  // Si se devolviera una página vacía, el cliente se quedaría sin poder
  // avanzar tras cualquier borrado ocurrido entre dos páginas.
  assert.equal(pagina.items.length, 10);
  assert.equal(pagina.items[0].id, 'x_0');
});

test('insertar al principio no hace que la página siguiente repita registros', () => {
  // Es la razón de usar cursor y no desplazamiento numérico: con `offset`,
  // un registro nuevo al principio desplaza todo y la segunda página repite
  // el último de la primera.
  const datos = lista(30);
  const primera = paginate(datos, { limit: 10, cursor: null, sortKeyOf: item => item.fecha });

  datos.unshift({ id: 'x_nuevo', fecha: '2026-01-01' });

  const segunda = paginate(datos, { limit: 10, cursor: primera.nextCursor, sortKeyOf: item => item.fecha });
  const repetidos = segunda.items.filter(item => primera.items.some(previo => previo.id === item.id));
  assert.deepEqual(repetidos, [], 'ninguna repetición pese a la inserción');
  assert.equal(segunda.items[0].id, 'x_10', 'continúa justo donde iba');
});

test('el identificador se puede extraer con una función propia', () => {
  const datos = [{ clave: 'a' }, { clave: 'b' }, { clave: 'c' }];
  const pagina = paginate(datos, { limit: 2, cursor: null, idOf: item => item.clave });
  assert.equal(pagina.items.length, 2);
  const segunda = paginate(datos, { limit: 2, cursor: pagina.nextCursor, idOf: item => item.clave });
  assert.deepEqual(segunda.items, [{ clave: 'c' }]);
});

test('el tamaño de página se respeta exactamente', () => {
  for (const limite of [1, 5, 25, 100]) {
    const pagina = paginate(lista(500), { limit: limite, cursor: null, sortKeyOf: item => item.fecha });
    assert.equal(pagina.items.length, limite, `límite ${limite}`);
  }
});
