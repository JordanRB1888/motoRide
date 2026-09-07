# Phase 2B-2-4C — Productor + compatibilidad

**Los mensajes nuevos con imagen ya no guardan Base64 en SQLite**

| | |
|---|---|
| Rama | `stabilization/phase-2b2-4c-chat-media-producer` |
| 4B HEAD (base) | `9e33bfabff071ae519d43036a32f24ecfd508bbb` |
| HEAD | `ab3cf3e` |
| Commits de 4C | 5 |
| Archivos | 15 (7 nuevos, 8 modificados) — 1.372 inserciones, 35 borrados |
| Veredicto | **LISTA PARA REVISIÓN** |

---

## 1. El cambio, en una frase

Antes, una imagen de chat viajaba dentro del mensaje como data URL y acababa en la fila de SQLite: hasta un megabyte de Base64 por adjunto, en la base y en cada retransmisión por socket. Ahora el binario se escribe en el volumen y el mensaje se queda con `imageRef { id, mimeType }` —lo único que ve el cliente— y con `imageStorageKey`, que es metadato privado del servidor y no sale nunca.

```
data URL validada → decodificada una vez → chatMediaStorage.saveBuffer
        ↓
mensaje con imageRef + imageStorageKey (privada)
        ↓
cliente descarga autenticado por /api/chat-media/:id/content
```

---

## 2. El riesgo NAT, resuelto antes del productor

La certificación de 4B encontró que 1.200/min por dirección se quedaría corto en cuanto el endpoint sirviera imágenes de verdad. Se resolvió **antes** de activar el productor.

`skipSuccessfulRequests: true` cambia **qué** se cuenta, no cuánto:

| Petición | Guardia por IP | Limitador por cuenta |
|---|---|---|
| 200 legítimo | **no consume** | sí consume |
| 401 sin token | **sí consume** | no llega |
| 401 token inválido | **sí consume** | no llega |
| 403 sin acceso | **sí consume** | sí consume |

Demostrado: **cien descargas correctas no agotan una guardia de diez**, y tras treinta lecturas legítimas la guardia conserva sus diez intentos íntegros para el tráfico anónimo.

La guardia de sesión **no** lleva la opción, y hay un test que lo exige: allí el tráfico legítimo es una petición por carga de la aplicación y no hay nada que corregir.

```
CHAT_MEDIA_PREAUTH_SKIP_SUCCESS:              SÍ
CHAT_MEDIA_PREAUTH_FAILED_REQUESTS_COUNT:     SÍ (401, 403)
CHAT_MEDIA_PREAUTH_SUCCESSFUL_REQUESTS_COUNT: NO
CHAT_MEDIA_PER_USER_LIMIT_PRESERVED:          SÍ — 180/min, verificado que descuenta
```

---

## 3. Orden de escritura y compensación

**Archivo primero, registro después.** El sistema de archivos y SQLite no son un único sistema transaccional, así que no hay forma de escribir en los dos de manera atómica; lo que sí se elige es que el fallo posible sea el reparable.

- Con el registro primero quedarían filas apuntando a imágenes que no existen, y **eso no se arregla**.
- Al revés, lo peor que queda es un archivo huérfano — y ni eso: si la persistencia falla, se borra.

| Escenario | Comportamiento | Test |
|---|---|---|
| `saveBuffer` falla | no se crea mensaje; `persistir` ni se ejecuta | K |
| la base falla tras guardar | el archivo se borra | L |
| la compensación también falla | se avisa con metadatos seguros y **se propaga el error original** | M |

El aviso lleva solo `{ reason, mimeType, bytes }` — nunca la clave ni la ruta. Se propaga el error de la base, no el de la limpieza, porque es el que explica por qué no hay mensaje.

Los dos productores pasan por el mismo pipeline. No es solo evitar duplicar: es que la compensación **no se pueda olvidar** en uno de los dos.

```
FILE_FIRST_DB_SECOND:    SÍ
DB_FAILURE_COMPENSATION: SÍ (storage.remove)
STORAGE_FAILURE_SAFE:    SÍ (no se crea mensaje)
COMMON_MEDIA_PIPELINE:   server/services/chatMediaPipeline.js — withStoredImage()
```

---

## 4. Contrato de entrada — tres barreras independientes

`server/domain/chatImageInput.js`, escrito aparte del cliente y algo más estricto, porque el navegador puede mentir.

Rechazado y probado: SVG declarado, **SVG disfrazado de PNG**, GIF, AVIF, BMP, TIFF, `image/jpg`, MIME con parámetro (`;charset=utf-8;base64,`), Base64 truncado, Base64 con basura, `http`, `https`, `blob:`, ruta relativa, `javascript:`, `data:text/html`, y exceso de tamaño.

Dos detalles que merecen mención:

- **Relleno obligatorio**: una longitud que no sea múltiplo de cuatro significa cadena truncada. `Buffer.from` no se queja —descarta lo que sobra— y guardaría una imagen a medias.
- **Ida y vuelta**: si `Buffer.from` tuvo que ignorar algo, la recodificación no coincide. Es la forma barata de detectar Base64 corrupto que la expresión regular sí acepta.

Y no es la última barrera: el almacén vuelve a comprobar la **firma binaria** de los bytes ya decodificados.

```
SVG_BLOCKED:              SÍ (tres capas)
MIME_SIGNATURE_VALIDATED: SÍ (al guardar y al leer)
```

---

## 5. El payload público nunca lleva la clave

`imageStorageKey` se quita en **los cinco puntos** por donde un mensaje sale al exterior:

| Punto | Ubicación |
|---|---|
| Respuesta 201 del alta de soporte | `res.status(201).json(publico)` |
| Evento `support:message` | `io.to(...).emit(...)` |
| Listado paginado de mensajes | `publicChatMessages(page.items)` |
| Mensajes de un viaje | `GET /api/trips/:id/messages` |
| Evento `chat:message` | `io.to(...).emit(...)` |

La proyección resuelve **quitando, no seleccionando**: si mañana el mensaje gana un campo, aparecerá sin que nadie tenga que acordarse de añadirlo, que es el fallo que tendría la lista blanca. La contrapartida se cubre con un test que exige que `PRIVATE_MESSAGE_FIELDS` crezca a la vez que los campos privados.

Verificado además que la fila **en disco** sí conserva la clave (es lo que permite volver a leer el archivo) y **no** contiene ninguna data URL.

```
PUBLIC_PAYLOAD_LEAKS_STORAGE_KEY: NO
PUBLIC_PAYLOAD_LEAKS_PATH:        NO
```

---

## 6. Cliente — reutilización, no duplicación

`createPrivatePhotoLoader` ya tenía toda la maquinaria certificada en 2B-2-1: propiedad de cada object URL, deduplicación de peticiones en vuelo, generaciones para descartar respuestas tardías, liberación al cerrar. **Lo único específico de los adjuntos era qué ruta se pide**, así que se parametrizó ese punto en lugar de escribir la maquinaria otra vez. El comportamiento por omisión no cambia — las 44 pruebas de fotografías privadas siguen en verde.

```
MEDIA_CLIENT_AUTH_FETCH:    apiService.getPrivateFileUrl → fetch con Bearer → Blob → object URL
MEDIA_CLIENT_CACHE:         en memoria, dentro del cargador, con clave = imageRef.id
MEDIA_FETCH_DEDUPLICATION:  SÍ — mapa de peticiones en vuelo por clave
OBJECT_URL_OWNERSHIP_MODEL: un dueño por clave; release(key) individual, releaseAll() y
                            destroy() al cerrar; generaciones por clave y globales para
                            descartar respuestas tardías; nunca doble revoke
```

**Nada persistente**: ni `localStorage`, ni IndexedDB, ni Cache API, ni service worker. Reutilizar una imagen mientras la conversación está abierta no contradice el `no-store` de la respuesta; persistirla sí.

---

## 7. Compatibilidad

```
NEW_FORMAT_SUPPORTED:    SÍ
LEGACY_FORMAT_SUPPORTED: SÍ
MIXED_HISTORY_SUPPORTED: SÍ
```

Regla: **`imageRef` manda sobre `image`**. Un registro que trajera los dos —no debería— se pinta una sola vez, con el privado. Nunca duplicado.

Los tres consumidores actualizados: `chatModal.js` (chat de viaje), `adminSupportChat.js` (hilo del usuario) y `adminSupport.js` (panel).

Un detalle que habría pasado desapercibido: `summarizeSupportMessage` calculaba `hasImage` mirando solo el campo heredado, así que con el formato nuevo habría dicho `false` y el listado de hilos habría dejado de indicar que hay adjunto. Corregido.

---

## 8. Ciclo de vida — append-only, documentado

Inventario de todas las operaciones reales que podrían hacer desaparecer un mensaje:

```
MESSAGE_DELETE_EXISTS:    NO
THREAD_DELETE_EXISTS:     NO
TRIP_CHAT_DELETE_EXISTS:  NO
```

Las dos rutas `DELETE` que existen:

- `DELETE /api/admin/drivers/:id` — borra un conductor. Sus mensajes permanecen, así que los archivos siguen referenciados por registros vivos.
- `DELETE /api/trips/scheduled/:id` — **no borra el viaje**: lo marca `CANCELLED`. El viaje sigue en la base y la política de 4B ya cubre viajes cerrados, así que el acceso sigue funcionando.

```
NEW_MEDIA_CREATION_COMPENSATION:              SÍ (única compensación necesaria)
ORPHAN_RISK_AFTER_EXISTING_DELETE_OPERATIONS: NINGUNO
```

No se inventó ningún endpoint de limpieza: no hay ninguna operación que lo requiera.

---

## 9. Históricos e instrumentación

```
HISTORICAL_MEDIA_MIGRATION:       NO
MIGRATION_METRICS_UTILITY_CREATED: SÍ — server/domain/chatMediaMetrics.js
```

No se lee la base al arrancar, no se convierte nada, no se borra Base64 histórico, no hay migración de esquema ni trabajo en segundo plano.

La utilidad es **pura y no expone ninguna ruta**: recibe colecciones ya cargadas y devuelve solo números, separados por canal (viaje/soporte). Calcula los bytes desde la longitud de la cadena sin decodificar, porque decodificar para medir duplicaría el uso de memoria justo en el barrido que pretende decidir si hay memoria suficiente. La usarán las pruebas y el script de migración de 4D.

---

## 10. Seguridad

| Severidad | Hallazgos |
|---|---|
| **CRITICAL** | 0 |
| **HIGH** | 0 |
| **MEDIUM** | 1 |
| **LOW** | 2 |

```
IDOR_FOUND:              NO — la política de 4B no se tocó
PATH_TRAVERSAL_FOUND:    NO — el id público nunca se convierte en ruta
STORAGE_KEY_LEAK_FOUND:  NO — ni en payload, ni en logs, ni en errores
```

**MEDIUM.** No se deduplica por contenido: dos mensajes con la misma imagen byte a byte producen dos archivos. Es deliberado —compartir archivo obligaría a contar referencias antes de poder borrar ninguno— pero conviene saberlo al dimensionar 4D.

**LOW.** (1) El productor no limita cuántas imágenes puede subir una cuenta más allá de `limitadores.mensajes` (60/min); el tope de tamaño y la reserva de disco de 4B acotan el daño. (2) El error de compensación va a `console.error`; sin agregación, un huérfano solo se ve leyendo logs.

---

## 11. Resultados

| Suite | Resultado |
|---|---|
| Backend completo | **434/434** (0 skipped) |
| Frontend completo | **278/278** |
| Build de producción | **PASS** — 114 módulos, 734 ms |
| chatMediaProducer | 14/14 |
| chatMediaNatGuard | 7/7 |
| chatMediaClient | 16/16 |
| chatMediaStorage / Access / Endpoint / Guard | 26 / 13 / 10 / 7 |
| authRateLimitSeparation / authPreAuthGuard | 7 / 12 |
| sourceParses / testPortRanges / clientImageHygiene | 2 / 3 / 17 |
| `git diff --check` | **PASS** |

Ejecutado en un **worktree temporal desde HEAD**, para que el resultado no dependiera del trabajo visual ajeno del working tree.

---

## 12. Mutación — 11 de 11 detectadas

| # | Mutación | Resultado |
|---|---|---|
| 1 | volver a persistir Base64 | 1 fallo |
| 2 | filtrar `imageStorageKey` al cliente | 3 fallos |
| 3 | base antes que archivo | 8 fallos |
| 4 | quitar la compensación | 2 fallos |
| 5 | quitar `requireAuth` | 10 fallos |
| 6 | quitar la política de acceso | 4 fallos |
| 7 | permitir SVG | 1 fallo |
| 8 | no liberar object URLs | 7 fallos |
| 9 | ignorar el formato heredado | 1 fallo |
| 10 | quitar la deduplicación | 1 fallo |
| 11 | que los aciertos consuman la guardia | 3 fallos |

Cada mutación aborta si su patrón no coincide, para no confundir «no se aplicó» con «sobrevivió».

**Una corrección al proceso.** La mutación 10 no hacía fallar el test: lo dejaba **colgado**, porque la prueba esperaba una promesa que sin deduplicación nadie resolvía. Un test que se cuelga es un mal test —no dice qué pasó—, así que se reescribió para fallar por recuento. Ahora la mutación produce un fallo limpio.

---

## 13. Informe

```
BRANCH:          stabilization/phase-2b2-4c-chat-media-producer
PHASE_4B_HEAD:   9e33bfabff071ae519d43036a32f24ecfd508bbb
PHASE_4C_BASE:   9e33bfabff071ae519d43036a32f24ecfd508bbb
HEAD:            ab3cf3e
COMMITS_4C:      5

CHAT_MEDIA_PREAUTH_SKIP_SUCCESS: SÍ
CHAT_MEDIA_PREAUTH_LIMIT:        1200/min por dirección (sin cambios)
CHAT_MEDIA_POSTAUTH_LIMIT:       180/min por cuenta (sin cambios)

SUPPORT_PRODUCER_UPDATED:   SÍ (POST /api/support/messages)
TRIP_CHAT_PRODUCER_UPDATED: SÍ (socket chat:message)
COMMON_MEDIA_PIPELINE:      chatMediaPipeline.withStoredImage()

NEW_MESSAGE_STORES_BASE64:              NO
NEW_MESSAGE_STORES_IMAGE_REF:           SÍ
NEW_MESSAGE_STORES_STORAGE_KEY_PRIVATE: SÍ (en disco; nunca en el payload)

FILE_FIRST_DB_SECOND:    SÍ
DB_FAILURE_COMPENSATION: SÍ
STORAGE_FAILURE_SAFE:    SÍ

PUBLIC_PAYLOAD_LEAKS_STORAGE_KEY: NO
PUBLIC_PAYLOAD_LEAKS_PATH:        NO

MEDIA_CLIENT_AUTH_FETCH:    SÍ
MEDIA_CLIENT_CACHE:         memoria de sesión, sin persistencia
MEDIA_FETCH_DEDUPLICATION:  SÍ
OBJECT_URL_OWNERSHIP_MODEL: un dueño por clave, con generaciones y liberación al cerrar

NEW_FORMAT_SUPPORTED:    SÍ
LEGACY_FORMAT_SUPPORTED: SÍ
MIXED_HISTORY_SUPPORTED: SÍ (imageRef manda)

MESSAGE_DELETE_EXISTS:                        NO
THREAD_DELETE_EXISTS:                         NO
TRIP_CHAT_DELETE_EXISTS:                      NO
NEW_MEDIA_CREATION_COMPENSATION:              SÍ
ORPHAN_RISK_AFTER_EXISTING_DELETE_OPERATIONS: NINGUNO

HISTORICAL_MEDIA_MIGRATION:        NO
MIGRATION_METRICS_UTILITY_CREATED: SÍ

SVG_BLOCKED:              SÍ
MIME_SIGNATURE_VALIDATED: SÍ
IDOR_FOUND:               NO
PATH_TRAVERSAL_FOUND:     NO
STORAGE_KEY_LEAK_FOUND:   NO

CHAT_MEDIA_PRODUCER_TESTS: 14/14
CHAT_MEDIA_FRONTEND_TESTS: 16/16
CHAT_MEDIA_GUARD_TESTS:    14/14 (7 guardia 4B + 7 NAT)

BACKEND_TESTS:      434/434
FRONTEND_TESTS:     278/278
PRODUCTION_BUILD:   PASS (114 módulos, 734 ms)
SOURCE_PARSE_TESTS: 2/2
PORT_RANGE_TESTS:   3/3
AUTH_HOTFIX_TESTS:  32/32
GIT_DIFF_CHECK:     PASS

MUTATION_TESTS: 11/11 detectadas

CRITICAL_FINDINGS: 0
HIGH_FINDINGS:     0
MEDIUM_FINDINGS:   1 (sin deduplicación por contenido, deliberado)
LOW_FINDINGS:      2 (sin tope propio de subidas; huérfano solo visible en logs)

UNRELATED_FILES_IN_4C_COMMITS: NONE
SECRETS_FOUND:                 ninguno (fixtures sintéticos de test)

MASTER_MODIFIED: NO
PRODUCTION_DATA_MODIFIED: NO
RAILWAY_MODIFIED: NO
PUSH_PERFORMED: NO
DEPLOY_PERFORMED: NO

NEXT_PHASE: Phase 2B-2-4D — historical media migration
```

**PHASE_2B_2_4C_READY_FOR_REVIEW: YES**

---

## Apéndice — Nota para el despliegue

4C cambia el formato de persistencia de los mensajes **nuevos**. Consecuencia operativa a tener presente antes de desplegar: si se desplegara 4C y luego hubiera que revertir a una versión anterior, los mensajes creados mientras tanto tendrían `imageRef` pero el código antiguo solo sabe leer `image` — sus imágenes dejarían de verse (el texto seguiría). No hay pérdida de datos: los archivos siguen en el volumen y el registro conserva su clave. Es reversible reaplicando 4C.

**Phase 2B-2-4D — migración histórica**: idempotente, con checkpoint, tolerante a interrupción y a disco lleno, con rollback, y usando `chatMediaMetrics.js` para dimensionar antes de empezar.
