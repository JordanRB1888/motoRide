import { test, expect } from "@playwright/test";
import { PARTNER_LEADS_ENABLED, WAITLIST_ENABLED } from "@/lib/flags";

/**
 * Fase 1-B: cada superficie aparece cuando su interruptor lo dice, **y sólo
 * entonces**.
 *
 * Estas pruebas nacieron vigilando lo contrario de lo normal —que algo NO
 * apareciera— mientras no hubiera política de privacidad. Ese requisito ya se
 * cumplió y la lista de espera está encendida, así que ahora vigilan las dos
 * mitades:
 *
 *   · lo que el interruptor apagado sigue tapando: el formulario de comercios,
 *     sus rutas, y cualquier campo en una página que no debe pedir datos;
 *   · lo que el interruptor encendido tiene que hacer bien: el formulario de la
 *     lista de espera, sus cuatro rutas y el permiso de la CSP para Turnstile,
 *     **exactamente donde hace falta y en ningún otro sitio**.
 *
 * Se leen los interruptores de verdad en vez de escribir el estado esperado a
 * mano: así, el día que uno cambie, estas pruebas comprueban lo nuevo y no hay
 * que acordarse de venir a editarlas.
 */

const CAMPOS = "input:not([type=hidden]), textarea, select";

/** Páginas que no tienen formulario propio pase lo que pase. */
const SIN_FORMULARIO = ["/conductores", "/contacto", ...(PARTNER_LEADS_ENABLED ? [] : ["/aliados"])];

test.describe("los interruptores gobiernan lo que se ve", () => {
  for (const ruta of SIN_FORMULARIO) {
    test(`${ruta} no pide ni un dato`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
      expect(await page.locator(`main ${CAMPOS}`).count(), `${ruta} muestra campos`).toBe(0);
      expect(await page.locator("main form").count(), `${ruta} muestra un formulario`).toBe(0);
    });
  }

  test("la zona de descarga hace lo que dice su interruptor", async ({ page }) => {
    await page.goto("/");
    await page.locator("#descargar").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    if (!WAITLIST_ENABLED) {
      expect(await page.locator(`#descargar ${CAMPOS}`).count()).toBe(0);
    } else {
      /* Encendida: el formulario existe de verdad, con su etiqueta y su
         casilla de consentimiento. Un campo de correo sin consentimiento al
         lado sería peor que no tener formulario. */
      await expect(page.locator("#descargar form")).toHaveCount(1);
      await expect(page.locator("#descargar input#wl-email")).toBeVisible();
      await expect(page.locator("#descargar input#wl-consent")).toHaveCount(1);
      await expect(page.getByLabel("Tu correo")).toBeVisible();
      /* Los tres campos tienen nombre accesible. Los dos desplegables estuvieron
         dentro de un `<fieldset><legend>`, que nombra al grupo y no al control:
         axe lo marcó como infracción crítica. Esto vigila que no vuelva. */
      await expect(page.getByLabel(/¿Qué te interesa\?/)).toBeVisible();
      await expect(page.getByLabel(/¿Dónde estás\?/)).toBeVisible();
    }

    /* La sección tiene que ofrecer SIEMPRE una salida, pero no siempre la misma:
       apagada es WhatsApp —la única puerta que había—, encendida es el propio
       formulario, que es mejor puerta. Lo que no puede pasar es que no haya
       ninguna. */
    const salidas =
      (await page.locator('#descargar a[href*="wa.me"]').count()) +
      (await page.locator("#descargar form").count());
    expect(salidas, "la zona de descarga se quedó sin salida").toBeGreaterThan(0);
  });

  test("/aliados sigue ofreciendo la conversación", async ({ page }) => {
    await page.goto("/aliados");
    await page.waitForTimeout(400);
    await expect(page.locator('main a[href*="wa.me"]').first()).toBeVisible();
  });
});

test.describe("las rutas de API dicen lo que su interruptor manda", () => {
  test("la lista de espera existe o no, pero nunca se delata a medias", async ({ request }) => {
    const r = await request.post("/api/waitlist", {
      data: { email: "a@ejemplo.com", consentimiento: true },
      headers: { "content-type": "application/json" },
    });

    if (!WAITLIST_ENABLED) {
      // 404 y no 503: no es una caída temporal, es que no se ha publicado.
      expect(r.status()).toBe(404);
      return;
    }

    /* Encendida. Esta petición no trae `Origin` —la hace un cliente, no un
       navegador—, así que la guarda contra la falsificación de petición la
       rechaza antes de mirar nada más: 400. Lo que importa es que **no** sea
       404 (existe) ni 200 (no se cuela sin Turnstile). */
    expect(r.status()).toBe(400);
    expect(await r.json()).toEqual({ error: "PETICION_NO_VALIDA" });
  });

  test("un GET a la lista de espera nunca contradice al POST", async ({ request }) => {
    /* El fallo que esto vigila es sutil: con el interruptor apagado, un 405 aquí
       delataría que la ruta existe mientras el POST devuelve 404. Encendida, el
       405 es lo correcto. */
    const r = await request.get("/api/waitlist");
    expect(r.status()).toBe(WAITLIST_ENABLED ? 405 : 404);
    if (WAITLIST_ENABLED) expect(r.headers()["allow"]).toBe("POST");
  });

  test("confirmar y baja tratan un testigo falso sin enseñar nada", async ({ request }) => {
    for (const [ruta, destino] of [
      ["/api/waitlist/confirmar", "/gracias"],
      ["/api/waitlist/baja", "/baja"],
    ]) {
      const r = await request.get(`${ruta}?token=inventado`, { maxRedirects: 0 });

      if (!WAITLIST_ENABLED) {
        expect(r.status(), ruta).toBe(404);
        continue;
      }

      /* Encendida: un testigo falso NO es un error técnico. Se redirige a la
         página de siempre con una sola palabra de estado — nunca el testigo,
         nunca un correo, nunca un identificador. */
      expect(r.status(), ruta).toBe(302);
      const destinoReal = r.headers()["location"] ?? "";
      expect(destinoReal, ruta).toContain(`${destino}?estado=invalido`);
      expect(destinoReal, ruta).not.toContain("inventado");
      expect(destinoReal, ruta).not.toMatch(/token=|@/);
    }
  });

  test("los comercios responden 404", async ({ request }) => {
    test.skip(PARTNER_LEADS_ENABLED, "el interruptor de comercios está encendido");
    const r = await request.post("/api/leads/partners", {
      data: { nombre: "Ana" },
      headers: { "content-type": "application/json" },
    });
    expect(r.status()).toBe(404);
    expect((await request.get("/api/leads/partners")).status()).toBe(404);
  });

  test("ni siquiera filtran si un correo está en la lista", async ({ request }) => {
    /* La propiedad que se defiende: la respuesta no puede depender de si esa
       dirección está apuntada o no.
       Estas dos peticiones se quedan a propósito en la primera puerta —sin
       `Origin` no pasan—, y eso es deliberado: con `Origin` sí entrarían, y cada
       una gastaría un intento del limitador y escribiría una fila en la base de
       verdad para no llegar más lejos, porque sin Turnstile no se toca el
       almacén igualmente. Ensuciar producción para comprobar dos bytes no vale
       la pena. El otro lado de la propiedad —el que sí toca el almacén, con una
       dirección apuntada y otra que no— lo cubre `unidad.spec.ts` contra el
       repositorio. */
    const pedir = (email: string) =>
      request.post("/api/waitlist", {
        data: { email, consentimiento: true },
        headers: { "content-type": "application/json" },
      });

    const uno = await pedir("existe@ejemplo.com");
    const dos = await pedir("no-existe-jamas@ejemplo.com");
    expect(uno.status()).toBe(dos.status());
    expect(await uno.text()).toBe(await dos.text());
  });
});

test.describe("páginas de confirmación y de baja", () => {
  const ESTADOS_GRACIAS: [string, RegExp][] = [
    ["pendiente", /revisa/i],
    ["confirmado", /listo/i],
    ["ya_confirmado", /ya estabas/i],
    ["expirado", /caduc/i],
    ["invalido", /no vale/i],
    // El fallo nuestro se dice que es nuestro, y no se manda a nadie con un
    // enlace bueno a empezar de cero.
    ["error", /no hemos podido/i],
  ];

  for (const [estado, esperado] of ESTADOS_GRACIAS) {
    test(`/gracias muestra el estado «${estado}»`, async ({ page }) => {
      const r = await page.goto(`/gracias?estado=${estado}`);
      expect(r?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(esperado);
    });
  }

  for (const [estado, esperado] of [
    ["baja", /listo/i],
    ["ya_baja", /ya estabas/i],
    ["invalido", /no vale/i],
    ["error", /no hemos podido/i],
  ] as [string, RegExp][]) {
    test(`/baja muestra el estado «${estado}»`, async ({ page }) => {
      const r = await page.goto(`/baja?estado=${estado}`);
      expect(r?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(esperado);
    });
  }

  test("un estado desconocido no revienta ni enseña nada técnico", async ({ page }) => {
    await page.goto("/gracias?estado=<script>alert(1)</script>");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const texto = await page.locator("main").innerText();
    expect(texto).not.toContain("<script>");
    expect(texto).not.toMatch(/undefined|null|Error|Exception/);
  });

  test("no llevan datos personales ni se indexan", async ({ page }) => {
    await page.goto("/gracias?estado=confirmado");
    expect(page.url()).not.toMatch(/@|token=/);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
    const html = await page.content();
    expect(html).not.toMatch(/token=/);
  });
});

test.describe("seguridad", () => {
  test("la CSP abre a Turnstile lo justo, y nada más", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"] ?? "";
    expect(csp).toBeTruthy();
    expect(csp).not.toContain("*");

    const TURNSTILE = "https://challenges.cloudflare.com";
    const directiva = (nombre: string) =>
      csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${nombre} `)) ?? "";

    if (!WAITLIST_ENABLED && !PARTNER_LEADS_ENABLED) {
      // Con los interruptores apagados, ese permiso no se concede a nadie.
      expect(csp).not.toContain("challenges.cloudflare.com");
      expect(csp).toContain("frame-src 'none'");
      return;
    }

    /* Turnstile necesita tres permisos y **sólo** tres: cargar su script, hablar
       con Cloudflare y abrir su marco. Se comprueba directiva por directiva en
       vez de buscar el dominio en la cadena entera: así, si algún día se colara
       en `img-src` o en `default-src`, esto lo cazaría en lugar de dar por bueno
       un «sí, está ahí». */
    expect(directiva("script-src")).toContain(TURNSTILE);
    expect(directiva("connect-src")).toContain(TURNSTILE);
    expect(directiva("frame-src")).toContain(TURNSTILE);

    for (const otra of ["default-src", "img-src", "font-src", "style-src", "form-action", "base-uri"]) {
      expect(directiva(otra), `${otra} no debería nombrar a Cloudflare`).not.toContain(
        "cloudflare",
      );
    }

    // Y el dominio exacto, nunca un comodín de subdominios.
    expect(csp).not.toContain("*.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("a Cloudflare sólo se le pide algo donde hay formulario", async ({ page }) => {
    /* Comprobarlo con el navegador y no con un grep del HTML es la diferencia
       entre «no está escrito» y «no se ejecuta»: la Site Key viaja incrustada en
       un chunk —es pública por diseño, para eso existe—, así que buscarla en el
       texto no demostraría nada.
       Lo que se vigila es dónde llega a PEDIRSE algo: ni el script del widget,
       ni el desafío, ni un marco, en ninguna página que no tenga un formulario
       que lo necesite. Un captcha en una página de lectura es telemetría de
       terceros disfrazada de seguridad. */
    const aCloudflare = new Map<string, string[]>();
    let actual = "";
    page.on("request", (r) => {
      if (r.url().includes("challenges.cloudflare.com")) {
        aCloudflare.set(actual, [...(aCloudflare.get(actual) ?? []), r.url()]);
      }
    });

    /* `/` sólo pide a Cloudflare si la lista está encendida; las demás, nunca:
       `/aliados` depende de su propio interruptor, y las otras dos no tienen
       formulario en ningún caso. */
    const SIN_CLOUDFLARE = ["/conductores", "/pasajeros", ...(PARTNER_LEADS_ENABLED ? [] : ["/aliados"])];

    for (const ruta of [...SIN_CLOUDFLARE, "/"]) {
      actual = ruta;
      await page.goto(ruta);
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      /* El widget se carga con `lazyOnload`, así que hay que llegar hasta él y
         darle tiempo: si no, un «no pidió nada» sería sólo «no le dio tiempo». */
      if (ruta === "/") await page.locator("#descargar").scrollIntoViewIfNeeded();
      await page.waitForTimeout(ruta === "/" ? 2500 : 700);
    }

    for (const ruta of SIN_CLOUDFLARE) {
      expect(aCloudflare.get(ruta) ?? [], `${ruta} habló con Cloudflare`).toHaveLength(0);
    }

    if (!WAITLIST_ENABLED) {
      expect(aCloudflare.get("/") ?? []).toHaveLength(0);
      return;
    }

    /* La otra mitad —que el widget SÍ se cargue— sólo se puede comprobar donde
       existe la Site Key, y ésa vive en el proyecto de Vercel, no en el disco.
       En un build local el componente devuelve `null` por diseño, así que exigir
       aquí nada de Cloudflare daría un fallo que no dice nada de la web. */
    test.skip(!process.env.SITIO, "la Site Key de Turnstile sólo existe en el despliegue");

    expect(
      aCloudflare.get("/") ?? [],
      "la portada tiene el formulario y no cargó Turnstile",
    ).not.toHaveLength(0);

    /* Y AQUÍ SE PARA, A PROPÓSITO.
       Lo siguiente que apetecería comprobar es que aparezca el marco del
       desafío. No se puede, y no por un fallo: Turnstile mira quién pide y a un
       navegador automatizado le contesta `600010` —comportamiento de bot— sin
       entregar testigo ni pintar marco. Exigir el marco aquí sería exigir que
       Turnstile dejara de distinguir a las personas de los programas, que es
       justo lo que se le paga por hacer.
       Que el testigo se produce de verdad para una persona está certificado por
       otro camino: existe una fila en la base dada de alta desde este
       formulario, y a `altaEnEspera` no se llega sin pasar por la verificación
       de Turnstile en el servidor. */
  });

  test("la ruta del cron no se puede disparar desde fuera", async ({ request }) => {
    /* Es la única ruta del sitio que BORRA datos. Sin la cabecera correcta no
       puede responder nada distinto de 404 — y 404 y no 401 a propósito: un 401
       confirmaría que la ruta existe, y no hay ninguna razón para confirmárselo
       a quien está probando a ver qué encuentra. */
    const intentos: Record<string, string>[] = [
      {},
      { authorization: "Bearer" },
      { authorization: "Bearer equivocado" },
      { authorization: "Basic YWRtaW46YWRtaW4=" },
    ];
    for (const cabeceras of intentos) {
      const r = await request.get("/api/cron/retencion", { headers: cabeceras });
      expect(r.status(), `cabecera ${JSON.stringify(cabeceras)}`).toBe(404);
    }

    // Y tampoco por POST, por si alguien prueba otro verbo.
    expect((await request.post("/api/cron/retencion")).status()).toBe(405);
  });

  test("un cuerpo enorme no se procesa", async ({ request }) => {
    const r = await request.post("/api/waitlist", {
      data: { email: "a@ejemplo.com", consentimiento: true, mensaje: "x".repeat(200_000) },
      headers: { "content-type": "application/json" },
    });
    // Apagada responde 404; encendida respondería 400. Lo que nunca puede pasar
    // es que devuelva 200 o que tarde una eternidad.
    expect([400, 404, 413]).toContain(r.status());
  });

  test("las cabeceras siguen completas", async ({ request }) => {
    const h = (await request.get("/")).headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("geolocation=()");
    expect(h["strict-transport-security"]).toContain("max-age=");
  });
});

test.describe("analítica sin datos personales", () => {
  test("el script de la analítica carga de verdad, no da 404", async ({ page }) => {
    /* Sólo tiene sentido contra un despliegue: el script de la analítica lo
       sirve la propia infraestructura de Vercel, y en un `next start` local esa
       ruta no existe. Comprobarlo ahí daría un fallo que no dice nada. */
    test.skip(!process.env.SITIO, "la analítica sólo existe en un despliegue de Vercel");
    /* Esta es la comprobación que hizo falta para poder encenderla. Mientras Web
       Analytics no estaba activada en el proyecto, ese script devolvía un 404 con
       tipo `text/plain` que `nosniff` se negaba a ejecutar: un error en la
       consola de cada visitante a cambio de nada.
       No se comprueba la ruta exacta a propósito: Vercel se la inventa ofuscada
       —`/e2c643…/script.js`— para esquivar bloqueadores, y atarla aquí haría que
       esta prueba se rompiera el día que cambie sin que nada esté mal. Lo que
       importa es que el script exista y que no dé error. */
    const respuestas: { url: string; estado: number }[] = [];
    page.on("response", (r) => {
      const u = r.url();
      if (/\/script\.js(\?|$)/.test(u) && !u.includes("/_next/")) {
        respuestas.push({ url: u, estado: r.status() });
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);

    expect(respuestas.length, "no se cargó ningún script de analítica").toBeGreaterThan(0);
    for (const r of respuestas) expect(r.estado, r.url).toBe(200);
  });

  test("no hay errores de CSP ni de tipo MIME en la portada", async ({ page }) => {
    // Mismo motivo: en local falta el script de la analítica y su ausencia
    // produce justo el tipo de error que esta prueba vigila.
    test.skip(!process.env.SITIO, "la analítica sólo existe en un despliegue de Vercel");
    const errores: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      /* `vercel.live` es la barra de vista previa de Vercel, que sólo se inyecta
         en los despliegues de preview. Que la CSP la bloquee es exactamente lo
         que debe pasar —no está en la lista de orígenes permitidos— y no es un
         defecto del sitio: en producción esa barra no existe. */
      if (t.includes("vercel.live")) return;
      if (m.type() === "error" && /Content Security Policy|Refused to|nosniff|MIME/i.test(t)) {
        errores.push(t);
      }
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
    expect(errores, errores.join(" | ")).toHaveLength(0);
  });


  test("ninguna petición saliente lleva correo, teléfono ni nombre", async ({ page }) => {
    const sospechosas: string[] = [];
    page.on("request", (r) => {
      const url = r.url();
      const cuerpo = r.postData() ?? "";
      const todo = `${url} ${cuerpo}`;
      if (/@[a-z0-9-]+\.[a-z]{2,}|0412\d{7}|58expressapp/i.test(todo)) {
        // El `mailto:` del pie es un enlace, no una petición: sólo cuentan las
        // peticiones de verdad.
        if (!url.startsWith("mailto:")) sospechosas.push(todo.slice(0, 180));
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    await page.evaluate(async () => {
      const paso = innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += paso) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    await page.waitForTimeout(2500);

    expect(sospechosas, sospechosas.join(" | ")).toHaveLength(0);
  });

  test("no se pone ninguna cookie", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    expect(await context.cookies()).toHaveLength(0);
  });
});
