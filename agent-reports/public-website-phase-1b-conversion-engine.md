# Fase Web 1-B — motor de conversión

**La infraestructura existe entera, está probada y no se ve.** Ningún formulario
que pida datos personales está publicado, y hay pruebas que lo vigilan en cada
despliegue.

| | |
|---|---|
| **Rama** | `feat/public-marketing-site` |
| **HEAD inicial** | `3a2a301` |
| **HEAD final** | `197facf` |
| **Vista previa** | `plus58express-35bj0c1lc-delivery58.vercel.app` |
| **Producción** | `plus58express-k4x8x06s6` → <https://mas58express.com> |
| **Fecha** | 13 de septiembre de 2026 |

**Interruptores en producción:** `WAITLIST_ENABLED = false` ·
`PARTNER_LEADS_ENABLED = false` · `ANALYTICS_ENABLED = false`

---

## 1. Estado por bloque

| Bloque | Estado |
|---|---|
| Almacén separado, con interfaz | **PASA** |
| Modelo de la lista de espera | **PASA** |
| `POST /api/waitlist` | **PASA** (404 mientras el interruptor esté apagado) |
| Doble consentimiento | **PASA** |
| Baja | **PASA** |
| Correos (Resend) | **PASA** — plantillas y adaptador; envío real **NO ACTIVADO** (falta clave en el proyecto web) |
| Turnstile | **PASA PARCIAL** — verificación de servidor completa y probada; **faltan las claves** |
| Límite de peticiones | **PASA** |
| Trampa + tiempo mínimo | **PASA** |
| Interfaz de la lista de espera | **PASA** (construida, **NO ACTIVADA**) |
| Contactos de comercios | **PASA** (construido, **NO ACTIVADO**) |
| Aviso al equipo | **PASA** — sin IP |
| `/gracias` y `/baja` | **PASA** — en producción |
| Analítica | **PASA PARCIAL** — código completo; apagada hasta activarla en el panel |
| CSP | **PASA** |
| Pruebas | **PASA** — 138 |
| axe | **PASA** — 27 análisis, 0 infracciones |
| Lighthouse | **PASA** |
| **Provisionar la base** | **BLOQUEADO** — decisión del dueño |

---

## 2. Almacén: separado de la aplicación, y por qué

`web/lib/datos/` define **`RepositorioWeb`**, y ninguna ruta habla con un
proveedor: hablan con esa interfaz.

**El motivo no es elegancia.** Los datos que recoge la web —quién quiere que le
avisen, qué comercio quiere hablar— no tienen nada que ver con los viajes ni con
las cuentas de la aplicación. Mezclarlos ataría el ciclo de vida de un dato de
marketing al de uno de operación, y una credencial de la web daría acceso a la
operación. Por eso el almacén de la web es **otro**.

Se inspeccionó antes de diseñar: **el proyecto web no tiene ni una variable de
entorno ni base alguna**. No existía nada que reutilizar.

**`memoria.ts` es una implementación completa**, no un esqueleto: las 27 pruebas
de unidad ejercitan con ella el alta idempotente, el quemado del testigo, la
caducidad, la baja, el límite de peticiones y los comercios. Fuera de producción
se usa ella; **en producción, si no hay base configurada, se lanza un error
explícito en vez de fingir que guardó algo**.

El día que exista la base, **cambia un solo fichero**: `lib/datos/index.ts`.

---

## 3. Esquema de datos

```sql
create table lista_de_espera (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,      -- normalizado a minúsculas
  rol                 text check (rol in ('pasajero','conductor','comercio')),
  zona                text check (zona in ('santa-cruz-de-mara','el-mojan','maracaibo')),
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente','confirmado','caducado','baja','rebotado')),
  token_confirmacion  text unique,
  token_expira_en     timestamptz,
  token_baja          text unique,               -- DISTINTO del de confirmación
  confirmado_en       timestamptz,
  baja_en             timestamptz,
  origen              text,                      -- campaña, saneado
  ip_hash             text,                      -- HMAC con sal. NUNCA la IP
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create table contactos_aliados (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  negocio           text not null,
  telefono          text not null,
  email             text not null,
  municipio         text not null,
  tipo_comercio     text not null,
  mensaje           text,
  consentimiento_en timestamptz not null,        -- CUÁNDO, no un sí/no
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo','contactado','en_conversacion','cerrado_ganado','cerrado_perdido')),
  ip_hash           text,
  creado_en         timestamptz not null default now()
);
```

---

## 4. Una decisión que contradice el encargo, a propósito

El encargo pedía dos respuestas distintas:

```
201 { estado: "pendiente" }
200 { estado: "ya_registrado" }
```

y, en la línea siguiente y en mayúsculas, **no revelar si una dirección concreta
pertenece a la lista**.

**Las dos cosas no caben.** Dos respuestas distintas convierten el formulario en
un buscador de quién se ha apuntado: se prueban direcciones una a una y el código
de estado lo dice. Es una fuga de datos personales disfrazada de detalle de
interfaz.

**Gana el principio.** La ruta responde siempre `201 { estado: "pendiente" }`. La
distinción se conserva por dentro —de ella depende si se manda correo— pero fuera
no se nota. Hay una prueba que compara las dos respuestas **byte a byte**.

Si algún día se decide que la enumeración es aceptable, el cambio es una línea, y
está señalada en el código.

---

## 5. Lo que decide si un dato entra

| Guarda | Qué hace | Dónde |
|---|---|---|
| **Interruptor** | Con él apagado la ruta responde **404**, no 503: no es una caída, es que no existe | primera línea de cada ruta |
| **Origen** | Comparado con el propio. Un formulario en otra página no puede falsear `Origin`: lo pone el navegador | `peticion.ts` |
| **Tipo de contenido** | Sólo `application/json` — un `content-type` de formulario permitiría enviarlo desde fuera | `peticion.ts` |
| **Tamaño** | Techo de 8 KB, comprobando la cabecera **y** el tamaño real, porque la cabecera puede mentir | `peticion.ts` |
| **Lista blanca** | Lo que no está declarado **se descarta**, no se sanea | `validacion.ts` |
| **Trampa + tiempo** | Campo invisible y envío en menos de 3 s. Fuera del teclado y del lector de pantalla | `validacion.ts` |
| **Límite** | 5 altas/hora por huella de IP · 1 correo cada 10 min por dirección | `limites.ts` |
| **Turnstile** | Verificado **en el servidor**, siempre | `turnstile.ts` |

**El orden importa y es deliberado:** de lo más barato a lo más caro. Turnstile va
el último porque es una llamada de red, y no se gasta en una petición que ya se
sabe mala.

### Tres detalles que suelen hacerse mal

1. **Sin clave de Turnstile NO se deja pasar.** Devolver «válido» cuando falta la
   configuración convierte un despiste en una puerta abierta. Si Cloudflare no
   responde, tampoco pasa: mejor que un alta legítima se reintente a que el filtro
   desaparezca justo cuando falla.
2. **El testigo de baja es distinto del de confirmación.** Si fueran el mismo, el
   enlace de «darme de baja» confirmaría la inscripción de quien nunca la quiso.
   Hay una prueba para eso.
3. **El límite vive en el almacén, no en memoria.** En un despliegue sin servidor
   cada petición cae en una instancia distinta: un contador en memoria protege de
   los robots que tengan la mala suerte de repetir instancia, es decir, de
   ninguno. Una protección que sólo funciona a veces es peor que ninguna, porque
   se cree que está.

---

## 6. Doble consentimiento y baja

```
POST /api/waitlist                    → alta en estado «pendiente» + correo
GET  /api/waitlist/confirmar?token=…  → 302 /gracias?estado=confirmado|expirado|ya_confirmado|invalido
GET  /api/waitlist/baja?token=…       → 302 /baja?estado=baja|ya_baja|invalido
```

Testigos de **256 bits** (`randomBytes(32)`), de **un solo uso** —confirmar quema
el testigo— y con **48 horas** de vigencia.

**En la URL viaja una palabra de estado, nunca el correo ni el testigo**: una
dirección en la barra del navegador acaba en el historial, en los registros del
servidor y en el `Referer` de la petición siguiente. Hay una prueba que lo
comprueba.

Ningún estado enseña un error técnico. Quien abre un enlace caducado no ha hecho
nada mal, y el texto no le culpa.

---

## 7. Correos

Por el **Resend que ya existe**, sin añadir un segundo proveedor: dos remitentes
para el mismo dominio es el camino recto a que uno acabe en spam. Salen de
`send.mas58express.com`, que ya tiene SPF y DKIM verificados — el apex no envía
(`v=spf1 -all`).

| | |
|---|---|
| A · Confirmación de la lista | Un botón, la caducidad y el enlace de baja |
| B · Confirmación de la baja | El último correo que se manda |
| C · Acuse al comercio | Dice que llegó y **no promete plazo** |
| D · Aviso al equipo | A `58expressapp@gmail.com`. **Sin la IP** |

Grafito y amarillo, estilos en línea (Gmail y Outlook descartan las hojas de
estilo), una columna de 600 px y texto alternativo siempre.

**Sin rastreo.** Ni píxel de apertura ni enlaces envueltos para contar clics. Hay
una prueba que falla si aparece un `<img>` en la plantilla de confirmación.

---

## 8. Analítica

Once eventos, **tipo cerrado**: un nombre inventado sobre la marcha no compila.
Además, un filtro en tiempo de ejecución descarta claves sospechosas —`email`,
`telefono`, `nombre`, `ip`, `id`, `token`— por si algún día alguien construye las
propiedades dinámicamente.

```
contacto_abierto · whatsapp_general · whatsapp_conductor · whatsapp_aliado
whatsapp_soporte · zona_consultada · waitlist_iniciada · waitlist_confirmada
lead_aliado_enviado
```

**Ni un dato personal.** Hay dos pruebas: una de unidad sobre el filtro y otra que
recorre la portada entera vigilando que **ninguna petición saliente** lleve un
correo, un teléfono o un nombre.

Los eventos de formulario sólo pueden dispararse desde componentes que no se
pintan mientras su interruptor esté apagado.

### Por qué queda apagada

`ANALYTICS_ENABLED = false`, y **no por privacidad**: Vercel Web Analytics hay que
activarla en los ajustes del proyecto, y mientras no lo esté,
`/_vercel/insights/script.js` devuelve un **404 con tipo `text/plain`** que
`nosniff` —correctamente— se niega a ejecutar. Eso dejaría **un error en la
consola de cada visitante a cambio de nada**.

Lo destapó una prueba de la Fase 0 al fallar. El código está entero; encenderlo
es activar Web Analytics en el panel y poner el interruptor en `true`.

---

## 9. CSP

La política **se abre a Turnstile sólo si algún formulario puede pintarse**:
`next.config.ts` importa los mismos interruptores que los componentes.

Hoy, en producción:

```
script-src  'self' 'unsafe-inline'
connect-src 'self'
frame-src   'none'
```

Ni rastro de `challenges.cloudflare.com`, porque nadie lo necesita. Cuando se
encienda un formulario, se conceden los tres permisos juntos —script, marco y
conexión— con **el dominio exacto, nunca un comodín**. Hay una prueba que falla
si aparece un `*` o si Turnstile se cuela con los interruptores apagados.

---

## 10. Verificación

| | Resultado |
|---|---|
| TypeScript | **0 errores** |
| Build | 21 rutas |
| **Playwright** | **138 pruebas** — 27 de unidad, 25 de fase 1-B, el resto heredadas |
| Contra producción | **138 / 138** |
| **axe WCAG 2.1 AA** | **27 análisis, 0 infracciones** (incluidas `/gracias` y `/baja`) |
| Responsive | 360 · 390 · 430 · 768 · 1024 · 1440 · 1920 — sin desbordes, **sin campos**, con `<h1>` |
| Movimiento reducido | `/gracias` legible y con el botón visible |
| Lighthouse escritorio | **100 / 100 / 100 / 100** |
| Lighthouse móvil | **92 / 100 / 100 / 100** |

**Certificado en producción:** cero campos en la portada · cero `Set-Cookie` ·
`frame-src 'none'` · sin Turnstile en la CSP · `/api/waitlist` y
`/api/leads/partners` responden **404** · `www` → 308 · `/gracias` y `/baja` en
200.

---

## 11. Variables de entorno que hará falta crear

Ninguna existe todavía en el proyecto web. **No se inventó ninguna clave.**

| Variable | Para qué | Sin ella |
|---|---|---|
| `WEB_DATABASE_URL` | Almacén de la web | Las rutas responden 503 |
| `IP_HASH_SALT` | Sal del HMAC de la IP | No se guarda huella; el límite por IP no actúa |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Widget en el navegador | El widget no se pinta |
| `TURNSTILE_SECRET_KEY` | Verificación en el servidor | **No deja pasar nada** |
| `RESEND_API_KEY` | Envío de correos | No se manda ninguno; el alta se guarda igual |
| `EMAIL_FROM` | Remitente | Por omisión `hola@send.mas58express.com` |
| `EMAIL_EQUIPO` | Aviso interno | Por omisión `58expressapp@gmail.com` |
| `NEXT_PUBLIC_SITE_URL` | Base de los enlaces del correo | Por omisión `https://mas58express.com` |

---

## 12. Bloqueos

| # | Bloqueo | Depende de |
|---|---|---|
| 1 | **Política de privacidad y responsable identificado** | Tuya. Bloquea encender cualquier formulario |
| 2 | **Provisionar la base de la web** | Tuya (§13) |
| 3 | **Claves de Turnstile** | Tuya — cuenta gratuita de Cloudflare |
| 4 | **`RESEND_API_KEY` en el proyecto web** | Tuya — la clave existe en Railway, pero la integración la devuelve redactada y no puedo leerla |
| 5 | **Activar Web Analytics en el proyecto** | Tuya — un interruptor |

---

## 13. ACCIONES MANUALES DEL DUEÑO

1. **Crear la base de datos de la web.** Recomiendo **Neon** (Postgres, plan
   gratuito con 0,5 GB y suficiente para una lista de espera; no pide tarjeta).
   Alternativa igual de válida: **un proyecto Supabase NUEVO** — nuevo, no el de
   la aplicación. Sólo necesito la cadena de conexión para `WEB_DATABASE_URL`;
   las dos tablas las creo yo.
2. **Claves de Turnstile.** En el panel de Cloudflare, *Turnstile → Add site*
   con el dominio `mas58express.com`. Pásame la **Site Key** y la **Secret Key**.
3. **La `RESEND_API_KEY`** que ya usa el backend, o una nueva para la web.
4. **Activar Web Analytics** en el proyecto `plus58express-web` de Vercel
   (*Analytics → Enable*). Con eso enciendo `ANALYTICS_ENABLED`.
5. **Los siete datos legales** de `web-privacy-draft-input.md` §0. Es lo único que
   bloquea encender los formularios.

> **No contraté ni creé nada.** Los planes gratuitos de Neon y Cloudflare bastan
> para esta fase; ninguno exige tarjeta.

---

## 14. Lo que no se tocó

Mobile, Passenger, Driver, Navigation SDK, dispatch, pricing, el backend de la
aplicación, el Admin, el DNS, el CORS de Railway. Sin cookies, sin GA4, sin GTM,
sin píxeles, sin CMS, sin SEO local. Hero, scrollytelling, mapa, barra, pie,
`/contacto` y la 404 siguen exactamente igual — y las pruebas heredadas lo
comprueban.
