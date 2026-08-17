import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUserFilters, matchesUserFilters, filterUsers,
  isSuspended, isVerified, MAX_SEARCH_LENGTH, MAX_IDS
} from '../domain/userFilters.js';

/**
 * Referencia: los predicados tal y como estaban en la pantalla, antes de
 * moverlos al servidor. Se conservan para comprobar que la definición no
 * cambió al trasladarla.
 */
const refSuspendido = user => user.status === 'SUSPENDED' || user.accountStatus === 'DISABLED';
const refVerificado = user => user.role === 'passenger'
  ? user.accountStatus !== 'DISABLED'
  : Boolean(user.isVerified);

const usuario = (extra = {}) => ({
  id: 'u_1', role: 'passenger', firstName: 'Ana', lastName: 'Rodriguez',
  email: 'ana@ejemplo.com', phone: '+584140001122', accountStatus: 'ACTIVE', ...extra
});

// ------------------------------------------------------------- predicados

test('la suspensión se detecta por cualquiera de sus dos marcas', () => {
  assert.equal(isSuspended(usuario()), false);
  assert.equal(isSuspended(usuario({ status: 'SUSPENDED' })), true);
  assert.equal(isSuspended(usuario({ accountStatus: 'DISABLED' })), true);
});

test('«verificado» significa cosas distintas según el rol', () => {
  // Un pasajero lo está mientras su cuenta no esté deshabilitada; un conductor
  // necesita la marca explícita de verificación.
  assert.equal(isVerified(usuario({ role: 'passenger' })), true);
  assert.equal(isVerified(usuario({ role: 'passenger', accountStatus: 'DISABLED' })), false);
  assert.equal(isVerified(usuario({ role: 'driver' })), false);
  assert.equal(isVerified(usuario({ role: 'driver', isVerified: true })), true);
});

test('los predicados coinciden con los de la pantalla anterior', () => {
  const casos = [];
  for (const role of ['driver', 'passenger']) {
    for (const status of [undefined, 'SUSPENDED', 'AVAILABLE']) {
      for (const accountStatus of ['ACTIVE', 'DISABLED']) {
        for (const verificado of [true, false, undefined]) {
          casos.push(usuario({ role, status, accountStatus, isVerified: verificado }));
        }
      }
    }
  }
  for (const caso of casos) {
    assert.equal(isSuspended(caso), refSuspendido(caso), JSON.stringify(caso));
    assert.equal(isVerified(caso), refVerificado(caso), JSON.stringify(caso));
  }
});

// ------------------------------------------------------------ interpretación

test('sin parámetros no se filtra nada', () => {
  const filtros = parseUserFilters({});
  assert.equal(filtros.roles, null);
  assert.equal(filtros.status, 'all');
  assert.equal(filtros.search, '');
});

test('el rol admite varios valores separados por coma', () => {
  // La pantalla de usuarios pide conductores y pasajeros a la vez, nunca
  // administradores.
  assert.deepEqual(parseUserFilters({ role: 'driver,passenger' }).roles, ['driver', 'passenger']);
  assert.deepEqual(parseUserFilters({ role: 'driver' }).roles, ['driver']);
  assert.deepEqual(parseUserFilters({ role: ' driver , passenger ' }).roles, ['driver', 'passenger']);
  assert.equal(parseUserFilters({ role: 'all' }).roles, null);
});

test('un rol o un estado inventado se rechaza en vez de ignorarse', () => {
  // Ignorarlo devolvería un listado más amplio del que se pidió, que en un
  // panel de administración es lo contrario de lo que se espera.
  for (const malo of ['inventado', 'driver,inventado', ',', 'DRIVER']) {
    assert.throws(() => parseUserFilters({ role: malo }), /INVALID_ROLE/, `rol ${malo}`);
  }
  for (const malo of ['inventado', 'SUSPENDED', 'todos']) {
    assert.throws(() => parseUserFilters({ status: malo }), /INVALID_STATUS/, `estado ${malo}`);
  }
});

test('la búsqueda se normaliza y tiene longitud máxima', () => {
  assert.equal(parseUserFilters({ search: '  ANA  ' }).search, 'ana');
  assert.equal(parseUserFilters({ search: '' }).search, '');
  assert.doesNotThrow(() => parseUserFilters({ search: 'a'.repeat(MAX_SEARCH_LENGTH) }));
  assert.throws(() => parseUserFilters({ search: 'a'.repeat(MAX_SEARCH_LENGTH + 1) }), /SEARCH_TOO_LONG/);
});

// ------------------------------------------------------------------ filtros

test('filtra por rol', () => {
  const usuarios = [
    usuario({ id: 'a', role: 'driver' }),
    usuario({ id: 'b', role: 'passenger' }),
    usuario({ id: 'c', role: 'admin' })
  ];
  assert.deepEqual(filterUsers(usuarios, parseUserFilters({ role: 'driver' })).map(u => u.id), ['a']);
  assert.deepEqual(
    filterUsers(usuarios, parseUserFilters({ role: 'driver,passenger' })).map(u => u.id),
    ['a', 'b'],
    'administración queda fuera cuando no se pide'
  );
  assert.equal(filterUsers(usuarios, parseUserFilters({})).length, 3);
});

test('los tres estados son excluyentes entre sí', () => {
  const usuarios = [
    usuario({ id: 'suspendido', role: 'driver', status: 'SUSPENDED', isVerified: true }),
    usuario({ id: 'verificado', role: 'driver', isVerified: true }),
    usuario({ id: 'pendiente', role: 'driver', isVerified: false })
  ];
  for (const [estado, esperado] of [
    ['suspended', ['suspendido']],
    ['verified', ['verificado']],
    ['pending', ['pendiente']],
    ['all', ['suspendido', 'verificado', 'pendiente']]
  ]) {
    assert.deepEqual(
      filterUsers(usuarios, parseUserFilters({ status: estado })).map(u => u.id),
      esperado, `estado ${estado}`
    );
  }
});

test('la suspensión manda por encima de la verificación', () => {
  // Un conductor verificado y suspendido aparece solo bajo «suspendido».
  const suspendidoVerificado = usuario({ id: 'x', role: 'driver', isVerified: true, status: 'SUSPENDED' });
  assert.equal(matchesUserFilters(suspendidoVerificado, parseUserFilters({ status: 'verified' })), false);
  assert.equal(matchesUserFilters(suspendidoVerificado, parseUserFilters({ status: 'pending' })), false);
  assert.equal(matchesUserFilters(suspendidoVerificado, parseUserFilters({ status: 'suspended' })), true);
});

test('la búsqueda cubre nombre, correo, teléfono, identificador y placa', () => {
  const conductor = usuario({
    id: 'driver_98765', role: 'driver', firstName: 'Carlos', lastName: 'Perez',
    email: 'carlos@ejemplo.com', phone: '+584149998877', vehiclePlate: 'AB123CD'
  });
  for (const consulta of ['carlos', 'PEREZ', 'carlos perez', 'ejemplo.com', '9998877', '98765', 'ab123cd']) {
    assert.equal(
      matchesUserFilters(conductor, parseUserFilters({ search: consulta })), true,
      `debía encontrarse con "${consulta}"`
    );
  }
  assert.equal(matchesUserFilters(conductor, parseUserFilters({ search: 'zzz' })), false);
});

test('los filtros se combinan, no se sustituyen', () => {
  const usuarios = [
    usuario({ id: 'a', role: 'driver', firstName: 'Ana', isVerified: true }),
    usuario({ id: 'b', role: 'driver', firstName: 'Ana', isVerified: false }),
    usuario({ id: 'c', role: 'passenger', firstName: 'Ana' })
  ];
  const filtros = parseUserFilters({ role: 'driver', status: 'verified', search: 'ana' });
  assert.deepEqual(filterUsers(usuarios, filtros).map(u => u.id), ['a']);
});

test('el filtrado conserva el orden de alta', () => {
  // Reordenar cambiaría lo que ve quien ya usa la pantalla.
  const usuarios = ['e', 'd', 'c', 'b', 'a'].map(id => usuario({ id, role: 'driver', isVerified: true }));
  assert.deepEqual(
    filterUsers(usuarios, parseUserFilters({ role: 'driver' })).map(u => u.id),
    ['e', 'd', 'c', 'b', 'a']
  );
});

test('entradas ausentes o vacías no rompen el filtrado', () => {
  assert.deepEqual(filterUsers(null, parseUserFilters({})), []);
  assert.deepEqual(filterUsers(undefined, parseUserFilters({})), []);
  assert.equal(matchesUserFilters(null, parseUserFilters({})), false);
  assert.equal(matchesUserFilters(undefined, parseUserFilters({})), false);
  // Un usuario sin ninguno de los campos de búsqueda no revienta.
  assert.equal(matchesUserFilters({ id: 'x' }, parseUserFilters({ search: 'ana' })), false);
  assert.equal(matchesUserFilters({ id: 'x' }, parseUserFilters({})), true);
});

test('cada usuario se examina una sola vez, sea cual sea el tamano', () => {
  // Se cuentan accesos en lugar de cronometrar: el reloj de pared es ruido
  // cuando la suite corre en paralelo, y lo que importa aqui es la forma del
  // coste, no su velocidad. Un filtrado cuadratico leeria cada registro
  // muchas veces.
  const construir = n => Array.from({ length: n }, (_, i) => {
    const base = {
      role: i % 5 === 0 ? 'driver' : 'passenger',
      firstName: `Nombre${i}`, lastName: 'Prueba',
      email: `persona${i}@ejemplo.com`, phone: '+584140000000',
      accountStatus: 'ACTIVE', isVerified: true, vehiclePlate: `PL${i}`
    };
    let lecturas = 0;
    return Object.defineProperty(base, 'id', {
      get() { lecturas += 1; return `u_${i}`; },
      enumerable: true
    }) && Object.defineProperty(base, '__lecturas', {
      get: () => lecturas, enumerable: false
    });
  });

  const filtros = parseUserFilters({ role: 'driver', status: 'all', search: 'nombre9' });
  for (const n of [100, 1000, 5000]) {
    const datos = construir(n);
    filterUsers(datos, filtros);
    const totalLecturas = datos.reduce((suma, item) => suma + item.__lecturas, 0);
    // Como mucho una lectura de `id` por registro y por filtro que lo mire.
    assert.ok(
      totalLecturas <= n * 3,
      `con ${n} usuarios hubo ${totalLecturas} lecturas: el coste no es lineal`
    );
  }
});

// ------------------------------------------------- resolucion por identificador

test('se pueden resolver personas concretas por identificador', () => {
  const usuarios = ['a', 'b', 'c', 'd'].map(id => usuario({ id, role: 'driver', isVerified: true }));
  const filtros = parseUserFilters({ ids: 'b,d' });
  assert.deepEqual(filterUsers(usuarios, filtros).map(u => u.id), ['b', 'd']);
});

test('un identificador desconocido simplemente no aparece', () => {
  const usuarios = [usuario({ id: 'a' })];
  assert.deepEqual(filterUsers(usuarios, parseUserFilters({ ids: 'a,inexistente' })).map(u => u.id), ['a']);
  assert.deepEqual(filterUsers(usuarios, parseUserFilters({ ids: 'inexistente' })), []);
});

test('el numero de identificadores tiene tope', () => {
  // Sin tope, este filtro seria otra forma de pedir el listado entero.
  const muchos = Array.from({ length: MAX_IDS }, (_, i) => `u_${i}`).join(',');
  assert.doesNotThrow(() => parseUserFilters({ ids: muchos }));
  assert.throws(() => parseUserFilters({ ids: `${muchos},uno_mas` }), /TOO_MANY_IDS/);
  assert.throws(() => parseUserFilters({ ids: ',' }), /INVALID_IDS/);
});

test('la resolucion por identificador se combina con los demas filtros', () => {
  const usuarios = [
    usuario({ id: 'a', role: 'driver', isVerified: true }),
    usuario({ id: 'b', role: 'passenger' })
  ];
  // Pedir 'a' y 'b' filtrando por conductor devuelve solo 'a': los filtros se
  // acumulan, no se sustituyen.
  assert.deepEqual(
    filterUsers(usuarios, parseUserFilters({ ids: 'a,b', role: 'driver' })).map(u => u.id),
    ['a']
  );
});

test('sin el parametro no se filtra por identificador', () => {
  const usuarios = [usuario({ id: 'a' }), usuario({ id: 'b' })];
  assert.equal(parseUserFilters({}).ids, null);
  assert.equal(filterUsers(usuarios, parseUserFilters({})).length, 2);
  assert.equal(filterUsers(usuarios, parseUserFilters({ ids: '' })).length, 2);
});

// -------------------------------------------------- estado operativo

test('filtra conductores por su estado operativo', () => {
  const conductores = [
    usuario({ id: 'a', role: 'driver', status: 'AVAILABLE' }),
    usuario({ id: 'b', role: 'driver', status: 'BUSY' }),
    usuario({ id: 'c', role: 'driver', status: 'OFFLINE' }),
    usuario({ id: 'd', role: 'driver', status: 'IN_TRIP' })
  ];
  const enServicio = parseUserFilters({ role: 'driver', driverStatus: 'AVAILABLE,ONLINE,BUSY,IN_TRIP' });
  assert.deepEqual(filterUsers(conductores, enServicio).map(u => u.id), ['a', 'b', 'd']);
});

test('ONLINE se admite porque sobrevive en clientes antiguos', () => {
  const antiguo = usuario({ id: 'a', role: 'driver', status: 'ONLINE' });
  const filtros = parseUserFilters({ driverStatus: 'AVAILABLE,ONLINE' });
  assert.equal(matchesUserFilters(antiguo, filtros), true);
});

test('sin estado registrado no se cuenta como operativo', () => {
  // Afirmar que esta en servicio quien no ha reportado nada seria inventarselo.
  const sinEstado = usuario({ id: 'a', role: 'driver' });
  delete sinEstado.status;
  assert.equal(matchesUserFilters(sinEstado, parseUserFilters({ driverStatus: 'AVAILABLE' })), false);
});

test('un estado operativo inventado se rechaza', () => {
  for (const malo of ['inventado', 'AVAILABLE,inventado', 'available', ',']) {
    assert.throws(
      () => parseUserFilters({ driverStatus: malo }),
      /INVALID_DRIVER_STATUS/, `estado ${malo}`
    );
  }
});

test('sin el parametro no se filtra por estado operativo', () => {
  const conductores = [
    usuario({ id: 'a', role: 'driver', status: 'AVAILABLE' }),
    usuario({ id: 'b', role: 'driver', status: 'OFFLINE' })
  ];
  assert.equal(parseUserFilters({}).driverStatus, null);
  assert.equal(filterUsers(conductores, parseUserFilters({})).length, 2);
});

test('con mas de cien conductores, los operativos siguen saliendo todos', () => {
  // Es el defecto que motiva el cambio: acotar por «los cien primeros» dejaba
  // fuera del mapa a los de alta mas reciente, aunque estuvieran en la calle.
  const flota = Array.from({ length: 260 }, (_, i) => usuario({
    id: `d_${i}`, role: 'driver',
    // Solo uno de cada diez esta en servicio, y los ultimos tambien.
    status: i % 10 === 0 || i > 240 ? 'AVAILABLE' : 'OFFLINE'
  }));
  const enServicio = filterUsers(flota, parseUserFilters({ role: 'driver', driverStatus: 'AVAILABLE,ONLINE,BUSY,IN_TRIP' }));

  const esperados = flota.filter(d => d.status === 'AVAILABLE').map(d => d.id);
  assert.deepEqual(enServicio.map(d => d.id), esperados);
  assert.ok(enServicio.some(d => Number(d.id.slice(2)) > 100), 'deben salir tambien los posteriores al centesimo');
});
