# Fase Web 0 — de folleto a sitio con puertas

**Objetivo:** que un visitante interesado deje de chocar contra una pared, sin
empezar todavía a pedir datos personales.

| | |
|---|---|
| **Rama** | `feat/public-marketing-site` |
| **HEAD inicial** | `c80048e` |
| **HEAD final** | `856bef4` |
| **Vista previa** | <https://plus58express-2eu5lptwm-delivery58.vercel.app> |
| **Producción** | **sin tocar** — sigue en el despliegue anterior |
| **Fecha** | 13 de septiembre de 2026 |

---

## 1. Criterio de terminación

| Condición | Estado |
|---|---|
| Un visitante puede contactar con +58Express | **PASA** — WhatsApp y correo en las diez rutas |
| Puede expresar interés como conductor | **PASA** — CTA propio en `/conductores` y en `/contacto` |
| Puede expresar interés como aliado | **PASA** — CTA propio en `/aliados` y en `/contacto` |
| Nunca termina en una pared | **PASA** — `/conductores`, `/aliados`, `/ayuda` y la zona de descarga cierran con una acción |
| Tiene una página de contacto real | **PASA** — `/contacto`, con cuatro puertas por intención |
| Ve una 404 profesional | **PASA** — propia, en español, con diez salidas |
| La web mantiene su calidad visual | **PASA** — Hero, scrollytelling e identidad sin tocar |
| Las cabeceras de seguridad están activas | **PASA** — CSP, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS |
| Ningún formulario finge funcionar | **PASA** — cero campos en todo el sitio; la lista de espera está apagada |
| Ningún dato de contacto inventado | **PASA** — sólo lo que confirmaste; las redes se quedan apagadas |

---

## 2. Contacto: una sola fuente

`web/lib/contact.ts` concentra WhatsApp, correo, redes, los mensajes prellenados
por intención y el interruptor de la lista de espera. Ningún componente repite un
dato de contacto.

| Canal | Valor | Estado |
|---|---|---|
| WhatsApp | `+58 412-514-3242` → `wa.me/584125143242` | **Activo** (confirmado por ti) |
| Correo | `58expressapp@gmail.com` | **Activo** (Gmail: recibe de verdad) |
| Instagram · TikTok · Facebook | — | **Apagadas** (ver abajo) |

### Por qué las redes no se publicaron

Diste los **nombres visibles** («+58Express»), no los usuarios — y el signo `+` no
es válido en un identificador de ninguna de las tres plataformas. Probé cuatro
candidatos razonables (`58express`, `mas58express`, `plus58express`,
`58expressapp`) en las tres redes: **todas devuelven 200 para cualquier usuario
inventado**, porque son muros de acceso. No hay forma de verificar por HTTP, y
enlazar a un usuario adivinado mandaría a tu gente al perfil de otra persona.

Quedan declaradas y apagadas en `lib/contact.ts`. **Encenderlas es cambiar
`activo: false` a `true` y pegar la URL** — un minuto, en cuanto me pases el
enlace exacto de cada perfil (el que sale al pulsar «compartir perfil»).

### Un aviso que salió del rastreo

El único número venezolano que había en el repositorio es `04127844848`, en
`src/pages/driver/earnings.js:6` y `src/pages/passenger/wallet.js:10`: es el
**destino de Pago Móvil**, junto a la cédula `26242188`. No se publicó, claro —
pero conviene que sepas que hoy viaja dentro del bundle de la aplicación.

---

## 3. WhatsApp contextual

Cuatro mensajes distintos, para que quien atiende sepa de qué va la conversación
sin preguntar:

| Intención | Mensaje | Dónde aparece |
|---|---|---|
| `conductor` | «Hola, vi la página de +58Express y estoy interesado en trabajar como conductor.» | `/conductores`, `/contacto` |
| `aliado` | «Hola, vi la página de +58Express y quiero información para ser aliado comercial.» | `/aliados`, `/contacto` |
| `soporte` | «Hola, necesito ayuda con +58Express.» | `/ayuda`, `/contacto` |
| `general` | «Hola, quisiera información sobre +58Express.» | portada (descarga), pie, `/contacto` |

El texto se codifica entero (lleva tildes y comas). Los enlaces abren en pestaña
nueva con `rel="noopener noreferrer"`: en el móvil saltan a la aplicación y en el
escritorio a WhatsApp Web. Cada enlace añade «(abre WhatsApp)» para lector de
pantalla, porque «Hablar con el equipo» por sí solo no lo delata.

---

## 4. Las puertas, una por una

| Página | Antes | Ahora |
|---|---|---|
| **`/contacto`** (nueva) | No existía | Cuatro puertas: conducir, comercio, viajar, ayuda. Cada una con su WhatsApp y su correo, más los canales directos |
| **`/conductores`** | Terminaba en «Contenido pendiente» | Cierra con «Hablar con el equipo». El aviso viejo decía que el formulario «vive dentro de la aplicación»: era inexacto y se retiró |
| **`/aliados`** | «Se coordina con el equipo» — sin forma de alcanzarlo | «Quiero ser aliado», con el copy honesto que pediste. Sin prometer plazos |
| **`/ayuda`** | Seis preguntas y ninguna salida | Cierra con «Pedir ayuda» |
| **Zona de descarga** | «Próximamente» y final muerto | Sigue sin fingir un formulario, pero ofrece «Avísenme cuando salga» por WhatsApp |
| **Pie** | Navegación y formas de pago | Centro institucional: canales arriba, y navegación agrupada en Producto / Trabaja con nosotros / Empresa / Formas de pago |
| **404** | La de fábrica de Next, en inglés, un enlace | Propia, en grafito y amarillo, con diez salidas |

**`/contacto` no tiene una quinta puerta para «empresas»** a propósito: hoy no
existe una oferta corporativa distinta, y una puerta que lleva exactamente al
mismo sitio con otro rótulo es decorado. Entra en cuanto exista.

---

## 5. Lista de espera: preparada y apagada

`WAITLIST_ENABLED = false` en `lib/contact.ts`. Con el interruptor apagado **no se
pinta ningún campo** — hay una prueba que lo vigila. Lo que se ve es un mensaje
honesto y el canal que sí existe.

Para encenderla hace falta, y en este orden: política de privacidad válida y
responsable identificado · dónde se guarda el dato · doble confirmación por correo
· antibot · límite de peticiones. El inventario está en
[`web-legal-requirements.md`](./web-legal-requirements.md).

---

## 6. Cabeceras de seguridad

Antes sólo llegaba `Strict-Transport-Security`. Ahora, en todas las rutas:

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; object-src 'none';
  img-src 'self' data: https://tile.openstreetmap.org;
  font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
  connect-src 'self'; manifest-src 'self'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(),
  magnetometer=(), microphone=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000
```

**Cada permiso está justificado por algo que el sitio hace:**

- `img-src … tile.openstreetmap.org` — sin esto la sección de cobertura se queda
  en gris. Es el único origen externo de todo el sitio.
- `style-src 'unsafe-inline'` — GSAP reescribe estilos en cada fotograma y React
  los pone en línea (el teléfono 3D, el parallax). Sin esto no hay escena.
- `script-src 'unsafe-inline'` — Next inyecta los datos de hidratación en un
  `<script>` en línea. Evitarlo exige un *nonce* por petición, lo que obligaría a
  renderizar cada página en el servidor: el sitio dejaría de ser estático a cambio
  de muy poco, porque no acepta entradas de usuario ni ejecuta código de terceros.
  **Cuando exista el primer formulario, esta decisión se revisa.**

**`frame-ancestors 'none'` sustituye a `X-Frame-Options`** en vez de duplicarlo,
como pediste: todos los navegadores que reciben esta web lo entienden.

**HSTS se deja como estaba** (`max-age=63072000`, sin `includeSubDomains` ni
`preload`). Añadirlos obligaría a HTTPS a **todos** los subdominios durante dos
años y es casi irreversible en los navegadores que ya lo hayan visto: es una
decisión de dominio, no de este proyecto. Recomendado, pero con tu visto bueno.

**En desarrollo la política se relaja** (`unsafe-eval` y el WebSocket del recargado
en caliente): sin eso `npm run dev` deja de funcionar. En producción, nunca.

**Efecto conocido en vistas previas:** la CSP bloquea la barra de Vercel
(`vercel.live/_next-live/feedback/feedback.js`). Es correcto — no vamos a abrir el
sitio público a un script de terceros por una herramienta interna — pero explica
que Lighthouse dé 93 en buenas prácticas en la vista previa y 100 en producción.

---

## 7. CORS: el parche exacto, sin aplicar

**Dónde vive la lista blanca:** `server/index.js:94-102`.

```js
const allowedOrigins = String(process.env.CLIENT_ORIGIN || 'https://plus58express.vercel.app,http://localhost:3000,…')
  .split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
  callback(new Error('ORIGIN_NOT_ALLOWED'));
}}));
```

**Estado confirmado hoy** (preflight real, no supuesto):

```
OPTIONS /api/driver-applications  Origin: https://mas58express.com → 403 ORIGIN_NOT_ALLOWED
GET     /api/health               Origin: http://localhost:3000    → 200
```

**El parche es de variable, no de código.** En Railway, entorno **staging**,
servicio `motoRide`:

> **APPEND**, no reemplazar, a `CLIENT_ORIGIN`:
> `,https://mas58express.com,https://www.mas58express.com`

**Por qué append y no escribir el valor entero:** la integración devuelve las
variables redactadas, así que no puedo leer el valor actual — y hay indicio de que
el valor efectivo en Railway **no coincide** con el de omisión del código (el
origen `https://plus58express.vercel.app`, que sí está en el código, **también
recibe 403**). Sobrescribirlo a ciegas rompería lo que hoy funcione.

**No se aplicó** porque está fuera de la rama web, como pediste.

**Un límite que conviene saber ya:** la comparación es exacta (`includes(origin)`),
así que **las vistas previas de Vercel no se pueden permitir con un patrón** — cada
una tiene una URL distinta. O se prueban los formularios contra producción, o hace
falta un cambio de código en el backend para aceptar un sufijo. No lo recomiendo
sin pensarlo: un sufijo mal escrito abre el API a cualquier `*.vercel.app`.

**Ningún formulario de conductor debe lanzarse antes de probar esto.**

---

## 8. `admin-staging.mas58express.com`

Documentado, **no modificado**.

| Comprobación | Resultado |
|---|---|
| `/` | **200** — sirve una SPA |
| `/robots.txt` | **200, pero devuelve el HTML de la SPA** → no existe robots.txt |
| Cabecera `X-Robots-Tag` | **ausente** |
| `<meta name="robots">` | **ausente** |
| `/assets/index-*.js` | **200**, 611 KB, público |
| Qué contiene el bundle | «Centro de Operaciones» ×2, «Mapa de Flota», **«SOLICITUD DE CONDUCTOR» ×2**, `driver-applications` ×8 |
| Autenticación | **De servidor** — las vistas no se pintan sin sesión válida |
| Título | `+58express \| Tu moto, al instante` (identidad antigua) |

**Qué es público:** el código del panel y la ruta de postulación de conductor.
**Qué está autenticado:** los datos. No es una brecha — pero sí superficie
regalada, e **indexable**: un buscador puede listar el panel administrativo bajo tu
dominio de marca, con otra identidad visual y un lema que contradice el «todavía no
está publicada» que el sitio repite en diez páginas.

**Solución mínima propuesta** (un cambio, en el proyecto de Vercel del Admin, fuera
de esta rama): añadir `X-Robots-Tag: noindex, nofollow` a todas sus respuestas, o
publicar un `robots.txt` real con `Disallow: /`. No lo toqué.

**Por eso no enlacé la postulación desde `/conductores`**, aunque técnicamente
funcionaría: mandaría a un aspirante a un panel administrativo con la marca vieja.
Mi recomendación sigue siendo la tuya — formulario propio dentro de
`mas58express.com` contra `driver-applications` — y eso es Fase 2.

---

## 9. Correo del dominio: auditoría y plan

**Estado hoy, comprobado en DNS:**

| Registro | Resultado |
|---|---|
| `mas58express.com` MX | **SIN REGISTRO** — el dominio no puede recibir correo |
| `mas58express.com` TXT (SPF) | **SIN REGISTRO** |
| `_dmarc.mas58express.com` | **SIN REGISTRO** |
| `send.mas58express.com` MX + SPF + `resend._domainkey` | Presentes — es el canal de **salida** de Resend |
| Servidores de nombres | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` |

**Dos consecuencias.** No se puede publicar `hola@mas58express.com` (se perdería
cada mensaje) — por eso el sitio usa el Gmail. Y, más serio: **sin SPF ni DMARC en
el apex, cualquiera puede enviar correo firmando como `@mas58express.com`** y
ningún receptor lo rechazará.

### Lo que no cuesta nada y no depende de elegir proveedor

Dos registros TXT en el DNS de Vercel, ahora mismo, **aunque no haya buzón**:

```
mas58express.com          TXT   "v=spf1 -all"
_dmarc.mas58express.com   TXT   "v=DMARC1; p=none; rua=mailto:58expressapp@gmail.com"
```

El primero declara que **nada** envía desde el dominio desnudo (Resend usa `send.`,
que tiene su propio SPF). El segundo empieza a **vigilar** sin rechazar nada; una
vez visto un mes de informes, se sube a `p=quarantine` y luego a `p=reject`.

> No los apliqué: dijiste que no tocara DNS. Son dos registros y los aplico en
> cuanto me digas.

### Para recibir en `@mas58express.com` — dos opciones

| | **Zoho Mail (plan gratuito)** | **Google Workspace Business Starter** |
|---|---|---|
| **Coste** | **0 €** | ~7 €/usuario/mes |
| **Qué da** | Hasta 5 buzones reales, 5 GB cada uno, sólo webmail y app móvil (sin IMAP en el plan gratuito) | Gmail completo, 30 GB, IMAP, y **hasta 30 alias por usuario sin coste** |
| **`hola@` + `soporte@` + `aliados@`** | Tres buzones, o uno con alias | **Un solo usuario con tres alias** — todo cae en la misma bandeja |
| **Compatibilidad** | Registros MX + DKIM en el DNS de Vercel | Igual |
| **Entregabilidad** | Buena | Mejor |
| **Fricción para ustedes** | Interfaz nueva | **Ya viven en Gmail** |

**Recomendación: Google Workspace con UN usuario y tres alias.** Siete euros al mes
es menos que perder un solo conductor por un correo que no llegó, y no cambia la
herramienta que ya usan. Zoho es la opción de coste cero si prefieres no gastar
nada todavía.

**No contraté ni configuré nada.** Ambas exigen decisión tuya y tocar DNS.

---

## 10. Search Console

Preparado, **no ejecutado** — hace falta un paso manual tuyo.

El sitio ya tiene lo que Search Console necesita encontrar: `sitemap.xml` con nueve
rutas (ahora incluye `/contacto`), `robots.txt` sin bloqueos, canonical correcto en
las diez rutas y las dos legales con `noindex` a propósito.

> **El único paso manual, cuando quieras:** entra en
> <https://search.google.com/search-console>, elige **«Prefijo de URL»** con
> `https://mas58express.com`, y pásame el registro TXT que te dé (o dime que
> prefieres verificarlo con la etiqueta HTML y lo añado al `<head>`).
> Después envío el sitemap y reviso indexación.

---

## 11. Analítica

**Sin instalar, como pediste.** El sitio sigue con cero analítica, cero píxeles y
cero cookies.

Para la fase siguiente, la opción que no obliga a banner de consentimiento es una
analítica **sin cookies y sin identificadores personales** (Vercel Web Analytics,
que ya está a un interruptor de distancia en el propio proyecto, o Plausible si se
prefiere autoalojada). El esquema de eventos propuesto está en la auditoría
funcional, §12.

---

## 12. Pruebas

| | |
|---|---|
| Suite total | **81 pruebas** de Playwright (16 nuevas de fase 0) |
| Contra el build local | **80 pasan**, 1 omitida (la redirección `www`, que sólo existe en el dominio real) |
| Contra la vista previa | **81 pasan** |
| Barrido axe WCAG 2.1 AA | **23 análisis** (10 rutas + `/contacto`, móvil y escritorio, más el menú abierto): **0 infracciones** |

Las nuevas vigilan exactamente lo que esta fase abre: que el pie ofrezca WhatsApp y
correo en todas las rutas · que los enlaces abran en pestaña nueva sin fuga de
referente · que los cuatro mensajes prellenados sean distintos y correctos · que
`/conductores`, `/aliados` y `/ayuda` ofrezcan una acción real · que la zona de
descarga **no** pinte ningún campo mientras la lista esté apagada · que la 404
responda 404, esté en español, tenga salidas y **no rompa la hidratación** · que
lleguen todas las cabeceras y que **la CSP no rompa el mapa, el motion ni los
teléfonos** · que el área táctil llegue a 44 px en móvil · que con movimiento
reducido las puertas sigan visibles.

---

## 13. QA responsive

Ocho anchos — **360, 390, 430, 768, 1024, 1280, 1440 y 1920** — sobre `/contacto`,
`/conductores`, `/aliados`, `/ayuda`, la 404 y la portada:

**Cero desbordes horizontales y ningún CTA fuera de cuadro en ninguno.**

Verificado además con la escena completa recorrida: **20 teselas del mapa**, tres
pines, la ruta de GSAP dibujada (`strokeDashoffset: 0px`) y el teléfono con su
pantalla visible — con la CSP activa.

---

## 14. Lighthouse

Sobre el build de producción local, que es la comparación honesta (la vista previa
lleva `X-Robots-Tag: noindex` de Vercel y la barra bloqueada, que le bajan SEO y
buenas prácticas artificialmente):

| | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Escritorio | **100** | **100** | **100** | **100** |
| Móvil | **91** | **100** | **100** | **100** |

`/contacto` en la vista previa: **rendimiento 100, LCP 1,2 s, CLS 0**.

---

## 15. Estado por punto del encargo

| Punto | Estado |
|---|---|
| 1 · Checkpoint | **PASA** — árbol limpio, `c80048e` |
| 2 · Sistema central de contacto | **PASA** |
| 3 · WhatsApp contextual | **PASA** |
| 4 · `/contacto` | **PASA** |
| 5 · `/conductores` abierto | **PASA** — con WhatsApp; el formulario propio es Fase 2 |
| 6 · `/aliados` abierto | **PASA** |
| 7 · Descarga / lista de espera | **PASA** — preparada tras interruptor, sin campo visible |
| 8 · Página 404 | **PASA** |
| 9 · Cabeceras de seguridad | **PASA** |
| 10 · `admin-staging` | **PASA** (documentado, no modificado) |
| 11 · CORS | **PASA PARCIAL** — investigado y parche exacto documentado; **no aplicado** a propósito |
| 12 · Correo del dominio | **PASA PARCIAL** — auditado; SPF/DMARC y proveedor **esperan decisión tuya** |
| 13 · Search Console | **BLOQUEADO** — necesita un paso manual tuyo (§10) |
| 14 · Analítica | **NO IMPLEMENTADO** a propósito |
| 15 · Navegación y pie | **PASA** |
| 16 · Sin formularios públicos | **PASA** |
| 17 · Inventario legal | **PASA** — [`web-legal-requirements.md`](./web-legal-requirements.md) |
| 18 · Tests | **PASA** |
| 19 · QA real | **PASA** |
| 20 · Vista previa | **PASA** — producción sin tocar |

---

## 16. Lo que queda en tus manos

1. **Las URL exactas de Instagram, TikTok y Facebook** — un minuto de trabajo en
   cuanto las tenga.
2. **SPF y DMARC en el apex** (§9): dos registros, coste cero, y hoy tu dominio es
   suplantable.
3. **Elegir proveedor de correo** (§9) para poder publicar `hola@mas58express.com`.
4. **El parche de CORS** (§7) antes de que exista el formulario de conductor.
5. **`X-Robots-Tag: noindex` en admin-staging** (§8).
6. **El paso de Search Console** (§10).
7. **La política de privacidad** — es lo que bloquea la lista de espera y, más
   adelante, la publicación en las tiendas.
8. **Promover a producción** cuando des el visto bueno a la vista previa:
   `vercel deploy --prod` desde `web/`.

---

## 17. Lo que NO se tocó

Hero, scrollytelling, identidad visual, ninguna página rehecha. Ni Mobile, ni
Passenger, ni Driver, ni Navigation SDK, ni dispatch, ni viajes, ni pricing, ni
Postgres, ni los mapas de la aplicación, ni las funcionalidades del Admin. Ni el
backend de Railway: el CORS queda documentado, no aplicado. Ni el DNS. Ni
producción.
