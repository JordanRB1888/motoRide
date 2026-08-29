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

## Qué apaga el interruptor, y qué NO

`DRIVER_FINANCE_ENABLED` está **apagada**. Es importante entender exactamente
qué controla, porque confundirlo costó dinero en la revisión anterior.

**Apaga la POLÍTICA:**

- el cobro del mantenimiento mensual,
- la suspensión por inactividad y sus avisos,
- el bloqueo por deuda y el filtro de reparto de trabajo,
- la cobranza de obligaciones cuando entra dinero,
- la creación de filas nuevas en `driver_finance_state`.

**No apaga la AUTORIDAD del saldo.** En cuanto un conductor tiene fila en el
libro, su dinero vive ahí para siempre: sus ganancias, recargas y retiros
siguen escribiéndose en la fila autoritativa aunque la política esté apagada.

Esto no es un detalle de implementación, es la corrección de un fallo real: la
versión anterior devolvía las escrituras al documento al apagar la bandera,
mientras el disparador seguía reestampando el saldo desde la fila. El conductor
completaba una carrera y **cobraba cero**, sin un solo error en el registro.

Con la política apagada, quien **no** está en el libro se comporta
exactamente como antes de esta fase: sin fila, el disparador es inerte.

## El pooler: lo que sí sabemos y lo que no

`DATABASE_URL` de producción apunta al pooler de Supabase por el **puerto 5432**
(modo sesión). Esa configuración está certificada y **no se cambia**.

Lo que la revisión anterior afirmó —que el modo sesión es un requisito
arquitectónico— **era incorrecto, y se corrige aquí**. Lo que las transacciones
de dinero necesitan es una *conexión reservada durante la transacción*, no
afinidad de sesión entre transacciones; y un pooler en modo transacción fija el
backend justo para eso. De hecho, las 24 pruebas financieras contra PostgreSQL
real —incluidas las de concurrencia— se ejecutan a través del **puerto 6543**,
que es modo transacción, y pasan.

Lo que sí ocurrió y sigue anotado como cosa a vigilar: en una prueba de
integración con transiciones solapadas, una liquidación se quedó esperando
indefinidamente contra el 6543. Eso apunta a **orden de cerrojos o ciclo de
vida del cliente** —ver la sección siguiente—, no a una incompatibilidad del
pooler.

Las tres defensas que hacen que ese escenario no pueda colgar a nadie ya están
puestas en cada transacción de dinero: `lock_timeout`, `statement_timeout` e
`idle_in_transaction_session_timeout`. Si algo no consigue su cerrojo, falla
cerrado y se reintenta; nunca se queda esperando para siempre.

## Orden de cerrojos

Todas las operaciones de dinero toman los cerrojos en **el mismo orden**. Es la
única forma de que dos caminos concurrentes no se traben mutuamente:

```
1. driver_finance_state          ← SIEMPRE el primero: es el cerrojo del conductor
2. driver_commission_reservations
3. driver_maintenance_obligations
4. trips
5. transactions
6. users                          ← SIEMPRE el último: la proyección del documento
```

El reconciliador era la excepción y se corrigió: bloqueaba reservas antes que
el estado del conductor, al revés que todos los demás. Ahora busca candidatos
**sin cerrojos** y resuelve cada uno en su propia transacción, tomando primero
la fila del conductor.

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

### Antes de la primera activación

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

### Después de la primera activación

**Las tablas ya no se pueden borrar: contienen dinero.**

El paso correcto es **apagar la política**:

```
DRIVER_FINANCE_ENABLED=0   + desplegar
```

Y es seguro, que es justo lo que antes no era. Con la política apagada:

- deja de cobrarse el mantenimiento, de suspenderse por inactividad y de
  bloquearse a nadie por deuda;
- deja de cobrarse ninguna obligación con el dinero que entra: las deudas
  esperan, no se perdonan ni se cobran;
- **el dinero del conductor sigue entrando y saliendo del libro**, que es donde
  vive su saldo. Ganancias, recargas y retiros siguen siendo correctos.

Lo único que se conserva del modelo nuevo, además del almacén, es el **suelo de
−$5**: es una propiedad de la fila (y una restricción de la base), no de la
política, y su efecto es siempre proteger al conductor de hundirse más.

### Revertir la arquitectura entera

Solo si hiciera falta deshacer el modelo, no solo pausar la política. Y **no se
borra nada**:

```sql
drop trigger if exists driver_finance_project_trg on public.users;
```

A partir de ahí `users.payload` vuelve a mandar, con los valores que el
disparador dejó proyectados —es decir, los correctos— y las tablas quedan como
registro histórico auditable. Reponer el disparador es una sola sentencia.

**Importante:** este paso y el despliegue del código que vuelve a escribir en
el documento tienen que ir juntos. Retirar el disparador dejando el código
nuevo, o al revés, deja dos autoridades discrepando.

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

-- LO MÁS IMPORTANTE de todo: carreras HECHAS cuyo dinero no llegó a cobrarse.
-- Deben ser cero de forma sostenida. Si alguna se queda aquí, el rescate
-- automático no está funcionando y alguien trabajó sin cobrar.
select count(*) from public.driver_commission_reservations where status = 'SETTLEMENT_PENDING';
```

En el registro del servidor, tres avisos importan y ninguno lleva datos
personales:

- `reservas sin viaje` — una reserva perdió su carrera. Revisar a mano.
- `carreras hechas pendientes de liquidar` — se completaron y su dinero no se
  cobró. El rescate automático las liquida en la siguiente pasada; si el
  mensaje se repite, hay que mirarlo.
- `carreras rescatadas y liquidadas` — el rescate funcionando.
- `traslados programados vencidos sin ocurrir` — capacidad devuelta a un
  conductor por un traslado que no llegó a pasar.

## Lo que esta fase NO toca

Tarifas del Transporte Seguro, el reparto 80/20, la billetera de las pasajeras,
`ridesUsed`, el T0, la geografía del despacho, el orden por ETA, la ronda
secuencial de 15 segundos ni PUSH-3A. Lo único que cambia del Transporte Seguro
es **a dónde va el pago del conductor**: ahora entra por la misma cobranza que
cualquier otro ingreso suyo.
