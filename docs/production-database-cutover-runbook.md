# DATABASE-3 — production SQLite → Supabase PostgreSQL cutover runbook

This runbook is preparation only. Do not execute the cutover until the user writes exactly `APPROVE_PRODUCTION_DATABASE_CUTOVER`.

## Fixed identities and gates

- Railway project: `+58express` (`2b4ccff9-805e-404a-81e7-38f03939ec61`)
- Environment: `production` (`4e546075-3a22-4390-95aa-6c689ccedf47`)
- Service: `motoRide` (`71f0cf6f-5d25-46fe-9d4e-c6a8bbd101f5`)
- Region and replicas: `ams=1`; keep exactly one replica.
- Volume: `motoride-volume`, mounted at `/data`; preserve it for SQLite, driver documents and chat media.
- SQLite: `/data/plus58express.sqlite` (`DATA_FILE`).
- Driver documents: `/data/private-uploads` unless `UPLOAD_DIR` overrides it.
- Chat media: `/data/chat-media` unless `CHAT_MEDIA_DIR` overrides it.
- Health: `https://motoride-production-4ce4.up.railway.app/api/health`.
- Known-good SQLite deployment: `2bc9781ae309d29ff4f8a5ef240a331aaeccb45e`.
- The Supabase project `qljsvainubfjeiyqlgll` is test-only and is forbidden by the preflight.

Hard gates: a separate production Supabase project, a production connection string, a fresh target, one Railway replica, mounted volume, readable SQLite/media, writable backup destination, clean preflight, and explicit approval.

## Connection strategy

Use `pg.Pool` with `DATABASE_SSL=require`. Prefer the Supabase direct connection on port 5432 if Railway can reach IPv6 (or the project has the IPv4 add-on). Otherwise use Supavisor **Session mode** on port 5432. Transaction mode on port 6543 is rejected for this persistent backend. Store the secret only as Railway `DATABASE_URL`; never in Git, logs, reports, Sentry or shell history.

## Write freeze and immutable backup

Estimated user-visible maintenance: 10–15 minutes for the current small database, with a 20-minute abort threshold.

1. Announce maintenance and prevent clients from starting new work.
2. Reconfirm `ams=1`.
3. Start the freeze by scaling the only instance to zero. Existing JWT sessions remain valid; sockets disconnect but no account/session data is destroyed. With the process stopped, no SQLite WAL writer remains.
4. Download `/data/plus58express.sqlite`, `/data/plus58express.sqlite-wal` and `/data/plus58express.sqlite-shm` if the sidecars exist, plus `/data/private-uploads` and `/data/chat-media`, into a new timestamped local directory. Never use overwrite.
5. Preserve the whole volume snapshot. The database migration source must be the stopped-state SQLite copy. Run `db:cutover:snapshot` on that copy to create a second immutable byte-for-byte file, SHA-256 and JSON row-count/preflight report.

Prepared snapshot command (run only after freeze, against the downloaded SQLite):

```powershell
$env:DATA_FILE='C:\cutover\source\plus58express.sqlite'
$env:CUTOVER_BACKUP_DIR='C:\cutover\immutable'
$env:WRITE_FREEZE_CONFIRMED='YES'
npm --prefix server run db:cutover:snapshot
```

Do not delete or overwrite the original volume file. Record `WRITE_FREEZE_START`, snapshot timestamp, bytes, SHA-256, per-table rows and exact backup path.

## Preflight and migration commands

Populate these values privately, using a direct or Session-mode production URI:

```powershell
$env:DATA_FILE='C:\cutover\immutable\plus58express-<timestamp>.sqlite'
$env:CUTOVER_BACKUP_DIR='C:\cutover\immutable'
$env:PRODUCTION_DATABASE_URL='<production-only-postgresql-uri-port-5432>'
$env:RAILWAY_REPLICAS='1'
$env:RAILWAY_VOLUME_MOUNT_PATH='C:\cutover\source'
$env:UPLOAD_DIR='C:\cutover\source\private-uploads'
$env:CHAT_MEDIA_DIR='C:\cutover\source\chat-media'
$env:HEALTH_URL='https://motoride-production-4ce4.up.railway.app/api/health'
npm --prefix server run db:cutover:preflight
```

Any failed check means `ABORT`. After a clean preflight, apply Git migrations to the fresh production target and import the immutable snapshot:

```powershell
$env:DATABASE_URL=$env:PRODUCTION_DATABASE_URL
$env:DATABASE_SSL='require'
npm --prefix server run db:migrate
npm --prefix server run db:import:dry-run -- --sqlite $env:DATA_FILE
npm --prefix server run db:import -- --sqlite $env:DATA_FILE
npm --prefix server run db:verify -- --sqlite $env:DATA_FILE
```

The importer preserves IDs/payload timestamps/relationships, runs one global transaction, defers FKs, aborts on conflicts and reports each table. Verification covers all ten physical tables (`users`, `trips`, `notifications`, `messages`, `support_messages`, `settings`, `transactions`, `driver_applications`, `driver_documents`, `admin_actions`), missing/extra IDs, payload/ID mismatches, every FK relationship and normalized email/phone duplicates. Required result: `ok=true` and `unexplainedDifferences=0`.

Run Supabase security and performance advisors after schema creation. Critical errors/warnings abort. `rls_enabled_no_policy` INFO is intentional because `anon`/`authenticated` have no grants and the custom backend owns auth. Newly-created unused-index INFO is expected; missing-FK-index notices are not.

## Railway switch and deployment sequence

Do not remove `DATA_FILE` or detach `/data`. Configure only at the authorized gate:

- `DATABASE_URL=<production direct/session PostgreSQL URI>`
- `DATABASE_SSL=require`
- `DATABASE_POOL_MAX=10` initially
- retain `DATA_FILE=/data/plus58express.sqlite`

Order:

1. Announce maintenance; record `WRITE_FREEZE_START`.
2. Verify one replica and volume READY.
3. Scale to zero to freeze all writes.
4. Create/download the final SQLite + media backup, checksum and source preflight.
5. Apply production PostgreSQL schema from Git.
6. Import the immutable SQLite snapshot.
7. Require zero unexplained differences and clean advisors.
8. Set the three PostgreSQL Railway variables without printing values.
9. Deploy the exact validated commit, keeping `ams=1` and `/data` mounted.
10. Verify `/api/health`, database backend log and no connection errors.
11. Run auth, Passenger, Driver, Admin, Wallet, Chat and trip create/accept smokes.
12. Run restart persistence smoke.
13. End freeze only after every gate passes; record `WRITE_FREEZE_END`.
14. Observe intensively for at least 60 minutes, then heightened monitoring for 24 hours.

## Restart persistence smoke

Create a uniquely tagged support message or controlled admin notification through the API, query it back, restart/redeploy the same one-replica commit, authenticate again, and query the same ID. Also confirm the ID exists in PostgreSQL. Delete/close the controlled record through an approved path if the product supports it; otherwise mark it as an audit smoke. Failure to survive restart triggers rollback.

## Rollback

Triggers: migration/count mismatch, any missing/extra ID, auth failure, trip create/accept failure, wallet inconsistency, chat failure, crash loop, PostgreSQL connectivity/pool exhaustion, restart-persistence failure or critical regression.

1. Freeze writes immediately and scale the PostgreSQL-backed instance to zero.
2. Preserve PostgreSQL unchanged for analysis; do not dual-write or reconcile automatically.
3. Remove/restore the previous Railway database-variable configuration without deleting `DATA_FILE`.
4. Deploy known-good commit `2bc9781ae309d29ff4f8a5ef240a331aaeccb45e` with the untouched `/data` volume and exactly one replica.
5. Verify the original SQLite checksum/path, health, auth, Passenger, Driver, Admin, Wallet, Chat and trip smokes.
6. Reopen only after all rollback smokes pass. Record any writes accepted after the switch for manual incident analysis; SQLite remains the sole source of truth after rollback.

## Observation and retirement

Monitor PostgreSQL connection errors, active/pool connections, pool wait/exhaustion, query latency, HTTP 500 rate, auth failures, trip errors, wallet errors, chat errors, memory, CPU and Railway restarts. Keep SQLite and media backups read-only for the stabilization period. SQLite retirement is a separate, explicitly approved future phase; never delete it during cutover.
