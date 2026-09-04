import {
  VARIABLE_DE_TEST,
  esBaseLocal,
  evaluarIdentidadDeBaseDeDatos,
  identidadesDeProduccionDelEntorno
} from '../../domain/databaseIdentity.ts';

/**
 * La puerta por la que pasa TODA prueba que vaya a escribir en PostgreSQL.
 *
 * POR QUE EXISTE
 *
 * `domain/databaseIdentity.ts` ya sabia decidir si un destino es seguro, pero
 * solo lo consultaba el script de migracion del monedero. Las suites que
 * escriben --`postgresFinalValidation`, el monedero, las tasas-- cogian
 * `TEST_DATABASE_URL` y escribian directamente. Si alguien pega ahi la URI de
 * produccion, esas suites la usan sin preguntar: borran filas, crean usuarios y
 * recorren un ciclo de viaje entero.
 *
 * Esto no reimplementa la decision. La CABLEA.
 *
 * LOS DOS COMPORTAMIENTOS, Y POR QUE SON DISTINTOS
 *
 *   PRODUCCION detectada  ->  LANZA
 *   cualquier otro motivo ->  se salta con explicacion
 *
 * Faltar la declaracion o no tener base de pruebas es una configuracion
 * incompleta: la prueba no puede correr y se salta, como siempre. Pero tener
 * produccion en `TEST_DATABASE_URL` es una configuracion PELIGROSA, y saltarse
 * en silencio dejaria el error ahi, esperando al dia que alguien quite el
 * guardian. Por eso esa rama grita.
 */

/** Lo que hay que declarar para escribir en una base remota de pruebas. */
export { VARIABLE_DE_TEST };

/**
 * Decide si esta suite puede escribir en la URI que le han dado.
 *
 * @param {string|undefined} uri  normalmente `process.env.TEST_DATABASE_URL`
 * @param {Record<string,string|undefined>} [entorno]
 * @returns {{puedeEscribir: boolean, veredicto: string, motivo: string}}
 *   `motivo` esta listo para pasarselo a `t.skip()`. Nunca lleva secretos.
 */
export function evaluarBaseDePrueba(uri, entorno = process.env) {
  const limpia = typeof uri === 'string' ? uri.trim() : '';
  if (limpia === '') {
    return {
      puedeEscribir: false,
      veredicto: 'SIN_URI',
      motivo: 'requiere TEST_DATABASE_URL (PostgreSQL de pruebas)'
    };
  }

  // UNA BASE DE ESTA MISMA MAQUINA SE ACEPTA SIN DECLARAR NADA
  //
  // El PostgreSQL desechable que levanta `postgresActiveTrip` nace vacio, vive
  // en un directorio temporal y se borra al terminar: no hay proyecto remoto
  // que confundir con produccion, y exigirle una identidad declarada lo dejaria
  // fuera sin ganar nada.
  //
  // La excepcion vive AQUI y no en `evaluarIdentidadDeBaseDeDatos` a proposito:
  // la regla de aquel es «no saber donde escribes basta para no escribir», y
  // quien la usa cuenta con ella. Que una base local sea segura lo sabe quien
  // la acaba de crear, no un modulo generico.
  if (esBaseLocal(limpia)) {
    return {
      puedeEscribir: true,
      veredicto: 'APTO_BASE_LOCAL',
      motivo: 'la base corre en esta máquina: no puede ser producción'
    };
  }

  const resultado = evaluarIdentidadDeBaseDeDatos({
    uriObservada: limpia,
    refTestDeclarado: entorno[VARIABLE_DE_TEST],
    refsDeProduccion: identidadesDeProduccionDelEntorno(entorno)
  });

  return {
    puedeEscribir: resultado.puedeEscribir,
    veredicto: resultado.veredicto,
    motivo: `${resultado.veredicto}: ${resultado.detalle}`
  };
}

/**
 * Igual que la anterior, pero LANZA si el destino es produccion.
 *
 * Es la que deben llamar las suites. Devuelve el motivo del salto cuando
 * simplemente no hay base utilizable, y revienta cuando hay una peligrosa.
 *
 * @returns {string|null} `null` si se puede escribir; si no, el motivo del salto.
 */
export function motivoParaSaltarse(uri, entorno = process.env) {
  const { puedeEscribir, veredicto, motivo } = evaluarBaseDePrueba(uri, entorno);
  if (puedeEscribir) return null;

  if (veredicto === 'RECHAZO_ES_PRODUCCION') {
    throw new Error(
      'TEST_DATABASE_URL apunta a una base de PRODUCCION. Estas pruebas escriben ' +
      'y borran filas, asi que no se ejecutan. Apunta esa variable a un proyecto ' +
      `de pruebas dedicado y declara su identidad en ${VARIABLE_DE_TEST}.`
    );
  }

  return motivo;
}
