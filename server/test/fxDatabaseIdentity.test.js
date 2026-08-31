import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VARIABLE_DE_PRODUCCION,
  VARIABLE_DE_TEST,
  evaluarIdentidadDeBaseDeDatos,
  extraerIdentidadDeProyecto,
  huellaDeIdentidad,
  identidadesDeProduccionDelEntorno
} from '../domain/databaseIdentity.ts';

/**
 * FX-BCV-1A — el guard de identidad de base de datos.
 *
 * Todo es puro: ninguna prueba se conecta a nada. Eso es justamente lo que
 * permite comprobar el caso que más importa —«la URI apunta a Producción»— sin
 * tener que apuntar de verdad a Producción para probarlo.
 *
 * Las URIs de aquí son inventadas. Ninguna credencial real aparece en este
 * fichero ni puede aparecer: el guard trabaja con identidades de proyecto.
 */

const PRODUCCION = 'prodxxxxxxxxxxxxxxxx';
const PRUEBAS = 'testyyyyyyyyyyyyyyyy';
const AJENO = 'otrozzzzzzzzzzzzzzzz';

const uriDe = ref => `postgresql://postgres.${ref}:contrasena@aws-0-region.pooler.supabase.com:6543/postgres`;

// ---------------------------------------------------------------------------
// De dónde sale la identidad
// ---------------------------------------------------------------------------

test('la identidad se extrae del usuario en conexiones por el pooler', () => {
  assert.equal(extraerIdentidadDeProyecto(uriDe(PRUEBAS)), PRUEBAS);
});

test('la identidad se extrae del host en conexión directa', () => {
  assert.equal(
    extraerIdentidadDeProyecto(`postgresql://postgres:x@db.${PRUEBAS}.supabase.co:5432/postgres`),
    PRUEBAS
  );
});

test('una identidad indeterminable devuelve null, no una suposición', () => {
  assert.equal(extraerIdentidadDeProyecto(''), null);
  assert.equal(extraerIdentidadDeProyecto('no es una uri'), null);
  assert.equal(extraerIdentidadDeProyecto('postgresql://postgres@localhost:5432/postgres'), null);
});

// ---------------------------------------------------------------------------
// LOS TRES CASOS OBLIGATORIOS
// ---------------------------------------------------------------------------

test('identidad de PRODUCCIÓN → se rechaza antes de escribir', () => {
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uriDe(PRODUCCION),
    refTestDeclarado: PRUEBAS,
    refsDeProduccion: [PRODUCCION]
  });
  assert.equal(resultado.veredicto, 'RECHAZO_ES_PRODUCCION');
  assert.equal(resultado.puedeEscribir, false);
});

test('identidad DESCONOCIDA → se rechaza antes de escribir', () => {
  // Ni es el Test declarado ni está en la lista de producción. No saber dónde
  // se va a escribir es motivo suficiente para no escribir.
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uriDe(AJENO),
    refTestDeclarado: PRUEBAS,
    refsDeProduccion: [PRODUCCION]
  });
  assert.equal(resultado.veredicto, 'RECHAZO_IDENTIDAD_DESCONOCIDA');
  assert.equal(resultado.puedeEscribir, false);
});

test('identidad de TEST correcta → se permite', () => {
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uriDe(PRUEBAS),
    refTestDeclarado: PRUEBAS,
    refsDeProduccion: [PRODUCCION]
  });
  assert.equal(resultado.veredicto, 'APTO_PARA_ESCRITURA');
  assert.equal(resultado.puedeEscribir, true);
});

// ---------------------------------------------------------------------------
// Fallar cerrado
// ---------------------------------------------------------------------------

test('sin declaración de Test NO se escribe', () => {
  // No hay valor por defecto y no hay «si no se sabe, será Test».
  for (const declarado of [undefined, null, '', '   ']) {
    const resultado = evaluarIdentidadDeBaseDeDatos({
      uriObservada: uriDe(PRUEBAS),
      refTestDeclarado: declarado
    });
    assert.equal(resultado.veredicto, 'RECHAZO_SIN_DECLARACION');
    assert.equal(resultado.puedeEscribir, false);
  }
});

test('una identidad ilegible NO se escribe', () => {
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: 'postgresql://postgres@localhost:5432/postgres',
    refTestDeclarado: PRUEBAS
  });
  assert.equal(resultado.veredicto, 'RECHAZO_IDENTIDAD_ILEGIBLE');
  assert.equal(resultado.puedeEscribir, false);
});

test('PRODUCCIÓN declarada como Test SIGUE rechazándose', () => {
  // El error de configuración que más daño hace: alguien copia la URI de
  // Producción en TEST_DATABASE_URL y además la declara como Test. Que la
  // denegación se evalúe ANTES que la coincidencia es lo que salva la base.
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uriDe(PRODUCCION),
    refTestDeclarado: PRODUCCION,
    refsDeProduccion: [PRODUCCION]
  });
  assert.equal(resultado.veredicto, 'RECHAZO_ES_PRODUCCION');
  assert.equal(resultado.puedeEscribir, false);
});

test('la coincidencia no distingue mayúsculas ni espacios sobrantes', () => {
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uriDe(PRUEBAS),
    refTestDeclarado: `  ${PRUEBAS.toUpperCase()}  `
  });
  assert.equal(resultado.veredicto, 'APTO_PARA_ESCRITURA');
});

test('sólo APTO permite escribir; ningún otro veredicto lo hace', () => {
  const entradas = [
    { uriObservada: uriDe(PRODUCCION), refTestDeclarado: PRUEBAS, refsDeProduccion: [PRODUCCION] },
    { uriObservada: uriDe(AJENO), refTestDeclarado: PRUEBAS },
    { uriObservada: uriDe(PRUEBAS), refTestDeclarado: '' },
    { uriObservada: 'basura', refTestDeclarado: PRUEBAS }
  ];
  for (const entrada of entradas) {
    const resultado = evaluarIdentidadDeBaseDeDatos(entrada);
    assert.equal(resultado.puedeEscribir, resultado.veredicto === 'APTO_PARA_ESCRITURA');
    assert.equal(resultado.puedeEscribir, false);
  }
});

// ---------------------------------------------------------------------------
// Sin puerta trasera, sin secretos
// ---------------------------------------------------------------------------

test('no existe ninguna variable que salte el guard', async () => {
  // Si hubiera una, sería lo primero que alguien pondría en un script un
  // viernes por la tarde. Se comprueba de verdad: con el entorno lleno de
  // nombres plausibles, el veredicto no cambia.
  const previas = {};
  const sospechosas = [
    'SKIP_DB_GUARD', 'FORCE_DB_WRITE', 'ALLOW_PRODUCTION_WRITE',
    'FX_SKIP_IDENTITY_CHECK', 'CI', 'NODE_ENV'
  ];
  for (const clave of sospechosas) {
    previas[clave] = process.env[clave];
    process.env[clave] = '1';
  }
  try {
    const resultado = evaluarIdentidadDeBaseDeDatos({
      uriObservada: uriDe(PRODUCCION),
      refTestDeclarado: PRUEBAS,
      refsDeProduccion: [PRODUCCION]
    });
    assert.equal(resultado.veredicto, 'RECHAZO_ES_PRODUCCION');
    assert.equal(resultado.puedeEscribir, false);
  } finally {
    for (const clave of sospechosas) {
      if (previas[clave] === undefined) delete process.env[clave];
      else process.env[clave] = previas[clave];
    }
  }
});

test('el resultado no contiene la URI, el usuario ni la contraseña', () => {
  const uri = uriDe(PRODUCCION);
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uri,
    refTestDeclarado: PRUEBAS,
    refsDeProduccion: [PRODUCCION]
  });
  const texto = JSON.stringify(resultado);
  assert.equal(texto.includes('contrasena'), false, 'nunca la contraseña');
  assert.equal(texto.includes(uri), false, 'nunca la URI');
  assert.equal(texto.includes('pooler.supabase.com'), false, 'ni siquiera el host');
  assert.equal(texto.includes(PRODUCCION), false, 'ni el identificador completo');
});

test('la huella identifica sin revelar', () => {
  const huella = huellaDeIdentidad(PRODUCCION);
  assert.ok(huella.length < PRODUCCION.length);
  assert.equal(huella.includes('…'), true);
  assert.equal(huellaDeIdentidad(''), '(vacío)');
  // Dos proyectos distintos dan huellas distintas: sirve para diagnosticar.
  assert.notEqual(huellaDeIdentidad(PRODUCCION), huellaDeIdentidad(PRUEBAS));
});

// ---------------------------------------------------------------------------
// Las identidades de producción se deducen solas
// ---------------------------------------------------------------------------

test('la identidad de Producción se deduce de DATABASE_URL si está presente', () => {
  // Si la base real está configurada en este mismo entorno, queda denegada sin
  // que nadie tenga que acordarse de declararla.
  const identidades = identidadesDeProduccionDelEntorno({
    DATABASE_URL: uriDe(PRODUCCION)
  });
  assert.deepEqual(identidades, [PRODUCCION]);
});

test('la lista explícita y las deducidas se combinan sin duplicar', () => {
  const identidades = identidadesDeProduccionDelEntorno({
    [VARIABLE_DE_PRODUCCION]: `${PRODUCCION}, ${AJENO}`,
    DATABASE_URL: uriDe(PRODUCCION)
  });
  assert.deepEqual([...identidades].sort(), [PRODUCCION, AJENO].sort());
});

test('un entorno sin nada configurado no deniega nada, y eso NO abre la puerta', () => {
  // Sin identidades de producción conocidas, la protección que queda es la
  // declaración positiva: sigue haciendo falta que el destino sea exactamente
  // el Test declarado.
  assert.deepEqual(identidadesDeProduccionDelEntorno({}), []);

  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: uriDe(PRODUCCION),
    refTestDeclarado: PRUEBAS,
    refsDeProduccion: []
  });
  assert.equal(resultado.veredicto, 'RECHAZO_IDENTIDAD_DESCONOCIDA');
  assert.equal(resultado.puedeEscribir, false);
});

test('los nombres de las variables son estables', () => {
  // Cambiarlos sin darse cuenta desactivaría el guard en silencio: sin la
  // variable de Test, las pruebas se saltan en vez de fallar, y nadie se entera.
  assert.equal(VARIABLE_DE_TEST, 'FX_TEST_DB_PROJECT_REF');
  assert.equal(VARIABLE_DE_PRODUCCION, 'FX_PRODUCTION_DB_PROJECT_REFS');
});
