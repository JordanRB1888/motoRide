import { test, expect } from "@playwright/test";

/**
 * Fase 1-B: la infraestructura existe, y **no se ve**.
 *
 * Estas pruebas vigilan justo lo contrario de lo normal: que algo NO aparezca.
 * Mientras la política de privacidad no exista, ningún formulario puede pedir un
 * dato, y la forma de garantizarlo es comprobarlo en cada despliegue, no
 * confiar en que nadie tocó un interruptor.
 */

const CAMPOS = "input:not([type=hidden]), textarea, select";

test.describe("los interruptores mantienen los formularios fuera del público", () => {
  for (const ruta of ["/", "/aliados", "/conductores", "/contacto"]) {
    test(`${ruta} no pide ni un dato`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);
      expect(await page.locator(`main ${CAMPOS}`).count(), `${ruta} muestra campos`).toBe(0);
      expect(await page.locator("main form").count(), `${ruta} muestra un formulario`).toBe(0);
    });
  }

  test("la zona de descarga sigue ofreciendo WhatsApp, no un campo", async ({ page }) => {
    await page.goto("/");
    await page.locator("#descargar").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(await page.locator(`#descargar ${CAMPOS}`).count()).toBe(0);
    await expect(page.locator('#descargar a[href*="wa.me"]')).toHaveCount(1);
  });

  test("/aliados sigue ofreciendo la conversación", async ({ page }) => {
    await page.goto("/aliados");
    await page.waitForTimeout(400);
    await expect(page.locator('main a[href*="wa.me"]').first()).toBeVisible();
  });
});

test.describe("las rutas de API no existen mientras el interruptor esté apagado", () => {
  test("la lista de espera responde 404, no 503", async ({ request }) => {
    const r = await request.post("/api/waitlist", {
      data: { email: "a@ejemplo.com", consentimiento: true },
      headers: { "content-type": "application/json" },
    });
    // 404 y no 503: no es una caída temporal, es que no se ha publicado.
    expect(r.status()).toBe(404);
  });

  test("confirmar y baja responden 404", async ({ request }) => {
    expect((await request.get("/api/waitlist/confirmar?token=x")).status()).toBe(404);
    expect((await request.get("/api/waitlist/baja?token=x")).status()).toBe(404);
  });

  test("los comercios responden 404", async ({ request }) => {
    const r = await request.post("/api/leads/partners", {
      data: { nombre: "Ana" },
      headers: { "content-type": "application/json" },
    });
    expect(r.status()).toBe(404);
  });

  test("ni siquiera filtran si un correo está en la lista", async ({ request }) => {
    const uno = await request.post("/api/waitlist", {
      data: { email: "existe@ejemplo.com", consentimiento: true },
      headers: { "content-type": "application/json" },
    });
    const dos = await request.post("/api/waitlist", {
      data: { email: "no-existe-jamas@ejemplo.com", consentimiento: true },
      headers: { "content-type": "application/json" },
    });
    // Misma respuesta byte a byte para los dos.
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
  test("la CSP no abre Turnstile mientras no haya formularios", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"];
    expect(csp).toBeTruthy();
    // Con los interruptores apagados, ese permiso no se concede a nadie.
    expect(csp).not.toContain("challenges.cloudflare.com");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain("*");
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
    await page.waitForLoadState("networkidle").catch(() => {});
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
