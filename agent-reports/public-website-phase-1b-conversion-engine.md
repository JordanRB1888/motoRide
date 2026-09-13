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
| Turnstile | **PASA PARCIAL** — verificación de servidor completa y probada; claves reales **CONFIGURADAS** en Production (§16). **LISTO, NO ACTIVADO**: el widget real no se ha ejecutado con formularios públicos |
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

> **Actualizado el 13 de septiembre de 2026 (§15):** las dos primeras ya están
> configuradas como Secret en Preview y Production. Las cuatro restantes siguen
> sin existir, y **no se inventó ninguna clave.**

| Variable | Para qué | Sin ella |
|---|---|---|
| ~~`WEB_DATABASE_URL`~~ ✅ | Almacén de la web | Las rutas responden 503 |
| ~~`IP_HASH_SALT`~~ ✅ | Sal del HMAC de la IP | No se guarda huella; el límite por IP no actúa |
| ~~`NEXT_PUBLIC_TURNSTILE_SITE_KEY`~~ ✅ | Widget en el navegador | El widget no se pinta |
| ~~`TURNSTILE_SECRET_KEY`~~ ✅ | Verificación en el servidor | **No deja pasar nada** |
| `RESEND_API_KEY` | Envío de correos | No se manda ninguno; el alta se guarda igual |
| `EMAIL_FROM` | Remitente | Por omisión `hola@send.mas58express.com` |
| `EMAIL_EQUIPO` | Aviso interno | Por omisión `58expressapp@gmail.com` |
| `NEXT_PUBLIC_SITE_URL` | Base de los enlaces del correo | Por omisión `https://mas58express.com` |

---

## 12. Bloqueos

| # | Bloqueo | Depende de |
|---|---|---|
| 1 | **Política de privacidad y responsable identificado** | Tuya. Bloquea encender cualquier formulario |
| 2 | ~~**Provisionar la base de la web**~~ ✅ **Resuelto** | Proyecto Supabase «+58Express Web», conectado y certificado (§15) |
| 3 | ~~**Claves de Turnstile**~~ ✅ **Resuelto** | Configuradas en Production el 13/09/2026 (§16) |
| 4 | **`RESEND_API_KEY` en el proyecto web** | Tuya — la clave existe en Railway, pero la integración la devuelve redactada y no puedo leerla |
| 5 | **Activar Web Analytics en el proyecto** | Tuya — un interruptor |

---

## 13. ACCIONES MANUALES DEL DUEÑO

1. ~~**Crear la base de datos de la web.**~~ ✅ **Hecho el 13 de septiembre de
   2026.** Proyecto Supabase **«+58Express Web»**, separado del de la
   aplicación. Las dos tablas ya existían y se verificaron contra el esquema
   declarado; se añadió una tercera para el limitador, que no guarda datos
   personales. Conectado por el Transaction Pooler, con TLS verificado y
   certificado punto por punto — §15.

   *Queda una comprobación opcional de treinta segundos:* descargar el
   certificado desde *Project Settings → Database → SSL Configuration* y
   contrastar su huella SHA-256 con la anotada en `lib/datos/supabase-ca.ts`
   (§15.6).
2. ~~**Claves de Turnstile.**~~ ✅ **Hecho el 13 de septiembre de 2026.** Las dos
   están en `plus58express-web`, sólo en Production, y verificadas con los
   interruptores apagados — §16. **LISTO, NO ACTIVADO.**
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

---

## 15. Supabase Web Database

Añadido el 13 de septiembre de 2026. La web ya no habla con un almacén de
memoria: escribe en Postgres de verdad, y está certificado contra la base real.

### 15.1 A qué se conecta

| | |
|---|---|
| Proyecto | **+58Express Web** — exclusivo de la web pública |
| Servidor | PostgreSQL 17.6 |
| Acceso | Transaction Pooler (Supavisor), `***.pooler.supabase.com:6543/postgres` |
| Rol | `postgres` |
| TLS | **Verificado** contra `Supabase Root 2021 CA` — cadena y nombre de servidor |
| Cliente | `pg` 8.23, adaptador en `lib/datos/postgres.ts` |

No se tocó ningún proyecto Supabase de la aplicación móvil. El guion de
configuración lleva un cortafuegos que aborta si encuentra tablas de la
aplicación (`usuarios`, `viajes`, `conductores`, `wallet`…): no saltó.

### 15.2 El esquema real, verificado antes de escribir una fila

`scripts/verificar-esquema.mjs` lee el catálogo y compara contra
`lib/datos/esquema.sql`. No escribe nada. Resultado:

- **`lista_de_espera`** — las 14 columnas esperadas, con los tipos esperados.
- **`contactos_aliados`** — las 12 columnas esperadas.
- **Los `CHECK` coinciden exactamente con las uniones de TypeScript**: `estado`
  admite `pendiente | confirmado | caducado | baja | rebotado`; `rol`,
  `pasajero | conductor | comercio`; `zona`, las tres zonas. Ningún estado
  alcanzable por código puede ser rechazado por la base, y ninguno que la base
  acepte queda fuera del tipo.
- **Índices únicos** sobre `email`, `token_confirmacion` y `token_baja`. El de
  `email` no es un detalle de rendimiento: es lo que hace idempotente el alta.
- **RLS activado en las tres tablas, con cero políticas**, y ni `anon` ni
  `authenticated` conservan permiso alguno. Eso es lo correcto y no un descuido:
  el navegador no debe consultar estas tablas nunca. Todo el acceso ocurre desde
  el servidor.

**Una diferencia, reportada antes de aplicarla.** Faltaba una tercera tabla. El
límite de peticiones tiene que contar *intentos*, no filas: quien prueba mil
veces el mismo correo crea una sola fila y haría mil intentos invisibles, y los
envíos hay que espaciarlos aunque no cambien ninguna fila. Se creó
`public.intentos_web` con las mismas cuatro sentencias que declara
`esquema.sql`, en una transacción, desde `scripts/crear-intentos-web.mjs` (que
por defecto sólo las enseña; ejecuta con `--de-verdad`). **No guarda ni un dato
personal**: la clave es `waitlist:<hmac de la ip>`, `aliados:<hmac>` o
`envio:<id de la fila>` — ni correos, ni IPs, ni nombres. RLS activado y
permisos revocados, igual que las otras dos.

### 15.3 Compatibilidad con el pooler en modo transacción

Ahí una conexión de servidor se recicla entre transacciones, así que no existe
el estado de sesión. Tres consecuencias, las tres respetadas:

- **Ninguna sentencia preparada con nombre.** `pg` sólo las crea si se le pasa
  `name`; todas las consultas pasan por un único ayudante que no se lo pasa
  nunca, de modo que la garantía es estructural. Hay una prueba que lo comprueba
  contra `pg_prepared_statements`.
- **Ningún parámetro de arranque.** El plazo de las consultas es
  `query_timeout`, del lado del cliente, en vez de `statement_timeout`, que
  viajaría en el arranque.
- **Pool diminuto y reutilizado.** `max: 3`, cacheado en `globalThis` para que
  sobreviva a las recargas en caliente y a las invocaciones sucesivas de la misma
  instancia. El pooler reparte un número finito de conexiones entre todas las
  instancias vivas; ser generoso aquí es quedarse sin ninguna en el primer pico.

### 15.4 Concurrencia: resuelta en la base, no en JavaScript

Dos peticiones a la vez son el caso normal, no el raro — la gente pulsa dos
veces y los clientes de correo pre-visitan los enlaces. Cada operación sensible
es **una sentencia atómica con su guarda en el `WHERE`**:

| Operación | Cómo se protege | Certificado por |
|---|---|---|
| Alta duplicada | `ON CONFLICT (email)` sobre el índice único | C, C-bis (5 simultáneas → 1 fila) |
| Doble confirmación | `UPDATE … WHERE token_confirmacion IS NOT NULL` | E-bis (sólo una surte efecto) |
| Baja repetida | `UPDATE … WHERE estado <> 'baja'` | F+G (la fecha no se mueve) |
| Reconfirmar tras baja | `AND estado <> 'baja'` | G-bis |
| Contar intentos | `ON CONFLICT … DO UPDATE SET n = n + 1 RETURNING n` | H-0 (10 simultáneas → 1..10) |

### 15.5 Tres defectos encontrados por revisión adversarial, y arreglados

Antes de certificar, quince agentes revisaron el adaptador desde cinco lentes
independientes y cada hallazgo pasó por una fase de refutación. Tres
sobrevivieron. Los tres eran reales.

**1 · El limitador no limitaba.** La primera versión contaba filas dentro de la
misma sentencia que las insertaba, con un comentario afirmando que eso evitaba
la carrera. Era falso: cada sentencia ve la instantánea que tomó al empezar, así
que cincuenta peticiones simultáneas cuentan las cincuenta *cero intentos
previos* y pasan las cincuenta. Frenaba sólo a quien iba despacio. Ahora es una
fila-contador con `ON CONFLICT DO UPDATE`, que sí toma cerrojo de fila.

*El precio, dicho claramente:* la ventana pasa a ser fija en vez de deslizante,
así que en el cambio de cubo caben hasta el doble de intentos. Se paga con
gusto: un límite aproximado que se cumple siempre vale más que uno exacto que se
rompe justo cuando lo atacan. Y como el cubo sale del tamaño de la ventana, una
clave sometida a dos límites distintos lleva dos cuentas separadas — está
documentado en el código y hay una prueba (H-quinquies) para que no sorprenda.

**2 · Un callejón sin salida permanente.** Al caducar un enlace se pone el
testigo a `NULL`. Con `ON CONFLICT DO NOTHING`, quien volvía a apuntarse recibía
un correo con el enlace **vacío**, que la ruta rechaza siempre: esa dirección no
podía confirmarse nunca más. Ahora el testigo se renueva, pero **sólo si el
anterior ya no sirve** — si siguiera vivo, cualquiera podría anular el enlace de
otra persona escribiendo su dirección en el formulario. A quien ya confirmó no
se le toca; a quien se dio de baja no se le resucita. Mismo criterio en el
almacén de memoria, que tenía el mismo fallo.

**3 · Un tropiezo de la base era una página de error.** El almacén de memoria no
podía rechazar nunca y las cuatro rutas estaban escritas contra eso. El de
Postgres sí puede. Dos consecuencias, y la segunda es la grave: quien pulsaba un
enlace del correo veía un 500 en lugar de `/gracias`; y **un 500 tras el alta
pero durante el envío delataba que esa dirección llegó a tocar el almacén** —
justo la enumeración que el fichero dice en mayúsculas que no permite. Las
cuatro rutas tienen ahora la caída que cada una tenía diseñada (503 en los
formularios, `invalido` en los enlaces), y se añadió un estado `error` a
`/gracias` y `/baja`: decirle «este enlace no vale» a alguien con un enlace
perfecto lo hace rendirse por un problema que no es suyo, y en la baja es la
forma más rápida de que marque el siguiente correo como spam.

### 15.6 TLS: por qué hay un certificado en el repositorio

El pooler presenta un certificado firmado por la autoridad propia de Supabase,
que no está en el almacén de confianza de Node: con verificación estricta
fallaba con `SELF_SIGNED_CERT_IN_CHAIN`, y con ella toda consulta.

La salida fácil es `rejectUnauthorized: false`. Convierte el cifrado en
decoración: se sigue cifrando, pero contra cualquiera que se ponga en medio,
porque ya no se comprueba con quién se habla. En una conexión que va a llevar
direcciones de correo de personas, eso no vale.

Se ancla la raíz `Supabase Root 2021 CA` en `lib/datos/supabase-ca.ts`, y con
ella la verificación es completa: `authorized: true` frente a
`*.pooler.supabase.com`. Es un certificado **público**: no abre nada ni
autentica a nadie.

> **Su procedencia tiene un límite.** Se extrajo de la cadena que presenta el
> propio servidor, porque Supabase sólo publica el fichero desde el panel
> autenticado (su antigua descarga pública responde 404). Cerrar el círculo
> cuesta una comprobación que se hace una vez: *Project Settings → Database →
> SSL Configuration → Download certificate*, y comparar con la huella SHA-256
> anotada en la cabecera del fichero. Caduca el 26 de abril de 2031.

### 15.7 Certificación contra la base real

Las 20 pruebas de `tests/postgres.spec.ts` se ejecutaron contra Supabase. **20
de 20.** Se saltan solas si no hay `WEB_DATABASE_URL`, de modo que un clon
recién hecho sigue pasando la suite sin credenciales de nadie.

| Punto del encargo | Prueba | Resultado |
|---|---|---|
| A · Insertar en la lista | A+B | ✅ |
| B · Leerla | A+B (con otro repositorio) | ✅ |
| C · El duplicado no crea segunda fila | C, C-bis | ✅ |
| D · `pendiente` → `confirmado` | D+E | ✅ |
| E · El testigo queda consumido | D+E, E-bis, E-ter | ✅ |
| F · La baja funciona | F+G | ✅ |
| G · La segunda baja es idempotente | F+G, G-bis | ✅ |
| H · El límite persiste | H, H-0, H-bis, H-ter, H-quater, H-quinquies | ✅ |
| I · Insertar lead de comercio | I+J | ✅ |
| J · Estado inicial `nuevo` | I+J | ✅ |
| K · Limpieza | K + auditoría independiente | ✅ |

Extras que no pedía el encargo y que el almacén de memoria no puede demostrar:
renovación condicional del testigo (C-ter, C-quater, C-quinquies), ráfaga
simultánea contra el límite (H-0) y ausencia de sentencias preparadas con
nombre.

**Suite completa: 161 pruebas.** Verdes en local, contra la vista previa
`plus58express-1fe00kybp` y contra producción `plus58express-fvg4olz9i`.
TypeScript limpio.

### 15.8 Limpieza de QA

Todo lo escrito llevó el prefijo `qa.web.` y direcciones `@example.com`. Se borra
en la propia prueba K y otra vez en el cierre, por prefijo y no por lista, para
que un fallo a mitad no deje restos. Auditoría independiente después de las tres
pasadas completas:

```
lista_de_espera      filas=0  restos_qa=0
contactos_aliados    filas=0  restos_qa=0
intentos_web         filas=0  restos_qa=0
envios sueltos       0
```

### 15.9 Variables configuradas

En `plus58express-web`, como **Secret** (Vercel las entrega al despliegue y no
permite volver a leerlas, ni desde el panel ni con `vercel env pull`), en
**Preview y Production**:

| Variable | Tipo | Entornos |
|---|---|---|
| `WEB_DATABASE_URL` | Secret | Preview, Production |
| `IP_HASH_SALT` | Secret | Preview, Production |

Se subieron por la entrada estándar, nunca como argumento de la línea de
órdenes. La cadena no aparece en el repositorio, ni en este informe, ni en
ningún registro. En local vive sólo en `web/.env.local`, que `.gitignore`
excluye.

`IP_HASH_SALT` no estaba prevista para esta ronda: el proyecto web tenía **cero**
variables, y sin esa sal `huellaDeIp` devuelve `null` y el límite por IP no
llega a actuar nunca. Se generó aleatoria en la misma ejecución.

### 15.10 Los formularios siguen invisibles

Comprobado en producción después de promover:

| Comprobación | Resultado |
|---|---|
| `WAITLIST_ENABLED`, `PARTNER_LEADS_ENABLED` | `false` |
| Campos en `/`, `/aliados`, `/conductores`, `/contacto` | **0** |
| `POST /api/waitlist` | **404** |
| `POST /api/leads/partners` | **404** |
| `GET /api/waitlist/confirmar` y `/baja` | **404** |
| `Set-Cookie` | ninguna |
| `challenges.cloudflare.com` en la CSP | no aparece |
| `frame-src` | `'none'` |
| `www` → apex | 308 |

La base queda conectada sin que ninguna ruta pública acepte un dato. Encenderla
sigue siendo cambiar `false` por `true` en `lib/flags.ts` — y sigue bloqueado
por la política de privacidad.

---

## 16. Turnstile real

Añadido el 13 de septiembre de 2026.

**Turnstile keys = CONFIGURADAS**
**Turnstile real = LISTO, NO ACTIVADO**

No está certificado de extremo a extremo, y no se declarará hasta que lo esté:
el widget real no se ha ejecutado nunca con un formulario público, porque no hay
ninguno publicado. Lo que sí está probado es todo lo demás.

### 16.1 Las claves

| Variable | Tipo en Vercel | Entornos |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Config | **Production** |
| `TURNSTILE_SECRET_KEY` | Secret | **Production** |

Sólo Production, a propósito: el widget únicamente autoriza `mas58express.com`,
así que una clave real en una vista previa daría un desafío que nunca podría
resolverse. Y eso **no abre un agujero**, porque sin clave
`verificarTurnstile` devuelve `SIN_CONFIGURAR` y **no deja pasar**: una vista
previa no puede aceptar un envío aunque alguien encienda los interruptores ahí.

La Site Key va como `Config` y no como Secret deliberadamente. Es pública por
diseño —viaja incrustada en el JavaScript que descarga cualquier visitante, que
es su función—, así que marcarla como secreta sería teatro y la haría ilegible
sin ganar nada. La Secret Key sí es Secret: Vercel la entrega al despliegue y no
permite volver a leerla.

Ninguna de las dos aparece en este informe, en el repositorio ni en ningún
registro.

> **Dos tropiezos por el camino, por si se repiten.** La Site Key se configuró
> primero como `TURNSTILE_SITE_KEY`, sin el prefijo `NEXT_PUBLIC_`. Next sólo
> entrega al navegador las variables con ese prefijo, así que el widget habría
> recibido `undefined` y no se habría pintado nunca — un fallo que no se habría
> visto hasta el día de encenderlo. Se volvió a crear con el nombre correcto y
> se borró la huérfana.
>
> Y una alarma mía que era falsa: en `vercel env ls` el valor aparece como
> `eyJ2IjoidjIiLCJjIj…`, que no tiene forma de clave de Turnstile. Es cómo Vercel
> representa el valor en el listado, no el valor. El valor guardado sí tiene la
> forma correcta: 24 caracteres empezando por `0x`, comprobado sin imprimirlo.

### 16.2 Verificado en producción, con los interruptores apagados

Despliegue `plus58express-nvk8jq558`, ya con las dos claves configuradas.

| Comprobación | Resultado |
|---|---|
| TypeScript | limpio |
| Build de producción | correcto |
| Turnstile en el HTML de `/`, `/aliados`, `/conductores`, `/contacto` | **0** en las cuatro |
| Site Key en el HTML servido | **no aparece** |
| `challenges.cloudflare.com` en la CSP | **no aparece** |
| `frame-src` | `'none'` |
| `script-src` / `connect-src` | `'self' 'unsafe-inline'` / `'self'` |
| Peticiones del navegador a Cloudflare al recorrer las tres páginas | **ninguna** |
| Marcos del desafío en el documento | **0** |
| `POST /api/waitlist` · `POST /api/leads/partners` | **404** · **404** |
| `GET /api/waitlist/confirmar` · `/baja` | **404** · **404** |
| `Set-Cookie` | ninguna |
| Suite completa | **162/162** |

La última fila del bloque de comprobaciones es nueva: `fase1b.spec.ts` incluye
ahora una prueba que recorre las tres páginas con un navegador de verdad y exige
cero peticiones a `challenges.cloudflare.com`. Comprobarlo con el navegador y no
con un grep del HTML es la diferencia entre «no está escrito» y «no se ejecuta».

### 16.3 Un matiz que conviene no redondear

`challenges.cloudflare.com` **sí aparece** en uno de los chunks de JavaScript que
descarga la portada, y desde este despliegue también la Site Key. No es una fuga:
las dos cosas son públicas por definición —la URL del cargador de Cloudflare y
una clave que está pensada para ir en el HTML—. Pero la afirmación «no aparece»
sólo es cierta del HTML y de la cabecera CSP, no de un grep de todo lo servido, y
conviene decirlo así.

El motivo es que las páginas importan los componentes de formulario
(`app/aliados/page.tsx` y `components/home/Descarga.tsx`), y esos importan
`Turnstile.tsx`. Aunque el interruptor apagado hace que devuelvan `null`, el
módulo entra en el paquete. La URL del cargador ya estaba ahí antes de configurar
ninguna clave — se comprobó construyendo sin ellas.

**Consecuencia real:** cada visitante descarga código muerto que no puede
ejecutarse. No es un problema de seguridad; es peso. Se arregla cargando los
formularios de forma diferida, para que vivan en un chunk que nunca se pide. **No
se ha hecho**, porque excede lo que pedía esta ronda; queda propuesto.
