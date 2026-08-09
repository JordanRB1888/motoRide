# Identidad real y solicitudes de conductores en +58Express

## Arquitectura resultante

- **Frontend:** Vite + JavaScript modular. La sesión guarda exclusivamente el usuario público y el JWT; `localStorage` ya no simula usuarios, solicitudes ni historiales.
- **Backend:** Express 5 + Socket.IO. Todas las decisiones sensibles se validan en el servidor.
- **Persistencia:** SQLite con WAL y migraciones versionadas. En Railway, la base de datos y los archivos privados deben residir en un volumen persistente montado en `/data`.
- **Contraseñas:** bcrypt, factor 12. Nunca forman parte de las respuestas de la API.
- **Sesiones:** JWT firmado, vigencia de siete días. En producción el servidor exige un secreto de al menos 32 caracteres.
- **Documentos:** archivos binarios privados en `UPLOAD_DIR`; SQLite guarda solo metadatos y la referencia interna. El contenido se entrega mediante una ruta autenticada al propietario o a administración, con `Cache-Control: private, no-store`.

## Colecciones persistentes

Las tablas usan un identificador y un payload JSON para preservar compatibilidad con la base existente:

- `users`
- `trips`
- `notifications`
- `messages`
- `supportMessages`
- `settings`
- `transactions`
- `driverApplications`
- `driverDocuments`
- `adminActions`
- `schemaMigrations`

La migración inicial está en `server/migrations/001_real_identity_and_driver_applications.sql` y se aplica automáticamente una sola vez al iniciar el backend.

## Flujo de autenticación

1. Un pasajero se registra mediante `POST /api/auth/register` con nombre, apellido, teléfono, correo y contraseña.
2. El backend valida duplicados, crea el hash y devuelve una sesión real.
3. `GET /api/auth/me` renueva los datos públicos al abrir la aplicación.
4. `PATCH /api/auth/me` y `POST /api/auth/me/photo` actualizan el perfil persistido.
5. El registro directo no permite crear cuentas `driver` o `admin`.

La infraestructura actual no incluye un proveedor SMS ni correo transaccional. Por eso `phoneVerified` y `emailVerified` quedan inicialmente en `false`; no se simula un OTP. Para activar verificación real debe integrarse un proveedor y sus credenciales sin cambiar el modelo de identidad existente.

## Solicitud de conductor

`POST /api/driver-applications` recibe `multipart/form-data` con cuatro bloques visuales: datos personales, vehículo, documentos y confirmación. Valida edad, correo, teléfono, placa, campos obligatorios, MIME, firma binaria y un máximo de 5 MB por archivo.

Estados soportados: `draft`, `pending`, `approved`, `rejected`, `needs_changes` y `suspended`. Una solicitud pendiente mantiene al usuario como pasajero y el backend rechaza su acceso operativo como conductor. Solo una aprobación administrativa cambia el rol a `driver` y habilita `isVerified`.

Rutas principales:

- `POST /api/driver-applications`
- `GET /api/driver-applications/me`
- `PUT /api/driver-applications/me/documents/:type`
- `POST /api/driver-applications/me/submit`
- `GET /api/admin/driver-applications`
- `GET /api/admin/driver-applications/:id`
- `PATCH /api/admin/driver-applications/:id/decision`
- `GET /api/driver-documents/:id/content`
- `GET /api/admin/actions`

Cada aprobación, rechazo, solicitud de cambios, suspensión o reactivación registra administrador, usuario, estado anterior, estado nuevo, razón y fecha. El usuario recibe una notificación persistente y un evento en tiempo real.

## Otras rutas reales conectadas

- Historial propio: `GET /api/trips/me/history`
- Crear carrera: `POST /api/trips/create`
- Carrera activa: `GET /api/trips/active/me`
- Reservar/cancelar: `POST /api/trips/scheduled`, `DELETE /api/trips/scheduled/:id`
- Billetera: `GET /api/wallet/me`, `POST /api/wallet/topups`, `POST /api/wallet/payouts`
- Decisión financiera: `PATCH /api/admin/transactions/:id`
- Notificaciones: `GET /api/notifications/me` y rutas de lectura

## Variables de entorno de producción

```env
NODE_ENV=production
CLIENT_ORIGIN=https://plus58express.vercel.app
JWT_SECRET=<secreto-aleatorio-de-32-o-mas-caracteres>
ADMIN_EMAIL=<correo-administrativo>
ADMIN_PASSWORD=<contraseña-inicial-segura>
DATA_FILE=/data/plus58express.sqlite
UPLOAD_DIR=/data/private-uploads
DISABLE_LEGACY_DEMO_USERS=true
```

Frontend:

```env
VITE_API_URL=https://<backend>/api
VITE_SOCKET_URL=https://<backend>
```

Antes de desplegar, montar un volumen Railway en `/data`. Si `UPLOAD_DIR` no se define, el backend crea `private-uploads` automáticamente junto al archivo indicado en `DATA_FILE`, por lo que ambos quedan en el mismo volumen persistente.

## Verificación

Ejecutar:

```powershell
npm --prefix server test
npm --prefix server run check
npm run build
```

Las pruebas cubren registro/login, duplicados, rechazo del registro directo como conductor, control de roles, GPS obligatorio, privacidad horizontal de documentos, correcciones y reenvío, auditoría, aprobación, ciclo completo de carrera, chat, tracking, historial, reservas, billetera, liquidación y calificaciones.
