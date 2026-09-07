# Fase 2B-2-4 — Auditoría: sacar las imágenes de chat y soporte de SQLite

**Base auditada:** `master` = `origin/master` = remoto = `4a9d6e7b5f7b77ab2cf9d8143a07bb8f2b1ef149`
**Naturaleza:** solo lectura. Sin rama, sin commits, sin migración, sin escritura en la base.
**Estado:** CERRADO. Las decisiones de la sección 11 fueron aprobadas por el propietario el 2026-08-14.
**Fecha:** 2026-08-14

No se abrió, copió ni citó ninguna imagen, mensaje o dato personal real.

---

## 1. Ciclo de vida completo

### Canal A — Chat de viaje

| Etapa | Ubicación | Detalle |
|---|---|---|
| Entrada | `server/index.js:1645` (Socket.IO `chat:message`) | Único punto de entrada |
| Validación | misma línea | Regex `^data:image/(jpeg\|png\|webp);base64,[a-z0-9+/=]+$` y ≤ 1 000 000 caracteres |
| Autorización de escritura | `server/index.js:1637-1641` | `userCanAccessTrip` y rol distinto de `admin` |
| Persistencia | `server/index.js:1659` | `database.messages.push(message)` + `persistDatabase()` |
| Emisión | `server/index.js:1660` | `io.to(user:passengerId).to(user:driverId).emit('chat:message', message)` — **el data URL entero** |
| Lectura | `GET /api/trips/:id/messages` (`server/index.js:1097`) | Devuelve los mensajes con su `image` |
| Render | `src/components/chatModal.js` (`safeImageSrc`), `src/pages/driver/driverTrips.js:45,54` | `driverTrips` compone además un panel de adjuntos con `<a href>` al data URL |

### Canal B — Soporte administrativo

| Etapa | Ubicación | Detalle |
|---|---|---|
| Entrada | `POST /api/support/messages` (`server/index.js:822-825`) | Mismo regex y mismo límite |
| Origen del data URL | `src/pages/admin/adminSupport.js:38-45` | `FileReader.readAsDataURL`, límite de cliente 700 000 bytes |
| Persistencia | `server/index.js:828` | `database.supportMessages.push(message)` + `persistDatabase()` |
| Emisión | `server/index.js:830` | `io.to('admins').to(user:<id>).emit('support:message', {...message, user})` |
| Lectura | `GET /api/support/threads` (`server/index.js:811`) | **Administración recibe todos los hilos completos, con todas sus imágenes** |
| Render | `src/pages/admin/adminSupport.js:97`, `src/components/adminSupportChat.js` | `<a href="<data url>"><img src="<data url>"></a>` |

### Diferencia entre ambos canales

| | Chat de viaje | Soporte |
|---|---|---|
| Transporte de entrada | Socket.IO | HTTP |
| Ámbito | Un viaje, dos personas | Un hilo por persona, más administración |
| Administración puede escribir | **No** (`role === 'admin'` se rechaza) | Sí (`recipientId`) |
| Lectura masiva | Por viaje | **Todos los hilos de golpe** |
| Vida útil | Termina con el viaje, pero el mensaje persiste | Indefinida |

---

## 2. Estructuras afectadas

El esquema es **una sola forma para todas las tablas**: `(id TEXT PRIMARY KEY, payload TEXT NOT NULL)` (`server/index.js:129-138`). No hay columnas por campo; el objeto entero se serializa a JSON en `payload`.

- Tabla `messages` — mensaje de viaje: `{ id, tripId, senderId, senderName, recipientId, text, image, timestamp }`
- Tabla `supportMessages` — mensaje de soporte: `{ id, conversationUserId, senderId, senderRole, text, image, createdAt, read }`

En ambos, `image` es la **cadena data URL completa**. Un cambio de esquema no es necesario: basta sustituir el contenido del campo por una referencia, lo que abarata mucho la migración.

Tabla `schemaMigrations` y el ejecutor de `server/migrations/*.sql` ya existen (`server/index.js:139-156`), con `BEGIN IMMEDIATE`/`ROLLBACK` y registro por nombre de archivo. **Pero ese mecanismo solo ejecuta SQL**, y esta migración necesita escribir archivos en disco: hará falta un paso en Node, no un `.sql`.

---

## 3. Autorización necesaria por imagen

| Quién | Chat de viaje | Soporte |
|---|---|---|
| Participante del viaje | Sí, mientras el mensaje pertenezca a un viaje suyo | — |
| Propietario del hilo | — | Sí, si `conversationUserId === user.id` |
| Administración | **Hoy no puede leer el chat de viaje** (`userCanAccessTrip` sí lo permite, pero el emisor excluye a admin) | Sí, todos los hilos |
| Viaje cerrado o histórico | El acceso hoy **no caduca**: `userCanAccessTrip` no mira el estado | No aplica |

**Resuelto (seccion 11).** El acceso NO caduca: pasajero y conductor conservan sus adjuntos historicos (decision 2). Administracion queda excluida del chat de viajes (decision 3), lo que obliga a excluirla de forma explicita en el endpoint: hoy `userCanAccessTrip` la autorizaria por herencia.

---

## 4. Hallazgos por severidad

### C-1 · CRÍTICO · Amplificación de escritura: cada guardado reescribe todas las imágenes

`persistDatabase()` (`server/index.js:212-220`) hace, dentro de una transacción:

```
para cada tabla:  DELETE FROM <tabla>;  INSERT de cada elemento
```

Es decir, **borra y reinserta las diez tablas completas en cada escritura**, y hay **36 llamadas** a `persistDatabase()` repartidas por el servidor: aceptar un viaje, mover a un conductor, leer una notificación, aprobar un documento.

Consecuencia: cada una de esas 36 operaciones reescribe en disco **todas** las imágenes base64 de chat y de soporte. Con 100 imágenes de ~750 KB, cualquier cambio de estado de un viaje escribe ~75 MB. El coste no depende del mensaje que se envía, sino del total acumulado histórico.

Es, con diferencia, el hallazgo de mayor impacto operativo, y por sí solo justifica la fase.

### C-2 · ALTO · Amplificación de lectura en soporte

`GET /api/support/threads` (`server/index.js:811-813`): si el solicitante es administrador, devuelve **todos** los `supportMessages` agrupados, cada uno con su data URL. Un panel con 200 adjuntos son ~150 MB en una respuesta. No hay paginación ni proyección.

### C-3 · ALTO · Las imágenes viajan enteras por Socket.IO

`server/index.js:830` y `:1660` emiten el objeto de mensaje completo. El data URL se retransmite a cada destinatario de la sala. En soporte, además, a **toda** la sala `admins`.

### C-4 · ALTO · Sin verificación de firma binaria

El regex valida el prefijo y el alfabeto base64, no el contenido. `data:image/png;base64,<base64 de cualquier cosa>` pasa el filtro. Es exactamente lo que `privateStorage.hasValidSignature` sí comprueba para fotografías y documentos: aquí no hay equivalente.

Esto también significa que **hoy no se puede afirmar que no haya un SVG almacenado**: un SVG codificado en base64 bajo el MIME `image/png` habría sido aceptado. El filtro del cliente (2B-2-3) protege el render actual, pero no dice nada del contenido ya guardado.

### C-5 · MEDIO · Sin control de acceso por imagen

La autorización es del hilo o del viaje completo. No existe identificador por imagen, así que no puede concederse ni revocarse acceso a un adjunto concreto, ni auditarse quién lo abrió. Es lo contrario del modelo de 2B-1 y 2B-2-1.

### C-6 · MEDIO · Imposible revocar, corregir o eliminar

Una imagen enviada por error queda en la fila para siempre. No hay borrado de mensaje, ni al eliminar la cuenta, ni al cerrar el hilo.

### C-7 · MEDIO · Los adjuntos entran en cualquier volcado

Al vivir dentro de `payload`, un `SELECT` de diagnóstico, una copia de seguridad o un log de consulta arrastran el contenido íntegro de las imágenes. Con archivos privados, un volcado de la base solo llevaría referencias.

### C-8 · BAJO · Límites incoherentes entre capas

`express.json({ limit: '1mb' })` = 1 048 576 bytes; el tope de imagen son 1 000 000 caracteres; el cliente de soporte corta en 700 000 bytes. El margen para el resto del cuerpo es de ~48 KB, y un mensaje con imagen grande y texto largo falla con un 413 sin mensaje útil.

### C-9 · BAJO · `driverTrips` expone el data URL como enlace navegable

`src/pages/driver/driverTrips.js:54` genera `<a href="<data url>" target="_blank">`. Abrir un data URL en una pestaña lo saca del contexto de la aplicación. Con `image/png` real es inocuo; combinado con C-4 deja de serlo.

---

## 5. ¿Sirve `privateStorage`?

**Sí, y debe reutilizarse. No hay que crear un segundo almacén.** Ya aporta todo lo que esta fase necesita (`server/services/privateStorage.js`):

- `hasValidSignature` para JPEG, PNG y WebP — exactamente los tres MIME del contrato de chat.
- Nombres `crypto.randomUUID()`, sin relación con el contenido ni con la persona.
- Directorio por propietario, `0700`; archivos `0600`.
- `resolve()` con guarda contra path traversal.
- `readImage(storageKey, mimeType)` (añadido en 2B-2-1) que **revalida la firma al leer** y canonicaliza el MIME.

**Ampliación mínima necesaria:**

1. `saveBuffer(buffer, mimeType, ownerId)` — hoy `save(file, ownerId)` espera la forma de multer (`{ buffer, mimetype }`). Un data URL decodificado no tiene esa forma. Es un envoltorio de tres líneas sobre la lógica existente, no un mecanismo nuevo.
2. Nada más. El PDF no aplica; el SVG ya está fuera por no tener firma.

---

## 6. Arquitectura propuesta

> **Nota.** El modelo definitivo, con `imageStorageKey` y la matriz de campos internos y públicos, está en la sección 13. Lo que sigue es el planteamiento inicial y se conserva por trazabilidad.

### Modelo de datos (sin cambio de esquema)

El campo `image` de cada mensaje pasa de data URL a un objeto de referencia:

```
image: null
imageRef: {
  id:        'chat_media_<uuid>',
  mimeType:  'image/jpeg' | 'image/png' | 'image/webp',
  size:      <bytes reales>,
  createdAt: <ISO>
}
```

`storageKey` **nunca** sale del servidor, igual que en documentos y fotografías.

### Endpoint de descarga

`GET /api/chat-media/:id/content`, con `requireAuth` y la misma disciplina de 2B-2-1:

- Autorizado: participante del viaje (canal A) o propietario del hilo y administración (canal B).
- No autorizado, inexistente o malformado: **403 uniforme**, cuerpo idéntico, sin distinguir los tres casos.
- Autorizado pero sin contenido resoluble: 404.
- `Cache-Control: private, no-store, max-age=0`
- `X-Content-Type-Options: nosniff`
- `Content-Disposition: inline`
- `Content-Type` canónico, y **firma binaria revalidada al leer** vía `readImage`.

### Límites

Mantener 1 MB como tope del data URL de entrada durante la compatibilidad, y fijar el límite real en bytes decodificados (≈750 KB) al guardar. Alinear el corte del cliente con ese valor para que el error sea explicable.

### Frontend

Reutilizar el cargador de 2B-2-1 (`createPrivatePhotoLoader` / `hydratePrivatePhotos`): mismo ciclo de object URLs, misma revocación, mismo estado neutro. No hace falta un mecanismo nuevo; conviene generalizar el nombre del módulo a «medios privados».

---

## 7. Migración — superado por la sección 17

El primer borrador de esta sección se redactó antes de las decisiones de la sección 11 y **no incluía `imageStorageKey`**, que es justamente el vínculo que hace resoluble el archivo tras un reinicio.

**El procedimiento vigente está en la sección 17.** La diferencia esencial: un registro solo cuenta como migrado cuando se han persistido **y releído** `imageRef` e `imageStorageKey`, y el archivo abre con firma y tamaño coincidentes.

---

## 8. Railway — superado por la sección 12

El primer borrador proponía comprobar la ruta por prefijo y dejaba el volumen como dato por confirmar. Ambas cosas están resueltas.

**La configuración vigente está en la sección 12**, con estos datos ya confirmados: volumen en `/data`, 500 MB, `DATA_FILE=/data/plus58express.sqlite` y `CHAT_MEDIA_DIR=/data/chat-media` como valor futuro. La validación es por `realpath` y `path.relative`, no por prefijo, e incluye la política de espacio.

Se conserva de aquel borrador un único punto, que sigue vigente y no se repite en la 12: **los permisos `0700`/`0600` los aplica `privateStorage`, pero conviene comprobar que el volumen montado los respeta.**

---

## 9. Pruebas necesarias

| Área | Prueba |
|---|---|
| Autorización | Participante del viaje 200; tercero 403; sin sesión 401; token inválido 401 |
| Aislamiento | Adjunto de otro viaje 403; hilo de soporte ajeno 403; propietario 200; administración 200 en soporte |
| No revelador | Inexistente, malformado y ajeno con cuerpo y cabeceras idénticos |
| MIME falsificado | Base64 de texto con MIME `image/png` rechazado al guardar; contenido cuya firma no coincide rechazado al leer |
| SVG | Rechazado en entrada y en lectura, por ausencia de firma |
| Cabeceras | `private, no-store, max-age=0`, `nosniff`, `Content-Type` canónico |
| Migración repetida | Ejecutarla dos veces no duplica archivos ni altera referencias |
| Migración interrumpida | Cortar a mitad y reanudar deja estado consistente y completa el resto |
| Registros antiguos | Un mensaje con solo `image` sigue viéndose durante la compatibilidad |
| Registros corruptos | Base64 inválido y firma discordante se registran sin abortar la migración |
| Socket.IO | Los eventos `chat:message` y `support:message` no contienen `data:image` ni base64 |
| Listados | `GET /api/support/threads` y `GET /api/trips/:id/messages` sin `data:image` ni base64 |
| Amplificación | El tamaño de la respuesta de un hilo no crece con el número de adjuntos |
| Eliminación | Borrar un mensaje elimina su archivo; un archivo sin referencia es detectable |
| Frontend | Object URL revocada al cerrar el chat, cambiar de hilo, cerrar sesión y en `clearApp()` |
| Campos internos | Ninguna respuesta ni evento contiene `imageStorageKey` ni `imageMigrationError`, ni siquiera con el campo presente en el registro |
| Proyección | Un campo privado nuevo en el modelo no aparece en la salida hasta añadirlo a la lista blanca |
| Persistencia del vínculo | Tras reiniciar el proceso, el endpoint sigue resolviendo el archivo por `imageStorageKey` del registro |
| Ruta nunca derivada | Un `imageRef.id` que coincida con un nombre de archivo real no abre nada por sí solo |
| Validación de ruta | `/data-falso`, un hermano del volumen, una ruta absoluta ajena y un enlace simbólico que escape se rechazan al arrancar |
| Producción sin variable | Sin `CHAT_MEDIA_DIR` definida, el proceso no arranca |
| Espacio | Sin reserva de 50 MB se rechaza el adjunto con `CHAT_MEDIA_STORAGE_FULL`, el texto se envía igual y los archivos existentes se siguen sirviendo |
| Sin borrado automático | Alcanzar el umbral no elimina ningún archivo |
| Migración incompleta | Un `imageRef` sin `imageStorageKey` verificado se trata como no migrado y se reintenta |

---

## 10. Orden de implementación

**Primero la infraestructura compartida, después soporte, y el chat de viaje al final.** La evidencia:

1. **Infraestructura** — `saveBuffer` en `privateStorage`, el endpoint `/api/chat-media/:id/content` y la política de autorización. Los dos canales la necesitan idéntica; hacerla dos veces garantizaría divergencia. Además es la única parte que no cambia ningún contrato existente: se puede desplegar sola, sin efecto visible.

2. **Soporte** — porque concentra el daño y es el canal más simple: entrada HTTP única (`server/index.js:822`), un solo listado (`:811`), un solo consumidor de render (`adminSupport.js:97`). Y es donde vive C-2, la amplificación de lectura, que es el segundo hallazgo más grave.

3. **Chat de viaje** — el último, porque su entrada es Socket.IO, su render está repartido en `chatModal.js` y `driverTrips.js`, y `driverTrips` construye un panel de adjuntos históricos que hay que rediseñar. Más superficie y más riesgo de romper una función real.

4. **Migración de datos** — después de que ambos canales escriban `imageRef` en producción y estén estables.

5. **Vaciado de `image`** — commit aparte, explícitamente autorizado, cuando la migración esté verificada.

### Commits propuestos

| # | Commit | Reversible | ¿Rompe compatibilidad? |
|---|---|---|---|
| 1 | `feat: store chat media in private storage` (`saveBuffer` + pruebas) | Sí | No |
| 2 | `feat: add authenticated chat media endpoint` | Sí | No |
| 3 | `fix: store support attachments as private files` (escribe `imageRef` **y** conserva `image`) | Sí | No |
| 4 | `fix: load support attachments on demand` (frontend prefiere `imageRef`) | Sí | No |
| 5 | `fix: store trip chat attachments as private files` | Sí | No |
| 6 | `fix: load trip chat attachments on demand` | Sí | No |
| 7 | `fix: stop emitting attachment payloads over Socket.IO` | Sí | **Sí, ver abajo** |
| 8 | `feat: add resumable chat media migration` (script, sin ejecutar) | Sí | No |
| 9 | `chore: drop migrated base64 payloads` (autorización aparte) | **No** | Sí, si algo quedó sin migrar |

### El punto de incompatibilidad

**El commit 7 es el único que puede romper frontend y backend a la vez.** Si el servidor deja de emitir `image` antes de que todos los clientes prefieran `imageRef`, un cliente antiguo con la pestaña abierta dejará de ver adjuntos nuevos en tiempo real.

Cómo evitarlo: los commits 3-6 hacen que el cliente **prefiera** `imageRef` pero siga aceptando `image`; el 7 solo se despliega cuando 4 y 6 llevan tiempo en producción. Es la misma secuencia que funcionó al derivar `photoUrl` en 2B-2-1.

El commit 9 es el único irreversible, y por eso va solo y con autorización propia.

---

## 11. Decisiones aprobadas

Cerradas por el propietario el 2026-08-14. Ya no son preguntas abiertas.

| # | Decisión |
|---|---|
| 1 | Cada imagen tiene **exactamente la misma autorización que su mensaje**. No se declara aparte, se deriva de él. |
| 2 | Pasajero y conductor **conservan acceso histórico** a las imágenes de sus propios viajes, también cerrados. El acceso no caduca. |
| 3 | Administración **no** tiene acceso general al chat de viajes. Solo mediante un futuro flujo explícito de disputa, fuera de esta fase. |
| 4 | Un archivo con firma binaria o MIME inválido **no se sirve ni se migra**. Se registra su identificador y el motivo; nunca su contenido. |
| 5 | El base64 original **se conserva** durante implementación, despliegue y verificación. |
| 6 | El vaciado del base64 es una **fase final independiente e irreversible**, sujeta a nueva autorización. |
| 7 | Orden: infraestructura compartida → soporte → chat de viajes → migración → verificación → vaciado posterior. |
| 8 | Almacenamiento en un subdirectorio propio **`chat-media/`** dentro del volumen persistente existente. |
| 9 | `imageRef.id` es un **UUID opaco**, nunca una ruta ni un nombre físico. |
| 10 | Cada descarga **vuelve a comprobar** la autorización contra el mensaje y sus participantes actuales. |
| 11 | Listados y eventos Socket.IO **nunca** incluyen el binario. |
| 12 | Migración idempotente y reanudable; el base64 se conserva hasta verificar archivo, firma, tamaño y referencia. |
| 13 | **Sin eliminación automática** de archivos huérfanos en la primera implementación. |

La decisión 2 resuelve la duda que planteaba `driverTrips.js`: el panel de «Capturas y comprobantes» del historial sigue funcionando.

La decisión 3 cierra una ambigüedad peligrosa. Hoy `userCanAccessTrip` autorizaría a administración por herencia, y solo el emisor de Socket.IO la excluye. El endpoint nuevo debe **excluirla explícitamente**, no confiar en esa exclusión indirecta.

---

## 12. Configuración de almacenamiento

### Configuración conocida de Railway

| Elemento | Valor |
|---|---|
| Punto de montaje del volumen | `/data` |
| Tamaño del volumen | **500 MB** |
| `DATA_FILE` | `/data/plus58express.sqlite` |
| `CHAT_MEDIA_DIR` (valor futuro) | `/data/chat-media` |

`CHAT_MEDIA_DIR` **todavía no está definida**. Debe configurarse **justo antes del primer despliegue de la fase A**, no antes: hasta que exista el código que la valida y la usa, definirla no aporta nada y una variable apuntando a un directorio que nadie crea solo genera confusión. Ver la nota al final de la sección 18.

Fuera de producción, el valor por defecto es `path.join(path.dirname(DATA_FILE), 'chat-media')`.

Se mantiene **separada de `UPLOAD_DIR`** (fotografías y documentos) a propósito: ciclos de vida distintos, y conviene poder medirlos, moverlos o respaldarlos por separado. Ambas cuelgan del mismo volumen.

Se reutiliza `createPrivateStorage({ rootDirectory })` con esa raíz: una segunda instancia del mismo mecanismo, no un mecanismo nuevo. Hereda `0700` en la raíz, `0600` en los archivos, nombres `randomUUID()` y la guarda contra path traversal.

### Validación segura de la ruta

**No se usa `startsWith('/data')`.** Una comparación de prefijos acepta `/data-falso`, `/database` o cualquier hermano cuyo nombre empiece igual, y no ve a través de un enlace simbólico que salga del volumen.

La comprobación correcta, al arrancar:

1. `realpath` del **directorio** de `DATA_FILE` → `raizDatos`.
2. `realpath` de `CHAT_MEDIA_DIR` → `raizMedios`. Si aún no existe, se crea antes de resolver, para que el `realpath` refleje la ruta real y no la nominal.
3. `const relativa = path.relative(raizDatos, raizMedios)`.
4. Se **rechaza** si:
   - `relativa === ''` → sería el propio directorio de la base;
   - `path.isAbsolute(relativa)` → está en otro árbol;
   - `relativa` empieza por `..` (comparando por segmentos, no por texto) → sale del volumen.

Resolver con `realpath` **antes** de comparar es lo que cierra el escape por enlace simbólico: `/data/chat-media → /tmp/otro` resuelve a `/tmp/otro` y la relativa sale absoluta o con `..`, así que se rechaza.

Comprobaciones adicionales, en el mismo arranque:

5. El directorio es escribible: se crea y se borra un archivo centinela.
6. **En producción** (`NODE_ENV === 'production'`), `CHAT_MEDIA_DIR` debe estar **definida explícitamente**. No se acepta el valor por defecto: caería en el disco efímero del contenedor y las imágenes desaparecerían en el siguiente despliegue.

Cualquier fallo → `throw new Error('CHAT_MEDIA_STORAGE_UNAVAILABLE')` y salida con código distinto de cero. Es preferible que el servicio no arranque a que acepte imágenes que va a perder.

La **migración** aplica la misma validación y añade una guarda propia: se niega a empezar si la raíz está vacía habiendo ya `imageRef` en la base, señal de que se perdió el volumen.

### Política de espacio para un volumen de 500 MB

El volumen aloja **también** la base de datos y `UPLOAD_DIR`. Los adjuntos no pueden crecer hasta agotarlo, porque quedarse sin espacio dejaría al SQLite sin poder escribir y detendría toda la aplicación, no solo el chat.

| Regla | Valor |
|---|---|
| Límite por archivo | **750 000 bytes reales** (no del base64), alineado con el corte del cliente |
| Reserva mínima libre en el volumen | **50 MB** |
| Comprobación | Antes de cada guardado: espacio libre − tamaño del archivo ≥ reserva |
| Sin reserva | Se rechaza el adjunto con `CHAT_MEDIA_STORAGE_FULL` |
| Borrado automático | **Nunca** |

Cuando no queda reserva:

- El **texto del mensaje se envía igual**. Solo se rechaza el adjunto.
- Los **archivos existentes siguen sirviéndose** con normalidad: la falta de espacio afecta a la escritura, no a la lectura.
- El error es controlado y explicable en la interfaz, no un 500.
- **No se borra nada automáticamente** para recuperar espacio. Liberar volumen es una decisión operativa con autorización, nunca un efecto colateral de recibir una imagen.

La comprobación de espacio se hace con `fs.statfs` sobre la raíz de medios, y se registra el umbral alcanzado sin incluir identificadores de personas ni de mensajes.

### Comprobación manual en Railway, sin exponer secretos

1. Panel → servicio del backend → pestaña **Volumes**. Confirmar *Mount path* `/data` y el tamaño de 500 MB.
2. Pestaña **Variables**: confirmar `DATA_FILE=/data/plus58express.sqlite` y, tras configurarla, `CHAT_MEDIA_DIR=/data/chat-media`. Ninguno de los dos es un secreto.
3. Desde la consola del servicio:

```bash
readlink -f "$(dirname "$DATA_FILE")"
readlink -f "$CHAT_MEDIA_DIR"
test -w "$CHAT_MEDIA_DIR" && echo escribible
stat -c '%a' "$CHAT_MEDIA_DIR"
df -h /data | tail -1
```

Se espera que las dos rutas resueltas compartan árbol, `escribible`, permisos `700` y espacio libre holgado.

**No ejecutar `ls` ni `cat` sobre el contenido**: son imágenes privadas de personas reales. Ninguno de los comandos anteriores muestra datos ni secretos.

4. Tras un redespliegue, repetir el paso 3 y confirmar que el directorio sigue existiendo. Si desaparece, no es persistente y la fase no puede continuar.

---

## 13. Modelo persistente y proyección

### El problema que resuelve

`imageRef.id` es público y `storageKey` es privado. Si la correspondencia entre ambos no se **persiste**, tras un reinicio de Railway el endpoint no sabría qué archivo abrir: el identificador público no puede, ni debe, derivarse en una ruta.

### Modelo persistido en SQLite

Dentro del `payload` del mensaje, en `messages` y en `supportMessages`:

```jsonc
{
  // ... resto del mensaje ...

  // PÚBLICO — lo único que sale del servidor
  "imageRef": {
    "id": "9f1c7e2a-4b6d-4a1e-9c3f-2d8e5a7b1c04",  // UUID v4 opaco
    "mimeType": "image/jpeg",                       // canónico: jpeg | png | webp
    "size": 184320,                                 // bytes reales del archivo
    "createdAt": "2026-08-14T09:00:00.000Z"
  },

  // PRIVADO — nunca sale del servidor
  "imageStorageKey": "<valor devuelto por privateStorage.saveBuffer>",
  "imageMigrationError": null,                      // solo si algo falló al migrar

  // COMPATIBILIDAD — se conserva hasta la fase F
  "image": "data:image/jpeg;base64,..."
}
```

La relación `imageRef.id → imageStorageKey` vive **en el propio registro del mensaje**, dentro del `payload` que ya se persiste. No hace falta tabla nueva ni índice aparte: el endpoint localiza el mensaje por `imageRef.id` y lee su `imageStorageKey` del mismo objeto. Al persistirse con el mensaje, sobrevive a cualquier reinicio.

### Regla que no admite excepción

**Nunca se deriva una ruta a partir de `imageRef.id`.** El identificador público no es, ni contiene, ni se transforma en una clave de almacenamiento. Solo sirve para encontrar el mensaje; la clave real la aporta el registro.

Si algún día se quisiera acelerar la búsqueda, el remedio es un índice en memoria `id → mensaje` reconstruido al arrancar, **no** una convención de nombres.

### Matriz de campos

| Campo | Persistido | API | Socket.IO | Frontend | Logs |
|---|---|---|---|---|---|
| `imageRef.id` | Sí | **Sí** | **Sí** | **Sí** | Sí (solo el id) |
| `imageRef.mimeType` | Sí | **Sí** | **Sí** | **Sí** | No |
| `imageRef.size` | Sí | **Sí** | **Sí** | **Sí** | No |
| `imageRef.createdAt` | Sí | **Sí** | **Sí** | **Sí** | No |
| `imageStorageKey` | Sí | **Nunca** | **Nunca** | **Nunca** | **Nunca** |
| `imageMigrationError` | Sí | **Nunca** | **Nunca** | **Nunca** | Solo `{ id, motivo }` |
| `image` (base64) | Sí, hasta fase F | Solo si no hay `imageRef` | Solo si no hay `imageRef` | Íd. | **Nunca** |
| Bytes del archivo | No (viven en disco) | Solo por el endpoint | **Nunca** | Object URL | **Nunca** |

### Proyección explícita

Toda salida —respuesta HTTP y evento Socket.IO— pasa por una **proyección de lista blanca**, al estilo de `driverApplicationProjections.js` y `userProjections.js`:

```
chatMessagePublic(message)    → { id, tripId, senderId, senderName, recipientId, text, imageRef | image, timestamp }
supportMessagePublic(message) → { id, conversationUserId, senderId, senderRole, text, imageRef | image, createdAt, read }
```

Copia campo a campo, sin propagar el objeto original. Un campo privado nuevo en el modelo **no aparece** hasta que alguien lo añada a mano. Es exactamente el patrón que evitó las fugas en 2B-1 y 2B-2-1, y la razón de que aquí no baste con «acordarse de borrar `imageStorageKey`».

Regla derivada: **ninguna ruta ni emisor devuelve el objeto de mensaje crudo.** Hoy `server/index.js:830` y `:1660` lo hacen; ese es precisamente el cambio de la fase E.

---

## 14. Contrato del endpoint

```
GET /api/chat-media/:id/content
```

### Resolución, en este orden

1. **Localizar** el mensaje —en `messages` o en `supportMessages`— cuyo `imageRef.id` coincide con `:id`.
2. **Autorizar**: se reevalúa contra los participantes actuales de ese mensaje (sección 15). La decisión no se cachea ni se precalcula.
3. **Resolver el archivo** con `imageStorageKey` **del propio registro**. Nunca desde `:id`.
4. **Revalidar firma binaria y MIME** al leer, con `readImage(storageKey, mimeType)`.
5. Servir los bytes.

| Resultado | Condición |
|---|---|
| 200 | Autorizado, archivo resuelto y firma válida |
| 401 | Sin sesión, token inválido o vencido |
| 403 | No autorizado, `:id` inexistente o malformado — **cuerpo y cabeceras idénticos en los tres casos** |
| 404 | Autorizado, pero el archivo no se resuelve o su firma no valida (decisión 4) |

Cabeceras de la respuesta 200:

```
Cache-Control: private, no-store, max-age=0
X-Content-Type-Options: nosniff
Content-Disposition: inline
Content-Type: image/jpeg | image/png | image/webp
Content-Length: <bytes>
```

Un archivo cuya firma no valide **no se sirve**: 404 y registro de `{ imageRefId, motivo }`. Nunca el contenido, ni un fragmento, ni la clave de almacenamiento.

---

## 15. Matriz de autorización

### Chat de viaje

| Solicitante | Viaje activo | Viaje cerrado o cancelado |
|---|---|---|
| Pasajero del viaje | **200** | **200** (decisión 2) |
| Conductor del viaje | **200** | **200** (decisión 2) |
| Otro pasajero o conductor | 403 | 403 |
| Administración | **403** (decisión 3) | **403** (decisión 3) |
| Sin sesión o token inválido | 401 | 401 |

### Soporte

| Solicitante | Resultado |
|---|---|
| Propietario del hilo (`conversationUserId`) | **200** |
| Administración | **200** |
| Cualquier otra persona autenticada | 403 |
| Sin sesión o token inválido | 401 |

En ambas tablas, «identificador inexistente o malformado» produce **el mismo 403** que «no autorizado»: quien no tiene acceso no puede distinguir si la imagen existe.

Administración queda excluida del chat de viajes de forma **explícita**. Hoy `userCanAccessTrip` la autorizaría por herencia y solo el emisor de Socket.IO la excluye; el endpoint no puede confiar en esa exclusión indirecta.

---

## 16. Compatibilidad entre versiones

Durante toda la implementación conviven registros con `image`, con `imageRef` y con ambos.

**Servidor**, en la proyección:

1. Si tiene `imageRef` → publica `imageRef` y **nunca** `image`.
2. Si solo tiene `image` → lo publica tal cual (registro antiguo sin migrar).
3. Jamás los dos, para que el cliente no tenga que desempatar.
4. Nunca `imageStorageKey` ni `imageMigrationError`, en ningún caso.

**Cliente**, al renderizar:

1. Si llega `imageRef` → hueco neutro y descarga bajo demanda por el endpoint autenticado.
2. Si llega `image` → lo pinta como hoy, con la validación estricta de 2B-2-3.
3. Si no llega ninguno → mensaje sin adjunto.

Un cliente **antiguo** que reciba `imageRef` no muestra el adjunto pero **no se rompe**: `safeImageSrc(undefined)` devuelve cadena vacía y el mensaje se pinta sin imagen. Esa es la razón de que dejar de emitir el binario vaya al final.

**Riesgo de dos versiones vivas en Railway.** Durante un despliegue pueden convivir una instancia nueva que escribe `imageRef` e `imageStorageKey`, y una antigua cuya copia en memoria no conoce esos campos; como `persistDatabase()` reescribe la colección entera, la antigua **borraría ambos**. Mitigación: conservar `image` (decisión 5) hasta que solo quede una versión desplegada y verificada. Con el base64 intacto, la pérdida se recupera reejecutando la migración.

---

## 17. Migración y rollback

### Migración, por mensaje con `image` y sin `imageRef` verificado

1. Decodificar el base64. Si falla → escribir `imageMigrationError = 'BASE64_INVALIDO'` y **continuar**, sin borrar nada.
2. Verificar la firma binaria contra el MIME declarado. Si no coincide → `imageMigrationError = 'FIRMA_NO_COINCIDE'`, dejar el registro intacto y contarlo aparte (decisión 4). Se registran `{ id del mensaje, motivo }`, **nunca el contenido**.
3. Comprobar espacio libre contra la reserva de 50 MB. Si no hay → detener la migración de forma controlada, sin marcar nada como completado.
4. Guardar con `saveBuffer` y obtener `storageKey`.
5. Escribir **`imageRef` e `imageStorageKey`** y persistir, **conservando `image`**.
6. **Releer el registro persistido y el archivo**, y comprobar los cuatro: que `imageRef` está, que `imageStorageKey` está, que el archivo se abre y que su firma y su tamaño coinciden con `imageRef.size`.
7. Solo entonces el mensaje cuenta como **completado**.

Si el paso 6 falla, el registro no se marca; la reejecución vuelve a intentarlo. Un `imageRef` sin `imageStorageKey` verificado se trata como no migrado.

- **Idempotente**: un mensaje ya completado se salta. Repetir no duplica archivos.
- **Reanudable**: el progreso vive en los propios registros; una interrupción deja estado consistente.

### Rollback

| Fase | Cómo se revierte |
|---|---|
| Infraestructura (A1-A2) | Revertir los commits. No hay datos que deshacer. |
| Soporte y chat (B1-C2) | Revertir los commits. `image` sigue presente: los adjuntos vuelven a verse por la vía antigua. |
| Migración ejecutada | Descartar **`imageRef`, `imageStorageKey` e `imageMigrationError`** de los registros. `image` sigue siendo la fuente de verdad. Los archivos quedan en `chat-media/` sin referencia: **no se borran** (decisión 13) y son identificables por no estar referenciados desde ningún `imageStorageKey`. |
| Dejar de emitir el binario (E1) | Revertir el commit. Exige que `image` siga presente; por eso no puede ir después del vaciado. |
| Vaciado del base64 (F1) | **Irreversible.** Única vuelta atrás: restaurar desde una copia de seguridad anterior al vaciado. |

La regla que hace reversible todo lo anterior es la decisión 5: **mientras `image` exista, cualquier paso se deshace revirtiendo código y descartando los tres campos internos**.

---

## 18. Fases y commits

### Fase A — Infraestructura privada compartida

| # | Commit | Reversible | Rompe compatibilidad |
|---|---|---|---|
| A1 | `feat: add chat media private storage` — `CHAT_MEDIA_DIR`, validación por `realpath` + `path.relative`, política de espacio, segunda instancia de `createPrivateStorage`, `saveBuffer` | Sí | No |
| A2 | `feat: add authenticated chat media endpoint` — ruta, resolución por `imageStorageKey`, autorización derivada del mensaje, cabeceras, 403 uniforme | Sí | No |

**Configuración de `CHAT_MEDIA_DIR`: justo antes del primer despliegue de A1, no antes.** El orden importa porque A1 introduce la comprobación de arranque: definir la variable sin ese código no valida nada, y desplegar ese código sin la variable **impediría arrancar en producción**. Los dos pasos van juntos, en esta secuencia: fusionar A1 → definir `CHAT_MEDIA_DIR=/data/chat-media` en Railway → desplegar → comprobar el arranque y el paso 3 de la sección 12.

Desplegable sola: no cambia ningún contrato observable.

### Fase B — Soporte

| # | Commit | Reversible | Rompe compatibilidad |
|---|---|---|---|
| B1 | `feat: project chat and support messages` — proyecciones de lista blanca, aplicadas a las rutas y emisores actuales, aún sin `imageRef` | Sí | No |
| B2 | `fix: store support attachments as private files` — escribe `imageRef` + `imageStorageKey` y **conserva** `image` | Sí | No |
| B3 | `fix: load support attachments on demand` — el cliente prefiere `imageRef` | Sí | No |

B1 se adelanta a propósito: sin la proyección, el primer registro con `imageStorageKey` lo publicaría el emisor actual, que devuelve el objeto crudo.

### Fase C — Chat de viajes

| # | Commit | Reversible | Rompe compatibilidad |
|---|---|---|---|
| C1 | `fix: store trip chat attachments as private files` | Sí | No |
| C2 | `fix: load trip chat attachments on demand` — `chatModal` y el panel de adjuntos de `driverTrips` | Sí | No |

### Fase D — Migración

| # | Paso | Reversible | Rompe compatibilidad |
|---|---|---|---|
| D1 | `feat: add resumable chat media migration` — script, **sin ejecutar** | Sí | No |
| D2 | Ejecución de la migración (operación, no commit) | Sí | No |

### Fase E — Verificación

| # | Commit | Reversible | Rompe compatibilidad |
|---|---|---|---|
| E1 | `fix: stop sending attachment payloads in listings and events` | Sí | **Sí** — solo tras estabilizar B3 y C2 |

Único punto de incompatibilidad de toda la fase, y por eso va aislado y al final.

### Fase F — Vaciado (autorización aparte)

| # | Commit | Reversible | Rompe compatibilidad |
|---|---|---|---|
| F1 | `chore: drop migrated base64 payloads` | **No** | Sí, si algo quedó sin migrar |

Precondiciones: cero mensajes sin `imageRef` **e** `imageStorageKey` verificados, cero `imageMigrationError` pendientes de decisión, una sola versión desplegada y una copia de seguridad verificada de la base.

---

## 19. Fuera de alcance

- H-6 y H-7 de la auditoría 2B-2 (retención y borrado por cuenta).
- Cualquier cambio en fotografías de perfil, documentos de conductor o el diseño aprobado.
- `fonts.googleapis.com` y `unpkg.com`, terceros ajenos a los adjuntos, señalados al cerrar 2B-2-3.
