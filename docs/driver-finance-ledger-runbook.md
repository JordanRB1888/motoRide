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

## Cada movimiento de dinero tiene nombre

Todo ingreso o salida de dinero de un conductor lleva una **identidad estable**
que se guarda en `driver_money_operations` dentro de la misma transacción que
mueve el saldo. Reintentar la misma operación no puede volver a moverlo: esa
identidad es clave primaria.

```
topup:<idDeLaTransaccion>       recarga aprobada
payout:<idDeLaTransaccion>      liquidación pagada
withdrawal:<idDeLaSolicitud>    retiros (fase futura)
admin-adjustment:<id>           ajuste administrativo
```

De ahí sale también la respuesta cuando un `COMMIT` se confirma y su respuesta
se pierde: se le pregunta a la base si la operación está anotada. Si lo está,
entró; si no, no entró.

**Una consecuencia operativa importante:** cuando la administración aprueba una
recarga o una liquidación y el desenlace del dinero queda incierto, la ruta
responde `503` con `retryable: true` y **la solicitud se queda PENDIENTE**. No
es un error que haya que corregir a mano: hay que **reintentar la misma
aprobación**, que usará la misma identidad y descubrirá si aquel movimiento
llegó a entrar. Aprobar de nuevo nunca duplica el dinero.

### Y el origen de negocio también es una identidad

Una identidad de operación no basta. La séptima auditoría movió la misma
recarga dos veces sin romper ninguna regla: le puso **dos nombres al mismo
hecho**.

```
op-A · TOPUP / request-123 · +2.00      saldo 1.00 → 3.00
op-B · TOPUP / request-123 · +2.00      saldo 3.00 → 5.00
```

Por eso cada operación guarda además **de dónde viene** —`source_type` y
`source_id`— y la base declara esa pareja **única**:

```sql
create unique index driver_money_operations_origen_unico
  on driver_money_operations (source_type, source_id)
  where source_type <> 'LEGACY_UNKNOWN';
```

Una recarga es UN hecho de negocio, y un hecho mueve dinero **una sola vez**,
se le llame como se le llame. Si llega bajo otra identidad pero con el mismo
efecto, se responde con la operación canónica y no se mueve nada; si el efecto
difiere —otro conductor, otro importe, otra dirección— es `SOURCE_IDENTITY_CONFLICT`
y no se mueve nada tampoco.

Está en la base y no solo en el código a propósito: dos procesos pueden hacer
su comprobación previa a la vez y los dos encontrarla limpia.

### `LEGACY_UNKNOWN` describe el pasado; no autoriza el futuro

Los testigos que existieran antes de que estos campos existieran llevan
`source_type = 'LEGACY_UNKNOWN'`, que no es un origen inventado sino la
anotación explícita de que **no se sabe**. Quedan fuera del índice único
—no tienen un origen real que pueda serlo— y el código nunca los acepta como
prueba de una repetición.

Una operación **nueva** con ese origen se rechaza dos veces: en la aplicación
(`LEGACY_SOURCE_NOT_ALLOWED`) y en la base, con un disparador `before insert`.
La razón es concreta: entraría la primera vez y después quedaría atrapada
—su reintento legítimo no podría probar nada y fallaría cerrado para siempre—.
Es dinero que se mueve una vez y no se puede reconciliar nunca.

### El dueño de una carrera liquidada no cambia

La liquidación comprueba, con los cerrojos en la mano, que la reserva y el
viaje son del conductor al que va a cobrar. Eso es cierto mientras su
transacción vive, y deja de serlo un instante después: una escritura del
documento del viaje esperando detrás del cerrojo entra en cuanto la
liquidación confirma, y deja la comisión cobrada a uno y la carrera puesta a
otro.

El invariante vive por eso en la base —`driver_finance_dueno_liquidado_trg`,
`before update on trips`—, donde ninguna escritura puede rodearlo. Si algo
intenta cambiar el conductor de una carrera cuya comisión ya está liquidada,
la escritura falla con `DRIVER_FINANCE_TRIP_OWNER_SETTLED`.

Reasignar **antes** de liquidar sigue siendo legítimo. Hoy el producto no
reasigna en absoluto: la única asignación que existe es la de una carrera
`SEARCHING`, y pasa por `acceptTripWithReservation`. Para cuando haya una
reasignación de verdad existe ya una puerta que sabe de dinero,
`reassignTripDriver`, que libera la reserva del conductor anterior y se niega
si la comisión ya está liquidada o pendiente de cobro.

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

## El fin de carrera no espera al libro del conductor

Cuando el conductor completa una carrera pasan dos cosas independientes: el
viaje y el cobro a la pasajera se hacen durables, y el dinero del conductor se
liquida. Estaban encadenadas, y la pasajera esperaba a las dos.

Medido en el camino real, contra la base de pruebas:

```
persistencia del viaje y del cobro a la pasajera   1.7 s   ← ya es durable
ensureState                                        2.9 s
settleTripForDriver                                4.5 s
registerQualifyingTrip                             2.2 s
------------------------------------------------------------------
la pasajera recibía el fin de carrera a los       11.5 s
```

Ahora son dos anuncios, cada uno en cuanto lo suyo es cierto: el **estado** y
la cartera de la pasajera en cuanto el viaje es durable, y la cartera del
conductor cuando su liquidación se resuelve. El camino sin conexión hace
exactamente lo mismo, en el mismo orden.

La liquidación no cambió: sigue ocurriendo después de que el viaje sea durable
y exactamente una vez. Lo único que dejó de hacer es retener un anuncio que ya
era cierto.

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

-- Identidades de operación: una fila por recarga, retiro o ajuste. Sirve para
-- auditar que un reintento no movió dinero dos veces.
select kind, count(*) from public.driver_money_operations group by kind;

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
