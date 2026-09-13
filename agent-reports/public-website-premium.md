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

> **CARTO dejó de servir basemaps sin clave.** Devuelve HTTP 200 con una tesela
> estampada con «API KEY REQUIRED», así que el fallo no levanta ningún error.
> **La aplicación tiene exactamente el mismo problema en cuatro mapas vivos** —el
> del pasajero, el del conductor, el de flota y el del panel de operaciones—. No
> se tocó nada de `src/`: el plan completo, con archivos, líneas, reemplazo e
> impacto, está en [`plan-basemap-carto.md`](./plan-basemap-carto.md).

---

## 4. Auditoría y correcciones

Se auditó el sitio **ya publicado** con seis auditores independientes
(accesibilidad, responsive, rendimiento, SEO, veracidad de contenido y craft
visual). Cada hallazgo de severidad alta o media pasó por dos verificadores
adversariales antes de darse por bueno.

Los tres grupos van separados a propósito: no tienen el mismo peso probatorio.

| Origen | Hallazgos | Corregidos | Dónde |
|---|---|---|---|
| Confirmados por verificación adversarial | 20 | **20** | §4.1, nº 1–20 |
| Refutados por los verificadores | 2 | — (no eran fallos) | §4.4 |
| Baja severidad, sin verificación adversarial | 15 | **8** | §4.2, nº 21–28 |
| Encontrados después, midiendo | — | **3** | §4.3, nº 29–31 |
| **Total de correcciones aplicadas** | | **31** | |

De los quince de baja severidad, ocho se corrigieron (§4.2), dos ya quedaban
cubiertos por correcciones confirmadas —la tarjeta social sin imagen y las
descripciones en texto transparente— y **cinco** siguen abiertos: son deuda de
forma sin efecto visible, enumerados en §10.5.

### 4.1 Los veinte confirmados

**Accesibilidad (7)**

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

**Responsive (3)**

8. La moto del hero pisaba el párrafo entre 1024 px y ~1250 px (solape real de
   139 × 105 px).
9. En móvil la moto se cortaba ~50 % fuera del viewport.
10. `RideScene` cobraba 4,4 pantallas de scroll en móvil con el teléfono oculto.

**Rendimiento (5)**

11. Las cuatro capturas de la app se servían sin optimizar: 808 KB de originales
    a 941 px, sin variantes responsive. Vuelven al optimizador con calidad 92,
    que conserva la nitidez del texto fino.
12. `login.webp` (122 KB) se descargaba en la portada para quedar invisible.
13. La moto se pedía a 3840 px de ancho para un cuadro de 294 px CSS.
14. Leaflet, su CSS y las teselas se cargaban al hidratar, con el mapa a 7.500 px
    de scroll.
15. Las tres tipografías se servían en TTF sin subsetear: 205 KB (110 KB con
    brotli) → **49 KB** en WOFF2 subseteado a latín.

**SEO (3)**

16. Ninguna página tenía `og:image`: al compartir cualquier enlace no se veía
    ninguna imagen, con `twitter:card` declarada como imagen grande. Se creó una
    imagen social 1200 × 630 con la identidad de campaña.
17. Open Graph idéntico en las diez rutas, con `og:url` siempre a la portada, en
    contradicción con el canonical de cada página.
18. `robots.txt` bloqueaba `/privacidad` y `/terminos`, impidiendo que el
    rastreador llegara a leer su propio `noindex`: las dos directivas se anulaban.

**Veracidad (2)**

19. `/pasajeros` estaba en el sitemap y no se enlazaba desde ninguna parte.
20. El botón principal decía «Descargar app» mientras el propio sitio explica que
    la aplicación no está publicada. Ahora lee de `STORES.available`, así que el
    texto cambiará solo cuando la app salga.

### 4.2 Los ocho menores corregidos

Sin verificación adversarial —eran de baja severidad— pero comprobados uno a uno
antes de tocarlos.

21. Las descripciones inactivas de Servicios se ocultaban con texto transparente:
    invisibles y, aun así, dentro del nombre accesible de cada botón.
22. Los enlaces de la barra medían 39 px de alto, por debajo del mínimo de 44 px.
23. `<dl> > div > div > dt` en `/seguridad` y `/ayuda`: el modelo de contenido de
    las listas de definición admite un `div` por grupo, no dos.
24. «Conduce con +58Express · +58Express»: la marca dicha dos veces en el title.
25. `/aliados` publicaba al visitante una nota editorial interna.
26. Las tarjetas de zona de Cobertura eran pulsables y no lo parecían.
27. El parallax del hero seguía escuchando el puntero veinte secciones más abajo.
28. **`www` servía el sitio completo con 200 en vez de redirigir al apex.**
    Cerrado en la ronda final — ver §9.

### 4.3 Los tres que aparecieron midiendo

No salieron de la auditoría, sino de leer el informe de Lighthouse y el
inventario de `public/` con calma.

29. Los tres PNG de icono venían en color verdadero: **435 KB → 149 KB**
    cuantizados a 256 colores con difuminado, sin diferencia visible. El favicon
    de 192 px se descarga en cada visita.
30. Cinco SVG de la plantilla de Next (`next.svg`, `vercel.svg`, `file.svg`,
    `globe.svg`, `window.svg`) se servían públicamente sin que nada los
    enlazara — incluidos dos logotipos de terceros. Retirados.
31. `components/home/Zonas.tsx` quedó muerto al fundir zonas y mapa en
    `Cobertura`. Retirado.

### 4.4 Los dos refutados

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
| Móvil | **93** | **100** | **100** | **100** |

Núcleo de métricas web (móvil, 4G lento simulado): **LCP 3,2 s · CLS 0 · TBT
90 ms**. En escritorio: **LCP 0,6 s · CLS 0 · TBT 0 ms**.

Peso total de la portada: **514 KB**. El LCP móvil es el párrafo del hero y su
retraso viene del intercambio de tipografía bajo el estrangulamiento simulado de
Lighthouse; con CLS 0, en red real el margen es mucho mayor.

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

`npm test` — 63 pruebas de Playwright: 42 de comportamiento y 21 de
accesibilidad. Contra el build local pasan 62 y se omite una (la redirección de
`www`, que solo existe en el dominio real). Con
`SITIO=https://mas58express.com npm test` la suite entera corre contra el sitio
publicado: **las 63 pasan en producción**.

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
- `www` responde **308** hacia el apex conservando la ruta (solo contra el sitio
  publicado).

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
y `admin-staging` viven en registros separados. **No se tocó nada del correo, de
Railway ni de los subdominios existentes.** Tampoco se modificó Mobile, Admin ni
Backend.

### `www` → dominio apex

`www` y el apex servían los dos el sitio completo con 200. Se resolvió **sin
tocar DNS**: una regla de redirección en `next.config.ts` que mira la cabecera
`Host`, de modo que solo se dispara para `www.mas58express.com`.

```
https://www.mas58express.com/conductores
  → 308 Permanent Redirect
    Location: https://mas58express.com/conductores   → 200
```

La ruta se conserva en el salto. Se eligió la regla de aplicación en vez de
cambiar el registro DNS precisamente para no rozar la zona: `www` sigue
apuntando a Vercel, igual que antes.

### Estado verificado tras el cambio

| Comprobación | Resultado |
|---|---|
| Las diez rutas del apex | **200** |
| `www` (raíz y ruta profunda) | **308** → apex, y el apex responde 200 |
| `canonical` en las diez rutas | apunta al apex, coincide con `og:url` |
| `admin-staging.mas58express.com` | **200** |
| `api-staging` → CNAME `j3zhwhkt.up.railway.app` | intacto |
| MX de `send` → `feedback-smtp.eu-west-1.amazonses.com` | intacto |
| SPF de `send` (`v=spf1 include:amazonses.com ~all`) | intacto |
| DKIM `resend._domainkey` | intacto |
| Apex → A de Vercel · `www` → A de Vercel | intactos |

### Hallazgo aparte: el API de staging está caído

`api-staging.mas58express.com` responde **404 con `x-railway-fallback: true`**,
es decir, el borde de Railway contesta pero no hay servicio detrás.

**No lo causó nada de este trabajo, y la fecha lo demuestra:** el último
despliegue del servicio `motoRide` en Railway es del **7 de septiembre**, quedó
en estado `FAILED` y falló en la etapa `HEALTHCHECK` (`/api/health`), sobre el
commit `e6cb218`. El DNS de `api-staging` nunca se tocó y sigue apuntando al
mismo destino de Railway.

Se deja anotado, sin actuar: es backend y queda fuera del cierre de la web.

---

## 10. Pendiente

**Decisiones tuyas**

1. **La segunda foto de campaña.** Muestra un **logotipo SUZUKI legible y una
   placa visible** —el mismo problema de marca por el que se quitó la Bera— y su
   conductor lleva **pasamontañas**, que contradice de plano un mensaje de
   «Transporte Seguro». **No está en el repositorio ni publicada**, y así sigue.
   La primera sí está en `public/photo/campaign-hero.jpg`: no tiene ninguna de
   las tres cosas —sin marca de terceros legible, sin placa, sin pasamontañas—,
   ninguna página la enlaza, y se conserva por si se usa más adelante.
2. **Textos legales.** `/privacidad` y `/terminos` existen con su estructura y
   declaran abiertamente que el texto no está redactado. Necesitan redacción real
   antes de publicar la app en las tiendas.

**Técnico**

3. **El basemap de la aplicación.** Cuatro mapas vivos siguen pidiendo teselas a
   CARTO y reciben la marca de agua. Plan completo, sin ejecutar, en
   [`plan-basemap-carto.md`](./plan-basemap-carto.md): archivos, líneas exactas,
   reemplazo sin clave, impacto y orden de verificación. **No requiere ninguna
   credencial nueva.**
4. **El API de staging lleva caído desde el 7 de septiembre** por un despliegue
   fallido en el healthcheck (§9). Ajeno a la web, pero conviene mirarlo.
5. **Deuda de forma menor**, sin efecto visible y sin urgencia: catorce peticiones
   de prefetch RSC compiten con el arranque; la etiqueta de sección se repite a
   mano en siete sitios con tres valores de `tracking` distintos; la altura de la
   barra (72 px) está escrita a mano en tres archivos; el gris `#3a3a45` del hover
   de la barra de desplazamiento está fuera de la rampa de tokens; `Button`
   arrastra una variante muerta y estados `disabled` que `ButtonLink` no puede
   aplicar.

**Decidido y cerrado**

- **Sin analítica ni cookies.** Verificado sobre el HTML servido: cero scripts de
  terceros, cero cookies, cero identificadores. Por eso no hay banner de
  consentimiento — no habría nada que consentir. En cuanto se añada cualquier
  medición, hará falta.

---

## 11. Ronda de cierre

Última pasada, sin tocar diseño: ni Hero, ni escena de scroll, ni movimiento, ni
teléfonos, ni mapa, ni estructura. Solo cierre técnico.

1. **Recuento del informe corregido.** Decía «20 confirmados» y enumeraba 26
   correcciones sin distinguir su origen. Ahora §4 separa los tres grupos con una
   tabla que cuadra: 20 confirmados + 8 menores + 3 encontrados midiendo = 31.
2. **`www` → apex con 308**, por regla de aplicación y sin tocar DNS (§9).
3. **Plan del basemap de CARTO** documentado sin ejecutar, en
   [`plan-basemap-carto.md`](./plan-basemap-carto.md). Ni un archivo de `src/`
   modificado.
4. **Sin analítica ni cookies**, verificado sobre el HTML servido.
5. **Sin imágenes con logotipo SUZUKI, placa visible ni pasamontañas**: ninguna
   está en el repositorio (§10.1).
6. **Limpieza:** cinco SVG de la plantilla de Next que se servían públicamente
   —incluidos los logotipos de Next y de Vercel— y el componente `Zonas.tsx`
   muerto.

### Verificación final, toda contra el sitio publicado

| Comprobación | Resultado |
|---|---|
| `npm run build` (producción) | trece rutas estáticas, sin avisos |
| `tsc --noEmit` | limpio |
| Playwright, 63 pruebas contra `mas58express.com` | **63 pasan** |
| axe WCAG 2.1 AA — 10 rutas × 2 tamaños + menú abierto | **21 análisis, 0 infracciones** |
| Lighthouse escritorio | **100 / 100 / 100 / 100** |
| Lighthouse móvil | **93 / 100 / 100 / 100** |
| Las diez rutas del apex | **200** |
| `www` raíz y rutas profundas | **308** → apex, ruta conservada |
| `canonical` == `og:url` en las diez rutas | coinciden, todas al apex |
| DNS: apex, `www`, `admin-staging`, `api-staging` | intactos |
| Correo: MX, SPF y DKIM de `send` / `resend._domainkey` | intactos |
| `admin-staging` | **200** |
| Scripts de terceros en el HTML | **ninguno** |

---

## 12. Historial de la rama

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
