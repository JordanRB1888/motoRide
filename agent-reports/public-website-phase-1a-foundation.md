# Fase Web 1-A — cimientos, sin publicar ni un formulario

**Qué es esto:** el diseño completo de lo que la Fase 1 tendrá que encender —lista de
espera, contactos de aliados, postulación de conductor y analítica—, dejado listo para
implementar. **No se activó nada.**

| | |
|---|---|
| **Rama** | `feat/public-marketing-site` |
| **HEAD al empezar** | `64de491` |
| **Producción verificada** | `/contacto` 200 · 404 correcto · CSP presente · WhatsApp en el pie — corresponde al cierre de Fase 0 |
| **Árbol** | limpio |
| **Fecha** | 13 de septiembre de 2026 |

**Sigue apagado, a propósito:** `WAITLIST_ENABLED = false` · cero formularios · cero
campos · cero cookies · cero analítica · sin base de datos · sin Turnstile · sin CORS
aplicado · sin cambios en DNS.

---

## 1. Privacidad

Entregado: [`web-privacy-draft-input.md`](./web-privacy-draft-input.md) — plantilla
técnica con los huecos marcados como `[[CORCHETES DOBLES]]` y **ni una identidad
inventada**.

Describe sólo tratamientos reales o planificados: Vercel, OpenStreetMap, Meta y Google
(los canales de contacto), Resend, la futura lista de espera, Turnstile, la postulación
de conductor, el contacto de aliados, la analítica sin cookies y la eliminación de datos.

**Siete huecos bloquean la redacción:** razón social, identificación fiscal, domicilio,
responsable, correo de privacidad, jurisdicción y plazo de respuesta.

> El tratamiento que más se pasa por alto y **ya está activo**: cada visitante que baja
> hasta el mapa envía su IP a OpenStreetMap. No está declarado en ninguna parte.

---

## 2. Correo corporativo

**DNS revisado hoy, sin modificar:**

| Registro | Estado |
|---|---|
| `mas58express.com` MX · TXT · `_dmarc` | **los tres SIN REGISTRO** |
| `send.mas58express.com` MX + SPF · `resend._domainkey` | presentes e **intactos** |
| Servidores de nombres | `ns1.vercel-dns.com`, `ns2.vercel-dns.com` |

Buzones objetivo: `hola@` · `soporte@` · `aliados@` · `conductores@`

### Opción A — Google Workspace *(recomendada)*

**Un solo usuario con tres alias**, no cuatro buzones: las cuatro direcciones caen en la
misma bandeja y se responde desde cualquiera.

| Nombre | Tipo | Valor | TTL | Motivo |
|---|---|---|---|---|
| `mas58express.com` | MX | `1 smtp.google.com` | 3600 | Entrega del correo entrante |
| `mas58express.com` | TXT | `v=spf1 include:_spf.google.com ~all` | 3600 | Autoriza a Google a enviar como el dominio |
| `google._domainkey` | TXT | *(clave que genera Google al activar DKIM)* | 3600 | Firma DKIM |
| `_dmarc` | TXT | ver §3 | 3600 | Política DMARC |

Coste orientativo: **~7 US$/usuario/mes** (Business Starter) — confirmar el precio
vigente al contratar. Hasta 30 alias por usuario, sin coste adicional.

### Opción B — Zoho Mail

| Nombre | Tipo | Valor | TTL | Motivo |
|---|---|---|---|---|
| `mas58express.com` | MX | `10 mx.zoho.com` | 3600 | Entrega |
| `mas58express.com` | MX | `20 mx2.zoho.com` | 3600 | Respaldo |
| `mas58express.com` | MX | `50 mx3.zoho.com` | 3600 | Respaldo |
| `mas58express.com` | TXT | `v=spf1 include:zoho.com ~all` | 3600 | Autoriza a Zoho |
| `zmail._domainkey` | TXT | *(clave que genera Zoho)* | 3600 | Firma DKIM |
| `mas58express.com` | TXT | `zoho-verification=…` | 3600 | Verificación del dominio |

Tiene plan gratuito para un dominio con varios buzones (webmail y app móvil, sin IMAP).
**Confirmar las condiciones vigentes al registrarse**, porque cambian.

### Por qué recomiendo A

Ya viven en Gmail (`58expressapp@gmail.com`): no cambian de herramienta, los alias salen
gratis y la entregabilidad es mejor — que en un negocio que va a mandar avisos de
lanzamiento no es un detalle menor. Zoho es la vía de coste cero si prefieren no gastar.

**Un solo registro MX puede existir a la vez.** Elegir A o B es excluyente, y ninguna de
las dos toca `send.mas58express.com`.

> **No se contrató nada.** Ambas exigen decisión y tocar DNS.

---

## 3. SPF y DMARC — para el estado actual

Estos dos **no dependen del proveedor** y se pueden poner ya:

| Nombre | Tipo | Valor | TTL | Motivo |
|---|---|---|---|---|
| `mas58express.com` | TXT | `v=spf1 -all` | 3600 | Declara que **nada** envía desde el dominio desnudo |
| `_dmarc.mas58express.com` | TXT | `v=DMARC1; p=none; rua=mailto:58expressapp@gmail.com; fo=1` | 3600 | Empieza a **vigilar** sin rechazar nada |

### Validación: ¿rompen Resend? **No.**

Lo comprobé razonando sobre cómo se evalúa cada mecanismo, no por suposición:

- **SPF se evalúa contra el dominio del remitente de sobre.** Resend envía desde
  `send.mas58express.com`, que tiene **su propio** `v=spf1 include:amazonses.com ~all`.
  Un `-all` en el apex gobierna sólo al apex, que hoy no envía nada.
- **DKIM no se toca**: `resend._domainkey.mas58express.com` queda intacto.
- **DMARC en `p=none` no rechaza nada** por definición: sólo pide informes.

**Cuando se endurezca** a `p=quarantine` y luego a `p=reject`, hay que comprobar antes en
los informes `rua` que el correo de Resend pasa la alineación —debería, porque su DKIM
firma con `d=mas58express.com`—. **No subir la política sin haber leído un mes de
informes.**

Y cuando se contrate proveedor de buzón, el SPF del apex pasa de `-all` a incluir al
proveedor (§2).

**Por qué corre prisa:** hoy cualquiera puede enviar correo firmando como
`@mas58express.com` y ningún receptor lo rechazará. Justo mientras se construye la marca.

> **No aplicados**: tocar DNS requiere tu permiso.

---

## 4. Search Console

Revisado en producción, todo correcto por parte del sitio:

| | |
|---|---|
| `sitemap.xml` | **9 rutas**, incluida `/contacto` |
| `robots.txt` | `Allow: /`, sin bloqueos, con `Sitemap:` y `Host:` |
| Canonical | Correcto en las once rutas; coincide con `og:url` |
| Indexables | Nueve |
| `/privacidad` y `/terminos` | `noindex, nofollow` **a propósito** y fuera del sitemap |

**No hay etiqueta de verificación** en el sitio y **no me la invento**. Es la acción
manual nº 1 de la última sección.

En cuanto me pases la etiqueta: la integro en el `<head>`, despliego, verifico la
propiedad y envío el sitemap.

---

## 5. `admin-staging` — la forma más aislada

**Investigado a fondo. No se tocó nada**, y con razón.

Los tres proyectos de Vercel declaran **Root Directory `.`**:

| Proyecto | Contexto que se sube | ¿Le alcanzaría un `vercel.json` en la raíz del repo? |
|---|---|---|
| `plus58express` | raíz del repositorio (`.vercel` de la raíz apunta aquí) | **Sí** |
| `mas58express-admin-staging` | raíz del repositorio | **Sí** |
| `plus58express-web` | **`web/`** (su `.vercel` vive ahí) | **No** |

Es decir: el `vercel.json` global **no tocaría el sitio público, pero sí a
`plus58express`**. Eso es exactamente lo que pediste evitar, así que queda descartado.

### Alternativas aisladas de verdad

| | Opción | Aislamiento | Esfuerzo | Requiere redesplegar Admin |
|---|---|---|---|---|
| **1** | **Deployment Protection (Vercel Authentication)** en el proyecto `mas58express-admin-staging` | **Total** — es un interruptor del proyecto | Muy bajo | **No** |
| 2 | Dar al Admin su propio **Root Directory** (p. ej. `admin/`) con su `vercel.json` | Total | Alto — reestructura el build | Sí |
| 3 | Separar el Admin a su **propio repositorio** | Total | Muy alto | Sí |

**Recomiendo la 1.** Es un interruptor en los ajustes del proyecto, no toca ni un
fichero, no redespliega nada y no puede alcanzar a otro proyecto. Además hace más que un
`noindex`: un rastreador recibe **401** en lugar de una página, así que el panel sale del
índice y deja de estar a la vista de cualquiera. Y encaja con la decisión ya registrada
de endurecer el acceso administrativo.

**Contrapartida honesta:** quien quiera abrir `admin-staging` tendrá que estar
identificado en Vercel. Para un panel de administración eso es lo correcto; si el equipo
necesita entrar sin cuenta de Vercel, entonces toca la opción 2.

*(Variante que sólo tú puedes autorizar: si te parece bien que `plus58express.vercel.app`
—que también es una superficie heredada— quede `noindex` a la vez, el `vercel.json` en la
raíz resuelve los dos de una vez. No lo hago sin que lo digas.)*

**La web pública no enlaza `admin-staging` en ninguna parte.**

---

## 6. Lista de espera — arquitectura

### La decisión: A

| | **A · Route Handler de Next + almacén propio** | **B · Servicio externo especializado** |
|---|---|---|
| Dónde vive el dato | **Nuestro** | Del proveedor |
| Mismo origen | **Sí** — sin CORS, sin abrir la CSP | No: hay que permitir otro origen en la CSP |
| Doble confirmación | La escribimos (Resend ya está) | Incluida |
| Baja | La escribimos | Incluida |
| Coste | El de la base | Suscripción |
| Exportar / borrar | Una consulta | Depende del proveedor |
| Complejidad | **Razonable**: un endpoint, una tabla, dos correos | Baja |

**Recomendación: A.** Mantiene el dato bajo control —que es tu preferencia— y la
complejidad es asumible. Además evita tocar la CSP: cualquier servicio externo obligaría
a permitir otro origen de script y de conexión, y la política quedó estricta a propósito.

**Almacén sugerido:** una base **separada** de la de la aplicación. La aplicación usa
Supabase y **no se toca**: los contactos de la web son otra cosa y no deben compartir
credenciales ni ciclo de vida con los viajes.

> Un efecto que conviene saber: hoy las once rutas son estáticas. El primer *route
> handler* añade una función; el resto del sitio sigue estático.

### Contrato

```
POST /api/waitlist
  Content-Type: application/json
  { email, rol?, zona?, turnstileToken }

  201 { estado: "pendiente" }        se envió el correo de confirmación
  200 { estado: "ya_registrado" }    respuesta idéntica a propósito: no revela quién está en la lista
  400 { error: "EMAIL_INVALIDO" | "TURNSTILE_INVALIDO" }
  429 { error: "DEMASIADAS_PETICIONES" }

GET  /api/waitlist/confirmar?token=…   → 302 a /gracias   (o token caducado)
GET  /api/waitlist/baja?token=…        → 302 a /baja
```

### Estados

```
pendiente ──(pulsa el enlace del correo)──> confirmado ──(pulsa baja)──> baja
    │                                            │
    └──(token caduca a las 48 h)──> caducado     └──(el correo rebota)──> rebotado
```

### Esquema de datos propuesto

```sql
create table lista_de_espera (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,          -- normalizado a minúsculas
  rol                 text check (rol in ('pasajero','conductor','comercio')),
  zona                text check (zona in ('santa-cruz-de-mara','el-mojan','maracaibo')),
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente','confirmado','caducado','baja','rebotado')),
  token_confirmacion  text unique,
  token_expira_en     timestamptz,
  token_baja          text unique,                   -- distinto del de confirmación
  confirmado_en       timestamptz,
  baja_en             timestamptz,
  origen              text,                          -- utm_source / campaña
  ip_hash             text,                          -- SHA-256 con sal: para abuso, NUNCA la IP en claro
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create index on lista_de_espera (estado);
create index on lista_de_espera (creado_en);
```

**Decisiones que lleva dentro:** el correo es único, así que reenviar no duplica · los
dos testigos son distintos, para que el enlace de baja no confirme por accidente · **la
IP se guarda troceada**, nunca en claro · `origen` permite saber qué campaña funcionó sin
rastrear a nadie.

### Defensas

| Capa | Qué hace |
|---|---|
| **Turnstile** | Testigo verificado en el servidor antes de tocar la base |
| **Límite por IP** | 5 altas por hora y por `ip_hash` |
| **Límite por correo** | 1 correo de confirmación cada 10 minutos |
| **Trampa** (honeypot) | Campo oculto que un humano nunca rellena |
| **Tiempo mínimo** | Un envío en menos de 3 s es un robot |
| **Validación en servidor** | Esquema estricto y lista blanca de campos: lo que no está declarado, se descarta |

### Retención

30 días después del aviso de lanzamiento, o inmediato si se dan de baja. Los `pendiente`
caducados se borran a los 30 días: nunca dieron consentimiento.

---

## 7. Contacto de comercios aliados

Un contacto simple, **no un alta completa**: el backend no conoce la palabra «comercio»,
y fingir lo contrario sería prometer lo que no existe.

```
POST /api/leads/partners
  { nombre, negocio, telefono, email, municipio, tipoComercio, mensaje?, consentimiento, turnstileToken }

  201 { estado: "recibido" }
  400 { error: "VALIDACION", campos: { … } }
  429 { error: "DEMASIADAS_PETICIONES" }
```

```sql
create table contactos_aliados (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  negocio           text not null,
  telefono          text not null,
  email             text not null,
  municipio         text not null,   -- Mara · Maracaibo · otro
  tipo_comercio     text not null,   -- comida · mercado · farmacia · otro
  mensaje           text,
  consentimiento_en timestamptz not null,   -- cuándo aceptó, no un booleano
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo','contactado','en_conversacion','cerrado_ganado','cerrado_perdido')),
  ip_hash           text,
  creado_en         timestamptz not null default now()
);
```

**Acuse de recibo:** correo inmediato por Resend que dice que llegó y **no promete plazo**
—porque no hay plazo comprometido— más aviso al equipo. Validación en servidor,
Turnstile y el mismo límite de peticiones que la lista.

---

## 8. Contrato real de `POST /api/driver-applications`

Leído del código (`server/routes/driverApplications.js`), **sin tocar Railway**.

| | |
|---|---|
| **Método y ruta** | `POST /api/driver-applications` |
| **Autenticación** | `sesionOpcional` — **es pública**: quien no tiene cuenta puede postularse |
| **Content-Type** | `multipart/form-data` |
| **Límite de peticiones** | **20 cada 15 minutos por IP** (`limitadorDeAlta`, clave por dirección) |
| **Tamaño por fichero** | **5 MB** |
| **Nº de ficheros** | Uno por tipo de documento |
| **Formatos** | `image/jpeg` · `image/png` · `image/webp` · `application/pdf` |

**Campos de texto** (validados por `validateDriverApplicationInput`): `personal`
(nombre, apellidos, cédula, teléfono, correo), `vehicle`, `license`,
`medicalCertificate`, `servicesAppliedFor`. Si no hay sesión, `password` de **8
caracteres mínimo**.

**Documentos obligatorios (versión 1):** `identity_front` · `identity_back` ·
`driver_license` · `vehicle_registration` · `vehicle_photo` · `plate_photo` ·
`driver_selfie`. La versión 2 los calcula según el vehículo
(`requiredDocumentsFor`); para **MOTO**, la licencia debe ser de **grado 2**.

**Errores:**

| Código | Cuándo |
|---|---|
| `400 INVALID_FILE_TYPE` | Formato no admitido |
| `400 UPLOAD_FAILED` | Fallo al subir |
| `400` + `fields` | Validación: devuelve qué campo falla y por qué |
| `409 USER_EXISTS` | Ya hay cuenta con ese correo o teléfono |
| `429` | Se pasó del límite |

**Al aceptar:** crea usuario y expediente, persiste los documentos y emite
`driver_application:new` a los administradores, que lo ven en la pestaña «Solicitudes».

### Contrato que necesitará `/conductores`

1. **Formulario por pasos**, no una pantalla con veinte campos: datos personales →
   vehículo y licencia → documentos → revisión y envío. Con siete ficheros de hasta 5 MB,
   una sola pantalla es una trampa en un móvil venezolano.
2. **Validar en el cliente antes de subir**: formato y tamaño. Rechazar un fichero
   después de subir 5 MB por datos móviles es maltratar al aspirante.
3. **Progreso de subida real** y posibilidad de reintentar un documento suelto.
4. **Mapear los errores del servidor a mensajes útiles**: `409 USER_EXISTS` es «ya tienes
   cuenta, entra», no «error».
5. **Guardar el avance en el navegador** para que un corte no obligue a empezar de cero.
6. **CORS resuelto antes de la primera prueba** (§9).

**No se construyó el formulario. No se tocó Railway. No se aplicó el CORS.**

---

## 9. CORS — sigue pendiente, documentado

```
OPTIONS /api/driver-applications  Origin: https://mas58express.com → 403 ORIGIN_NOT_ALLOWED
```

Lista blanca en `server/index.js:94-102`. El cambio, **inmediatamente antes** de activar
el formulario: en Railway, entorno *staging*, servicio `motoRide`, **añadir** al valor
actual de `CLIENT_ORIGIN` (no reemplazarlo):

```
,https://mas58express.com,https://www.mas58express.com
```

Append y no reemplazo porque el valor efectivo en Railway no coincide con el de omisión
del código, y sobrescribirlo a ciegas rompería lo que hoy funcione.

---

## 10. Analítica

### Vercel Web Analytics vs Plausible

| | **Vercel Web Analytics** | **Plausible** |
|---|---|---|
| Cookies | **Ninguna** | Ninguna |
| Dónde se sirve el script | **`/_vercel/insights/script.js` — mismo origen** | `plausible.io` — origen externo |
| **Efecto en la CSP** | **Ninguno**: `script-src 'self'` y `connect-src 'self'` ya lo permiten | **Hay que abrir la CSP** a otro origen de script y de conexión |
| Activación | Un interruptor en el proyecto + un componente | Script + cuenta |
| Eventos propios | Sí (`track()`) | Sí (metas) |
| Datos | En Vercel | En la UE, o autoalojado |
| Coste | Incluido con límites según plan | ~9 €/mes en adelante |
| Banner de consentimiento | **No hace falta** | No hace falta |

**Recomendación: Vercel Web Analytics**, y el argumento decisivo es la CSP. La política
quedó estricta a propósito: Plausible obligaría a permitir un origen externo de script
—justo lo que se cerró en la Fase 0— mientras que Vercel se sirve desde el propio
dominio y **no exige tocar ni una directiva**.

Si algún día importa la portabilidad del dato o alojarlo en Europa, Plausible es la
alternativa correcta y el cambio es pequeño.

### Esquema de eventos

| Evento | Propiedades | Para qué |
|---|---|---|
| `contacto_abierto` | `origen` (página) | Cuánta gente busca hablar |
| `whatsapp_general` | `origen` | Interés general |
| `whatsapp_conductor` | `origen` | **Oferta: la conversión que hoy se puede servir** |
| `whatsapp_aliado` | `origen` | Comercios interesados |
| `whatsapp_soporte` | `origen` | Carga de soporte |
| `waitlist_iniciada` | `rol`, `zona` | Intención declarada |
| `waitlist_confirmada` | `rol`, `zona` | **Métrica norte hasta el lanzamiento** |
| `postulacion_driver_iniciada` | `origen` | Entrada del embudo |
| `postulacion_driver_enviada` | `documentos`, `vehiculo` | Salida del embudo |
| `lead_aliado_enviado` | `municipio`, `tipo_comercio` | Comercios captados |
| `zona_consultada` | `zona`, `modo` (scroll o pulsación) | **Intención + ubicación**: la única señal de ese tipo que hoy existe |

**Ninguna propiedad identifica a una persona.** Sin correo, sin teléfono, sin IP.

**No se instaló nada.** GA4, Meta Pixel y TikTok Pixel quedan descartados para esta fase:
traen cookies, consentimiento y transferencias que hoy no compensan.

---

## 11. Orden recomendado de implementación

1. **SPF + DMARC** (§3) — coste cero, no depende de nada y el dominio hoy es suplantable.
2. **Deployment Protection en admin-staging** (§5) — un interruptor.
3. **Search Console** (§4) — en cuanto llegue la etiqueta.
4. **Proveedor de correo** (§2) y creación de los cuatro buzones.
5. **Política de privacidad** — con los huecos rellenos. **Bloquea todo lo que sigue.**
6. **Analítica** (§10) — antes que los formularios, para poder medir su efecto desde el
   primer día.
7. **Lista de espera** (§6) — el primer formulario, el más simple, el que estrena la
   infraestructura de validación, Turnstile y límite de peticiones.
8. **Contacto de aliados** (§7) — reutiliza esa misma infraestructura.
9. **CORS** (§9) y después el **formulario de conductor** (§8) — lo último porque es lo
   más complejo y lo que trata datos sensibles.

El orden no es caprichoso: cada paso desbloquea al siguiente, y el 5 es la puerta que
cierra todo lo demás.

---

## 12. ACCIONES MANUALES DEL DUEÑO

1. **Etiqueta de Search Console.** Entra en <https://search.google.com/search-console>,
   añade una propiedad **«Prefijo de URL»** con `https://mas58express.com`, elige el
   método **«Etiqueta HTML»** y pásame la línea `<meta name="google-site-verification" …>`.
   La integro, despliego, verifico y envío el sitemap.
2. **Autorizar los dos registros DNS de §3** (`v=spf1 -all` y el DMARC en `p=none`). Coste
   cero, no rompen Resend y cierran la suplantación del dominio. Dime que sí y los aplico.
3. **Elegir proveedor de correo: A (Google Workspace) o B (Zoho)** — §2. Sin esto no se
   puede publicar ninguna dirección `@mas58express.com`.
4. **Activar Deployment Protection en `mas58express-admin-staging`** desde el panel de
   Vercel, o autorizarme a hacerlo — §5.
5. **Los siete datos legales de §0 del documento de privacidad**: razón social,
   identificación fiscal, domicilio, responsable, correo de privacidad, jurisdicción y
   plazo de respuesta. Es lo que bloquea la Fase 1 entera.

---

## 13. Lo que no se tocó

Ni Mobile, ni Passenger, ni Driver, ni Navigation SDK, ni dispatch, ni pricing, ni
funcionalidades de la aplicación. Ni Railway, ni el DNS, ni el Admin. Ni una línea del
sitio publicado: esta ronda es diseño y documentación.
