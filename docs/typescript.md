# TypeScript en +58express

TypeScript entra **de forma incremental**. No hay ninguna migración masiva
prevista, y el JavaScript que ya funciona sigue funcionando exactamente igual.

## La regla que gobierna todo lo demás

TypeScript añade seguridad **estática**. No sustituye a nada de esto:

```
validación en runtime · restricciones de PostgreSQL · transacciones
autorización · cerrojos · idempotencia · pruebas
```

Un `TripStatus` en TypeScript no impide que llegue por HTTP la cadena
`"BANANA"`: lo que lo impide es la comprobación que ya hay en el servidor. Si
alguna vez un tipo parece justificar quitar una validación, la respuesta es que
no.

## Cómo se comprueba

```bash
npm run typecheck
```

Ejecuta `tsc` sobre dos proyectos y **no genera ningún fichero** (`noEmit`): ni
`dist`, ni `.d.ts`, ni mapas. El runtime lo siguen produciendo Vite para el
navegador y Node directamente para el servidor.

Debe salir con **cero errores**. No se aceptan «casi limpio», ni avisos
silenciados, ni `@ts-ignore` para pasar el trámite.

## La configuración

| Fichero | Para qué |
|---|---|
| `tsconfig.base.json` | opciones comunes; no se usa directamente |
| `tsconfig.app.json` | lo que empaqueta Vite: `src/` y los contratos compartidos |
| `tsconfig.node.json` | lo que ejecuta Node: `vite.config`, `playwright.config`, `e2e/` |

### Rigor

Para lo que se escriba **nuevo** en TypeScript:

```
strict · noUncheckedIndexedAccess · noImplicitOverride
noFallthroughCasesInSwitch · noImplicitReturns · verbatimModuleSyntax
```

### `allowJs: true`, `checkJs: false`

Es la decisión central de esta fase, y es deliberada.

Encender `checkJs` sobre los ficheros JavaScript del producto de golpe
produciría cientos de errores que sólo se podrían callar con `any` o
`@ts-ignore`. Eso es **TypeScript cosmético**: la extensión cambia, la
seguridad no. Preferimos pocos ficheros realmente tipados a muchos ficheros
`.ts` llenos de escapes.

`checkJs` se irá encendiendo por módulos, a medida que se migren de verdad.

## Cómo se importa un módulo TypeScript

Con **la extensión real**, `.ts`:

```js
import { composeApiUrl } from './apiUrl.ts';
```

No es lo idiomático en otros proyectos, pero aquí es lo que funciona en los
tres sitios a la vez:

- **Node 24** ejecuta TypeScript directamente (borrado de tipos), y en ESM
  exige la extensión real del fichero. Es lo que permite que
  `node --test test/*.test.js` siga importando módulos migrados sin ningún
  compilador de por medio.
- **Vite** resuelve `.ts` explícito sin problema.
- **`tsc`** lo acepta con `allowImportingTsExtensions`, que sólo es válido con
  `noEmit` — que es justo nuestro caso.

Por eso el borrado de tipos de Node marca un límite real: **nada de `enum`,
`namespace` ni propiedades de constructor**, porque necesitan transformación y
no sólo borrado. Tipos, interfaces y `as const` sí.

## Contratos compartidos

Viven en `shared/contracts/` y su README explica las reglas. Lo esencial:

- **neutrales respecto al entorno** — sin `window`, `document`, DOM ni APIs de
  Node, para que la futura app de React Native los importe tal cual;
- **derivados del código real**, con la fuente canónica anotada en cada bloque;
- **nunca exponen** hashes de contraseña, interioridades de autenticación,
  secretos, datos bancarios, documentos privados del conductor ni el libro
  contable interno.

Preferimos `as const` + uniones antes que `enum`, porque no hace falta ningún
valor nuevo en ejecución.

## Qué se puede migrar, y qué no

**Buenos candidatos:** utilidades puras, constantes, tipos, ayudantes pequeños,
módulos sin efectos secundarios y con buena cobertura de pruebas.

**No en esta etapa:** `server/index.js`, Socket.IO, el despacho, la máquina de
estados del viaje, el núcleo de Transporte Seguro, la autenticación del
backend, las carteras, el cobro a la pasajera, PostgreSQL, el service worker,
la navegación compleja y los componentes de interfaz grandes.

**Nunca desde aquí:** DRIVER-FINANCE-1, que sigue pausado en
`feat/driver-finance-1` y no forma parte de esta línea.

## Reglas de escritura

**`any` no es una salida.** Preferir `unknown` y estrechar. Si una frontera con
código legado obliga a uno, se documenta ahí mismo por qué.

**Las aserciones describen invariantes, no silencian errores.** `as X` sólo
cuando se sabe algo que el compilador no puede deducir, y explicado.
`as unknown as X` sólo en un caso excepcional perfectamente justificado.

**`import type` siempre que el import sea sólo de tipos**, para que un contrato
de compilación no arrastre un import en ejecución. `verbatimModuleSyntax` lo
hace obligatorio.

## Mapa de migración

Sin fechas: son olas de trabajo, no un calendario.

```
Ola 1  ← AQUÍ ESTAMOS
       contratos compartidos + utilidades puras

Ola 2  la frontera del cliente de API y servicios de frontend escogidos
       (apiService por partes, no de una vez)

Ola 3  módulos de funcionalidad del frontend, uno a uno

Ola 4  módulos del backend, dentro de BACKEND-ARCH-1
       (aquí es donde entra la compilación del servidor, no antes)

Ola 5  contratos compartidos consumidos por la app nativa
```

## Preparación para BACKEND-ARCH-1

Lo que esa fase podrá reutilizar sin rehacerlo:

- `tsconfig.base.json` — el rigor y las opciones comunes ya están decididos;
- `shared/contracts/` — los tipos de dominio ya son neutrales respecto al
  entorno, así que el backend los importa sin adaptador;
- el comando `npm run typecheck` como puerta de validación.

Lo que **no** está hecho y le corresponde a esa fase: un `tsconfig.server.json`
propio, la decisión de compilar o seguir con el borrado de tipos de Node, y
cualquier cosa relacionada con NestJS. TYPESCRIPT-1 deja la pista preparada; no
construye el avión.

## Hallazgos anotados, no corregidos

Cosas que el tipado sacó a la luz y que **no** se tocan aquí porque cambiarlas
sería modificar el producto:

**1. `buildRequestError` puede devolver un error sin código.** Cuando el
servidor manda un cuerpo JSON sin campo `error`, el objeto compuesto sale sin
él:

```js
buildRequestError(400, { message: 'algo' })  // -> { message, status }
```

Los consumidores ya lo aguantan (`lastError?.error === '...'` da `undefined` y
usan su mensaje por defecto), así que no hay fallo en ejecución. El contrato
`ApiError` declara `error` como opcional para describir la verdad. Garantizar
siempre un código sería un cambio del contrato de errores: candidato para una
fase futura.

**2. `src/utils/constants.js` tiene contratos de dominio divergentes y sin
uso.** Declara un `TRIP_STATES` con `DRAFT`, `DRIVER_EN_ROUTE`,
`DRIVER_ARRIVED` e `IN_TRIP`, y un `DRIVER_STATUS` con `ONLINE`/`EN_ROUTE`, que
no coinciden con los canónicos de `server/domain/`. Hoy **nadie los importa**:
`TRIP_STATES`, `TRIP_TRANSITIONS` y `USER_ROLES` de ese fichero no tienen
consumidores. Los contratos compartidos se derivaron del servidor, que es la
autoridad. Retirar los del frontend es una limpieza legítima, pero es un cambio
de producto y no pertenece a esta fase.
