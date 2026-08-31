# Cartera, métodos de retiro y retiros

## Qué es esto

La fundación para que +58express tenga una cartera con precisión real, un libro
mayor auditable, métodos de retiro venezolanos y solicitudes de retiro que no
puedan pagar dos veces el mismo dinero.

**Construye la maquinaria y no la enciende.** No hay ninguna ruta HTTP nueva,
`server/index.js` no ha cambiado ni una línea, y las banderas están apagadas.

## Lo que ya existía, y por qué hacía falta esto

El producto **ya tiene** un retiro. Merece la pena mirarlo de frente, porque
explica cada decisión de esta fase.

```
CURRENT_WALLET_MODEL     users.payload.walletBalance — un number de JavaScript,
                         redondeado con Math.round(x*100)/100
CURRENT_LEDGER_MODEL     public.transactions, documental (payload jsonb)
                         tipos: RIDE_PAYMENT, TOP_UP, PAYOUT
CURRENT_WITHDRAWAL_MODEL POST /api/wallet/payouts → transacción PAYOUT PENDING
                         PATCH /api/admin/transactions/:id → APPROVED resta el saldo
CURRENT_PAYMENT_METHOD_MODEL   NO EXISTE. `method: 'PAGO_MOVIL'` está escrito a
                         mano en la transacción; no se guarda ni un dato bancario
CURRENT_ADMIN_FINANCE_FLOW     PATCH /api/admin/transactions/:id, admin_actions
```

Cinco problemas, todos reales:

1. **No hay reserva.** Al solicitar no se toca el saldo; se descuenta al
   aprobar. Entre una cosa y otra el dinero sigue disponible y se puede gastar
   en viajes.
2. **Aprobar es pagar.** Se descuenta el saldo y se notifica «Liquidación
   pagada» en el mismo paso. No hay PROCESSING ni PAID, así que una
   transferencia que falla no tiene forma de volver atrás.
3. **La aprobación es un leer-comprobar-escribir sin cerrojo.** Dos
   aprobaciones simultáneas pueden pasar las dos.
4. **El saldo es coma flotante.**
5. **No hay datos bancarios.** Quien administra no tiene a dónde pagar.

Esta fase **no modifica nada de eso**: construye la fundación correcta al lado.
Migrar el flujo antiguo es una fase con su propia autorización.

## La cartera

```sql
public.wallets
  available_usd               numeric(18,2)   utilizable en la aplicación
  reserved_usd                numeric(18,2)   comprometido en retiros en curso
  withdrawable_available_usd  numeric(18,2)   la parte que además puede salir
```

**Tres cifras, no una.** El saldo único de hoy no puede expresar que parte del
dinero está comprometido ni que parte no es retirable.

Las invariantes viven **en el motor**, no en un `if`:

```
available >= 0 · reserved >= 0 · withdrawable >= 0
withdrawable_available <= available
```

Un `if` protege el camino que alguien recordó proteger. Un `check` protege
todos, incluidos el script de mantenimiento escrito con prisa y la consola de
Supabase.

## Clases de fondos

No todo saldo es retirable. Una promoción de bienvenida es saldo utilizable
dentro de la aplicación, no dinero que la plataforma deba transferir a un banco;
tratarlos igual convierte cada campaña de marketing en una vía de extracción de
efectivo.

```
EARNED      retirable      lo que un conductor ganó trabajando
DEPOSITED   retirable      lo que la persona metió por una recarga verificada
REFUND      sin decidir
PROMO       sin decidir
BONUS       sin decidir
REFERRAL    sin decidir
ADJUSTMENT  sin decidir
```

### Una decisión que no es nuestra

```
PRODUCT_DECISION_REQUIRED_PROMO_WITHDRAWABILITY: YES
```

El producto **no tiene hoy** promociones, bonificaciones ni referidos — se
buscaron en todo el código y no existen. Así que no hay política que descubrir, y
no es asunto de esta fase inventarla.

`UNDECIDED` se trata como **no retirable**. Eso no es una política comercial
disfrazada: es negarse a asumir. Si el dueño decide que las promos son
retirables, se cambia una línea de `server/domain/fundClasses.ts` y las pruebas
lo confirman. Al revés —tratarlas como retirables y descubrirlo tarde— el dinero
ya salió.

## El libro mayor

```sql
public.wallet_ledger_entries          -- APPEND-ONLY
  amount_usd   numeric(18,2)  SIEMPRE positivo
  direction    CREDIT | DEBIT
  entry_type   WITHDRAWAL_RESERVE | WITHDRAWAL_RELEASE | WITHDRAWAL_SETTLE
               WALLET_CREDIT | WALLET_DEBIT
  fund_class   de dónde salió el dinero
  idempotency_key  único
  available_after_usd / reserved_after_usd
```

El importe es siempre positivo y el sentido lo da `direction`. Un importe con
signo invita a que alguien sume donde debía restar y el error pase desapercibido
porque «la cuenta cuadra».

`idempotency_key` es único, así que **un evento lógico no puede generar dos
movimientos**. Y un disparador rechaza `UPDATE` y `DELETE`: una tabla de
auditoría que se puede editar no es una tabla de auditoría.

La `metadata` tiene un `check` que rechaza claves como `password`, `pin`,
`accountNumber` o `phone`. Es para diagnosticar, no para colar datos bancarios
en una tabla que se consulta con menos cuidado.

## Métodos de retiro

```
BANK_TRANSFER   bankCode, bankName, accountType, accountNumber (20 dígitos),
                holderName, holderDocumentType, holderDocumentNumber
PAGO_MOVIL      bankCode, bankName, phone (04XX·7 dígitos),
                holderName, holderDocumentType, holderDocumentNumber
```

**La comprobación que de verdad atrapa errores:** en Venezuela los cuatro
primeros dígitos de la cuenta **son** el código del banco. Si no coinciden, uno
de los dos campos está mal — y una transferencia a la cuenta equivocada no se
deshace con un `UPDATE`. Está en el dominio **y** como `check` en PostgreSQL.

No se valida contra una lista de bancos: una lista incompleta bloquearía retiros
legítimos, y mantenerla al día sin fuente oficial es una promesa que no podemos
cumplir.

### Pago Móvil no es C2P

Pago Móvil es una transferencia que la plataforma **emite** hacia el
teléfono/cédula de la persona. C2P es un cobro que la plataforma solicita y que
exige integración bancaria y una clave de un solo uso. Aquí sólo se modela el
primero, y **no se prepara ningún campo para esa clave**.

### Lo que nunca se guarda

Contraseña de banca en línea, PIN, OTP, coordenadas, preguntas de seguridad. No
hay campo donde ponerlas, y la validación **rechaza la petición entera** si
llegan — porque el día que alguien añada «por comodidad» un campo `pin` al
formulario, esto debe romperse en vez de aceptarlo en silencio.

Descartar el campo en silencio dejaría a quien lo envió creyendo que guardamos su
PIN, y a nadie mirando el problema.

### Enmascarado por defecto

```
cuenta    ****2345
teléfono  0414****567     (el prefijo identifica la operadora, no a la persona)
documento V-****678
```

La forma normal de un método es la enmascarada. Los datos completos salen por una
única función que se llama distinto —`leerDetalleCompletoParaPago`— para que
usarla sea una decisión visible en el código.

Para registros y telemetría existe `paraRegistro()`, que devuelve exactamente
`{ methodId, type, bankCode }`. Es lo único que puede ir a un registro, a Sentry
o a analítica.

### Los métodos se desactivan, no se borran

`ACTIVE` / `DISABLED`. Borrar un método que respalda un retiro histórico haría
desaparecer la evidencia de a dónde se mandó el dinero, y la clave foránea
tampoco lo permite.

## La instantánea del método

Una solicitud guarda una **copia inmutable** de los datos del método en el
momento de pedirla.

El caso: alguien pide un retiro y después cambia su cuenta bancaria. Resolver los
datos leyendo siempre el método «actual» significaría pagar a una cuenta que
quien solicitó nunca seleccionó. Hay una prueba que cambia la cuenta después de
solicitar y comprueba que la instantánea no se mueve.

## La máquina de estados

```
REQUESTED ──┬─> UNDER_REVIEW ──> APPROVED ──> PROCESSING ──> PAID
            │         │              │            │
            ├─────────┴──────────────┴────────────┴──> REJECTED
            └──> CANCELLED
```

**APPROVED ≠ PAID.** Aprobar es una decisión administrativa; pagar es que el
dinero salió de una cuenta y entró en otra. Entre las dos cosas hay un banco, un
horario y la posibilidad de que la transferencia falle.

`PAID`, `REJECTED` y `CANCELLED` son terminales. De `PAID` no se sale: revertir
un pago hecho no es una transición de estado, es una operación contable nueva con
su propio rastro, y esta fase no la define.

### Qué le pasa al dinero

```
crear la solicitud    RESERVAR   available ↓  withdrawable ↓  reserved ↑
REJECTED / CANCELLED  LIBERAR    reserved ↓   available ↑     withdrawable ↑
PAID                  CONSUMIR   reserved ↓   y no vuelve: salió del sistema
avanzar de estado     NINGUNO    aprobar no es un hecho contable
```

## La reserva atómica

```sql
update wallets
   set available_usd = available_usd - $monto,
       withdrawable_available_usd = withdrawable_available_usd - $monto,
       reserved_usd = reserved_usd + $monto
 where user_id = $usuario
   and withdrawable_available_usd >= $monto     -- ← la comprobación
```

**La comprobación de saldo vive en el `where`**, así que comprobar y descontar
son la misma operación y no hay ventana entre ellas. No hay leer-comprobar-
escribir, y por tanto no hay doble gasto.

Reservar los fondos, crear la solicitud, anotar el movimiento y registrar la
auditoría van en **una transacción**, con un cliente dedicado. Si el proceso
muere en medio, no queda ni dinero reservado sin solicitud ni solicitud sin
reserva.

> Con el pool y no con un cliente dedicado, cada consulta puede salir por una
> conexión distinta y entonces `BEGIN` y `COMMIT` no envuelven nada. Es un error
> que no da síntomas hasta que hay concurrencia y dinero.

## Idempotencia

Toda operación sensible lleva clave:

```
crear retiro      claveDeIdempotencia → índice único en withdrawal_requests
reservar          wd-reserve-<id>     → índice único en el libro
liberar           wd-release-<id>
liquidar          wd-settle-<id>
cambiar estado    pedir el estado en el que ya está devuelve sinCambios: true
```

`PAID` tres veces paga una vez. Rechazar tres veces devuelve el dinero una vez.

### Un defecto que apareció escribiendo las pruebas

Dos solicitudes **simultáneas** con la misma clave reventaban con violación de
unicidad: el `select` de comprobación no ve la fila que otra transacción aún no
ha confirmado, así que las dos llegaban al `insert` y una perdía.

Perder esa carrera no es un error para quien llama —significa que su solicitud ya
existe—, así que ahora se captura esa violación: el `rollback` deshace la reserva
de la rama perdedora y se devuelve la solicitud que ganó.

## Concurrencia

Probado contra PostgreSQL real, no con dobles: la garantía la da el motor.

```
dos retiros por el saldo total        sólo uno reserva
cinco de 10 con saldo para tres       exactamente tres
misma clave en paralelo (×4)          un solo retiro lógico
aprobar y rechazar a la vez           el dinero se libera UNA vez
pagar y rechazar a la vez             nunca los dos efectos
cuatro rechazos simultáneos           una sola devolución
cuatro pagos simultáneos              un solo consumo
```

**La invariante que lo resume:** el `reserved_usd` de la cartera es exactamente
la suma de los retiros en estados vivos. Si alguna vez no cuadra, hay dinero
perdido o duplicado.

## La instantánea del tipo de cambio

Se reutiliza la infraestructura aprobada de FX-BCV-1. Una solicitud que fija
equivalente en bolívares congela cuatro campos:

```
fx_rate · fx_effective_date · fx_fetched_at · fx_source
```

Y el `amount_ves` calculado con la aritmética decimal exacta, redondeado a
céntimos (escala almacenada: 2; la presentación es asunto de la interfaz).

**No se recalcula nunca.** Volver a preguntarle al BCV daría otra cifra en cuanto
publique una corrección, y la persona vería cambiar un importe ya comunicado.

Un `check` exige que la instantánea esté **entera o ausente**: una a medias
—tasa sin fecha, o importe en bolívares sin tasa— es peor que ninguna, porque
parece auditable y no lo es. Y otro `check` sólo admite `BCV` como fuente.

### Si no hay tasa, falla cerrado

Ni `1`, ni `0`, ni la constante heredada de `874.50`, ni una tasa manual, ni
Binance, ni mercado paralelo. La solicitud se rechaza con `SIN_TASA_DE_CAMBIO` y
no se reserva nada.

### Una política que falta

```
PRODUCT_POLICY_REQUIRED_MAX_FX_AGE: YES
```

El sistema **conoce** la frescura de la tasa (`freshness`, `ageInDays`,
`effectiveDate`) porque FX-BCV-1 la expone. Lo que no existe es una decisión
sobre cuántos días puede tener una tasa y seguir sirviendo para calcular un
retiro. No se improvisa: hace falta decidirlo antes de encender los retiros con
equivalente en bolívares.

## Seguridad

**La propiedad va en el `where`**, no en una comparación posterior. Ese patrón
funciona hasta que alguien añade una ruta que se olvida de comparar. Un método o
un retiro de otra persona sencillamente no aparece — y devolver `null` en vez de
«no autorizado» evita confirmar que ese identificador existe.

El `userId` lo aporta quien llama, que debe **derivarlo de la autenticación**.
No hay ningún parámetro con el que pedir que la operación sea de otra persona.

Probado: leer, cancelar, usar el método ajeno, ver movimientos ajenos, ver
métodos ajenos. Todo denegado.

### La autoridad de autenticación sigue siendo una

`requireAuth` y `requireRole` del backend. Este código **no** las reimplementa, y
hay una prueba que falla si aparece `jsonwebtoken`, `bcrypt` o similar en los
módulos nuevos. Dos autoridades conviviendo es una vulnerabilidad, no una
migración.

### Re-autenticación: pendiente

```
FUTURE_REAUTH_REQUIRED: sí, documentado, no implementado
```

Cambiar un método de pago o aprobar un retiro deberían exigir re-autenticación o
segundo factor. Esta fase **no** construye un sistema MFA nuevo; deja anotado el
requisito para que sea una decisión y no un olvido.

## Banderas

```
WALLET_PAYOUTS_ENABLED       apagada
DRIVER_WITHDRAWALS_ENABLED   apagada
```

Sólo el literal `'1'` enciende. Ni `'true'`, ni `'yes'`, ni `'si'`: un único
valor aceptado significa que encender es deliberado.

**Una bandera abre una puerta; no convierte a nadie en administrador ni hace
aparecer dinero.** No salta la autenticación, ni la propiedad, ni las
invariantes. Hay pruebas que lo comprueban con todo encendido.

### Los retiros de conductor están bloqueados

```
DRIVER_WITHDRAWALS_PRODUCTION_READY: NO
```

Un conductor necesita **las dos** banderas, precisamente para que activar los
retiros de pasajera no active de rebote los suyos. El saldo de un conductor
depende de la liquidación de comisiones, y ese trabajo —DRIVER-FINANCE-1— está
**pausado sin resolver**. Un retiro construido sobre un saldo cuya corrección
está en revisión pagaría cifras que nadie ha validado.

No se enciende hasta que Driver Finance se resuelva explícitamente.

## Administración

`withdrawal_audit_events` es **append-only** y registra en cada acción:
`adminUserId`, rol, acción, estado anterior, estado nuevo, motivo y momento. La
`metadata` tiene un `check` que rechaza `jwt`, `cookie`, `accountNumber`, `otp` y
compañía.

**El listado usa la forma enmascarada.** Los datos completos sólo por
`leerDetalleCompletoParaPago`, y sólo cuando alguien va a pagar de verdad.

Marcar como pagado **exige una referencia externa**, impuesto por un `check` en
PostgreSQL. No se genera automáticamente: una referencia inventada por el sistema
no demuestra que el banco movió nada, y ese es exactamente el propósito del
campo.

## Un proveedor futuro

La ejecución del pago es hoy manual: administración transfiere y anota la
referencia. El modelo admite que mañana lo haga una API bancaria o un proveedor
de Pago Móvil sin cambiar los estados ni el libro — lo que cambia es quién
produce la referencia. **No se integra ningún banco en esta fase.**

## Borrado de cuenta

Un registro financiero no debe desaparecer porque se elimine una cuenta, y los
datos personales no deben conservarse más de lo necesario. La separación es:

```
PII borrable/anonimizable   nombre del titular, documento, teléfono, cuenta
Registro que se conserva    importes, estados, fechas, referencias, auditoría
```

Esta fase **no implementa** una política de retención: inventar plazos legales
sería peor que no tener ninguno. Queda anotado para cuando se aborde el borrado
de cuenta.

## Lo que esta fase deliberadamente NO hizo

```
✗ cambiar server/index.js
✗ añadir ninguna ruta HTTP
✗ modificar el retiro que el producto ya ofrece
✗ tocar Safe Transport, precios, despacho o Socket.IO
✗ encender ninguna bandera
✗ aplicar la migración en Producción
✗ integrar un banco, C2P o cualquier proveedor de pago
✗ construir MFA
✗ incluir Driver Finance, que sigue pausado
✗ añadir dependencias
```

## Decisiones que faltan

```
PRODUCT_DECISION_REQUIRED_PROMO_WITHDRAWABILITY: YES
PRODUCT_POLICY_REQUIRED_MAX_FX_AGE: YES
PASSENGER_WITHDRAWAL_SOURCE_OF_FUNDS: sin definir
```

La tercera importa antes de encender nada para pasajeras: hay que saber qué
saldos de pasajera representan dinero real y cuáles son crédito. Hoy el producto
sólo tiene recargas (`TOP_UP`) y pagos de viaje, así que la respuesta parece
simple — pero «parece» no basta para mover dinero.

## Comandos

```bash
npm --prefix server run test
```

Las pruebas que escriben exigen `FX_TEST_DB_PROJECT_REF`, el guard fuerte de
FX-BCV-1A. Sin esa variable se saltan enteras y no se abre ni una conexión.
