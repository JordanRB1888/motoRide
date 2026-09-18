# Recuperación de `api-staging.mas58express.com`

**Estado: RECUPERADO.** `https://api-staging.mas58express.com/api/health` → **HTTP 200**, certificado desde fuera.

| | |
|---|---|
| **Rama / HEAD desplegado** | `master` @ **`e6cb218`** |
| **Deployment ID** | **`d8d42949-c52f-4d72-8ece-f60babdf79fd`** · SUCCESS · 2026-09-13 04:28:04 UTC |
| **Entorno** | `staging` (`41eed8f7-ec22-455d-8d52-79e7ce41a431`) — production **no se tocó** |
| **Plan Railway** | **Free** (el trial expiró; el plan Free exige Serverless) |
| **Serverless real** | **ON** — `sleepApplication: true`, leído de la configuración guardada, no del interruptor |
| **Volumen** | `motoride-staging-volume` en `/data` · live · **70 MB ocupados** · mismo volumen de siempre |
| **Réplicas** | 1 corriendo, 0 caídas |
| **Fecha** | 13 de septiembre de 2026 |

---

## 1. Por qué fallaba el despliegue más reciente

Los tres intentos de hoy (`bf49e609` 03:55, `9f5e12e1` 04:19, `799c2606` 04:20) y el
mío por API (`aab625f3` 04:23) siguen todos el mismo patrón:

```
Initialization: OK
Build:          OK   →  image push · 79.9 MB · containerimage.digest: sha256:0d687c…
Deploy:         el flujo de logs de deploy viene VACÍO — el contenedor nunca arrancó
```

La causa está escrita en la documentación de Railway, y es la parte que el
interruptor no dice:

> «Serverless is applied to a container **when that container is created**.
> Enabling it on a running service does not affect the container already running;
> the service must be **deployed** before it takes effect.
> **This applies to the API too**: `serviceInstanceUpdate` writes the value and
> reads it back as set, but the running container keeps the value it was created
> with until the next deployment.»
> — <https://docs.railway.com/deployments/serverless>

Es decir: activaste Serverless y Railway lo guardó de verdad —lo confirmé leyendo
`sleepApplication: true` de la configuración—, pero **«Redeploy» reutiliza la
instantánea y el contenedor anteriores**, creados antes de la bandera. El plan
Free los rechaza por no ser serverless, y el rechazo ocurre *antes* de la etapa
de deploy: por eso el build sale bien y el deploy «no empieza».

**Lo que lo desbloqueó:** un despliegue **nuevo** desde cero (`railway up`), que
crea un contenedor nuevo y por tanto nace con la bandera aplicada. Railway lo
aceptó a la primera.

> Tu diagnóstico era correcto al no dar por bueno «el switch está activado». El
> valor estaba bien guardado; lo que no se aplicaba era al contenedor.

---

## 2. Un segundo hallazgo: se desplegó código viejo y se corrigió

El primer `railway up` lo lancé desde el árbol de trabajo de la rama
`feat/public-marketing-site`, dando por hecho que su `server/` estaba al día
porque `git diff master...HEAD -- server/` salía vacío.

**Ese diff engañaba.** Los tres puntos comparan contra la *base de fusión*, no
contra la punta de `master`. La comparación honesta:

```
git diff --stat master HEAD -- server/
→ 182 ficheros, 500 inserciones, 40.438 eliminaciones
```

Esa rama llevaba un `server/` muy anterior: sin `instrumentacion.js`, sin
`maintenance.js`, sin `domain/dispatchEligibility.js`, sin `scripts/`. Su
Dockerfile tenía 9 pasos en vez de 12. Ese despliegue (`e464bf10`) llegó a
responder 200, **pero no era el backend canónico**.

Se corrigió acto seguido: árbol de trabajo aparte en `master` y despliegue desde
ahí. La prueba está en los pasos del build:

```
[ 6/12] COPY instrumentacion.js ./instrumentacion.js
[ 7/12] COPY maintenance.js ./maintenance.js
[12/12] COPY scripts ./scripts
```

### Cuál es el código canónico

| Rama | HEAD | Relación |
|---|---|---|
| `master` | `e6cb218` (7-sep) | **Canónica.** Contiene todo lo de `feat/public-testing` más 10 commits |
| `feat/public-testing` | `26511c9` (7-sep) | **Totalmente fusionada en master.** `git rev-list --count master..feat/public-testing` = **0** |

`git merge-base master feat/public-testing` devuelve exactamente el HEAD de
`feat/public-testing`: master es un superconjunto estricto. Desplegar
`feat/public-testing` habría congelado staging en un estado anterior.

Marcadores verificados en `master:server`: `GOOGLE_MAPS_SERVICE_ACCOUNT_B64` (5),
`FCM_SERVICE_ACCOUNT_B64` (4), `WEB_PUSH_VAPID` (31), `RESEND_API_KEY` (13),
`CHAT_MEDIA_DIR` (21), `DATA_FILE` (62), `VENTANA_DE_OFERTA_MS` (11),
`DRIVER_OFFER_TIMEOUT_MS` (8), «Atomic lock» (1).

---

## 3. Arranque real del servicio

Registro del contenedor vivo (`d8d42949`), sin retocar:

```
Mounting volume on: …/vol_dixrqqjc12levcp0
Starting Container
[+58express Push] FCM configurado (entorno)
[+58express Push] transportes activos: webpush, fcm
[+58express Push] Web Push configurado
[+58express Auth] verificacion de contacto EXIGIDA para pedir viajes y gastar
[+58express Maps] autenticacion: OAuth con cuenta de servicio (no depende de la IP)
[+58express Database] backend = sqlite
[+58express Auth] verificacion: WHATSAPP=faltan 4, SMS=faltan 3, EMAIL=configurado;
                  social: GOOGLE=sin audiencia, APPLE=sin audiencia
[+58express Dispatcher] ventana de oferta = 30000 ms (por omision)
[+58express HTTP] trust proxy = 1 (entorno)
[+58express Observabilidad] Sentry ENCENDIDO (entorno=staging)
🚀 [+58express Backend Server] Running on http://localhost:8080
```

`vol_dixrqqjc12levcp0` es **el mismo identificador de volumen** que aparece en los
registros del 7 de septiembre: no se recreó nada.

---

## 4. Certificación

### Externa

```
GET https://api-staging.mas58express.com/api/health
→ HTTP 200 · 0,54 s
  {"status":"ok","message":"+58express Real Backend Server Active 🇻🇪", …}

cabecera x-railway-fallback → AUSENTE
GET https://motoride-staging.up.railway.app/api/health → 200
```

### Tabla de resultados

| Punto | Estado | Evidencia |
|---|---|---|
| Health HTTP 200 | **PASA** | 200 en el dominio propio y en el de Railway; sin `x-railway-fallback` |
| Servicio en línea | **PASA** | `state: online`, 1 réplica corriendo, 0 caídas |
| Serverless real | **PASA** | `sleepApplication: true` leído de la configuración guardada |
| Volume montado | **PASA** | `/data`, `vol_dixrqqjc12levcp0`, el mismo de siempre |
| Persistencia | **PASA PARCIAL** | 70 MB ocupados de antes; lectura/escritura probadas (alta 201, alta repetida 409 `USER_EXISTS`). **No** se forzó un reinicio para no arriesgar el servicio recién levantado |
| Auth / JWT | **PASA** | registro 201, login 200 con token, `/api/auth/me` 200, contraseña mala 401, sin token 401 |
| Passenger smoke | **PASA** | sesión de pasajero creada y consultada |
| SQLite staging | **PASA** | `backend = sqlite`; escritura y detección de duplicados verificadas |
| Socket.IO | **PASA** | handshake 200, `sid` emitido, `upgrades:["websocket"]`, `pingInterval: 25000` |
| Maps OAuth | **PASA PARCIAL** | «autenticacion: OAuth con cuenta de servicio» al arrancar. Llamada real a Places **no** ejecutada (ver abajo) |
| FCM | **CONFIGURADO, entrega NO PROBADA** | «FCM configurado (entorno)», «transportes activos: webpush, fcm». No hay token de dispositivo de prueba a mano |
| Web Push | **CONFIGURADO, entrega NO PROBADA** | «Web Push configurado» |
| Email / Resend | **PASA PARCIAL** | «EMAIL=configurado» al arrancar. No se envió correo real |
| Ventana de 30 s | **PASA (configuración)** | «ventana de oferta = 30000 ms (por omision)» en el proceso vivo |
| Places | **NO PROBADO** | 403 `CONTACT_NOT_VERIFIED` |
| Routes | **NO PROBADO** | ídem |
| Driver smoke | **NO PROBADO** | exige conductor aprobado por un administrador |
| Trip smoke | **NO PROBADO** | 403 `CONTACT_NOT_VERIFIED` |
| Aceptación >15 s y <30 s | **NO PROBADO** | depende del smoke de viaje |

### Por qué Places, Routes y el viaje quedan sin probar

No es un fallo: es la política del propio backend funcionando. Con el canal de
correo configurado, `requireContactoVerificado` exige verificación antes de pedir
viajes o gastar, y devuelve `403 CONTACT_NOT_VERIFIED` — que es exactamente lo
que respondió. Para atravesarlo hace falta el código que llega **por correo**, y
eso necesita un buzón real. No inventé un resultado ni mandé correos a una
dirección tuya sin pedírtelo.

**Una sola acción tuya lo desbloquea:** dime a qué dirección de correo puedo
mandar el código de verificación (o dame una de prueba), y completo Places,
Routes, el viaje, la oferta al conductor y la ventana de 30 s de una tirada.

---

## 5. Serverless: qué significa para este backend

Sin rediseñar nada, esto es lo que la documentación y el comportamiento medido
implican para +58Express.

**Cuándo duerme.** Railway detecta inactividad por tráfico **saliente**: sin
paquetes salientes durante 5 minutos, duerme (en la práctica entre 5 y 10).

**Aquí hay un detalle que cambia el cuadro:** el handshake de Socket.IO anuncia
`pingInterval: 25000`. Con un solo cliente conectado —un conductor en línea, un
pasajero en viaje— el servidor emite un ping cada 25 s, que es tráfico saliente.
**Mientras haya alguien conectado, el servicio no se duerme.** El ahorro sólo
ocurre cuando de verdad no hay nadie.

**Riesgos cuando sí duerme:**

| Riesgo | Efecto real |
|---|---|
| Arranque en frío | La primera petición tarda; la documentación avisa de que **puede devolver 502** |
| Socket.IO | Los clientes conectados se caen al dormirse; el reintento puede toparse con ese 502 |
| Presencia del conductor | El estado «en línea» vive en memoria: al despertar, **nadie figura conectado** hasta que cada conductor reconecte |
| Despacho | Un viaje creado justo al despertar puede no encontrar conductores elegibles, no porque no los haya, sino porque aún no han reconectado |
| Push | Con el servicio dormido no sale ningún push por su cuenta; la petición entrante lo despierta primero |
| Volumen | **Sin incompatibilidad.** Serverless y volumen conviven: este despliegue lleva los dos y funciona |
| Prioridad | Railway advierte que un servicio serverless queda **despriorizado** y «en casos remotos puede requerir una reconstrucción para revivir» |

**Para pruebas de la Beta sirve.** Para una demo con conductores reales esperando
ofertas, el arranque en frío y la pérdida de presencia son un problema de verdad:
el plan mínimo adecuado sería **Hobby**, que no obliga a serverless. No hace
falta decidirlo hoy.

---

## 6. Origen y despliegue automático

El servicio de staging tiene **`source: null`**: sin repositorio conectado. Por
eso cada recuperación exige un `railway up` a mano, y por eso el 7 de septiembre
llegó a desplegarse una imagen construida desde un árbol local con un Dockerfile
distinto al del repositorio.

**No lo he cambiado**, porque tocar la estrategia de ramas sin documentarla antes
era justamente lo que pediste evitar. La situación y la recomendación:

| Opción | Valoración |
|---|---|
| Conectar `master` | Es lo que usa *production*. Staging dejaría de ser una compuerta previa: lo mismo llegaría a los dos sitios a la vez |
| Conectar `feat/public-testing` | **Desaconsejado**: está fusionada por completo en master y no avanza desde el 7 de septiembre. Congelaría staging |
| Rama `staging` dedicada | **Lo recomendado.** Nace de `master`, se le fusiona lo que se quiera probar, y staging despliega sola desde ahí. Master sigue alimentando production |

Para dejarlo estable hace falta tu visto bueno a esa rama dedicada; en cuanto lo
des, la creo y conecto el autodespliegue.

Mientras tanto, el despliegue explícito del HEAD canónico es:

```bash
git worktree add C:/p58s master
cd C:/p58s && railway up --project 2b4ccff9-805e-404a-81e7-38f03939ec61 --environment 41eed8f7-ec22-455d-8d52-79e7ce41a431 --service 71f0cf6f-5d25-46fe-9d4e-c6a8bbd101f5 --ci
```

---

## 7. Cambios aplicados

1. **Despliegue nuevo de `master` @ `e6cb218`** a staging por `railway up`
   (deployment `d8d42949`). Es el único cambio que recuperó el servicio.
2. Un despliegue intermedio (`e464bf10`) con código antiguo, **sustituido de
   inmediato** por el canónico al detectar el error.
3. Dos usuarios de prueba creados en el SQLite de staging por el smoke test
   (`smoke.<sello>@example.com` y `smoke.duplicado@example.com`, ambos en
   `example.com`, sin verificar).

**No se tocó:** ni una variable de entorno, ni el volumen, ni el dominio, ni el
DNS, ni un secreto, ni una línea de código del backend, ni la web pública, ni
Mobile. **Ni production**: todas las llamadas llevaron el identificador de
staging. El despliegue fallido de production de hoy a las 03:55 (`652a3e31`) es
anterior a mi intervención y sigue con su propio `28P01` sin resolver, fuera de
esta ronda por decisión tuya.

---

## 8. Riesgos que quedan

1. **«Redeploy» desde el panel volverá a fallar** si algún día se reutiliza una
   instantánea anterior a la bandera. El camino fiable hoy es `railway up`.
2. **Sin repositorio conectado**, staging depende de que alguien despliegue a
   mano desde un árbol correcto — el mismo agujero por el que se coló código
   viejo en el intento de las 04:26.
3. **Arranque en frío y presencia perdida** con Serverless (§5).
4. **La persistencia entre contenedores no se forzó**: la evidencia es sólida
   (mismo volumen, 70 MB previos, lectura y escritura vivas) pero no se provocó un
   reinicio a propósito.
5. **Places, Routes, conductor y viaje siguen sin certificar** hasta que haya un
   buzón para el código de verificación.
6. **Production sigue caída** por el `28P01` de `DATABASE_URL`, intacto.

---

## 9. Anexo: el diagnóstico anterior (12 de septiembre)

La caída original tuvo otra causa, ya resuelta: **el trial de Railway expiró** y
la plataforma detuvo los contenedores de los dos entornos el **8 de septiembre a
las 05:05 UTC**. El registro del último despliegue sano lo muestra sin ningún
error previo:

```
2026-09-07T16:04:57Z  [Socket.IO] Atomic lock success! Ride assigned to Beta
2026-09-07T19:12:34Z  [Socket.IO] Client disconnected
2026-09-08T05:05:32Z  Stopping Container          ← sin error, sin excepción
```

El contenedor de *production* se detuvo once segundos antes: un evento de cuenta,
no un fallo de aplicación. Las trece comprobaciones de entonces (healthcheck,
PORT, bind, volumen, variables, migraciones, DNS, asociación de dominio) salieron
todas correctas, y siguen siéndolo.
