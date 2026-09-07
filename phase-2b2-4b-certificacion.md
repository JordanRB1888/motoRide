# Certificación — Phase 2B-2-4B

**Infraestructura privada de adjuntos de chat**

| | |
|---|---|
| Rama | `stabilization/phase-2b2-4b-chat-media` |
| Base | `d0fa9a4cc42a9a88fde37b7d5928af62f5590b66` |
| HEAD | `9e33bfabff071ae519d43036a32f24ecfd508bbb` |
| Commits sobre master | 5 |
| Archivos | 8 (3 modificados, 5 nuevos) — 1.381 inserciones, **0 borrados** |
| Veredicto | **CERTIFICADA** · lista para 4C |

---

## 1. Separación del trabajo ajeno

El working tree contiene un rediseño visual sin comitear que **no pertenece a esta rama**. Ningún archivo suyo entró en los commits.

| Archivo ajeno | ¿Dentro de los commits de 4B? |
|---|---|
| `package.json` | No |
| `src/pages/landing.js` | No |
| `src/styles/modern-yellow-lab.css` | No |
| `src/utils/icons.js` | No |
| `public/mototaxi-sbr-realistic.jpg` | No |

Los ocho archivos de 4B son todos de `server/`. Para que la certificación no dependiera de ese ruido, **todas las suites y el build se ejecutaron en un worktree temporal desde HEAD** (0 modificaciones), eliminado al terminar.

```
UNRELATED_WORKTREE_FILES:          5
UNRELATED_FILES_INSIDE_4B_COMMITS: 0
```

---

## 2. Los cinco commits

| SHA | Tipo | Archivos | Propósito |
|---|---|---|---|
| `b60da07` | cherry-pick | storage, `.env.example`, `index.js`, test | Almacén privado sobre `createPrivateStorage` |
| `c600781` | cherry-pick | access, `index.js`, 2 tests | Política pura + endpoint |
| `20240a4` | cherry-pick | storage, access, 2 tests | Contención antes de tocar el disco |
| `7bedc1c` | adaptación | 6 archivos | Limitador, guardia previa, raíz derivada |
| `9e33bfa` | corrección | 1 test | Bloque de puertos 10100 → 23000 |

Todos pertenecen exclusivamente a 4B. **Cero líneas eliminadas** frente a master: es aritméticamente imposible que revierta nada.

---

## 3. Raíz de medios

Orden real del código en `resolveChatMediaRoot`:

| Línea | Acción |
|---|---|
| 121 | Contención léxica (`isContainedIn`) |
| 141 | `realpath` de la candidata existente |
| 152 | `mkdirSync` |
| 160 | Revalidación de lo creado |
| 171 | Escritura del centinela |

**Nada se escribe antes de demostrar la contención.** No depende de `cwd`. Verificado en vivo: el servidor arranca sin la variable.

```
CHAT_MEDIA_ROOT_STRATEGY:           explícita si CHAT_MEDIA_DIR es válida; si no,
                                    path.join(path.dirname(DATA_FILE), 'chat-media')
PRODUCTION_RESOLVED_ROOT:           /data/chat-media
CHAT_MEDIA_DIR_REQUIRED_IN_RAILWAY: NO
MISSING_VARIABLE_CAUSES_CRASH:      NO
INVALID_EXPLICIT_ROOT_FAILS_CLOSED: SÍ
```

---

## 4. Middleware y cubos — medido, no deducido

```
guardiaMedios (ip, 1200/min) → requireAuth → limitadores.archivos (user, 180/min) → política → storage → respuesta
```

| Ruta | Estado | Tope observado |
|---|---|---|
| `/api/chat-media/:id/content` con sesión | 403 | **180**/60s |
| `/api/chat-media/:id/content` anónimo | 401 | **1200**/60s |
| `/api/auth/me` con sesión | 200 | 240/60s |
| `/api/auth/me` anónimo | 401 | 1200/60s |
| `/api/users/:id/photo` con sesión | 403 | 180/60s |

Independencia demostrada por consumo: **5 peticiones a chat-media consumieron 0 de la guardia de `/auth/me`**, y el login siguió con su contador propio en 30. Ningún cubo compartido con login, registro ni `/auth/me`.

```
PREAUTH_GUARD:    guardiaMedios (scope 'medios-previa')
PREAUTH_KEY:      ip:<normalizada, IPv6 /64>
PREAUTH_LIMIT:    1200 · PREAUTH_WINDOW: 60 s
POSTAUTH_LIMITER: limitadores.archivos
POSTAUTH_KEY:     user:<id>
POSTAUTH_LIMIT:   180 · POSTAUTH_WINDOW: 60 s
```

---

## 5. ⚠ El techo de 1200/min — hallazgo principal

**Esto contradice mi propia decisión del checkpoint anterior.**

| Usuarios tras el NAT | 1 img/min | 3 | 5 | 10 |
|---|---|---|---|---|
| 100 | 100 | 300 | 500 | 1.000 |
| 500 | 500 | **1.500** ✗ | **2.500** ✗ | **5.000** ✗ |

Con 500 usuarios el techo se supera a partir de ~2,4 imágenes por usuario y minuto.

Hay un segundo camino: el límite por cuenta es 180/min, así que **siete usuarios a tope (1.260) ya rebasan la guardia** — la protección por dirección puede dispararse antes que la individual.

Agrava el cálculo que `Cache-Control: private, no-store` **impide toda caché**: cada re-render, cada navegación y cada reapertura de conversación vuelve a pedir la imagen. «Tres imágenes por minuto» no es forzado; es abrir una conversación con tres fotos y volver a entrar.

La comparación con `/auth/me` no se sostiene: allí una apertura de aplicación son una o dos peticiones; aquí una sola pantalla pueden ser diez. Copié el valor por analogía con el coste por petición anónima, y ese razonamiento ignoraba el tráfico autenticado, que es el que domina en un endpoint de medios.

**Riesgo: MEDIUM, latente.** Hoy nadie usa el endpoint porque no hay productor: el impacto real es cero hasta 4C.

### Recomendación (sin implementar)

- **Opción C (preferida)** — activar `skipSuccessfulRequests` en la guardia: solo cuenta lo que falla (401/403), que es justo el abuso que quiere frenar, y deja el tráfico legítimo acotado por el límite por cuenta, que para eso existe.
- **Opción B (simple)** — subir el techo a 6.000/min.

Decidirlo en 4C junto con la política de caché del frontend, porque las dos cosas se determinan mutuamente.

---

## 6. Seguridad HTTP de la respuesta

| Cabecera | Camino 200 (binario) | Camino 403 (JSON) |
|---|---|---|
| `Content-Type` | del MIME **revalidado al leer**, nunca del request | `application/json` |
| `Content-Length` | del buffer | — |
| `Cache-Control` | `private, no-store, max-age=0` | — |
| `Content-Disposition` | `inline`, **sin filename** | — |
| `X-Content-Type-Options` | `nosniff` | `nosniff` (helmet) |
| `ETag` | **ausente** | presente (irrelevante) |
| `Last-Modified` | **ausente** | — |

El ETag se comprobó empíricamente reproduciendo el patrón exacto: `res.end(buffer)` no lo genera; solo `res.json()`, y ahí cubre 32 bytes de código de error. **Ningún hallazgo bloqueante.**

Sobre `private` vs `private, no-store`: `no-store` es correcto para el modelo actual, pero es precisamente lo que multiplica el tráfico — de ahí la recomendación de la sección 5.

---

## 7. Política de acceso

Cubierta por 13 tests de la política pura y 10 del endpoint.

| Canal | Quién accede | Quién no |
|---|---|---|
| Soporte | propietario del hilo, administración | terceros |
| Viaje | pasajero y conductor del viaje, también cerrado | **administración**, otros pasajeros, otros conductores |

La exclusión de administración en el chat de viaje es **explícita**, con un test que verifica que es deliberada y no un efecto colateral de no ser participante.

```
IDOR_FOUND:          NO
ACCESS_ORACLE_FOUND: NO — 403 idéntico para inexistente, malformado y ajeno
```

Hay un test que comprueba que ninguna respuesta filtra la clave privada ni rutas del sistema.

---

## 8. Storage

```
PUBLIC_MEDIA_ID_SAFE:       SÍ — UUIDv4 con versión y variante exigidas; nunca es ruta
STORAGE_KEY_SAFE:           SÍ — la genera randomUUID en el servidor; la aporta el registro
PATH_TRAVERSAL_PROTECTED:   SÍ — probado con ../, absolutas, backslash, NUL y 500 chars
SVG_BLOCKED:                SÍ — tres barreras independientes
MAGIC_SIGNATURE_VALIDATION: SÍ — al guardar y de nuevo al leer
MAX_MEDIA_BYTES:            750000
MIN_FREE_BYTES:             52428800 (50 MB)
```

Directorios `0700`, archivos `0600`, nombres `randomUUID()` (sin colisión ni sobrescritura), `ownerId` saneado antes de componer la ruta.

---

## 9. Defensa en profundidad — con un matiz

**SVG: tres capas genuinamente independientes.**

1. `canonicalImageMimeType` — lista en `privateStorage`
2. `ALLOWED_MIME_TYPES` — lista propia de `chatMediaStorage`
3. `hasValidSignature` — comprobación de bytes

Dos listas en módulos distintos más una verificación de contenido. Verificado: **hay que romper las tres** para que pase un SVG.

**Contención: tres puntos de control, con una dependencia común que conviene nombrar.** La comprobación léxica y la del ancestro resuelto operan sobre entradas distintas —la ruta candidata frente al `realpath` del ancestro— y hay una revalidación tras crear el directorio. Pero las tres invocan `isContainedIn`: **la independencia es de entrada, no de implementación**. Un defecto en esa función las tumbaría a la vez. No es un fallo, pero hay que saberlo; esa función tiene sus propios tests unitarios.

---

## 10. Integridad de las fases previas — por comportamiento

| Fase | Verificación |
|---|---|
| Phase 3A | `supportPagination` 20, `tripsPagination` 16, `usersPagination` 19, `databasePersistence` 19, `socketRateLimit` 11, `connectionLimit` 9, `trustProxy` 6, `supportSearch` 7 |
| Hotfix auth | 32/32 (separación 7, pre-auth 12, errores 13) |
| 2B-2-1 privadas | `privatePhoto` 18, `privatePhotoScope` 14, `photoAccess` 13 |
| 2B-2-2 avatares | `localAvatar` 25 |
| 2B-2-3 higiene | `clientImageHygiene` 17, `photoConsumers` 12 |

Todas en verde. No es grep: es ejecución.

---

## 11. El productor sigue ausente (deliberado)

```
NEW_MEDIA_PRODUCER_ACTIVE:     NO — 0 usos de saveBuffer, 0 escrituras de imageRef
BASE64_NEW_MESSAGES_DISABLED:  NO — el campo legacy `image` se sigue persistiendo
HISTORICAL_MIGRATION_PRESENT:  NO — 1 migración SQL, la misma que master
FRONTEND_MEDIA_READER_CHANGED: NO — 0 archivos de src/
```

`POST /api/support/messages` y el handler de socket `chat:message` son **byte a byte idénticos a master**.

---

## 12. Métricas antes de 4C

Técnicamente de acuerdo con el razonamiento propuesto: 4C detiene el crecimiento nuevo y no necesita saber cuántos históricos hay — el productor se escribe igual con 10 mensajes que con 10.000.

```
MEDIA_METRICS_REQUIRED_BEFORE_4C: NO
MEDIA_METRICS_REQUIRED_BEFORE_4D: YES
```

**Condición añadida**: 4C debería dejar la ruta instrumentada para que 4D pueda medir sin infraestructura nueva.

---

## 13. Resultados de las suites (worktree limpio desde HEAD)

| Suite | Resultado |
|---|---|
| chat-media | **56/56** (storage 26, access 13, endpoint 10, guard 7) |
| Backend completo | **413/413** (0 skipped) |
| Frontend completo | **262/262** |
| Build de producción | **PASS** — 113 módulos, 702 ms |
| Hotfix auth | **32/32** |
| sourceParses | **2/2** |
| testPortRanges | **3/3** |
| `git diff --check` | **PASS** |

Frontend y build dan exactamente los mismos números que master, lo que confirma que 4B no lo toca.

---

## 14. Deuda del guardián de puertos

Confirmada: `testPortRanges` solo reconoce literales `NNNNN + Math.floor(...)`, así que los tres ficheros que pasan el bloque por parámetro le escapan (`authPreAuthGuard`, `authRateLimitSeparation`, `chatMediaGuard`).

Verificados a mano los 46 bloques, incluidos los 23 que escapan: **cero colisiones**. El bloque 23000-23699 está libre.

**Deuda técnica no bloqueante.**

---

## 15. Hallazgos

| Severidad | Nº | Detalle |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 3 | (1) 1200/min por IP se queda corto con NAT grande una vez 4C sirva imágenes de verdad; (2) huérfanos: `remove()` sigue sin llamarse; (3) deuda del guardián de puertos |
| LOW | 3 | TOCTOU en la reserva de disco; `privateStorage.resolve()` valida por prefijo textual (heredado de master); las tres comprobaciones de contención comparten la implementación de `isContainedIn` |

```
UNRELATED_CHANGES_FOUND: ninguno
SECRETS_FOUND:           ninguno (4 literales, todos fixtures sintéticos de test)
MASTER_MODIFIED:          NO
PRODUCTION_DATA_MODIFIED: NO
RAILWAY_MODIFIED:         NO
PUSH_PERFORMED:           NO
DEPLOY_PERFORMED:         NO
```

---

## 16. Veredicto

```
PHASE_2B_2_4B_CERTIFIED: YES
READY_FOR_PHASE_2B_2_4C: YES
```

El único punto que 4C debe resolver **antes de servir imágenes de verdad** es el techo de 1.200/min junto con la política de caché. Hoy no afecta a nadie porque el endpoint no tiene consumidores.

---

## Apéndice — Plan de 4C (diseñado, no implementado)

**Phase 2B-2-4C — productor y compatibilidad**

1. Convertir la data URL ya validada a binario y guardarla con `saveBuffer`
2. **Archivo primero, base después**, con `remove()` de compensación si la escritura en base falla
3. Persistir `imageRef { id, mimeType }` + `imageStorageKey`; dejar de persistir base64 nuevo
4. Aplicar a los dos canales: `POST /api/support/messages` y el handler de socket
5. Frontend: obtener el medio por el endpoint autenticado, con la propiedad de los object URLs que ya exige 2B-2-3
6. Compatibilidad: los mensajes antiguos con `image` deben seguir mostrándose — el cliente lee `imageRef` si existe y `image` si no
7. Ciclo de vida, para que `remove()` deje de ser código muerto
8. **Resolver el techo de 1.200/min y la política de caché** (sección 5)

**Phase 2B-2-4D — migración histórica**, en checkpoint independiente: idempotente, con checkpoint, tolerante a interrupción y a disco lleno, con rollback. Requiere las métricas.
