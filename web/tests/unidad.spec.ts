import { test, expect } from "@playwright/test";
import { crearRepositorioEnMemoria } from "@/lib/datos/memoria";
import {
  normalizarEmail,
  pareceRobot,
  validarLeadAliado,
  validarWaitlist,
} from "@/lib/seguridad/validacion";
import { huellaDeIp, nuevoTestigo, testigosIguales } from "@/lib/seguridad/testigos";
import { LIMITES, envioDemasiadoReciente, superaLimite } from "@/lib/seguridad/limites";
import { verificarTurnstile } from "@/lib/seguridad/turnstile";
import { correoAcuseAliado, correoBaja, correoConfirmacion, escapar } from "@/lib/correo/plantillas";
import { DOMINIO_REMITENTE, correoConfigurado, enviarCorreo } from "@/lib/correo/enviar";
import { limpiarPropiedades } from "@/lib/analitica";

/**
 * Pruebas de la lógica, sin navegador.
 *
 * Cubren lo que decide si un dato entra o no: la validación, los testigos, el
 * límite de peticiones, Turnstile y las plantillas. Todo esto queda verificado
 * aunque los formularios sigan apagados y aunque no haya ninguna base
 * provisionada todavía — que es justo el sentido de haber puesto una interfaz
 * de almacén por delante.
 */

test.describe("validación de la lista de espera", () => {
  test("normaliza el correo y rechaza lo que no puede serlo", () => {
    expect(normalizarEmail("  Hola@Ejemplo.COM ")).toBe("hola@ejemplo.com");
    expect(normalizarEmail("sin-arroba")).toBeNull();
    expect(normalizarEmail("doble..punto@ejemplo.com")).toBeNull();
    expect(normalizarEmail("a@b")).toBeNull();
    expect(normalizarEmail(12345)).toBeNull();
    expect(normalizarEmail(null)).toBeNull();
  });

  test("exige consentimiento", () => {
    const r = validarWaitlist({ email: "a@ejemplo.com", consentimiento: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallos.some((f) => f.campo === "consentimiento")).toBe(true);
  });

  test("descarta los campos que no están en la lista blanca", () => {
    const r = validarWaitlist({
      email: "a@ejemplo.com",
      consentimiento: true,
      estado: "confirmado",
      id: "1",
      ipHash: "robado",
      admin: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Lo que no está declarado no sale al otro lado, por mucho que se envíe.
      expect(Object.keys(r.datos).sort()).toEqual(
        ["abiertoEn", "consentimiento", "email", "origen", "rol", "trampa", "turnstileToken", "zona"].sort(),
      );
    }
  });

  test("un rol o una zona inventados no pasan", () => {
    const r = validarWaitlist({ email: "a@ejemplo.com", consentimiento: true, rol: "admin" });
    expect(r.ok).toBe(false);
  });

  test("el origen se sanea", () => {
    const r = validarWaitlist({
      email: "a@ejemplo.com",
      consentimiento: true,
      origen: "<script>x</script>",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.origen).toBe("scriptxscript");
  });
});

test.describe("señales de robot", () => {
  test("la trampa rellena delata", () => {
    expect(pareceRobot("cualquier cosa", null, Date.now())).toBe(true);
  });

  test("un envío instantáneo delata", () => {
    const ahora = Date.now();
    expect(pareceRobot("", ahora - 500, ahora)).toBe(true);
    expect(pareceRobot("", ahora - 9000, ahora)).toBe(false);
  });
});

test.describe("testigos", () => {
  test("son únicos y suficientemente largos", () => {
    const muestras = new Set(Array.from({ length: 200 }, () => nuevoTestigo()));
    expect(muestras.size).toBe(200);
    expect([...muestras][0].length).toBeGreaterThanOrEqual(40);
  });

  test("la huella de IP necesita sal y no devuelve la IP", () => {
    expect(huellaDeIp("190.1.2.3", undefined)).toBeNull();
    const h = huellaDeIp("190.1.2.3", "sal-secreta");
    expect(h).not.toBeNull();
    expect(h).not.toContain("190");
    // Misma IP y misma sal → misma huella; distinta IP → distinta.
    expect(huellaDeIp("190.1.2.3", "sal-secreta")).toBe(h);
    expect(huellaDeIp("190.1.2.4", "sal-secreta")).not.toBe(h);
  });

  test("la comparación no se rompe con longitudes distintas", () => {
    expect(testigosIguales("abc", "abc")).toBe(true);
    expect(testigosIguales("abc", "abcd")).toBe(false);
    expect(testigosIguales("", "")).toBe(true);
  });
});

test.describe("almacén en memoria", () => {
  test("el alta es idempotente por correo", async () => {
    const repo = crearRepositorioEnMemoria();
    const base = {
      email: "a@ejemplo.com",
      rol: null,
      zona: null,
      origen: null,
      ipHash: null,
      tokenConfirmacion: nuevoTestigo(),
      tokenExpiraEn: new Date(Date.now() + 1000).toISOString(),
      tokenBaja: nuevoTestigo(),
    };
    const uno = await repo.altaEnEspera(base);
    const dos = await repo.altaEnEspera({ ...base, tokenConfirmacion: nuevoTestigo() });
    expect(uno.creado).toBe(true);
    expect(dos.creado).toBe(false);
    expect(dos.registro.id).toBe(uno.registro.id);
  });

  test("un testigo vencido se renueva; uno vivo no se toca", async () => {
    const repo = crearRepositorioEnMemoria();
    const base = {
      email: "f@ejemplo.com",
      rol: null,
      zona: null,
      origen: null,
      ipHash: null,
      tokenBaja: nuevoTestigo(),
    };

    const vivo = nuevoTestigo();
    await repo.altaEnEspera({
      ...base,
      tokenConfirmacion: vivo,
      tokenExpiraEn: new Date(Date.now() + 60_000).toISOString(),
    });

    /* Con el enlace vivo no se rota: si se rotara, cualquiera podría anular el
       enlace de otra persona escribiendo su dirección en el formulario. */
    const igual = await repo.altaEnEspera({
      ...base,
      tokenConfirmacion: nuevoTestigo(),
      tokenExpiraEn: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(igual.registro.tokenConfirmacion).toBe(vivo);

    /* Vencido sí se renueva. Sin esto, quien dejara caducar el enlace recibiría
       para siempre un correo con el enlace vacío: esa dirección no podría
       confirmarse nunca más. */
    const otro = crearRepositorioEnMemoria();
    await otro.altaEnEspera({
      ...base,
      tokenConfirmacion: nuevoTestigo(),
      tokenExpiraEn: new Date(Date.now() - 1000).toISOString(),
    });
    const nuevo = nuevoTestigo();
    const renovado = await otro.altaEnEspera({
      ...base,
      tokenConfirmacion: nuevo,
      tokenExpiraEn: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(renovado.creado).toBe(false);
    expect(renovado.registro.estado).toBe("pendiente");
    expect(renovado.registro.tokenConfirmacion).toBe(nuevo);
    // El de baja no se toca: el que ya salió por correo tiene que seguir valiendo.
    expect(renovado.registro.tokenBaja).toBe(base.tokenBaja);
  });

  test("confirmar quema el testigo: el enlace vale una vez", async () => {
    const repo = crearRepositorioEnMemoria();
    const token = nuevoTestigo();
    const { registro } = await repo.altaEnEspera({
      email: "b@ejemplo.com",
      rol: null,
      zona: null,
      origen: null,
      ipHash: null,
      tokenConfirmacion: token,
      tokenExpiraEn: new Date(Date.now() + 10_000).toISOString(),
      tokenBaja: nuevoTestigo(),
    });
    await repo.confirmarEnEspera(registro.id);
    expect(await repo.buscarPorTokenConfirmacion(token)).toBeNull();
  });

  test("el testigo de baja es distinto del de confirmación", async () => {
    const repo = crearRepositorioEnMemoria();
    const conf = nuevoTestigo();
    const baja = nuevoTestigo();
    const { registro } = await repo.altaEnEspera({
      email: "c@ejemplo.com",
      rol: null,
      zona: null,
      origen: null,
      ipHash: null,
      tokenConfirmacion: conf,
      tokenExpiraEn: new Date(Date.now() + 10_000).toISOString(),
      tokenBaja: baja,
    });
    expect(conf).not.toBe(baja);
    // El de baja NO sirve para confirmar: si sirviera, «darme de baja»
    // confirmaría la inscripción de quien nunca la quiso.
    expect(await repo.buscarPorTokenConfirmacion(baja)).toBeNull();
    const porBaja = await repo.buscarPorTokenBaja(baja);
    expect(porBaja?.id).toBe(registro.id);
  });

  test("la baja deja el estado correcto", async () => {
    const repo = crearRepositorioEnMemoria();
    const baja = nuevoTestigo();
    const { registro } = await repo.altaEnEspera({
      email: "d@ejemplo.com",
      rol: null,
      zona: null,
      origen: null,
      ipHash: null,
      tokenConfirmacion: nuevoTestigo(),
      tokenExpiraEn: new Date(Date.now() + 10_000).toISOString(),
      tokenBaja: baja,
    });
    const tras = await repo.darDeBajaEnEspera(registro.id);
    expect(tras?.estado).toBe("baja");
    expect(tras?.bajaEn).toBeTruthy();
  });
});

test.describe("borrado por retención", () => {
  const DIA = 24 * 60 * 60 * 1000;

  /** El mismo alta de siempre, con `creadoEn` reescrito para simular antigüedad. */
  async function altaConEdad(repo: ReturnType<typeof crearRepositorioEnMemoria>, email: string, dias: number) {
    const { registro } = await repo.altaEnEspera({
      email,
      rol: null,
      zona: null,
      origen: null,
      ipHash: null,
      tokenConfirmacion: nuevoTestigo(),
      tokenExpiraEn: new Date(Date.now() + 10_000).toISOString(),
      tokenBaja: nuevoTestigo(),
    });
    registro.creadoEn = new Date(Date.now() - dias * DIA).toISOString();
    return registro;
  }

  test("30 días es la frontera, y sólo para lo no confirmado", async () => {
    const repo = crearRepositorioEnMemoria();
    await altaConEdad(repo, "joven@ejemplo.com", 29);
    await altaConEdad(repo, "vieja@ejemplo.com", 31);
    const confirmada = await altaConEdad(repo, "confirmada@ejemplo.com", 400);
    await repo.confirmarEnEspera(confirmada.id);

    const r = await repo.purgarPorRetencion(Date.now());

    expect(r.esperaEliminadas).toBe(1);
    expect(await repo.buscarPorTokenBaja(confirmada.tokenBaja!)).not.toBeNull();
  });

  test("es idempotente: la segunda pasada no borra nada", async () => {
    const repo = crearRepositorioEnMemoria();
    await altaConEdad(repo, "vieja@ejemplo.com", 45);

    const primera = await repo.purgarPorRetencion(Date.now());
    const segunda = await repo.purgarPorRetencion(Date.now());

    expect(primera.esperaEliminadas).toBe(1);
    expect(segunda.esperaEliminadas).toBe(0);
    expect(segunda.aliadosEliminados).toBe(0);
  });

  test("los comercios se van a los 12 meses, no antes", async () => {
    const repo = crearRepositorioEnMemoria();
    const base = {
      nombre: "Comercio",
      negocio: "Bodega",
      telefono: "04120000000",
      municipio: "mara",
      tipoComercio: "bodega",
      mensaje: null,
      consentimientoEn: new Date().toISOString(),
      ipHash: null,
    };
    const joven = await repo.crearLeadAliado({ ...base, email: "once@ejemplo.com" });
    const viejo = await repo.crearLeadAliado({ ...base, email: "trece@ejemplo.com" });
    joven.creadoEn = new Date(Date.now() - 334 * DIA).toISOString();
    viejo.creadoEn = new Date(Date.now() - 396 * DIA).toISOString();

    const r = await repo.purgarPorRetencion(Date.now());
    expect(r.aliadosEliminados).toBe(1);
  });
});

test.describe("límite de peticiones", () => {
  test("corta al pasarse y olvida al salir de la ventana", async () => {
    const repo = crearRepositorioEnMemoria();
    const t0 = 1_000_000;
    const limite = LIMITES.waitlistPorIp;
    for (let i = 0; i < limite.limite; i++) {
      expect(await superaLimite(repo, "ip:x", limite, t0 + i)).toBe(false);
    }
    expect(await superaLimite(repo, "ip:x", limite, t0 + 10)).toBe(true);
    // Fuera de la ventana, el contador arranca de cero.
    expect(await superaLimite(repo, "ip:x", limite, t0 + limite.ventanaMs + 1)).toBe(false);
  });

  test("las claves no se mezclan entre sí", async () => {
    const repo = crearRepositorioEnMemoria();
    const limite = { limite: 1, ventanaMs: 1000 };
    expect(await superaLimite(repo, "a", limite, 100)).toBe(false);
    expect(await superaLimite(repo, "b", limite, 100)).toBe(false);
    expect(await superaLimite(repo, "a", limite, 101)).toBe(true);
  });

  test("no se reenvía el correo antes de tiempo", async () => {
    const repo = crearRepositorioEnMemoria();
    const t0 = Date.now();
    expect(await envioDemasiadoReciente(repo, "e@ejemplo.com", t0)).toBe(false);
    await repo.registrarEnvioDeConfirmacion("e@ejemplo.com", new Date(t0).toISOString());
    expect(await envioDemasiadoReciente(repo, "e@ejemplo.com", t0 + 60_000)).toBe(true);
    expect(await envioDemasiadoReciente(repo, "e@ejemplo.com", t0 + 11 * 60_000)).toBe(false);
  });
});

test.describe("envío de correo", () => {
  /** Deja el entorno como estaba: estas pruebas lo tocan a propósito. */
  function conEntorno<T>(cambios: Record<string, string | undefined>, hacer: () => T): T {
    const previo: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(cambios)) {
      previo[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return hacer();
    } finally {
      for (const [k, v] of Object.entries(previo)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  test("sin clave no se manda nada, y se dice", async () => {
    await conEntorno({ RESEND_API_KEY: undefined }, async () => {
      expect(correoConfigurado()).toBe(false);
      const r = await enviarCorreo("alguien@example.com", correoBaja());
      expect(r.enviado).toBe(false);
      if (!r.enviado) expect(r.motivo).toBe("SIN_CONFIGURAR");
    });
  });

  test("el remitente sale del dominio verificado, nunca del de rebotes", async () => {
    /* `send.mas58express.com` es el Return-Path de Resend: tiene SPF y MX, pero
       NO tiene DKIM. El dominio dado de alta es el apex, y poner en el `From:`
       cualquier otro haría que Resend rechazara el envío. Esta prueba fija esa
       decisión para que nadie la deshaga sin darse cuenta. */
    await conEntorno({ RESEND_API_KEY: "re_ficticia_de_prueba", EMAIL_FROM: undefined }, async () => {
      let enviado: { from?: string } | null = null;
      const falso = (async (_url: string | URL | Request, init?: RequestInit) => {
        enviado = JSON.parse(String(init?.body ?? "{}"));
        return new Response(JSON.stringify({ id: "prueba" }), { status: 200 });
      }) as unknown as typeof fetch;

      const r = await enviarCorreo("alguien@example.com", correoBaja(), falso);
      expect(r.enviado).toBe(true);
      const de = String((enviado as { from?: string } | null)?.from ?? "");
      expect(de).toContain(`@${DOMINIO_REMITENTE}`);
      expect(de).not.toContain("send.mas58express.com");
    });
  });

  test("un rechazo de Resend no se disfraza de éxito", async () => {
    await conEntorno({ RESEND_API_KEY: "re_ficticia_de_prueba" }, async () => {
      const falso = (async () =>
        new Response("{}", { status: 422 })) as unknown as typeof fetch;
      const r = await enviarCorreo("alguien@example.com", correoBaja(), falso);
      expect(r.enviado).toBe(false);
      if (!r.enviado) expect(r.motivo).toBe("RECHAZADO");
    });
  });
});

test.describe("Turnstile", () => {
  test("sin clave secreta NO deja pasar", async () => {
    const previa = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    const r = await verificarTurnstile("lo-que-sea", null);
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe("SIN_CONFIGURAR");
    if (previa) process.env.TURNSTILE_SECRET_KEY = previa;
  });

  test("con clave, respeta lo que diga Cloudflare", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secreto-de-prueba";
    const ok = await verificarTurnstile("t", null, (async () =>
      new Response(JSON.stringify({ success: true }))) as unknown as typeof fetch);
    expect(ok.valido).toBe(true);

    const no = await verificarTurnstile("t", null, (async () =>
      new Response(JSON.stringify({ success: false }))) as unknown as typeof fetch);
    expect(no.valido).toBe(false);
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  test("si Cloudflare no responde, tampoco deja pasar", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secreto-de-prueba";
    const r = await verificarTurnstile("t", null, (async () => {
      throw new Error("red caída");
    }) as unknown as typeof fetch);
    expect(r.valido).toBe(false);
    if (!r.valido) expect(r.motivo).toBe("ERROR_DE_RED");
    delete process.env.TURNSTILE_SECRET_KEY;
  });
});

test.describe("correos", () => {
  test("el de confirmación lleva los dos enlaces y ningún rastreador", () => {
    const c = correoConfirmacion("https://x/confirmar?token=A", "https://x/baja?token=B");
    expect(c.html).toContain("https://x/confirmar?token=A");
    expect(c.html).toContain("https://x/baja?token=B");
    expect(c.texto).toContain("https://x/confirmar?token=A");
    // Ni píxel de apertura ni imagen de un pixel: es el primer correo que
    // alguien recibe de la marca.
    expect(c.html).not.toMatch(/<img/i);
    expect(c.html).not.toMatch(/width="1"|height="1"/i);
  });

  test("lo que escribe un desconocido se escapa", () => {
    expect(escapar('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    const c = correoAcuseAliado("<b>Ana</b>", "Bodega & Cía");
    expect(c.html).not.toContain("<b>Ana</b>");
    expect(c.html).toContain("Bodega &amp; Cía");
  });
});

test.describe("validación de comercios", () => {
  test("un envío correcto pasa", () => {
    const r = validarLeadAliado({
      nombre: "Ana",
      negocio: "Bodega Ana",
      telefono: "0412 514 3242",
      email: "ana@ejemplo.com",
      municipio: "mara",
      tipoComercio: "mercado",
      consentimiento: true,
    });
    expect(r.ok).toBe(true);
  });

  test("acumula los fallos en vez de parar en el primero", () => {
    const r = validarLeadAliado({ nombre: "A", telefono: "123", consentimiento: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const campos = r.fallos.map((f) => f.campo);
      expect(campos).toContain("nombre");
      expect(campos).toContain("negocio");
      expect(campos).toContain("telefono");
      expect(campos).toContain("consentimiento");
    }
  });

  test("un municipio o un tipo inventados no pasan", () => {
    const r = validarLeadAliado({
      nombre: "Ana",
      negocio: "X",
      telefono: "04125143242",
      email: "a@b.com",
      municipio: "caracas",
      tipoComercio: "armas",
      consentimiento: true,
    });
    expect(r.ok).toBe(false);
  });
});

test.describe("analítica sin datos personales", () => {
  test("las claves prohibidas nunca salen", () => {
    const limpias = limpiarPropiedades({
      zona: "maracaibo",
      email: "ana@ejemplo.com",
      telefono: "04125143242",
      nombre: "Ana",
      ip: "190.1.2.3",
      userId: "u_1",
      token: "secreto",
      correo: "otro@ejemplo.com",
    });
    expect(Object.keys(limpias)).toEqual(["zona"]);
    expect(JSON.stringify(limpias)).not.toContain("ejemplo.com");
    expect(JSON.stringify(limpias)).not.toContain("0412");
  });

  test("recorta valores largos y descarta nulos", () => {
    const limpias = limpiarPropiedades({ zona: "x".repeat(200), modo: null, rol: "conductor" });
    expect(limpias.zona.length).toBe(64);
    expect("modo" in limpias).toBe(false);
    expect(limpias.rol).toBe("conductor");
  });
});
