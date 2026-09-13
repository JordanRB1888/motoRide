import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { crearRepositorioPostgres, cerrarPoolWeb, poolWeb } from "@/lib/datos/postgres";
import type { RepositorioWeb } from "@/lib/datos/tipos";
import { nuevoTestigo, VIGENCIA_CONFIRMACION_MS } from "@/lib/seguridad/testigos";
import { LIMITES, superaLimite } from "@/lib/seguridad/limites";

/**
 * El adaptador de Postgres contra la base de Supabase de VERDAD.
 *
 * Las pruebas de `unidad.spec.ts` ejercitan el mismo contrato contra el almacén
 * de memoria, y eso demuestra que la lógica es correcta — pero no demuestra que
 * los datos sobrevivan, que el índice único exista, ni que dos peticiones
 * simultáneas no se pisen. Eso sólo lo prueba la base real, porque la
 * concurrencia y la persistencia son propiedades del servidor, no del código.
 *
 * Se saltan enteras si no hay `WEB_DATABASE_URL`: en una máquina recién clonada
 * la suite sigue pasando sin credenciales de nadie.
 *
 * TODO lo que escriben lleva el prefijo `qa.web.` y se borra al final. Si algo
 * reventara a mitad, el barrido del cierre lo recoge igual, porque borra por
 * prefijo y no por la lista de lo que creyó haber creado.
 */

function cargarEnvLocal() {
  try {
    const texto = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const linea of texto.split(/\r?\n/)) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;
      const corte = limpia.indexOf("=");
      if (corte < 1) continue;
      const clave = limpia.slice(0, corte).trim();
      if (!(clave in process.env)) process.env[clave] = limpia.slice(corte + 1).trim();
    }
  } catch {
    /* No hay fichero: se usa el entorno tal cual. */
  }
}

cargarEnvLocal();

const HAY_BASE = Boolean(process.env.WEB_DATABASE_URL);
const PREFIJO = "qa.web.";
const correo = (que: string) => `${PREFIJO}${que}@example.com`;

const futuro = () => new Date(Date.now() + VIGENCIA_CONFIRMACION_MS).toISOString();
const pasado = () => new Date(Date.now() - 60_000).toISOString();

type DatosAlta = Parameters<RepositorioWeb["altaEnEspera"]>[0];

function altaDePrueba(email: string, extra: Partial<DatosAlta> = {}): DatosAlta {
  return {
    email,
    rol: "pasajero",
    zona: "maracaibo",
    origen: "qa",
    ipHash: "qa-huella-ficticia",
    tokenConfirmacion: nuevoTestigo(),
    tokenExpiraEn: futuro(),
    tokenBaja: nuevoTestigo(),
    ...extra,
  };
}

test.describe("adaptador Postgres contra Supabase", () => {
  test.skip(!HAY_BASE, "sin WEB_DATABASE_URL: no hay base contra la que certificar");
  /* En serie y en un solo proceso: el barrido final borra por prefijo, y con
     varios procesos a la vez uno podría llevarse las filas que otro está usando. */
  test.describe.configure({ mode: "serial" });

  const repo = () => crearRepositorioPostgres();

  test.afterAll(async () => {
    if (!HAY_BASE) return;
    const pool = poolWeb();
    await pool.query(`DELETE FROM public.intentos_web WHERE clave LIKE $1`, [`${PREFIJO}%`]);
    /* Los intentos de envío se indexan por el id de la fila, así que hay que
       barrerlos ANTES de borrar las filas que los nombran. */
    await pool.query(
      `DELETE FROM public.intentos_web
        WHERE clave IN (SELECT 'envio:' || id::text FROM public.lista_de_espera WHERE email LIKE $1)`,
      [`${PREFIJO}%`],
    );
    await pool.query(`DELETE FROM public.lista_de_espera WHERE email LIKE $1`, [`${PREFIJO}%`]);
    await pool.query(`DELETE FROM public.contactos_aliados WHERE email LIKE $1`, [`${PREFIJO}%`]);
    await cerrarPoolWeb();
  });

  // ---- A y B: escribir y volver a leer -----------------------------------

  test("A+B · un alta se guarda y se vuelve a leer con todos sus campos", async () => {
    const email = correo("alta");
    const datos = altaDePrueba(email);
    const alta = await repo().altaEnEspera(datos);

    expect(alta.creado).toBe(true);
    expect(alta.registro.email).toBe(email);
    expect(alta.registro.estado).toBe("pendiente");

    /* Se lee con OTRO objeto repositorio: si esto pasara por un caché de
       proceso, el dato podría no haber tocado la base nunca. */
    const leido = await repo().buscarPorTokenConfirmacion(datos.tokenConfirmacion);
    expect(leido).not.toBeNull();
    expect(leido!.id).toBe(alta.registro.id);
    expect(leido!.rol).toBe("pasajero");
    expect(leido!.zona).toBe("maracaibo");
    expect(leido!.origen).toBe("qa");
    expect(leido!.ipHash).toBe("qa-huella-ficticia");
    expect(leido!.tokenBaja).toBe(datos.tokenBaja);
    expect(new Date(leido!.creadoEn).getTime()).toBeGreaterThan(0);
  });

  // ---- C: el duplicado no crea una segunda fila --------------------------

  test("C · el mismo correo dos veces no crea dos filas", async () => {
    const email = correo("duplicado");
    const primera = await repo().altaEnEspera(altaDePrueba(email));
    const segunda = await repo().altaEnEspera(altaDePrueba(email));

    expect(primera.creado).toBe(true);
    expect(segunda.creado).toBe(false);
    expect(segunda.registro.id).toBe(primera.registro.id);
    /* El segundo intento NO pisa los testigos del primero: el enlace que ya
       salió por correo tiene que seguir valiendo. */
    expect(segunda.registro.tokenConfirmacion).toBe(primera.registro.tokenConfirmacion);

    const { rows } = await poolWeb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.lista_de_espera WHERE email = $1`,
      [email],
    );
    expect(rows[0].n).toBe(1);
  });

  test("C-bis · cinco altas SIMULTÁNEAS del mismo correo dejan una sola fila", async () => {
    const email = correo("carrera");
    const r = repo();
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => r.altaEnEspera(altaDePrueba(email))),
    );

    /* Esta es la prueba que el almacén de memoria no puede dar: sin el índice
       único, cinco peticiones a la vez comprueban las cinco que el correo no
       existe y crean cinco filas. */
    const { rows } = await poolWeb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.lista_de_espera WHERE email = $1`,
      [email],
    );
    expect(rows[0].n).toBe(1);

    const ids = new Set(resultados.map((x) => x.registro.id));
    expect(ids.size).toBe(1);
    expect(resultados.filter((x) => x.creado)).toHaveLength(1);
  });

  test("C-ter · con el enlace VIVO, reapuntarse no lo cambia", async () => {
    /* Si cada envío del formulario rotara el testigo, cualquiera podría escribir
       la dirección de otra persona y anular el enlace que esa persona tiene sin
       abrir en su buzón. */
    const email = correo("testigo-vivo");
    const datos = altaDePrueba(email);
    await repo().altaEnEspera(datos);

    const segunda = await repo().altaEnEspera(altaDePrueba(email));
    expect(segunda.creado).toBe(false);
    expect(segunda.registro.tokenConfirmacion).toBe(datos.tokenConfirmacion);
    expect(await repo().buscarPorTokenConfirmacion(datos.tokenConfirmacion)).not.toBeNull();
  });

  test("C-quater · tras caducar, volver a apuntarse da un enlace que SÍ funciona", async () => {
    /* El callejón sin salida: al caducar se pone el testigo a NULL, así que con
       `DO NOTHING` el correo de reenvío llevaba «?token=» —vacío— y esa dirección
       no podía confirmarse nunca más, por muchas veces que se reapuntara. */
    const email = correo("resucita");
    const primera = altaDePrueba(email, { tokenExpiraEn: pasado() });
    const alta = await repo().altaEnEspera(primera);
    await repo().caducarEnEspera(alta.registro.id);

    const { rows: muerta } = await poolWeb().query<{ estado: string; token_confirmacion: string | null }>(
      `SELECT estado, token_confirmacion FROM public.lista_de_espera WHERE email = $1`,
      [email],
    );
    expect(muerta[0].estado).toBe("caducado");
    expect(muerta[0].token_confirmacion).toBeNull();

    const segunda = altaDePrueba(email);
    const renovada = await repo().altaEnEspera(segunda);

    expect(renovada.creado).toBe(false);
    expect(renovada.registro.estado).toBe("pendiente");
    expect(renovada.registro.tokenConfirmacion).toBe(segunda.tokenConfirmacion);
    // Y el enlace nuevo lleva de verdad a la fila.
    const porToken = await repo().buscarPorTokenConfirmacion(segunda.tokenConfirmacion);
    expect(porToken?.id).toBe(alta.registro.id);
    // El testigo de baja NO se renueva: el enlace que ya salió por correo vale.
    expect(renovada.registro.tokenBaja).toBe(primera.tokenBaja);
  });

  test("C-quinquies · a quien confirmó o se dio de baja no se le toca el estado", async () => {
    const confirmado = correo("ya-confirmado");
    const altaC = await repo().altaEnEspera(altaDePrueba(confirmado));
    await repo().confirmarEnEspera(altaC.registro.id);
    const reintentoC = await repo().altaEnEspera(altaDePrueba(confirmado));
    expect(reintentoC.creado).toBe(false);
    expect(reintentoC.registro.estado).toBe("confirmado");
    expect(reintentoC.registro.tokenConfirmacion).toBeNull();

    const dadoDeBaja = correo("ya-baja");
    const altaB = await repo().altaEnEspera(altaDePrueba(dadoDeBaja));
    await repo().darDeBajaEnEspera(altaB.registro.id);
    const reintentoB = await repo().altaEnEspera(altaDePrueba(dadoDeBaja));
    /* Reapuntarse NO puede resucitar a quien se fue: tendría que volver a pedir
       el alta desde cero, y el formulario no es el sitio para deshacer una baja
       ajena. */
    expect(reintentoB.registro.estado).toBe("baja");
  });

  // ---- D y E: confirmar y quemar el testigo ------------------------------

  test("D+E · pendiente → confirmado, y el testigo queda consumido", async () => {
    const email = correo("confirma");
    const datos = altaDePrueba(email);
    const alta = await repo().altaEnEspera(datos);
    expect(alta.registro.estado).toBe("pendiente");

    const confirmado = await repo().confirmarEnEspera(alta.registro.id);
    expect(confirmado).not.toBeNull();
    expect(confirmado!.estado).toBe("confirmado");
    expect(confirmado!.confirmadoEn).not.toBeNull();
    expect(confirmado!.tokenConfirmacion).toBeNull();
    expect(confirmado!.tokenExpiraEn).toBeNull();

    // El enlace del correo ya no lleva a ninguna parte: vale UNA vez.
    expect(await repo().buscarPorTokenConfirmacion(datos.tokenConfirmacion)).toBeNull();
    // Y el testigo de baja sigue vivo: por ahí se tiene que poder salir siempre.
    expect(await repo().buscarPorTokenBaja(datos.tokenBaja)).not.toBeNull();
  });

  test("E-bis · dos confirmaciones simultáneas: sólo una surte efecto", async () => {
    const email = correo("doble-confirma");
    const alta = await repo().altaEnEspera(altaDePrueba(email));
    const r = repo();

    const [uno, dos] = await Promise.all([
      r.confirmarEnEspera(alta.registro.id),
      r.confirmarEnEspera(alta.registro.id),
    ]);

    /* Una gana y la otra se encuentra el testigo ya quemado. Que la segunda
       devuelva `null` no es un error: es la guarda funcionando. */
    const efectivas = [uno, dos].filter(Boolean);
    expect(efectivas).toHaveLength(1);

    const { rows } = await poolWeb().query<{ estado: string; confirmado_en: Date }>(
      `SELECT estado, confirmado_en FROM public.lista_de_espera WHERE email = $1`,
      [email],
    );
    expect(rows[0].estado).toBe("confirmado");
    expect(rows[0].confirmado_en).not.toBeNull();
  });

  test("E-ter · un testigo caducado no confirma: caduca", async () => {
    const email = correo("caducado");
    const datos = altaDePrueba(email, { tokenExpiraEn: pasado() });
    const alta = await repo().altaEnEspera(datos);

    const leido = await repo().buscarPorTokenConfirmacion(datos.tokenConfirmacion);
    expect(new Date(leido!.tokenExpiraEn!).getTime()).toBeLessThan(Date.now());

    const caducado = await repo().caducarEnEspera(alta.registro.id);
    expect(caducado!.estado).toBe("caducado");
    expect(caducado!.tokenConfirmacion).toBeNull();
    expect(await repo().buscarPorTokenConfirmacion(datos.tokenConfirmacion)).toBeNull();
  });

  // ---- F y G: baja, y baja otra vez --------------------------------------

  test("F+G · la baja funciona y repetirla no rompe nada", async () => {
    const email = correo("baja");
    const datos = altaDePrueba(email);
    const alta = await repo().altaEnEspera(datos);

    const baja = await repo().darDeBajaEnEspera(alta.registro.id);
    expect(baja!.estado).toBe("baja");
    expect(baja!.bajaEn).not.toBeNull();

    /* El testigo de baja NO se borra: quien vuelva a pulsar el enlace tiene que
       ver «ya estabas fuera», no «este enlace no vale». */
    const otraVez = await repo().buscarPorTokenBaja(datos.tokenBaja);
    expect(otraVez).not.toBeNull();
    expect(otraVez!.estado).toBe("baja");

    // Segunda baja: sin efecto, sin excepción, sin cambiar la fecha.
    const repetida = await repo().darDeBajaEnEspera(alta.registro.id);
    expect(repetida).toBeNull();

    const { rows } = await poolWeb().query<{ baja_en: Date }>(
      `SELECT baja_en FROM public.lista_de_espera WHERE email = $1`,
      [email],
    );
    expect(new Date(rows[0].baja_en).toISOString()).toBe(baja!.bajaEn);
  });

  test("G-bis · quien se dio de baja no puede ser reconfirmado con un enlace viejo", async () => {
    const email = correo("baja-y-confirma");
    const datos = altaDePrueba(email);
    const alta = await repo().altaEnEspera(datos);
    await repo().darDeBajaEnEspera(alta.registro.id);

    // Alguien conserva el correo de confirmación y pulsa el enlace después.
    const intento = await repo().confirmarEnEspera(alta.registro.id);
    expect(intento).toBeNull();

    const { rows } = await poolWeb().query<{ estado: string }>(
      `SELECT estado FROM public.lista_de_espera WHERE email = $1`,
      [email],
    );
    expect(rows[0].estado).toBe("baja");
  });

  // ---- H: el límite de peticiones vive en la base ------------------------

  /* Bien dentro del cubo: la ventana es fija, y un `ahora` pegado al borde
     repartiría los intentos entre dos cubos y haría la prueba caprichosa. */
  const dentroDelCubo = (ventanaMs = 60_000) =>
    Math.floor(Date.now() / ventanaMs) * ventanaMs + Math.floor(ventanaMs / 4);

  test("H · el límite persiste en la base, no en el proceso", async () => {
    const clave = `${PREFIJO}limite-${Date.now()}`;
    /* La MISMA ventana que usan las rutas. Mezclar tamaños de ventana sobre una
       clave no tendría sentido aquí: el cubo se calcula a partir del tamaño, así
       que cada límite lleva su propio contador —ver la prueba H-quinquies—. */
    const limite = LIMITES.waitlistPorIp;
    const ahora = dentroDelCubo(limite.ventanaMs);

    const cuentas: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      /* Un repositorio NUEVO en cada vuelta: así se parece a lo que pasa de
         verdad, donde cada petición puede caer en una instancia recién creada. */
      cuentas.push(
        await crearRepositorioPostgres().contarIntentos(clave, limite.ventanaMs, ahora + i),
      );
    }
    expect(cuentas).toEqual([1, 2, 3, 4, 5, 6]);

    // Y está escrito en la tabla, que es lo que se quería demostrar.
    const { rows } = await poolWeb().query<{ n: number }>(
      `SELECT n FROM public.intentos_web WHERE clave = $1`,
      [clave],
    );
    expect(rows[0].n).toBe(6);

    // El umbral de verdad, tal y como lo usan las rutas: el séptimo se pasa de 5.
    expect(await superaLimite(repo(), clave, limite, ahora + 10)).toBe(true);
  });

  test("H-quinquies · dos límites sobre la misma clave no comparten contador", async () => {
    /* Consecuencia de la ventana fija, y queda escrita aquí para que no
       sorprenda: el cubo sale de dividir el instante entre el tamaño de la
       ventana, así que una clave sometida a dos límites distintos lleva dos
       cuentas separadas. Es lo correcto —dos límites distintos son dos límites—,
       pero hay que saberlo antes de reutilizar una clave. */
    const clave = `${PREFIJO}dos-ventanas-${Date.now()}`;
    const r = repo();

    expect(await r.contarIntentos(clave, 60_000, dentroDelCubo(60_000))).toBe(1);
    expect(await r.contarIntentos(clave, 60_000, dentroDelCubo(60_000))).toBe(2);
    // Otra ventana, otro cubo, otra cuenta.
    expect(await r.contarIntentos(clave, 3_600_000, dentroDelCubo(3_600_000))).toBe(1);
  });

  test("H-0 · una ráfaga SIMULTÁNEA no se salta el límite", async () => {
    /* La prueba que de verdad importa, y la que la primera versión de este
       adaptador suspendía. Contando filas —aunque el INSERT fuera en la misma
       sentencia— diez peticiones a la vez leen las diez «cero intentos previos»
       y devuelven las diez un 1: el límite no llega a activarse nunca. Con la
       fila-contador cada una espera a la anterior y recibe un número distinto. */
    const clave = `${PREFIJO}rafaga-${Date.now()}`;
    const ahora = dentroDelCubo();
    const r = repo();

    const cuentas = await Promise.all(
      Array.from({ length: 10 }, () => r.contarIntentos(clave, 60_000, ahora)),
    );

    expect([...cuentas].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("H-bis · lo que queda fuera de la ventana deja de contar", async () => {
    const clave = `${PREFIJO}ventana-${Date.now()}`;
    const ahora = dentroDelCubo();
    const r = repo();

    await r.contarIntentos(clave, 60_000, ahora - 3 * 60_000);
    await r.contarIntentos(clave, 60_000, ahora - 2 * 60_000);
    // Los dos anteriores quedan fuera de la ventana de un minuto.
    expect(await r.contarIntentos(clave, 60_000, ahora)).toBe(1);
  });

  test("H-ter · las claves no se mezclan entre sí", async () => {
    const a = `${PREFIJO}clave-a-${Date.now()}`;
    const b = `${PREFIJO}clave-b-${Date.now()}`;
    const ahora = dentroDelCubo();
    const r = repo();
    await r.contarIntentos(a, 60_000, ahora);
    await r.contarIntentos(a, 60_000, ahora);
    expect(await r.contarIntentos(b, 60_000, ahora)).toBe(1);
  });

  test("H-quater · el registro de envíos también sobrevive", async () => {
    const email = correo("envios");
    await repo().altaEnEspera(altaDePrueba(email));

    expect(await repo().ultimoEnvioDeConfirmacion(email)).toBeNull();

    const cuando = new Date().toISOString();
    await repo().registrarEnvioDeConfirmacion(email, cuando);

    const ultimo = await repo().ultimoEnvioDeConfirmacion(email);
    expect(ultimo).not.toBeNull();
    expect(Math.abs(new Date(ultimo!).getTime() - new Date(cuando).getTime())).toBeLessThan(1000);

    /* Y no guarda la dirección: la clave es el identificador de la fila. Si el
       correo apareciera aquí, habría que borrarlo en dos sitios el día que
       alguien ejerza su derecho de supresión. */
    const { rows } = await poolWeb().query<{ clave: string }>(
      `SELECT clave FROM public.intentos_web WHERE clave LIKE 'envio:%'`,
    );
    for (const fila of rows) expect(fila.clave).not.toContain("@");
  });

  // ---- I y J: comercios aliados ------------------------------------------

  test("I+J · un lead de comercio se guarda y nace en estado «nuevo»", async () => {
    const email = correo("aliado");
    const consentimiento = new Date().toISOString();

    const lead = await repo().crearLeadAliado({
      nombre: "Comercio De Prueba",
      negocio: "Bodega QA",
      telefono: "04120000000",
      email,
      municipio: "mara",
      tipoComercio: "bodega",
      mensaje: "fila temporal de certificación",
      consentimientoEn: consentimiento,
      ipHash: "qa-huella-ficticia",
    });

    expect(lead.id).toBeTruthy();
    expect(lead.estado).toBe("nuevo");
    expect(lead.consentimientoEn).toBe(consentimiento);

    const { rows } = await poolWeb().query<{
      estado: string;
      consentimiento_en: Date;
      tipo_comercio: string;
    }>(
      `SELECT estado, consentimiento_en, tipo_comercio FROM public.contactos_aliados WHERE email = $1`,
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].estado).toBe("nuevo");
    expect(rows[0].tipo_comercio).toBe("bodega");
    /* Se guarda CUÁNDO consintió, no un sí/no: el día que haya que demostrarlo,
       un booleano no prueba nada. */
    expect(new Date(rows[0].consentimiento_en).toISOString()).toBe(consentimiento);
  });

  // ---- Compatibilidad con el pooler de transacciones ---------------------

  test("el pooler no ve sentencias preparadas con nombre", async () => {
    const r = repo();
    for (let i = 0; i < 5; i += 1) await r.buscarPorTokenConfirmacion(`qa-inexistente-${i}`);
    /* Una sentencia preparada con nombre sobreviviría a la transacción y el
       pooler la daría por perdida en la siguiente. `pg` sólo las crea si se le
       pasa `name`, y este adaptador no se lo pasa nunca. */
    const { rows } = await poolWeb().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_prepared_statements`,
    );
    expect(rows[0].n).toBe(0);
  });

  // ---- K: limpieza --------------------------------------------------------

  test("K · la certificación no deja basura en la base", async () => {
    const pool = poolWeb();
    await pool.query(
      `DELETE FROM public.intentos_web
        WHERE clave IN (SELECT 'envio:' || id::text FROM public.lista_de_espera WHERE email LIKE $1)`,
      [`${PREFIJO}%`],
    );
    await pool.query(`DELETE FROM public.intentos_web WHERE clave LIKE $1`, [`${PREFIJO}%`]);
    await pool.query(`DELETE FROM public.lista_de_espera WHERE email LIKE $1`, [`${PREFIJO}%`]);
    await pool.query(`DELETE FROM public.contactos_aliados WHERE email LIKE $1`, [`${PREFIJO}%`]);

    const { rows } = await pool.query<{ espera: number; aliados: number; intentos: number }>(
      `SELECT
         (SELECT count(*)::int FROM public.lista_de_espera  WHERE email LIKE $1) AS espera,
         (SELECT count(*)::int FROM public.contactos_aliados WHERE email LIKE $1) AS aliados,
         (SELECT count(*)::int FROM public.intentos_web      WHERE clave LIKE $1) AS intentos`,
      [`${PREFIJO}%`],
    );
    expect(rows[0].espera).toBe(0);
    expect(rows[0].aliados).toBe(0);
    expect(rows[0].intentos).toBe(0);
  });
});
