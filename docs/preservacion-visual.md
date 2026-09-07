# Manifiesto de preservación visual — +58express

Las piezas por las que la aplicación se reconoce, dónde viven y qué se hizo con
ellas al llevarlas al móvil.

Existe porque estas cosas se pierden sin que nadie lo decida: alguien pone un
pictograma «mientras tanto», el pictograma se queda, y meses después la
aplicación parece una plantilla. Aquí queda escrito qué había, y en
`mobile/test/preservacion.test.mjs` queda comprobado que sigue estando.

## Cómo se encontraron

No se asumió ningún nombre de archivo. Se recorrieron `public/`, `src/styles/` y
`src/pages/` buscando los elementos por su función, y de ahí salió el inventario
de abajo. El módulo `src/utils/vehicleMedia.js` resultó ser el registro canónico
de vehículos de la web, y `mobile/theme/marca.ts` es su equivalente en el móvil.

---

## Los activos

| Pieza | Ruta original | Función | En C2 | Adaptación |
|---|---|---|---|---|
| Moto amarilla | `public/vehicles/moto-real.png` (640×427) | Elegir servicio, Transporte Seguro | Selector Moto/Auto, escena de Transporte Seguro | **Exacta.** Mismos píxeles |
| Auto amarillo | `public/vehicles/car-real.png` (640×427) | Elegir servicio | Selector Moto/Auto | **Exacta.** Mismos píxeles |
| Moto cenital | `public/vehicles/moto-map-real.png` (384×384) | Marcador de mapa | Marcador, control de disponibilidad | **Exacta.** Mismos píxeles |
| Auto cenital | `public/vehicles/car-map-real.png` (384×384) | Marcador de mapa | Marcador | **Exacta.** Mismos píxeles |
| Logotipo apaisado | `public/brand-logo-header.png` (1476×522) | Cabecera de marca | Arranque, selector de rol, acceso | **Mitad exacta** → 738×261. Misma proporción |
| Emblema circular | `public/app-icon-brand-512.png` (512×512) | Icono y arranque | Arranque | **Exacta.** Ya estaba en `mobile/assets/splash-icon.png` |

Copiados a `mobile/assets/marca/`. Ninguno se recortó, se recoloreó ni se
filtró. El logotipo se guardó a la mitad de sus píxeles —división entera, así
que la proporción no cambia— porque a 850 KB pesaba casi tanto como el resto
junto y en pantalla nunca pasa de 240 puntos de ancho: quedó en 224 KB.

---

## Las composiciones

### Arranque

**Original:** `index.html`, incrustado antes de que cargue nada.

Fondo grafito con resplandor centrado algo por encima del medio, emblema
circular de 138 puntos con aro amarillo, dos órbitas girando en sentidos
contrarios (1,15 s y 1,8 s), el emblema girando sobre su eje vertical cada
1,35 s, «+58» en amarillo y «express» en blanco cálido muy apretados,
«Preparando tu viaje» en versales, tres puntos que saltan, y
`prefers-reduced-motion` respetado.

**En C2:** `mobile/ui/Arranque.tsx`. Se conservan todos los números y todos los
elementos.

**Adaptación:** el `radial-gradient` del fondo se compone con tres discos
concéntricos de opacidad decreciente, porque React Native no tiene degradados
sin añadir una biblioteca. Se ve equivalente y no pesa nada.

### Selector Moto / Auto

**Original:** `src/utils/vehicleMedia.js` + las tarjetas de
`src/pages/passenger/passengerApp.js`.

**En C2:** `mobile/ui/Servicio.tsx`, dentro de la hoja inferior. Vehículo real,
nombre, plazas, precio y tiempo.

**Adaptación:** sólo de composición. La elección se marca con el filo amarillo y
un escalón de superficie, nunca con un contorno amarillo alrededor: dos tarjetas
contorneadas en amarillo compiten entre sí y dejan de señalar cuál está elegida.

### Transporte Seguro

**Original:** `src/pages/passenger/passengerApp.js`. Una micro-historia animada
—traslado, entrada al entorno protegido, protección confirmada— con la moto
real, estelas de velocidad y un portal-candado con marca de comprobado. Pausada
fuera de vista con `IntersectionObserver`.

**En C2:** `mobile/ui/Servicio.tsx`. La misma escena y la misma moto.

**Adaptación:** en la web la moto recorre la tarjeta entera en bucle; en el
teléfono, dentro de una hoja que ya se mueve con el mapa detrás, ese recorrido
sería ruido, así que la moto sólo respira. La historia se lee igual.

**No se tocó** tarifa, facturación ni la lógica de Transporte Seguro. Es
integración visual y nada más.

### Marcador de moto en el mapa

**Original:** `public/vehicles/moto-map-real.png` vía `vehicleMedia.js`, variante
`map`.

**En C2:** `mobile/ui/Marca.tsx` → `MarcadorDeVehiculo`, sobre
`mobile/ui/Mapa.tsx`.

**Adaptación:** ninguna en el arte. Se le añadió giro según rumbo —la toma es
cuadrada precisamente para eso— y un halo para que no se pierda sobre una calle
clara. El vehículo propio o el asignado va más grande y con halo; los demás, a
tamaño normal.

En esta fase **no hay GPS ni orientación real**: el rumbo llega como un valor
fijo desde la maqueta. Sólo está preparado el hueco.

### Control de disponibilidad del conductor

**Original:** `src/styles/modern-yellow-lab.css`, clases `driver-online-fab*`.

El comentario original explica la decisión: ponerse en línea es la acción más
importante de la pantalla y vivía como un interruptor pequeño en una esquina de
la cabecera, así que pasó al centro de la barra, con la moto de la marca y el
verde que ya significa «activo» en el resto de la aplicación. Ese mismo
comentario deja constancia de que un pictograma genérico «se leía como
bicicleta», y por eso lleva la fotografía.

**En C2:** `mobile/ui/Navegacion.tsx` → `ControlDeDisponibilidad`, en el centro
de la barra del conductor.

Se conservan el disco de 56 puntos sobresaliendo por encima de la barra, la moto
real dentro, el aro verde y el fondo verde muy diluido al conectarse, el latido
lento mientras está disponible, y que el latido se apague si el sistema pide
movimiento reducido.

**Adaptación:** en la web la moto se apaga con `filter: grayscale(1)`. React
Native no tiene filtros de imagen sin añadir una biblioteca, así que aquí se
apaga bajando la opacidad. Misma intención —apagada frente a encendida—,
distinto medio. Es la única diferencia con el original.

**El interruptor antiguo de la cabecera no vuelve.** Este es el único control de
disponibilidad, como ya decidió el diseño de la web.

---

## Lo que NO se preservó, y por qué

Nada. Las siete piezas del contrato están en C2.

Una observación que conviene dejar escrita: **el arranque de la web usa
`#ffc400` para el aro y las órbitas, no el `#ffd21f` de la marca.** `#ffc400` es
`--x58-yellow-hover`, un tono de interacción; el arranque está incrustado en
`index.html` y se pinta antes de que cargue el CSS con las variables, así que
está escrito a mano. En el móvil se usa el amarillo de marca, `#ffd21f`, porque
ahí sí hay sistema de tokens y la coherencia manda. La diferencia entre los dos
es de un punto de calidez y no se aprecia a simple vista, pero es una
divergencia real y la decisión de unificarlos —o de no hacerlo— es del dueño.
