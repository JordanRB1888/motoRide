# Tasa oficial USD/VES del BCV

## Qué es esto

La fundación para que +58express conozca el tipo de cambio **oficial** del
Banco Central de Venezuela, con precisión exacta y sin inventarse nada cuando
la fuente no responde.

FX-BCV-1 construye la maquinaria completa y **no la enciende**. No hay ninguna
tarea corriendo, `server/index.js` no ha cambiado, y ningún precio del producto
usa todavía este servicio.

## La fuente

```
OFICIAL      https://www.bcv.org.ve/     (host www.bcv.org.ve, control del BCV)
FORMATO      HTML — el BCV no publica API ni JSON
ACCESO       GET sobre HTTPS, sin autenticación
FRECUENCIA   una vez al día, 17:30 hora de Caracas
```

**No hay una segunda fuente y no debe haberla.** Binance, Monitor Dólar,
DolarToday, las APIs que republican al BCV y cualquier promedio de mercado
paralelo quedan fuera: republicar no es publicar, y la tasa oficial sólo la
declara quien la emite. Hay una prueba automática que falla si alguna de esas
palabras aparece en el código de FX.

### Qué publica exactamente

En la portada, con un identificador propio:

```html
<div id="dolar">
  … <span> USD</span> …
  <strong class="strong-tb">794,99170000</strong>
</div>
<div class="pull-right dinpro center"> Fecha Valor:
  <span class="date-display-single" content="2026-08-31T00:00:00-04:00">Lunes, 31 Agosto 2026</span>
```

Tres cosas decidieron el diseño del lector:

1. **`id="dolar"` es un ancla semántica**, no una clase visual. Es lo más
   estable que ofrece la página. Las clases (`col-sm-6`, `textp`) cambian con
   cualquier retoque de estilo y no se usan para nada.
2. **El valor trae ocho decimales** en formato venezolano (punto para los
   miles, coma para los decimales).
3. **La fecha valor viene legible por máquina** en el atributo `content`, en
   ISO 8601 y con el huso de Caracas. Se usa esa y no el texto «Lunes, 31
   Agosto 2026», que obligaría a traducir nombres de meses y se rompería con
   cualquier cambio de redacción.

**Fecha valor ≠ fecha de descarga.** El BCV publica por la tarde la tasa que
regirá el día hábil siguiente. Confundirlas es cobrar con la tasa equivocada.

## El problema de TLS, y cómo se resolvió

`www.bcv.org.ve` presenta un certificado legítimo de Sectigo pero **no envía el
certificado intermedio** que lo encadena a la raíz. Los navegadores lo disimulan
descargando el emisor por AIA; Node no hace eso:

```
UNABLE_TO_VERIFY_LEAF_SIGNATURE
```

La salida fácil habría sido `rejectUnauthorized: false`. Eso apaga la
verificación entera —firma, cadena, caducidad y nombre de host— y deja la
conexión abierta a cualquiera que pueda interponerse, para traer el número con
el que se cobra dinero.

**Lo que se hizo:** añadir el intermedio que falta al almacén de confianza del
sistema, sin sustituirlo.

```js
ca: [...tls.rootCertificates, intermedio]   // se AMPLÍA, no se reemplaza
rejectUnauthorized: true                     // explícito, para que apagarlo cueste
```

La validación sigue siendo completa. No se relaja nada: se completa lo que el
servidor omite.

El certificado vive en
`server/certs/sectigo-public-server-authentication-ca-dv-r36.pem`, obtenido del
AIA del propio certificado del BCV, y una prueba comprueba su huella SHA-256,
su emisor y que siga vigente. Caduca en **marzo de 2036**.

> Si algún día el BCV arregla su cadena, este fichero deja de hacer falta pero
> no estorba. Si cambia de autoridad certificadora, la prueba en vivo
> (`FX_BCV_LIVE=1`) lo dirá.

### Las demás protecciones

```
· HTTPS únicamente; una redirección a HTTP se rechaza
· sólo el dominio bcv.org.ve y sus subdominios — «malobcv.org.ve» no cuela
· cada redirección vuelve a pasar por la MISMA validación
· máximo 3 saltos, 15 s de espera, 5 MB de respuesta
· TLS 1.2 como mínimo
```

## Precisión: por qué no hay ni un `number`

El BCV publica ocho decimales y con ellos se multiplican importes:

```
0.1 + 0.2        === 0.30000000000000004
794.9917 * 3.5   === 2782.4709500000003
```

Un céntimo perdido por viaje, multiplicado por todos los viajes, es dinero real
de conductoras y conductores.

```
del BCV      cadena  '794,99170000'
en memoria   bigint de unidades + escala  (server/domain/decimalMoney.ts)
en Postgres  numeric(18,8)
de vuelta    cadena — `pg` devuelve numeric como texto, y NO se convierte
```

El redondeo es **comercial** (la mitad sube), igual que el de PostgreSQL: que
las dos mitades del sistema redondeen igual importa más que cuál de los dos
criterios sea teóricamente mejor.

## Las dos capas de validación

**La forma**, en el parser: que exista el bloque del dólar, que declare `USD`,
que el valor tenga el formato publicado, que la fecha exista en el calendario.
Falla cerrado con un motivo concreto y nunca devuelve un valor aproximado.

**La cordura**, comparando con lo que ya sabíamos. Hay fallos con forma
perfecta: si el BCV reordena su portada y el bloque del dólar pasa a contener la
lira, el resultado es un decimal impecable —16,47982495— que ninguna
comprobación de forma puede rechazar. Con esa tasa se cobraría cincuenta veces
menos y nada daría error.

```
se admite entre la MITAD y el DOBLE de la última tasa conocida
```

El umbral es ancho a propósito: no pretende predecir el bolívar, sino separar
una variación económica —por brusca que sea— de un error de lectura. En un país
que ha tenido hiperinflación, un umbral estrecho daría falsas alarmas constantes
y acabaría ignorándose, que es la peor forma de tener una alarma.

Cuando salta, **no se corrige ni se ajusta nada**: se rechaza la tasa, se
conserva la anterior y se pide que lo mire una persona.
`aceptarVariacionInusual` existe para el caso legítimo, pero exige una decisión
humana explícita y nunca se activa sola.

## Cuando el BCV no responde

```
se sirve la última tasa buena conocida, MARCADA como vieja
```

`FxRateReading` lleva `freshness` (`FRESH` / `STALE`) y `ageInDays`. Quien
consume la tasa tiene derecho a saber si está mirando la de hoy o la última que
se pudo conseguir — la alternativa, servir una tasa vieja sin decirlo, es la
forma silenciosa de cobrar mal.

La tolerancia es de **un día**, no cero: el BCV no publica fines de semana, así
que un sábado la tasa vigente legítima es la del viernes. Con tolerancia cero,
todos los fines de semana aparecerían como degradados y la señal dejaría de
significar nada.

**Y si nunca se ha obtenido ninguna tasa, no hay ninguna.** `tasaVigente()`
devuelve `null` y `convertirUsdAVes()` lanza `SinTasaDisponible`. Es incómodo a
propósito: un valor de respaldo escrito a mano se queda viejo en silencio y
cobra mal durante semanas sin que nadie se entere. Cobrar cero bolívares es un
error tan grave como cobrar de más, y más difícil de notar.

## La tabla

```sql
public.exchange_rates
  id            text primary key      -- 'USD-VES-BCV-2026-08-31'
  base_currency text                  -- check: = 'USD'
  quote_currency text                 -- check: = 'VES'
  rate          numeric(18,8)         -- check: > 0
  value_date    date
  source        text                  -- check: = 'BCV'
  fetched_at    timestamptz
  revision      integer               -- check: >= 1
```

**No es documental**, a diferencia del resto del esquema, y es deliberado: una
tasa no es un documento que evoluciona sino un hecho publicado en una fecha, y
JSONB obligaría a que el valor viajara como texto para no perder precisión —
bastaría con que alguien lo escribiera como número JSON para romperlo. Con
`numeric` esa puerta no existe.

**La identidad es la clave primaria**, y por eso guardar es idempotente:
ejecutar la tarea dos veces el mismo día no duplica nada ni cuenta una revisión
de más. Un índice único sobre las columnas reales declara lo mismo de forma
redundante — si algún día cambia la forma del identificador, sigue habiendo una
sola tasa por día.

`revision` cuenta las correcciones del BCV sobre una fecha ya guardada. No se
actualiza en silencio: quien llama recibe `CORREGIDA` y se registra, porque una
corrección sobre un día con el que ya se cobró es algo que alguien debería ver.

## El historial: por qué `revision + 1` no bastaba

La primera versión incrementaba `revision` y **sobrescribía el valor anterior**.
Quedaba constancia de que algo cambió, y ninguna forma de saber de qué a qué.
Con eso no se puede auditar un cobro hecho con la tasa vieja: el número con el
que se cobró ya no existe en ninguna parte.

```sql
public.exchange_rate_observations          -- APPEND-ONLY
  id            text primary key           -- 'USD-VES-BCV-2026-08-31#1'
  rate          numeric(18,8)              -- la MISMA precisión que la vigente
  value_date    date
  source        text
  fetched_at    timestamptz                -- cuándo lo publicó el BCV
  recorded_at   timestamptz                -- cuándo lo anotamos nosotros
  revision      integer
```

```
exchange_rates                la verdad de AHORA      una fila por fecha valor
exchange_rate_observations    la MEMORIA              una fila por observación
```

**Append-only de verdad, no de palabra.** Un disparador rechaza `UPDATE` y
`DELETE`. Una tabla de auditoría que se puede editar no es una tabla de
auditoría, y una promesa en un comentario no impide nada.

Las dos escrituras van **en un solo statement** (CTE): con dos consultas, un
fallo entre la primera y la segunda dejaría una tasa vigente sin su observación
—el historial mentiría justo en el caso que más importa—. Los CTE que escriben
se ejecutan siempre y de una vez.

### Idempotencia y concurrencia

```
A A A          → una sola observación (revisión 1)
A → B          → dos observaciones; A NO desaparece, la vigente resuelve a B
B B B          → sigue habiendo dos
cuatro A a la vez   → una sola observación
cuatro B a la vez   → una sola corrección
```

La fila de `exchange_rates` serializa: la segunda transacción espera, vuelve a
evaluar el `where` contra la fila ya actualizada y, si el valor coincide, no
escribe nada. De ahí sale que repetir la misma tasa —en serie o en paralelo—
produzca exactamente una observación.

### Para una instantánea financiera futura

Un cobro que copie `rate`, `effectiveDate`, `fetchedAt` y `source` queda
congelado e **independiente** de cualquier corrección posterior del BCV, y
además es **verificable**: esos cuatro campos se pueden contrastar contra el
historial para demostrar que esa tasa existió de verdad y no es un número
inventado en un recibo. Está comprobado con una prueba; no se implementó nada
de pagos.

### Limitación honesta

Si el BCV corrigió alguna tasa **antes** de esta migración, ese valor anterior
no se guardó en ninguna parte y no hay forma de recuperarlo. El historial es
fiel a partir de aquí, no hacia atrás.

## La tarea diaria

```
17:30 hora de Caracas, todos los días
```

Se pregunta por la tarde porque el BCV publica entonces; de madrugada se
traería siempre la del día anterior.

El huso se calcula con `Intl`, sin fijar «-4» a mano: Venezuela está hoy en
UTC-4 y no aplica horario de verano, pero escribir el desfase en el código es
el tipo de suposición que se rompe en silencio años después.

**Nadie la arranca todavía.** `server/index.js` no importa el planificador.
Cuando se encienda, debe quedar detrás de `FX_SCHEDULER_ENABLED` para que sea un
acto deliberado y reversible, no un efecto secundario de desplegar.

## Comandos

```bash
npm --prefix server run test
```

```bash
FX_BCV_LIVE=1 npm --prefix server test -- test/fxRateProvider.test.js
```

La segunda sale a la red de verdad y comprueba lo que ningún fixture puede: que
el certificado guardado sigue completando la cadena y que la portada del BCV
sigue teniendo la forma que el parser espera. Está apagada por defecto para que
la suite no dependa de la red ni moleste al BCV en cada ejecución.

### El guard de identidad de la base de datos

Las pruebas que escriben exigen **identidad positiva declarada**:

```bash
FX_TEST_DB_PROJECT_REF=<identificador del proyecto de Test>
```

Sin ella se saltan enteras y **no se abre ni una conexión**. La comprobación
ocurre antes de conectar, antes de migrar y antes de escribir.

```
FX_TEST_DB_PROJECT_REF        cuál es el proyecto de Test. Obligatoria.
FX_PRODUCTION_DB_PROJECT_REFS identidades de Producción, separadas por comas.
                              Además se deducen solas de DATABASE_URL y
                              PRODUCTION_DATABASE_URL si están presentes.
```

Tres reglas:

1. **Producción se deniega primero**, antes que cualquier otra comprobación. Si
   el destino coincide con una identidad de Producción se rechaza *aunque*
   alguien lo haya declarado como Test — esa contradicción es un error de
   configuración, no un permiso.
2. **Sin declaración no se escribe.** No hay valor por defecto ni «si no se
   sabe, será Test».
3. **No hay puerta trasera.** Ninguna variable salta estas comprobaciones, y hay
   una prueba que lo verifica llenando el entorno de nombres plausibles.

La versión anterior decidía «esto es Test» mirando el contenido: `users <= 50`.
Eso no identifica nada — Producción también puede tener pocas filas. El conteo
sigue existiendo, pero como **señal secundaria** que sólo emite un aviso y nunca
autoriza por sí misma.

Nada de lo que sale del guard contiene la URI, el usuario ni la contraseña: los
identificadores se reducen a una huella corta (`qljs…gll`).

## Lo que esta fase deliberadamente NO hizo

```
✗ cambiar server/index.js
✗ encender ninguna tarea
✗ aplicar la migración en Producción
✗ migrar los consumidores que hoy usan una tasa fija
✗ tocar precios, cobro, carteras o Transporte Seguro
✗ añadir dependencias
```

### La deuda que queda, con números

El producto tiene **hoy** una tasa escrita a mano:

```
src/utils/constants.js:53   BCV_RATE = 874.50
src/utils/bcvRates.js:6     BCV_EURO_RATE = 874.50
```

La tasa oficial el 2026-08-31 es **794,99170000**. El valor fijo está **un 10 %
desviado**, y `scheduleRideModal.js` lo usa para calcular lo que se le muestra a
la pasajera en bolívares (`fareVES = currentFareEUR * bcvRate`).

En el backend, `pricingConfig.bcvRate` sale de `process.env.BCV_RATE` (o `0`) y
se edita a mano desde el panel de administración.

Migrar esos consumidores toca el cobro y es una fase con su propia autorización.
Queda escrito aquí para que sea una decisión y no un olvido.

### Siguiente ola sugerida

```
1. cablear el planificador tras FX_SCHEDULER_ENABLED, primero en Test
2. exponer la tasa vigente por API, con su frescura
3. migrar el panel de administración a la tasa real
4. migrar el cálculo de tarifas — con su propia autorización
5. retirar BCV_RATE y BCV_EURO_RATE
```
