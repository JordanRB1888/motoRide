import { test, expect, type Page } from "@playwright/test";

/**
 * Guardas de regresión del sitio público.
 *
 * Cada bloque nace de un fallo real encontrado en la auditoría de la web ya
 * publicada. No son pruebas de humo: comprueban justo lo que se rompió.
 */

const ANCHOS = [
  { nombre: "360", width: 360, height: 740 },
  { nombre: "390", width: 390, height: 844 },
  { nombre: "430", width: 430, height: 932 },
  { nombre: "768", width: 768, height: 1024 },
  { nombre: "1024", width: 1024, height: 800 },
  { nombre: "1100", width: 1100, height: 800 },
  { nombre: "1152", width: 1152, height: 800 },
  { nombre: "1280", width: 1280, height: 800 },
  { nombre: "1440", width: 1440, height: 900 },
  { nombre: "1920", width: 1920, height: 1080 },
];

const RUTAS = [
  "/",
  "/servicios",
  "/pasajeros",
  "/conductores",
  "/seguridad",
  "/aliados",
  "/nosotros",
  "/ayuda",
  "/privacidad",
  "/terminos",
];

/** Espera a que la hidratación haya montado los efectos del cliente. */
async function listo(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

test.describe("navegación móvil", () => {
  test("el panel se abre a pantalla completa y no mide cero", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await listo(page);

    const panel = page.locator("#menu-movil");
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.waitForTimeout(300);

    const caja = await panel.boundingBox();
    expect(caja, "el panel debe existir en el layout").not.toBeNull();
    // El fallo original: 0 px de alto porque el backdrop-filter del <header>
    // lo convertía en su bloque contenedor.
    expect(caja!.height).toBeGreaterThan(600);
    await expect(panel.getByRole("link", { name: "Servicios" })).toBeVisible();
  });

  test("atrapa el foco y lo devuelve al cerrar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await listo(page);

    const hamburguesa = page.getByRole("button", { name: "Abrir menú" });
    await hamburguesa.click();
    await page.waitForTimeout(300);

    const dentro = await page.evaluate(() =>
      document.getElementById("menu-movil")!.contains(document.activeElement),
    );
    expect(dentro, "el foco entra en el panel al abrirlo").toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await expect(page.locator("#menu-movil")).toBeHidden();
    await expect(hamburguesa).toBeFocused();
  });
});

test("el salto de contenido mueve el foco al contenido", async ({ page }) => {
  await page.goto("/");
  await listo(page);

  await page.keyboard.press("Tab");
  const salto = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(salto).toBeFocused();

  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);

  const destino = await page.evaluate(() => document.activeElement?.id);
  expect(destino).toBe("contenido");
});

test.describe("hero", () => {
  for (const v of ANCHOS) {
    test(`la moto no pisa el texto ni se sale — ${v.nombre}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto("/");
      await listo(page);

      const medidas = await page.evaluate(() => {
        const moto = [...document.querySelectorAll("img")].find((i) =>
          i.src.includes("moto"),
        )!;
        const parrafo = document.querySelector("h1")!.parentElement!.querySelector("p")!;
        const m = moto.getBoundingClientRect();
        const p = parrafo.getBoundingClientRect();
        const solapeX = Math.min(m.right, p.right) - Math.max(m.left, p.left);
        const solapeY = Math.min(m.bottom, p.bottom) - Math.max(m.top, p.top);
        return {
          fueraIzquierda: Math.max(0, -m.left) / m.width,
          fueraDerecha: Math.max(0, m.right - innerWidth) / m.width,
          solapa: solapeX > 0 && solapeY > 0,
        };
      });

      expect(medidas.solapa, "la moto se pinta sobre el párrafo").toBe(false);
      expect(medidas.fueraIzquierda).toBeLessThan(0.12);
      expect(medidas.fueraDerecha).toBeLessThan(0.12);
    });

    test(`sin scroll horizontal — ${v.nombre}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto("/");
      await listo(page);
      const desborda = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(desborda).toBe(false);
    });
  }
});

test("la portada no descarga pantallas que no enseña", async ({ page }) => {
  const pedidas: string[] = [];
  page.on("request", (r) => pedidas.push(r.url()));
  await page.goto("/");
  await listo(page);

  // login.webp y map-select.webp no son la pantalla activa de ningún teléfono
  // de la portada: pasarlas al componente las descargaba para dejarlas a 0.
  expect(pedidas.filter((u) => u.includes("login.webp"))).toHaveLength(0);
});

test("el mapa no se carga hasta que se acerca", async ({ page }) => {
  const teselas = () => pedidas.filter((u) => u.includes("tile.openstreetmap.org"));
  const pedidas: string[] = [];
  page.on("request", (r) => pedidas.push(r.url()));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await listo(page);
  expect(teselas(), "el mapa no debe pedir teselas desde arriba del todo").toHaveLength(0);

  await page.locator("#cobertura").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  expect(teselas().length, "al llegar a Cobertura el mapa debe montar").toBeGreaterThan(0);
  await expect(page.locator("#cobertura .leaflet-container")).toBeVisible();
});

test.describe("accesibilidad estructural", () => {
  test("ningún encabezado dentro de un botón", async ({ page }) => {
    await page.goto("/");
    await listo(page);
    const cuantos = await page.evaluate(
      () => document.querySelectorAll("button h1, button h2, button h3, button h4").length,
    );
    expect(cuantos).toBe(0);
  });

  test("solo se anuncia la pantalla visible del teléfono", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await listo(page);
    await page.locator("#servicios").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    const visibles = await page.evaluate(() => {
      const tel = document.querySelector("#servicios [data-phone-tilt]")!;
      return [...tel.querySelectorAll("[data-phone-screen]")].filter(
        (n) => getComputedStyle(n as HTMLElement).visibility === "visible",
      ).length;
    });
    expect(visibles).toBe(1);
  });

  test("el mapa no es role=img con hijos enfocables", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await listo(page);
    await page.locator("#cobertura").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);

    const rol = await page.getAttribute("#cobertura .leaflet-container", "role");
    expect(rol).toBe("region");
  });
});

test("con movimiento reducido los pasos de la carrera no se solapan", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await listo(page);

  const cajas = await page.evaluate(() =>
    [...document.querySelectorAll("[data-step]")].map((n) => {
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top + scrollY), alto: Math.round(r.height) };
    }),
  );
  const tops = new Set(cajas.map((c) => c.top));
  expect(tops.size, "los cinco pasos deben ocupar posiciones distintas").toBe(cajas.length);

  const alturaSeccion = await page.evaluate(
    () => document.querySelector("[data-ride-scene]")!.getBoundingClientRect().height / innerHeight,
  );
  expect(alturaSeccion, "sin animación la sección no debe cobrar scroll").toBeLessThan(2);
  await ctx.close();
});

test.describe("metadatos", () => {
  for (const ruta of RUTAS) {
    test(`Open Graph propio en ${ruta}`, async ({ page }) => {
      await page.goto(ruta);
      const og = await page.evaluate(() => ({
        image: document
          .querySelector('meta[property="og:image"]')
          ?.getAttribute("content"),
        url: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
        twitter: document
          .querySelector('meta[name="twitter:image"]')
          ?.getAttribute("content"),
      }));
      expect(og.image, "falta og:image").toBeTruthy();
      expect(og.twitter, "falta twitter:image").toBeTruthy();
      expect(og.url, "og:url debe coincidir con el canonical").toBe(og.canonical);
    });
  }

  test("www redirige permanentemente al dominio apex", async ({ request }) => {
    test.skip(!process.env.SITIO, "solo comprobable contra el sitio publicado");
    const r = await request.get("https://www.mas58express.com/conductores", {
      maxRedirects: 0,
    });
    expect(r.status()).toBe(308);
    expect(r.headers()["location"]).toBe("https://mas58express.com/conductores");
  });

  test("la verificación de Search Console viaja en el HTML", async ({ page }) => {
    await page.goto("/");
    const contenido = await page
      .locator('meta[name="google-site-verification"]')
      .getAttribute("content");
    // El testigo lo emite Google y no se inventa ni se cambia: si desaparece o se
    // altera, la propiedad deja de estar verificada sin que nadie se entere.
    expect(contenido).toBe("7Gnxi9z4ffm6oHBCOFvQ3BkTH4OBjk9phLxqoPOcEYw");
  });

  test("robots.txt no bloquea nada", async ({ request }) => {
    const r = await request.get("/robots.txt");
    const texto = await r.text();
    expect(texto).not.toMatch(/Disallow:\s*\/\S/);
    expect(texto).toContain("Sitemap:");
  });

  test("todas las rutas del sitemap se alcanzan desde el sitio", async ({ page, request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const rutas = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      new URL(m[1]).pathname,
    );

    await page.goto("/");
    const enlaces = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].map((a) =>
        new URL((a as HTMLAnchorElement).href).pathname,
      ),
    );
    for (const ruta of rutas) {
      expect(enlaces, `${ruta} está en el sitemap y no se enlaza`).toContain(ruta);
    }
  });
});

test.describe("redes sociales", () => {
  const REDES: [string, string][] = [
    ["TikTok", "https://www.tiktok.com/@58express7"],
    ["Instagram", "https://www.instagram.com/58expressapp"],
    ["Facebook", "https://www.facebook.com/profile.php?id=61594407713816&sk=directory_intro"],
  ];

  for (const ruta of ["/", "/contacto"]) {
    test(`${ruta} enlaza las tres con la dirección exacta`, async ({ page }) => {
      await page.goto(ruta);
      for (const [nombre, url] of REDES) {
        const enlace = page.locator(`a[href="${url}"]`).first();
        await expect(enlace, `${nombre} en ${ruta}`).toHaveAttribute("target", "_blank");
        await expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
        /* Sin texto visible, el nombre accesible lo da el aria-label. Sin él,
           un lector de pantalla anunciaría «enlace» y nada más. */
        const etiqueta = await enlace.getAttribute("aria-label");
        expect(etiqueta, `${nombre} sin aria-label`).toContain(nombre);
      }
    });
  }

  test("el pulgar las alcanza en el móvil", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    for (const [nombre, url] of REDES) {
      const caja = await page.locator(`footer a[href="${url}"]`).first().boundingBox();
      expect(caja, `${nombre} no se pinta en el pie`).not.toBeNull();
      // 44 px es el mínimo cómodo con el pulgar.
      expect(caja!.width, `${nombre} demasiado estrecho`).toBeGreaterThanOrEqual(44);
      expect(caja!.height, `${nombre} demasiado bajo`).toBeGreaterThanOrEqual(44);
    }
  });

  test("no se enseñan los usuarios ni el identificador de Facebook", async ({ page }) => {
    /* El rótulo de marca es «+58Express». Los identificadores internos no
       aportan nada a quien lee y envejecen mal.

       Ojo con la comprobación: el correo público es `58expressapp@gmail.com`, así
       que buscar la cadena suelta «58expressapp» daría un falso positivo sobre
       una dirección que SÍ debe verse. Lo que no puede aparecer es el usuario en
       forma de arroba, ni el identificador numérico de Facebook. */
    await page.goto("/contacto");
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("58express7");
    expect(texto).not.toMatch(/@58express(app)?\b/);
    expect(texto).not.toContain("61594407713816");
  });
});

test.describe("botones sociales de extremo a extremo", () => {
  /**
   * Clic real, ventana real, evento real.
   *
   * Los tres dominios se sirven desde una respuesta falsa en vez de dejar que
   * el navegador salga a internet: así la prueba comprueba A DÓNDE apunta el
   * enlace sin depender de que TikTok esté de pie, ni tardar lo que tarde en
   * cargar. La ventana emergente se abre igual y su URL es la que interesa.
   *
   * El evento se lee de `window.vaq`, la cola del paquete de analítica. Es el
   * sitio exacto donde `track()` deja lo que va a enviar, así que comprobar ahí
   * el nombre y las propiedades es más fiable que esperar una petición de red
   * —que además Vercel no llega a enviar desde un navegador automatizado, por su
   * detección de robots—.
   */
  const CASOS: { red: string; evento: string; url: string }[] = [
    { red: "TikTok", evento: "social_tiktok", url: "https://www.tiktok.com/@58express7" },
    { red: "Instagram", evento: "social_instagram", url: "https://www.instagram.com/58expressapp" },
    {
      red: "Facebook",
      evento: "social_facebook",
      url: "https://www.facebook.com/profile.php?id=61594407713816&sk=directory_intro",
    },
  ];

  const PROHIBIDO = /@|58express7|61594407713816|tiktok\.com|instagram\.com|facebook\.com|http/i;

  for (const { red, evento, url } of CASOS) {
    test(`${red}: abre su URL y registra «${evento}» sin datos personales`, async ({
      page,
      context,
    }) => {
      await context.route(/tiktok\.com|instagram\.com|facebook\.com/, (ruta) =>
        ruta.fulfill({ status: 200, contentType: "text/html", body: "<html><body>ok</body></html>" }),
      );

      await page.goto("/");
      const enlace = page.locator(`footer a[href="${url}"]`).first();
      await enlace.scrollIntoViewIfNeeded();

      const [emergente] = await Promise.all([page.waitForEvent("popup"), enlace.click()]);
      expect(emergente.url(), `${red} abre otra dirección`).toBe(url);
      await emergente.close();

      const encolados = await page.evaluate(() => {
        const cola = (window as unknown as { vaq?: unknown[][] }).vaq ?? [];
        return cola
          .filter((e) => e[0] === "event")
          .map((e) => e[1] as { name?: string; data?: Record<string, unknown> });
      });

      const suyo = encolados.find((e) => e.name === evento);
      expect(suyo, `no se registró ${evento}; llegaron ${JSON.stringify(encolados)}`).toBeTruthy();
      expect(suyo!.data).toEqual({ origen: "footer" });

      /* Y que no se cuele nada más por el camino: ni el usuario de la cuenta, ni
         el identificador de Facebook, ni la dirección completa. */
      for (const [clave, valor] of Object.entries(suyo!.data ?? {})) {
        expect(`${clave}=${String(valor)}`, "propiedad sospechosa").not.toMatch(PROHIBIDO);
      }
    });
  }

  test("desde /contacto el origen cambia, y sigue siendo lo único que viaja", async ({
    page,
    context,
  }) => {
    await context.route(/tiktok\.com/, (ruta) =>
      ruta.fulfill({ status: 200, contentType: "text/html", body: "ok" }),
    );
    await page.goto("/contacto");
    const enlace = page.locator('main a[href="https://www.tiktok.com/@58express7"]').first();
    await enlace.scrollIntoViewIfNeeded();
    const [emergente] = await Promise.all([page.waitForEvent("popup"), enlace.click()]);
    await emergente.close();

    const suyo = await page.evaluate(() => {
      const cola = (window as unknown as { vaq?: unknown[][] }).vaq ?? [];
      const e = cola.filter((x) => x[0] === "event").map((x) => x[1] as { name?: string; data?: unknown });
      return e.find((x) => x.name === "social_tiktok") ?? null;
    });
    expect(suyo).toBeTruthy();
    expect(suyo!.data).toEqual({ origen: "contacto" });
  });
});

test.describe("datos estructurados", () => {
  test("el grafo es válido y no declara nada que no se pueda sostener", async ({ page }) => {
    await page.goto("/");
    const crudo = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(crudo, "no hay JSON-LD").toBeTruthy();

    const grafo = JSON.parse(crudo!);
    expect(grafo["@context"]).toBe("https://schema.org");

    const nodos: Record<string, unknown>[] = grafo["@graph"];
    const org = nodos.find((n) => n["@type"] === "Organization")!;
    const sitio = nodos.find((n) => n["@type"] === "WebSite")!;
    expect(org, "falta Organization").toBeTruthy();
    expect(sitio, "falta WebSite").toBeTruthy();

    expect(org.name).toBe("+58Express");
    expect(org.legalName).toBe("+58 EXPRESS, C.A.");
    expect(org.url).toBe("https://mas58express.com");
    expect(org.sameAs).toEqual([
      "https://www.tiktok.com/@58express7",
      "https://www.instagram.com/58expressapp",
      "https://www.facebook.com/profile.php?id=61594407713816&sk=directory_intro",
    ]);
    // El sitio declara a la empresa como editora, por el mismo identificador.
    expect((sitio.publisher as Record<string, string>)["@id"]).toBe(org["@id"]);

    /* Lo que NUNCA puede aparecer: son afirmaciones comerciales que hoy no se
       pueden sostener, y un buscador que pilla una inventada descuenta el resto. */
    const texto = JSON.stringify(grafo);
    for (const prohibido of [
      "aggregateRating",
      "review",
      "ratingValue",
      "offers",
      "price",
      "openingHours",
      "numberOfEmployees",
      "branchOf",
      "LocalBusiness",
    ]) {
      expect(texto, `declara «${prohibido}», que no se puede sostener`).not.toContain(prohibido);
    }
  });
});

test("el WhatsApp del pie también se mide", async ({ page, context }) => {
  /* Deuda que venía de tres rondas: el botón de las llamadas a la acción medía y
     el enlace del pie no, porque era un <a> suelto. Se veía igual, así que nadie
     lo notaba — y el embudo perdía justo las conversaciones que empiezan desde
     el pie. */
  await context.route(/wa\.me/, (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "ok" }),
  );
  await page.goto("/");
  const enlace = page.locator('footer a[href*="wa.me"]').first();
  await enlace.scrollIntoViewIfNeeded();
  const [emergente] = await Promise.all([page.waitForEvent("popup"), enlace.click()]);
  await emergente.close();

  const evento = await page.evaluate(() => {
    const cola = (window as unknown as { vaq?: unknown[][] }).vaq ?? [];
    return (
      cola
        .filter((e) => e[0] === "event")
        .map((e) => e[1] as { name?: string; data?: Record<string, unknown> })
        .find((e) => e.name === "whatsapp_general") ?? null
    );
  });
  expect(evento, "el WhatsApp del pie no registró whatsapp_general").toBeTruthy();
  expect(evento!.data).toEqual({ origen: "/" });
});
