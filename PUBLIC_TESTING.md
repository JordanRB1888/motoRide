# +58Express — pruebas públicas

Cómo se lleva +58Express a manos de gente que no está en esta casa: qué hay
montado, qué falta, y cómo se genera un APK Beta.

> **Estado: staging en pie.** El backend de pruebas ya responde por internet y
> exige sesión. Falta el correo, la recuperación de contraseña y el APK. Al
> final está la lista exacta de lo que queda y de quién depende cada cosa.

---

## 1. Los tres entornos

| | Dónde corre | Datos | Quién lo usa |
|---|---|---|---|
| **Local** | `localhost:4000` + Metro | SQLite del portátil | quien programa |
| **Staging** | Railway, `motoride-staging.up.railway.app` | SQLite en su propio volumen | los amigos que prueban |
| **Producción** | Railway (`motoride-production-4ce4.up.railway.app`) | la de verdad | nadie todavía |

La regla que ordena todo esto: **la beta jamás toca producción**. No es
prudencia abstracta — sin esa separación, alguien probando crea viajes de
mentira y mueve saldos en los datos reales, y se descubre tarde.

La aplicación móvil ya la cumple por construcción: `mobile/config/environment.ts`
no tiene ninguna URL de producción escrita como respaldo, ni comentada. Si falta
la configuración, **no arranca** en vez de caer a producción.

---

## 2. Direcciones

Dominio: **`mas58express.com`** (sin acento, a propósito — ver §7).

Registrado en Vercel el 6 de septiembre de 2026, con sus nameservers.

| Nombre | Apunta a | Estado |
|---|---|---|
| `api-staging.mas58express.com` | `j3zhwhkt.up.railway.app` (CNAME) | **creado**, certificado emitiéndose |
| `admin-staging.mas58express.com` | panel de administración | pendiente |
| `mas58express.com` | landing / la aplicación | pendiente |

Mientras el certificado del subdominio termina de emitirse, la dirección que
funciona es la de Railway: `https://motoride-staging.up.railway.app`.

---

## 3. Variables

**Ninguna con valores aquí.** Los nombres bastan; los valores viven en Railway
y en los ficheros locales que Git ignora.

### Servidor (Railway, entorno staging)

Plantilla completa y comentada en [`server/.env.example`](server/.env.example).

| Variable | Nota |
|---|---|
| `NODE_ENV` | `production` — es un despliegue real, aunque sea de pruebas |
| `PORT` | lo pone Railway |
| `DATABASE_URL` | **sin poner a proposito** — ver la nota de abajo |
| `JWT_SECRET` | **propio de staging**, nunca el de producción |
| `CLIENT_ORIGIN` | los orígenes admitidos por CORS |
| `TRUST_PROXY` | Railway va detrás de proxy |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | la cuenta de administración inicial |
| `GOOGLE_MAPS_SERVICE_ACCOUNT_B64` | la cuenta de Maps en base64, una sola línea |
| `WEB_PUSH_VAPID_*` | avisos en la web |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | el correo de confirmación y de recuperación |

Sobre la base de datos: staging arranca con **SQLite en su propio volumen**,
no con Postgres. El servidor admite las dos --`DATABASE_URL` presente elige
Postgres, ausente elige SQLite en `DATA_FILE`-- y esto pone staging en pie hoy,
gratis y con los datos completamente separados de los de produccion, que es lo
que de verdad importaba.

Tiene un precio y conviene decirlo: produccion usa Postgres, asi que un fallo
que solo aparezca en Postgres no se veria aqui. Cuando exista un segundo
proyecto de Supabase, se pone su `DATABASE_URL` en este entorno y staging pasa
a Postgres sin tocar ni una linea de codigo.

Sobre Maps: **no** se sube el JSON como fichero. Va en `..._B64` porque la
imagen del servidor no copia ninguna credencial dentro, y porque un JSON de
varias líneas en el entorno de Railway acaba mal escapado y termina en un
registro. Se decodifica en memoria. Todo el detalle está en
[`../agent-reports/claude-google-maps-server-oauth-migration.md`](../agent-reports/claude-google-maps-server-oauth-migration.md).

Cuando OAuth esté certificado en staging, **quita `DISPATCH_ROUTES_API_KEY`**
de ese entorno: mientras exista, existe un respaldo que depende de la IP.

### Móvil

Plantilla en [`mobile/.env.staging.example`](mobile/.env.staging.example).

Todo lo que empieza por `EXPO_PUBLIC_` **viaja dentro del APK** y se puede leer
descompilándolo. Por eso ahí sólo hay la dirección del backend, el nombre del
entorno y las claves de mapa restringidas por paquete y huella. Nunca una clave
de servidor.

---

## 4. Generar un APK Beta

La beta se llama **«+58Express Beta»** bajo el icono y conserva el paquete
`com.plus58express.app`. Por qué conserva el paquete, en §7.

### Con Gradle, en este ordenador

```bash
cd mobile && cp .env.staging.example .env.staging
```

Se rellena `.env.staging`, y entonces:

```bash
cd mobile && APP_VARIANT=beta npx expo prebuild --platform android --clean
```

```bash
cd mobile/android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleRelease
```

El APK sale en `mobile/android/app/build/outputs/apk/release/`.

### Con EAS, en la nube

Hay un perfil `staging` en [`mobile/eas.json`](mobile/eas.json): APK, release,
distribución interna, sin cliente de desarrollo. Necesita sesión de Expo.

```bash
cd mobile && npx eas-cli build --platform android --profile staging
```

---

## 5. La prueba que de verdad importa

Un APK que funciona con el portátil encendido no demuestra nada. La prueba es
ésta, y se hace **con el ordenador apagado**:

1. Parar el servidor local y Metro.
2. Quitar cualquier reenvío de puertos de ADB.
3. Poner el teléfono en **datos móviles**, no en la wifi de casa.
4. Abrir el APK instalado.
5. Registrarse con un correo de verdad, y que **llegue** el de confirmación.
6. Entrar.
7. Pedir una carrera y ver el mapa.
8. Que el conductor la reciba **en el momento** (eso es el WebSocket).
9. Recuperar la contraseña de extremo a extremo.
10. Que el error de la prueba aparezca en Sentry marcado como `staging`.

Si algo de esto necesita que tu ordenador esté encendido, la prueba **no ha
pasado**.

---

## 6. Lista para quien prueba

- [ ] Registro con correo propio
- [ ] Llega el correo de confirmación
- [ ] Sin confirmar, no se entra a lo protegido
- [ ] Entrar y salir
- [ ] Recuperar contraseña
- [ ] Permiso de ubicación
- [ ] Pedir carrera: origen, destino, búsqueda
- [ ] Aparece conductor y se sigue en el mapa
- [ ] Chat entre las dos partes
- [ ] Terminar y calificar
- [ ] Postularse como conductor
- [ ] Aprobación desde administración
- [ ] Ponerse disponible y recibir una oferta
- [ ] Aceptar, llegar, iniciar, finalizar
- [ ] Llegan las notificaciones con la aplicación cerrada

---

## 7. Dos decisiones que conviene entender

### El dominio va sin acento

`más58express.com` existe y está libre, pero como dominio **operativo** rompe
cosas concretas: `no-reply@más58express.com` falla en la mayoría de servidores
de correo —el soporte de SMTPUTF8 es irregular—, las herramientas de SPF, DKIM
y DMARC lo tratan de forma inconsistente, y los enlaces profundos de Android
hay que escribirlos en Punycode (`xn--ms58express-k7a.com`), que es ilegible.

Se compra `mas58express.com` y con eso todo funciona de forma estándar. Si
algún día se quiere la tilde como marca, se compra aparte y se redirige — nunca
al revés.

### La beta conserva el paquete de Android

Lo natural sería darle un `applicationId` propio para que conviva con la
aplicación de verdad. No se hace **todavía**, y no por pereza: en Android el
paquete es la identidad con la que están firmadas tres credenciales distintas.

- `google-services.json` ata FCM a `com.plus58express.app`. Otro paquete, y las
  notificaciones dejan de llegar.
- La clave de Maps de Android está restringida por paquete y huella SHA-1. Otro
  paquete, y el mapa sale gris.
- Los clientes OAuth de Google Sign-In, igual. Otro paquete, y no se entra con
  Google.

Cambiarlo obliga a dar de alta las tres otra vez, en tres consolas. Mientras no
haya una versión de producción instalada en ningún teléfono, no hay con qué
convivir y ese precio no compra nada. El día que la haya, se cambia el paquete
**y** se dan de alta las tres credenciales a la vez: por separado no funciona.

---

## 8. Lo que falta, y de quién depende

### Hecho

- **Backend de staging en pie y publico**, con sesion exigida (401 sin token) y
  su cuenta de administracion propia, separada de la de produccion
- Dominio `mas58express.com` registrado, con el CNAME de `api-staging` creado
- Todo el trabajo subido a GitHub, incluido el WIP de Antigravity que solo
  existia en un arbol local (`checkpoint/agent-design-wip`)
- Ramas de Claude y de Antigravity/Codex integradas en `feat/public-testing`
- Nueve errores de tipos y tres pruebas rotas del trabajo en curso, arreglados
- Móvil 1141/1141 · Frontend 644/644 · Servidor 1228 · typechecks limpios
- Variante Beta, perfil de EAS y plantilla de entorno
- **Recuperar contraseña conectada en el móvil**, de extremo a extremo salvo el
  correo: el enlace lleva al flujo, se pide el código y la contraseña nueva se
  manda junto a él, que es como lo quiere el servidor
- Migración de Maps a OAuth de servidor (falta certificarla)

### Falta, y lo tienes que hacer tú

| Qué | Por qué no puedo yo |
|---|---|
| Comprar `mas58express.com` | es un pago |
| Cuenta de servicio de Maps en Google Cloud | hay que entrar en tu consola |
| Cuenta de correo (Resend o SendGrid) | crear cuentas es cosa tuya |
| Cuenta de Cloudflare Turnstile | igual |
| Cuenta de Sentry | igual |
| Base de datos de staging | decisión de gasto |
| Sesión de Expo, si se usa EAS | son tus credenciales |

### Falta, y lo hago yo en cuanto se pueda

| Qué | Qué espera |
|---|---|
| Panel de administracion en `admin-staging` | desplegar el frontend |
| Confirmación de correo obligatoria | el proveedor de correo |
| Turnstile en registro y recuperación | las claves |
| Sentry con `environment=staging` | el proyecto de Sentry |
| Certificar Maps y la prueba de cambio de IP | la cuenta de servicio |
| Construir y probar el APK | que staging esté en pie |

---

## 9. Dos cosas que conviene saber

**No hay Supabase Auth.** Supabase aquí es sólo el **alojamiento de Postgres**:
`DATABASE_URL` y las migraciones de `supabase/migrations/`. La autenticación es
propia del servidor —bcrypt y JWT en `server/services/authIdentityStore.js`—, no
hay cliente `@supabase/supabase-js` en ninguna parte y el control de acceso lo
hace el servidor, no RLS. Todo lo que hable de «Site URL», «Redirect URLs» o
`service_role` no aplica: los enlaces de confirmación y de recuperación los
tiene que emitir y validar nuestro backend.

**Recuperar contraseña sí existe.** Aquí me equivoqué en una versión anterior de
este documento: dije que no había nada, buscando rutas del tipo
`/api/auth/password/reset`. No las hay porque el flujo va por los endpoints
genéricos de verificación, con `purpose: PASSWORD_RESET`.

Y está bien hecho: el servidor valida la contraseña nueva **antes** de gastar el
código —una contraseña corta no quema el código ni obliga a pedir otro— y al
cambiarla marca `credentialsChangedAt`, con lo que toda sesión abierta antes
deja de valer. Que es lo que espera quien la cambia porque cree que alguien más
la sabe.

Lo que faltaba era el camino desde la aplicación: «¿Olvidaste tu contraseña?»
abría un aviso diciendo que no se podía. Ya lleva al flujo, arrastrando el
correo que se hubiera escrito. Falta el proveedor de correo para que el código
llegue de verdad.
