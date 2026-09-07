# Fase 3A — Retención de datos y clasificación de rutas

Estado al cierre de la fase 3A:

- **Parte 1, retención y poda: SIN IMPLEMENTAR.** Es diseño, no código. Implica
  borrado de datos y depende de tres decisiones de negocio que no me
  corresponden. Nada de esta sección está en la rama.
- **Parte 2, limitadores HTTP: IMPLEMENTADOS.** La clasificación se hizo
  primero, se acordó, y los limitadores de nivel 2 y 3 se aplicaron al cierre
  de la fase. El detalle de lo aplicado está en el anexo del final.

Rama `stabilization/phase-3a-incremental-persistence`, base `4a9d6e7`.

---

## Parte 1 — Política de retención y poda

### El problema, con números

El volumen de Railway son 500 MB en total, compartidos entre la base SQLite,
`UPLOAD_DIR` y el futuro directorio de adjuntos de chat. Hoy no existe ninguna
poda: todas las colecciones crecen sin techo.

Medido con datos sintéticos sobre el esquema real:

| Volumen acumulado | Tamaño de la base |
|---|---|
| 500 viajes, 0 imágenes | 0,4 MB |
| 5 000 viajes, 20 imágenes | 22 MB |
| 20 000 viajes, 100 imágenes | 107 MB |
| 50 000 viajes, 300 imágenes | 317 MB |

Lo que domina no es el número de viajes sino **las imágenes en base64 dentro
de los registros**: 300 adjuntos son unos 300 MB de los 317. Sacarlas de
SQLite —fase 2B-2-4, pendiente de auditoría externa— reduce el problema en un
orden de magnitud y debería ir **antes** que cualquier poda. Podar primero
sería borrar historial para ganar el espacio que las imágenes malgastan.

### Principio de diseño

Una poda mal hecha es peor que no tener poda: destruye pruebas de disputas,
registros financieros y rastro de auditoría, y no se puede deshacer. La
política se organiza por **clase de dato**, no por antigüedad uniforme.

### Clasificación por clase de dato

| Colección | Naturaleza | Propuesta | Riesgo de borrar |
|---|---|---|---|
| `notifications` | Efímera, se regenera | Podar > 90 días | **Ninguno** |
| `messages` (chat de viaje) | Prueba de disputa | Conservar mientras el viaje se conserve | Medio |
| `supportMessages` | Prueba de disputa | Conservar 24 meses | Medio |
| `trips` | Registro operativo y financiero | **No podar sin decisión de negocio** | Alto |
| `transactions` | Registro financiero | **No podar**; posible obligación contable | Muy alto |
| `adminActions` | Rastro de auditoría | **No podar**; es lo que permite investigar | Muy alto |
| `driverApplications` rechazadas | Datos personales que ya no hacen falta | Podar > 12 meses | Bajo, y **conservarlas es el riesgo** |
| `driverDocuments` de solicitudes rechazadas | Cédula, licencia, RCV | Podar > 12 meses | Bajo, y conservarlos es el riesgo |
| `users` | Cuentas | No podar; a lo sumo anonimizar bajas | Alto |
| `settings` | Configuración | No podar | — |

Nótese que en dos casos la conservación es el riesgo, no el borrado: guardar
indefinidamente la cédula y la licencia de alguien cuya solicitud se rechazó
hace un año es exposición sin contrapartida.

### Mecánica propuesta

1. **Modo simulación obligatorio.** Toda poda arranca con `--dry-run`, que
   informa de cuántos registros y cuántos megabytes tocaría, sin escribir.
2. **Exportar antes de borrar.** Lo que se pode sale a un archivo JSON en el
   volumen, con su fecha, antes de desaparecer de la base. Si la política se
   revela equivocada, se puede reimportar.
3. **Lotes acotados.** Nunca más de N registros por ejecución, para no repetir
   el error del que ya venimos: bloquear el bucle de eventos síncronamente.
4. **Fuera del camino de las peticiones.** Ejecución programada, no disparada
   por tráfico.
5. **Reversible por configuración.** Cada clase con su propia variable de
   entorno y su propio plazo; desactivada por omisión.

### Qué hace falta decidir antes de implementar

Tres preguntas que no me corresponde responder:

- **¿Hay obligación contable venezolana** sobre `transactions` y `trips`? El
  plazo legal manda por encima de cualquier consideración de espacio.
- **¿Cuánto tiempo se quiere poder investigar una disputa** de un viaje? De
  ahí sale el plazo de `messages` y `supportMessages`.
- **¿Se acepta el orden propuesto**, es decir, sacar las imágenes de SQLite
  (fase 2B-2-4) antes de podar nada?

---

## Parte 2 — Clasificación de las rutas HTTP por riesgo

> Esta sección describe el **estado previo** y la clasificación con la que se
> decidió qué limitar. Lo efectivamente aplicado está en el anexo final.

Inventario construido leyendo el código, no de memoria: 54 rutas, de las que
**44 no tenían ningún limitador**. Los dos que existían cubrían `/api/auth` y
`/api/driver-applications`.

**Corrección importante:** el router de solicitudes se monta en `/api`, no en
`/api/driver-applications`. Por tanto `/api/admin/driver-applications`,
`/api/admin/actions` y `/api/driver-documents/:id/content` **no** estaban
cubiertos por el limitador que aparentaban tener. Ya lo están.

### Nivel 1 — Anónimas (sin sesión)

Son las únicas alcanzables sin credenciales, y por eso las de mayor riesgo.

| Ruta | Limitador | Coste | Observación |
|---|---|---|---|
| `POST /api/auth/login` | 30/15min | **bcrypt** | Cada intento es un hash deliberadamente caro |
| `POST /api/auth/register` | 30/15min | escritura | Crea cuentas |
| `POST /api/driver-applications` | 20/15min | **subida de archivo** | Acepta ficheros sin sesión |
| `GET /api/health` | — | ninguno | Trivial; el límite estorbaría más que ayudar |

Las tres primeras ya estaban limitadas, y siguen igual: cuentan por dirección,
que es lo que corresponde sin sesión. Su límite **solo empezó a funcionar de
verdad con la corrección de `trust proxy`** de esta misma fase: antes era un
cupo global compartido por todo el planeta.

### Nivel 2 — Coste desproporcionado respecto al esfuerzo del atacante

Autenticadas, pero una petición barata provoca trabajo caro en el servidor.
**Es donde recomiendo actuar primero.**

| Ruta | Acceso | Por qué |
|---|---|---|
| `GET /api/trips` | admin | Devolvía la colección **entera sin paginar**; paginado y filtrado al cierre de la fase, igual que `/users` y `/support/threads` |
| `GET /api/admin/finance` | admin | Agrega sobre todas las transacciones y viajes |
| `GET /api/admin/overview` | admin | Recorre viajes y usuarios en cada llamada |
| `GET /api/drivers/nearby` | sesión | Recorre conductores y calcula distancias por petición |
| `GET /api/users/:id/photo` | sesión | Lee de disco en cada petición |
| `GET /api/driver-documents/:id/content` | sesión | Lee de disco; **aparentaba estar limitada y no lo estaba** |
| `POST /api/auth/me/photo` | sesión | Subida y escritura de imagen |
| `PUT /api/driver-applications/me/documents/:type` | sesión | Subida de documento |

### Nivel 3 — Escritura de estado

Autenticadas y con autorización correcta; el riesgo es de volumen, no de
acceso. Un límite generoso basta.

`POST /api/support/messages`, `POST /api/wallet/topups`,
`POST /api/wallet/payouts`, `POST /api/trips/create`,
`POST /api/trips/scheduled`, `POST /api/trips/scheduled/:id/claim`,
`PATCH /api/drivers/status`, `PATCH /api/drivers/location`,
`PATCH /api/notifications/*`, `POST /api/admin/broadcasts`,
`POST /api/admin/drivers` (bcrypt), `DELETE /api/admin/drivers/:id`,
`PATCH /api/admin/*`.

### Nivel 4 — Lectura acotada

Ya paginadas o intrínsecamente pequeñas. No necesitan limitador propio.

`GET /api/users` (paginado en esta fase), `GET /api/support/threads` y
`/:userId/messages` (paginados en esta fase), `GET /api/auth/me`,
`GET /api/wallet/me`, `GET /api/pricing/config`, `GET /api/trips/:id`,
`GET /api/trips/active/me`, `GET /api/health`.

### Recomendación — aplicada

No poner un limitador global por IP. Dos razones concretas:

1. **Los móviles venezolanos comparten IP por NAT de operador.** Un límite por
   dirección castigaría a decenas de personas legítimas a la vez.
2. Las rutas del nivel 4 no lo necesitan, y añadir fricción donde no hace
   falta se paga en experiencia sin ganar nada.

En su lugar, limitadores **por ruta y por identidad** —clave de sesión cuando
la hay, dirección solo cuando no— aplicados al nivel 2 primero y al nivel 3
después, con topes calculados sobre el uso real de cada una.

**Esto es exactamente lo que se implementó.** Ver el anexo.

---

## Anexo — Estado tras aplicar los limitadores

Lo que quedó efectivamente aplicado en la rama al cierre de la fase 3A.
La parte 1 de este documento, retención y poda, **no** forma parte de ello.

### Limitadores aplicados: 33 rutas

Ninguno es global por IP. Se cuenta **por cuenta** cuando hay sesión, y solo
por dirección en las rutas anónimas. Las IPv6 se agrupan por prefijo /64.

| Limitador | Tope | Rutas |
|---|---|---|
| `listados` | 240/min | `GET /api/trips` |
| `resumenes` | 240/min | `GET /api/admin/overview`, `GET /api/trips/summary` |
| `finanzas` | 60/min | `GET /api/admin/finance` |
| `cercania` | 180/min | `GET /api/drivers/nearby` |
| `archivos` | 180/min | `GET /api/users/:id/photo` |
| `documentos` | 120/min | `GET /api/driver-documents/:id/content` |
| `expedientes` | 240/min | `GET/PATCH` de solicitudes y `GET /api/admin/actions` (5 rutas) |
| `subidas` | 30–40/15min | `POST /api/auth/me/photo`, `PUT …/me/documents/:type` |
| `mensajes` | 60/min | `POST /api/support/messages` |
| `viajes` | 60/min | crear, programar, reclamar y cancelar programado (4 rutas) |
| `telemetria` | 120/min | `PATCH /api/drivers/status`, `PATCH /api/drivers/location` |
| `notificaciones` | 120/min | `PATCH /api/notifications/*` (2 rutas) |
| `cartera` | 20/15min | `POST /api/wallet/topups`, `POST /api/wallet/payouts` |
| `administracion` | 300/15min | altas, bajas y modificaciones de administración (7 rutas) |
| `difusion` | 10/15min | `POST /api/admin/broadcasts` |

Los dos limitadores anteriores (`/api/auth` y `/api/driver-applications`) se
conservan intactos: cubren rutas anónimas y cuentan por dirección, que es lo
que corresponde ahí.

### Corrección incluida

El router de solicitudes se monta en `/api`, así que
`/api/admin/driver-applications`, `/api/admin/actions` y
`/api/driver-documents/:id/content` **no** estaban cubiertos por el limitador
de `/api/driver-applications` pese a aparentarlo. Ahora tienen el suyo.

### Nivel 4: sin limitador propio, y con motivo

`GET /api/users` y `GET /api/support/threads` quedaron paginados en esta misma
fase, con tope máximo de página y filtrado en servidor. Una petición cuesta lo
mismo la pida quien la pida, así que un limitador propio añadiría fricción sin
comprar nada.
