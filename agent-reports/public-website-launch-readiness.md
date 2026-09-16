# Launch Readiness — mas58express.com

Este documento tiene tres partes:

1. **[Certificación de Resend](#certificación-de-resend--15-de-septiembre)** — el
   estado de hoy. **Empieza por aquí.**
2. **[Ronda factual del 15 de septiembre](#ronda-factual--15-de-septiembre)** —
   lo que se corrigió para dejar `/privacidad` lista para el abogado.
3. **[La auditoría original](#resumen-ejecutivo)** — se conserva íntegra, con los
   hallazgos que la motivaron.

---

# Certificación de Resend — 15 de septiembre

**Despliegue:** `plus58express-es4rk480d` · commit `957faf8`.
Encargo: certificar el envío de correo en producción y, **sólo si todo pasa**,
encender después la lista de espera. Al terminar, los dos interruptores siguen
apagados a propósito: falta que alguien mire el buzón.

## Los estados que pediste

| | |
|---|---|
| **PRIVACY** | **FINAL LAWYER REVIEW COMPLETE** — revisor: Fernando Atencio · versión 1.1 · 15 de septiembre de 2026 |
| **RESEND DOMAIN** | **VERIFIED** para envío — por comportamiento, no por consulta al registro. Ver el matiz abajo |
| **RESEND API TEST** | **PASS** — HTTP 200, aceptado |
| **RESEND MAILBOX DELIVERY** | **PENDING USER CONFIRMATION** |
| **WAITLIST** | **OFF** |
| **PARTNER LEADS** | **OFF** |

Sobre la primera fila, con cuidado: se registra que **la revisión jurídica final
está hecha y que Fernando Atencio la aprobó**, según confirmación del
propietario. **No se escribe «certificada» en ninguna parte**, porque no existe
ningún documento que use esa palabra. Y no se ha tocado ni una línea del
contenido jurídico de `/privacidad` ni de `/terminos`: esto es un cambio de
estado en la documentación interna, no en el sitio.

## 1 · Estado inicial, comprobado antes de tocar nada

| | |
|---|---|
| `WAITLIST_ENABLED` | **`false`** (`lib/flags.ts`) |
| `PARTNER_LEADS_ENABLED` | **`false`** (`lib/flags.ts`) |
| `RESEND_API_KEY` | presente en Production, tipo **Secret** |
| `EMAIL_FROM` | presente en Production, tipo **Config** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | presente en Production, tipo **Config** |
| `TURNSTILE_SECRET_KEY` | presente en Production, tipo **Secret** |

Ningún valor secreto se leyó, se imprimió ni se convirtió a `Config`. El listado
de Vercel muestra los Secret como `Hidden` y así se quedaron.

## 2 · Las cinco cosas que se confunden con «Resend funciona»

El encargo pedía distinguirlas, y hacen falta las cinco por separado porque
ninguna implica las demás.

| | Estado | Cómo lo sé |
|---|---|---|
| **A · Dominio verificado** | **VERIFIED para envío** | No pude leerlo del registro —ver abajo—, pero Resend **aceptó** un correo cuyo `From:` es `no-reply@mas58express.com`. Resend responde `403 · domain is not verified` cuando el dominio no lo está: aceptarlo es su forma de decir que sí |
| **B · DKIM en el DNS** | **PRESENTE** | `resend._domainkey.mas58express.com` devuelve `p=MIGfMA0GCSqGSIb3…`. El subdominio `send.` sigue sin tenerlo, y así debe ser |
| **C · `EMAIL_FROM` correcto** | **SÍ, exacto** | El propio servidor de producción devolvió el valor que resuelve en tiempo de ejecución: `+58Express <no-reply@mas58express.com>`. Es carácter por carácter el que pediste |
| **D · Clave usable** | **SÍ** | Es el hallazgo nuevo. Ver abajo |
| **E · Entrega real al buzón** | **PENDIENTE DE TI** | Un `200` de Resend es «admitido para entrega», no «entregado». Eso sólo lo dice Gmail |

### El matiz de A, dicho sin adornos

Pregunté a `GET https://api.resend.com/domains` desde producción, con la clave
real. Contestó:

```
HTTP 401 — "This API key is restricted to only send emails"
```

Eso **no** es un fallo: es una clave de *sending access*, que es exactamente el
permiso mínimo que debe tener una clave que vive en una web pública. El precio de
esa buena decisión es que no puede consultar el registro de dominios. Así que el
estado de A no sale de una consulta, sino de una conducta observada — y se dice
así, en vez de fingir que lo leí.

### D · Una corrección a lo que informé ayer

Ayer escribí que la única clave a la que podía llegar devolvía `API key is
invalid`, y de ahí quedó **A · UNKNOWN** y **D** sin respuesta. Eso era cierto
**de la clave de `.env.local`**, que sigue siendo un valor equivocado bajo un
nombre correcto. **No** era cierto de la de Production, que hasta hoy nadie había
podido probar porque es un Secret.

Ya está probada: **autentica, y tiene el permiso de envío.** El mensaje de error
del párrafo anterior lo demuestra por sí solo — una clave inválida no provoca una
respuesta que describa sus propias restricciones, provoca `API key is invalid`.

> Queda una tarea de higiene, pequeña y real: `web/.env.local` tiene un valor que
> no es una clave de Resend guardado bajo el nombre `RESEND_API_KEY`. No está
> versionado y no afecta a producción, pero engaña a quien lo lea.

## 3 · Cómo se hizo la prueba, y por qué así

`RESEND_API_KEY` es un **Secret**, y Vercel no devuelve un Secret nunca: ni al
panel, ni a `vercel env pull`, ni a `vercel env run`. Es lo que se quiso al
guardarla así y no se ha deshecho para hacer una prueba. Pero deja una
consecuencia incómoda: **la única máquina capaz de usar esa clave es el propio
despliegue de producción.** De ahí que la prueba viva en una ruta y no en un
guion local.

Las dos alternativas se descartaron por razones concretas, no por gusto:

- **encender la lista de espera «a ver si llega»** publicaría una superficie que
  recoge datos personales antes de saber si el doble consentimiento funciona.
  Primero se certifica el envío, después se enciende el formulario;
- **pasar el Secret a `Config`** para poder leerlo lo habría expuesto en el panel
  para siempre a cambio de una comodidad de cinco minutos. El encargo lo prohibía
  y, aunque no lo prohibiera, era la peor de las opciones.

La ruta es `POST /api/cron/prueba-de-correo`, y está construida para no poder
hacer daño:

| | |
|---|---|
| **Apagada por omisión** | No la guarda `CRON_SECRET` —que dispara borrados y no tiene por qué compartir llave con esto— sino `PRUEBA_CORREO_TOKEN`, una variable que **normalmente no existe**. Sin ella no hay ruta: **404** |
| **No es un relé** | El destinatario está escrito dentro del fichero. La petición no aporta **ni una letra** del correo: ni destino, ni asunto, ni cuerpo. Aunque el testigo se filtrara, lo único que se puede provocar es un mensaje idéntico al buzón del propio equipo |
| **404, no 401** | Un 401 confirmaría que la ruta existe. Comprobado: sin testigo → 404; con testigo equivocado → 404 |
| **No la dispara ningún cron** | No está en `vercel.json`. Sólo se ejecuta a mano |
| **No envía en compilación** | Es `force-dynamic`; `next build` la lista como `ƒ` y no ejecuta su cuerpo |
| **Mismo camino que la lista de espera** | Usa `enviarCorreo()` de `lib/correo/enviar.ts`, el mismo remitente, las mismas cabeceras y la misma API que usará el formulario. Probar un camino distinto del que se va a publicar no prueba nada |

El testigo se generó al azar, se escribió directamente en Vercel por la entrada
estándar y **nunca pasó por la pantalla**. De la clave de Resend no se imprimió,
ni se devolvió, ni se registró nada.

## 4 · El envío

Uno. El único.

| | |
|---|---|
| **Momento** | `2026-09-16T00:45:23.163Z` — **20:45 del 15 de septiembre**, hora de Venezuela |
| **De** | `+58Express <no-reply@mas58express.com>` |
| **Para** | `58expressapp@gmail.com` |
| **Asunto** | `Prueba técnica +58Express — Resend` |
| **Respuesta de la API** | **HTTP 200** — aceptado |
| **ID de Resend** | `fa0143b8-e302-4a71-96dd-92f192e327b6` |

El cuerpo no lleva enlaces, ni imágenes, ni identificadores: no hay apertura que
contar ni clic que rastrear, que es la misma regla que siguen las plantillas de
verdad. El único dato personal que interviene es la dirección de destino, que es
la del propio equipo.

> **HTTP 200 no es «ha llegado».** Significa que Resend lo ha admitido para
> entrega. Entre eso y la bandeja de entrada quedan SES, la reputación del
> dominio —que es nueva— y el filtro de Gmail. La fila **E** sigue abierta hasta
> que alguien mire, y por eso los formularios siguen apagados.

## 5 · Los interruptores, después de todo esto

Vueltos a comprobar **contra producción**, no contra el código:

```
/api/waitlist            POST 404   GET 404
/api/waitlist/confirmar  GET  404   POST 404
/api/waitlist/baja       GET  404   POST 404
/api/leads/partners      POST 404   GET 404

<form> publicados en /, /pasajeros, /aliados, /conductores, /contacto:  0
```

**WAITLIST = OFF. PARTNER LEADS = OFF.** Nada se ha encendido.

## 6 · QA

| | |
|---|---|
| TypeScript | ✔ **0 errores** |
| ESLint | ✔ **0 errores, 0 avisos** |
| `next build` | ✔ compila; 22 rutas; la nueva sale como `ƒ` (dinámica) |
| Interruptores en producción | ✔ 8 endpoints en 404, 0 formularios |
| Guarda de la ruta nueva | ✔ 404 sin testigo y con testigo equivocado |

**Esta ronda no modifica:** diseño · SEO · Analytics · Supabase · retención ·
imágenes · GSAP · Lenis · app móvil · `/privacidad` · `/terminos`. El diff es
**un fichero nuevo** y nada más: `web/app/api/cron/prueba-de-correo/route.ts`.

## 7 · Lo único que bloquea la lista de espera

> **Confirmar recepción real del email de prueba** en `58expressapp@gmail.com`
> (asunto «Prueba técnica +58Express — Resend», id
> `fa0143b8-e302-4a71-96dd-92f192e327b6`).
>
> Si está en la bandeja: se enciende `WAITLIST_ENABLED`.
> Si está en spam: llega, pero conviene arreglar la reputación antes —`p=none` en
> DMARC ayuda poco— y eso es una decisión, no un arreglo automático.
> Si no está en ninguno de los dos: el problema está entre Resend y Gmail, y el
> `200` no sirve de nada.

`PARTNER_LEADS_ENABLED` se queda en `false` de todas formas, por encargo.

## 8 · Deuda que deja esta ronda

Dos cosas, y las dos se limpian en cuanto confirmes el buzón:

1. **`PRUEBA_CORREO_TOKEN` está viva en Production.** Hay que borrarla. Mientras
   exista, quien la tuviera podría provocar un correo idéntico al buzón del
   equipo — nada más, pero no hay razón para dejarla.
2. **La ruta puede quedarse o irse.** Borrada la variable queda inerte (404 para
   todo el mundo, incluido quien la conozca), así que no urge. Es útil el día que
   se rote la clave. Tú decides.

---

# Ronda factual — 15 de septiembre

**Despliegue:** `plus58express-q6i4bs81m` · commit `a7a4e94` + `1c0a8f5`.
Encargo: corregir **sólo inconsistencias demostradas** entre lo que la web hace
y lo que declara, sin activar formularios, sin enviar correo y sin introducir
ninguna opinión jurídica nueva.

## Los once estados que pediste

| | |
|---|---|
| **PRIVACY FACTUAL ALIGNMENT** | **COMPLETE** |
| **ANALYTICS URL SANITIZATION** | **PASS** |
| **GMAIL DISCLOSURE** | **COMPLETE** |
| **RETENTION TEXT VS CODE** | **MATCH** |
| **OLD GOOGLE IMAGES** | **REMOVED** |
| **HOMEPAGE IMAGES** | **NEW** |
| **NO-JS PRODUCT STEPS** | **PASS** |
| **SCREEN READER PRODUCT STEPS** | **PASS** |
| **ESLINT** | **PASS** |
| **RESEND DOMAIN STATUS** | **UNKNOWN** — ver §14 |
| **RESEND REAL DELIVERY** | **NOT YET CERTIFIED** |

**`/privacidad` pasa de 1.0 a 1.1 (15 de septiembre de 2026).** No está aprobada
por ningún abogado: está lista para que Fernando Atencio la revise.

> **Superado ese mismo día.** Las tres últimas filas quedaron atrás en la ronda
> siguiente: Fernando Atencio completó la revisión de la 1.1 y la aprobó, y la
> clave de Resend resultó ser válida en cuanto pudo probarse desde producción.
> El estado vigente está en
> **[Certificación de Resend](#certificación-de-resend--15-de-septiembre)**. Lo
> de abajo se conserva porque era cierto cuando se escribió.

## Qué cambió, y por qué

### 1 · Gmail — GMAIL DISCLOSURE = COMPLETE

El bloqueo A3 de la auditoría. Verificado otra vez línea a línea:
`app/api/leads/partners/route.ts:92` manda el aviso interno a
`process.env.EMAIL_EQUIPO || EMAIL.direccion`, y **`EMAIL_EQUIPO` no existe en
Production** (`vercel env ls`: cero ocurrencias). El destino real es
`58expressapp@gmail.com`, con siete campos personales.

La política decía que Gmail intervenía «sólo si tú decides escribirnos por
correo». Ahora la tabla de proveedores lo declara como **el buzón del equipo**,
enumera los siete campos y explica que el aviso del formulario de comercios es
**automático**, sin que la persona escriba ningún correo.

### 2 · Analítica — ANALYTICS URL SANITIZATION = PASS

`components/site/Analitica.tsx` envuelve el componente con un `beforeSend` que
recorta la dirección a **origen + ruta** antes de que salga del navegador.

**Prueba adversaria en producción**, cargando

```
/?utm_source=prueba&email=ana%40ejemplo.com&token=SECRETO123&telefono=584125143242#cobertura
```

Cinco balizas capturadas (una vista y cuatro eventos). Las cinco:

```
o="https://mas58express.com/"   r=""   dp="/"
```

Ni `email=`, ni `token=`, ni `SECRETO123`, ni `#cobertura`, ni `utm_source`, ni
el teléfono. **LIMPIO.**

### 3 · El referente — medido, no supuesto

`beforeSend` sólo toca la dirección, no el referente. Así que lo medí aparte:

| Escenario | Qué lleva el campo `r` |
|---|---|
| Visita directa | `""` — vacío |
| Navegación interna | el campo **ni se envía** |
| **Llegando desde otro sitio** con `?campana=correo&uid=USUARIO999` en su URL | **`http://localhost:3210/`** — sólo el dominio |

La ruta y la consulta del sitio de procedencia **se pierden**: lo hace
`Referrer-Policy: strict-origin-when-cross-origin`, que ya estaba puesta. La
política ahora lo enumera —antes lo omitía— y describe exactamente eso.

### 4 · Retención — RETENTION TEXT VS CODE = MATCH

Primero determiné qué hace el código, literalmente:

```sql
creado_en < ${corte("30 days")}     -- lista de espera, sólo estados sin confirmar
creado_en < ${corte("12 months")}   -- contactos de comercio
ultimo_en < ${corte("24 hours")}    -- registros contra el abuso
```

Y el barrido lo dispara `vercel.json` → `"0 4 * * *"`: **una vez al día**. El
barrido oportunista que existe en el limitador sólo corre cuando alguien envía
un formulario, así que **hoy el cron diario es el único**.

Con eso, las tres discrepancias:

| | Decía | Dice ahora | Por qué |
|---|---|---|---|
| **A** | «12 meses desde el último contacto, salvo que la relación continúe» | «Se borra pasados 12 meses desde que enviaste el formulario» | Se cuenta desde `creado_en`. **No existe ninguna columna de «último contacto»**, ni la excepción prometida |
| **B** | «Como máximo 24 horas» | «Se borran una vez superadas las 24 horas desde el último intento» | Con un barrido diario, un registro puede vivir hasta casi 48 h. El texto ya no promete un máximo que no se garantiza |
| **C** | «Hasta 30 días después del aviso de lanzamiento, o hasta que te des de baja» | «Mientras sigas en la lista. No tiene borrado automático» | **No hay código que lo cumpla**, y «aviso de lanzamiento» ni siquiera es un evento del sistema |

Y una frase añadida que lo explica una sola vez para las cinco filas: los
borrados los hace un proceso diario, así que un registro desaparece «en el primer
pase posterior: en el peor caso, menos de veinticuatro horas más tarde».

> **Ojo con C, porque es el cambio de más calado.** El texto pasa de prometer un
> borrado a los 30 días del lanzamiento a decir que no hay borrado automático.
> Eso es lo que el código hace hoy — pero es una promesa **menos** protectora que
> la anterior, y merece la atención del abogado. La alternativa era escribir ese
> borrado, que es una decisión de producto, no mía.

### 5 · Una inconsistencia más, encontrada por el camino

La política decía «Cada correo lleva un enlace para salir de la lista». El acuse
de la baja (`correoBaja`) **no lo lleva** — y no debe llevarlo, porque a esas
alturas ya has salido. Corregido.

### 6 · Verificación final: las diez afirmaciones contra el código

Contrastadas contra el HTML **publicado**, no contra el JSX:

```
  ✔ comercios: 12 meses desde el envío       DELETE … creado_en < now() - 12 months
  ✔ abuso: superadas las 24 horas            DELETE … ultimo_en < now() - 24 hours
  ✔ sin confirmar: 30 días desde el alta     DELETE … creado_en < now() - 30 days
  ✔ confirmada: sin borrado automático       no existe ningún DELETE sobre 'confirmado'
  ✔ los borrados son un proceso diario       vercel.json → "0 4 * * *"
  ✔ Gmail recibe el aviso de comercios       route.ts → EMAIL_EQUIPO || EMAIL.direccion
  ✔ el aviso lleva los siete campos          los siete que pasa a correoAvisoInterno
  ✔ el acuse de baja no lleva enlace         correoBaja() no lo incluye
  ✔ la dirección se recorta                  beforeSend → origin + pathname
  ✔ no hay ningún formulario publicado       los dos interruptores en false
```

## Lo demás de la ronda

### Imágenes — OLD GOOGLE IMAGES = REMOVED · HOMEPAGE IMAGES = NEW

**Seis** ficheros fuera del despliegue, no tres: los tres `/zulia/*.jpg` y también
los tres `/zonas/*.webp` que la portada seguía usando. Los seis responden **404**
en producción; ninguno tenía referencias activas antes de borrarlo.

La portada ahora usa **las mismas imágenes que `/nosotros`**. Antes enseñaba una
iglesia neogótica blanca para El Moján y `/nosotros` una colonial amarilla: dos
edificios distintos para el mismo pueblo. El tratamiento en blanco y negro de las
tarjetas lo hace el CSS, no el fichero, así que **el diseño no cambia**.

Y los textos alternativos dejan de hacer pasar una ilustración por documentación:

```
antes:  "Vista aérea de la iglesia de El Moján y su plaza, con el lago…"
ahora:  "Representación visual de El Moján: vista aérea de una plaza con su
         iglesia y el lago al fondo."
```

El pie lo dice una vez, en una frase: «Las imágenes son representaciones, no
fotografías de esos lugares.»

### Accesibilidad — NO-JS = PASS · SCREEN READER = PASS

Dos cambios, los dos de mejora progresiva:

1. **La lista plana pasa a ser el estado por defecto.** El desapilado estaba
   encerrado en `@media (prefers-reduced-motion: reduce)`, que no se activa por
   tener el JavaScript apagado. Ahora la escena fijada la enciende la clase
   `escena-viva`, que pone GSAP sólo cuando de verdad va a animar.
2. **`opacity` en vez de `autoAlpha`** en los cinco pasos. `autoAlpha` es opacity
   **más visibility**, y `visibility: hidden` los sacaba del árbol de
   accesibilidad. El resto de la escena —teléfono, motorista, pines— conserva
   `autoAlpha`: es decorativa y está en contenedores `aria-hidden`.

Medido en producción, con el árbol de accesibilidad pedido por CDP:

| Escenario | Pasos | Apilados | `visibility:hidden` | En el árbol |
|---|---|---|---|---|
| **Sin JavaScript** | 5 | no | 0 | — |
| **Con JavaScript** | 5 | sí *(es el diseño)* | **0** | **5/5** |
| **Movimiento reducido** | 5 | no | 0 | **5/5** |

### `/conductores`

La descripción ya no dice «Inscripciones abiertas para el lanzamiento» —lo que se
veía en Google y en la vista previa de WhatsApp mientras la página decía que no
hay formulario—. Ahora: «Próximamente — conoce cómo va a funcionar.» **Sólo el
metadata; la página no se tocó.**

### Endpoints

Un `GET` a `/api/waitlist` devolvía **405**, y un 405 sólo lo da algo que existe.
Ahora las cuatro rutas responden lo mismo con los interruptores apagados, y
recuperan el 405 correcto cuando se enciendan:

```
  POST /api/waitlist            → 404      GET  /api/waitlist            → 404
  POST /api/leads/partners      → 404      GET  /api/leads/partners      → 404
  POST /api/waitlist/confirmar  → 404      GET  /api/waitlist/confirmar  → 404
  POST /api/waitlist/baja       → 404      GET  /api/waitlist/baja       → 404
```

### La página 404

Título propio —«Esta página no existe · +58Express», ya no el de la portada—,
**una sola directiva** `noindex` y sin la canónica heredada. Next emite su propio
`noindex` y no se puede suprimir sin `experimental.globalNotFound`, que obligaría
a rehacer ahí las fuentes y los estilos: no compensa por una etiqueta repetida.
Lo que sí desapareció es la **contradicción** — antes convivían `noindex` e
`index, follow`.

### ESLINT = PASS

De **3 errores y 1 aviso a 0 y 0**. Los dos de pureza estaban en los formularios,
que es justo el código que empezará a ejecutarse al encenderlos: `Date.now()`
salía del render y pasa a un efecto, que mide lo mismo —el momento en que la
persona ve el formulario— sin mentirle a React.

### §13 · OpenStreetMap — se queda, y por qué

No se cambió el proveedor. Verificado lo que pediste:

| | |
|---|---|
| Atribución visible | ✔ «Leaflet \| © OpenStreetMap» con enlace a `openstreetmap.org/copyright` |
| HTTPS | ✔ 44 de 44 |
| Cabecera `Referer` | ✔ 44 de 44, identificando `https://mas58express.com/` |
| Prefetch masivo | ✔ **0 teselas** antes de llegar a la sección |
| Caché | ✔ se respeta el `max-age=95526` que devuelve OSM; no se fuerza `no-cache` |

> **Corrección al informe anterior.** Lo caractericé como «no son para uso
> comercial en producción», y eso es demasiado absoluto. No hay una prohibición
> general del uso comercial normal. Lo que sí es cierto es que el servicio es
> **best-effort** y la fundación puede retirar el acceso. Queda como **riesgo
> operativo futuro, no como bloqueo.**

### §14 · Resend — qué significaba exactamente «no verificado»

Había una contradicción aparente en el informe. Deshecha, punto por punto:

| | Estado | Cómo lo sé |
|---|---|---|
| **A · Dominio verificado en Resend** | **UNKNOWN** | Requiere su API. La única clave a la que puedo llegar —la de `.env.local`— devuelve `API key is invalid`. La de Production es un **Secret** y no se puede leer, que es como debe ser |
| **B · DKIM en el DNS** | **SÍ** | `resend._domainkey.mas58express.com` tiene clave pública. El subdominio `send.` **no** la tiene |
| **C · `EMAIL_FROM` configurado** | **SÍ** | Existe en Production como `Config` |
| **D · Entrega real a un buzón** | **NOT YET CERTIFIED** | Nunca ha salido un correo. No se envió ninguno |
| **E · Dirección individual verificada** | **UNKNOWN** | Mismo motivo que A |

El DNS, además, respalda el razonamiento que ya estaba escrito en el código:

```
  mas58express.com            TXT   v=spf1 -all
  send.mas58express.com       TXT   v=spf1 include:amazonses.com ~all
  send.mas58express.com       MX    10 feedback-smtp.eu-west-1.amazonses.com
  _dmarc.mas58express.com     TXT   v=DMARC1; p=none; rua=mailto:58expressapp@gmail.com
```

El `-all` del apex **no estorba**: SPF se evalúa contra el remitente del sobre, y
Resend usa `send.` para eso, que sí autoriza a SES. Y DMARC alinea por **DKIM**,
que está en el apex, que es de donde sale el `From`.

> **Corrección a un hallazgo mío.** Reporté que había «una `RESEND_API_KEY` real
> en texto plano en el disco de desarrollo». **No lo es**: ese valor tiene 76
> caracteres, lleva puntos y no empieza por `re_`, así que no es una clave de
> Resend. Sigue siendo un valor bajo un nombre equivocado que conviene limpiar,
> pero no la fuga que describí. `.env.local` está correctamente ignorado por git
> y no está versionado.

## QA de esta ronda

| | |
|---|---|
| TypeScript | ✔ sin errores |
| **ESLint** | ✔ **0 errores, 0 avisos** *(antes 3 + 1)* |
| `next build` | ✔ compila |
| Playwright | ✔ **185 pasadas · 0 fallidas** *(recuento con `grep`)* |
| axe WCAG 2.1 AA en producción | ✔ 11 rutas × móvil y escritorio, **0 violaciones** |
| Árbol de accesibilidad (CDP) | ✔ **5/5** pasos, con y sin movimiento |
| Sin JavaScript | ✔ los 5 pasos desapilados y en orden |
| Responsive | ✔ 77 combinaciones, **0 desbordamientos** |
| Lighthouse producción | ✔ escritorio **100/100/100/100**; móvil 93-100, a11y/BP/SEO **100** |
| Turnstile | ✔ 0 de 13 scripts, 0 peticiones a Cloudflare, CSP cerrada |
| Interruptores | ✔ los dos en `false`, 8 endpoints en 404 |

**Pruebas adversarias:** analítica con datos personales en la URL ✔ · acceso
directo a las seis imágenes antiguas ✔ (404) · portada sin activos antiguos ✔ ·
endpoints con los interruptores apagados ✔ · cero Turnstile ✔ · política contra
código ✔ (10 de 10).

## Bloqueos que siguen abiertos

**A1 · La Política de Privacidad sigue pendiente del abogado.** Es el único que
queda de los tres. Esta ronda no lo resuelve — la deja **factualmente correcta
para que él la revise**. Nada en el sitio afirma que haya sido revisada o
aprobada.

> **Cerrado ese mismo día.** Fernando Atencio completó la revisión de la 1.1 y la
> aprobó.

**A2 · La entrega de Resend sigue sin certificar.** Bloquea la lista de espera.
Cuesta un envío autorizado; el encargo lo prohibía.

> **Hecho el 15 de septiembre**, con autorización expresa: aceptado por Resend
> con HTTP 200. Falta confirmar el buzón.

**A3 · Resuelto.** La política ya declara el flujo real de Gmail.

### Y una cosa que esta ronda no tocó, a propósito

Las **capturas de la app** siguen publicando un precio concreto («Moto · $3.08»,
«Auto · 4 personas · $3.08»), una frase a medio escribir («Más de ___ personas
conectando Venezuela cada día»), una cobertura nacional («a toda Venezuela») y un
programa de niveles. Son ficheros de imagen, no texto: quedan fuera de una ronda
cuyo encargo era alinear `/privacidad` con el código. **Siguen siendo el hallazgo
P1 más visible del sitio.**

---

# Auditoría original — 14 de septiembre

**Despliegue auditado:** `plus58express-rb8kfbha0` · `delivery58/plus58express-web`
Rama `feat/public-marketing-site`, árbol limpio, commit `e7b44f6`.
Medido contra **https://mas58express.com**, no contra localhost.

**No se cambió ni una línea.** No se activó ningún interruptor, no se envió
ningún correo, no se tocó la app móvil ni nada de conductores.

---

## Resumen ejecutivo

| Área | Estado |
|---|---|
| **Design** | **READY** |
| **Production domain** | **READY** |
| **SEO** | **READY** |
| **Search Console** | **READY** |
| **Social networks** | **READY** |
| **Analytics** | **READY** |
| **Security headers** | **READY** |
| **Supabase Web** | **READY** |
| **Retention** | **READY** |
| **Turnstile** | **READY / NOT ACTIVE** |
| **Resend** | **API TEST PASS · MAILBOX DELIVERY PENDING USER CONFIRMATION** *(15 sept)* |
| **Terms** | **LAWYER COMMENTS INCORPORATED** |
| **Privacy** | **FINAL LAWYER REVIEW COMPLETE** — Fernando Atencio · 1.1 · 15 sept 2026 |
| **Images** | **NOT READY** — ver A3 y B1 |
| **Performance** | **READY** |
| **Accessibility** | **READY** |
| **WAITLIST** | **OFF** |
| **PARTNER LEADS** | **OFF** |

**Veredicto:** la infraestructura está lista. **READY excepto por los tres
bloqueos de la sección A** — y uno de ellos, el de la privacidad, ya lo sabías.

---

## Resultado total de las pruebas

| Prueba | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | ✔ sin errores |
| `next build` | ✔ compila |
| ESLint | **3 errores, 1 aviso** — todos preexistentes del 13 de septiembre (ver P3-1) |
| Playwright | ✔ **185 pasadas · 0 fallidas · 3 omitidas** *(recuento con `grep`, no leyendo el final)* |
| axe WCAG 2.1 AA — local | ✔ 13 rutas × móvil y escritorio, **0 violaciones** |
| axe WCAG 2.1 AA — **producción** | ✔ 11 rutas × móvil y escritorio, **0 violaciones** |
| Lighthouse producción — escritorio | ✔ **100 / 100 / 100 / 100** en las 8 páginas |
| Lighthouse producción — móvil | ✔ rendimiento 93-100 (media **99**), accesibilidad **100**, buenas prácticas **100**, SEO **100** |
| Rutas | ✔ 13 × HTTP 200 · 404 real devuelve 404 |
| Enlaces | ✔ **73 destinos, 0 rotos, 0 sin nombre accesible** |
| Responsive | ✔ 11 rutas × 7 anchos (360→1920) — **0 desbordamientos horizontales** |
| Formularios apagados | ✔ 0 campos públicos en las 14 rutas · endpoints 404 |
| Almacén web | ✔ 3 tablas, vacías, RLS activa, 0 privilegios para `anon`/`authenticated` |

---

# A · BLOQUEOS REALES antes de activar formularios

Sólo tres. Los tres son de contenido o de proceso, **ninguno es técnico**.

## A1 · La Política de Privacidad sigue pendiente del abogado

> **RESUELTO — 15 de septiembre.** Fernando Atencio completó la revisión final de
> la versión **1.1** y la aprobó, según confirmación del propietario. Este
> bloqueo deja de estar abierto. El texto de abajo describe la situación del 14
> de septiembre y se conserva tal cual.

Ya lo sabías, y es el bloqueo principal. `/privacidad` está publicada en versión
**1.0 del 13 de septiembre** y **no ha pasado la revisión jurídica** que sí
pasaron los Términos.

Lo que sí está bien: en ninguna parte del sitio se afirma que un abogado la
revisara, aprobara o certificara. Lo comprobé con búsqueda insensible a mayúsculas
sobre el texto renderizado de *certific · aprobad · visado · visto bueno ·
Fernando · Atencio · abogad · revisado por · avalad*: **cero coincidencias**. La
única mención al revisor vive en un comentario de código que no se renderiza.

**Por qué bloquea:** el consentimiento de la lista de espera y del formulario de
comercios se apoya en ese documento. Encender los interruptores es empezar a
recoger datos amparándose en un texto que todavía puede cambiar.

## A2 · La entrega real de Resend nunca se ha certificado

> **Casi resuelto — 15 de septiembre.** Se hizo el envío autorizado desde
> producción: Resend lo **aceptó** (HTTP 200, id
> `fa0143b8-e302-4a71-96dd-92f192e327b6`). Falta la única mitad que una API no
> puede dar: que alguien confirme que el correo está en el buzón.

**Bloquea WAITLIST, no PARTNER LEADS.**

Todo lo anterior a la entrega está verificado: `RESEND_API_KEY` existe en
Production como **Secret**, el remitente sale del apex `mas58express.com` —que es
el dominio con DKIM— y las plantillas están escritas. Lo que no existe es **una
sola prueba de que un correo salga y llegue a un buzón**.

**Por qué bloquea:** el doble consentimiento de la lista de espera descansa
entero en que el correo de confirmación llegue. Encenderla sin esa evidencia
publica un mecanismo legal cuya pieza central nadie ha visto funcionar, y el
fallo no se notaría hasta el primer alta real.

**Cuesta un solo envío autorizado.** No lo hice: el encargo lo prohibía
explícitamente. Y un matiz que conviene tener presente: que Resend responda 200
significa *aceptado para entrega*, no *entregado* — sólo mirar el buzón lo
confirma.

## A3 · La política dice que Gmail sólo interviene si tú escribes; el formulario de comercios lo desmiente

**Bloquea PARTNER LEADS.** Lo verifiqué yo mismo, línea a línea.

`app/api/leads/partners/route.ts:92` manda el aviso interno a:

```
process.env.EMAIL_EQUIPO || EMAIL.direccion
```

Y **`EMAIL_EQUIPO` no existe en Production** — lo comprobé con `vercel env ls`:
cero ocurrencias. Así que el destino real es `58expressapp@gmail.com`, **un buzón
de Gmail**. Ese correo lleva, de `lib/correo/plantillas.ts`:

> nombre · negocio · teléfono · email · municipio · tipo de comercio · mensaje

Mientras tanto, la tabla de proveedores de `/privacidad` sitúa a «Google (Gmail)»
como algo que ocurre **«Sólo si tú decides escribirnos por correo»**, y remata:

> «Las dos últimas filas no son proveedores nuestros: son aplicaciones tuyas.»

**En cuanto se encienda `PARTNER_LEADS_ENABLED`, Google recibirá los datos
personales de cada comercio que rellene el formulario sin que esa persona haya
decidido escribir por correo.** Es exactamente lo contrario de lo que el
documento declara.

**Salidas, cualquiera de las dos:** declarar Gmail (o el buzón del equipo) como
destinatario real en la tabla de proveedores, o configurar `EMAIL_EQUIPO` a un
buzón cuyo tratamiento sí esté declarado. Conviene resolverlo en la misma pasada
que A1, porque toca el mismo documento.

---

# B · MEJORAS QUE NO BLOQUEAN EL LANZAMIENTO

Ordenadas por lo que se nota. Ninguna impide activar los formularios.

## P1

### B1 · Las tres fotos del Zulia contradicen a la propia portada

**Verificado con mis ojos, no deducido.** La portada y `/nosotros` muestran
**edificios distintos para la misma localidad**:

| Localidad | Portada (`/zonas/*.webp`) | `/nosotros` (`/zulia/*.webp`) |
|---|---|---|
| **El Moján** | iglesia neogótica **blanca de dos agujas** | iglesia colonial **amarilla de dos torres con cúpula** |
| **Santa Cruz de Mara** | estatua **de pie** sobre pedestal | estatua **ecuestre** ante iglesia amarilla |
| **Maracaibo** | monumento blanco con fuentes y arcada | monumento de mármol con corona y icono dorado |

Y hay un dato más que pesa: **la foto antigua de cada localidad coincide con la
miniatura de la portada, no con la nueva**. La de Santa Cruz de Mara, además,
lleva EXIF de un Samsung Galaxy A35 del 21/06/2025 — es una foto tomada allí.

Tu encargo dice que las nuevas son **«imágenes generadas para +58Express»**, así
que su naturaleza no es el hallazgo. El hallazgo es que **el alt y el pie las
presentan como tres lugares concretos y reales**:

> «La plaza de Santa Cruz de Mara…», «Vista aérea de la iglesia de El Moján…»,
> «La basílica de Maracaibo con el monumento a la Chinita…»
> — y el pie: «Santa Cruz de Mara, El Moján y Maracaibo: las zonas iniciales previstas»

**No puedo decir cuál de las dos versiones es la correcta** — eso lo sabe
cualquiera del Zulia de un vistazo, y yo no. Lo que sí puedo afirmar es que el
sitio se contradice a sí mismo, y que quien conozca El Moján lo va a notar.

También aparecen detalles que delatan la generación: en la de Maracaibo, las
esferas de reloj de las torres **no tienen ni números ni agujas**, y el
bajorrelieve de bronce del pedestal tiene figuras con los contornos fundidos.

### B2 · Las capturas de la app publican cifras que la web se prohíbe a sí misma

**Miré las tres imágenes.** Lo que sale en ellas, legible a tamaño real:

**`map-select.webp` — la imagen del héroe de la portada:**
- **«Moto · 1 persona · **$3.08**»** y **«Auto · 4 personas · **$3.08**»**
- un total de **«$3.08 / 2.8 km»**

Es el único número concreto de todo el sitio y es un precio. Que Moto y Auto
cuesten exactamente lo mismo delata además que es una maqueta. Y «Auto / 4
personas» ofrece una categoría de servicio que la plataforma no tiene.

**`home.webp`:**
- **«Más de ___ personas conectando Venezuela cada día»** — **le falta el número**.
  Es el resto de una afirmación de volumen que alguien vació a medias. Se lee así
  en producción.
- **«Envía sin límites — Rápido, seguro y a toda Venezuela»**, cuando toda la web
  se cuida de decir «Maracaibo y el Municipio Mara» y de llamarlas «zonas
  iniciales previstas».
- **«Tasa de cambio Bs. 794.99»** — otra cifra concreta.
- una usuaria ficticia con foto, «Hola, Emiliana», con valoración «0.00».
- el fondo es una **ciudad de montaña** con un coche amarillo rotulado. Maracaibo
  es plana y está a orillas del lago.

**`driver-onboarding.webp`:**
- **«obtén mejores beneficios al subir tu nivel»** — un programa de niveles que no
  aparece en ninguna parte de la web pública. *No puedo confirmar si existe en el
  producto: el backend de la app queda fuera de este encargo.*

Además, el mapa del héroe lleva pines con **marcas de terceros reales** (Centro
Sambil Maracaibo, Centro Comercial Galerías Mall, FERRO NORTE HOME, C.A.).

**Por qué importa:** el sitio entero se sostiene sobre no prometer lo que no
puede cumplir —los badges no enlazan, no hay lista de espera, las zonas son
«previstas»— y las imágenes rompen esa regla justo donde ninguna revisión de
texto mira. El «Más de ___ personas» es, además, un defecto visible sin más.

### B3 · La descripción de `/conductores` promete inscripciones abiertas

Lo que Google y la previsualización de WhatsApp muestran:

> «…Inscripciones abiertas para el lanzamiento.»

Lo que dice la página al entrar:

> «Todavía no hay formulario de postulación en la web.»

Es la única promesa del sitio que la propia página contradice. En la audiencia
más difícil de captar, rompe la primera impresión. **Arreglo: una frase.**

### B4 · Sin JavaScript, la sección «Cómo funciona una carrera» es ilegible

Los cinco pasos viven en `absolute inset-x-0 top-0` y sólo se separan cuando GSAP
los anima. El desapilado por CSS existe pero está encerrado en
`@media (prefers-reduced-motion: reduce)`, que **no se activa por tener el JS
apagado**. Medido sin JS: los cinco con `top=1677`, superpuestos.

Y lo mismo afecta a los lectores de pantalla: el árbol accesible de esa sección
contiene **la región, el H2 y una imagen** — los cinco H3 y sus párrafos no están,
porque GSAP los mantiene en `visibility: hidden` hasta que el scrub los revela.
Quien navega por encabezados con TalkBack atraviesa la sección entera y oye un
título. **axe no lo marca**, porque `visibility: hidden` es legítimo.

No es sólo quien desactiva JS a propósito: es también el navegador con ahorro de
datos, y cualquiera si uno de los chunks no llega. La solución ya está escrita:
sacar ese bloque de CSS del media query y que JS lo anule al arrancar, en vez de
al revés.

## P2

| # | Hallazgo | Dónde |
|---|---|---|
| B5 | **Las tres fotos antiguas siguen sirviéndose.** `/zulia/{el-mojan,santa-cruz-de-mara,maracaibo}.jpg` responden **200** en producción, versionadas y desplegadas, **sin una sola referencia activa**. Eran las de procedencia no confirmada | `public/zulia/*.jpg` |
| B6 | **La sustitución sólo llegó a `/nosotros`.** La portada sigue usando `/zonas/*.webp`, que son las de procedencia desconocida | `lib/zonas.ts:33,42` |
| B7 | **La baliza de analítica manda la URL completa, con query y hash.** Medido: cargando `?email=ana@ejemplo.com&token=SECRETO123#cobertura`, el campo `o` lo llevó verbatim. **No hay fuga hoy** —lo verifiqué: el testigo de confirmación se queda en la ruta de API, que redirige a `/gracias?estado=confirmado`, una sola palabra—. El riesgo es el día que un enlace de campaña añada `?email=`. `medir()` no puede filtrarlo: va en el sobre, no en las propiedades. **Arreglo de una línea:** pasar `beforeSend` al componente | `app/layout.tsx:138` |
| B8 | **Las teselas del mapa salen de la OSM Foundation**, cuya política de uso no contempla el uso comercial en producción. 48 peticiones por carga de portada | `components/map/MapaZonas.tsx:39` |
| B9 | **Las capturas se recortan dentro del marco del teléfono.** `object-cover` sobre una caja de ratio 0,479 con capturas de 0,5628 y 0,5066: se pierde un 5-15 % por lado. Se lee «ué necesitas hoy?», «estra comunidad en movimiento», y la propia marca truncada como «+58Expres» | `components/phone/InteractivePhone.tsx:107` |
| B10 | **La política enumera lo que viaja en cada medición y se deja fuera el referente** (`r`), que sí viaja. Mitigado en parte por `Referrer-Policy: strict-origin-when-cross-origin` | `app/privacidad/page.tsx:232-239` |
| B11 | **Tres desajustes entre lo que la política promete y lo que el cron hace**: los comercios se borran por fecha de alta y no «desde el último contacto»; el «como máximo 24 horas» de los intentos no está garantizado porque el barrido es diario y el reloj corre desde el último intento; y la fila «Inscripción confirmada» no tiene quien la ejecute | `app/privacidad/page.tsx:317-320` vs `lib/datos/postgres.ts` |
| B12 | **Si el cron dejara de borrar, nadie se enteraría.** No hay alerta ni registro consultable de la última purga | `app/api/cron/retencion/route.ts` |
| B13 | **Los privilegios por defecto del esquema `public` conceden todo a `anon` y `authenticated` en cualquier tabla FUTURA.** Las tres actuales están limpias —lo verifiqué: cero privilegios— pero una tabla nueva nacería abierta | Supabase, `ALTER DEFAULT PRIVILEGES` |
| B14 | **Ningún módulo de `lib/` marca `server-only`.** No hay barrera de compilación contra una fuga futura al cliente. Hoy no hay ninguna | `lib/datos/*`, `lib/correo/*` |
| B15 | **Los badges de tienda están en inglés y en escala de grises.** «GET IT ON» y «Download on the App Store» bajo un rótulo que dice «PRÓXIMAMENTE EN», en un sitio 100 % en español. Las guías de ambas tiendas prohíben alterar el color | `components/home/Descarga.tsx:69-97` |
| B16 | **`/servicios` y `/seguridad` repiten palabra por palabra las secciones homónimas de la portada**, y las tres están indexadas compitiendo por las mismas frases | `app/servicios/page.tsx` · `app/seguridad/page.tsx` |
| B17 | **`/pasajeros` acaba en un «Ver más» que devuelve a la portada**, es texto de enlace no descriptivo (WCAG 2.4.4), y es la única página de contenido sin salida a contacto | `app/pasajeros/page.tsx:51` |
| B18 | **En móvil, el `sizes` de los teléfonos sobredeclara el ancho** y descarga unos 250 KB de más | `components/phone/InteractivePhone.tsx:106` |
| B19 | **El remitente de Production no está verificado en Resend**, y el código no valida `EMAIL_FROM` pese a prometerlo | `lib/correo/enviar.ts` |

## P3

| # | Hallazgo |
|---|---|
| P3-1 | **ESLint: 3 errores y 1 aviso, todos preexistentes** (commits del 13 de septiembre, ninguno de las rondas recientes). Dos son `useRef(Date.now())` en los formularios —regla de pureza de React, sin defecto funcional, pero conviene arreglarlos **antes** de encenderlos porque es justo el código que empezará a renderizarse—; uno es un `setState` síncrono en un efecto de `Cobertura.tsx` en la rama sin `IntersectionObserver`; el aviso es un `ref.current` en una limpieza de `Navbar.tsx`. **`next build` no los bloquea** |
| P3-2 | **`GET /api/waitlist` devuelve 405, no 404**: delata que la ruta existe pese al interruptor. El `POST` sí devuelve 404 |
| P3-3 | **La página 404 lleva el título de la portada** y dos `<meta robots>` que se contradicen (`noindex` e `index, follow`). El estado 404 impide la indexación igual, así que el daño es cosmético |
| P3-4 | **`/gracias` y `/baja` responden 200** describiendo una confirmación por correo que hoy no puede ocurrir. Llevan `noindex, nofollow` y están fuera del sitemap, así que la exposición es mínima |
| P3-5 | **La URL de Facebook arrastra `&sk=directory_intro`**, resto de haberla copiado desde una sesión abierta. Funciona, pero abre una pestaña concreta del perfil |
| P3-6 | **La página de Facebook se llama «58Expressapp»**, no «+58Express» como TikTok e Instagram |
| P3-7 | **`/ayuda` publica 6 preguntas frecuentes sin datos estructurados `FAQPage`** — es lo único que falta en una capa de datos estructurados por lo demás completa |
| P3-8 | **`/pasajeros` no está en el menú**, ni en escritorio ni en móvil, pese a estar en el sitemap con prioridad 0,9. Es deliberado y está documentado, pero el público mayoritario no tiene su página en la navegación |
| P3-9 | **`PROHIBIDAS` de `analitica.ts` sólo empareja la clave exacta**: `user_id`, `celular` o `cedula` pasarían el filtro |
| P3-10 | **`waitlist_confirmada` está declarado como evento y no se dispara en ningún sitio** |
| P3-11 | **`esquema.sql` declara menos de lo que la base tiene**: faltan por documentar 4 CHECK y 6 índices |
| P3-12 | **La web se conecta como el rol `postgres`**, que tiene `rolbypassrls`. En la práctica el aislamiento real lo dan RLS sin políticas y los cero privilegios de `anon`; es una nota de endurecimiento, no un defecto |
| P3-13 | **Hay una `RESEND_API_KEY` real en texto plano en `.env.local`** del disco de desarrollo. No está versionada —lo verifiqué— pero conviene saberlo |
| P3-14 | **No hay historial de versiones consultable de los términos** |

---

# Detalle por área

## 1 · Rutas de producción

Las 14, en navegador real, con captura de consola:

| Ruta | Estado | H1 | Description | Canonical | robots | Consola |
|---|---|---|---|---|---|---|
| `/` · `/servicios` · `/pasajeros` · `/conductores` · `/seguridad` · `/aliados` · `/nosotros` · `/ayuda` · `/contacto` | **200** | 1 | ✔ | ✔ | `index, follow` | **0 errores** |
| `/privacidad` · `/terminos` | **200** | 1 | ✔ | ✔ | `index, follow` | **0 errores** |
| `/gracias` · `/baja` | **200** | 1 | ✔ | ✔ | **`noindex, nofollow`** | **0 errores** |
| ruta inexistente | **404** | 1 | — | — | `noindex` | 1 (el propio 404) |

`lang="es"` en todas · un `<main>` por página · navegación y pie presentes en las
13 reales · **cero errores de consola en las trece**.

## 2 · Dominio y redirecciones

```
  https://mas58express.com/            200, sin saltos          ← canónico
  https://www.mas58express.com/        308 → apex, 1 salto
  https://www.…/servicios?utm=…&x=1    308 → apex CON query intacta
  https://www.…/privacidad#datos       308 → apex
  http://mas58express.com/nosotros     308 → https, 1 salto
  http://www.mas58express.com/nosotros 308 → 308 → apex, 2 saltos
```

Sin bucles. La canónica declarada tras seguir `www` apunta al apex. **Ningún
dominio de despliegue aparece en el HTML** (`vercel.app`: cero ocurrencias).

**TLS:** Let's Encrypt, `notAfter` 5 de diciembre de 2026, con SAN
`DNS:*.mas58express.com, DNS:mas58express.com` — **el apex está cubierto**, que es
justo lo que un comodín no garantiza por sí solo.

**HSTS:** `max-age=63072000` (2 años), sin `includeSubDomains` ni `preload`. Es
una decisión deliberada y documentada en `next.config.ts`, no un olvido: ambos
serían casi irreversibles para todos los subdominios.

## 3 · SEO

- **robots.txt** — `Allow: /`, con `Host` y `Sitemap` declarados.
- **sitemap.xml** — **11 URLs, las 11 responden 200**. `/gracias` y `/baja`
  **no están** (verificado por grep). Tampoco ninguna ruta de API.
- **Canonical** en las 13 rutas reales, todas apuntando al apex.
- **Open Graph y Twitter Card** completos en todas: `og:title`, `og:description`,
  `og:url`, `og:image` (1200×630 con `alt`), `og:type`, `og:locale=es_VE`,
  `twitter:card=summary_large_image`.
- **Search Console** — `<meta name="google-site-verification">` presente.
- **Datos estructurados** — un `@graph` con `Organization` + `WebSite`, `@id`
  estable, `sameAs` con las tres redes, `taxID: J508723600` sin guiones y
  dirección literal.

**Schemas inventados: ninguno.** Barrí las 13 rutas buscando `Review`,
`AggregateRating`, `Rating`, `Offer`, `Product`, `LocalBusiness`,
`OpeningHoursSpecification`, `PriceSpecification` y `Event`: **cero
coincidencias**. Sólo aparecen `Organization`, `WebSite`, `PostalAddress`, `City`
y `AdministrativeArea`, todos con datos reales.

`/privacidad` y `/terminos` **indexables**. `/gracias` y `/baja` **noindex,
nofollow y fuera del sitemap**. Exactamente lo pedido.

## 4 · Redes sociales

Las tres URLs coinciden **exactamente** con las oficiales, en el pie de las 14
páginas y en `/contacto`. Las tres responden 200 **en navegador real** —Facebook
devuelve 400 a `curl`, que no prueba nada— y aterrizan en el perfil correcto.

Las tres llevan `target="_blank"` **y** `rel="noopener noreferrer"`, con nombre
accesible que dice la red y avisa de que abre pestaña nueva.

**Eventos, capturados en vuelo en producción:**

```
  {"en":"social_tiktok",    "ed":{"origen":"footer"}}
  {"en":"social_instagram", "ed":{"origen":"contacto"}}
  {"en":"social_facebook",  "ed":{"origen":"footer"}}
```

Sólo `origen`, con los dos valores previstos. **Ni handles, ni URLs, ni IDs.**

## 5 · Contacto

WhatsApp **+58 412-514-3242** y correo **58expressapp@gmail.com**, en las cuatro
intenciones. Los 4 enlaces `wa.me` y los 4 `mailto` están bien formados y
resuelven. Eventos capturados: `whatsapp_general` con `origen` = la **ruta**
(`window.location.pathname`, nunca `href` ni `search` — verificado en el código,
así que un testigo en la query jamás viajaría por ahí).

## 6 · Analytics

**Está funcionando.** Costó demostrarlo y me equivoqué dos veces por el camino:

1. Primero medí **0 balizas** y estuve a punto de reportar que estaba rota. El
   script vive en una **ruta ofuscada por despliegue** (`/e2c643063e265db1/script.js`),
   así que ningún filtro por «insights» lo veía.
2. Luego seguía sin enviar nada. La causa está en el propio script:
   `navigator.webdriver || navigator.userAgent.includes("Headless")`. Había
   enmascarado lo primero, no lo segundo.

Con las dos cosas ocultas, **tres vistas de página enviadas**, cuerpo completo:

```json
{"o":"https://mas58express.com/servicios","sv":"0.1.3",
 "sdkn":"@vercel/analytics/next","sdkv":"2.0.1","ts":…,"dp":"/servicios"}
```

URL, ruta, marca de tiempo y versión del SDK. **Nada más.**

| | |
|---|---|
| Cookies tras navegar y pulsar | **`""` — ninguna** |
| localStorage / sessionStorage | **vacíos** |
| GA4 · GTM · Meta Pixel · Hotjar · Clarity · Segment · Mixpanel | **ninguno** |
| Peticiones a dominios externos | **sólo `tile.openstreetmap.org`** (el mapa) |
| Errores de CSP | **0** |

## 7 · Seguridad

Cabeceras **idénticas en las 14 rutas**, verificadas en producción:

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; object-src 'none';
  img-src 'self' data: https://tile.openstreetmap.org; font-src 'self';
  style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
  connect-src 'self'; frame-src 'none'; manifest-src 'self';
  upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(),
  magnetometer=(), microphone=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
```

**La CSP no abre Cloudflare** — `frame-src 'none'`, sin `challenges.cloudflare.com`
en ninguna directiva. `X-Frame-Options` está ausente **a propósito**:
`frame-ancestors 'none'` lo sustituye y lo entienden todos los navegadores que
reciben este sitio.

**Secretos:** descargué los **27 scripts** que sirve producción y los barrí
buscando claves, tokens, cadenas de conexión, `postgres://`, `supabase`, `RESEND`,
`CRON_SECRET`, `IP_HASH_SALT` y `WEB_DATABASE_URL`. **Cero coincidencias.**
**Cero source maps** publicados (ningún script declara `sourceMappingURL`).

**Variables en Production** — sólo nombres, ningún valor leído ni impreso:

| Variable | Tipo |
|---|---|
| `CRON_SECRET` · `RESEND_API_KEY` · `TURNSTILE_SECRET_KEY` · `IP_HASH_SALT` · `WEB_DATABASE_URL` | **Secret** |
| `EMAIL_FROM` · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Config *(no son secretos)* |

## 8 · Formularios apagados

```
  WAITLIST_ENABLED        = false
  PARTNER_LEADS_ENABLED   = false

  POST /api/waitlist              → 404
  POST /api/leads/partners        → 404
  GET  /api/waitlist/confirmar    → 404
  GET  /api/waitlist/baja         → 404
```

En las **14 rutas**: `0 form · 0 input · 0 textarea · 0 select`.
En los **27 scripts** de las cinco rutas comprobadas: **0 con Turnstile**, **0
peticiones a `challenges.cloudflare.com`**, CSP cerrada.

*(De estas cuatro comprobaciones, sólo «0 scripts con Turnstile» es mérito de la
ronda anterior: las otras tres ya eran ciertas antes.)*

## 9 · Supabase Web — verificado por mí, en solo lectura

```
  tabla                  RLS     políticas   filas
  contactos_aliados      true        0         0
  intentos_web           true        0         0
  lista_de_espera        true        0         0

  tablas de conductores/documentos/viajes/wallet/usuarios:  NINGUNA — correcto
  privilegios de anon / authenticated / public:             ninguno, ni uno
  extensiones: pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp
```

Exactamente las tres tablas que la web necesita, **vacías** (sin restos de las
pruebas de QA), con **RLS activa y cero políticas** — es decir, la API pública de
Supabase no puede tocarlas ni aunque quisiera. **No existe ni una tabla
relacionada con la app móvil.**

## 10 · Retención automática

```
  vercel crons ls → 1 cron job
    /api/cron/retencion        0 4 * * *        (04:00 a diario)

  GET /api/cron/retencion sin cabecera       → 404
  GET /api/cron/retencion con secreto falso  → 404
```

Protegido con `CRON_SECRET` por comparación en tiempo constante, y devuelve
**404, no 401** — no confirma que la ruta exista. Sin PII en los registros.
Lógica: pendientes >30 días, aliados >12 meses, intentos >24 h. **No disparé
ningún borrado.**

Matices en B11 y B12.

## 11 · Resend

`RESEND_API_KEY` presente en Production como **Secret**. El remitente sale del
apex `mas58express.com`, que es el dominio con DKIM — la corrección de una ronda
anterior sigue en pie y el DNS la respalda. Plantillas escritas.

**Entrega real: NO CERTIFICADA.** Es el bloqueo A2. No envié ningún correo.

> **Actualizado el 15 de septiembre.** Ya se envió el correo autorizado desde
> producción. La clave **autentica** y es de *sending access*; Resend aceptó el
> mensaje con HTTP 200. Falta confirmar el buzón. Ver
> [Certificación de Resend](#certificación-de-resend--15-de-septiembre).

## 12 · Documentos legales

**Términos — versión 1.1, 14 de septiembre.** Las seis observaciones de Fernando
Atencio siguen incorporadas y ningún commit posterior tocó el fichero
(`git diff 20e8c64 HEAD` sobre `terminos/page.tsx` y `legal.ts`: vacío). Las once
frases que el commit retiró dan **cero coincidencias** en producción. Las 17
secciones del repositorio coinciden bloque a bloque con lo publicado, con las 17
anclas intactas.

**Privacidad — versión 1.0, 13 de septiembre.** Publicada. **Pendiente de
confirmación final del abogado** (bloqueo A1). En ninguna parte se afirma que
haya sido revisada o aprobada.

> **Actualizado el 15 de septiembre.** El documento pasó a **versión 1.1 (15 de
> septiembre de 2026)** y Fernando Atencio completó su revisión final y la
> aprobó. El sitio sigue sin afirmarlo en ninguna parte: el estado vive en esta
> documentación interna, no en la página.

**Datos legales, verificados literalmente contra producción:**

| | |
|---|---|
| Razón social | `+58 EXPRESS, C.A.` ✔ |
| RIF | `J508723600` — **sin guiones, en las 4 apariciones del HTML y en el JSON-LD** ✔ |
| Domicilio | Carretera Vía El Moján, Casa Nro. S/N, Sector Puerto Caballo, Maracaibo, Estado Zulia, Zona Postal 4001, República Bolivariana de Venezuela ✔ |
| Responsable | `+58 EXPRESS, C.A.` ✔ |
| Privacidad | `58expressapp@gmail.com` ✔ |
| Jurisdicción | Maracaibo, Estado Zulia, República Bolivariana de Venezuela ✔ |
| Plazo interno | 15 días hábiles, descrito como **compromiso propio y no como plazo legal** ✔ |

## 13 · Rendimiento — sin regresiones

**Lighthouse sobre producción, las 8 páginas principales:**

| | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| **Escritorio** | **100** en las 8 | 100 | 100 | 100 |
| **Móvil** | 93–100 (media **99**) | 100 | 100 | 100 |

- **CLS máximo: 0,007.** El arreglo de la ronda anterior se sostiene: `/nosotros`
  en escritorio va de **0,172 a 0,000**.
- **TTFB 76–143 ms.**
- **TBT 0 ms en escritorio, 20–50 ms en móvil.**
- La única página bajo 98 en móvil es la portada (93), por el LCP de 3,3 s que ya
  demostré que es **un artefacto del modo `simulate` de Lighthouse** — con
  estrangulamiento real, FCP y LCP coinciden.

**GSAP, Lenis, ScrollTrigger, el hero, el scrollytelling y los teléfonos 3D:
intactos.** No se tocó nada, y la medición no da ningún motivo para tocarlos.

## 14 · Imágenes

Las **13 imágenes de dominio propio** pasan todas por `/_next/image`, ninguna
carece de atributo `alt`, y las tres fotos de `/nosotros` llevan `alt` descriptivo
real. Las decorativas —la moto del hero, las miniaturas de zona— llevan `alt=""`,
que es la forma correcta de marcarlas.

**No queda ni una referencia activa** a las tres fotos antiguas. Pero **siguen
desplegadas y accesibles por URL directa** (B5), y la sustitución **no llegó a la
portada** (B6). Y el contenido de las nuevas es B1.

## 15 · Accesibilidad

**axe WCAG 2.1 AA sobre producción: 0 violaciones** en 11 rutas × móvil y
escritorio.

> Una corrección a mí mismo: en la primera pasada axe me dio 3 violaciones de
> `color-contrast` en escritorio. **Eran mías, no del sitio.** No estaba
> recorriendo la página antes de analizar, así que axe medía el contraste de
> textos que todavía estaban a `opacity: 0` en pleno fundido de entrada. La suite
> del proyecto ya hacía ese recorrido, y por eso ella no las veía.

- **Responsive:** 11 rutas × 7 anchos (360 · 390 · 430 · 768 · 1024 · 1440 ·
  1920) = 77 combinaciones, **0 desbordamientos horizontales**.
- **Teclado:** la primera parada es «Saltar al contenido» en las tres páginas
  probadas; 14 paradas sin una sola sin anillo de foco ni fuera de pantalla.
- **Landmarks:** un `<main>` por página, cabecera y pie presentes.
- **Enlaces externos:** los 7 con `rel="noopener noreferrer"` y nombre accesible
  que avisa de que abren pestaña nueva.

**El punto ciego está en B4:** los cinco pasos del producto no llegan al árbol de
accesibilidad porque GSAP los deja en `visibility: hidden`. axe no lo marca
—`visibility: hidden` es legítimo— pero un lector de pantalla no los alcanza.

## 16 · Enlaces

**73 destinos distintos en 13 páginas: 0 rotos, 0 sin nombre accesible.**

| Tipo | Nº | Resultado |
|---|---|---|
| Internos | 29 | todos 200, sin redirecciones innecesarias |
| Anclas | 33 | todas resuelven a un `id` existente en su propia página |
| Externos | 7 | 3 redes + 4 WhatsApp, todos 200 en navegador real |
| `mailto:` | 4 | todos bien formados |

---

## Lo que NO pude verificar

Lo digo para que nadie lo dé por comprobado:

- **Que un correo de Resend llegue a un buzón.** El encargo prohibía enviarlo.
- **Si existe el programa de niveles** que promete `driver-onboarding.webp`: el
  backend de la app queda fuera de este encargo.
- **Cuál de las dos versiones de cada plaza es la correcta.** Eso lo resuelve
  cualquiera del Zulia de un vistazo; yo sólo puedo demostrar que no coinciden.
- **Navegadores distintos de Chromium.** No probé Safari/iOS ni Firefox.
- **Dispositivos físicos.** Todo lo móvil es emulación.
- **Lectores de pantalla reales** (NVDA, VoiceOver). Inspeccioné el árbol de
  accesibilidad, no el comportamiento de una ayuda técnica.
- **El panel de Vercel Analytics.** Verifiqué que las balizas salen con 200; no
  que los datos aparezcan en el panel.

---

## Veredicto final

> **READY excepto por:**
>
> 1. ~~**La Política de Privacidad, pendiente de confirmación final del abogado** (A1)~~
>    → **RESUELTO el 15 de septiembre:** revisión final completada y aprobada por
>    Fernando Atencio, versión 1.1
> 2. **La entrega de Resend** — el envío ya está hecho y aceptado (HTTP 200);
>    queda **confirmar la recepción real en el buzón**. Bloquea sólo la lista de
>    espera (A2)
> 3. **La tabla de proveedores de la política, que no declara que los datos de un
>    comercio acaban en un buzón de Gmail** — bloquea sólo el formulario de
>    comercios (A3)
>
> Los tres son de contenido o de proceso. **Ninguno es técnico.**

La infraestructura está lista y medida: dominio, SEO, seguridad, almacén,
retención, analítica, rendimiento y accesibilidad pasan todas las comprobaciones
contra producción. Lo que falta no se arregla con código.

**Y una recomendación que no es un bloqueo pero sí lo primero que arreglaría:**
las imágenes (B1 y B2). No impiden encender nada, pero son lo único del sitio que
promete lo que el producto todavía no puede cumplir — un precio, una cobertura
nacional, una cifra de usuarios a medio escribir — en una web cuya credibilidad
entera se construyó sobre no hacer exactamente eso.

**No se debe declarar la web «100 % lista para formularios» mientras A1 siga
abierto.**

> **15 de septiembre.** A1 y A3 están cerrados. El único requisito que queda
> para encender la lista de espera es **confirmar que el correo de prueba llegó
> a `58expressapp@gmail.com`**. `PARTNER_LEADS_ENABLED` se queda en `false` por
> decisión del propietario, no por un bloqueo técnico.
