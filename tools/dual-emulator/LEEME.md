# Laboratorio de dos emuladores

Dos emuladores a la vez para mirar los dos lados de una carrera: quien la pide
y quien la recibe. Con uno solo hay que ir cerrando sesión y volviendo a
entrar, y así no se ve nunca lo único que importa de verdad — qué pasa en la
pantalla del otro en el mismo segundo.

| Papel | AVD | Serial |
|---|---|---|
| Pasajera | `Pixel_10_Pro` | el que toque; se descubre solo |
| Conductor | `Plus58_Driver` | el que toque; se descubre solo |

Los seriales **no se escriben a mano en ningún sitio**. `emulator-5554` es el
primero que arranca y `emulator-5556` el segundo, pero eso depende del orden y
de qué hubiera abierto ya. Los guiones le preguntan a cada emulador el nombre
de su AVD y deciden con eso, que es lo único que no cambia.

## Los guiones

```bash
node start-lab.mjs                          # levanta todo y abre la app en los dos
node status-lab.mjs                         # cómo está: build, backend, metro, GPS
node stop-lab.mjs                           # recoge el puente
node stop-lab.mjs --emuladores              # …y apaga también los emuladores
node set-passenger-location.mjs 10.64 -71.61
node set-driver-location.mjs   10.67 -71.59
```

Sin dependencias: Node y el SDK de Android, que ya hacen falta para todo lo
demás.

## El puente del 8081

La compilación de depuración pide su JavaScript a `10.0.2.2:8081` y no hay
forma cómoda de convencerla de otra cosa. El menú de desarrollo permite cambiar
la dirección a mano —*Change Bundle Location*—, pero **el ajuste no sobrevive a
cerrar la aplicación**: en un laboratorio de dos emuladores habría que repetirlo
en cada arranque, en los dos, y a mano.

Así que `puente-metro.mjs` escucha en el 8081 del ordenador y reenvía todo al
Metro de verdad (el 8085 por omisión). Las aplicaciones no se enteran: piden
donde siempre y les responde quien queremos.

Es un reenvío ciego —copia bytes en las dos direcciones, sin leer nada—, y por
eso funcionan igual el bundle, el canal de registro, la recarga en caliente y
el inspector.

**Si el 8081 ya está ocupado, el puente no pelea**: lo dice y se retira. Puede
ser el Metro de otro worktree, y entonces las aplicaciones cargarán SU código,
no el que crees. `status-lab` enseña de qué build va cada emulador para que eso
no pase inadvertido.

Para cambiar a qué Metro apunta el puente:

```bash
PLUS58_PUERTO_METRO=8090 node start-lab.mjs
```

## La huella del build

`status-lab` calcula el `md5` del APK instalado en cada emulador y avisa si no
coinciden. No es un adorno: comparar dos lados que llevan builds distintos
produce conclusiones falsas que parecen ciertas, y cuesta días darse cuenta.

También avisa si el APK **no es depurable**, que es la otra forma de perder una
tarde: una compilación de publicación lleva el JavaScript dentro y no escucha a
Metro, así que ninguno de tus cambios aparece por mucho que edites.

## Instalar la aplicación

A propósito, los guiones **no instalan nada**. Cuál es el APK bueno cambia según
lo que se esté probando, y un guión que lo decida por su cuenta acaba
instalando el equivocado.

Para poner en el segundo emulador exactamente el mismo build que ya tiene el
primero —que es lo que casi siempre se quiere—, se saca del propio dispositivo:

```bash
adb -s <serial-origen> shell pm path com.plus58express.app
adb -s <serial-origen> pull <ruta-que-devuelva> app.apk
adb -s <serial-destino> install -r -d -g app.apk
```

Así no hay que acordarse de dónde quedó el `build/outputs`, y la huella coincide
por construcción.

## Cuentas

El laboratorio **no crea usuarios**. Un conductor sigue necesitando su
aprobación real desde el panel de administración: fabricar uno a mano por
detrás haría que las pruebas pasaran por un camino que en producción no existe.
