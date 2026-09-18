# Fase Web 0 — cierre y promoción a producción

**Estado: CERRADA Y EN PRODUCCIÓN.** Certificada contra <https://mas58express.com>, no contra el «Ready» de Vercel.

| | |
|---|---|
| **Rama** | `feat/public-marketing-site` |
| **HEAD promovido** | `70c29ae` |
| **Despliegue Vercel** | `plus58express-kh3iqfpje-delivery58.vercel.app` · target `production` |
| **Proyecto** | `plus58express-web` (`prj_zXhzqEnuZzLJ6bwZ0TUJf1qG6gRR`) |
| **URL de producción** | <https://mas58express.com> |
| **DNS / dominio / proyecto** | **sin tocar** |
| **Fecha** | 13 de septiembre de 2026 |

---

## 1. Verificación en producción

### Rutas

Las once rutas responden **200**, y una inexistente responde **404**:

```
/ · /contacto · /conductores · /aliados · /ayuda · /servicios
/pasajeros · /seguridad · /nosotros · /privacidad · /terminos     → 200
/ruta-que-no-existe                                                → 404
```

**`www` → apex:** `https://www.mas58express.com/contacto` → **308** →
`https://mas58express.com/contacto` → **200**. La ruta se conserva.

### Cabeceras, servidas de verdad

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https://tile.openstreetmap.org;
  font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
  connect-src 'self'; manifest-src 'self'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(),
  magnetometer=(), microphone=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000
```

**Cero violaciones de CSP** con la escena completa recorrida, en escritorio y en móvil.

---

## 2. QA visual, escritorio y móvil

Navegador real sobre la vista previa y después sobre producción, a 1440 px y 390 px.

| Comprobación | Escritorio | Móvil |
|---|---|---|
| Hero intacto (`MUÉVETE. PIDE. RECIBE.`) | **PASA** | **PASA** |
| La moto no pisa el párrafo | **PASA** | **PASA** |
| Scrollytelling: ruta de GSAP dibujada (`strokeDashoffset: 0px`) | **PASA** | **PASA** |
| Mapa: teselas y pines | **PASA** (20 teselas, 3 pines) | **PASA** (6 teselas, 3 pines) |
| Zona de descarga: 1 WhatsApp, **0 campos** | **PASA** | **PASA** |
| Pie: WhatsApp + correo | **PASA** | **PASA** |
| `/contacto`, `/conductores`, `/aliados`, `/ayuda` con su puerta | **PASA** | **PASA** |
| Sin desbordes horizontales | **PASA** | **PASA** |
| 404 propia, HTTP 404, 9 salidas | **PASA** | **PASA** |
| Menú móvil (772 px de alto, 7 enlaces) | — | **PASA** |

**Una mejora aplicada durante el QA:** el menú móvil no ofrecía **Contacto** — en el
teléfono, donde estará el grueso del tráfico, había que bajar hasta el pie. Se añadió
**sólo al menú móvil**; la barra de escritorio se queda en seis entradas para no
apretarla. No es un rediseño: es la misma lista, con una entrada más.

---

## 3. Regresión automática

| | Resultado |
|---|---|
| **TypeScript** (`tsc --noEmit`) | **0 errores** |
| **Build de producción** | Compila; 16 rutas estáticas |
| **Playwright contra producción** | **81 / 81 pasan** |
| **Playwright contra el build local** | 80 pasan, **1 omitida** |
| **axe WCAG 2.1 AA** | **23 análisis · 0 infracciones** |

**La prueba omitida, y por qué es legítima:** «www redirige permanentemente al dominio
apex» lleva `test.skip(!process.env.SITIO)`. Sólo puede comprobarse contra un dominio
real —en `127.0.0.1` no existe `www`—, así que se omite en local y **se ejecuta y pasa
contra producción**, donde sí tiene sentido. Es el único `skip` de la suite.

El barrido axe cubre las once rutas en móvil y escritorio más el menú abierto.

---

## 4. Lighthouse

| | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| **Producción, escritorio** | **100** | **100** | **100** | **100** |
| **Producción, móvil** | **97** | **100** | **100** | **100** |

Núcleo de métricas: **LCP 0,5 s** en escritorio y **2,5 s** en móvil, **CLS 0** en ambos.

**No hay regresión: hay mejora.** El informe de Fase 0 registraba 91–93 en móvil; ahora
97, con el LCP bajando de 3,2 s a 2,5 s.

> Las vistas previas puntúan más bajo (SEO 69, buenas prácticas 93) por dos artefactos
> de Vercel que no existen en producción: la cabecera `X-Robots-Tag: noindex` que pone
> a todas las vistas previa, y la barra `vercel.live` que nuestra CSP bloquea. No es
> una regresión; es que la vista previa no es comparable.

---

## 5. Canales de contacto, verificados en producción

**No se envió ningún mensaje.** Se verificó la URL y el texto prellenado que sale del
HTML servido.

| Intención | Dónde | Texto prellenado |
|---|---|---|
| `general` | portada, pie | «Hola, quisiera información sobre +58Express.» |
| `conductor` | `/conductores`, `/contacto` | «Hola, vi la página de +58Express y estoy interesado en trabajar como conductor.» |
| `aliado` | `/aliados`, `/contacto` | «Hola, vi la página de +58Express y quiero información para ser aliado comercial.» |
| `soporte` | `/ayuda`, `/contacto` | «Hola, necesito ayuda con +58Express.» |

Todos apuntan a `wa.me/584125143242`, con el texto correctamente codificado, `target="_blank"`
y `rel="noopener noreferrer"`.

**Correo:** `mailto:58expressapp@gmail.com` con asunto por intención — verificado
«Quiero conducir con +58Express» y «Quiero ser aliado comercial de +58Express».

**Redes sociales:** siguen apagadas. Faltan las URL exactas de los perfiles.

---

## 6. `admin-staging` — **DETENIDO, no aplicado**

No se aplicó el `X-Robots-Tag`, y la razón es exactamente la excepción que dejaste
prevista.

**Lo que encontré al ir a aplicarlo:**

| | |
|---|---|
| Proyecto | **`mas58express-admin-staging`** — uno **distinto** del sitio (`prj_Uo42chjwakiOOXnZffSmZX2Gaeqk`) |
| Root Directory | **`.`** — la raíz del repositorio, es decir, la aplicación Vite |
| Framework | Vite |

Vercel **no permite cabeceras propias desde los ajustes del panel**: exigen un
`vercel.json` en el proyecto y **volver a desplegarlo**. Y como su raíz es la del
repositorio, un `vercel.json` ahí **también alcanzaría a `plus58express`**, que despliega
desde la misma raíz. Es decir: cambiar otro proyecto, redesplegar Admin y con radio de
alcance sobre un tercero. Justo lo que pediste no hacer sin avisar.

**El cambio exacto, para cuando lo autorices** (dos opciones, la primera es la que
recomiendo):

*Opción A — `vercel.json` en la raíz del repositorio:*

```json
{
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }] }
  ]
}
```

*Opción B — `public/robots.txt` en la raíz del repositorio:*

```
User-agent: *
Disallow: /
```

A es más fuerte: la cabecera viaja en **todas** las respuestas, incluidos los ficheros
JavaScript. B sólo desaconseja el rastreo y no impide que una URL ya conocida se indexe.

**Ambas requieren desplegar de nuevo `mas58express-admin-staging`**, y ambas afectarían
también a `plus58express.vercel.app` si ese proyecto comparte la raíz — cosa que
conviene confirmar antes de tocar nada.

**La web pública no enlaza `admin-staging` en ninguna parte**, como pediste.

---

## 7. SPF y DMARC — verificado, sin tocar

Estado real hoy, consultado contra `1.1.1.1`:

| Registro | Estado |
|---|---|
| `mas58express.com` MX | **SIN REGISTRO** — el dominio no puede recibir correo |
| `mas58express.com` TXT (SPF) | **SIN REGISTRO** |
| `_dmarc.mas58express.com` TXT | **SIN REGISTRO** |
| `send.mas58express.com` MX | `feedback-smtp.eu-west-1.amazonses.com` — **intacto** |
| `send.mas58express.com` TXT | `v=spf1 include:amazonses.com ~all` — **intacto** |
| `resend._domainkey.mas58express.com` | DKIM presente — **intacto** |

**Sin cambios en DNS**, como pediste. Resend, DKIM y `send.` no se tocaron.

**Registros recomendados, para cuando decidas** — y obsérvese que **no llevan proveedor**,
precisamente porque el proveedor de correo corporativo no está elegido:

```
mas58express.com          TXT   "v=spf1 -all"
_dmarc.mas58express.com   TXT   "v=DMARC1; p=none; rua=mailto:58expressapp@gmail.com"
```

El SPF declara que **nada** envía desde el dominio desnudo — cierto hoy, porque Resend
firma desde `send.`. Cuando se elija proveedor de buzón, ese SPF se amplía con su
`include:`. El DMARC empieza en `p=none`: **vigila sin rechazar**, y con un mes de
informes se sube a `quarantine` y luego a `reject`.

**Por qué importa:** hoy cualquiera puede enviar correo firmando como
`@mas58express.com` y ningún receptor lo rechazará.

---

## 8. Search Console

El sitio está listo por su parte: `sitemap.xml` con **nueve rutas** (incluida
`/contacto`), `robots.txt` sin bloqueos, canonical correcto y las dos legales con
`noindex` a propósito y fuera del sitemap.

**No hay token de verificación** en el sitio, y **no me lo invento**.

> **Tu única acción manual:** entra en <https://search.google.com/search-console>, añade
> una propiedad de tipo **«Prefijo de URL»** con `https://mas58express.com`, elige el
> método **«Etiqueta HTML»** y pásame la línea `<meta name="google-site-verification" …>`
> que te muestre. La añado al `<head>`, despliego y verifico.

*(Si prefieres el método DNS, pásame el TXT y lo documento — pero eso toca DNS, que
esta ronda no toca.)*

---

## 9. Privacidad y datos

**`WAITLIST_ENABLED = false` se mantiene.** Cero formularios, cero campos, cero cookies
en producción — hay una prueba que lo vigila.

### Operaciones de datos que exigirá la Fase Web 1

Lista precisa para que quien redacte la política sepa exactamente sobre qué escribe. El
inventario completo está en [`web-legal-requirements.md`](./web-legal-requirements.md).

| # | Operación | Dato | Finalidad | Destino | Retención propuesta |
|---|---|---|---|---|---|
| 1 | **Alta en lista de espera** | Correo; opcional zona y rol | Un solo aviso el día del lanzamiento | Almacén por decidir | Hasta 30 días tras el aviso, o baja |
| 2 | **Confirmación de ese correo** (doble opt-in) | Correo + testigo temporal | Probar que la dirección es de quien la escribe | Resend | El testigo caduca en 24–48 h |
| 3 | **Baja de la lista** | Identificador de baja | Derecho a retirarse en un clic | Mismo almacén | Registro de la baja |
| 4 | **Comprobación antibot** | IP y señales del navegador | Evitar altas automáticas | Cloudflare (Turnstile) | Lo que retenga el proveedor |
| 5 | **Límite de peticiones** | IP, con marca de tiempo | Frenar abuso | En memoria o en el borde | Minutos |
| 6 | **Postulación de conductor** | Nombre, cédula, teléfono, correo, **documento de identidad, licencia, certificado médico**, datos y fotos del vehículo | Verificar y aprobar al conductor | `POST /api/driver-applications` → volumen de Railway | **Distinguir rechazada (plazo corto y borrado) de aprobada (pasa a expediente)** |
| 7 | **Aviso de nueva postulación** | Identificador del expediente | Que el equipo se entere | Panel de administración | Mientras viva el expediente |
| 8 | **Eliminación de cuenta y datos** | Identificación del solicitante | **Requisito de Google Play**, con URL pública | Flujo por construir | Registro de la solicitud |
| 9 | **Analítica sin cookies** (si se aprueba) | Evento, ruta, país, dispositivo — **sin identificador personal** | Medir conversión | Proveedor por decidir | Agregado |

Dos transferencias **ya activas hoy** que la política tendrá que declarar: la IP que ve
**OpenStreetMap** en cada visita a la sección de cobertura, y la que ve **Vercel** al
servir el sitio.

**Esto no es asesoría jurídica.** Es el inventario técnico de los hechos.

---

## 10. CORS — pendiente, documentado

**No se tocó Railway**, como pediste. El estado sigue siendo el confirmado:

```
OPTIONS /api/driver-applications   Origin: https://mas58express.com  → 403 ORIGIN_NOT_ALLOWED
```

**El cambio, para el momento inmediatamente anterior a activar el formulario de
conductor** — en Railway, entorno **staging**, servicio `motoRide`:

> **AÑADIR** al final del valor actual de `CLIENT_ORIGIN` (no reemplazarlo):
> `,https://mas58express.com,https://www.mas58express.com`

La lista blanca se lee en `server/index.js:94-102`. **Append y no reemplazo** porque el
valor efectivo en Railway no coincide con el de omisión del código —`plus58express.vercel.app`,
que sí está en el código, también recibe 403— y sobrescribirlo a ciegas rompería lo que
hoy funcione.

Y un límite que conviene tener presente: la comparación es exacta, así que **las vistas
previa de Vercel no se pueden permitir con un patrón**. O el formulario se prueba contra
producción, o hace falta un cambio de código en el backend — que no recomiendo hacer a la
ligera: un sufijo mal escrito abriría el API a cualquier `*.vercel.app`.

---

## 11. Lo que NO se implementó, a propósito

Formularios · base de datos de contactos · lista de espera · Turnstile · analítica · CMS ·
backend de comercios · formulario de conductor · seguimiento · páginas de SEO local.
Todo eso es Fase Web 1.

---

## 12. Bloqueos que quedan

| # | Bloqueo | De quién depende |
|---|---|---|
| 1 | **Política de privacidad y responsable identificado** | Tuya — bloquea la lista de espera y, más adelante, las tiendas |
| 2 | **URL exactas de Instagram, TikTok y Facebook** | Tuya — un minuto de trabajo cuando las tenga |
| 3 | **SPF y DMARC en el apex** (§7) | Tuya — dos registros, coste cero, y hoy el dominio es suplantable |
| 4 | **Proveedor de correo corporativo** | Tuya — para publicar `hola@mas58express.com` |
| 5 | **Token de Search Console** (§8) | Tuya — una acción |
| 6 | **`X-Robots-Tag` en admin-staging** (§6) | Tuya — exige desplegar otro proyecto |
| 7 | **CORS** (§10) | Inmediatamente antes del formulario de conductor |

---

## 13. Criterio de terminación

| Condición | Estado |
|---|---|
| La Fase Web 0 está en producción en `https://mas58express.com` | **PASA** |
| Un visitante puede contactar | **PASA** — WhatsApp y correo en todas las rutas |
| Puede expresar interés como conductor y como aliado | **PASA** |
| Nunca termina en una pared | **PASA** |
| Página de contacto real | **PASA** — `/contacto` |
| 404 profesional | **PASA** |
| Calidad visual intacta | **PASA** — Hero, scrollytelling e identidad sin tocar |
| Cabeceras de seguridad activas | **PASA** |
| Ningún formulario finge funcionar | **PASA** |
| Ningún dato de contacto inventado | **PASA** |
| 81/81 Playwright y 0 infracciones axe **contra producción** | **PASA** |
| Sin regresión en Lighthouse | **PASA** — mejora: móvil 93 → 97 |

**Fase Web 0 cerrada.**
