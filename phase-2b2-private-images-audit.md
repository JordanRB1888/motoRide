# Fase 2B-2 — Auditoría de fotografías e imágenes privadas

**Ámbito auditado:** `master` = `origin/master` = `3cfe2ba5aba969c6ee6b2109750af40b9caa8498`
**Naturaleza:** solo lectura. Sin cambios de código, sin commits, sin fusiones, sin push, sin despliegue.
**Fecha:** 2026-08-14

No se abrió ni se reprodujo ninguna imagen, documento, credencial o dato personal real. Todo lo citado procede del código fuente y de metadatos.

---

## 1. Inventario de imágenes

La aplicación maneja **cinco** canales de imagen, con niveles de protección muy desiguales.

| # | Canal | Origen | Almacenamiento | Transporte | Protección actual |
|---|---|---|---|---|---|
| A | Foto de perfil | `POST /api/auth/me/photo` | Disco privado, fuera del árbol servido | `GET /api/users/:id/photo` | **Ninguna: ruta pública** |
| B | Documentos de conductor | `POST /api/driver-applications` | Disco privado | `GET /api/driver-documents/:id/content` | Correcta (fase 2B-1) |
| C | Selfie promovida a foto de perfil | Aprobación de solicitud | Copia en disco privado | Igual que A | Hereda el fallo de A |
| D | Imágenes de chat de viaje | Socket.IO `chat:message` | **base64 dentro de SQLite** | Payload del evento | Autorizada por sala, pero incrustada |
| E | Imágenes de soporte | `POST /api/support/messages` | **base64 dentro de SQLite** | HTTP + Socket.IO | Autorizada, pero incrustada |
| F | Imágenes de vehículo | Estáticas del repositorio | `public/vehicles/*.png` | Ruta pública | Correcta: no son datos personales |
| G | Avatares de terceros | `api.dicebear.com` | Externo | `<img src>` directo | **Fuga a un tercero** |

No existen comprobantes de pago como archivo: los pagos móviles se registran con referencia textual. La única vía por la que un comprobante llega al sistema es como imagen de soporte (canal E).

---

## 2. Ciclo de vida por canal

### A — Foto de perfil

| Etapa | Ubicación | Estado |
|---|---|---|
| Entrada | `server/index.js:636-640` | `multer` en memoria, 5 MB, 1 archivo, MIME limitado a jpeg/png/webp |
| Validación | `server/services/privateStorage.js:12-19` | **Firma binaria real** verificada; SVG imposible |
| Almacenamiento | `privateStorage.js:25-37` | Nombre `randomUUID()`, directorio por propietario, modo `0600`, raíz `0700` |
| Persistencia | `server/index.js:648-651` | Solo `photoStorageKey`, `photoMimeType`, `photoSize`, `photoUrl` en SQLite; el binario nunca entra en la base |
| Serialización | `server/index.js:230` | `publicUser()` elimina `photoStorageKey` por lista negra |
| Proyecciones | `server/domain/userProjections.js:31,49` | `photoUrl` incluido para pasajero y conductor |
| Eventos | `server/index.js:1141` | `trip.passengerAvatar = req.user.photoUrl` |
| Lectura | `server/index.js:657-667` | **Sin `requireAuth`** |
| Reemplazo | `server/index.js:647` | La foto anterior se borra del disco |
| Eliminación | — | No hay borrado al eliminar la cuenta |

### B — Documentos de conductor

Cerrado en la fase 2B-1: proyecciones de lista blanca, eventos mínimos, 404 uniforme, contenido bajo demanda por identificador, Blob URLs con dueño único. **No forma parte de 2B-2.**

### D y E — Imágenes de chat y soporte

| Etapa | Ubicación | Estado |
|---|---|---|
| Entrada | `src/pages/admin/adminSupport.js:38-45` | `FileReader.readAsDataURL` en el cliente |
| Límite cliente | `adminSupport.js:176` | 700 000 bytes |
| Validación servidor | `server/index.js:805` y `1622` | Regex `^data:image/(jpeg\|png\|webp);base64,[a-z0-9+/=]+$`, ≤ 1 000 000 caracteres |
| Almacenamiento | `server/index.js:808`, `1636` | **La cadena base64 completa se guarda en la fila de SQLite** |
| Transporte | `server/index.js:810`, `1638` | El data URL entero viaja en cada `support:message` y `chat:message` |
| Consumo | `src/components/chatModal.js:123-133` | `safeImageSrc()` propia, más permisiva que `safeDom` |
| Eliminación | — | Inexistente |

---

## 3. Hallazgos

### H-1 · CRÍTICO · Las fotos de perfil son públicas

`server/index.js:657`

```js
app.get('/api/users/:id/photo', (req, res) => {
```

No hay `requireAuth`, y no existe middleware global de autenticación sobre `/api` (`server/index.js:31-41`: solo `helmet`, `cors`, `express.json` y limitadores).

Cualquiera en Internet que conozca o adivine un `id` de usuario descarga su fotografía. La comparación con el canal ya corregido es directa: `/api/driver-documents/:id/content` exige sesión y devuelve 404 uniforme; `/api/users/:id/photo` no exige nada.

Agravantes:

1. **El identificador se filtra en cada viaje.** `passengerPublicProfile` y `driverPublicProfile` incluyen `id`, así que un conductor obtiene el `id` de todos sus pasajeros y viceversa. Un `id` obtenido en un viaje sirve para descargar esa foto indefinidamente, mucho después de terminado el viaje.
2. **El canal C empeora el impacto.** `server/routes/driverApplications.js:312` promueve la *selfie de verificación* del expediente a foto de perfil mediante `privateStorage.clone`. Una imagen recogida para verificar identidad queda accesible sin autenticación.
3. **`Cache-Control: private, max-age=300`** (`index.js:664`) es contradictorio: `private` no significa nada en una respuesta sin autenticar, y además permite 5 minutos de caché en el navegador y en cualquier intermediario que ignore la directiva.

El 404 sí es uniforme para «no existe» y «sin foto» (`index.js:659,661`), lo que evita enumerar quién tiene foto — pero es irrelevante mientras la descarga sea libre.

### H-2 · ALTO · `photoUrl` roto en producción, con degradación silenciosa

`server/index.js:651` genera `photoUrl = '/users/:id/photo'`, **sin el prefijo `/api`**.

`apiService.resolveUrl()` (`src/services/apiService.js:48`) antepone `baseUrl`, que ya termina en `/api`, así que el valor funciona *solo* si se pasa por `resolveUrl`. Pero la mayoría de las pantallas lo inyectan crudo:

```
src/pages/passenger/activeRide.js:32,90    src/components/chatModal.js:40
src/components/digitalReceiptModal.js:27,28    src/components/ratingTipModal.js:27
src/pages/admin/fleetMap.js:149    src/pages/admin/usersManagement.js:12
```

En producción, `<img src="/users/xxx/photo">` cae en el rewrite SPA de `vercel.json` y recibe **HTML con estado 200**. La imagen no carga y no hay error visible.

Solo dos pantallas lo hacen bien: `src/pages/passenger/profile.js:18` y `src/pages/driver/driverProfile.js:21`.

Esto es relevante para 2B-2 porque **la corrección de H-1 debe hacerse junto con esta**: si se limita el acceso sin arreglar la ruta, las fotos seguirán sin verse y el fallo parecerá causado por la restricción.

### H-3 · ALTO · Fuga de nombres reales a `api.dicebear.com`

14 llamadas en `src/`, todas con la forma:

```js
`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(driver?.firstName)}`
```

Archivos: `chatModal.js:40`, `driverRatingModal.js:20`, `ratingTipModal.js:27`, `fleetMap.js:149`, `activeTrip.js:12`, `driverApp.js:33,432,569`, `driverProfile.js:21`, `incomingRide.js:16`, `activeRide.js:32,90`, `passengerApp.js:811`, `profile.js`.

Cada vez que no hay foto, el navegador del usuario hace una petición a un tercero llevando **el nombre real** de un conductor o pasajero en la query string, junto con `Referer` e IP. Dicebear obtiene así un grafo parcial de quién viaja con quién.

Es además la única dependencia externa en tiempo de ejecución de toda la aplicación, y un punto de fallo ajeno.

### H-4 · MEDIO · Imágenes base64 incrustadas en la base de datos y en cada evento

`server/index.js:805-810` y `1622-1638`.

Una imagen de hasta 1 000 000 caracteres se guarda como texto dentro del payload JSON de la fila y se retransmite entera en cada evento Socket.IO.

Consecuencias:

- **Volumen.** `GET /api/support/messages` (`index.js:792`) devuelve *todos* los mensajes al administrador, con todas sus imágenes. Un hilo con 50 comprobantes son ~37 MB en una sola respuesta.
- **Sin control de acceso por imagen.** La autorización es del hilo completo; no existe un identificador por imagen que permita pedirla bajo demanda, como sí se hizo con los documentos en 2B-1.
- **Imposible de revocar o expirar.** Una imagen enviada por error queda en la fila para siempre; no hay borrado ni reemplazo.
- **Entra en cualquier volcado.** Un `SELECT` de diagnóstico, una copia de seguridad o un log de payload arrastran el contenido de la imagen.
- **Sin verificación de firma.** A diferencia del canal A, aquí solo se comprueba el prefijo del data URL. `data:image/png;base64,<carga arbitraria>` pasa el filtro: el regex valida el alfabeto base64, no que el contenido decodificado sea un PNG.

Límites: `express.json({ limit: '1mb' })` (`index.js:38`) es 1 048 576 bytes, y el tope de imagen son 1 000 000 caracteres. El margen para el resto del cuerpo es de ~48 KB. Un mensaje con imagen grande y texto largo puede fallar con 413 sin mensaje útil.

### H-5 · MEDIO · `safeImageSrc` de `chatModal` acepta SVG arbitrario

`src/components/chatModal.js:123-133` implementa su propia validación, más laxa que `safeDom.safeImageUrl`:

```js
if (/^data:image\/svg\+xml(;charset=utf-8)?,/i.test(value)) return value;
```

`safeDom.js:43` excluye SVG deliberadamente (`DATA_IMAGE_PATTERN` solo admite png/jpe?g/gif/webp). `chatModal` lo readmite.

Mitigación actual: el servidor rechaza SVG en ambos puntos de entrada (`index.js:805`, `1622`), y un SVG en `<img src>` no ejecuta script en navegadores actuales. El riesgo es **latente**: la función existe para un recibo de ejemplo generado localmente (`createSampleReceipt`, línea 136), y basta con que alguien amplíe el regex del servidor, o que ese valor pase a un `<object>`, `<iframe>` o `window.open`, para convertirlo en XSS almacenado.

Existiendo ya `safeDom.safeImageUrl` con la política correcta, tener una segunda implementación divergente es el problema de fondo.

### H-6 · MEDIO · Object URLs de foto sin revocar

| Ubicación | Estado |
|---|---|
| `src/pages/passenger/profile.js:20` | Revoca la anterior al hidratar. **Correcto** |
| `src/pages/passenger/profile.js:92` | `createObjectURL(file)` de vista previa: **nunca se revoca** |
| `src/pages/driver/driverProfile.js:284` | `createObjectURL(file)`: **nunca se revoca** |
| `src/components/driverRegistrationModal.js:36,136,167` | Revoca correctamente |
| `src/pages/admin/privateDocumentViewer.js` | Ciclo completo (fase 2B-1) |

Además, ninguna de las dos pantallas de perfil revoca `privateAvatarUrl` al desmontarse: `clearApp()` (`src/main.js:61`) solo cierra el visor de documentos. La foto de perfil sobrevive en memoria tras cerrar sesión.

### H-7 · BAJO · Sin eliminación ni retención

No existe borrado de fotos ni de imágenes de chat al eliminar una cuenta, rechazar una solicitud o cerrar un hilo de soporte. `privateStorage.remove` solo se usa al reemplazar una foto (`index.js:647`).

*(Nota: en 2B-1 se estableció explícitamente no implementar retención automática. Se registra como hallazgo pendiente de decisión, no como corrección propuesta para 2B-2.)*

### Lo que está bien y no debe tocarse

- `privateStorage` (`server/services/privateStorage.js`): validación de firma binaria, sin SVG, nombres `randomUUID()`, permisos `0600`/`0700`, guarda contra path traversal en `resolve()` (línea 41). Es el modelo correcto.
- Service Worker (`public/sw.js:68`): `/api` queda fuera de toda caché; las imágenes cacheables se restringen a `/vehicles/`, `/icons/` y un único segmento en la raíz (líneas 24-27). **Las fotos privadas no se cachean.** Ninguna acción necesaria.
- `X-Content-Type-Options: nosniff` presente en la ruta de foto (`index.js:665`).
- Imágenes de vehículo (`src/utils/vehicleMedia.js`): estáticas, genéricas por tipo, sin datos personales.
- El binario de las fotos nunca entra en SQLite.

---

## 4. Matriz

| ID | Archivo:línea | Tipo | Productor | Consumidores | Roles autorizados hoy | Exposición | Sev. | Corrección | Pruebas |
|---|---|---|---|---|---|---|---|---|---|
| H-1 | `server/index.js:657` | Foto perfil | Titular | Todas las pantallas | **Cualquiera, sin sesión** | Descarga libre con el `id` | **Crítica** | `requireAuth` + regla de visibilidad + 404 uniforme + `no-store` | Sin sesión → 401; ajeno sin relación → 404; conductor/pasajero en viaje activo → 200; admin → 200; tras finalizar el viaje → 404 |
| H-2 | `server/index.js:651` | Foto perfil | Backend | 8 pantallas | — | Imagen rota; HTML 200 en su lugar | Alta | Emitir `/api/users/:id/photo`, o forzar `resolveUrl` en todo consumo | El valor emitido empieza por `/api/`; ninguna pantalla inyecta `photoUrl` crudo |
| H-3 | 14 puntos en `src/` | Avatar | Frontend | Todas | — | Nombre real + IP a un tercero | Alta | Avatar local con iniciales | Cero peticiones salientes a dominios externos en el bundle |
| H-4 | `server/index.js:805,1622` | Chat/soporte | Usuario/admin | Hilo y admin | Participantes | base64 en BD, en cada evento y en el listado completo | Media | Identificador por imagen + descarga bajo demanda, como 2B-1 | El listado no contiene `data:image`; el contenido exige sesión y pertenencia |
| H-5 | `src/components/chatModal.js:123` | Chat | Frontend | Chat | — | SVG admitido en cliente | Media | Sustituir por `safeDom.safeImageUrl` | `data:image/svg+xml` rechazado; png/jpeg/webp aceptados |
| H-6 | `profile.js:92`, `driverProfile.js:284` | Foto perfil | Frontend | Perfil | Titular | Blob URL viva tras cerrar sesión | Media | Revocar al reemplazar y al desmontar | Cerrar sesión revoca toda Blob URL de foto |
| H-7 | — | Todos | — | — | — | Sin borrado | Baja | Decisión del propietario | — |

---

## 5. División propuesta para la implementación

### 2B-2-1 — Cerrar el acceso a las fotos de perfil *(primero, y solo esto)*

Resuelve **H-1 + H-2 juntos**, porque separarlos rompe la interfaz.

1. `requireAuth` en `GET /api/users/:id/photo`.
2. Regla de visibilidad explícita: el titular siempre; administración siempre; contraparte de un viaje **activo**; nadie más.
3. 404 uniforme para «no existe», «sin foto» y «sin autorización» — el mismo criterio ya aprobado para los documentos.
4. `Cache-Control: private, no-store, max-age=0` en lugar de `max-age=300`.
5. Corregir `photoUrl` a `/api/users/:id/photo` y adaptar los 8 puntos de consumo crudo.

Riesgo asumido y que conviene decidir de antemano: las fotos dejarán de verse en listados administrativos donde no haya viaje activo, y en pantallas históricas como el recibo digital. Es el comportamiento correcto, pero es un cambio visible.

### 2B-2-2 — Eliminar la dependencia de Dicebear

H-3. Aislado, sin efectos sobre el backend: un avatar local con iniciales sustituye las 14 llamadas. Verificable comprobando que el bundle no contiene ningún dominio externo.

### 2B-2-3 — Higiene del cliente

H-5 y H-6: unificar en `safeDom.safeImageUrl` y cerrar el ciclo de las Blob URLs de foto. Cambios pequeños y de bajo riesgo.

### 2B-2-4 — Migrar las imágenes de chat y soporte fuera de la base *(fase posterior)*

H-4. Es el cambio de mayor alcance: toca el esquema, la API, los eventos, el frontend y exige migrar los datos existentes. Debe ir **después** de que 2B-2-1 esté desplegado y estable, y merece su propia auditoría.

### Fuera de alcance

- Retención y borrado (H-7): decisión del propietario, no técnica.
- Documentos de conductor: cerrados en 2B-1.
- Sentry y trabajo visual: fuera de `master`, no auditados.
- Imágenes de vehículo: estáticas y sin datos personales.

---

## 6. Recomendación

Empezar **solo** por 2B-2-1. Es el único hallazgo explotable hoy sin ninguna credencial: basta un `id` de usuario, que cualquier contraparte de viaje ya posee. Los canales D y E, con ser incómodos, exigen sesión válida y pertenencia al hilo.

Que la selfie de verificación de identidad acabe publicada en una ruta abierta es, en la práctica, el mismo fallo que se corrigió para los documentos en 2B-1 — solo que por otra puerta.
