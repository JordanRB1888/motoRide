import { test, expect, type Page } from "@playwright/test";
import { WAITLIST_ENABLED } from "@/lib/flags";
import { EMAIL, WHATSAPP } from "@/lib/contact";

/**
 * Fase 0: las puertas reales.
 *
 * La auditoría funcional encontró un sitio sin una sola forma de contactar y con
 * los embudos de conductor y aliado terminando en una pared. Cada prueba de aquí
 * vigila una de esas puertas: que exista, que lleve a donde dice y que no vuelva
 * a cerrarse en una versión futura.
 */

/* Se leen de la fuente única, no se copian.
   Estuvieron escritos a mano aquí, y el día que la empresa cambió de número
   hubo que acordarse de venir a editarlos: exactamente el descuido que
   `lib/contact.ts` existe para impedir. Que la prueba siga al dato no la
   debilita —lo que vigila es que el pie use el número configurado, no cuál es—,
   y de la forma del valor se encarga la comprobación de abajo. */
const NUMERO = WHATSAPP.e164;
const CORREO = EMAIL.direccion;

test("los canales configurados tienen la forma que exige cada uno", () => {
  /* `wa.me` sólo admite E.164 sin «+», sin espacios y sin guiones: un número
     con cualquiera de las tres cosas da un enlace que abre WhatsApp y no
     encuentra a nadie. Venezuela es 58 + diez dígitos. */
  expect(NUMERO, "el número de wa.me lleva algo que no es un dígito").toMatch(/^\d+$/);
  expect(NUMERO, "no parece un número venezolano en E.164").toMatch(/^58\d{10}$/);
  // Y lo que se le enseña a una persona tiene que ser el mismo número.
  expect(WHATSAPP.visible.replace(/\D/g, ""), "el número visible no coincide con el de wa.me").toBe(
    NUMERO,
  );
  expect(CORREO).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
});

async function listo(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
}

test.describe("canales de contacto", () => {
  test("el pie ofrece WhatsApp y correo en las diez rutas", async ({ page }) => {
    for (const ruta of ["/", "/servicios", "/conductores", "/aliados", "/ayuda", "/contacto"]) {
      await page.goto(ruta);
      await listo(page);
      const wa = page.locator(`footer a[href*="wa.me/${NUMERO}"]`);
      const mail = page.locator(`footer a[href^="mailto:${CORREO}"]`);
      await expect(wa, `falta WhatsApp en el pie de ${ruta}`).toHaveCount(1);
      await expect(mail, `falta el correo en el pie de ${ruta}`).toHaveCount(1);
    }
  });

  test("cada enlace de WhatsApp abre en pestaña nueva y sin fuga de referente", async ({ page }) => {
    await page.goto("/contacto");
    await listo(page);
    const enlaces = page.locator('a[href*="wa.me"]');
    const n = await enlaces.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(enlaces.nth(i)).toHaveAttribute("target", "_blank");
      await expect(enlaces.nth(i)).toHaveAttribute("rel", /noopener/);
    }
  });

  test("los mensajes prellenados son distintos por intención", async ({ page }) => {
    const mensajes: Record<string, string> = {};
    for (const [ruta, clave] of [
      ["/conductores", "conductor"],
      ["/aliados", "aliado"],
      ["/ayuda", "soporte"],
    ] as const) {
      await page.goto(ruta);
      await listo(page);
      const href = await page
        .locator('main a[href*="wa.me"]')
        .first()
        .getAttribute("href");
      expect(href, `${ruta} no ofrece WhatsApp en el contenido`).toBeTruthy();
      const texto = decodeURIComponent(new URL(href!).searchParams.get("text") ?? "");
      expect(texto.length, `${ruta} manda un mensaje vacío`).toBeGreaterThan(20);
      mensajes[clave] = texto;
    }
    // Tres intenciones, tres mensajes: un genérico obligaría a preguntar de qué va
    // cada conversación.
    expect(new Set(Object.values(mensajes)).size).toBe(3);
    expect(mensajes.conductor).toMatch(/conductor/i);
    expect(mensajes.aliado).toMatch(/aliado/i);
    expect(mensajes.soporte).toMatch(/ayuda/i);
  });
});

test.describe("ninguna página termina en una pared", () => {
  for (const ruta of ["/conductores", "/aliados", "/ayuda"]) {
    test(`${ruta} ofrece una acción real`, async ({ page }) => {
      await page.goto(ruta);
      await listo(page);
      const acciones = page.locator('main a[href*="wa.me"], main a[href^="mailto:"]');
      expect(await acciones.count(), `${ruta} no ofrece ninguna salida`).toBeGreaterThan(0);
      await expect(acciones.first()).toBeVisible();
    });
  }

  test("/contacto presenta las cuatro puertas", async ({ page }) => {
    await page.goto("/contacto");
    await listo(page);
    for (const t of ["Quiero conducir", "Tengo un comercio", "Quiero pedir un viaje", "Necesito ayuda"]) {
      await expect(page.getByRole("heading", { name: t })).toBeVisible();
    }
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(6);
  });

  test("la sección de descarga no finge un formulario", async ({ page }) => {
    await page.goto("/");
    await listo(page);
    await page.locator("#descargar").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    /* La regla no es «que no haya formulario»: es que no haya uno que mienta.
       Apagado el interruptor no puede existir ni un campo —un formulario que no
       guarda nada engaña a quien lo rellena—; encendido tiene que estar entero,
       con su etiqueta y su casilla de consentimiento. */
    if (!WAITLIST_ENABLED) {
      expect(await page.locator("#descargar input, #descargar form").count()).toBe(0);
    } else {
      await expect(page.locator("#descargar form")).toHaveCount(1);
      await expect(page.locator("#descargar input#wl-email")).toBeVisible();
      await expect(page.locator("#descargar input#wl-consent")).toHaveCount(1);
    }
    /* Y una salida, la que toque: WhatsApp cuando no hay lista, el formulario
       cuando la hay. Lo que esta prueba no admite es una sección que no lleve a
       ninguna parte. */
    const salidas =
      (await page.locator("#descargar a[href*='wa.me']").count()) +
      (await page.locator("#descargar form").count());
    expect(salidas).toBeGreaterThan(0);
  });
});

test.describe("página 404", () => {
  test("responde 404, está en español y ofrece salidas", async ({ page }) => {
    const resp = await page.goto("/esta-ruta-no-existe-jamas");
    expect(resp?.status()).toBe(404);
    await listo(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/no existe/i);
    // La de fábrica de Next traía un solo enlace; esta tiene que sacarte de aquí.
    expect(await page.locator("a").count()).toBeGreaterThanOrEqual(8);
    await expect(page.getByRole("link", { name: "Volver al inicio" })).toBeVisible();
  });

  test("no rompe la hidratación", async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto("/otra-ruta-inexistente");
    await page.waitForTimeout(1500);
    expect(errores, errores.join(" | ")).toHaveLength(0);
  });

  test("volver al inicio funciona de verdad", async ({ page }) => {
    await page.goto("/ruta-rota");
    await listo(page);
    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await page.waitForTimeout(900);
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

test.describe("cabeceras de seguridad", () => {
  test("llegan todas y la CSP es estricta", async ({ request }) => {
    const r = await request.get("/");
    const h = r.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("geolocation=()");
    expect(h["strict-transport-security"]).toContain("max-age=");

    const csp = h["content-security-policy"];
    expect(csp, "no llega Content-Security-Policy").toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // El mapa necesita exactamente este origen y ninguno más.
    expect(csp).toContain("https://tile.openstreetmap.org");
    // En producción no se permite eval bajo ningún concepto.
    if (!csp.includes("ws:")) expect(csp).not.toContain("unsafe-eval");
  });

  test("la CSP no rompe el mapa, el motion ni los teléfonos", async ({ page }) => {
    const violaciones: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() !== "error") return;
      /* Sólo violaciones de CSP de verdad. «Refused to» a secas también lo dice
         `nosniff` cuando un recurso llega con el tipo equivocado, que es otra
         cosa y tiene su propia prueba. */
      if (!/Content Security Policy/i.test(t)) return;
      // La barra de vista previa de Vercel (`vercel.live`) sólo se inyecta en los
      // despliegues de vista previa, nunca en producción. Que la CSP la bloquee es
      // lo correcto: no vamos a abrir el sitio público a un script de terceros
      // para que funcione una herramienta interna.
      if (t.includes("vercel.live")) return;
      violaciones.push(t);
    });
    await page.goto("/");
    await listo(page);
    await page.evaluate(async () => {
      const paso = innerHeight * 0.7;
      for (let y = 0; y < document.body.scrollHeight; y += paso) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
    });
    await page.waitForTimeout(3000);

    expect(violaciones, violaciones.join(" | ")).toHaveLength(0);
    // El mapa pinta teselas de OpenStreetMap: si la CSP las bloqueara, cero.
    expect(await page.locator(".leaflet-tile").count()).toBeGreaterThan(4);
    // GSAP dibujó la ruta de la escena.
    const trazo = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-route-line]")!).strokeDashoffset,
    );
    expect(trazo).toBe("0px");
  });
});

test.describe("móvil", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("las puertas se alcanzan con el pulgar", async ({ page }) => {
    await page.goto("/conductores");
    await listo(page);
    const cta = page.locator('main a[href*="wa.me"]').first();
    await expect(cta).toBeVisible();
    const caja = await cta.boundingBox();
    expect(caja!.height, "el área táctil se queda corta").toBeGreaterThanOrEqual(44);
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(390);
  });

  test("el menú móvil lleva a Contacto", async ({ page }) => {
    await page.goto("/");
    await listo(page);
    // En el pie, que está en todas las páginas…
    await page.locator("footer").scrollIntoViewIfNeeded();
    await expect(page.locator('footer a[href="/contacto"]')).toBeVisible();
    // …y en el propio menú, que es donde se busca desde un teléfono.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('#menu-movil a[href="/contacto"]')).toBeVisible();
  });
});

test("con movimiento reducido las puertas siguen visibles", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const ruta of ["/contacto", "/conductores", "/aliados"]) {
    await page.goto(ruta);
    await page.waitForTimeout(900);
    await expect(page.locator('main a[href*="wa.me"]').first()).toBeVisible();
  }
  await ctx.close();
});
