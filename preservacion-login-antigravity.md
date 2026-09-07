# Preservación del trabajo visual de Antigravity

**Login aprobado a salvo · Passenger descartado · Botones sociales añadidos**

| | |
|---|---|
| Rama visual | `ui/login-antigravity-preservation` |
| Base | `d0fa9a4` (master) — **no** la rama de 4C |
| HEAD | `84df79f` |
| Commits | 4 |
| Respaldo | `F:\proyectos app web\motoRide-backup-antigravity-20260819` |
| Estado | **Login preservado y verificado en el navegador** |

---

## 1. Respaldo — lo primero, antes de tocar nada

```
BACKUP_CREATED:  YES
BACKUP_LOCATION: F:\proyectos app web\motoRide-backup-antigravity-20260819
```

Contiene, **fuera del repositorio**, tres formas de recuperación independientes:

| Contenido | Detalle |
|---|---|
| `archivos/` | copia literal de los 7 archivos modificados |
| `antigravity-tracked.patch` | parche completo, 92 KB, 7 archivos |
| `untracked/` | los assets nuevos (bera-sbr, prototipo, referencias de diseño) |
| `REFERENCIA.txt` | HEAD, rama y fecha del momento del respaldo |

16 archivos, 4,8 MB. Ningún secreto: solo fuentes de `src/`, imágenes de `public/` y `package.json`.

---

## 2. Qué hizo Antigravity, clasificado

7 archivos, +1.828 / −236 líneas.

| Archivo | Categoría | Decisión | Notas |
|---|---|---|---|
| `src/pages/landing.js` | LOGIN (100%) | **CONSERVAR** entero | 4 hunks, todos del login |
| `src/utils/icons.js` | LOGIN | **CONSERVAR** entero | +4 iconos; `lock`, `mail` y `motorcycle` los usa solo landing.js |
| `src/styles/modern-yellow-lab.css` | **MIXTO** | **separado por hunk** | 7 hunks: 1 login, 1 perfil, 5 passenger |
| `src/pages/passenger/profile.js` | PROFILE (100%) | **CONSERVAR** entero | aislado, no toca passenger |
| `src/main.js` | SHARED | **parcial** | conservado el import estático del CSS; descartada la ruta del prototipo |
| `package.json` | TOOLING | **CONSERVAR** | resuelve un 431 real (ver §6) |
| `src/pages/passenger/passengerApp.js` | PASSENGER (100%) | **DESCARTAR** entero | 6 hunks, incluida una pestaña de soporte |

### El CSS, hunk por hunk

| # | Categoría | Líneas | Selectores representativos | Decisión |
|---|---|---|---|---|
| 1 | **LOGIN** | +659 / −59 | `cyber-moto-*`, `liquid-*`, `auth-tab`, `stagger-item`, `tacho`, `speed-spark`, `@keyframes btnLiquidMelt` | conservar |
| 2 | PASSENGER | +6 / −5 | `.passenger-app, .driver-app` | descartar |
| 3 | PASSENGER | +2 / −2 | `.passenger-profile-shortcut` | descartar |
| 4 | PASSENGER | +115 / −27 | `.nav-btn.active, .nav-tab.active` | descartar |
| 5 | **PROFILE** | +327 / −14 | `real-profile-*`, `profile-avatar-camera-btn` | conservar |
| 6 | PASSENGER | +0 / −4 | `.stats-bar` | descartar |
| 7 | PASSENGER | +243 / 0 | `.live-passenger-nav` (nav de lujo) | descartar |

---

## 3. El login se preservó exactamente — verificado en el navegador

No basta con que compile. Se levantaron **los dos** entornos y se compararon los valores computados:

| Elemento | Referencia (tu localhost) | Rama visual | |
|---|---|---|---|
| `html` class | `modern-yellow-lab um-motion-preview` | idéntico | ✔ |
| Escena de la moto | presente | presente | ✔ |
| Tacómetro | presente | presente | ✔ |
| Radio de la tarjeta | `36px` | `36px` | ✔ |
| Desenfoque | `blur(28px) saturate(1.6)` | idéntico | ✔ |
| Borde | `1px rgba(255,255,255,0.09)` | idéntico | ✔ |
| Radio del botón | `17px` | `17px` | ✔ |
| Degradado del botón | `linear-gradient(135deg, rgb(255,210,31), rgb(255,184,0))` | idéntico | ✔ |
| Altura del botón | `50px` | `50px` | ✔ |
| Pills de rol / tabs / inputs | 3 / 2 / 5 | 3 / 2 / 5 | ✔ |

**CSS**: las 79 reglas del login son idénticas una a una (0 faltantes, 0 con contenido distinto).
**JS**: `landing.js`, `icons.js` y `profile.js` van **byte a byte**.

### Animaciones

Los diez tiempos, contrastados contra la referencia:

| | s1 | s2 | s3 | s4 | s5 | s6 | s7 | **s7b** | s8 | s9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Referencia | 0,04 | 0,08 | 0,12 | 0s | 0s | 0,24 | 0s | — | 0,32 | 0,36 |
| Rama visual | 0,04 | 0,08 | 0,12 | 0s | 0s | 0,24 | 0s | **0,30** | 0,32 | 0,36 |

Los `0s` de s4, s5 y s7 son **preexistentes** —los inputs y el botón tienen transición propia que gana en especificidad—, no algo roto al separar. El único añadido es `s7b`, intercalado en el hueco entre 0,28 y 0,32: **ningún elemento existente cambió su tiempo**.

```
LOGIN_VISUALLY_PRESERVED:   YES
LOGIN_ANIMATIONS_PRESERVED: YES
LOGIN_FILES:        src/pages/landing.js, src/utils/icons.js,
                    src/styles/modern-yellow-lab.css (hunk 1), src/main.js
LOGIN_ASSETS:       public/vehicles/moto-real.png (ya versionado)
LOGIN_DEPENDENCIES: ninguna nueva
```

Los assets nuevos sin versionar (`bera-sbr-hero.jpg`, `bera-sbr-transparent.png`) **no los usa el login**; quedan en el respaldo.

---

## 4. Passenger — descartado

```
PASSENGER_CHANGES_FOUND:            SÍ (passengerApp.js entero + 5 hunks del CSS)
PASSENGER_CHANGES_DISCARDED:        SÍ
PASSENGER_OFFICIAL_VERSION_RESTORED: SÍ
```

- `passengerApp.js` volvió íntegro al estado oficial (0 cambios pendientes).
- Del CSS se revirtieron **solo** los 5 hunks de passenger, sin tocar los de login ni perfil — restauración por hunk, no por archivo.

Comprobado tras la operación: las huellas MD5 de `landing.js`, `profile.js` e `icons.js` son las mismas que antes, las 68 reglas de login siguen ahí, y `.live-passenger-nav` ya no existe en tu localhost.

Entre lo descartado había también funcionalidad, no solo estilo: una pestaña de soporte que abría el chat de administración desde la app del pasajero.

---

## 5. Perfil — conservado

```
PROFILE_CHANGES_FOUND:     SÍ
PROFILE_CHANGES_PRESERVED: SÍ
PROFILE_FILES: src/pages/passenger/profile.js, modern-yellow-lab.css (hunk 5)
```

Claramente aislable: solo toca `real-profile-*` y no roza la app del pasajero ni nada de 4C. La foto pasa a tener envoltorio propio con el botón de cámara flotando sobre ella, en lugar de un botón suelto debajo.

---

## 6. `package.json` — no era cosmético

El cambio (`node --max-http-header-size=65536` en lugar de `vite` a secas) **resuelve un fallo real**: al levantar la rama sin él, Vite respondió

```
Server responded with status code 431. Request Header Fields Too Large.
```

y la pantalla no cargaba. Se reprodujo en directo. Solo afecta a desarrollo y vista previa; producción no pasa por estos scripts. Por eso se conserva, en un commit aparte.

---

## 7. Botones sociales

```
GOOGLE_BUTTON_ADDED:   YES
FACEBOOK_BUTTON_ADDED: YES
APPLE_BUTTON_ADDED:    YES
SOCIAL_BUTTONS_FUNCTIONAL_NOW: NO
```

Integrados entre el botón de entrar y el banner de conductores, con separador «o continuar con». Mismo vidrio, mismos radios y la misma curva de transición que el resto de la tarjeta. En pantallas de menos de 420 px pasan a una columna.

Los logotipos van **en SVG dentro del propio paquete**, en un módulo aparte (`brandIcons.js`) porque son marcas con relleno propio y no deben heredar el color del texto ni el grosor de línea del helper de iconos. Sin imágenes remotas: una petición a un servidor de terceros desde la pantalla de entrada delataría a cada visitante ante ese proveedor antes incluso de que decida usarlo.

**Nacen deshabilitados**, con la leyenda «Disponible próximamente». No hay client IDs inventados, ni secretos, ni endpoints falsos, ni OAuth simulado.

---

## 8. Auditoría de autenticación

```
GOOGLE_AUTH_INFRA_EXISTS:   NO
FACEBOOK_AUTH_INFRA_EXISTS: NO
APPLE_AUTH_INFRA_EXISTS:    NO
OAUTH_BACKEND_EXISTS:       NO
```

Lo que hay hoy: cuatro rutas (`login`, `register`, `me`, `me/photo`), contraseñas con bcrypt y un JWT propio de 7 días firmado con `JWT_SECRET`. Dependencias del servidor: `bcryptjs, cors, express, express-rate-limit, helmet, jsonwebtoken, multer, socket.io` — **ninguna de OAuth**.

Las coincidencias de búsqueda eran falsos positivos: «google» son enlaces a Google Maps, «passport» es una tarjeta VIP de conductor, «meta» son metadatos.

### Lo que hace falta para el checkpoint de OAuth real

| Proveedor | Configuración necesaria |
|---|---|
| **Google** | Client ID y Client Secret (OAuth 2.0, Google Cloud Console) · redirect URI autorizada · pantalla de consentimiento publicada · scopes `openid email profile` |
| **Facebook** | App ID y App Secret (Meta for Developers) · «Facebook Login» añadido · redirect URI válida · scopes `email public_profile` · revisión de la app para producción |
| **Apple** | Services ID (client_id) · Team ID · Key ID · clave privada `.p8` · redirect URI **con HTTPS obligatorio** · dominio verificado · el `client_secret` es un JWT que hay que **firmar y rotar** (máx. 6 meses) |

**Diseño de identidades propuesto** (a implementar, no implementado):

1. Tabla o campo de identidades externas: `(provider, providerUserId) → userId`. La clave es el id **del proveedor**, nunca el correo: el correo cambia y puede reutilizarse.
2. **Nada de vincular por correo automáticamente.** Es la vía de apropiación de cuentas: quien controle un correo en el proveedor entraría en una cuenta creada con contraseña. Vincular solo desde una sesión ya iniciada y con confirmación explícita.
3. Correo **verificado por el proveedor**, o no se usa para nada. Apple además permite correos de reenvío privados: hay que aceptarlos como identificador válido.
4. **Solo pasajeros.** El alta social crea `role: 'passenger'` y punto. Un conductor no puede nacer así: tiene que pasar por el expediente y su aprobación. El rol nunca se toma del payload.
5. Alta idempotente: dos pulsaciones seguidas no pueden crear dos cuentas.
6. La sesión resultante es el **mismo JWT** que hoy: el resto de la aplicación no se entera de por dónde entró nadie.
7. Rate limit propio para el callback, con la guardia por dirección del hotfix.

---

## 9. Aislamiento y resultados

```
VISUAL_BRANCH: ui/login-antigravity-preservation
VISUAL_HEAD:   84df79f
COMMITS:
  802df43  feat(ui): preservar el rediseño animado del login aprobado
  526b512  feat(profile): preservar el rediseño local aprobado del perfil
  90ef310  feat(ui): añadir los accesos con Google, Facebook y Apple al login
  84df79f  chore(dev): ampliar el tamaño de cabecera del servidor de desarrollo
```

La rama parte de **master**, no de la rama de 4C, y es integrable limpiamente: se verificó que los 7 archivos de Antigravity son idénticos en master y en `ab3cf3e`, así que no hay solape con chat-media.

Archivos de los commits: `package.json`, `main.js`, `landing.js`, `profile.js`, `modern-yellow-lab.css`, `brandIcons.js`, `icons.js`. **Ninguno de 4B/4C, ninguno de passengerApp.** Todo con `git add` por ruta explícita, nunca `git add .`.

```
FRONTEND_TESTS:     262/262 PASS
SOURCE_PARSE_TESTS: 2/2 PASS
PRODUCTION_BUILD:   PASS — 114 módulos, 742 ms

PHASE_4C_FILES_MODIFIED: NO (0 cambios en server/ y test/)
UNRELATED_FILES_COMMITTED: NONE
PUSH_PERFORMED: NO
DEPLOY_PERFORMED: NO
```

### Verificación en el navegador

Escritorio y móvil (375×812), sin desbordes. En móvil el bloque social ocupa 329 px, cabe dentro de la tarjeta y pasa a una columna. El cambio a modo registro sigue funcionando: aparecen los campos extra, el botón dice «Crear mi cuenta» y los botones sociales siguen visibles.

El único error de consola es el registro del service worker (`controlador: null`), presente también en master y ajeno a este trabajo.

---

## Veredicto

```
APPROVED_LOGIN_SAFELY_PRESERVED:      YES
PASSENGER_ANTIGRAVITY_WORK_EXCLUDED:  YES
READY_TO_RESUME_PHASE_4C_FIXES:       YES
READY_FOR_CODEX_UI_REVIEW:            YES
```

**Estado de tu working tree**: conserva el login y el perfil de Antigravity, con Passenger devuelto al oficial. Tu localhost sigue mostrando exactamente el login aprobado — verificado tras la separación.

**Pendiente, sin tocar**: los dos hallazgos HIGH de 4C (el cargador singleton y `driverTrips.js`), tal como pediste.

**Nota**: el respaldo de `motoRide-backup-antigravity-20260819` conviene conservarlo hasta que revises la rama visual y confirmes que no falta nada. Contiene también el prototipo `#/test_ui` y los assets `bera-sbr-*`, que no entraron en ningún commit.
