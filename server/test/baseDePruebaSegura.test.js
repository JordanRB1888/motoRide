import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluarBaseDePrueba, motivoParaSaltarse, VARIABLE_DE_TEST } from './helpers/baseDePruebaSegura.js';
import { esBaseLocal, evaluarIdentidadDeBaseDeDatos } from '../domain/databaseIdentity.ts';

/**
 * TEST-DB-SAFETY-FIX — que ninguna suite escriba en produccion.
 *
 * Todo es puro: ninguna prueba de aqui se conecta a nada. Eso es justo lo que
 * permite comprobar «la URI apunta a produccion» sin apuntar a produccion.
 *
 * Las identidades son inventadas. Aqui no aparece ninguna credencial real.
 */

const PRODUCCION = 'prodrefabcdefghijkl';
const PRUEBAS = 'testrefabcdefghijkl';

/** Una URI de pooler de Supabase, que es como se conecta este proyecto. */
const pooler = ref => `postgresql://postgres.${ref}:clave@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;

// ---------------------------------------------------------------------------
// La colisión que motivó esta fase
// ---------------------------------------------------------------------------

test('TEST y PRODUCCIÓN en el mismo proyecto: bloqueado ANTES de escribir', () => {
  // El error que más daño hace: alguien pega la URI de producción en
  // TEST_DATABASE_URL. Aunque además la declare como Test, se rechaza.
  const entorno = {
    [VARIABLE_DE_TEST]: PRODUCCION,
    PRODUCTION_DATABASE_URL: pooler(PRODUCCION)
  };

  const { puedeEscribir, veredicto } = evaluarBaseDePrueba(pooler(PRODUCCION), entorno);
  assert.equal(puedeEscribir, false);
  assert.equal(veredicto, 'RECHAZO_ES_PRODUCCION');

  // Y no se salta en silencio: una configuración peligrosa tiene que gritar.
  assert.throws(
    () => motivoParaSaltarse(pooler(PRODUCCION), entorno),
    /PRODUCCION/,
    'un destino de producción debe LANZAR, no saltarse'
  );
});

test('la identidad de producción se deduce sola del entorno', () => {
  // Sin declarar nada en la lista explícita: basta con que PRODUCTION_DATABASE_URL
  // esté configurada en este mismo entorno para que su proyecto quede vetado.
  const { veredicto } = evaluarBaseDePrueba(pooler(PRODUCCION), {
    [VARIABLE_DE_TEST]: PRODUCCION,
    PRODUCTION_DATABASE_URL: pooler(PRODUCCION)
  });
  assert.equal(veredicto, 'RECHAZO_ES_PRODUCCION');

  // Lo mismo si la base real viaja en DATABASE_URL.
  const otro = evaluarBaseDePrueba(pooler(PRODUCCION), {
    [VARIABLE_DE_TEST]: PRODUCCION,
    DATABASE_URL: pooler(PRODUCCION)
  });
  assert.equal(otro.veredicto, 'RECHAZO_ES_PRODUCCION');
});

// ---------------------------------------------------------------------------
// Lo que SÍ se permite
// ---------------------------------------------------------------------------

test('un proyecto de pruebas dedicado y declarado: permitido', () => {
  const { puedeEscribir, veredicto } = evaluarBaseDePrueba(pooler(PRUEBAS), {
    [VARIABLE_DE_TEST]: PRUEBAS,
    PRODUCTION_DATABASE_URL: pooler(PRODUCCION)
  });
  assert.equal(puedeEscribir, true);
  assert.equal(veredicto, 'APTO_PARA_ESCRITURA');
  assert.equal(motivoParaSaltarse(pooler(PRUEBAS), {
    [VARIABLE_DE_TEST]: PRUEBAS,
    PRODUCTION_DATABASE_URL: pooler(PRODUCCION)
  }), null);
});

test('un PostgreSQL de esta máquina: permitido sin declarar nada', () => {
  // El desechable que levanta `postgresActiveTrip`: nace vacío, vive en un
  // directorio temporal y se borra. No hay proyecto remoto que confundir.
  for (const uri of [
    'postgresql://plus58:plus58@127.0.0.1:55432/plus58test',
    'postgresql://postgres@localhost:5432/postgres'
  ]) {
    const { puedeEscribir, veredicto } = evaluarBaseDePrueba(uri, {
      PRODUCTION_DATABASE_URL: pooler(PRODUCCION)
    });
    assert.equal(puedeEscribir, true, uri);
    assert.equal(veredicto, 'APTO_BASE_LOCAL', uri);
  }

  assert.equal(esBaseLocal('postgresql://x@127.0.0.1:5432/y'), true);
  assert.equal(esBaseLocal(pooler(PRUEBAS)), false, 'un pooler remoto NO es local');
});

// ---------------------------------------------------------------------------
// Lo que se salta, sin gritar
// ---------------------------------------------------------------------------

test('sin base de pruebas, la suite se salta con su motivo', () => {
  for (const vacio of [undefined, '', '   ']) {
    const { puedeEscribir, veredicto } = evaluarBaseDePrueba(vacio, {});
    assert.equal(puedeEscribir, false);
    assert.equal(veredicto, 'SIN_URI');
  }
  assert.match(motivoParaSaltarse(undefined, {}), /TEST_DATABASE_URL/);
});

test('una base remota sin declarar NO se usa, pero tampoco revienta', () => {
  // No saber dónde se va a escribir basta para no escribir. No es peligroso
  // como tener producción delante, así que se salta en vez de lanzar.
  const entorno = { PRODUCTION_DATABASE_URL: pooler(PRODUCCION) };
  const { puedeEscribir, veredicto } = evaluarBaseDePrueba(pooler(PRUEBAS), entorno);
  assert.equal(puedeEscribir, false);
  assert.equal(veredicto, 'RECHAZO_SIN_DECLARACION');
  assert.match(motivoParaSaltarse(pooler(PRUEBAS), entorno), /RECHAZO_SIN_DECLARACION/);
});

test('declarar un proyecto y apuntar a otro: no se escribe', () => {
  const { veredicto } = evaluarBaseDePrueba(pooler('terceroabcdefghijkl'), {
    [VARIABLE_DE_TEST]: PRUEBAS,
    PRODUCTION_DATABASE_URL: pooler(PRODUCCION)
  });
  assert.equal(veredicto, 'RECHAZO_IDENTIDAD_DESCONOCIDA');
});

// ---------------------------------------------------------------------------
// Que nadie escriba sin pasar por aquí
// ---------------------------------------------------------------------------

test('TODA suite que escriba en PostgreSQL pasa por el guardián', async () => {
  const fs = await import('node:fs');
  const path = (await import('node:path')).default;
  const { fileURLToPath } = await import('node:url');

  const directorio = path.dirname(fileURLToPath(import.meta.url));
  const ficheros = fs.readdirSync(directorio).filter(n => n.endsWith('.test.js'));

  let revisados = 0;
  for (const nombre of ficheros) {
    const contenido = fs.readFileSync(path.join(directorio, nombre), 'utf8');
    // Se busca quien la LEE, no quien la nombra: `postgresActiveTrip` la
    // menciona en un comentario justamente para explicar que NO la usa.
    if (!/process\.env\.TEST_DATABASE_URL/.test(contenido)) continue;
    revisados += 1;

    const protegida = contenido.includes('baseDePruebaSegura')
      || contenido.includes('evaluarIdentidadDeBaseDeDatos')
      || contenido.includes('walletTestDb');
    assert.ok(
      protegida,
      `${nombre} lee TEST_DATABASE_URL sin pasar por el guardián de identidad`
    );
  }

  // Si un día nadie la lee, esta prueba dejaría de comprobar nada sin avisar.
  assert.ok(revisados > 0, 'ninguna suite lee TEST_DATABASE_URL: ¿sigue haciendo falta esta guarda?');
});

test('el orden de las comprobaciones es el que salva la base', () => {
  // Producción se deniega ANTES de mirar la declaración. Si se mirara al revés,
  // declarar producción como Test la convertiría en escribible.
  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: pooler(PRODUCCION),
    refTestDeclarado: PRODUCCION,
    refsDeProduccion: [PRODUCCION]
  });
  assert.equal(resultado.veredicto, 'RECHAZO_ES_PRODUCCION');
  assert.equal(resultado.puedeEscribir, false);

  // Y el dominio NO hace excepcion con lo local: su regla sigue siendo «no
  // saber donde escribes basta para no escribir». La excepcion vive en el
  // helper de pruebas, que es quien sabe que esa base la acaba de crear.
  assert.equal(
    evaluarIdentidadDeBaseDeDatos({
      uriObservada: 'postgresql://a@localhost:5432/b',
      refTestDeclarado: null,
      refsDeProduccion: [PRODUCCION]
    }).puedeEscribir,
    false
  );
});
