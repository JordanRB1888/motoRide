# Tercer cutover de base de datos a PostgreSQL — runbook

Este runbook sustituye al del segundo intento en los dos puntos donde aquel
falló, y deja el resto igual porque el resto funcionó.

Lo que cambia:

1. **La puerta de reinicio ya no exige un identificador de despliegue nuevo.**
   Ese fue el único motivo real del `ROLLED_BACK` anterior.
2. **El importador ya no supone que PostgreSQL está vacío.** Ahora reemplaza
   dentro de una transacción en vez de fusionar.

---

## 0. Estado del que se parte

```
Rama canónica    integration/production-postgres-cutover
HEAD canónico    a8dbc908f12a1051a5d445728c2f267d7abdbfc6
Producción       Railway · +58express · production · motoRide
Fuente de verdad SQLite  (Railway no tiene DATABASE_URL)
Réplicas         1
Volumen          /data
```

---

## 1. PRE-FREEZE — sin corte de servicio

Nada de esta sección interrumpe a nadie. Toda ella debe pasar **antes** de
tocar el interruptor.

| # | Puerta | Cómo se comprueba |
|---|---|---|
| 1 | HEAD canónico | `git rev-parse` contra `a8dbc908…`, árbol limpio |
| 2 | Regresión | backend, frontend, enfocadas, build, `node --check`, `git diff --check` |
| 3 | Coordinador de credencial | PowerShell nuevo y dedicado, lee `HKCU\Environment.PRODUCTION_DATABASE_URL` **una sola vez** |
| 4 | Huella de credencial | truncada y estable durante todo el cutover; el secreto no se imprime jamás |
| 5 | **Autenticación 5432** | `select 1` contra el Session Pooler **antes** de cualquier corte |
| 6 | Estado de PostgreSQL | 10 tablas canónicas, 17 claves foráneas, migraciones esperadas, recuentos actuales |
| 7 | Simulación del importador | `replacePostgresFromSqlite({ isDryRun: true })` informa del destino sin tocarlo |
| 8 | Herramienta de reemplazo | `postgresReplacementImport.test.js` en verde |
| 9 | Vigilante de reinicio | `restartPersistenceWatcher.test.js` en verde |
| 10 | Destino de copias | `/data/cutover-backups/<sello>/` accesible |
| 11 | Transferencia de artefactos | ruta local inmutable preparada y con espacio |
| 12 | Comandos de reversión | escritos y revisados antes de empezar |

**Si la puerta 5 falla, el cutover no empieza.** Es exactamente la que hoy no
pasa: ver el informe de preflight.

---

## 2. DOWNTIME — solo esto

El objetivo es que la ventana contenga únicamente lo que no puede hacerse en
caliente. Todo lo demás ya está hecho.

1. **Congelación de escrituras.** Registrar `WRITE_FREEZE_AT`.
2. **Escritores activos = 0.** Verificado, no supuesto.
3. **Instantánea nueva e inmutable** de SQLite + WAL + SHM.
4. **Sumas de verificación** de los tres artefactos.
5. **Puerta de recuentos exactos** sobre la instantánea congelada.
6. **Reemplazo transaccional** en PostgreSQL:
   - `begin`
   - `set constraints all deferred`
   - vaciado de las 10 tablas canónicas en orden de hijas a raíces
   - inserción íntegra desde la instantánea, de padres a hijas
   - validación dentro de la transacción: recuentos, conjuntos de identificadores
   - `commit` solo si todo pasa; `rollback` ante cualquier error
7. **Validación posterior**: recuentos, identificadores, claves foráneas,
   huérfanos, correos y teléfonos normalizados, semántica de las cargas útiles.
8. **Cambio de `DATABASE_URL`** en Railway.
9. **Despliegue canónico.**
10. **Salud, autenticación, API y socket.**
11. **Persistencia tras reinicio** — ver sección 3.
12. **Reconciliación final.**

---

## 3. La puerta de reinicio, corregida

`server/scripts/restartPersistenceWatcher.js`

Se acepta el reinicio por dos caminos, y **ambos exigen la misma evidencia de
runtime**. El identificador solo decide cómo se demuestra que el proceso es
otro; nunca sustituye a la prueba.

```
CASO A   Railway emite un identificador de despliegue distinto.
CASO B   Railway conserva el identificador, pero hay prueba temporal
         inequívoca de un arranque posterior a la petición de reinicio.
```

En los dos casos hace falta, sin excepción:

- `RESTART_REQUESTED_AT` registrado;
- sello de arranque **estrictamente posterior** a esa marca;
- `[+58express Database] backend = postgres`;
- `/api/health` 200 **medido después** de ese arranque;
- PostgreSQL alcanzable;
- volumen `/data` montado;
- recuentos de PostgreSQL idénticos a los esperados;
- Socket.IO sano.

Lo que **no** basta:

- que la salud nunca dejara de responder 200 — el proceso viejo también
  responde 200;
- un log de arranque anterior a la petición de reinicio;
- un identificador nuevo sin el resto de la evidencia.

La puerta es cerrada por defecto: cualquier dato ausente o ilegible es `FAIL`.

---

## 4. El importador, corregido

`server/scripts/postgresReplacementImport.js`

El importador anterior era **aditivo** (`on conflict do nothing`) y abortaba con
`CONFLICTING_EXISTING_ROW` en cuanto una fila existente difería. Servía para un
destino vacío y ya no lo es: PostgreSQL conserva los datos del segundo intento
y SQLite ha seguido recibiendo escrituras.

Fusionar produciría tres defectos a la vez: filas cambiadas abortarían la
importación, filas borradas en SQLite sobrevivirían como fantasmas y filas
nuevas mezclarían dos épocas.

Por eso se reemplaza. Orden de vaciado, de hijas a raíces:

```
adminActions → driverDocuments → messages → supportMessages → notifications
→ transactions → trips → driverApplications → settings → users
```

La inserción va en el orden inverso. Todo ocurre dentro de una única
transacción: o el destino queda exactamente igual a la instantánea, o conserva
intacto lo que ya tenía.

**Nunca se tocan** `schema_migrations`, los esquemas de plataforma de Supabase,
su capa de autenticación ni ninguna tabla fuera de las diez canónicas.

---

## 5. Reversión

Si cualquier puerta falla:

1. Retirar las variables de PostgreSQL en Railway.
2. Desplegar el runtime SQLite.
3. Confirmar `[+58express Database] backend = sqlite` con sello posterior.
4. `/api/health` 200.
5. Confirmar que la instantánea y los originales siguen en `/data`.

La reversión ya se ejecutó con éxito en el segundo intento: está probada.

---

## 6. Manejo de la credencial

- PowerShell nuevo y dedicado para todo el cutover.
- `HKCU\Environment.PRODUCTION_DATABASE_URL` se lee **una sola vez**.
- El valor vive en memoria privada del coordinador.
- El secreto **no se imprime nunca**, ni en logs ni en informes.
- Se publica solo una huella truncada, que debe permanecer estable de principio
  a fin.
- Prohibido heredar un `process.env.PRODUCTION_DATABASE_URL` de una sesión
  anterior.
- Antes del corte, prueba de autenticación real contra el Session Pooler 5432.
