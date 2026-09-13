# Sitio público de +58Express

**Estado:** publicado y verificado en <https://mas58express.com>
**Rama:** `feat/public-marketing-site` · **HEAD:** `9209404`
**Fecha del informe:** 12 de septiembre de 2026

---

## 1. Qué se entregó

Un sitio público de diez rutas construido desde cero, con el scroll como
mecanismo narrativo y no como adorno. No es una landing de bloques: la portada
cuenta cómo funciona una carrera siguiendo la máquina de estados real del
backend, y las páginas internas desarrollan cada lado del producto.

Identidad: **amarillo señal, grafito, negro y blanco**. El amarillo nunca es
fondo — es dirección. El azul de la referencia comercial no aparece en ninguna
parte.

| Ruta | Qué es |
|---|---|
| `/` | Portada: hero, escena de la carrera, servicios, los dos lados, cobertura con mapa, seguridad, descarga |
| `/servicios` | Los diez servicios de la plataforma |
| `/pasajeros` | Lo que hace la app para quien pide |
| `/conductores` | Lo que hace la app para quien conduce, y cómo se ingresa |
| `/seguridad` | Verificación, registro del viaje y ubicación en vivo |
| `/aliados` | Comercios: presencia en la app y entregas |
| `/nosotros` | Origen y ámbito |
| `/ayuda` | Preguntas frecuentes |
| `/privacidad`, `/terminos` | Estructura legal, con el texto pendiente declarado |

`sitemap.xml` y `robots.txt` se generan desde el código.

---

## 2. Arquitectura

```
web/
├── app/
│   ├── layout.tsx          tipografías, metadatos base, salto de contenido
│   ├── page.tsx            portada
│   ├── globals.css         tokens @theme, superficies del navegador, mapa, movimiento
│   ├── fonts/              Big Shoulders + Outfit (WOFF2 subseteado)
│   ├── sitemap.ts, robots.ts
│   └── <nueve rutas>/page.tsx
├── components/
│   ├── home/               Hero, RideScene, Servicios, DosLados, Cobertura, Seguridad, Descarga
│   ├── map/MapaZonas.tsx   Leaflet con teselas OSM y tema propio
│   ├── motion/             SmoothScroll (Lenis+GSAP), Reveal (IntersectionObserver)
│   ├── phone/              InteractivePhone (teléfono 3D por CSS)
│   ├── site/               Navbar, Footer, PageShell
│   └── ui/                 Button, Logo
├── lib/                    content.ts, zonas.ts, motion.ts, seo.ts
└── tests/                  sitio.spec.ts, accesibilidad.spec.ts
```

**Stack:** Next.js 16.3.5 (App Router, Turbopack), React 19.2.8, Tailwind CSS 4,
GSAP 3.15 (+ScrollTrigger, +MotionPathPlugin), Lenis 1.3, Leaflet 1.9,
Playwright 1.63 + axe-core 4.13.

---

## 3. Movimiento

Un solo temperamento en todo el sitio, centralizado en `lib/motion.ts`.

- **Lenis** interpola la posición del scroll sin secuestrarlo: no cambia la
  dirección ni bloquea al usuario. Acoplado a ScrollTrigger para que las escenas
  y el scroll compartan reloj.
- **GSAP + ScrollTrigger** solo donde el scroll controla una escena
  (`RideScene`). Engancharlo a cada elemento del sitio sería caro sin ganar nada.
- **IntersectionObserver** (`Reveal`) para las entradas simples, con una red de
  seguridad de 1,6 s: ningún contenido puede quedarse invisible porque el
  observador no llegue a disparar.
- **`prefers-reduced-motion`** desactiva Lenis por completo, deja el scroll
  nativo del navegador y convierte la escena de la carrera en una lista legible a
  su altura natural.

### La escena de la carrera

440 vh de recorrido (260 vh en móvil), un solo plano continuo: el teléfono nunca
se va, la cámara viaja a su alrededor. Los cinco pasos siguen los estados reales
del backend — `DRAFT → SEARCHING → DRIVER_ASSIGNED → IN_TRIP → COMPLETED`.

El paso saliente se retira **antes** de que entre el siguiente: dos titulares
cruzándose son ilegibles por suave que sea el fundido.

### El mapa

Leaflet con teselas de OpenStreetMap y el aspecto grafito conseguido con un
filtro CSS sobre las teselas. La lista de zonas manda la cámara: al recorrer
Santa Cruz de Mara → El Moján → Maracaibo, el mapa vuela a cada una.

> **CARTO dejó de servir basemaps sin clave.** Sus teselas vuelven estampadas con
> «API KEY REQUIRED». La aplicación móvil usa exactamente esa URL en
> `src/utils/constants.js:5` y tiene, por tanto, el mismo fallo en producción. No
> se tocó, por la restricción de no modificar Mobile para construir la landing.

---

## 4. Auditoría y correcciones

Se auditó el sitio **ya publicado** con seis auditores independientes
(accesibilidad, responsive, rendimiento, SEO, veracidad de contenido y craft
visual). Cada hallazgo pasó por dos verificadores adversariales antes de darse
por bueno: 20 confirmados, 2 refutados.

### Confirmados y corregidos

**Accesibilidad**

1. **El menú móvil medía cero de alto en todos los teléfonos.** Vivía dentro del
   `<header>`, que al abrirse recibe `backdrop-blur`; un `backdrop-filter`
   convierte al elemento en bloque contenedor de sus descendientes `fixed`, así
   que `top:72px; bottom:0` se resolvían contra los 72 px de la cabecera. La
   navegación era inaccesible en las diez rutas. El panel es ahora hermano del
   header.
2. El panel no atrapaba el foco ni desactivaba el fondo: el tabulador salía a
   botones tapados. Ahora se anuncia como diálogo, cicla el foco y lo devuelve a
   la hamburguesa al cerrarse.
3. «Saltar al contenido» desplazaba la página pero no movía el foco —
   `SmoothScroll` cancelaba el ancla nativo. El destino recibe el foco.
4. Con `prefers-reduced-motion` los cinco pasos de la carrera se pintaban uno
   encima de otro, ilegibles, tras 4,4 pantallas de scroll.
5. `role="img"` sobre el contenedor de Leaflet, que contiene cinco elementos
   enfocables: los hijos pasaban a presentacionales y la atribución obligatoria
   de OpenStreetMap desaparecía para los lectores de pantalla.
6. `<h3>`, `<div>` y `<p>` dentro de un `<button>` en las tarjetas de zona, con
   el `alt` de la miniatura duplicando el texto visible.
7. Las tres pantallas ocultas del teléfono seguían en el árbol de accesibilidad
   (opacidad 0 no basta).
8. Las descripciones inactivas de Servicios se ocultaban con texto transparente:
   invisibles y, aun así, dentro del nombre accesible de cada botón.
9. Los enlaces de la barra medían 39 px de alto, por debajo del mínimo de 44 px.
10. `<dl> > div > div > dt` en `/seguridad` y `/ayuda`.

**Responsive**

11. La moto del hero pisaba el párrafo entre 1024 px y ~1250 px (solape real de
    139 × 105 px).
12. En móvil la moto se cortaba ~50 % fuera del viewport.
13. `RideScene` cobraba 4,4 pantallas de scroll en móvil con el teléfono oculto.

**Rendimiento**

14. Las cuatro capturas de la app se servían sin optimizar: 808 KB de originales
    a 941 px, sin variantes responsive. Vuelven al optimizador con calidad 92,
    que conserva la nitidez del texto fino.
15. `login.webp` (122 KB) se descargaba en la portada para quedar invisible.
16. La moto se pedía a 3840 px de ancho para un cuadro de 294 px CSS.
17. Leaflet, su CSS y las teselas se cargaban al hidratar, con el mapa a 7.500 px
    de scroll.
18. Las tres tipografías se servían en TTF sin subsetear: 205 KB (110 KB con
    brotli) → **49 KB** en WOFF2 subseteado a latín.
19. Los tres PNG de icono venían en color verdadero: 435 KB → 149 KB.

**SEO y veracidad**

20. Ninguna página tenía `og:image`: al compartir cualquier enlace no se veía
    ninguna imagen, con `twitter:card` declarada como imagen grande. Se creó una
    imagen social 1200 × 630 con la identidad de campaña.
21. Open Graph idéntico en las diez rutas, con `og:url` siempre a la portada, en
    contradicción con el canonical de cada página.
22. `robots.txt` bloqueaba `/privacidad` y `/terminos`, impidiendo que el
    rastreador llegara a leer su propio `noindex`: las dos directivas se anulaban.
23. `/pasajeros` estaba en el sitemap y no se enlazaba desde ninguna parte.
24. El botón principal decía «Descargar app» mientras el propio sitio explica que
    la aplicación no está publicada. Ahora lee de `STORES.available`, así que el
    texto cambiará solo cuando la app salga.
25. «Conduce con +58Express · +58Express»: la marca dicha dos veces en el title.
26. `/aliados` publicaba al visitante una nota editorial interna.

### Refutados

- «La moto del hero es el LCP y se sirve con `lazy`» — el LCP es el párrafo del
  hero, no la moto.
- «El mapa SVG de la escena deja el trazado fuera del viewport en móvil» — el
  encuadre es deliberado.

---

## 5. Rendimiento

Lighthouse sobre <https://mas58express.com>, build de producción:

| | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Escritorio | **100** | **100** | **100** | **100** |
| Móvil | **92** | **100** | **100** | **100** |

Núcleo de métricas web (móvil, 4G lento simulado): **LCP 3,1 s · CLS 0 · TBT
40 ms**. En escritorio, LCP 0,5 s.

Peso total de la portada: **514 KB**. El LCP móvil es el párrafo del hero y su
retraso viene del intercambio de tipografía bajo el estrangulamiento simulado de
Lighthouse; con CLS 0 y TBT 40 ms, en red real el margen es mucho mayor.

---

## 6. Accesibilidad

Barrido **WCAG 2.1 AA con axe-core** sobre las diez rutas, en móvil (390) y
escritorio (1440), recorriendo la página entera antes de analizar —buena parte
del sitio se revela con el scroll—, más el menú móvil abierto:
**21 análisis, cero infracciones.**

Además, verificado a mano: salto de contenido funcional, trampa de foco del menú,
retorno del foco al cerrar, orden de tabulación, `prefers-reduced-motion`,
contraste de texto sobre las superficies de grafito y área táctil de 44 px.

---

## 7. Pruebas

`npm test` — 62 pruebas de Playwright sobre el build de producción.
`SITIO=https://mas58express.com npm test` corre la misma suite contra el sitio
publicado; **las 62 pasan en producción**.

Cada guarda nace de un fallo real de la auditoría:

- Navegación móvil: el panel abre a pantalla completa, atrapa el foco, lo
  devuelve al cerrar.
- Salto de contenido: el foco llega a `<main>`.
- Hero: la moto no pisa el párrafo ni se sale, en diez anchos
  (360 / 390 / 430 / 768 / 1024 / 1100 / 1152 / 1280 / 1440 / 1920).
- Sin scroll horizontal en ninguno de esos anchos.
- La portada no descarga pantallas que no enseña.
- El mapa no pide teselas desde arriba del todo y sí monta al acercarse.
- Estructura: ningún encabezado dentro de un botón, una sola pantalla anunciada,
  el mapa no es `role="img"`.
- Movimiento reducido: los cinco pasos ocupan posiciones distintas y la sección
  no cobra scroll.
- Metadatos: `og:image` y `twitter:image` en las diez rutas, `og:url` igual al
  canonical, `robots.txt` sin bloqueos, y **toda ruta del sitemap alcanzable
  desde el sitio**.

---

## 8. Contenido: qué se dice y qué no

Regla del proyecto, respetada sin excepción: **ni una cifra que no se pueda
respaldar.** No hay usuarios, viajes diarios, ciudades cubiertas, conductores,
socios, ratings, descuentos ni estadísticas. No hay logotipos de terceros. No hay
enlace a tiendas: la app no está publicada y el sitio lo dice con todas las
letras en `/ayuda`.

Las capturas del teléfono son pantallas reales de la aplicación. Dos que estaban
mal catalogadas (`c-oferta2` y `c-tras-aceptar`, ambas el historial vacío del
conductor) se retiraron.

---

## 9. Infraestructura

El dominio se asignó tras comprobar que el apex estaba libre (404) y que
`resend._domainkey` (DKIM), el TXT de `send` (SPF) + MX, `api-staging` → Railway
y `admin-staging` viven en registros separados. Tras el cambio: las diez rutas
responden 200, y `admin-staging` y `www` siguen en 200. **No se tocó nada del
correo, de Railway ni de los subdominios existentes.** Tampoco se modificó
Mobile, Admin ni Backend.

---

## 10. Pendiente

**Decisiones tuyas**

1. **Las dos fotos de campaña que pasaste.** La segunda muestra un **logotipo
   SUZUKI legible y una placa visible** —el mismo problema de marca por el que
   se quitó la Bera— y su conductor lleva **pasamontañas**, que contradice de
   plano un mensaje de «Transporte Seguro». No están en el sitio, esperando tu
   decisión.
2. **Textos legales.** `/privacidad` y `/terminos` existen con su estructura y
   declaran abiertamente que el texto no está redactado. Necesitan redacción real
   antes de publicar la app en las tiendas.

**Técnico**

3. **La app móvil tiene el mismo fallo de mapa.** `src/utils/constants.js:5`
   apunta a las teselas de CARTO, que ya no se sirven sin clave. Es la misma
   corrección de una línea que se aplicó aquí.
4. **`www` sirve el sitio con 200 en vez de redirigir al apex.** Ambos declaran
   el mismo canonical, así que Google consolidará, pero lo limpio es una
   redirección permanente en la configuración de dominios de Vercel.
5. **Cookies y analítica.** No hay banner porque no hay analítica ni cookies de
   terceros. En cuanto se añada cualquier medición, hace falta consentimiento.
6. **Deuda de forma menor**, ya identificada y sin urgencia: la altura de la barra
   (72 px) está escrita a mano en tres archivos; el gris `#3a3a45` del hover de la
   barra de desplazamiento está fuera de la rampa de tokens; `Button` arrastra una
   variante muerta y estados `disabled` que `ButtonLink` no puede aplicar.

---

## 11. Historial de la rama

```
9209404  perf(web): iconos de 435 KB a 149 KB y fuera el componente Zonas muerto
c56c7e2  fix(web): detalles menores de la auditoria y barrido axe en las diez rutas
9a3647b  fix(web): los veinte hallazgos confirmados de la auditoria del sitio
bf1ebce  feat(web): mapa interactivo de cobertura, sin claves de API
7a5a6c3  feat(web): las nueve paginas internas, sitemap y robots
fd00400  feat(web): dos lados, seguridad, descarga y pie
0e7946d  feat(web): la moto real de +58Express en el hero
52f79ce  fix(web): calidad de imagen premium en las pantallas de la app
5f4b35e  feat(web): pantallas terminadas de la app y motorizado sin marca de terceros
055412a  feat(web): scrollytelling de la carrera y catalogo de pantallas verificado
f9cb7e7  feat(web): seccion de zonas con las tres plazas de enfoque
b778b70  feat(web): cimientos del sitio publico premium
```
