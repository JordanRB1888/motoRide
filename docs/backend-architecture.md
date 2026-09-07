# Arquitectura del backend de +58express

## Dónde estamos

```
ACTUAL   Node 24 · Express 5 · Socket.IO 4 · PostgreSQL (pg) · ESM · sin compilar
OBJETIVO NestJS + TypeScript, módulo a módulo, con Express como adaptador
```

El backend real vive en `server/index.js`: **2.623 líneas** que concentran
rutas HTTP, Socket.IO, despacho, autenticación, cobro y persistencia. Arranca
con `node index.js`, sin compilación de por medio.

**BACKEND-ARCH-1 no reemplaza nada de eso.** Demuestra que NestJS puede
convivir con lo que hay, para que las fases siguientes puedan mover módulos de
uno en uno.

## Inventario del backend actual

| Aspecto | Estado |
|---|---|
| Entrypoint | `server/index.js`, arrancado por `node index.js` |
| HTTP | Express 5 sobre `http.createServer` |
| Sockets | Socket.IO 4 atado al mismo servidor HTTP (`new Server(server, …)`) |
| Base de datos | `pg` directo, sin ORM. PostgreSQL es la autoridad |
| Autenticación | `requireAuth` / `requireRole` con JWT, como middleware de Express |
| Errores | JSON `{ error: CÓDIGO }` con el estado HTTP; el cliente lo compone en `httpErrorCodes` |
| Apagado | `server.listen(...)` sin manejadores de señal explícitos |
| Módulos | ESM nativo (`"type": "module"` en `server/package.json`) |

## La limitación que decide la arquitectura

TYPESCRIPT-1 dejó todo el proyecto ejecutándose **sin compilar**: Node 24 borra
los tipos y ejecuta el `.ts` directamente. Con NestJS eso **no funciona**, y no
es una opinión:

```
@Marca()
^
SyntaxError: Invalid or unexpected token
```

El borrado de tipos quita anotaciones; **un decorador necesita
transformación**, que es otra cosa. Y NestJS se apoya en decoradores para todo:
`@Module`, `@Injectable`, `@Controller`, `@Get`.

De ahí salen dos consecuencias que conviene tener claras:

**1. `server/nest/` es el único proyecto del repositorio que compila.**
`tsconfig.server.json` emite a `server/dist-nest/`, con
`experimentalDecorators` y `emitDecoratorMetadata`. El backend legacy sigue sin
compilarse.

**2. Sus imports llevan `.js`, no `.ts`.** No es una inconsistencia con el
resto del repositorio: es la consecuencia directa. En `src/` el import nombra
el fichero que Node ejecuta (`.ts`); en `server/nest/` nombra el fichero
emitido (`.js`). Dos convenciones, dos razones, ambas correctas.

Otra consecuencia menor: `isolatedModules` está desactivado en el backend
porque es incompatible con `emitDecoratorMetadata` —la metadata necesita ver
los tipos, que es justo lo que ese modo prohíbe—, y
`strictPropertyInitialization` también, porque las clases de Nest se rellenan
por inyección.

### ESM y NestJS

NestJS se distribuye como CommonJS y el backend es ESM. **Funciona** mediante
la interoperabilidad de Node, sin convertir nada a CommonJS y sin crear una
segunda arquitectura incompatible. `reflect-metadata` debe importarse **antes**
que cualquier cosa de Nest: es donde los decoradores guardan su metadata.

## Qué existe hoy

```
server/nest/
  main.ts                      arranque SEPARADO, no productivo
  app.module.ts                raíz, con un módulo
  system/clock.provider.ts     el ejemplo de inyección de dependencias
  health/                      el primer módulo
  test/foundation.test.js      10 pruebas
```

`server/index.js` **no ha cambiado ni una línea**, y sigue siendo el arranque
de producción. `main.ts` existe para poder ejecutar y probar la fundación sin
tocar el servicio real; Railway no lo usa y no hay dos servidores a la vez.

### El módulo de ejemplo

`Health` reproduce **exactamente** el contrato de `/api/health` que ya sirve el
backend actual: mismo estado, mismo mensaje, mismas características, misma
forma. Una prueba compara los dos leyendo el contrato legacy del propio
`server/index.js`, así que si alguien cambia uno y no el otro, la prueba lo
dice.

Se eligió porque es de solo lectura, no toca base de datos y no publica nada
sensible.

### La inyección de dependencias

El reloj (`system/clock.provider.ts`). Es pequeño a propósito: sustituirlo en
una prueba convierte el `timestamp` en algo comprobable en vez de un valor que
solo se puede mirar de reojo.

Y no envuelve nada del monolito deliberadamente. Un `LegacyEverythingService`
demostraría que se sabe escribir un `@Injectable`, no que la arquitectura vaya
a alguna parte.

## Reglas que no se negocian

```
· Node sigue siendo el runtime
· Express es el adaptador; Fastify solo se evaluará con un benchmark real
· PostgreSQL sin ORM. No hay TypeORM, ni Prisma, ni Sequelize, ni MikroORM
· los contratos de dominio se comparten desde `shared/contracts/`, no se duplican
· módulo a módulo; nunca una reescritura de golpe
· los sockets van después, en su propia fase
· Driver Finance sigue PAUSADO y fuera de esta línea
```

## Estrategia: reemplazo por estrangulamiento

Ninguna ruta se mueve de golpe. Para cada una:

```
1. la ruta legacy sigue sirviendo el tráfico
2. se escribe su equivalente en Nest
3. pruebas de CONTRATO: mismo estado, misma forma, misma semántica
4. se traspasa el tráfico, y solo entonces
5. se retira la legacy — nunca antes de verificar
```

BACKEND-ARCH-1 llega hasta el punto 3, y solo para un endpoint de salud que ni
siquiera sirve tráfico real.

## Olas de migración

Sin fechas: son olas de trabajo.

```
Ola 0  ← AQUÍ ESTAMOS
       fundación: bootstrap, DI, un módulo, pruebas de contrato

Ola 1  configuración, sistema, salud e infraestructura pura

Ola 2  módulos de API de solo lectura y bajo riesgo

Ola 3  adaptador de autenticación y usuarios, incremental

Ola 4  modelos de lectura del panel de administración

Ola 5  fronteras HTTP de los viajes

Ola 6  Socket.IO y tiempo real

Ola 7  despacho

Ola 8  Transporte Seguro

Finance  PAUSADO hasta decisión del dueño
```

### Mapa de riesgo de lo que hoy vive en `server/index.js`

| Responsabilidad | Riesgo | Por qué |
|---|---|---|
| Health, configuración, precios (lectura) | **BAJO** | sin estado, sin efectos, contrato pequeño |
| Notificaciones, push | **BAJO** | efectos aislados y ya con su router |
| Usuarios, conductores (lectura) | **MEDIO** | proyecciones y permisos, sin dinero |
| Solicitudes de conductor, medios | **MEDIO** | documentos privados: la autorización es la parte delicada |
| Administración (lectura) | **MEDIO** | mucha superficie, poco riesgo por operación |
| Autenticación | **ALTO** | es la autoridad; no puede haber dos a la vez |
| Viajes y su máquina de estados | **ALTO** | el orden de las transiciones es dinero |
| Despacho y tiempo real | **ALTO** | ventanas de quince segundos y sockets vivos |
| Transporte Seguro | **ALTO** | compromisos, cobertura y facturación |
| Cobro a la pasajera y carteras | **ALTO** | dinero real, exactamente una vez |
| Núcleo transaccional de PostgreSQL | **ALTO** | cerrojos, orden global, idempotencia |

## Cómo se migrarán las piezas delicadas

**Autenticación.** `requireAuth` y `requireRole` siguen siendo la autoridad.
Cuando llegue su ola, los Guards de Nest deberán **delegar** en la misma
comprobación, no reimplementarla: dos autoridades de autenticación conviviendo
es una vulnerabilidad, no una migración.

**Errores.** El contrato actual es `{ error: CÓDIGO }` más el estado HTTP, y
`shared/contracts/api.ts` ya lo describe. Nest tendrá que adaptarse **a él**
con un filtro de excepciones: ningún cliente puede empezar a recibir una forma
distinta de error solo porque Nest tenga sus propias excepciones.

**Sockets.** No se duplicará el servidor de Socket.IO ni se cambiarán
namespaces o eventos. Los gateways de Nest, si llegan, tendrán que atarse al
mismo servidor HTTP.

**Base de datos.** `pg.Pool`, el pooler, el TLS, las transacciones y el orden
de cerrojos se quedan como están. Nest no necesita un ORM para existir, y
meterlo aquí cambiaría la parte del sistema que más ha costado estabilizar.

## Comandos

```bash
npm run typecheck    # app + herramientas + backend, sin emitir nada
npm run build:nest   # compila server/nest -> server/dist-nest
npm run test:nest    # compila y ejecuta las pruebas de la fundación
npm run dev:nest     # arranca la fundación en NEST_PORT (4100 por defecto)
```

`npm start` del backend **no cambia**: sigue siendo `node index.js`.

## Lo que esta fase deliberadamente NO hizo

```
✗ mover una sola ruta de negocio
✗ tocar Socket.IO, el despacho o la máquina de estados
✗ tocar la autenticación, las carteras o el cobro a la pasajera
✗ tocar PostgreSQL, el esquema o las transacciones
✗ cambiar el arranque de producción
✗ abrir un segundo servidor en Railway
✗ introducir un ORM, Fastify, GraphQL o Swagger
✗ incluir Driver Finance, que sigue pausado
```
