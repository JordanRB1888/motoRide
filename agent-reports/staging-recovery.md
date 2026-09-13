# Recuperación de `api-staging.mas58express.com`

**Fecha del diagnóstico:** 12 de septiembre de 2026
**Estado:** **diagnosticado y bloqueado.** La causa está probada; la acción que
lo resuelve es tuya y no puede hacerla ningún agente.

---

## 1. Resumen en una línea

**El trial de Railway expiró.** La plataforma detuvo los contenedores de los dos
entornos el **8 de septiembre a las 05:05 UTC**, y desde entonces no hay ninguna
aplicación desplegada que sirva el dominio.

No es un fallo del healthcheck, ni del puerto, ni del bind, ni del volumen, ni de
las variables, ni de las migraciones, ni del DNS, ni de la asociación del
dominio. Todo eso está correcto y se comprobó uno por uno (§4).

---

## 2. La prueba

Al pedirle a Railway que volviera a desplegar el servicio, su propia API
respondió:

```
Your trial has expired. Please select a plan to continue using Railway.
Latest deployment for this service: 4ca6e957-fa33-41eb-b508-2a840aca13cd (REMOVED).
```

Y el borde de Railway lo confirma desde fuera, tanto en el dominio propio como en
el de Railway — es decir, **no es el dominio personalizado**:

```
GET https://api-staging.mas58express.com/api/health
→ HTTP/1.1 404 Not Found
  Server: railway-hikari
  x-railway-fallback: true
  {"status":"error","code":404,"message":"Application not found", ...}

GET https://motoride-staging.up.railway.app/api/health
→ 404
```

Estado del entorno según Railway:

```
staging · motoRide · state: "offline" · activeDeployments: []
```

---

## 3. Qué pasó, con horas

El servicio **estuvo sano y sirviendo tráfico real** hasta que lo pararon. Del
registro del último despliegue bueno (`4ca6e957`, entorno *staging*):

```
2026-09-07T16:01:21Z  [Dispatcher] dispatch_eligibility  eligibleDriverCount: 1
2026-09-07T16:01:21Z  [Push] push_success  host: fcm  statusCode: 200
2026-09-07T16:04:57Z  [Socket.IO] Atomic lock success! Ride [trip_…] assigned to Beta
2026-09-07T17:43:03Z  [Socket.IO] Client disconnected …
2026-09-07T19:12:34Z  [Socket.IO] Client disconnected …
2026-09-08T05:05:32Z  Stopping Container          ← sin error, sin excepción
```

Ni una traza de error antes del apagado: **el proceso no se cayó, lo pararon**.

Y no fue solo staging. El despliegue que corría en *production* registra
`updatedAt` a las **05:05:21 UTC** del mismo día — once segundos antes. Dos
contenedores, en dos entornos distintos, detenidos a la vez: eso es un evento de
cuenta, no un fallo de aplicación.

| Entorno | Último despliegue | Estado | Qué pasó |
|---|---|---|---|
| `staging` | `4ca6e957-fa33-41eb-b508-2a840aca13cd` | REMOVED | Sano hasta el 8-sep 05:05:32 UTC |
| `production` | `9c298b6e-3bb7-40fa-9d7a-95fa4459f268` | FAILED | Falló antes, el 7-sep (§6) |

---

## 4. Las trece comprobaciones, una por una

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Logs de despliegue | Revisados en los dos entornos (§3, §6) |
| 2 | Logs de build | Sin fallo de build en el último bueno: llegó a ejecutarse y sirvió tráfico |
| 3 | Logs de runtime | Limpios hasta `Stopping Container` |
| 4 | Healthcheck | `/api/health` — **no es el problema**: no hay proceso al que preguntar |
| 5 | PORT | `const PORT = process.env.PORT \|\| 4000` — Railway lo inyecta; el dominio apunta al 8080 y funcionó |
| 6 | Bind a `0.0.0.0` | `server.listen(PORT, …)` sin host → Node escucha en todas las interfaces. Correcto |
| 7 | Start command | `node index.js`, `rootDirectory: server`. Correcto |
| 8 | Volumen `/data` | `motoride-staging-volume`, 500 MB, región ams, **state: live**. Se montaba bien (`Mounting volume on: …`). **Los datos siguen ahí** |
| 9 | Variables de entorno | 21 definidas en staging, ninguna vacía ni sellada. No falta ninguna |
| 10 | Migraciones / arranque | Staging **no usa Postgres** (no hay `DATABASE_URL`): va sobre fichero en el volumen. No hay migración que fallar |
| 11 | Excepciones antes del `listen` | Ninguna en el último despliegue bueno |
| 12 | Timeout del healthcheck | 120 s. Irrelevante aquí |
| 13 | Asociación servicio/dominio | **Correcta**: `api-staging.mas58express.com` → entorno *staging*, puerto 8080, id `c71093b8-b687-4e4c-b5bf-771dfdcc5a04` |

**DNS:** intacto y correcto, no se tocó nada.
`api-staging.mas58express.com` → CNAME `j3zhwhkt.up.railway.app`.

> **Corrección a un informe anterior.** En
> [`public-website-premium.md`](./public-website-premium.md) §9 atribuí la caída
> al despliegue fallido del 7 de septiembre en el healthcheck. Eso es cierto para
> el entorno *production*, pero **`api-staging` lo sirve el entorno *staging***,
> que es otro despliegue y cayó por otra razón: el trial. Aquel informe queda
> corregido por este.

---

## 5. Lo único que lo desbloquea

**Seleccionar un plan en Railway.** Es una decisión de pago y la tomas tú: no la
hago yo en tu nombre, y de hecho la API la rechaza igualmente mientras el trial
esté expirado.

<https://railway.com/workspace/e45d0012-5d47-4db1-a999-fcc055292800/billing>

Cuando el plan esté activo:

1. El servicio `motoRide` de *staging* **no tiene repositorio conectado**
   (`source: null`) y su último build fue retirado, así que no se puede
   «redesplegar» sin más. Hay dos caminos:
   - conectar `JordanRB1888/motoRide` (rama `master`, *root directory* `server`)
     al servicio en el panel, que despliega solo; **o**
   - subirlo desde esta máquina:
     ```bash
     railway up --project 2b4ccff9-805e-404a-81e7-38f03939ec61 --environment 41eed8f7-ec22-455d-8d52-79e7ce41a431 --service 71f0cf6f-5d25-46fe-9d4e-c6a8bbd101f5
     ```
2. **No hace falta tocar ninguna variable, ni el volumen, ni el dominio, ni el
   DNS.** Todo eso sigue en su sitio.
3. Avísame y hago la verificación externa y el smoke test completo.

---

## 6. Aparte: *production* tiene además un fallo real de credenciales

Independiente del trial, y hay que resolverlo antes de levantar ese entorno.

**Despliegue:** `9c298b6e-3bb7-40fa-9d7a-95fa4459f268`
**Commit:** `e6cb218` — *feat(bd): el esquema completo de PostgreSQL…*
**Etapa:** `HEALTHCHECK` · **Fecha:** 7-sep-2026 18:41 UTC

```
error: password authentication failed for user "postgres"
  severity: 'FATAL'
  code: '28P01'
    at async attempt (file:///app/services/databaseBackend.js:36:11)
    at async runStartupWithRetry (file:///app/services/startupRetry.js:106:25)
    at async file:///app/index.js:472:25
[+58express Database] {"event":"database_startup_permanent_failure","attempt":1,"category":"28P01"}
```

El proceso **muere antes de escuchar**, así que el healthcheck de `/api/health`
no falla por lentitud: falla porque no hay nada escuchando. Se reinició cuatro
veces en siete segundos y Railway paró el contenedor a los ocho minutos.

Y esto **es el diseño funcionando**, no un error de programación:
`services/startupRetry.js` clasifica `28P01` como fallo **permanente** y no lo
reintenta, con este razonamiento escrito en el propio módulo —

> «Un fallo de autenticación, de certificado o de configuración falla RÁPIDO:
> reintentarlo escondería un problema real.»

**Qué significa:** la contraseña de `DATABASE_URL` ya no autentica contra el
Postgres de Supabase. Sucede cuando se rota la contraseña en Supabase, cuando se
restaura el proyecto, o cuando la URL se reescribió con un marcador de posición o
con caracteres sin codificar.

**Qué NO se hizo:** no se leyó ni se modificó ninguna variable. La integración
devuelve los valores redactados (`valuesRedacted: true`), así que ni yo ni nadie
por esta vía puede ver la contraseña — que es como debe ser. Arreglarlo exige
poner un `DATABASE_URL` válido, y eso sale de Supabase, no de aquí.

---

## 7. Lo que este informe NO puede afirmar todavía

Se pidió confirmar servicios y correr un smoke test. **Nada de eso se puede
ejecutar sin servidor**, y no voy a darlo por bueno sin haberlo visto:

| Pendiente de verificar | Por qué no se puede aún |
|---|---|
| `GET /api/health` → 200 | No hay aplicación desplegada |
| Registro / login | ídem |
| Endpoint Places · endpoint Routes | ídem |
| Sesión de pasajero · sesión de conductor | ídem |
| Maps OAuth · FCM · Web Push · email · Auth | ídem |
| Persistencia del volumen | El volumen está `live`, pero no se ha leído ningún dato desde la app |

Lo que **sí** consta, por los registros del 7 de septiembre: **FCM entregaba
pushes con `statusCode: 200`**, el despacho asignaba viajes y Socket.IO mantenía
sesiones de pasajero y de conductor. Es evidencia de que funcionaban entonces —
no de que funcionen ahora.

Las variables de los servicios siguen definidas en staging:
`GOOGLE_MAPS_SERVICE_ACCOUNT_B64`, `FCM_SERVICE_ACCOUNT_B64`,
`WEB_PUSH_VAPID_*`, `RESEND_API_KEY`, `EMAIL_PROVIDER`, `EMAIL_FROM`,
`JWT_SECRET`, `DATA_FILE`, `CHAT_MEDIA_DIR`, `SENTRY_DSN`. Ninguna se tocó.

---

## 8. Riesgos restantes

1. **El volumen sigue vivo, pero no se ha leído.** `motoride-staging-volume`
   está `live` y nunca se desmontó, así que los datos deberían estar intactos.
   Hasta que la app arranque y responda, eso es una expectativa razonable, no un
   hecho comprobado.
2. **Al levantar *production* reaparecerá el `28P01`** si no se corrige antes el
   `DATABASE_URL`. Levantar el plan no arregla ese entorno.
3. **Staging no tiene repositorio conectado.** Mientras siga así, cada
   recuperación exige `railway up` a mano desde una máquina con el código.
4. **Un trial expirado no avisa antes de parar.** Si el servicio vuelve a
   depender de crédito limitado, el mismo apagón puede repetirse sin previo
   aviso y sin dejar ni una traza de error en los registros de la aplicación.

---

## 9. Lo que NO se tocó

Ni una línea de código. Ni una variable de entorno. Ni un registro DNS. Ni la web
pública. Ni Mobile, ni Admin, ni Backend. Las únicas operaciones fueron de
lectura, salvo un intento de redespliegue que Railway rechazó — y ese rechazo es,
precisamente, la prueba de la causa.
