# Pruebas internas de +58Express en Android

Este procedimiento genera un APK `release` para pruebas internas. La aplicación se instala y abre desde el launcher de Android, no usa Expo Go y no necesita Metro durante el recorrido normal.

## Identidad y alcance

- Nombre: `+58Express`
- Package Android: `com.plus58express.app`
- Versión actual: `0.1.0`
- Version code actual: `1`
- Passenger y Driver forman parte del mismo APK.
- El package no se separó del productivo para evitar romper Google Sign-In, enlaces profundos o notificaciones. Por ello, esta compilación no puede convivir con otra app que use el mismo package.
- La firma actual es el keystore de prueba generado por Android/Expo. No debe usarse para Google Play ni como firma productiva.

## Backend de esta compilación

El APK probado apunta al backend local de desarrollo:

```text
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.144:4000
```

El teléfono debe estar en la misma red que el equipo que ejecuta el backend y el puerto 4000 debe ser accesible. No se usa producción por omisión. Si cambia la IP del equipo, hay que actualizar `mobile/.env` y generar otro APK.

Android bloquea HTTP sin cifrar por omisión. El plugin Expo `mobile/plugins/httpLanSoloEnDevelopment.js` habilita `usesCleartextTraffic` solamente cuando `EXPO_PUBLIC_ENV=development`, como en este APK interno. Para cualquier otro entorno lo deja explícitamente deshabilitado, de modo que una compilación de producción continúa exigiendo HTTPS. Después de cambiar el entorno o la URL siempre hay que ejecutar de nuevo `expo prebuild` y generar otro APK; editar sólo `.env` no cambia un APK ya construido.

Nunca deben agregarse a `mobile/.env` variables administrativas como `service_role`, contraseñas de base de datos, secretos JWT, claves privadas ni tokens de Railway, Vercel, GitHub o Sentry. Todo nombre `EXPO_PUBLIC_*` queda incluido en el bundle y debe considerarse público.

## Requisitos locales

- Dependencias de `mobile` instaladas.
- Android SDK instalado.
- JDK 17 o posterior. En la máquina usada para esta validación se utilizó el JDK 21 incluido con Android Studio.
- `mobile/.env` configurado con el entorno y la URL del backend de pruebas.

## Validación previa

Desde `mobile`:

```powershell
npm run typecheck
npm test
npm run bundle:check
npx expo config --type public --json
npx expo-doctor
```

`expo-doctor` reporta actualmente dos grupos de advertencias heredadas: campos de esquema antiguos y cinco paquetes Expo con desfase de una versión de parche. El typecheck, la exportación del bundle y la compilación release sí pasan.

Durante la generación del APK del 4 de septiembre de 2026, la primera ejecución de la suite pasó 973/973. Después aparecieron cambios concurrentes en el móvil y en el servidor; la repetición final quedó en 975/977. Los dos fallos restantes son una prohibición textual de `localStorage` que no contempla el respaldo exclusivo del laboratorio web en desarrollo y una lista de permisos que no contempla el micrófono requerido para grabar el audio del vídeo de postulación. No se desactivaron ni modificaron esas pruebas durante esta tarea.

## Generar un APK nuevo

No existe un perfil EAS en este proyecto. El APK se genera localmente desde el proyecto Android administrado por Expo:

```powershell
cd "F:\proyectos app web\motoRide-current\mobile"
npx expo prebuild --platform android --no-install

$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="C:\Users\Jordan\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

cd android
.\gradlew.bat assembleRelease --no-daemon
```

El resultado nativo se genera en:

```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

Para conservar builds anteriores, copie el archivo a `F:\proyectos app web\builds` con un nombre nuevo que incluya fecha y hora. No sobrescriba otro APK.

El artefacto validado el 4 de septiembre de 2026 es:

```text
F:\proyectos app web\builds\plus58express-preview-20260904-0433.apk
```

## Instalar o actualizar en Android

Con el teléfono conectado, depuración USB habilitada y visible en `adb devices`:

```powershell
adb install -r "F:\proyectos app web\builds\plus58express-preview-20260904-0433.apk"
```

También puede copiar el APK al teléfono, abrirlo desde Archivos y autorizar la instalación desde esa fuente cuando Android lo solicite.

`adb install -r` conserva los datos si la versión instalada tiene el mismo package y una firma compatible. Si Android informa una firma incompatible, no desinstale automáticamente: desinstalar borra los datos locales y debe decidirse después de respaldar lo necesario.

## Cuándo hace falta otro APK

`expo-updates` está deshabilitado y no hay canal OTA configurado. Por tanto, hace falta generar e instalar otro APK cuando cambie cualquiera de estos elementos:

- código JavaScript o TypeScript;
- imágenes, fuentes u otros recursos;
- variables `EXPO_PUBLIC_*` incluidas en el bundle;
- dependencias nativas;
- plugins de Expo;
- permisos Android;
- package, nombre, icono, versión o configuración nativa.

Metro sólo es necesario para desarrollo interactivo. No interviene al abrir y recorrer este APK release.

## Permisos verificados

El APK final incluye los permisos usados por ubicación en primer y segundo plano, cámara, selección de medios y grabación de audio para el vídeo de postulación. No declara `SYSTEM_ALERT_WINDOW`. No se agregó permiso de notificaciones porque el proyecto no incluye `expo-notifications` ni una implementación de push remoto en esta fase.

## Límites de esta compilación

- Es un APK interno firmado con credencial de prueba, no un release para Play Store.
- Usa el mismo package que la app principal y no puede instalarse en paralelo con otra firma incompatible.
- El backend local debe permanecer disponible para los flujos reales.
- Passenger y Driver requieren cuentas y roles válidos servidos por el backend.
- No se ejecutó EAS Build, EAS Submit, Google Play ni ningún despliegue productivo.
