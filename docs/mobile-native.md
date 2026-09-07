# La aplicación móvil nativa de +58express

## Qué es esto

La fundación de la app nativa: **React Native + Expo + TypeScript**, una sola
base para Android e iOS.

Establece la plataforma y, con Wave 1, el **acceso real** contra el backend
existente: arranque con validación de sesión, selector de experiencia, formulario
de acceso, restauración de sesión y cierre. No migra el resto de la aplicación.

```
mobile/     Expo SDK 57.0.18 · React Native 0.86.3 · React 19.2.3 · TypeScript 6.0.3
```

## Dónde vive, y por qué ahí

```
MOBILE_REPO_STRATEGY:  proyecto independiente, el mismo patrón que server/
MOBILE_PATH:           mobile/
SHARED_CODE_STRATEGY:  shared/contracts/ se REFERENCIA, no se copia
```

El repositorio **no usa workspaces**, y no se han introducido. `server/` ya es un
proyecto independiente con su propio `package.json` y su propio `node_modules`;
`mobile/` sigue exactamente ese patrón.

Convertir el repositorio a workspaces habría cambiado la resolución de
dependencias de **todo**: Railway instala desde `server/package.json` y Vercel
construye desde la raíz. Reorganizar eso para estrenar una carpeta nueva es
arriesgar dos despliegues que funcionan a cambio de una comodidad.

### Los contratos compartidos

`shared/contracts/` se comprueba: `domain.ts`, `api.ts`, `fx.ts` y `wallet.ts`
**no dependen del DOM ni de Node**. Son reutilizables tal cual en React Native, y
se importan con rutas relativas.

Para que Metro los vea hay dos ajustes en `metro.config.js`:

```js
watchFolders: [.../shared]          // sin esto no hay recarga al editarlos
extraNodeModules: { react, react-native }   // sin esto, dos copias de React
```

El segundo importa más de lo que parece: al vigilar carpetas fuera del proyecto,
Metro puede encontrar la copia de React del web y montar dos. Eso rompe los hooks
con «Invalid hook call», y el error no dice nada sobre la causa.

## Navegación

**Expo Router**, con rutas por fichero.

Es la recomendación oficial de Expo, está construido sobre React Navigation —así
que no se renuncia a nada— y trae dos cosas que aquí valen: enlaces profundos con
la misma estructura que las rutas, y tipado de rutas (`typedRoutes`), que
convierte un enlace roto en un error de compilación.

```
app/
  _layout.tsx     raíz: áreas seguras, tema oscuro, guardia de configuración
  index.tsx       arranque: valida la sesión con el backend y redirige
  rol.tsx         «¿Cómo quieres continuar?»
  acceso.tsx      formulario de acceso real
  pasajero.tsx    inicio de pasajera, con guardia de sesión
  conductor.tsx   inicio de conductor, con guardia de sesión y aprobación
```

Administración **sigue siendo web**. No hay decisión de llevarla al teléfono, y
suponerla habría añadido superficie sin que nadie la pidiera.

## El selector de rol

La primera experiencia real. Y la distinción que la ordena:

> **Es navegación, no autorización.**

Elegir «Conductor» no convierte a nadie en conductor. No concede permisos, no
salta la aprobación y el backend no se entera de la elección: decide qué flujo de
acceso se enseña, y nada más.

La preferencia se recuerda para no volver a preguntar, pero **no es un permiso**.
Quien elija «Conductor» sin estar aprobado verá lo que le corresponda según su
estado real.

### Los estados de conductor son los del backend

Salen de `server/domain/driverApplicationModel.js`:

```
draft · pending · approved · rejected · needs_changes · suspended
```

No se inventó una escala propia. Y hay una prueba que **lee ese fichero** y
compara: si alguien añade o renombra un estado allí, falla.

`puedeConducir()` exige la aprobación explícita —comparación positiva, no «no
está rechazado»— y cualquier estado desconocido cae en el más restrictivo. Si el
backend empieza a devolver algo que esta versión no conoce, lo peor que pasa es
que se ofrezca empezar una solicitud; nunca que se abra una interfaz de conductor
por error.

## Autenticación — Wave 1

### La autoridad no se duplica

El backend existente es la única autoridad. La aplicación móvil **no** verifica
el JWT, no lee sus claims para decidir y no da a nadie por autenticado por tener
un token guardado.

Eso no es purismo: `requireAuth` del backend **recarga el usuario de la base de
datos** en cada petición y comprueba su estado. Un token firmado hace seis días
sigue siendo criptográficamente válido aunque a esa persona la hayan suspendido
ayer. El claim `role` es un dato histórico, no un permiso.

```
AUTH_LOGIN_ENDPOINT      POST /api/auth/login
AUTH_REGISTER_ENDPOINT   POST /api/auth/register        (no usado en Wave 1)
AUTH_SESSION_ENDPOINT    GET  /api/auth/me
AUTH_TOKEN_FORMAT        JWT { sub, role }, HS256
AUTH_TOKEN_EXPIRATION    7 días
AUTH_ROLE_SOURCE         users.role en la base, recargado en cada petición
DRIVER_APPROVAL_SOURCE   users.isVerified + requireApprovedDriver
```

Los contratos salen de leer `server/index.js`, no de suponer nombres.

### Estados de sesión

```
ARRANCANDO      leyendo el token y preguntando al backend
SIN_SESION      no hay sesión, o el backend la rechazó
AUTENTICANDO    login en curso
AUTENTICADO     el backend confirmó la sesión AHORA
SIN_VERIFICAR   hay token guardado y NO se pudo preguntar
```

Una máquina de estados y no cuatro booleanos: `isLoading` + `isLogged` +
`hasUser` + `maybeToken` admite dieciséis combinaciones, de las que sólo cinco
tienen sentido. Las otras once son errores que nadie escribió a propósito.

**`AUTENTICADO` y `SIN_VERIFICAR` son cosas distintas**, y confundirlas hace
daño en las dos direcciones:

- tratar «sin red» como «sesión inválida» cierra la sesión de alguien que la
  tiene perfectamente válida, sólo porque iba en el metro;
- tratar «sin red» como «autenticado» deja pasar operaciones con una sesión que
  quizá el backend ya revocó.

`SIN_VERIFICAR` muestra la identidad conocida y **no autoriza nada**.
`tieneAutoridadFresca()` es la única función que debe consultarse para permitir
algo, y da `false` ahí.

### Arranque

```
1. ¿hay token en el almacén seguro?   no → selector de experiencia
2. sí → se PREGUNTA a GET /api/auth/me
3. válida    → identidad cargada, a su experiencia
4. inválida  → se borra el token, a la entrada
5. sin red   → SIN_VERIFICAR: el token se CONSERVA, con botón de reintentar
```

**Sólo el paso 4 borra el token.** Que el backend no conteste no es que la
sesión sea mala; un 500 tampoco, porque un fallo temporal del servidor no puede
cerrarle la sesión a todo el mundo a la vez.

### Selección de experiencia frente a autoridad

```
ROLE_SELECTION_IS_AUTHORITY: NO
```

El selector decide **qué pantalla de acceso** se enseña. Después del login, a
dónde se va lo decide la identidad REAL que devolvió el backend
(`experienciaDeLaIdentidad`), no lo que se eligió antes.

La experiencia elegida viaja al backend como `role` en el login, y el backend
responde 401 si no coincide con el rol real de la cuenta. Es una comprobación
más, no una petición de privilegios.

### Conductor: tres condiciones, ninguna del cliente

`puedeOperarComoConductor()` exige a la vez:

1. sesión confirmada por el backend ahora mismo;
2. que el backend diga que el rol es `driver`;
3. que el backend lo dé por verificado (`isVerified === true`).

Que el JWT lleve `role: 'driver'` **no basta**. Y `isVerified` sólo cuenta con el
`true` explícito: `'true'`, `1` o `'yes'` se leen como no verificado, que es el
lado seguro.

Quien tenga sesión pero no la aprobación ve su **situación**, no una interfaz de
conductor a medias.

### Cierre de sesión

```
El backend NO tiene endpoint de logout ni revocación.
```

Comprobado leyendo `server/index.js`: los JWT son sin estado, duran siete días y
no hay lista de revocados. Cerrar sesión es una operación **local** — se borra el
token del dispositivo — y no se inventó `POST /api/auth/logout`, que daría 404 y
parecería que algo se rompió.

La consecuencia real —un token robado sigue valiendo hasta que caduque— es una
limitación del backend actual, y corresponde a una fase de servidor. Queda
anotado, no disimulado.

### Respuestas obsoletas

Cada operación de sesión lleva número, y sólo la última puede escribir estado. Si
alguien pulsa dos veces, o entra, vuelve y entra con otra cuenta, la respuesta
vieja llega después y **no pisa** a la nueva. Sin esto el caso es fácil de
reproducir con red lenta: se acaba con la sesión de la cuenta equivocada.

### Errores del acceso

Cada código real del backend tiene su mensaje: credenciales inválidas, cuenta
deshabilitada, conductor no aprobado, demasiados intentos (el limitador son 30
por cuarto de hora), sin conexión, sin configuración.

«Correo o contraseña incorrectos» **no distingue** cuál de los dos falló, y es
deliberado: decirlo permitiría averiguar qué cuentas existen. Nunca se enseña un
volcado de JSON, un código interno ni una traza.

### La contraseña

`secureTextEntry`, sin autocorrección ni capitalización, y se limpia del estado
en cuanto el acceso tiene éxito. No se registra en ningún sitio, y hay una prueba
que lo comprueba sobre el código.

### Una cuenta, un rol

El modelo actual **no admite** que una cuenta sea pasajera y conductora a la vez:
el registro público crea `role: 'passenger'`, y los conductores los crea
administración o salen de una solicitud aprobada. El login filtra por rol exacto.

No se ha inventado soporte multi-rol. Si algún día se quiere —una misma persona
que conduce y también pide carreras—, es un cambio de backend con su propia
decisión.

### Estructura de dependencias

Las decisiones de autenticación viven en `domain/`, sin nada de React Native:

```
domain/apiResult.ts       la forma de un resultado
domain/authState.ts       estados, identidad, autoridad
domain/authDecisions.ts   qué significa cada error, cuándo se borra la sesión
services/api.ts           transporte
services/auth.ts          llamadas
context/AuthContext.tsx   estado de la aplicación
```

La dirección es `services/ → domain/`, nunca al revés. Por eso las 28 pruebas de
autenticación se ejecutan con `node --test` sin emulador: comprobar que un
`ACCOUNT_DISABLED` se cuenta distinto de unas credenciales malas no debería
requerir levantar Android.

### Cuentas de prueba

Las pruebas que necesiten credenciales las leen del entorno, nunca del
repositorio:

```
MOBILE_TEST_PASSENGER_EMAIL / _PASSWORD
MOBILE_TEST_DRIVER_EMAIL / _PASSWORD
```

Y **sólo contra un backend de Test o local**. La protección de la fundación
sigue intacta: sin `EXPO_PUBLIC_API_BASE_URL` no hay servidor, y nunca se cae a
producción.

### Lo que Wave 1 NO trae

```
✗ registro desde el móvil          (Wave 1B)
✗ recuperación de contraseña       (Wave 1B)
✗ OTP por WhatsApp o SMS           (EXPERIENCE-1)
✗ Google / Apple Sign-In           (EXPERIENCE-1)
✗ verificación de correo           (EXPERIENCE-1)
✗ confianza de dispositivo         (EXPERIENCE-1)
```

El registro existe en el backend y funciona, pero conectarlo bien —validaciones,
duplicados, confirmación— es su propia entrega. Login y sesión eran la prioridad.

### Pruebas nativas: ahora sí tiene sentido evaluarlas

Con un flujo real de acceso ya hay algo que probar de punta a punta en un
dispositivo. **Maestro** es la recomendación para evaluar primero: sus flujos son
YAML, no exige compilar una versión instrumentada de la aplicación y encaja con
el flujo gestionado de Expo. Detox da más control a cambio de más
infraestructura, y Appium sólo compensa si hiciera falta compartir pruebas con
otra plataforma.

No se instaló ninguno todavía: la decisión va con Wave 2, cuando el flujo incluya
también pantallas con datos.

## Entornos: la regla que no se negocia

```
MOBILE_DEV_CAN_FALLBACK_TO_PRODUCTION: NO
```

En desarrollo, si falta la configuración, **la aplicación no habla con
producción**. Enseña qué falta y cómo arreglarlo.

```
EXPO_PUBLIC_API_BASE_URL    obligatoria. Sin ella no hay backend.
EXPO_PUBLIC_ENV             development | staging | production
```

No existe ninguna URL de producción escrita como respaldo: ni en una constante,
ni comentada «por si acaso», ni deducida del nombre del entorno. Hay una prueba
que busca `railway.app`, `vercel.app` y compañía en el fichero de configuración y
falla si aparecen.

Un valor por defecto que apunte a producción es la forma más fácil de que alguien
depure contra la base real sin enterarse: crea viajes de prueba y mueve saldos de
personas reales. Se descubre tarde, o no se descubre.

Además, **HTTP en claro sólo se tolera en desarrollo**. Fuera de ahí es un error:
mandar credenciales por HTTP desde un teléfono, a menudo por wifi ajena, es
exactamente el escenario que TLS existe para cubrir.

> Todo `EXPO_PUBLIC_*` queda incrustado en el paquete instalable y se puede leer
> descompilándolo. Ahí sólo va la URL del backend y el nombre del entorno. Ningún
> secreto, nunca.

## Sesión y almacenamiento

```
token de sesión   →  expo-secure-store  (Keychain / Keystore)
preferencias      →  expo-secure-store  (por ahora, ver abajo)
```

El token **nunca** en almacenamiento plano. La diferencia importa: el
almacenamiento plano de una app es un fichero corriente del sandbox, y en un
teléfono con root, en una copia de seguridad sin cifrar o con acceso físico se
lee. El almacén seguro está respaldado por hardware.

Se usa `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: sólo con el dispositivo desbloqueado, y
**no viaja en las copias de seguridad**. Una sesión restaurada en otro teléfono
desde un backup es una sesión que su dueño no abrió ahí.

### Por qué las preferencias van también al almacén seguro

El último rol elegido no es un secreto y su sitio natural sería `AsyncStorage`.
Se intentó instalarlo y **declara incompatibilidad con `react@19.2.3`**. No se
forzó con `--legacy-peer-deps`: meter en la ruta de datos una dependencia que
dice no soportar la versión de React del proyecto no compensa la comodidad.

Guardar un dato no sensible en un sitio más protegido de lo necesario no rompe
nada. Cuando AsyncStorage soporte React 19, las preferencias se mueven — las dos
funciones ya están separadas para que sea un cambio local.

## La frontera con el backend

`services/api.ts` es pequeña a propósito. **No es un puerto de
`src/services/apiService.js`**: aquel cliente arrastra historia del navegador
—cookies, recarga de página, comportamiento del DOM— que en un teléfono no
aplica. Lo que se reutiliza son los contratos.

Devuelve un **resultado, no una excepción**. En una interfaz móvil casi todos los
errores son estados que hay que pintar —sin red, sesión caducada, servidor
caído— y envolverlos en `try/catch` por toda la aplicación acaba en pantallas en
blanco porque alguien olvidó uno.

**El backend sigue siendo la autoridad.** Aquí no se decide si alguien es
conductor aprobado, ni si tiene saldo, ni si un viaje puede avanzar. Cualquier
lógica que parezca una decisión de negocio en el cliente es una decisión que se
puede saltar desmontando la aplicación.

### El retiro antiguo no entra

```
LEGACY_PAYOUT_ENDPOINT_USED: NO
```

`POST /api/wallet/payouts` está deshabilitado en producción por WALLET-PAYOUTS-1A
y no pertenece al futuro móvil. Hay una prueba que recorre **todos** los ficheros
del cliente y falla si aparece. Es fácil que se cuele copiando de la web por
costumbre, y no daría ningún error: recibiría un 403 y nadie sabría por qué.

## Dirección visual — C2, +58 Signature Refined

**Pendiente de la decisión del dueño.** C2 es la recomendación actual; A, B y C
siguen en el catálogo para poder compararlas, y no se retiran hasta que decida.

C2 no es una dirección nueva: es C mirada en pantallas reales, con el mapa
convertido en el suelo y los activos de marca dentro. Los colores son los de C,
valor por valor, y hay una prueba que lo comprueba.

```
mapa primero      el mapa ocupa la pantalla; la hoja inferior flota encima
sin bordes        las superficies se separan por color: una sola línea amarilla
aire por dentro   +4 en el relleno y entre elementos, sin robarle alto al mapa
etiquetas +1pt    lo único que se toma de B: leer de reojo, en moto y con sol
```

Quitar el borde de las superficies es el cambio con más consecuencias. Cada
tarjeta con borde dibuja un rectángulo, y siete rectángulos apilados son la sopa
de tarjetas que había que quitar. Sin ellos queda **una sola línea con derecho a
llamar la atención: la amarilla**.

### El filo, con disciplina

Una firma que lo lleva todo no señala nada. Aparece una vez por zona: en la hoja
de la pasajera lo lleva Transporte Seguro; en el selector, sólo el vehículo
elegido; en el viaje, sólo el estado. Una prueba cuenta las superficies con filo
y falla si son más de dos.

### La hoja inferior

Tres estados —26 %, 46 %, 62 %— y **nunca tapa el mapa entero**.

El tope de 62 % salió de mirarlo en pantalla. Estaba en 72 %, que sobre el papel
dejaba casi un tercio de mapa; en el teléfono no era así, porque la barra de
navegación se lleva otros 80 puntos por debajo. Lo que quedaba era una franja
donde ya no cabía ni el vehículo más cercano.

Las medidas viven en `theme/hoja.ts`, sin dependencias de React Native, para que
el generador de evidencia y las pruebas lean los mismos números que el teléfono
en lugar de una copia.

### Los activos de marca

`mobile/theme/marca.ts` es el equivalente de `src/utils/vehicleMedia.js`: la moto
y el automóvil amarillos, con dos tomas cada uno —tres cuartos para elegir
servicio, cenital para el mapa—, más el emblema y el logotipo apaisado.

Las dos tomas no son intercambiables. La cenital es cuadrada para poder girar
sobre su centro y apuntar al rumbo; usar la de tres cuartos sobre el mapa daría
una moto de perfil que siempre mira a la derecha.

Son los archivos oficiales, sin recortar ni recolorear. El manifiesto completo
está en [preservacion-visual.md](preservacion-visual.md), y
`mobile/test/preservacion.test.mjs` comprueba que siguen ahí, que no se
deformaron y que nadie los sustituyó por un pictograma.

### El control de disponibilidad

La pieza signature del conductor, heredada de `src/styles/modern-yellow-lab.css`:
disco de 56 puntos en el centro de la barra, sobresaliendo por encima, con la
moto real dentro, aro verde y latido lento al conectarse.

No vuelve el interruptor de la cabecera: éste es el único control de
disponibilidad, como ya había decidido el diseño de la web.

### El mapa

`ui/Mapa.tsx` pinta calles claras sobre manzanas oscuras, que es como se leen los
mapas en tema oscuro. **No hay proveedor elegido**: se sustituye por dentro sin
tocar la composición de alrededor, y una prueba vigila que no aparezca ninguno.

La composición ya tiene sitio para elegir origen y destino, mover el pin,
confirmar un punto y los favoritos. La lógica no está hecha y no se inventó
backend; lo que hay es el hueco, para que el diseño no cierre esas puertas.

## Dirección visual — VISUAL-PREVIEW-1

**Pendiente de la decisión del dueño.** Se prepararon tres direcciones para
comparar; ninguna está congelada. La fase siguiente, DESIGN-SYSTEM-1, convertirá
la elegida en sistema oficial y retirará las otras dos.

### Las tres

```
A  Premium Minimal    aire, calma y tipografía. El amarillo sólo donde se decide.
B  Urban Functional   densa y directa. Todo a mano, alto contraste, para la calle.
C  +58 Signature      grafito profundo y filo amarillo. RECOMENDADA.
```

Comparten marca, estructura, contenido y componentes. Lo que cambia es el
**carácter**: cuánto aire hay, cuánto amarillo se ve, cuán marcadas están las
superficies, qué tan redondo es todo. Si cada dirección tuviera pantallas
distintas, comparar sería imposible: se estaría eligiendo entre contenidos.

Hay una prueba que verifica que las tres tienen la misma estructura de tokens, y
otra que comprueba que no son la misma con otro nombre.

### La firma de C

El **filo amarillo**: una línea vertical fina en el borde izquierdo de lo que
importa —la tarjeta activa, el estado en curso, la opción elegida—.

Es la decisión de identidad. Ni repartir amarillo por toda la pantalla, ni
esconderlo en un botón: se reconoce de un vistazo, funciona a pleno sol, no
cansa de noche y no se parece a ninguna referencia.

> **Un ajuste que salió de mirar el resultado.** La primera versión de C ponía
> borde amarillo *y* filo en las tarjetas destacadas. En el inicio de pasajera,
> con dos tarjetas destacadas a la vez, el amarillo competía consigo mismo y
> dejaba de destacar nada. Ahora el borde amarillo es exclusivo de B; en C la
> señal es sólo el filo.

### Sobre las referencias

A se inspira en la claridad de Cabify y B en la eficiencia de Yummy Rides, pero
**ninguna copia nada**: no hay colores suyos, ni sus proporciones, ni sus
componentes. Lo que se toma es una idea sobre cómo tratar el espacio y la
densidad, que es lo que se puede aprender de una aplicación buena sin calcarla.
Una prueba comprueba que sus colores corporativos no aparecen en el código.

### Estructura del sistema

```
theme/primitives.ts    los valores crudos. Ninguna pantalla los importa.
theme/directions.ts    las tres direcciones: cada valor asignado a un ROL
theme/ThemeContext.tsx qué dirección está activa
ui/componentes.tsx     todo lee el tema; nadie escribe un color a mano
ui/Icono.tsx           iconografía propia, dibujada con vistas
```

Separar primitivos de semánticos importa: cuando se diga «el amarillo un punto
más cálido», se cambia en un sitio y las tres direcciones lo heredan.

### Iconografía propia

Se intentó instalar `@expo/vector-icons`, la solución oficial, y **declara
incompatibilidad con `react@19.2.3`** — el tercer paquete del propio ecosistema
de Expo que lo hace, después de AsyncStorage y `react-native-web`.

Y conviene: los sets conocidos se reconocen al instante como «iconos de
aplicación», y esta fase trata de que +58express no parezca una plantilla. La
familia propia es geométrica, de trazo uniforme, y no pesa nada — son vistas, no
fuentes ni SVG.

### Tipografía

La del sistema. La elección de fuente **todavía no está tomada**, y meter una
familia ahora la daría por decidida. Además es la que mejor rinde en teléfonos
económicos, que es donde se va a usar esto.

### El laboratorio visual

```
/preview     sólo en desarrollo · protegido por __DEV__
```

Permite cambiar entre A, B y C con los mismos datos, y recorrer las ocho
pantallas. Fuera de desarrollo la ruta no monta nada: enseña datos de
demostración que no salen de ninguna API, y en manos de alguien que crea estar
viendo su cuenta eso es información falsa presentada como verdadera.

No llama a ninguna API, no toca la sesión real y no ejecuta operaciones
financieras. Los datos de demostración viven en `preview/fixtures.ts`, son
obviamente ficticios, y una prueba comprueba que ningún fichero de la aplicación
real los importa.

**La cifra de saldo del conductor se muestra vacía**, con una nota que lo
explica. La cartera está apagada en el backend, y enseñar un número como si
fuera real sería mentir.

### Mapa

```
MAP_PROVIDER_FINAL_DECISION: DEFERRED
```

`MapaSimulado` es una superficie con retícula y punto, pensada para sustituirse
por el mapa real sin tocar la composición de alrededor. **No se instaló ningún
proveedor**, y una prueba lo vigila.

## Diseño

Los tokens salen de la identidad que ya existe (`src/styles/design-system.css`,
variables `--x58-*`) y del manifiesto PWA. **No se rediseñó nada**:

```
amarillo   #ffd21f   (el mismo theme_color del manifiesto)
grafito    #0e0d0b   (el mismo background_color)
superficies  #0a0908 · #161512 · #1e1c19 · #262420
texto        #f7f6f3 · #a3a09a · #817e77
```

No se copia el CSS: React Native no tiene cascada ni variables CSS, y traducir la
hoja entera produciría un objeto del que el 90% no aplica. Lo que se traslada es
la **escala**.

El tema oscuro es el principal, igual que en la web. La estructura admite un tema
claro —los tokens están agrupados por rol, no por color— pero esta fase no lo
termina: prometer dos temas y entregar uno a medias es peor que entregar uno bien.

**Área táctil mínima: 48 puntos.** Apple pide 44 y Material 48; se toma el mayor.
No es estético: por debajo de eso la gente falla el toque, y esto se usa en la
calle, con una mano y en movimiento.

## Áreas seguras y teclado

Se usan las del sistema, vía `react-native-safe-area-context`. **No se dibuja una
barra falsa** «para el notch»: eso está mal en cuanto cambia el modelo, y hoy hay
Dynamic Island, agujero, muesca y nada.

El componente `Pantalla` resuelve de una vez el fondo, las áreas seguras y el
teclado —`padding` en iOS, `height` en Android, que es la combinación que
funciona en cada uno—. Así los formularios de Wave 1 no nacerán tapados.

Android va en **edge-to-edge**.

## Código específico de plataforma

Común por defecto. `Platform.select` o ficheros `.ios`/`.android` **sólo** cuando
haya una diferencia real —hoy la única es el comportamiento del teclado—. No se
duplican pantallas.

## Permisos

```
LOCATION_PERMISSION_REQUESTED_AT_STARTUP: NO
```

**Ningún permiso se pide al arrancar**, y hay una prueba que lo vigila. Un permiso
pedido nada más abrir, sin contexto, se deniega — y una vez denegado, volverlo a
pedir cuesta mucho más. Cada permiso se pedirá cuando la función que lo necesita
esté a la vista y se entienda para qué.

Pendientes, cada uno en su ola:

```
ubicación en primer plano   Wave 2-3   al pedir o aceptar una carrera
ubicación en segundo plano  Wave 5     con explicación previa; iOS la revisa a mano
notificaciones              Wave 6     tras la primera carrera, no al instalar
cámara / fotos              Wave 3     al subir documentos de conductor
```

## GPS en segundo plano

```
BACKGROUND_GPS_IMPLEMENTED: NO
```

Es su propia ola (Wave 5). Lo que hay que saber antes de abordarla: iOS exige
justificar el uso en segundo plano en la ficha de la tienda y lo revisa
manualmente; Android exige un servicio en primer plano con notificación
permanente. Ninguna de las dos cosas se improvisa.

## Notificaciones

```
NATIVE_PUSH_REGISTERED_PRODUCTION: NO
```

El sistema push **web** actual sigue funcionando y no se toca. Para el móvil
(Wave 6) hay que decidir entre Expo Notifications —más simple, atado a la
infraestructura de Expo— o FCM/APNs directos. No se registró ningún dispositivo.

## Mapas

```
MAP_PROVIDER_FINAL_DECISION: DEFERRED
```

Google Navigation SDK frente a Mapbox sigue **sin decidirse**, y esta fase no la
toma por la puerta de atrás: no se instaló ninguno de los dos. Hay una prueba que
falla si aparece cualquiera en las dependencias.

## Sin conexión

Documentado, no implementado. El móvil necesitará: cola de peticiones pendientes,
recuperación al volver la red y comportamiento definido en segundo plano. No se
promete mapa sin conexión — eso depende del proveedor que aún no se ha elegido.

## Cartera

```
MOBILE_WALLET_PAYOUTS_ENABLED: NO
DRIVER_FINANCE_MOBILE_ACTIVE: NO
```

No hay interfaz de saldo todavía. **No se enseña como funcional algo que el
backend tiene apagado**: los retiros nuevos están tras banderas que no existen en
producción, y Driver Finance sigue pausado. Una prueba verifica que el móvil no
menciona ninguna de esas banderas ni nada de Driver Finance.

## Pruebas

```
32 pruebas · node --test
```

Cubren lo que se puede comprobar sin un emulador: la configuración de entorno
(incluido que no cae a producción), los estados de conductor y su coherencia con
el backend, y un bloque de reglas estáticas sobre el propio código —endpoint
antiguo, almacenamiento del token, registros, autenticación paralela, permisos,
mapas, secretos y enlaces profundos—.

### Playwright no sirve aquí

Playwright prueba navegadores. Una app nativa necesita otra cosa: **Maestro**,
Detox o Appium. No se ha instalado ninguno — elegirlo sin tener pantallas que
probar sería elegir a ciegas. Se decide en Wave 2, cuando haya flujo real.

## Comandos

```bash
npm run mobile:start
```

```bash
npm run mobile:typecheck
```

```bash
npm run mobile:test
```

```bash
npm run mobile:bundle:check
```

Los 13 scripts que ya existían no se tocaron.

## Compilaciones nativas

```
PRODUCTION_NATIVE_BUILD_CREATED: NO
```

Se trabaja en **flujo gestionado**: no existen `ios/` ni `android/` en el
repositorio, y no hacen falta todavía. Se generarán con `expo prebuild` cuando
aparezca la primera capacidad que requiera código nativo propio —probablemente el
GPS en segundo plano (Wave 5) o el proveedor de mapas (Wave 7)—.

Hacerlo antes significaría mantener a mano dos carpetas de proyecto nativo que
Expo sabe generar sola.

**Nada se subió a ninguna tienda.** Sin EAS Submit, sin firma de distribución,
sin perfiles de aprovisionamiento.

### Identificadores

```
com.plus58express.app     iOS y Android, el mismo
plus58express             esquema de enlaces profundos
```

No hay una decisión oficial previa registrada, así que se eligió un valor
coherente con el dominio del producto y **fácil de cambiar**: no se ha publicado
nada, así que cambiarlo hoy no cuesta nada. Cuando se registre en las tiendas,
dejará de ser reversible.

## Enlaces profundos

Hay esquema (`plus58express://`) y una regla: **ningún enlace ejecuta una acción
financiera**. Un enlace nunca debe aprobar un retiro, cambiar un rol privilegiado
ni marcar un viaje como completo sin pasar por autenticación y validación del
backend. Hoy sólo hay rutas de navegación, y una prueba lo mantiene así.

## Dependencias, y por qué cada una

| Paquete | Para qué |
|---|---|
| `expo` | el SDK; flujo gestionado, sin carpetas nativas que mantener |
| `expo-router` | navegación por ficheros, enlaces profundos y rutas tipadas |
| `react-native-screens` | pantallas nativas de verdad; lo exige Expo Router |
| `react-native-safe-area-context` | áreas seguras reales, no simuladas |
| `expo-secure-store` | Keychain/Keystore para el token |
| `expo-linking` | resolución de enlaces profundos |
| `expo-constants` | metadatos de la app en ejecución |
| `expo-status-bar` | barra de estado clara sobre el fondo grafito |

Ninguna es abandonada: todas son del núcleo de Expo o del ecosistema oficial de
React Native. **No se añadió gestor de estado** —Redux, Zustand, MobX—: la
fundación no tiene estado compartido que lo justifique, y `useState` con contexto
basta. Cuando haga falta, se justificará entonces.

### Vulnerabilidades

`npm audit` reporta **10 moderadas**, todas con una única raíz: `uuid` (falta de
comprobación de límites en v3/v5/v6) que llega vía `xcode` →
`@expo/config-plugins` → la cadena de herramientas de Expo.

Son dependencias de **construcción**, no del bundle que se instala en el
teléfono. Ninguna entra en el código que se ejecuta en el dispositivo. Vienen
fijadas por el SDK 57 y no se pueden resolver sin `--force`, que rompería el SDK.
Se revisarán cuando Expo publique una versión con la cadena actualizada.

## Olas

```
Wave 0   fundación                        ← ESTA FASE
Wave 1   acceso real y sesión
Wave 2   inicio de pasajera, origen y destino
Wave 3   inicio de conductor y disponibilidad
Wave 4   ciclo de vida del viaje
Wave 5   GPS nativo y segundo plano
Wave 6   notificaciones FCM/APNs
Wave 7   piloto de navegación y mapas
Wave 8   sin conexión y recuperación
Wave 9   interfaz de saldo y pagos
```

## Lo que esta fase deliberadamente NO hizo

```
✗ migrar la aplicación web
✗ tocar src/, server/ o la base de datos
✗ instalar mapas, notificaciones o ubicación
✗ pedir un solo permiso
✗ generar ios/ o android/
✗ subir nada a ninguna tienda
✗ añadir un gestor de estado
✗ convertir el repositorio a workspaces
✗ encender ninguna bandera financiera
✗ tocar Driver Finance, que sigue pausado
```
