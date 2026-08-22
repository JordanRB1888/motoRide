# DATABASE-1: SQLite → Supabase PostgreSQL

## Alcance y arquitectura

Supabase se usa únicamente como PostgreSQL administrado. La autenticación sigue siendo la implementación existente (`bcrypt`, JWT, `requireAuth`, roles, estados y aprobación de conductores). No se usan Supabase Auth, Realtime, Storage, Edge Functions ni el Data API.

El backend conserva sus colecciones y lógica actuales. La selección ocurre en una sola frontera:

```text
business logic → databaseBackend → SQLite (desarrollo/tests) | PostgreSQL (DATABASE_URL)
```

La forma histórica `id + payload JSON` pasa a `id + payload JSONB`. PostgreSQL añade columnas generadas, foreign keys, unicidad normalizada de email/teléfono, constraints e índices sin cambiar los IDs ni el contrato visible. Las tablas tienen RLS habilitado y se revoca acceso a `anon`/`authenticated`; solo el backend custom accede con la connection string.

## Inventario SQLite auditado

- Archivo predeterminado: `server/data/plus58express.sqlite`; configurable con `DATA_FILE`.
- Inicialización anterior: `server/index.js`; ahora encapsulada en `server/services/databaseBackend.js`.
- Tablas: `users`, `trips`, `notifications`, `messages`, `supportMessages`, `settings`, `transactions`, `driverApplications`, `driverDocuments`, `adminActions` y `schemaMigrations`.
- Esquema histórico: `id TEXT PRIMARY KEY, payload TEXT NOT NULL`; no había foreign keys entre colecciones ni índices de dominio.
- Migración SQLite existente: `server/migrations/001_real_identity_and_driver_applications.sql`.
- Persistencia: `server/services/databasePersistence.js`; diff incremental y transacciones `BEGIN IMMEDIATE`.
- Dependencias SQLite: `node:sqlite`, `DatabaseSync`, `PRAGMA journal_mode=WAL`, placeholders `?`, tablas camelCase y `DATA_FILE`.
- Tests: crean SQLite temporal mediante `DATA_FILE`; el fallback se conserva exclusivamente para desarrollo/tests durante DATABASE-1.
- Estado en memoria: el servidor carga todas las colecciones al arrancar. Esto limita el despliegue productivo a una instancia hasta migrar la lectura/escritura de negocio a repositorios transaccionales por operación.

## Variables

- `DATABASE_URL`: activa PostgreSQL. Nunca debe guardarse en Git.
- `DATABASE_SSL=require`: valida el certificado TLS. `no-verify` existe solo para diagnóstico controlado.
- `DATABASE_POOL_MAX=10`: máximo del pool de `pg`; ajustar según el compute de Supabase y réplicas Railway.
- Sin `DATABASE_URL`: SQLite mediante `DATA_FILE`, solo desarrollo/tests y rollback temporal.

Para Railway, usar la conexión directa si el contenedor tiene IPv6 o el add-on IPv4. Si Railway no llega por IPv6, usar **Supavisor Session pooler, puerto 5432**, porque es un backend persistente. Transaction pooler (6543) se reserva para clientes transitorios/serverless y no es la opción predeterminada aquí. Para migraciones y verificaciones usar direct o Session, nunca una URL de producción en tests.

## Migraciones

```bash
cd server
DATABASE_URL="..." DATABASE_SSL=require npm run db:migrate
```

Las migraciones viven en `supabase/migrations/` y parten de una base vacía. El runner usa una transacción por archivo, tabla de historial y advisory lock.

## Base de test segura

Crear un proyecto/base PostgreSQL independiente o un schema efímero con credenciales exclusivas de CI. Definir `TEST_DATABASE_URL`; nunca reutilizar `DATABASE_URL` de producción. Aplicar migraciones, ejecutar tests/integración y destruir el proyecto/schema al finalizar. Los tests SQLite actuales continúan usando archivos temporales.

## Migrar SQLite

Preflight sin escritura ni conexión PostgreSQL:

```bash
cd server
npm run db:import:dry-run -- --sqlite /ruta/plus58express.sqlite
```

Dry-run comparando también el destino:

```bash
DATABASE_URL="..." DATABASE_SSL=require npm run db:import:dry-run -- --sqlite /ruta/plus58express.sqlite
```

Importación real, solo con autorización y contra el destino verificado:

```bash
DATABASE_URL="..." DATABASE_SSL=require npm run db:import -- --sqlite /ruta/plus58express.sqlite
DATABASE_URL="..." DATABASE_SSL=require npm run db:verify -- --sqlite /ruta/plus58express.sqlite
```

La importación preserva IDs, ordena por dependencias, difiere foreign keys, usa una transacción global, aborta ante conflictos y reporta `sqlite`, `postgres`, `inserted`, `skipped`, `failed` por tabla. La verificación compara recuentos, IDs, huérfanos y agregados relevantes.

## Cutover (requiere aprobación)

1. Confirmar backup recuperable del archivo SQLite, WAL, uploads privados y versión de aplicación.
2. Activar maintenance/write freeze.
3. Copiar SQLite de forma consistente y calcular hash/tamaño.
4. Aplicar migraciones en PostgreSQL vacío.
5. Ejecutar dry-run y resolver duplicados/huérfanos.
6. Importar la copia SQLite en una transacción.
7. Ejecutar verificación; exigir cero diferencias y cero huérfanos.
8. Configurar `DATABASE_URL`, `DATABASE_SSL=require` y pool en Railway.
9. Deploy controlado, una sola réplica.
10. Health check y logs de conexión.
11. Smoke tests: auth, pasajero, conductor, admin, creación/aceptación de viaje, wallet y chat.
12. Monitorizar errores, latencia, conexiones y constraints.
13. Retirar maintenance solo tras aprobación de los smoke tests.

`ROLLBACK_TRIGGER`: fallo de arranque/conexión, diferencias de integridad, auth/login roto, escritura fallida, viaje imposible, wallet inconsistente o error crítico sostenido durante la ventana de observación.

`ROLLBACK_STEPS`:

1. Reaplicar maintenance/write freeze inmediatamente.
2. Detener la versión PostgreSQL antes de aceptar más escrituras.
3. Conservar PostgreSQL para análisis; no intentar dual-write ni merge automático.
4. Restaurar la release anterior y retirar `DATABASE_URL` para volver al SQLite respaldado.
5. Verificar hash/consistencia de SQLite y montar el volumen original.
6. Deploy de rollback con una sola réplica.
7. Ejecutar health y smokes de auth, roles, viajes, wallet y chat.
8. Reabrir tráfico y documentar las escrituras realizadas durante la ventana para reconciliación manual antes de otro cutover.

## Límites conocidos antes del cutover

- No se ejecutó contra Supabase ni producción durante DATABASE-1.
- La suite PostgreSQL real exige `TEST_DATABASE_URL`, que no debe ser una base productiva.
- La aceptación inmediata de viajes usa un `UPDATE` condicional PostgreSQL, pero el estado general continúa en memoria. Producción debe arrancar inicialmente con una sola réplica; escalar horizontalmente requiere completar repositorios transaccionales por operación.
- SQLite no se borra y no existe dual-write.
