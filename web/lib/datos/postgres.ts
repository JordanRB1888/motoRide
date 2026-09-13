import { randomUUID } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";
import { CA_SUPABASE } from "./supabase-ca";
import type {
  EstadoLead,
  EstadoWaitlist,
  LeadAliado,
  RegistroWaitlist,
  RepositorioWeb,
  ResultadoAlta,
  RolWaitlist,
  ZonaWaitlist,
} from "./tipos";

/**
 * El almacén de verdad: Postgres, en el proyecto Supabase **exclusivo de la web**.
 *
 * POR QUÉ ESTE FICHERO ES EL ÚNICO QUE SABE SQL
 *
 * Las rutas hablan con `RepositorioWeb`. Aquí se traduce ese contrato a SQL y
 * nada más: ni validación, ni política de negocio, ni decisiones sobre qué
 * responder. Si mañana la base cambia de sitio, cambia este fichero y nadie se
 * entera.
 *
 * TRES COSAS QUE CONDICIONAN CADA CONSULTA DE AQUÍ
 *
 * 1. Se conecta por el **Transaction Pooler** (Supavisor en modo transacción).
 *    Ahí una conexión de servidor se recicla entre transacciones, así que no
 *    existe el estado de sesión: nada de `PREPARE`, nada de `SET` de arranque,
 *    nada de temporales. `pg` sólo usa sentencias preparadas con nombre si se le
 *    pasa `name` en la consulta — aquí no se le pasa nunca, y por eso funciona.
 *
 * 2. Corre **sin servidor**. Cada petición puede caer en una instancia recién
 *    creada, así que el pool se guarda en `globalThis` para reaprovecharlo
 *    mientras la instancia viva, y se mantiene diminuto: muchas instancias por
 *    tres conexiones cada una agotan el pooler enseguida.
 *
 * 3. Las carreras se resuelven **en la base, no en JavaScript**. Dos altas
 *    simultáneas del mismo correo, dos clics en el mismo enlace de confirmación
 *    o dos bajas seguidas son el caso normal, no el raro: la gente pulsa dos
 *    veces y los clientes de correo pre-visitan los enlaces. Cada operación
 *    sensible es UNA sentencia atómica con su guarda en el `WHERE` y su
 *    `RETURNING`, que es lo que hace que la segunda no pueda deshacer la primera.
 */

const ESQUEMA = "public";
const TABLA_ESPERA = `${ESQUEMA}.lista_de_espera`;
const TABLA_ALIADOS = `${ESQUEMA}.contactos_aliados`;
const TABLA_INTENTOS = `${ESQUEMA}.intentos_web`;

/* Los envíos de correo no se cuentan por ventana: sólo interesa el último. Se
   guardan todos en el mismo cubo, y `to_timestamp(0)` —el año 1970— deja claro
   al leerlo que ese cubo no representa ningún instante real. */
const CUBO_ENVIOS = "to_timestamp(0)";

/* Columnas explícitas y nunca `SELECT *`: si un día falta una, esto falla en la
   primera consulta con el nombre exacto de lo que falta, en vez de devolver un
   registro a medias que se descubre tres pantallas más allá. */
const COLUMNAS_ESPERA = `id, email, rol, zona, estado, token_confirmacion,
  token_expira_en, token_baja, confirmado_en, baja_en, origen, ip_hash,
  creado_en, actualizado_en`;

const COLUMNAS_ALIADO = `id, nombre, negocio, telefono, email, municipio,
  tipo_comercio, mensaje, consentimiento_en, estado, ip_hash, creado_en`;

type FilaEspera = {
  id: string;
  email: string;
  rol: string | null;
  zona: string | null;
  estado: string;
  token_confirmacion: string | null;
  token_expira_en: Date | string | null;
  token_baja: string | null;
  confirmado_en: Date | string | null;
  baja_en: Date | string | null;
  origen: string | null;
  ip_hash: string | null;
  creado_en: Date | string;
  actualizado_en: Date | string;
};

type FilaAliado = {
  id: string;
  nombre: string;
  negocio: string;
  telefono: string;
  email: string;
  municipio: string;
  tipo_comercio: string;
  mensaje: string | null;
  consentimiento_en: Date | string;
  estado: string;
  ip_hash: string | null;
  creado_en: Date | string;
};

/**
 * Fecha de Postgres a texto ISO.
 *
 * El contrato habla en ISO porque es lo que viaja bien por JSON y lo que
 * entienden las plantillas de correo. `pg` devuelve `Date` para `timestamptz`,
 * pero acepta también columnas de texto: se contemplan las dos para que un
 * detalle del esquema no reviente la aplicación.
 */
function aIso(valor: Date | string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString();
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? String(valor) : fecha.toISOString();
}

function aRegistro(fila: FilaEspera): RegistroWaitlist {
  return {
    id: String(fila.id),
    email: fila.email,
    rol: (fila.rol as RolWaitlist | null) ?? null,
    zona: (fila.zona as ZonaWaitlist | null) ?? null,
    estado: fila.estado as EstadoWaitlist,
    tokenConfirmacion: fila.token_confirmacion,
    tokenExpiraEn: aIso(fila.token_expira_en),
    tokenBaja: fila.token_baja,
    confirmadoEn: aIso(fila.confirmado_en),
    bajaEn: aIso(fila.baja_en),
    origen: fila.origen,
    ipHash: fila.ip_hash,
    creadoEn: aIso(fila.creado_en) ?? new Date(0).toISOString(),
    actualizadoEn: aIso(fila.actualizado_en) ?? new Date(0).toISOString(),
  };
}

function aLead(fila: FilaAliado): LeadAliado {
  return {
    id: String(fila.id),
    nombre: fila.nombre,
    negocio: fila.negocio,
    telefono: fila.telefono,
    email: fila.email,
    municipio: fila.municipio,
    tipoComercio: fila.tipo_comercio,
    mensaje: fila.mensaje,
    consentimientoEn: aIso(fila.consentimiento_en) ?? new Date(0).toISOString(),
    estado: fila.estado as EstadoLead,
    ipHash: fila.ip_hash,
    creadoEn: aIso(fila.creado_en) ?? new Date(0).toISOString(),
  };
}

/* El pool vive en `globalThis` y no en el módulo: en desarrollo el recargado en
   caliente reevalúa el módulo a cada guardado, y un pool nuevo por recarga deja
   conexiones colgando hasta agotar el pooler. */
declare global {
  var __poolWeb: Pool | undefined;
}

export function poolWeb(url: string = process.env.WEB_DATABASE_URL ?? ""): Pool {
  if (typeof window !== "undefined") {
    /* Un error de importación, no una credencial filtrada: si este módulo llega
       al navegador es que alguien importó el almacén desde un componente de
       cliente, y hay que enterarse en la primera ejecución. */
    throw new Error("ALMACEN_WEB_SOLO_EN_SERVIDOR");
  }
  if (!url) throw new Error("WEB_DATABASE_URL_AUSENTE");
  if (globalThis.__poolWeb) return globalThis.__poolWeb;

  /* TLS verificado de verdad, contra la CA de Supabase.
     El pooler presenta un certificado firmado por la autoridad propia de
     Supabase, que Node no conoce. La salida fácil sería `rejectUnauthorized:
     false`, y convierte el cifrado en decoración: cifra contra quien sea,
     incluido quien se ponga en medio. Anclando la raíz se comprueban las dos
     cosas que importan — la cadena y el nombre del servidor.
     Si la cadena de conexión trae su propio `sslmode`, `pg` le da prioridad
     sobre esto: quien quiera relajarlo tiene que escribirlo, no heredarlo por
     descuido. */
  const pool = new Pool({
    connectionString: url,
    ssl: { ca: CA_SUPABASE, rejectUnauthorized: true },
    /* Tres conexiones por instancia. El pooler de Supabase reparte un número
       finito entre TODAS las instancias vivas; ser generoso aquí es quedarse sin
       conexiones en el primer pico. */
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    /* Reloj del lado del cliente. `statement_timeout` viajaría en los parámetros
       de arranque, que el pooler en modo transacción no garantiza; esto no
       depende del servidor. */
    query_timeout: 10_000,
    allowExitOnIdle: true,
    application_name: "mas58express-web",
  });

  /* Sin este oyente, una conexión ociosa que el pooler cierra por su cuenta
     emite un `error` sin manejar y **tumba el proceso entero**. Con él, el pool
     descarta esa conexión y sigue. */
  pool.on("error", (error) => {
    console.error("[almacen-web] conexión ociosa perdida:", error.message);
  });

  globalThis.__poolWeb = pool;
  return pool;
}

/** Para las pruebas y para los guiones: deja el proceso sin conexiones abiertas. */
export async function cerrarPoolWeb(): Promise<void> {
  const pool = globalThis.__poolWeb;
  globalThis.__poolWeb = undefined;
  if (pool) await pool.end();
}

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/** Cada cuántas escrituras se barren los intentos viejos. */
const CADA_CUANTO_SE_BARRE = 100;
let escrituras = 0;

export function crearRepositorioPostgres(
  url: string = process.env.WEB_DATABASE_URL ?? "",
): RepositorioWeb {
  const pool = poolWeb(url);

  /* Sin `name`: ver la nota (1) de la cabecera. Todas las consultas de este
     fichero pasan por aquí para que esa garantía sea estructural y no dependa de
     que nadie se despiste. */
  async function consulta<F extends QueryResultRow>(
    texto: string,
    valores: unknown[] = [],
  ): Promise<F[]> {
    const resultado = await pool.query<F>(texto, valores);
    return resultado.rows;
  }

  async function porEmail(email: string): Promise<RegistroWaitlist | null> {
    const filas = await consulta<FilaEspera>(
      `SELECT ${COLUMNAS_ESPERA} FROM ${TABLA_ESPERA} WHERE email = $1`,
      [email],
    );
    return filas[0] ? aRegistro(filas[0]) : null;
  }

  async function barrerIntentosViejos(): Promise<void> {
    escrituras += 1;
    if (escrituras % CADA_CUANTO_SE_BARRE !== 0) return;
    try {
      /* Veinticuatro horas cubre de sobra la ventana más larga que se usa (una
         hora). Lo que queda más atrás no protege de nada y sólo engorda la tabla.
         Se mira `ultimo_en` y no `ventana`: las filas de envíos viven en el cubo
         de 1970 y con `ventana` se borrarían todas en el primer barrido. */
      await consulta(
        `DELETE FROM ${TABLA_INTENTOS} WHERE ultimo_en < now() - interval '24 hours'`,
      );
    } catch (error) {
      /* Que la limpieza falle no puede tumbar un alta: es mantenimiento. */
      console.error("[almacen-web] barrido de intentos:", (error as Error).message);
    }
  }

  return {
    async altaEnEspera(datos): Promise<ResultadoAlta> {
      /* Idempotencia en la base y no en el código: comprobar antes «¿existe?» y
         luego insertar deja una ventana en la que dos peticiones simultáneas
         comprueban las dos que no existe. `ON CONFLICT` lo resuelve el índice
         único, que es el único sitio donde la comprobación y la inserción son el
         mismo acto.

         POR QUÉ EL `DO UPDATE` LLEVA ESA CONDICIÓN Y NO OTRA

         Con `DO NOTHING` esto tenía un callejón sin salida: al caducar un enlace
         se pone `token_confirmacion = NULL`, así que quien volviera a apuntarse
         recibía un correo con el enlace VACÍO —`?token=`—, que la ruta rechaza
         siempre. Esa dirección no podía confirmarse nunca más.

         Pero refrescar el testigo SIEMPRE abriría otro agujero: cualquiera
         podría escribir la dirección de otra persona en el formulario y anular
         el enlace que esa persona tiene sin abrir en su buzón. Por eso el testigo
         sólo se renueva si el que había ya no sirve —no existe o venció— y sólo
         si la inscripción sigue viva. A quien ya confirmó no se le toca, y a
         quien se dio de baja no se le resucita: en esos dos casos la condición no
         se cumple, no se actualiza nada, y se devuelve la fila tal como está. */
      const insertadas = await consulta<FilaEspera & { creado: boolean }>(
        `INSERT INTO ${TABLA_ESPERA}
           (id, email, rol, zona, estado, token_confirmacion, token_expira_en,
            token_baja, origen, ip_hash, creado_en, actualizado_en)
         VALUES ($1, $2, $3, $4, 'pendiente', $5, $6::timestamptz, $7, $8, $9, now(), now())
         ON CONFLICT (email) DO UPDATE
            SET token_confirmacion = EXCLUDED.token_confirmacion,
                token_expira_en    = EXCLUDED.token_expira_en,
                estado             = 'pendiente',
                actualizado_en     = now()
          WHERE lista_de_espera.estado IN ('pendiente', 'caducado')
            AND (lista_de_espera.token_confirmacion IS NULL
                 OR lista_de_espera.token_expira_en IS NULL
                 OR lista_de_espera.token_expira_en < now())
         RETURNING (xmax = 0) AS creado, ${COLUMNAS_ESPERA}`,
        [
          randomUUID(),
          datos.email,
          datos.rol,
          datos.zona,
          datos.tokenConfirmacion,
          datos.tokenExpiraEn,
          datos.tokenBaja,
          datos.origen,
          datos.ipHash,
        ],
      );

      /* `xmax = 0` sólo es cierto en una fila recién insertada: en una
         actualizada lleva el identificador de la transacción que la tocó. Es la
         única forma de distinguir el alta nueva de la renovación, porque las dos
         devuelven fila. */
      if (insertadas[0]) {
        return { creado: insertadas[0].creado === true, registro: aRegistro(insertadas[0]) };
      }

      /* Cero filas significa que el correo ya estaba y no había nada que
         renovar: o ya confirmó, o se dio de baja, o su enlace sigue vivo. Casi
         siempre se lee a la primera; el reintento cubre el instante en que la
         otra petición insertó pero todavía no ha confirmado su transacción, y su
         fila aún no es visible para esta. */
      for (let intento = 0; intento < 3; intento += 1) {
        const existente = await porEmail(datos.email);
        if (existente) return { creado: false, registro: existente };
        await esperar(50 * (intento + 1));
      }

      /* Antes devolver un error que inventar un registro: quien llama decide si
         manda correo mirando este resultado. */
      throw new Error("ALTA_SIN_RESULTADO");
    },

    async buscarPorTokenConfirmacion(token) {
      if (!token) return null;
      const filas = await consulta<FilaEspera>(
        `SELECT ${COLUMNAS_ESPERA} FROM ${TABLA_ESPERA} WHERE token_confirmacion = $1`,
        [token],
      );
      return filas[0] ? aRegistro(filas[0]) : null;
    },

    async buscarPorTokenBaja(token) {
      if (!token) return null;
      const filas = await consulta<FilaEspera>(
        `SELECT ${COLUMNAS_ESPERA} FROM ${TABLA_ESPERA} WHERE token_baja = $1`,
        [token],
      );
      return filas[0] ? aRegistro(filas[0]) : null;
    },

    async confirmarEnEspera(id) {
      /* La guarda `token_confirmacion IS NOT NULL` es la que quema el testigo de
         forma atómica: la segunda confirmación simultánea no encuentra nada que
         actualizar y devuelve `null`. Y `estado <> 'baja'` impide que un enlace
         viejo resucite a quien se dio de baja. */
      const filas = await consulta<FilaEspera>(
        `UPDATE ${TABLA_ESPERA}
            SET estado = 'confirmado',
                confirmado_en = now(),
                actualizado_en = now(),
                token_confirmacion = NULL,
                token_expira_en = NULL
          WHERE id = $1
            AND token_confirmacion IS NOT NULL
            AND estado <> 'baja'
          RETURNING ${COLUMNAS_ESPERA}`,
        [id],
      );
      return filas[0] ? aRegistro(filas[0]) : null;
    },

    async caducarEnEspera(id) {
      const filas = await consulta<FilaEspera>(
        `UPDATE ${TABLA_ESPERA}
            SET estado = 'caducado',
                actualizado_en = now(),
                token_confirmacion = NULL
          WHERE id = $1 AND estado = 'pendiente'
          RETURNING ${COLUMNAS_ESPERA}`,
        [id],
      );
      return filas[0] ? aRegistro(filas[0]) : null;
    },

    async darDeBajaEnEspera(id) {
      /* El testigo de baja **no** se borra: quien vuelva a pulsar el enlace tiene
         que poder ver «ya estabas fuera» en vez de «este enlace no vale». */
      const filas = await consulta<FilaEspera>(
        `UPDATE ${TABLA_ESPERA}
            SET estado = 'baja',
                baja_en = now(),
                actualizado_en = now()
          WHERE id = $1 AND estado <> 'baja'
          RETURNING ${COLUMNAS_ESPERA}`,
        [id],
      );
      return filas[0] ? aRegistro(filas[0]) : null;
    },

    async ultimoEnvioDeConfirmacion(email) {
      /* El registro de envíos se indexa por el identificador de la fila, no por
         la dirección: así el correo electrónico sigue existiendo en UN solo
         sitio de la base, que es el que se borra cuando alguien ejerce su
         derecho de supresión.
         Aquí no se cuenta nada, sólo se anota el último, así que todos los
         envíos de una dirección comparten el cubo `epoch`. */
      const filas = await consulta<{ ultimo_en: Date | string | null }>(
        `SELECT ultimo_en
           FROM ${TABLA_INTENTOS}
          WHERE clave = 'envio:' || (SELECT id::text FROM ${TABLA_ESPERA} WHERE email = $1)
            AND ventana = ${CUBO_ENVIOS}`,
        [email],
      );
      return aIso(filas[0]?.ultimo_en ?? null);
    },

    async registrarEnvioDeConfirmacion(email, cuando) {
      await consulta(
        `INSERT INTO ${TABLA_INTENTOS} (clave, ventana, n, ultimo_en)
         SELECT 'envio:' || id::text, ${CUBO_ENVIOS}, 1, $2::timestamptz
           FROM ${TABLA_ESPERA} WHERE email = $1
         ON CONFLICT (clave, ventana) DO UPDATE
            SET n = intentos_web.n + 1,
                ultimo_en = EXCLUDED.ultimo_en`,
        [email, cuando],
      );
    },

    async crearLeadAliado(datos) {
      const filas = await consulta<FilaAliado>(
        `INSERT INTO ${TABLA_ALIADOS}
           (id, nombre, negocio, telefono, email, municipio, tipo_comercio,
            mensaje, consentimiento_en, estado, ip_hash, creado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, 'nuevo', $10, now())
         RETURNING ${COLUMNAS_ALIADO}`,
        [
          randomUUID(),
          datos.nombre,
          datos.negocio,
          datos.telefono,
          datos.email,
          datos.municipio,
          datos.tipoComercio,
          datos.mensaje,
          datos.consentimientoEn,
          datos.ipHash,
        ],
      );
      if (!filas[0]) throw new Error("LEAD_NO_CREADO");
      return aLead(filas[0]);
    },

    async contarIntentos(clave, ventanaMs, ahora) {
      /* LA CUENTA SALE DE LA ESCRITURA, NO DE UNA LECTURA APARTE.
         Ésta es la diferencia entre un límite que se cumple y uno que sólo lo
         parece. Contar filas —aunque el `INSERT` vaya en la misma sentencia— no
         sirve: cada sentencia ve la instantánea que tomó al empezar, así que
         cincuenta peticiones a la vez cuentan las cincuenta cero intentos
         previos y pasan las cincuenta. No hay nada que las serialice.
         `ON CONFLICT ... DO UPDATE` sí: toma cerrojo sobre la fila, la segunda
         petición espera a la primera, y `RETURNING n` devuelve el valor ya
         incrementado. Dos simultáneas reciben 1 y 2, nunca 1 y 1.

         OJO AL REUTILIZAR UNA CLAVE: el cubo sale de dividir el instante entre
         el tamaño de la ventana, así que la misma clave con dos límites de
         tamaño distinto lleva dos cuentas separadas. Es lo correcto —dos límites
         distintos son dos límites—, pero conviene saberlo. */
      const ventana = new Date(Math.floor(ahora / ventanaMs) * ventanaMs).toISOString();
      const filas = await consulta<{ n: number }>(
        `INSERT INTO ${TABLA_INTENTOS} (clave, ventana, n, ultimo_en)
         VALUES ($1, $2::timestamptz, 1, $3::timestamptz)
         ON CONFLICT (clave, ventana) DO UPDATE
            SET n = intentos_web.n + 1,
                ultimo_en = EXCLUDED.ultimo_en
         RETURNING n`,
        [clave, ventana, new Date(ahora).toISOString()],
      );
      void barrerIntentosViejos();
      return Number(filas[0]?.n ?? 1);
    },
  };
}
