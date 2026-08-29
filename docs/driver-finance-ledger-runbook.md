# DRIVER-FINANCE-1 · puesta en marcha del libro contable del conductor

Este documento existe porque la migración `20260829180000_driver_finance_ledger.sql`
crea las tablas donde vivirá **dinero real de personas concretas**. Una vez que
esas tablas empiecen a llenarse, no se pueden borrar: contienen la deuda y los
cobros del conductor, y tirarlas equivaldría a perdonar o duplicar dinero sin
que nadie se entere.

Nada de lo que sigue está aplicado en producción.

## Qué cambia, en una frase

El saldo operativo del conductor, su deuda diferida, sus mantenimientos y su
bloqueo dejan de vivir dentro de `users.payload` y pasan a vivir en tablas
propias. `users.payload` conserva esos campos como **proyección** para las
pantallas, reestampada por un disparador en cada escritura del documento.

Antes, una réplica con una copia vieja del documento podía deshacer un cobro
correcto. Después, esa misma escritura entra con datos viejos y sale con los
autoritativos.

## Estado del interruptor

`DRIVER_FINANCE_ENABLED` está **apagada**. Con ella apagada:

- no se crea ninguna fila en `driver_finance_state`,
- el disparador queda inerte (solo actúa sobre conductores que tienen fila),
- el despacho, la liquidación y el Transporte Seguro se comportan exactamente
  como antes.

## Requisito operativo: el pooler debe estar en modo SESIÓN

`DATABASE_URL` de producción apunta hoy al pooler de Supabase por el **puerto
5432**, que es **modo sesión**: cada conexión del backend se queda con su
conexión de servidor durante toda su vida. Eso es lo que necesitan las
transacciones de dinero, que encadenan una docena de sentencias con cerrojos
en medio.

**No cambiar ese puerto a 6543 (modo transacción).** Se comprobó durante esta
fase: contra el pooler en modo transacción, una liquidación solapada con la
escritura del documento se queda esperando indefinidamente —la base aparece
como `idle in transaction` esperando al cliente— y la carrera no se liquida.
Los tres tiempos límite que lleva cada transacción (`lock_timeout`,
`statement_timeout`, `idle_in_transaction_session_timeout`) hacen que eso
termine fallando cerrado y reintentándose en vez de colgarse para siempre,
pero la configuración correcta es el modo sesión.

## Orden de despliegue

```
1. Aplicar la migración               npm run db:migrate    (desde estación, con DATABASE_URL de producción)
2. Desplegar el código                push a master → Railway
3. Avisar a la flota de conductores   (decisión del dueño, antes del paso 4)
4. Encender la política               DRIVER_FINANCE_ENABLED=1 + bump de CUTOVER_PHASE
```

El paso 1 puede ir antes del 2 sin riesgo: la migración solo crea estructura y
el disparador no hace nada mientras no existan filas de estado.

El paso 2 puede ir antes del 1 sin riesgo: el código comprueba al arrancar si
las cuatro tablas existen (`financeReady`) y, si no, se comporta como antes.

**El paso 4 es el único irreversible en la práctica.** A partir de ahí empiezan
a existir filas de dinero.

## Vuelta atrás

### Antes de encender (pasos 1–3)

Seguro y completo. Las tablas están vacías.

```sql
drop trigger if exists driver_finance_project_trg on public.users;
drop function if exists public.driver_finance_project();
drop table if exists public.driver_inactivity_warnings;
drop table if exists public.driver_maintenance_obligations;
drop table if exists public.driver_commission_reservations;
drop table if exists public.driver_finance_state;
delete from public.schema_migrations where id = '20260829180000_driver_finance_ledger.sql';
```

Y desplegar el commit anterior. Ningún saldo cambia.

### Después de encender (paso 4)

**No se pueden borrar las tablas.** Contienen dinero.

La vuelta atrás correcta tiene dos escalones, y ninguno destruye datos:

1. **Apagar la política** — `DRIVER_FINANCE_ENABLED=0` y desplegar. Deja de
   cobrarse el mantenimiento, deja de bloquearse a nadie por deuda y deja de
   reservarse comisión. El saldo del conductor sigue siendo el que dice
   `driver_finance_state`, porque el disparador sigue proyectándolo. **Esto es
   lo correcto**: es el saldo real, con los cobros ya hechos.

2. **Volver a la autoridad del documento** (solo si hay que revertir la
   arquitectura entera, no solo la política) — retirar el disparador y dejar
   las tablas en su sitio como registro histórico:

   ```sql
   drop trigger if exists driver_finance_project_trg on public.users;
   ```

   A partir de ese momento `users.payload` vuelve a mandar, con los valores que
   el disparador dejó proyectados —es decir, los correctos— y las tablas quedan
   como constancia auditable de cómo se llegó ahí. Reponer el disparador es una
   sola sentencia.

No existe ninguna vuelta atrás automática ni destructiva, y no debe escribirse
ninguna: el paso que borra dinero es el que nunca se puede deshacer.

## Qué mirar los primeros días

```sql
-- Reservas vivas: deben corresponder a carreras en curso.
select count(*) from public.driver_commission_reservations where status = 'RESERVED';

-- Deuda diferida sin cobrar, con dueño.
select count(*), sum(deferred_usd - deferred_paid_usd)
  from public.driver_commission_reservations
 where status = 'SETTLED' and deferred_usd > deferred_paid_usd;

-- Mantenimientos vencidos sin pagar.
select count(*) from public.driver_maintenance_obligations where status = 'DUE';

-- Conductores bloqueados por deuda.
select count(*) from public.driver_finance_state where block_active;
```

En el registro del servidor, tres avisos importan y ninguno lleva datos
personales:

- `reservas sin viaje` — una reserva perdió su carrera. Revisar a mano.
- `carreras completadas sin liquidar` — completó sin apunte de dinero.
- `traslados programados vencidos sin ocurrir` — capacidad devuelta a un
  conductor por un traslado que no llegó a pasar.

## Lo que esta fase NO toca

Tarifas del Transporte Seguro, el reparto 80/20, la billetera de las pasajeras,
`ridesUsed`, el T0, la geografía del despacho, el orden por ETA, la ronda
secuencial de 15 segundos ni PUSH-3A. Lo único que cambia del Transporte Seguro
es **a dónde va el pago del conductor**: ahora entra por la misma cobranza que
cualquier otro ingreso suyo.
