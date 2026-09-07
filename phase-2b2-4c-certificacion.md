# Certificación — Phase 2B-2-4C

**Productor + compatibilidad de medios privados de chat**

| | |
|---|---|
| Rama | `stabilization/phase-2b2-4c-chat-media-producer` |
| Base 4B | `9e33bfabff071ae519d43036a32f24ecfd508bbb` |
| HEAD | `ab3cf3e5b6553c7b0d78e66496179467c8ea36a5` |
| Master | `d0fa9a4` (intacto) |
| Commits sobre master | 10 (5 de 4B + 5 de 4C) |
| Archivos | 22 — 2.752 inserciones, 34 borrados |
| **Veredicto** | **NO CERTIFICADA — 2 hallazgos HIGH bloqueantes** |

> El núcleo de 4C —dejar de guardar Base64, el pipeline, la privacidad de la clave, la autorización y la guardia NAT— está **correcto y verificado en vivo**. Lo que bloquea son dos regresiones funcionales en el cliente, ninguna de seguridad ni de pérdida de datos. Las dos son de arreglo pequeño.

---

## 🔴 Hallazgo 1 (HIGH, bloqueante) — el cargador singleton queda inservible al navegar

`adminSupportChat.js:9` y `adminSupport.js:11` crean el cargador **a nivel de módulo**:

```js
const chatMedia = createChatMediaLoader({ loadUrl: … });   // singleton
```

`main.js:80` llama a `disposeAllPrivatePhotos()` en **cada cambio de ruta**, y esa función hace `loader.destroy()` sobre todos los cargadores vivos. `destroy()` pone `destroyed = true` de forma permanente, y `load()` empieza por `if (destroyed) return Promise.resolve(null)`.

Como el cargador es un singleton de módulo, al volver a la pantalla **es el mismo objeto ya destruido**. Reproducido:

```
antes de navegar  : load -> blob:x | destroyed: false
tras cambiar ruta : load -> null   | destroyed: true
al volver al panel: load -> null   ← el módulo ya está cargado, el singleton es el mismo
```

**Efecto**: tras la primera navegación, el panel de soporte y el hilo del usuario dejan de mostrar cualquier adjunto **hasta recargar la página entera**. Silencioso: no hay error, solo huecos vacíos.

`chatModal.js` **no** está afectado: crea su cargador por instancia, dentro de la función.

**Por qué no lo detectó ninguna prueba**: los tests del cliente crean un cargador nuevo en cada caso, así que nunca ejercitan el ciclo «usar → destruir → volver a usar».

**Corrección sugerida** (no implementada): crear el cargador de forma perezosa y recrearlo si está destruido, o crearlo por invocación de la pantalla como hace `chatModal`. Y añadir una prueba que recorra el ciclo completo.

---

## 🔴 Hallazgo 2 (HIGH, bloqueante) — un cuarto consumidor sin actualizar

`src/pages/driver/driverTrips.js` — detalle de un viaje archivado del conductor. Consume `/api/trips/:id/messages`, que desde 4C devuelve `imageRef`, pero sigue mirando solo el campo heredado:

| Línea | Código | Efecto con 4C |
|---|---|---|
| 45 | `merged.filter(message => message.image)` | el contador de adjuntos da 0 |
| 53 | `message.image ? <img src=…> : ''` | el mensaje se pinta sin imagen |
| 54 | `attachments.map(item => item.image)` | «No se adjuntaron capturas o comprobantes» |

**Efecto**: el historial de viajes del conductor deja de mostrar los comprobantes de Pago Móvil de los viajes nuevos. Es justo la función para la que se hicieron los adjuntos.

**Corrección sugerida**: usar `chatImageSource` + `hydrateChatMedia` como los otros tres, con su propio cargador y liberación.

**Nota de proceso**: mi mapa inicial de consumidores sí listó este archivo; no lo actualicé. Fallo de ejecución, no de análisis.

---

## 1. Identidad y separación del trabajo ajeno

```
BRANCH:              stabilization/phase-2b2-4c-chat-media-producer
HEAD:                ab3cf3e5b6553c7b0d78e66496179467c8ea36a5   ✔ coincide con el esperado
MASTER:              d0fa9a4cc42a9a88fde37b7d5928af62f5590b66
ORIGIN_MASTER:       d0fa9a4cc42a9a88fde37b7d5928af62f5590b66
MERGE_BASE:          d0fa9a4  ✔
COMMITS_OVER_MASTER: 10 (5 de 4B + 5 de 4C)

UNRELATED_WORKTREE_FILES:          4 (package.json, landing.js, modern-yellow-lab.css, icons.js)
UNRELATED_FILES_INSIDE_4C_COMMITS: 0
```

`git diff --check master...HEAD`: limpio. Todas las suites se ejecutaron en un **worktree temporal desde HEAD** (0 modificaciones), ya eliminado.

---

## 2. Los cinco commits de 4C

| SHA | Propósito | Archivos |
|---|---|---|
| `8c74c36` | la guardia deja de contar los aciertos | `index.js`, `httpRateLimit.js` |
| `582d181` | productor: imagen al almacén, referencia al mensaje | `index.js` + 4 módulos nuevos |
| `96c32cc` | cliente: descarga autenticada y compatibilidad | 5 archivos de `src/` |
| `d6e6ceb` | tests del productor, la guardia NAT y el cliente | 3 suites nuevas |
| `ab3cf3e` | adaptar un test de Phase 3A al formato nuevo | `supportPagination.test.js` |

Sin rediseño visual, sin Sentry, sin retention, sin migración histórica, sin Railway, sin cambios de esquema, sin usuarios de prueba, sin tocar `/api/trips/me/history`.

---

## 3. El contrato central: se acabó el Base64 nuevo

Búsqueda exhaustiva, no solo los dos productores conocidos:

```
supportMessages.push  →  1 (index.js:1227)
database.messages.push →  1 (index.js:2170)
regex data:image residual en productores → 0
```

| Productor | Entrada | Pipeline | Persiste | Publica |
|---|---|---|---|---|
| `POST /api/support/messages` | `isChatImageDataUrl(req.body.image)` | `withStoredImage` | `imageRef` + `imageStorageKey` | `imageRef` |
| socket `chat:message` | `isChatImageDataUrl(data.image)` | `withStoredImage` | `imageRef` + `imageStorageKey` | `imageRef` |

Fila persistida, leída de SQLite en vivo:

```
campos: id,conversationUserId,senderId,senderRole,text,imageRef,imageStorageKey,createdAt,read
image (base64) presente:  no
imageStorageKey presente: sí (correcto, es privada)
¿la clave deriva del id público?: no
```

```
MESSAGE_PRODUCERS_TOTAL:                   2
MESSAGE_PRODUCERS_USING_NEW_PIPELINE:      2
MESSAGE_PRODUCERS_STILL_PERSISTING_BASE64: 0
```

---

## 4. Pipeline como única fuente de verdad

```
DIRECT_SAVE_BUFFER_CALLERS:   0 fuera del pipeline
PIPELINE_SINGLE_SOURCE_OF_TRUTH: SÍ
```

`saveBuffer` solo aparece en su definición (`chatMediaStorage.js`) y en el pipeline. Ningún productor puede saltarse la compensación porque no llama al almacén: le pasa un callback al pipeline, y es el pipeline quien decide el orden y quien compensa.

Orden real verificado en el código: validar → decodificar → **guardar archivo** → construir mensaje → **persistir** → compensar si falla.

---

## 5. Seguridad ante fallos

| Escenario | Comportamiento | Test |
|---|---|---|
| `saveBuffer` falla | no hay mensaje; `persistir` ni se ejecuta | K |
| la base falla tras guardar | `storage.remove(clave)` | L |
| la compensación también falla | avisa con `{reason, mimeType, bytes}` y **propaga el error original** | M |

El aviso no contiene la clave, ni la ruta, ni contenido. Se propaga el error de la base porque es el que explica por qué no hay mensaje.

```
FILE_FIRST_DB_SECOND:        SÍ
DB_FAILURE_COMPENSATION:     SÍ
COMPENSATION_FAILURE_SAFE:   SÍ
HTTP_SOCKET_SEMANTICS_MATCH: SÍ (mismo pipeline, misma composición `...(media || {})`)
```

---

## 6. Privacidad del payload — cero fugas

No me limité a los cinco puntos del informe: rastreé cada aparición de `imageStorageKey` y probé cada salida en vivo.

| Salida | Resultado | Lleva `imageRef` |
|---|---|---|
| 201 del alta de soporte | limpio | sí |
| listado de mensajes (propio) | limpio | sí |
| listado de mensajes (admin) | limpio | sí |
| listado de hilos (admin) | limpio | no (resumen) |
| listado de hilos (propio) | limpio | no (resumen) |
| evento `support:message` | limpio (usa `publico`) | sí |
| evento `chat:message` | limpio (`publicChatMessage`) | sí |
| `GET /trips/:id/messages` | limpio (`publicChatMessages`) | sí |

```
PUBLIC_OUTPUTS_TOTAL:              8
PUBLIC_OUTPUTS_REDACTING_STORAGE_KEY: 8
PUBLIC_OUTPUTS_LEAKING_STORAGE_KEY:   0
```

El listado de hilos no necesita la proyección: `summarizeSupportMessage` es lista blanca de siete campos.

**Riesgo del diseño por sustracción.** La proyección quita campos en lugar de seleccionarlos. Si mañana se añade un campo privado y nadie actualiza `PRIVATE_MESSAGE_FIELDS`, se filtraría. El test existente `assert.deepEqual(PRIVATE_MESSAGE_FIELDS, ['imageStorageKey'])` **falla si la lista cambia**, lo que obliga a pasar por él conscientemente — pero **no** detecta que se haya añadido un campo privado al mensaje sin declararlo. La barrera es un recordatorio, no una garantía.

```
PRIVATE_FIELD_PROJECTION_RISK: MEDIUM
```

Hoy el mensaje tiene un solo campo privado y el riesgo es teórico. Se materializaría en 4D si la migración añade metadatos (por ejemplo `migratedAt` o la clave original).

---

## 7. Autorización de lectura

Medido en vivo sobre un adjunto real:

| Quién | Resultado |
|---|---|
| dueño del hilo | **200** |
| administración (soporte) | **200** |
| otro usuario | **403** |
| sin sesión | **401** |

```
IDOR_FOUND:                            NO
MEDIA_ID_TO_STORAGE_KEY_TRUST_BOUNDARY: el id público solo se usa para BUSCAR el mensaje
                                        por igualdad exacta; la clave la aporta el registro
                                        encontrado, nunca el cliente
UNAUTHORIZED_MEDIA_RESPONSE:            403 CHAT_MEDIA_FORBIDDEN, idéntico en los tres casos
ACCESS_ORACLE_FOUND:                    NO
```

La política de 4B no se tocó: administración sigue excluida del chat de viaje, y el acceso no caduca con el viaje cerrado.

---

## 8. Guardia NAT — medida, no inspeccionada

Servidor efímero con tope 20, contando `ratelimit-remaining` del preguard entre tandas:

| Tráfico | Consumo del preguard |
|---|---|
| 15 lecturas correctas (200) | **0** |
| 3 con token inválido (401) | **3** |
| 3 sin acceso (403) | **3** |

```
PREAUTH_200_COUNTED:  NO   ← el objetivo del cambio
PREAUTH_401_COUNTED:  SÍ
PREAUTH_403_COUNTED:  SÍ
POSTAUTH_200_COUNTED: SÍ (180 → 164 → 163, descuenta uno por lectura)
```

Stores independientes verificados: login 30, `auth/me` 240, chat-media 20 (el tope de prueba). Agotar uno no toca a los demás.

---

## 9-10. Cliente: caché, deduplicación y propiedad

```
AUTHENTICATED_MEDIA_FETCH:  apiService.getPrivateFileUrl → fetch con Bearer → Blob → object URL
STORAGE_KEY_CLIENT_DEPENDENCY: NINGUNA (ningún archivo de src/ menciona imageStorageKey)
LATE_RESPONSE_LEAK_FOUND:   NO (probado: se revoca la URL que llega tarde)
OBJECT_URL_LEAK_FOUND:      NO en el mecanismo — pero ver Hallazgo 1
```

**El alcance de la caché no es uniforme**, y conviene decirlo con precisión:

| Consumidor | Alcance del cargador | Vive |
|---|---|---|
| `chatModal.js` | por instancia del modal | mientras el modal existe |
| `adminSupportChat.js` | **singleton de módulo** | hasta el primer cambio de ruta (Hallazgo 1) |
| `adminSupport.js` | **singleton de módulo** | ídem |

```
CACHE_SCOPE:                  por cargador, no global; nunca compartida entre pantallas
CONCURRENT_FETCH_DEDUPLICATION: SÍ (mapa de peticiones en vuelo por clave)
RERENDER_FETCH_DEDUPLICATION:   SÍ (mapa de URLs abiertas por clave)
THREAD_SWITCH_BEHAVIOR:         la URL se conserva salvo release/releaseAll explícito
CACHE_AFTER_RELEASE:            se descarta; la siguiente petición vuelve a descargar
OBJECT_URL_OWNER:               el cargador que la abrió, con generación por clave
```

Cuándo se conserva y cuándo se vuelve a descargar: se conserva mientras nadie llame a `release(clave)`, `releaseAll()` ni `destroy()`; se vuelve a descargar tras cualquiera de los tres, y las respuestas en vuelo de una generación anterior se descartan y revocan.

---

## 11-12. Compatibilidad

| Caso | `chatModal` | `adminSupportChat` | `adminSupport` | `driverTrips` |
|---|---|---|---|---|
| solo `imageRef` | ✔ | ✔ | ✔ | ✘ **no la muestra** |
| solo `image` | ✔ | ✔ | ✔ | ✔ |
| ambos | ✔ gana `imageRef` | ✔ | ✔ | ✘ pinta la heredada |
| ninguno | ✔ | ✔ | ✔ | ✔ |

```
LEGACY_ONLY:            soportado en los 4
NEW_ONLY:               soportado en 3 de 4
BOTH_PRESENT:           imageRef gana en 3 de 4
NO_IMAGE:               correcto en los 4
DUPLICATE_RENDER_FOUND: NO
LEGACY_ONLY_IMAGE_ASSUMPTIONS_FOUND: SÍ — driverTrips.js (líneas 45, 53, 54)
```

`summarizeSupportMessage` sí quedó corregido, verificado en vivo: con un mensaje que lleva solo `imageRef`, el resumen del hilo devuelve **`hasImage: true`** y no transporta la imagen.

---

## 13. Tamaño y memoria

```
MAX_BASE64_CHARS:  1.000.000  (MAX_DATA_URL_LENGTH)
MAX_IMAGE_BYTES:     750.000  (MAX_CHAT_MEDIA_BYTES)
límite del cuerpo HTTP: 1 MB  (express.json)
DECODE_COUNT:      1 decodificación (Buffer.from) + 1 recodificación de verificación
```

En el peor caso coexisten, para una imagen al límite: el cuerpo JSON parseado (~1 MB), la cadena capturada por la expresión regular (~1 MB), el Buffer (750 KB) y la cadena de la comprobación de ida y vuelta (~1 MB) ≈ **3,7 MB por petición en curso**.

```
UNNECESSARY_BUFFER_COPIES:  ninguna del Buffer; sí una cadena extra de ~1 MB
BASE64_MEMORY_PRESSURE_RISK: LOW
```

La copia extra viene de `buffer.toString('base64') !== base64`, que es la comprobación que detecta el Base64 corrupto que la expresión regular acepta. Es un intercambio consciente: correctitud a cambio de una cadena temporal. Con `limitadores.mensajes` en 60/min por cuenta, el pico agregado es acotado.

---

## 14-15. Disco y ciclo de vida

```
DISK_RESERVE_PRESERVED:      SÍ — freeBytes(root) - buffer.length < MIN_FREE_BYTES (50 MB) rechaza
CONCURRENT_UPLOAD_DISK_RISK: el TOCTOU ya documentado en 4B; 4C NO lo agrava
```

El margen de 50 MB frente a 750 KB por subida absorbe decenas de subidas simultáneas antes de que el TOCTOU importe.

```
MESSAGE_DELETE_EXISTS:              NO
THREAD_DELETE_EXISTS:               NO
TRIP_CHAT_DELETE_EXISTS:            NO
HIDDEN_MESSAGE_DELETION_PATH_FOUND: NO
ORPHAN_RISK_CURRENT_BEHAVIOR:       NINGUNO
```

Busqué borrado encubierto: no hay reasignación de `database.messages` ni `database.supportMessages`, la siembra no las toca, y ninguna operación administrativa las recorta. `databasePersistence` sí emite `DELETE FROM`, pero solo para filas que desaparecen de la colección en memoria — y lo único que las quita es la compensación, sobre un mensaje que nunca llegó a persistirse.

---

## 16. Utilidad de métricas para 4D

```
METRICS_UTILITY_PURE:            SÍ (0 imports de IO, no toca disco ni HTTP)
METRICS_UTILITY_AGGREGATED_ONLY: SÍ (solo números; separa viaje/soporte; sin PII)
METRICS_BYTE_ESTIMATE_VALID:     SÍ — exacto en los 5 casos sintéticos comprobados
                                 contra Buffer.from(...).length
```

No decodifica Base64 (0 usos de `Buffer.from`), no muta mensajes.

---

## 17. Rollback operativo

```
ROLLBACK_BACKWARD_COMPATIBLE: NO (asimétrico)
```

Un mensaje creado con 4C tiene `imageRef`; una versión anterior solo sabe leer `image`. Revertir el código dejaría esas imágenes invisibles —el texto sigue— sin pérdida de bytes: los archivos siguen en el volumen y el registro conserva su clave. Reaplicar 4C las recupera.

| Opción | Seguridad | SQLite | Complejidad | Reversibilidad |
|---|---|---|---|---|
| **A. Aceptar el rollback asimétrico** | igual | deja de crecer ✔ | ninguna | degradación temporal |
| **B. Dual-write temporal** | igual | **sigue creciendo** ✘ | media | completa |
| **C. Lector primero, productor después** | igual | deja de crecer ✔ | baja | completa |
| D. Migrar antes de producir | igual | crece hasta migrar | alta | completa |

**B derrota el propósito de 4C**: si se sigue escribiendo Base64, la deuda no deja de crecer, que es precisamente lo que se quería detener.

```
RECOMMENDED_DEPLOYMENT_STRATEGY: A con matiz de C — desplegar 4C completo, pero en una
ventana de baja actividad y con la reversión ensayada. El lector ya está en producción
desde 4B (endpoint activo desde d0fa9a4), así que la mitad de C ya está hecha: lo que
queda por activar es el productor. Separarlo en dos despliegues aportaría poco y alargaría
la ventana en la que conviven dos formatos.
```

---

## 18. ¿4C antes de 4D?

```
DEPLOY_4C_BEFORE_4D_RECOMMENDED: YES
```

**De acuerdo con tu inclinación**, y con evidencia:

- 4C **detiene la deuda nueva** desde el primer minuto. Cada día de retraso son más filas que 4D tendrá que migrar.
- El radio de impacto es menor: 4C toca el alta de mensajes, 4D toca datos existentes. Desplegarlos juntos mezclaría un fallo de escritura con uno de migración, y no se sabría cuál.
- 4D necesita métricas que sólo se pueden tomar con calma; 4C no las necesita.
- La migración es más barata contra un conjunto que ya no crece.

Condición: resolver antes los dos hallazgos HIGH.

---

## 19. Resultados

| Suite | Resultado |
|---|---|
| Backend completo | **434/434** (0 skipped) |
| Frontend completo | **278/278** |
| Build de producción | **PASS** — 114 módulos, 680 ms |
| `git diff --check` | **PASS** |
| chatMediaProducer / NatGuard / Client | 14 / 7 / 16 |
| chatMediaStorage / Access / Endpoint / Guard | 26 / 13 / 10 / 7 |
| authRateLimitSeparation / authPreAuthGuard / authErrorHandling | 7 / 12 / 13 |
| sourceParses / testPortRanges / clientImageHygiene | 2 / 3 / 17 |
| privatePhoto / localAvatar | 18 / 25 |

Todo verde — lo que confirma que **las suites no cubren los dos hallazgos**.

---

## 20. Mutaciones críticas — 7 de 7 detectadas

Ejecutadas en el worktree, verificando primero que cada mutación se aplicaba.

| Mutación | Fallos |
|---|---|
| persistir Base64 | 1 |
| filtrar `imageStorageKey` | 3 |
| base antes que archivo | 5 |
| quitar la compensación | 2 |
| quitar la política de acceso | 4 |
| desactivar la deduplicación | 1 |
| que los 200 consuman el preguard | 3 |

---

## 21. Revisión del diff

34 líneas eliminadas, **todas del productor antiguo que se reemplaza**. Ninguna de Phase 3A, ninguna del hotfix de autenticación.

```
console.log sensible:  0        secretos reales:        0 (fixtures sintéticos)
railway/vercel:        0 (3 en comentarios)             sentry: 0
retention/purge:       0        cambios de esquema:     0
migración histórica:   0        rediseño visual:        0
TODO/FIXME:            0 (8 falsos positivos: «todo» en castellano)
```

---

## 22. Hallazgos clasificados

### A) Bloqueantes para integrar 4C

| # | Severidad | Hallazgo |
|---|---|---|
| 1 | **HIGH** | El cargador singleton queda destruido tras el primer cambio de ruta: el panel de soporte y el hilo del usuario dejan de mostrar adjuntos hasta recargar |
| 2 | **HIGH** | `driverTrips.js` no reconoce `imageRef`: el historial del conductor pierde los comprobantes |

### B) Deuda para 4D

| Severidad | Hallazgo |
|---|---|
| MEDIUM | La proyección por sustracción obliga a mantener `PRIVATE_MESSAGE_FIELDS`; si 4D añade metadatos privados al mensaje, hay que actualizarla |
| MEDIUM | Sin deduplicación por contenido: dos mensajes con la misma imagen dan dos archivos (deliberado; afecta al dimensionado) |

### C) Deuda general

| Severidad | Hallazgo |
|---|---|
| LOW | Copia temporal de ~1 MB en la verificación de ida y vuelta del Base64 |
| LOW | El error de compensación va a `console.error`; sin agregación, un huérfano solo se ve leyendo logs |
| LOW | TOCTOU de la reserva de disco (heredado de 4B, no agravado) |
| LOW | El guardián de rangos de puertos no cubre bloques pasados por parámetro (heredado de 4B) |

```
CRITICAL_FINDINGS: 0
HIGH_FINDINGS:     2
MEDIUM_FINDINGS:   2
LOW_FINDINGS:      4
```

---

## 23. Informe

```
BRANCH:        stabilization/phase-2b2-4c-chat-media-producer
BASE_4B:       9e33bfabff071ae519d43036a32f24ecfd508bbb
HEAD:          ab3cf3e5b6553c7b0d78e66496179467c8ea36a5
COMMITS_4C:    5
FILES_CHANGED: 22 (2.752 inserciones, 34 borrados)

MESSAGE_PRODUCERS_TOTAL:                   2
MESSAGE_PRODUCERS_USING_NEW_PIPELINE:      2
MESSAGE_PRODUCERS_STILL_PERSISTING_BASE64: 0

PIPELINE_SINGLE_SOURCE_OF_TRUTH: SÍ
FILE_FIRST_DB_SECOND:            SÍ
DB_FAILURE_COMPENSATION:         SÍ
COMPENSATION_FAILURE_SAFE:       SÍ

PUBLIC_OUTPUTS_TOTAL:                 8
PUBLIC_OUTPUTS_REDACTING_STORAGE_KEY: 8
PUBLIC_OUTPUTS_LEAKING_STORAGE_KEY:   0
PRIVATE_FIELD_PROJECTION_RISK:        MEDIUM

IDOR_FOUND:          NO
ACCESS_ORACLE_FOUND: NO

PREAUTH_200_COUNTED:  NO
PREAUTH_401_COUNTED:  SÍ
PREAUTH_403_COUNTED:  SÍ
POSTAUTH_200_COUNTED: SÍ

AUTHENTICATED_MEDIA_FETCH:      SÍ
CACHE_SCOPE:                    por cargador (2 de 3 son singleton de módulo — Hallazgo 1)
CONCURRENT_FETCH_DEDUPLICATION: SÍ
RERENDER_FETCH_DEDUPLICATION:   SÍ
OBJECT_URL_LEAK_FOUND:          NO

LEGACY_ONLY:                         soportado
NEW_ONLY:                            soportado en 3 de 4 consumidores
BOTH_PRESENT:                        imageRef gana
DUPLICATE_RENDER_FOUND:              NO
LEGACY_ONLY_IMAGE_ASSUMPTIONS_FOUND: SÍ (driverTrips.js)

MAX_IMAGE_BYTES:             750000
MAX_BASE64_CHARS:            1000000
DECODE_COUNT:                1 (+1 recodificación de verificación)
BASE64_MEMORY_PRESSURE_RISK: LOW

DISK_RESERVE_PRESERVED:             SÍ
HIDDEN_MESSAGE_DELETION_PATH_FOUND: NO
ORPHAN_RISK_CURRENT_BEHAVIOR:       NINGUNO

METRICS_UTILITY_PURE:        SÍ
METRICS_BYTE_ESTIMATE_VALID: SÍ

ROLLBACK_BACKWARD_COMPATIBLE:    NO (asimétrico, sin pérdida de bytes)
RECOMMENDED_DEPLOYMENT_STRATEGY: A — aceptar el rollback asimétrico; el lector ya está
                                 en producción desde 4B
DEPLOY_4C_BEFORE_4D_RECOMMENDED: YES

BACKEND_TESTS:      434/434
FRONTEND_TESTS:     278/278
PRODUCTION_BUILD:   PASS
CHAT_MEDIA_TESTS:   93/93
AUTH_HOTFIX_TESTS:  32/32
SOURCE_PARSE_TESTS: 2/2
PORT_RANGE_TESTS:   3/3
GIT_DIFF_CHECK:     PASS
MUTATION_TESTS:     7/7 detectadas

CRITICAL_FINDINGS: 0
HIGH_FINDINGS:     2
MEDIUM_FINDINGS:   2
LOW_FINDINGS:      4

UNRELATED_FILES_INSIDE_4C_COMMITS: NONE
SECRETS_FOUND:                     ninguno

MASTER_MODIFIED: NO
PRODUCTION_DATA_MODIFIED: NO
RAILWAY_MODIFIED: NO
PUSH_PERFORMED: NO
DEPLOY_PERFORMED: NO
```

---

## Veredicto

```
PHASE_2B_2_4C_CERTIFIED:   NO
READY_FOR_4C_INTEGRATION:  NO
READY_FOR_PHASE_2B_2_4D:   NO (4C debe integrarse primero)
```

**Qué falta**, en orden:

1. Corregir el cargador singleton en `adminSupportChat.js` y `adminSupport.js` (crear perezosamente o por pantalla).
2. Actualizar `driverTrips.js` para reconocer `imageRef`.
3. Añadir dos pruebas que cubran lo que se escapó: el ciclo usar → destruir → volver a usar, y un barrido que exija que **todo** consumidor de mensajes con imagen pase por `chatImageSource`.
4. Recertificar.

Los dos arreglos son pequeños y localizados. El núcleo de 4C —el que decide si el diseño es correcto— está verificado y no necesita cambios.
