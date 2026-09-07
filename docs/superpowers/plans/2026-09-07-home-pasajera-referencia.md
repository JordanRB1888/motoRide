# Home Passenger según la referencia visual — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer el Home de la pasajera de +58Express para que se vea casi 1:1 como la referencia entregada por el dueño (bloque utilitario con saldo, ubicación y accesos rápidos; hero publicitario con paginación; aliados comerciales con logotipos circulares; promociones en tarjetas con foto; rejilla «Nuestros servicios» con tarjeta destacada), conservando la top bar actual, la hoja «¿Qué necesitas hoy?», el modo mapa y la barra inferior.

**Architecture:** La pantalla sigue siendo `preview/pantallaInicioPasajera.tsx` (`C2InicioPasajera`), que ya tiene cabecera, hoja inferior, modo mapa y barra. Lo que cambia es la superficie comercial (`ui/PassengerHomeCommercial.tsx`), que pasa a componer cinco secciones, cada una en su propio archivo bajo `ui/`: `TarjetaDeSaldo` + `AccesosRapidos` (bloque utilitario), `PromoCarousel` (hero, mismo contrato de datos preparado para el panel administrativo), `CommercialPartners` (aliados con logotipos), `PromocionesDelInicio` (nuevo) y `RejillaDeServicios` (nuevo). Los datos siguen viviendo donde ya viven: servicios y accesos en `preview/fixtures.ts`; banners, aliados y promociones como mocks estructurados junto a su componente, con el campo de imagen listo para sustituir.

**Tech Stack:** Expo SDK 57 · React Native 0.86 · TypeScript · `react-native-reanimated` 4 (ya presente) · sin dependencias nuevas (ni `react-native-svg`, ni degradados: no se puede instalar por el choque con `react@19.2.3`, ver `ui/Icono.tsx`).

**Spec:** el encargo del dueño (mensaje del 7 de septiembre de 2026, con la imagen de referencia) y este documento. La imagen es la fuente principal de verdad.

## Global Constraints

- **La top bar (`Cabecera`) no se toca.** Avatar con iniciales, saludo, tasa y campana quedan exactamente como están.
- **No se toca backend, lógica de negocio, contratos, auth ni navegación.** Las claves de navegación son las que ya entiende `crearNavegacionDePasajero`: `inicio`, `saldo`, `pedir`, `buscar-destino`, `servicio`, `avisos`, `comercios`. Lo que no existe navega a `pronto` en el laboratorio y no hace nada en la app real, igual que hoy.
- **Sin dependencias nuevas.** Iconos con vistas (`ui/Icono.tsx`), velos con vistas semitransparentes, aros y chevrones con bordes.
- **Ninguna tinta escrita a mano en las piezas comerciales.** `test/inicioPasajera.test.mjs` prohíbe `color: '#…'`, `rgba(255,255,255…)` y `color: tema.color.acento` en `ui/PromoCarousel.tsx`, `ui/CommercialPartners.tsx` y `ui/PassengerHomeCommercial.tsx`. Este plan extiende esa lista a los archivos nuevos. El texto sobre fotografía usa el token nuevo `tema.color.sobreImagen`.
- **Tokens, no números sueltos:** `tema.ritmo.margenPantalla`, `tema.ritmo.entreBloques`, `tema.radio.tarjeta|campo|boton|insignia`, niveles de `Txt` (`display|titulo|encabezado|cuerpo|etiqueta|pie`).
- **Cadenas que las pruebas exigen en `preview/pantallaInicioPasajera.tsx`** y que deben seguir ahí: `LienzoDeMapa`, `hojaMontada`, `<ScrollView`, `SERVICIOS_DE_INICIO.map`, `onAlternar={hojaAbierta ? cerrarHoja : abrirHoja}`, `ir('servicio'`, `accessibilityState={{ disabled: !dato.listo }}`, `TASA_DEMO`, `PASAJERA_DEMO`, `CAMPANAS_DEMO`, `arte === undefined`, `banner !== undefined`, `<Campana`, `useAireDeArriba()` y `+ arriba`, `<Carrusel`, `<CampoDeDestino onPress={() => ir('buscar-destino')} />`, `abierto={hojaAbierta}`, `datos.tasa !== null && (`, `datos.lugares.length > 0 && (`, `datos.campanas.length > 0 && (`, `datos.conAliados && (`, `const DATOS_DEMO: DatosDelInicio`, `import { AvisoPostulacionDriver`, `avisoPostulacion?: PropiedadesAvisoPostulacion | null`, `<AvisoPostulacionDriver {...avisoPostulacion} />`, `abrirServiciosAlMontar`, exactamente un `¿Qué necesitas hoy?`, y **ningún** `<ScrollView horizontal` (las filas deslizantes viven en sus componentes).
- **`SERVICIOS_DE_INICIO`:** los `listo` siguen siendo exactamente `comercios`, `seguro`, `viajes`; sólo `viajes` lleva `ancho: true` (es la disposición de la hoja y del dibujo web; la rejilla del inicio es uniforme, como la referencia); todo servicio pendiente tiene entrada `'pronto'` en `DESTINO_DE_SERVICIO`.
- **Contenido de la referencia como base:** títulos, subtítulos, etiquetas y CTA tal como aparecen en la imagen. Los logotipos de aliados y las fotografías del hero/promociones no existen en el proyecto: se dejan **placeholders estructurados** (campo `logo` / `imagen`) y se usan los artes que sí hay (`VEHICULOS.MOTO.tarjeta`, `ARTE_DE_ALIADO`, `ARTE_DE_CAMPANA`, `ARTE_DE_SERVICIO`).
- **Barra inferior:** se conserva la actual (trazo de BATabBar recién aprobado). No se toca.

---

## Análisis de la referencia (lo que se replica)

Medidas sobre un marco de 393 pt de ancho; margen lateral 16 pt (aquí `tema.ritmo.margenPantalla`).

| Zona | Lo que se ve | Cómo se traduce |
|---|---|---|
| Fila de marca | Logotipo · píldora **Saldo** (disco amarillo con billetera, «Saldo» pequeño gris, importe en negrita, chevron) · campana con punto | La fila de marca es nuestra top bar y no se toca. La píldora de saldo baja a la primera fila del bloque utilitario, con el botón de ubicación a su derecha. |
| Buscador | Campo blanco, radio 14, 52 pt, pin oscuro, «¿A dónde vamos?» · botón cuadrado de ubicación 52×52 | `CampoDeDestino` existente (ya es así) · `BotonDeUbicacion` nuevo, junto a la píldora de saldo |
| Chips | Casa · Trabajo · Lugares favoritos · Recientes. Píldoras claras, 40 pt, icono 18 + rótulo 14 | `AccesosRapidos`, fila deslizante |
| Hero | Tarjeta a sangre entre márgenes, ~228 pt, radio 18, foto de motorizado con caja +58; titular en dos líneas con «tu ciudad» en amarillo; subtítulo; CTA amarillo «Descubre +58Express →»; rótulo manuscrito «Venezuela se mueve contigo» arriba a la derecha; tres puntos debajo | `PromoCarousel` rehecho: tarjeta con imagen o composición de marca (moto real sobre grafito), velo, titular con palabra destacada, CTA, rótulo en cursiva con subrayado amarillo, puntos |
| Aliados comerciales | Título 20/700 · «Ver todos ›» · seis discos de 72 pt con logotipo y nombre debajo | `CommercialPartners` rehecho: discos con `logo` opcional y monograma de respaldo; `CabeceraDeSeccion` |
| Promociones | Título · «Ver todas ›» · tarjetas 150×188 con foto, etiqueta de color arriba, titular blanco con palabra amarilla, línea de apoyo, botón redondo con chevron; puntos | `PromocionesDelInicio` nuevo |
| Nuestros servicios | Título · rejilla de 4 columnas: ilustración, título 14/700, apoyo 11 en dos líneas; segunda fila con tres casillas más estrechas y la tarjeta destacada amarilla («Servicio destacado» con corona, moto, «+58Moto Plus», «Más comodidad, más beneficios», chevron) | `RejillaDeServicios` nuevo, con `ServicioDestacado` |
| Barra inferior | Iconos con rótulo y botón «+» | La nuestra, sin cambios |

Paleta: fondo marfil (`fondo`), tarjetas blancas (`superficieElevada`) con borde fino (`borde`), amarillo de marca (`acento`) como acento, texto grafito (`textoPrimario` / `textoSecundario`). Sombras muy suaves (`tema.superficie.sombra`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `mobile/theme/esquemas.ts`, `mobile/theme/directions.ts` | **Modificar:** token `sobreImagen` (tinta sobre fotografía con velo). |
| `mobile/preview/fixtures.ts` | **Modificar:** títulos/detalles de `SERVICIOS_DE_INICIO` según referencia; `delivery` nuevo; `REJILLA_DEL_INICIO`; `SERVICIO_DESTACADO`; `ACCESOS_RAPIDOS`. |
| `mobile/navegacion/rutas.ts` | **Modificar:** `delivery: 'pronto'`, `motoplus: 'pronto'`. |
| `mobile/ui/Icono.tsx` | **Modificar:** glifos `chevron-derecha`, `ubicacion`, `corona`. |
| `mobile/ui/CabeceraDeSeccion.tsx` | **Crear:** título de sección + «Ver todos ›». |
| `mobile/ui/TarjetaDeSaldo.tsx` | **Crear:** píldora de saldo y botón de ubicación. |
| `mobile/ui/AccesosRapidos.tsx` | **Crear:** chips Casa / Trabajo / Lugares favoritos / Recientes. |
| `mobile/ui/PromoCarousel.tsx` | **Modificar:** hero con imagen o composición de marca; mismo contrato `BannerItem` (+ `tituloDestacado`, `imagen`, `soloImagen`). |
| `mobile/ui/CommercialPartners.tsx` | **Modificar:** discos con logotipo; mock con los aliados de la referencia. |
| `mobile/ui/PromocionesDelInicio.tsx` | **Crear:** tarjetas promocionales con foto y puntos. |
| `mobile/ui/RejillaDeServicios.tsx` | **Crear:** rejilla de 4 columnas + tarjeta destacada. |
| `mobile/ui/PassengerHomeCommercial.tsx` | **Modificar:** compone bloque utilitario (recibido como nodo) + hero + aliados + promociones + servicios en un solo `ScrollView`. |
| `mobile/preview/pantallaInicioPasajera.tsx` | **Modificar:** `saldo` en `DatosDelInicio`; bloque utilitario; cableado de acciones; cabecera del archivo. |
| `mobile/app/pasajero.tsx` | **Modificar:** `saldo: null` (la cartera no está encendida). |
| `mobile/test/homePasajera.test.mjs` | **Crear:** las custodias del rediseño. |

---

### Task 1: Token `sobreImagen`

**Files:**
- Modify: `mobile/theme/esquemas.ts` (interfaz `EsquemaDeColor` y los dos esquemas)
- Modify: `mobile/theme/directions.ts:48-88` (interfaz `Direccion.color`)
- Test: `mobile/test/homePasajera.test.mjs` (nuevo)

**Interfaces:**
- Produces: `tema.color.sobreImagen: string` en los dos esquemas.

- [ ] **Step 1: Escribir la prueba que falla**

```js
// mobile/test/homePasajera.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { despojarComentarios } from './ayudas.mjs';
import { ESQUEMA_CLARO, ESQUEMA_OSCURO } from '../theme/esquemas.ts';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizMovil = path.resolve(aqui, '..');
const leer = relativa => fs.readFileSync(path.join(raizMovil, relativa), 'utf8');

/** Luminancia relativa (WCAG), para medir y no opinar. */
function luminancia(hex) {
  const canal = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * canal(((n >> 16) & 255) / 255)
    + 0.7152 * canal(((n >> 8) & 255) / 255)
    + 0.0722 * canal((n & 255) / 255);
}
const contraste = (a, b) => {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
};

// El velo que va sobre las fotografías del inicio (hero y promociones). Es el
// mismo de día que de noche porque lo que hay debajo es una imagen, no una
// superficie del tema.
const VELO_SOBRE_FOTO = '#1f1c17';

test('los dos esquemas declaran la tinta sobre imagen, y se lee sobre el velo', () => {
  for (const [nombre, esquema] of [['claro', ESQUEMA_CLARO], ['oscuro', ESQUEMA_OSCURO]]) {
    assert.equal(typeof esquema.sobreImagen, 'string', `${nombre}: falta sobreImagen`);
    const relacion = contraste(esquema.sobreImagen, VELO_SOBRE_FOTO);
    assert.ok(relacion >= 4.5, `${nombre}: sobreImagen da ${relacion.toFixed(2)}:1 sobre el velo`);
  }
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd mobile && node --import ./test/resolver.mjs --test test/homePasajera.test.mjs`
Expected: FAIL — `claro: falta sobreImagen`.

- [ ] **Step 3: Añadir el token**

En `mobile/theme/esquemas.ts`, dentro de `EsquemaDeColor`, después de `readonly rutaDelMapa: string;`:

```ts
  /**
   * La tinta que va ENCIMA de una fotografía con velo oscuro (el hero y las
   * promociones del inicio).
   *
   * No cambia con el esquema: el velo es el mismo de día que de noche, y lo que
   * hay debajo es una imagen, no una superficie del tema. Existe como token
   * para que ninguna pieza escriba un blanco a mano —que es exactamente lo que
   * `inicioPasajera.test.mjs` prohíbe— y para que, si el velo cambia, la tinta
   * cambie en un solo sitio.
   */
  readonly sobreImagen: string;
```

En `ESQUEMA_OSCURO`, después de `rutaDelMapa: '#22C55E'`:

```ts
  rutaDelMapa: '#22C55E',
  sobreImagen: '#faf9f6'
```

En `ESQUEMA_CLARO`, después de la línea de `rutaDelMapa`:

```ts
  sobreImagen: '#faf9f6'
```

En `mobile/theme/directions.ts`, dentro de `readonly color: { … }`, después de `readonly rutaDelMapa: string;`:

```ts
    /** Texto sobre fotografía con velo. Igual en los dos esquemas. Ver `esquemas.ts`. */
    readonly sobreImagen: string;
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd mobile && node --import ./test/resolver.mjs --test test/homePasajera.test.mjs test/esquemas.test.mjs && npx tsc --noEmit`
Expected: PASS (incluida «los dos esquemas declaran exactamente los mismos tokens»).

- [ ] **Step 5: Commit**

```bash
git add mobile/theme/esquemas.ts mobile/theme/directions.ts mobile/test/homePasajera.test.mjs
git commit -m "feat(tema): tinta sobre imagen, igual en los dos esquemas"
```

---

### Task 2: Datos del inicio según la referencia

**Files:**
- Modify: `mobile/preview/fixtures.ts:107-172` (`SERVICIOS_DE_INICIO`) y añadir constantes después
- Modify: `mobile/navegacion/rutas.ts` (`DESTINO_DE_SERVICIO`)
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Produces:
  - `SERVICIOS_DE_INICIO` con la entrada `delivery` y títulos/detalles de la referencia.
  - `REJILLA_DEL_INICIO: readonly string[]` — orden de la rejilla del inicio.
  - `SERVICIO_DESTACADO: { clave: 'motoplus'; rotulo: string; titulo: string; detalle: string; listo: false }`.
  - `ACCESOS_RAPIDOS: readonly { clave: string; icono: NombreDeIcono; nombre: string }[]`.
  - `DESTINO_DE_SERVICIO.delivery === 'pronto'`, `DESTINO_DE_SERVICIO.motoplus === 'pronto'`.

- [ ] **Step 1: Escribir la prueba que falla** (añadir a `test/homePasajera.test.mjs`)

```js
import {
  ACCESOS_RAPIDOS,
  REJILLA_DEL_INICIO,
  SERVICIO_DESTACADO,
  SERVICIOS_DE_INICIO
} from '../preview/fixtures.ts';
import { DESTINO_DE_SERVICIO } from '../navegacion/rutas.ts';

test('la rejilla del inicio enseña los siete servicios de la referencia, en su orden', () => {
  const titulos = REJILLA_DEL_INICIO.map(clave => SERVICIOS_DE_INICIO.find(s => s.clave === clave)?.titulo);
  assert.deepEqual(titulos, ['Moto', 'Delivery', 'Comida', 'Envíos', 'Mercado', 'Comercios', 'Compra y venta']);
});

test('Transporte Seguro no está en la rejilla del inicio, pero sigue existiendo', () => {
  // La referencia no lo lleva. Tiene pestaña propia en la barra y sigue en la
  // hoja «¿Qué necesitas hoy?»: no se pierde, se saca de la rejilla.
  assert.ok(!REJILLA_DEL_INICIO.includes('seguro'));
  assert.ok(SERVICIOS_DE_INICIO.some(s => s.clave === 'seguro' && s.listo));
});

test('lo que la referencia promete y no existe lleva a «pronto»', () => {
  assert.equal(DESTINO_DE_SERVICIO.delivery, 'pronto');
  assert.equal(DESTINO_DE_SERVICIO[SERVICIO_DESTACADO.clave], 'pronto');
  assert.equal(SERVICIO_DESTACADO.listo, false);
  assert.equal(SERVICIO_DESTACADO.titulo, '+58Moto Plus');
});

test('los accesos rápidos son los cuatro de la referencia', () => {
  assert.deepEqual(ACCESOS_RAPIDOS.map(a => a.nombre), ['Casa', 'Trabajo', 'Lugares favoritos', 'Recientes']);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd mobile && node --import ./test/resolver.mjs --test test/homePasajera.test.mjs`
Expected: FAIL — `REJILLA_DEL_INICIO` no existe.

- [ ] **Step 3: Editar el fixture**

Sustituir `SERVICIOS_DE_INICIO` en `mobile/preview/fixtures.ts` por:

```ts
export const SERVICIOS_DE_INICIO = [
  {
    clave: 'viajes',
    // «Moto» y no «Viajes»: es como lo nombra la referencia del dueño, y es
    // lo que se pide. La clave no cambia: es la que entiende la navegación.
    titulo: 'Moto',
    detalle: 'Muévete por la ciudad',
    icono: 'moto' as const,
    arte: 'moto',
    listo: true,
    ancho: true
  },
  {
    clave: 'delivery',
    titulo: 'Delivery',
    detalle: 'Tus pedidos a domicilio',
    icono: 'moto' as const,
    // Sin ilustración todavía: cae al icono. El nombre ya dice qué fichero le
    // toca cuando llegue.
    arte: 'servicio-delivery',
    listo: false,
    ancho: false
  },
  {
    clave: 'comercios',
    titulo: 'Comercios',
    detalle: 'Tiendas y servicios',
    icono: 'maletin' as const,
    arte: 'servicio-comercios',
    listo: true,
    ancho: false
  },
  {
    clave: 'seguro',
    titulo: 'Transporte Seguro',
    detalle: 'Traslados programados',
    icono: 'escudo' as const,
    arte: 'servicio-transporte-seguro',
    listo: true,
    ancho: false
  },
  {
    clave: 'envios',
    titulo: 'Envíos',
    detalle: 'Paquetes y documentos',
    icono: 'maletin' as const,
    arte: 'servicio-envios',
    listo: false,
    ancho: false
  },
  {
    clave: 'comida',
    titulo: 'Comida',
    detalle: 'Restaurantes cerca de ti',
    icono: 'inicio' as const,
    arte: 'servicio-comida',
    listo: false,
    ancho: false
  },
  {
    clave: 'mercado',
    titulo: 'Mercado',
    detalle: 'Tu súper sin filas',
    icono: 'viajes' as const,
    arte: 'servicio-mercado',
    listo: false,
    ancho: false
  },
  {
    clave: 'tienda',
    titulo: 'Compra y venta',
    detalle: 'Publica, encuentra, negocia',
    icono: 'dolar' as const,
    arte: 'servicio-compra-vende',
    listo: false,
    ancho: false
  }
] as const;

/**
 * La rejilla del INICIO, en el orden de la referencia del dueño.
 *
 * Transporte Seguro no va: la referencia no lo lleva, tiene pestaña propia en
 * la barra de abajo y sigue en la hoja «¿Qué necesitas hoy?». No se pierde
 * nada; se saca de la rejilla.
 */
export const REJILLA_DEL_INICIO = ['viajes', 'delivery', 'comida', 'envios', 'mercado', 'comercios', 'tienda'] as const;

/**
 * La tarjeta destacada de la rejilla. Es lo que la referencia enseña; el
 * producto no existe, así que lleva a «pronto» como cualquier otro servicio
 * pendiente.
 */
export const SERVICIO_DESTACADO = {
  clave: 'motoplus',
  rotulo: 'Servicio destacado',
  titulo: '+58Moto Plus',
  detalle: 'Más comodidad, más beneficios',
  listo: false
} as const;

/** Los cuatro atajos del bloque utilitario. Todos abren el buscador de destino. */
export const ACCESOS_RAPIDOS = [
  { clave: 'casa', icono: 'inicio' as const, nombre: 'Casa' },
  { clave: 'trabajo', icono: 'maletin' as const, nombre: 'Trabajo' },
  { clave: 'favoritos', icono: 'estrella' as const, nombre: 'Lugares favoritos' },
  { clave: 'recientes', icono: 'reloj' as const, nombre: 'Recientes' }
] as const;
```

En `mobile/navegacion/rutas.ts`, en `DESTINO_DE_SERVICIO`, añadir:

```ts
  delivery: 'pronto',
  motoplus: 'pronto',
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd mobile && node --import ./test/resolver.mjs --test test/homePasajera.test.mjs test/inicioPasajera.test.mjs test/navegacionDeShell.test.mjs && npx tsc --noEmit`
Expected: PASS. (`inicioPasajera`: los pendientes son ahora cinco y el dibujo web pinta cinco PRONTO solo.)

- [ ] **Step 5: Commit**

```bash
git add mobile/preview/fixtures.ts mobile/navegacion/rutas.ts mobile/test/homePasajera.test.mjs
git commit -m "feat(inicio): servicios, destacado y accesos rapidos segun la referencia"
```

---

### Task 3: Tres glifos nuevos

**Files:**
- Modify: `mobile/ui/Icono.tsx:34-64` (lista) y `dibujar` (antes del cierre del `switch`)
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Produces: `NombreDeIcono` incluye `'chevron-derecha' | 'ubicacion' | 'corona'`.

- [ ] **Step 1: Prueba**

```js
import { NOMBRES_DE_ICONO } from '../ui/Icono.tsx';

test('la familia de iconos tiene lo que el inicio nuevo necesita', () => {
  for (const nombre of ['chevron-derecha', 'ubicacion', 'corona', 'billetera', 'estrella', 'reloj']) {
    assert.ok(NOMBRES_DE_ICONO.includes(nombre), `falta el icono «${nombre}»`);
  }
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `falta el icono «chevron-derecha»`.

- [ ] **Step 3: Implementar**

En la lista `NOMBRES_DE_ICONO`, después de `'estrella'`:

```ts
  'estrella',
  'chevron-derecha',
  'ubicacion',
  'corona'
```

En `dibujar`, antes de la llave que cierra el `switch`:

```tsx
    // «Hay más aquí»: un cuadrado con dos lados pintados, girado. Es la misma
    // punta que usa el carrusel; vive aquí para que las cabeceras de sección
    // no la redibujen.
    case 'chevron-derecha':
      return (
        <View style={{
          width: t.tamano * 0.38,
          height: t.tamano * 0.38,
          marginLeft: -t.tamano * 0.1,
          borderTopWidth: t.trazo,
          borderRightWidth: t.trazo,
          borderColor: t.color,
          transform: [{ rotate: '45deg' }]
        }} />
      );

    // Mi ubicación: un aro con punto y cuatro marcas, como el de los mapas.
    case 'ubicacion': {
      const aro = t.tamano * 0.56;
      const marca = t.tamano * 0.16;
      const brazo = (largo: number, alto: number, extra: object) => (
        <View style={{ position: 'absolute', width: largo, height: alto, borderRadius: t.trazo, backgroundColor: t.color, ...extra }} />
      );
      return (
        <>
          <View style={{ width: aro, height: aro, borderRadius: aro / 2, borderWidth: t.trazo, borderColor: t.color }} />
          <View style={{ position: 'absolute', width: t.tamano * 0.18, height: t.tamano * 0.18, borderRadius: t.tamano * 0.09, backgroundColor: t.color }} />
          {brazo(t.trazo, marca, { top: t.tamano * 0.06 })}
          {brazo(t.trazo, marca, { bottom: t.tamano * 0.06 })}
          {brazo(marca, t.trazo, { left: t.tamano * 0.06 })}
          {brazo(marca, t.trazo, { right: t.tamano * 0.06 })}
        </>
      );
    }

    // Corona: tres picos sobre una base. Señala lo destacado.
    case 'corona': {
      const pico = t.tamano * 0.3;
      return (
        <View style={{ width: t.tamano, height: t.tamano, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: t.tamano * 0.18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 0 }}>
            <Triangulo base={pico} alto={pico * 0.9} color={t.color} />
            <View style={{ marginBottom: pico * 0.35 }}>
              <Triangulo base={pico} alto={pico * 1.15} color={t.color} />
            </View>
            <Triangulo base={pico} alto={pico * 0.9} color={t.color} />
          </View>
          <View style={{ width: t.tamano * 0.78, height: t.trazo * 1.4, borderRadius: t.trazo, backgroundColor: t.color, marginTop: -1 }} />
        </View>
      );
    }
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `node --import ./test/resolver.mjs --test test/homePasajera.test.mjs && npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -am "feat(iconos): chevron, ubicacion y corona"` (sólo `ui/Icono.tsx` y la prueba).

---

### Task 4: `CabeceraDeSeccion`

**Files:**
- Create: `mobile/ui/CabeceraDeSeccion.tsx`
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Produces: `CabeceraDeSeccion({ titulo: string; accion?: string; onAccion?: () => void })`.

- [ ] **Step 1: Prueba**

```js
test('las secciones del inicio comparten una sola cabecera', () => {
  const fuente = despojarComentarios(leer('ui/CabeceraDeSeccion.tsx'));
  assert.match(fuente, /export function CabeceraDeSeccion/);
  assert.match(fuente, /nivel="encabezado"/, 'el título va en el nivel de encabezado');
  assert.match(fuente, /nombre="chevron-derecha"/, 'la acción lleva su chevron');
  assert.match(fuente, /accessibilityRole="header"/);
});
```

- [ ] **Step 2: Ver que falla** — el archivo no existe.

- [ ] **Step 3: Crear**

```tsx
/**
 * El título de una sección del inicio y su «Ver todos ›».
 *
 * Aliados, promociones y servicios abren igual: mismo nivel de texto, misma
 * acción a la derecha, mismo chevron. Con tres cabeceras escritas a mano se
 * notaba —tamaños distintos, una con flecha y otra sin ella— y se leían como
 * tres pantallas pegadas.
 */

import { Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export function CabeceraDeSeccion({ titulo, accion, onAccion }: {
  readonly titulo: string;
  readonly accion?: string;
  readonly onAccion?: () => void;
}) {
  const tema = useTema();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Txt nivel="encabezado" accessibilityRole="header" estilo={{ flex: 1 }}>{titulo}</Txt>
      {accion !== undefined ? (
        <Pressable
          onPress={onAccion}
          accessibilityRole="button"
          accessibilityLabel={`${accion}: ${titulo.toLowerCase()}`}
          hitSlop={8}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.6 : 1 })}
        >
          <Txt nivel="etiqueta" tono="secundario">{accion}</Txt>
          <Icono nombre="chevron-derecha" color={tema.color.textoSecundario} tamano={14} />
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Ver que pasa** y `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(inicio): cabecera de seccion comun`.

---

### Task 5: `TarjetaDeSaldo`, `BotonDeUbicacion` y `AccesosRapidos`

**Files:**
- Create: `mobile/ui/TarjetaDeSaldo.tsx`
- Create: `mobile/ui/AccesosRapidos.tsx`
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Produces:
  - `TarjetaDeSaldo({ saldo: { etiqueta: string; valor: string } | null; onPress: () => void })`
  - `BotonDeUbicacion({ onPress: () => void })` (mismo archivo)
  - `AccesosRapidos({ accesos: readonly { clave: string; icono: NombreDeIcono; nombre: string }[]; onElegir: (clave: string) => void })`

- [ ] **Step 1: Prueba**

```js
const PIEZAS_NUEVAS = [
  'ui/TarjetaDeSaldo.tsx',
  'ui/AccesosRapidos.tsx',
  'ui/CabeceraDeSeccion.tsx',
  'ui/PromocionesDelInicio.tsx',
  'ui/RejillaDeServicios.tsx'
];

test('las piezas nuevas del inicio tampoco fijan ninguna tinta a mano', () => {
  // La misma guarda que `inicioPasajera.test.mjs` pone a las tres piezas
  // comerciales de antes: una tinta escrita a mano no sabe si es de día.
  for (const pieza of PIEZAS_NUEVAS) {
    if (!fs.existsSync(path.join(raizMovil, pieza))) continue;
    const codigo = despojarComentarios(leer(pieza));
    assert.deepEqual(codigo.match(/color:\s*'#[0-9a-fA-F]{3,8}'/g) ?? [], [], `${pieza} escribe la tinta a mano`);
    assert.ok(!/rgba\(\s*255\s*,\s*255\s*,\s*255/.test(codigo), `${pieza} usa blanco con alfa`);
    assert.ok(!/color:\s*tema\.color\.acento\b/.test(codigo), `${pieza} escribe con tema.color.acento`);
  }
});

test('el saldo no inventa una cifra cuando no la hay', () => {
  const fuente = despojarComentarios(leer('ui/TarjetaDeSaldo.tsx'));
  assert.match(fuente, /saldo === null/, 'sin saldo real la píldora tiene que decir otra cosa, no un cero');
  assert.match(fuente, /nombre="billetera"/);
  assert.match(fuente, /export function BotonDeUbicacion/);
  assert.match(fuente, /nombre="ubicacion"/);
});

test('los accesos rápidos son chips, todos con nombre accesible', () => {
  const fuente = despojarComentarios(leer('ui/AccesosRapidos.tsx'));
  assert.match(fuente, /borderRadius: tema\.radio\.insignia/);
  assert.match(fuente, /accessibilityRole="button"/);
  assert.match(fuente, /accessibilityLabel=\{acceso\.nombre\}/);
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Crear `ui/TarjetaDeSaldo.tsx`**

```tsx
/**
 * La píldora de saldo y el botón de ubicación del bloque utilitario.
 *
 * SIN CIFRA NO HAY CIFRA
 *
 * La referencia enseña «Bs. 25,60». La cartera de la aplicación todavía no
 * está encendida en el servidor y la sesión no trae ningún importe, así que
 * en la app real la píldora dice «Ver saldo» y lleva a la pantalla de saldo,
 * donde se explica. Un importe inventado en la pantalla que más se abre acaba
 * citado como el dinero de alguien. En el laboratorio sale el del fixture.
 */

import { Pressable, View } from 'react-native';
import { Txt } from './componentes';
import { Icono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export interface SaldoDelInicio {
  readonly etiqueta: string;
  readonly valor: string;
}

export function TarjetaDeSaldo({ saldo, onPress }: {
  readonly saldo: SaldoDelInicio | null;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  const etiqueta = saldo === null ? 'Saldo' : saldo.etiqueta;
  const valor = saldo === null ? 'Ver saldo' : saldo.valor;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta}, ${valor}`}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 6,
        paddingRight: 12,
        height: 52,
        borderRadius: tema.radio.insignia,
        backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: tema.color.borde
      })}
    >
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        // El amarillo de marca como fondo rebajado: es superficie, no tinta.
        backgroundColor: `${tema.color.acento}33`
      }}>
        <Icono nombre="billetera" color={tema.color.acentoTexto} tamano={20} />
      </View>
      <View style={{ gap: 1 }}>
        <Txt nivel="pie" tono="tenue">{etiqueta}</Txt>
        <Txt nivel="etiqueta" estilo={{ fontWeight: '800', fontSize: 15 }}>{valor}</Txt>
      </View>
      <Icono nombre="chevron-derecha" color={tema.color.textoTenue} tamano={16} />
    </Pressable>
  );
}

/** El botón cuadrado de «mi ubicación» que la referencia pone junto al buscador. */
export function BotonDeUbicacion({ onPress }: { readonly onPress: () => void }) {
  const tema = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Usar mi ubicación actual"
      hitSlop={6}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: tema.radio.campo,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
        borderWidth: 1,
        borderColor: tema.color.borde
      })}
    >
      <Icono nombre="ubicacion" color={tema.color.textoPrimario} tamano={22} />
    </Pressable>
  );
}
```

- [ ] **Step 4: Crear `ui/AccesosRapidos.tsx`**

```tsx
/**
 * Casa · Trabajo · Lugares favoritos · Recientes.
 *
 * Píldoras claras en fila deslizante, como en la referencia. Todas abren el
 * buscador de destino, que es la puerta real a elegir un sitio: los sitios
 * guardados y los recientes viven allí. Prometer aquí una lista propia de
 * favoritos que no existe sería un botón que no lleva a nada.
 */

import { ScrollView, Pressable } from 'react-native';
import { Txt } from './componentes';
import { Icono, type NombreDeIcono } from './Icono';
import { useTema } from '../theme/ThemeContext';

export interface AccesoRapido {
  readonly clave: string;
  readonly icono: NombreDeIcono;
  readonly nombre: string;
}

export function AccesosRapidos({ accesos, onElegir }: {
  readonly accesos: readonly AccesoRapido[];
  readonly onElegir: (clave: string) => void;
}) {
  const tema = useTema();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -tema.ritmo.margenPantalla }}
      contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: 8 }}
    >
      {accesos.map(acceso => (
        <Pressable
          key={acceso.clave}
          onPress={() => onElegir(acceso.clave)}
          accessibilityRole="button"
          accessibilityLabel={acceso.nombre}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 40,
            paddingHorizontal: 14,
            borderRadius: tema.radio.insignia,
            backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
            borderWidth: 1,
            borderColor: tema.color.borde
          })}
        >
          <Icono nombre={acceso.icono} color={tema.color.textoPrimario} tamano={17} />
          <Txt nivel="etiqueta">{acceso.nombre}</Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 5: Ver que pasa** y `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `feat(inicio): saldo, ubicacion y accesos rapidos`.

---

### Task 6: Hero — `PromoCarousel` rehecho

**Files:**
- Modify: `mobile/ui/PromoCarousel.tsx` (contrato `BannerItem`, mock, render)
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Consumes: `tema.color.sobreImagen` (Task 1), `Icono 'chevron-derecha'` (Task 3).
- Produces: `BannerItem` con `tituloDestacado?: string`, `imagen?: ImageSourcePropType`, `soloImagen?: boolean`; `BANNERS_MOCK` con tres entradas; `PromoCarousel({ banners?, onSeleccionarBanner?, intervaloMs? })` sin cambios de firma.

- [ ] **Step 1: Prueba**

```js
import { BANNERS_MOCK } from '../ui/PromoCarousel.tsx';

test('el hero es una pieza publicitaria con imagen, titular destacado, CTA y puntos', () => {
  const fuente = despojarComentarios(leer('ui/PromoCarousel.tsx'));
  assert.match(fuente, /tema\.color\.sobreImagen/, 'el texto sobre la foto sale del token');
  assert.match(fuente, /tituloDestacado/, 'falta la palabra en amarillo del titular');
  assert.match(fuente, /VEHICULOS\.MOTO\.tarjeta/, 'sin foto, la composición de marca lleva la moto real');
  assert.ok(BANNERS_MOCK.length >= 3, 'la referencia enseña tres puntos');
  const primero = BANNERS_MOCK[0];
  assert.equal(primero.title, 'Más que un destino,');
  assert.equal(primero.tituloDestacado, 'es tu ciudad');
  assert.equal(primero.ctaLabel, 'Descubre +58Express');
  assert.equal(primero.tag, 'Venezuela se mueve contigo');
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Reescribir `ui/PromoCarousel.tsx`** (se conserva la lógica de auto-slide y puntos; cambia el contrato y el render)

```tsx
/**
 * El hero del inicio: una pieza publicitaria grande que domina la pantalla.
 *
 * DOS DUEÑOS DEL MISMO HUECO
 *
 * Un banner puede ser +58express contando algo suyo —se compone con los
 * tokens: titular con una palabra en amarillo, línea de apoyo, botón— o el
 * arte que entrega un anunciante con su texto dentro (`soloImagen`), que la
 * aplicación sólo enmarca. El contrato { id, title, tituloDestacado, subtitle,
 * imagen, ctaLabel, ctaAction, tag, active } es el que el panel administrativo
 * podrá rellenar.
 *
 * SIN FOTOGRAFÍA, LA MOTO REAL
 *
 * La referencia lleva la foto de un motorizado con su caja +58. Mientras no
 * exista, la composición de marca pone la moto amarilla real sobre grafito: es
 * un activo aprobado, no un pictograma «mientras tanto». Cuando llegue la foto,
 * va en `imagen` y esta composición deja de pintarse sola.
 *
 * EL TEXTO SOBRE LA FOTO NO SABE DE ESQUEMAS
 *
 * Va con `sobreImagen`, que es igual de día que de noche porque lo que hay
 * debajo es un velo oscuro sobre una imagen, no una superficie del tema. El
 * velo se dibuja con vistas —no hay degradados sin biblioteca— en dos capas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_CAMPANA, VEHICULOS } from '../theme/marca';
import { useMovimientoReducido } from './movimiento';

export interface BannerItem {
  readonly id: string;
  readonly title: string;
  /** La parte del titular que va en amarillo. Va DESPUÉS de `title`. */
  readonly tituloDestacado?: string;
  readonly subtitle: string;
  readonly imagen?: ImageSourcePropType;
  /** El arte trae su propio texto: se enmarca y no se escribe nada encima. */
  readonly soloImagen?: boolean;
  readonly ctaLabel?: string;
  readonly ctaAction?: string;
  readonly active: boolean;
  /** El rótulo manuscrito de arriba a la derecha. */
  readonly tag?: string;
}

/**
 * El grafito del lienzo de marca y el velo sobre las fotografías. Son los
 * mismos de día que de noche: un anuncio no cambia de color con la hora.
 */
const LIENZO = Object.freeze({
  fondo: '#15140f',
  veloAlto: 'rgba(11, 10, 9, 0.18)',
  veloBajo: 'rgba(11, 10, 9, 0.62)'
});

const ALTO_DEL_HERO = 228;
const HUECO = 12;

export const BANNERS_MOCK: readonly BannerItem[] = Object.freeze([
  {
    id: 'hero-ciudad',
    title: 'Más que un destino,',
    tituloDestacado: 'es tu ciudad',
    subtitle: 'Movilidad, entregas y más, en una sola app.',
    ctaLabel: 'Descubre +58Express',
    ctaAction: 'pedir',
    tag: 'Venezuela se mueve contigo',
    active: true
  },
  {
    id: 'hero-repuestos',
    title: 'Repuestos y accesorios',
    subtitle: 'Moter Repuestos UM',
    imagen: ARTE_DE_CAMPANA['campana-repuestos'],
    soloImagen: true,
    ctaAction: 'comercios',
    active: true
  },
  {
    id: 'hero-aviso',
    title: 'Espacio de aviso',
    subtitle: 'Para lo que +58express necesite contar ese día.',
    imagen: ARTE_DE_CAMPANA['campana-aviso'],
    soloImagen: true,
    ctaAction: 'comercios',
    active: true
  }
]);

interface PropiedadesPromoCarousel {
  readonly banners?: readonly BannerItem[];
  readonly onSeleccionarBanner?: (banner: BannerItem) => void;
  readonly intervaloMs?: number;
}

export function PromoCarousel({
  banners = BANNERS_MOCK,
  onSeleccionarBanner,
  intervaloMs = 6000
}: PropiedadesPromoCarousel) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const { width: anchoPantalla } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const interactuandoRef = useRef(false);
  const anchoTarjeta = anchoPantalla - tema.ritmo.margenPantalla * 2;

  const bannersActivos = banners.filter(b => b.active);
  const total = bannersActivos.length;

  const irAlSiguiente = useCallback(() => {
    if (interactuandoRef.current || total <= 1 || quieto) return;
    setIndiceActivo(prev => {
      const siguiente = (prev + 1) % total;
      scrollRef.current?.scrollTo({ x: siguiente * (anchoTarjeta + HUECO), animated: true });
      return siguiente;
    });
  }, [total, quieto, anchoTarjeta]);

  useEffect(() => {
    if (total <= 1 || quieto) return;
    const temporizador = setInterval(irAlSiguiente, intervaloMs);
    return () => clearInterval(temporizador);
  }, [irAlSiguiente, intervaloMs, total, quieto]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const indice = Math.round(e.nativeEvent.contentOffset.x / (anchoTarjeta + HUECO));
    setIndiceActivo(Math.max(0, Math.min(indice, total - 1)));
    interactuandoRef.current = false;
  };

  if (total === 0) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={anchoTarjeta + HUECO}
        decelerationRate="fast"
        onScrollBeginDrag={() => { interactuandoRef.current = true; }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: HUECO }}
      >
        {bannersActivos.map(banner => (
          <Pressable
            key={banner.id}
            accessibilityRole="button"
            accessibilityLabel={`${banner.title} ${banner.tituloDestacado ?? ''}. ${banner.subtitle}`}
            onPress={() => onSeleccionarBanner?.(banner)}
            style={({ pressed }) => [
              estilos.tarjeta,
              {
                width: anchoTarjeta,
                borderRadius: tema.radio.tarjeta,
                backgroundColor: LIENZO.fondo,
                opacity: pressed ? 0.94 : 1,
                transform: [{ scale: pressed && !quieto ? 0.99 : 1 }]
              }
            ]}
          >
            {banner.imagen !== undefined ? (
              <Image source={banner.imagen} resizeMode="cover" style={StyleSheet.absoluteFill} />
            ) : (
              // La composición de marca: la moto real, grande, a la derecha.
              <Image
                source={VEHICULOS.MOTO.tarjeta}
                resizeMode="contain"
                style={{ position: 'absolute', right: -anchoTarjeta * 0.08, bottom: 6, width: anchoTarjeta * 0.66, height: ALTO_DEL_HERO * 0.78 }}
              />
            )}

            {banner.soloImagen ? null : (
              <>
                {/* El velo, en dos capas: clara arriba, densa abajo. Es lo que
                    hace legible el texto sin apagar la imagen entera. */}
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: LIENZO.veloAlto }]} />
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%', backgroundColor: LIENZO.veloBajo }} />

                {banner.tag ? (
                  <View style={estilos.rotulo}>
                    <Text style={[estilos.rotuloTexto, { color: tema.color.sobreImagen }]}>{banner.tag}</Text>
                    <View style={{ height: 2, borderRadius: 1, backgroundColor: tema.color.acento, marginTop: 2, width: '70%', alignSelf: 'flex-end' }} />
                  </View>
                ) : null}

                <View style={estilos.cuerpo}>
                  <Text style={[estilos.titular, { color: tema.color.sobreImagen }]} numberOfLines={2}>
                    {banner.title}
                    {banner.tituloDestacado ? <Text style={{ color: tema.color.acento }}>{' '}{banner.tituloDestacado}</Text> : null}
                  </Text>
                  <Text style={[estilos.apoyo, { color: tema.color.sobreImagen }]} numberOfLines={2}>{banner.subtitle}</Text>
                  {banner.ctaLabel ? (
                    <View style={[estilos.cta, { backgroundColor: tema.color.acento, borderRadius: tema.radio.boton }]}>
                      <Text style={[estilos.ctaTexto, { color: tema.color.sobreAcento }]}>{banner.ctaLabel}</Text>
                      <Text style={[estilos.ctaTexto, { color: tema.color.sobreAcento }]}>→</Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {total > 1 ? (
        <View style={estilos.puntos} accessibilityElementsHidden importantForAccessibility="no">
          {bannersActivos.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === indiceActivo ? 10 : 8,
                height: i === indiceActivo ? 10 : 8,
                borderRadius: 5,
                backgroundColor: i === indiceActivo ? tema.color.acento : tema.color.borde
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { height: ALTO_DEL_HERO, overflow: 'hidden', justifyContent: 'flex-end' },
  rotulo: { position: 'absolute', top: 16, right: 18, alignItems: 'flex-end', transform: [{ rotate: '-6deg' }] },
  rotuloTexto: { fontSize: 13, fontStyle: 'italic', fontWeight: '700', letterSpacing: 0.2 },
  cuerpo: { padding: 18, gap: 6, maxWidth: '68%' },
  titular: { fontSize: 24, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6 },
  apoyo: { fontSize: 12.5, lineHeight: 17, opacity: 0.92 },
  cta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 36, paddingHorizontal: 14, marginTop: 6 },
  ctaTexto: { fontSize: 13, fontWeight: '800' },
  puntos: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 }
});
```

- [ ] **Step 4: Ver que pasa** — `node --import ./test/resolver.mjs --test test/homePasajera.test.mjs test/inicioPasajera.test.mjs && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(inicio): hero publicitario con imagen, titular destacado y CTA`.

---

### Task 7: Aliados con logotipos — `CommercialPartners` rehecho

**Files:**
- Modify: `mobile/ui/CommercialPartners.tsx`
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Consumes: `CabeceraDeSeccion` (Task 4).
- Produces: `CommercialPartner { id; name; logo?: ImageSourcePropType; colorDeMarca?: string; tintaDeMarca?: string; inicial?: string }`; `ALIADOS_MOCK` con los seis de la referencia; `CommercialPartners({ aliados?, onSeleccionarAliado?, onVerTodos? })` sin cambio de firma.

- [ ] **Step 1: Prueba**

```js
import { ALIADOS_MOCK } from '../ui/CommercialPartners.tsx';

test('los aliados son los de la referencia, en discos, con hueco para el logotipo', () => {
  assert.deepEqual(ALIADOS_MOCK.map(a => a.name), ['McDonald’s', 'Farmatodo', 'Automercado', 'Café Amanecer', 'Yummy', 'MultiMax']);
  const fuente = despojarComentarios(leer('ui/CommercialPartners.tsx'));
  assert.match(fuente, /aliado\.logo !== undefined/, 'cuando haya logotipo se pinta; mientras, el monograma');
  assert.match(fuente, /<CabeceraDeSeccion/);
  assert.match(fuente, /borderRadius: DIAMETRO \/ 2/);
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Reescribir `ui/CommercialPartners.tsx`**

```tsx
/**
 * Aliados comerciales: seis discos con logotipo y el nombre debajo.
 *
 * LOS LOGOTIPOS NO ESTÁN
 *
 * La referencia enseña seis marcas reales. Ninguna ha entregado su logotipo,
 * así que cada disco lleva un monograma sobre el color de la marca: es el hueco
 * preparado, no un adorno. El día que llegue el archivo, va en `logo` y el
 * monograma deja de pintarse. Los colores de marca son DATOS del aliado, no
 * tintas de la interfaz: por eso viven en el mock y no en el tema.
 *
 * El nombre debajo va en la tinta del tema, que es la que sabe si es de día.
 */

import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { CabeceraDeSeccion } from './CabeceraDeSeccion';
import { useMovimientoReducido } from './movimiento';

export interface CommercialPartner {
  readonly id: string;
  readonly name: string;
  readonly logo?: ImageSourcePropType;
  readonly colorDeMarca?: string;
  readonly tintaDeMarca?: string;
  readonly inicial?: string;
}

export const ALIADOS_MOCK: readonly CommercialPartner[] = Object.freeze([
  { id: 'mcdonalds', name: 'McDonald’s', colorDeMarca: '#da291c', tintaDeMarca: '#ffc72c', inicial: 'M' },
  { id: 'farmatodo', name: 'Farmatodo', colorDeMarca: '#0b4ea2', tintaDeMarca: '#ffffff', inicial: 'F' },
  { id: 'automercado', name: 'Automercado', colorDeMarca: '#1d7a3a', tintaDeMarca: '#ffffff', inicial: 'A' },
  { id: 'cafe-amanecer', name: 'Café Amanecer', colorDeMarca: '#5b3a1e', tintaDeMarca: '#f7d774', inicial: 'C' },
  { id: 'yummy', name: 'Yummy', colorDeMarca: '#2dbb8f', tintaDeMarca: '#ffffff', inicial: 'Y' },
  { id: 'multimax', name: 'MultiMax', colorDeMarca: '#ffffff', tintaDeMarca: '#1a2b6d', inicial: 'M' }
]);

const DIAMETRO = 70;
const ANCHO_DE_CELDA = 84;

interface PropiedadesCommercialPartners {
  readonly aliados?: readonly CommercialPartner[];
  readonly onSeleccionarAliado?: (aliado: CommercialPartner) => void;
  readonly onVerTodos?: () => void;
}

export function CommercialPartners({ aliados = ALIADOS_MOCK, onSeleccionarAliado, onVerTodos }: PropiedadesCommercialPartners) {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  if (aliados.length === 0) return null;

  return (
    <View>
      <CabeceraDeSeccion titulo="Aliados comerciales" accion="Ver todos" onAccion={onVerTodos} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: 6 }}
      >
        {aliados.map(aliado => (
          <Pressable
            key={aliado.id}
            accessibilityRole="button"
            accessibilityLabel={aliado.name}
            onPress={() => onSeleccionarAliado?.(aliado)}
            style={({ pressed }) => [estilos.celda, { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed && !quieto ? 0.97 : 1 }] }]}
          >
            <View style={[
              estilos.disco,
              {
                backgroundColor: aliado.colorDeMarca ?? tema.color.superficieElevada,
                borderColor: tema.color.borde,
                ...tema.superficie.sombra
              }
            ]}>
              {aliado.logo !== undefined ? (
                <Image source={aliado.logo} resizeMode="contain" style={{ width: DIAMETRO * 0.62, height: DIAMETRO * 0.62 }} />
              ) : (
                <Text style={[estilos.monograma, { color: aliado.tintaDeMarca ?? tema.color.acentoTexto }]}>
                  {aliado.inicial ?? aliado.name.slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={[estilos.nombre, { color: tema.color.textoPrimario }]} numberOfLines={2}>{aliado.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  celda: { width: ANCHO_DE_CELDA, alignItems: 'center', gap: 8 },
  disco: { width: DIAMETRO, height: DIAMETRO, borderRadius: DIAMETRO / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monograma: { fontSize: 28, fontWeight: '900', fontStyle: 'italic' },
  nombre: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', lineHeight: 16 }
});
```

- [ ] **Step 4: Ver que pasa** (también `test/inicioPasajera.test.mjs`: sin `color: '#…'` — los colores de marca van en `colorDeMarca:`/`tintaDeMarca:`, que no son `color:`).
- [ ] **Step 5: Commit** — `feat(inicio): aliados comerciales en discos con hueco para logotipo`.

---

### Task 8: `PromocionesDelInicio`

**Files:**
- Create: `mobile/ui/PromocionesDelInicio.tsx`
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Consumes: `CabeceraDeSeccion`, `tema.color.sobreImagen`, `ARTE_DE_ALIADO`, `Icono 'chevron-derecha'`.
- Produces: `Promocion { id; etiqueta; tonoEtiqueta: 'acento' | 'exito'; titulo; tituloDestacado?; detalle; imagen?: ImageSourcePropType; accion: string }`; `PROMOCIONES_MOCK`; `PromocionesDelInicio({ promociones?, onAbrir, onVerTodas })`.

- [ ] **Step 1: Prueba**

```js
import { PROMOCIONES_MOCK } from '../ui/PromocionesDelInicio.tsx';

test('las promociones son las tres de la referencia, con foto y palabra destacada', () => {
  assert.deepEqual(PROMOCIONES_MOCK.map(p => p.etiqueta), ['HASTA 30% OFF', 'VIAJA SEGURO', 'TU MERCADO EN MINUTOS']);
  assert.equal(PROMOCIONES_MOCK[1].tituloDestacado, '20% OFF');
  const fuente = despojarComentarios(leer('ui/PromocionesDelInicio.tsx'));
  assert.match(fuente, /tema\.color\.sobreImagen/);
  assert.match(fuente, /<CabeceraDeSeccion/);
  assert.match(fuente, /nombre="chevron-derecha"/);
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Crear**

```tsx
/**
 * Promociones: tarjetas con fotografía, etiqueta de color, titular y botón.
 *
 * Son MOCK VISUAL, estructurado como lo rellenará el panel administrativo:
 * { id, etiqueta, tonoEtiqueta, titulo, tituloDestacado, detalle, imagen,
 * accion }. Las fotografías de la referencia no existen: se usan los artes de
 * publicidad que ya hay —compuestos con las ilustraciones de la aplicación—,
 * y cada uno se sustituye cambiando `imagen`.
 *
 * El texto va sobre un velo oscuro, con `sobreImagen`: igual de día que de
 * noche, porque debajo hay una imagen y no una superficie del tema.
 */

import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';

import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_ALIADO } from '../theme/marca';
import { CabeceraDeSeccion } from './CabeceraDeSeccion';
import { Icono } from './Icono';
import { useMovimientoReducido } from './movimiento';

export interface Promocion {
  readonly id: string;
  readonly etiqueta: string;
  readonly tonoEtiqueta: 'acento' | 'exito';
  readonly titulo: string;
  readonly tituloDestacado?: string;
  readonly detalle: string;
  readonly imagen?: ImageSourcePropType;
  readonly accion: string;
}

export const PROMOCIONES_MOCK: readonly Promocion[] = Object.freeze([
  {
    id: 'promo-comida',
    etiqueta: 'HASTA 30% OFF',
    tonoEtiqueta: 'acento',
    titulo: 'Tu comida favorita más cerca',
    detalle: 'Con +58Express',
    imagen: ARTE_DE_ALIADO['aliado-comida'],
    accion: 'comercios'
  },
  {
    id: 'promo-viaje',
    etiqueta: 'VIAJA SEGURO',
    tonoEtiqueta: 'exito',
    titulo: 'Primer viaje con',
    tituloDestacado: '20% OFF',
    detalle: 'Usa el código: HOLA58',
    imagen: ARTE_DE_ALIADO['aliado-moto'],
    accion: 'pedir'
  },
  {
    id: 'promo-mercado',
    etiqueta: 'TU MERCADO EN MINUTOS',
    tonoEtiqueta: 'acento',
    titulo: 'Frescura a tu puerta',
    detalle: 'Ahorra tiempo, vive más',
    imagen: ARTE_DE_ALIADO['aliado-mercado'],
    accion: 'comercios'
  }
]);

const ANCHO = 152;
const ALTO = 190;
const HUECO = 10;
const VELO = Object.freeze({ alto: 'rgba(11, 10, 9, 0.16)', bajo: 'rgba(11, 10, 9, 0.66)' });

export function PromocionesDelInicio({ promociones = PROMOCIONES_MOCK, onAbrir, onVerTodas }: {
  readonly promociones?: readonly Promocion[];
  readonly onAbrir: (promocion: Promocion) => void;
  readonly onVerTodas: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);
  // Caben dos y media: el número de puntos es el de «pantallas» de tarjetas.
  const visibles = Math.max(1, Math.floor((width - tema.ritmo.margenPantalla * 2) / (ANCHO + HUECO)));
  const paginas = Math.max(1, Math.ceil(promociones.length / visibles));

  if (promociones.length === 0) return null;

  return (
    <View>
      <CabeceraDeSeccion titulo="Promociones" accion="Ver todas" onAccion={onVerTodas} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ANCHO + HUECO}
        decelerationRate="fast"
        onMomentumScrollEnd={e => setIndice(Math.min(paginas - 1, Math.round(e.nativeEvent.contentOffset.x / ((ANCHO + HUECO) * visibles))))}
        style={{ marginHorizontal: -tema.ritmo.margenPantalla, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: tema.ritmo.margenPantalla, gap: HUECO }}
      >
        {promociones.map(promo => {
          const fondoEtiqueta = promo.tonoEtiqueta === 'exito' ? tema.color.exito : tema.color.acento;
          const tintaEtiqueta = promo.tonoEtiqueta === 'exito' ? tema.color.sobreImagen : tema.color.sobreAcento;
          return (
            <Pressable
              key={promo.id}
              accessibilityRole="button"
              accessibilityLabel={`${promo.etiqueta}. ${promo.titulo} ${promo.tituloDestacado ?? ''}. ${promo.detalle}`}
              onPress={() => onAbrir(promo)}
              style={({ pressed }) => [estilos.tarjeta, { borderRadius: 16, backgroundColor: tema.color.superficieHundida, opacity: pressed ? 0.94 : 1, transform: [{ scale: pressed && !quieto ? 0.985 : 1 }] }]}
            >
              {promo.imagen !== undefined ? <Image source={promo.imagen} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: VELO.alto }]} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%', backgroundColor: VELO.bajo }} />

              <View style={[estilos.etiqueta, { backgroundColor: fondoEtiqueta }]}>
                <Text style={[estilos.etiquetaTexto, { color: tintaEtiqueta }]} numberOfLines={2}>{promo.etiqueta}</Text>
              </View>

              <View style={estilos.cuerpo}>
                <Text style={[estilos.titulo, { color: tema.color.sobreImagen }]} numberOfLines={3}>
                  {promo.titulo}
                  {promo.tituloDestacado ? <Text style={{ color: tema.color.acento }}>{' '}{promo.tituloDestacado}</Text> : null}
                </Text>
                <Text style={[estilos.detalle, { color: tema.color.sobreImagen }]} numberOfLines={2}>{promo.detalle}</Text>
              </View>

              <View style={[estilos.boton, { backgroundColor: tema.color.superficieElevada }]}>
                <Icono nombre="chevron-derecha" color={tema.color.textoPrimario} tamano={14} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {paginas > 1 ? (
        <View style={estilos.puntos} accessibilityElementsHidden importantForAccessibility="no">
          {Array.from({ length: paginas }, (_, i) => (
            <View key={i} style={{ width: i === indice ? 10 : 8, height: i === indice ? 10 : 8, borderRadius: 5, backgroundColor: i === indice ? tema.color.acento : tema.color.borde }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { width: ANCHO, height: ALTO, overflow: 'hidden', padding: 12, justifyContent: 'flex-end' },
  etiqueta: { position: 'absolute', top: 12, left: 12, maxWidth: ANCHO - 24, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9 },
  etiquetaTexto: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  cuerpo: { gap: 3, paddingRight: 30 },
  titulo: { fontSize: 15, lineHeight: 18, fontWeight: '800', letterSpacing: -0.3 },
  detalle: { fontSize: 11, lineHeight: 14, opacity: 0.9 },
  boton: { position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  puntos: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 }
});
```

- [ ] **Step 4: Ver que pasa** y `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(inicio): promociones con foto, etiqueta y palabra destacada`.

---

### Task 9: `RejillaDeServicios` con `ServicioDestacado`

**Files:**
- Create: `mobile/ui/RejillaDeServicios.tsx`
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Consumes: `SERVICIOS_DE_INICIO`, `REJILLA_DEL_INICIO`, `SERVICIO_DESTACADO` (Task 2); `ARTE_DE_SERVICIO`, `VEHICULOS`; `Icono 'corona' | 'chevron-derecha'`; `CabeceraDeSeccion`.
- Produces: `RejillaDeServicios({ servicios: readonly ServicioDelInicio[]; destacado: typeof SERVICIO_DESTACADO; onElegir: (clave: string) => void })` donde `ServicioDelInicio = (typeof SERVICIOS_DE_INICIO)[number]`.

- [ ] **Step 1: Prueba**

```js
test('la rejilla del inicio es de cuatro columnas, con ilustración, y dice lo que no está', () => {
  const fuente = despojarComentarios(leer('ui/RejillaDeServicios.tsx'));
  assert.match(fuente, /COLUMNAS = 4/);
  assert.match(fuente, /ARTE_DE_SERVICIO\[dato\.arte\]/, 'las casillas usan las ilustraciones encargadas');
  assert.match(fuente, /arte === undefined/, 'sin ilustración cae al icono, no a un hueco');
  assert.match(fuente, /accessibilityState=\{\{ disabled: !dato\.listo \}\}/);
  assert.match(fuente, /PRONTO/, 'lo pendiente lo dice, aunque sea en pequeño');
  assert.match(fuente, /export function ServicioDestacado/);
  assert.match(fuente, /nombre="corona"/);
  assert.match(fuente, /VEHICULOS\.MOTO\.tarjeta/, 'la tarjeta destacada lleva la moto real');
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Crear**

```tsx
/**
 * «Nuestros servicios»: la rejilla de cuatro columnas de la referencia, y la
 * tarjeta destacada.
 *
 * LAS ILUSTRACIONES SON LAS ENCARGADAS
 *
 * Cada casilla lleva la ilustración que el dueño encargó para ese servicio
 * (`ARTE_DE_SERVICIO`), en miniatura redondeada. No se sustituyen por
 * pictogramas para parecerse más a la referencia: son activos de marca. La que
 * no exista todavía cae al icono de la familia.
 *
 * LO QUE NO ESTÁ, LO DICE
 *
 * La referencia no enseña ningún «pronto». La aplicación sí, porque una casilla
 * que no lleva a nada sin decirlo es una promesa rota a la primera pulsación —y
 * de las que las tiendas rechazan—. Va en una píldora pequeña, arriba a la
 * derecha, para que la rejilla siga leyéndose como la referencia. Y navega a la
 * pantalla de «pronto», que explica qué falta.
 *
 * `ancho` no se mira aquí: es la disposición de la hoja y del dibujo web. La
 * rejilla del inicio es uniforme, como en la referencia.
 */

import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import { ARTE_DE_SERVICIO, VEHICULOS } from '../theme/marca';
import type { SERVICIOS_DE_INICIO, SERVICIO_DESTACADO } from '../preview/fixtures';
import { CabeceraDeSeccion } from './CabeceraDeSeccion';
import { Icono } from './Icono';
import { Txt } from './componentes';
import { useMovimientoReducido } from './movimiento';

export type ServicioDelInicio = (typeof SERVICIOS_DE_INICIO)[number];
type Destacado = typeof SERVICIO_DESTACADO;

const COLUMNAS = 4;
const HUECO = 10;
const ALTO_DE_CASILLA = 148;

function PildoraPronto() {
  const tema = useTema();
  return (
    <View style={[estilos.pronto, { backgroundColor: tema.color.superficieHundida }]}>
      <Text style={[estilos.prontoTexto, { color: tema.color.textoTenue }]}>PRONTO</Text>
    </View>
  );
}

function Casilla({ dato, ancho, onPress }: {
  readonly dato: ServicioDelInicio;
  readonly ancho: number;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();
  const arte = ARTE_DE_SERVICIO[dato.arte];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dato.listo ? `${dato.titulo}: ${dato.detalle}` : `${dato.titulo}, próximamente`}
      accessibilityState={{ disabled: !dato.listo }}
      style={({ pressed }) => [
        estilos.casilla,
        {
          width: ancho,
          borderRadius: 16,
          backgroundColor: pressed ? tema.color.superficieHundida : tema.color.superficieElevada,
          borderColor: tema.color.borde,
          transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]
        }
      ]}
    >
      {arte === undefined ? (
        <View style={[estilos.miniatura, { backgroundColor: tema.color.superficieHundida }]}>
          <Icono nombre={dato.icono} color={tema.color.acentoTexto} tamano={26} />
        </View>
      ) : (
        <Image source={arte} resizeMode="cover" style={estilos.miniatura} />
      )}
      <Txt nivel="etiqueta" estilo={{ fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{dato.titulo}</Txt>
      <Text style={[estilos.detalle, { color: tema.color.textoSecundario }]} numberOfLines={2}>{dato.detalle}</Text>
      {dato.listo ? null : <PildoraPronto />}
    </Pressable>
  );
}

export function ServicioDestacado({ dato, ancho, onPress }: {
  readonly dato: Destacado;
  readonly ancho: number;
  readonly onPress: () => void;
}) {
  const tema = useTema();
  const quieto = useMovimientoReducido();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${dato.rotulo}: ${dato.titulo}, ${dato.detalle}. Próximamente`}
      accessibilityState={{ disabled: !dato.listo }}
      style={({ pressed }) => [
        estilos.destacado,
        {
          width: ancho,
          borderRadius: 16,
          // El amarillo rebajado como superficie: es lo que la hace destacar
          // sin competir con el botón de pedir.
          backgroundColor: `${tema.color.acento}${pressed ? '4d' : '30'}`,
          borderColor: `${tema.color.acento}80`,
          transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]
        }
      ]}
    >
      <View style={estilos.destacadoRotulo}>
        <Icono nombre="corona" color={tema.color.acentoTexto} tamano={14} />
        <Text style={[estilos.destacadoRotuloTexto, { color: tema.color.acentoTexto }]} numberOfLines={1}>{dato.rotulo}</Text>
      </View>
      <Image source={VEHICULOS.MOTO.tarjeta} resizeMode="contain" style={estilos.destacadoMoto} />
      <View style={{ gap: 2, paddingRight: 30 }}>
        <Txt nivel="etiqueta" estilo={{ fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{dato.titulo}</Txt>
        <Text style={[estilos.detalle, { color: tema.color.textoSecundario, textAlign: 'left' }]} numberOfLines={2}>{dato.detalle}</Text>
      </View>
      <View style={[estilos.destacadoBoton, { backgroundColor: tema.color.superficieElevada }]}>
        <Icono nombre="chevron-derecha" color={tema.color.textoPrimario} tamano={14} />
      </View>
      <PildoraPronto />
    </Pressable>
  );
}

export function RejillaDeServicios({ servicios, destacado, onElegir }: {
  readonly servicios: readonly ServicioDelInicio[];
  readonly destacado: Destacado;
  readonly onElegir: (clave: string) => void;
}) {
  const tema = useTema();
  const { width } = useWindowDimensions();
  const anchoUtil = width - tema.ritmo.margenPantalla * 2;
  const columna = (anchoUtil - HUECO * (COLUMNAS - 1)) / COLUMNAS;

  // Primera fila: cuatro iguales. Segunda: tres un poco más estrechas y la
  // destacada con el resto, como en la referencia.
  const primeraFila = servicios.slice(0, COLUMNAS);
  const segundaFila = servicios.slice(COLUMNAS, COLUMNAS * 2 - 1);
  const anchoEstrecho = Math.floor(columna * 0.86);
  const anchoDestacado = anchoUtil - anchoEstrecho * segundaFila.length - HUECO * segundaFila.length;

  return (
    <View>
      <CabeceraDeSeccion titulo="Nuestros servicios" />
      <View style={{ flexDirection: 'row', gap: HUECO, marginTop: 12 }}>
        {primeraFila.map(dato => (
          <Casilla key={dato.clave} dato={dato} ancho={columna} onPress={() => onElegir(dato.clave)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: HUECO, marginTop: HUECO }}>
        {segundaFila.map(dato => (
          <Casilla key={dato.clave} dato={dato} ancho={anchoEstrecho} onPress={() => onElegir(dato.clave)} />
        ))}
        <ServicioDestacado dato={destacado} ancho={anchoDestacado} onPress={() => onElegir(destacado.clave)} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  casilla: { height: ALTO_DE_CASILLA, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 12, alignItems: 'center', gap: 6 },
  miniatura: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  detalle: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  pronto: { position: 'absolute', top: 6, right: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  prontoTexto: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  destacado: { height: ALTO_DE_CASILLA, borderWidth: 1, padding: 12, justifyContent: 'space-between', overflow: 'hidden' },
  destacadoRotulo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  destacadoRotuloTexto: { fontSize: 11, fontWeight: '700' },
  destacadoMoto: { alignSelf: 'flex-end', width: 92, height: 54, marginTop: -6, marginRight: -6 },
  destacadoBoton: { position: 'absolute', right: 10, bottom: 12, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }
});
```

- [ ] **Step 4: Ver que pasa** y `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(inicio): rejilla de servicios de cuatro columnas con tarjeta destacada`.

---

### Task 10: `PassengerHomeCommercial` compone las secciones

**Files:**
- Modify: `mobile/ui/PassengerHomeCommercial.tsx`
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Consumes: todas las piezas anteriores.
- Produces: `PassengerHomeCommercial({ encabezado?: ReactNode; servicios; destacado; onPedirViaje; onVerAliados; onSeleccionarAliado?; onAbrirPromocion; onVerPromociones; onElegirServicio })`.

- [ ] **Step 1: Prueba**

```js
test('la superficie comercial compone las cinco secciones de la referencia, en orden', () => {
  const fuente = despojarComentarios(leer('ui/PassengerHomeCommercial.tsx'));
  const orden = ['{encabezado}', '<PromoCarousel', '<CommercialPartners', '<PromocionesDelInicio', '<RejillaDeServicios'];
  const posiciones = orden.map(marca => fuente.indexOf(marca));
  assert.ok(posiciones.every(p => p >= 0), `falta alguna sección: ${orden.filter((_, i) => posiciones[i] < 0).join(', ')}`);
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'las secciones no van en el orden de la referencia');
  assert.doesNotMatch(fuente, /Recarga tu saldo sin comisiones/, 'las tarjetas de promoción antiguas se fueron');
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Reescribir**

```tsx
/**
 * La superficie comercial del inicio de la pasajera, en el orden de la
 * referencia del dueño: bloque utilitario (lo trae la pantalla), hero,
 * aliados, promociones y servicios. Todo desliza; sólo la top bar queda fija.
 *
 * La tinta de todo lo que se escribe aquí sale del tema. Ver la nota de
 * `inicioPasajera.test.mjs`: esta superficie nació dibujada sobre grafito y en
 * el modo día sus títulos desaparecían.
 */

import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useTema } from '../theme/ThemeContext';
import type { SERVICIO_DESTACADO } from '../preview/fixtures';
import { PromoCarousel, type BannerItem } from './PromoCarousel';
import { CommercialPartners, type CommercialPartner } from './CommercialPartners';
import { PromocionesDelInicio, type Promocion } from './PromocionesDelInicio';
import { RejillaDeServicios, type ServicioDelInicio } from './RejillaDeServicios';

interface PropiedadesPassengerHomeCommercial {
  /** Saldo, ubicación, buscador y accesos rápidos. Los monta la pantalla. */
  readonly encabezado?: ReactNode;
  readonly servicios: readonly ServicioDelInicio[];
  readonly destacado: typeof SERVICIO_DESTACADO;
  readonly onPedirViaje: () => void;
  readonly onVerAliados: () => void;
  readonly onSeleccionarAliado?: (aliado: CommercialPartner) => void;
  readonly onAbrirPromocion: (promocion: Promocion) => void;
  readonly onVerPromociones: () => void;
  readonly onElegirServicio: (clave: string) => void;
  readonly onSeleccionarBanner?: (banner: BannerItem) => void;
}

export function PassengerHomeCommercial({
  encabezado,
  servicios,
  destacado,
  onPedirViaje,
  onVerAliados,
  onSeleccionarAliado,
  onAbrirPromocion,
  onVerPromociones,
  onElegirServicio,
  onSeleccionarBanner
}: PropiedadesPassengerHomeCommercial) {
  const tema = useTema();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: tema.ritmo.margenPantalla,
        paddingTop: 4,
        // La barra de abajo y su área segura.
        paddingBottom: 132,
        gap: tema.ritmo.entreBloques
      }}
    >
      {encabezado}

      <PromoCarousel
        onSeleccionarBanner={banner => {
          if (banner.ctaAction === 'pedir') onPedirViaje();
          else if (banner.ctaAction === 'comercios') onVerAliados();
          else onSeleccionarBanner?.(banner);
        }}
      />

      <CommercialPartners onSeleccionarAliado={onSeleccionarAliado} onVerTodos={onVerAliados} />

      <PromocionesDelInicio onAbrir={onAbrirPromocion} onVerTodas={onVerPromociones} />

      <RejillaDeServicios servicios={servicios} destacado={destacado} onElegir={onElegirServicio} />

      <View style={{ height: 4 }} />
    </ScrollView>
  );
}
```

- [ ] **Step 4: Ver que pasa** (`homePasajera`, `inicioPasajera`) y `npx tsc --noEmit` (fallará hasta que la Task 11 pase las props nuevas; se ejecutan juntas si hace falta).
- [ ] **Step 5: Commit** — junto con la Task 11.

---

### Task 11: La pantalla — bloque utilitario y cableado

**Files:**
- Modify: `mobile/preview/pantallaInicioPasajera.tsx` (cabecera del archivo, imports, `DatosDelInicio`, `DATOS_DEMO`, render sin modo mapa)
- Modify: `mobile/app/pasajero.tsx:169-181` (`saldo: null`)
- Test: `mobile/test/homePasajera.test.mjs`

**Interfaces:**
- Produces: `DatosDelInicio.saldo: SaldoDelInicio | null`.

- [ ] **Step 1: Prueba**

```js
test('el inicio conserva su top bar y monta el bloque utilitario debajo, en orden', () => {
  const fuente = despojarComentarios(leer('preview/pantallaInicioPasajera.tsx'));
  // La cabecera no se toca: mismo componente, mismos datos.
  assert.match(fuente, /<Cabecera datos=\{datos\} \/>/);
  const bloque = fuente.slice(fuente.indexOf('const encabezado ='), fuente.indexOf('<PassengerHomeCommercial'));
  const orden = ['<TarjetaDeSaldo', '<BotonDeUbicacion', "<CampoDeDestino onPress={() => ir('buscar-destino')} />", '<AccesosRapidos'];
  const posiciones = orden.map(marca => bloque.indexOf(marca));
  assert.ok(posiciones.every(p => p >= 0), `falta alguna pieza del bloque utilitario`);
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones);
  assert.match(fuente, /saldo: SaldoDelInicio \| null/);
  assert.match(fuente, /onPress=\{\(\) => ir\('saldo'\)\}/);
  // La app real no inventa un saldo.
  assert.match(despojarComentarios(leer('app/pasajero.tsx')), /saldo: null/);
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Editar `preview/pantallaInicioPasajera.tsx`**

Cabecera del archivo (sustituir el bloque de comentario inicial):

```ts
/**
 * El inicio de la pasajera, según la referencia visual del dueño.
 *
 * Debajo de la top bar —que no se toca— va el bloque utilitario (saldo,
 * ubicación, buscador y accesos rápidos), el hero publicitario, los aliados
 * comerciales, las promociones y la rejilla «Nuestros servicios». Todo
 * desliza; la top bar queda fija.
 *
 * LO QUE SE CONSERVA
 *
 * La hoja «¿Qué necesitas hoy?» que abre el botón amarillo, con sus casillas,
 * los sitios guardados, las campañas y el adelanto de aliados; y el modo mapa
 * al pedir. Son navegación y comportamiento, y el encargo era visual.
 *
 * LA REJILLA NO PROMETE LO QUE NO HAY
 *
 * Moto, Comercios y Transporte Seguro existen. Delivery, Comida, Envíos,
 * Mercado, Compra y venta y +58Moto Plus NO: salen porque la referencia los
 * lleva y dicen a dónde va +58express, pero llevan su píldora de PRONTO y
 * navegan a la pantalla que lo explica. Un botón que no lleva a nada, sin
 * decirlo, es una promesa rota a la primera pulsación.
 *
 * VIAJES SIGUE OCUPANDO EL ANCHO ENTERO EN LA HOJA
 *
 * `ancho` es la disposición de la hoja y del dibujo web; la rejilla del inicio
 * es uniforme, como en la referencia.
 */
```

Imports: añadir

```ts
import { TarjetaDeSaldo, BotonDeUbicacion, type SaldoDelInicio } from '../ui/TarjetaDeSaldo';
import { AccesosRapidos } from '../ui/AccesosRapidos';
import {
  ACCESOS_RAPIDOS,
  AVISOS_DEMO,
  CAMPANAS_DEMO,
  LUGARES_DEMO,
  PASAJERA_DEMO,
  REJILLA_DEL_INICIO,
  SALDO_DEMO,
  SERVICIO_DESTACADO,
  SERVICIOS_DE_INICIO,
  TASA_DEMO
} from './fixtures';
```

`DatosDelInicio`: añadir después de `tasa`:

```ts
  /** El saldo, si la cartera lo da. `null` mientras no exista uno de verdad. */
  readonly saldo: SaldoDelInicio | null;
```

`DATOS_DEMO`: añadir `saldo: { etiqueta: SALDO_DEMO.pasajera.rotulo, valor: SALDO_DEMO.pasajera.importe },` después de `tasa: TASA_DEMO,`.

Dentro de `C2InicioPasajera`, antes del `return`, después de los estilos animados:

```tsx
  // Los servicios de la rejilla del inicio, en el orden de la referencia.
  const serviciosDelInicio = REJILLA_DEL_INICIO
    .map(clave => SERVICIOS_DE_INICIO.find(dato => dato.clave === clave))
    .filter((dato): dato is (typeof SERVICIOS_DE_INICIO)[number] => dato !== undefined);

  // El bloque utilitario. Desliza con el resto; sólo la top bar queda fija.
  const encabezado = (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <TarjetaDeSaldo saldo={datos.saldo} onPress={() => ir('saldo')} />
        <BotonDeUbicacion onPress={() => ir('pedir')} />
      </View>
      <CampoDeDestino onPress={() => ir('buscar-destino')} />
      <AccesosRapidos accesos={ACCESOS_RAPIDOS} onElegir={() => ir('buscar-destino')} />
      {avisoPostulacion ? <AvisoPostulacionDriver {...avisoPostulacion} /> : null}
      {slotBanner ?? null}
    </View>
  );
```

En el render, la rama sin modo mapa pasa a:

```tsx
        <View style={{ flex: 1 }}>
          <View style={{ backgroundColor: tema.color.fondo }}>
            <Cabecera datos={datos} />
          </View>
          <View style={{ flex: 1 }}>
            <PassengerHomeCommercial
              encabezado={encabezado}
              servicios={serviciosDelInicio}
              destacado={SERVICIO_DESTACADO}
              onPedirViaje={() => ir('pedir')}
              onVerAliados={() => ir('comercios')}
              onSeleccionarAliado={() => ir('comercios')}
              onAbrirPromocion={promo => ir(promo.accion)}
              onVerPromociones={() => ir('comercios')}
              onElegirServicio={clave => ir('servicio', { servicio: clave })}
            />
          </View>
        </View>
```

La rama de modo mapa se deja como está (mantiene `<CampoDeDestino onPress={() => ir('buscar-destino')} />`, el aviso y el `slotBanner`).

**Nota sobre las custodias:** `<AvisoPostulacionDriver {...avisoPostulacion} />` sigue apareciendo en la rama de mapa y en `encabezado`; `<CampoDeDestino onPress={() => ir('buscar-destino')} />` igual; la hoja no cambia.

En `mobile/app/pasajero.tsx`, en el `useMemo` de `datos`, añadir `saldo: null,` después de `tasa: null,` con el comentario: `// La cartera no está encendida en el servidor: sin importe no se inventa.`

- [ ] **Step 4: Ver que pasa** — suite móvil entera: `cd mobile && npm test && npx tsc --noEmit`.
- [ ] **Step 5: Commit**

```bash
git add mobile/ui/PassengerHomeCommercial.tsx mobile/preview/pantallaInicioPasajera.tsx mobile/app/pasajero.tsx mobile/test/homePasajera.test.mjs
git commit -m "feat(inicio): home de la pasajera segun la referencia visual"
```

---

### Task 12: Verificación visual en el dispositivo (obligatoria antes de PASS)

**Files:** ninguno (verificación).

- [ ] **Step 1:** Metro sirve `C:/p58b/mobile` (worktree corto); llevar ese worktree al commit nuevo: `git -C C:/p58b checkout <sha>`; recargar la app en `emulator-5554` (`adb shell input keyevent 82` → Reload, o `am force-stop` + `am start`).
- [ ] **Step 2:** Capturar el inicio real (sesión `pasajera.barra@plus58.test`) arriba y tras deslizar hasta la rejilla: `adb exec-out screencap -p > home-01.png` / `home-02.png`.
- [ ] **Step 3:** Comparar contra la referencia sección por sección: orden, cabeceras, chips, hero (titular + palabra amarilla + CTA + rótulo + puntos), seis aliados con nombre, tres promociones con etiqueta/titular/botón, rejilla 4+3+destacada. Anotar cada desviación.
- [ ] **Step 4:** Modo noche en el laboratorio (`Ver el laboratorio visual` → Pasajera → Noche): capturar y comprobar que nada desaparece (textos, bordes, píldoras).
- [ ] **Step 5:** Pulsar: saldo → pantalla de saldo; ubicación → pedir; chips → buscador; hero CTA → pedir; aliado → comercios; promoción → su acción; casilla pendiente → «pronto» (laboratorio) / nada (app real, como hoy); botón amarillo → la hoja sigue abriendo.
- [ ] **Step 6:** `verification-before-completion`: sólo con las capturas y la suite verde se declara PASS.

---

### Task 13: Revisión de código

- [ ] **Step 1:** Invocar `requesting-code-review` sobre el rango de commits del rediseño (desde `3a9b1d5`).
- [ ] **Step 2:** Atender lo que salga; commits pequeños.
- [ ] **Step 3:** Entregar el resumen: componentes tocados/creados; qué quedó fiel; qué quedó como placeholder editable (fotos del hero y promociones, logotipos de aliados, ilustración de Delivery, importe del saldo).

---

## Self-review

**Cobertura del encargo:** top bar intacta (Task 11 conserva `<Cabecera datos={datos} />` sin tocar `Cabecera`); saldo + campanita (píldora en Task 5, campana ya en la top bar — se deja UNA sola); accesos rápidos (Task 5); hero con branding, mensaje, imagen, CTA y puntos (Task 6); aliados con los seis nombres, «Ver todos» y hueco para logotipos (Task 7); promociones con las tres de la referencia, «Ver todas», dots (Task 8); rejilla con Moto/Delivery/Comida/Envíos/Mercado/Comercios/Compra y venta y la destacada +58Moto Plus (Tasks 2 y 9); barra inferior integrada sin cambios; verificación visual (Task 12); revisión (Task 13).

**Placeholders explícitos:** fotografías del hero y las promociones (`imagen`), logotipos (`logo`), ilustración de Delivery (`servicio-delivery`), importe del saldo en la app real (`saldo: null` → «Ver saldo»).

**Consistencia de nombres:** `SaldoDelInicio`, `TarjetaDeSaldo`, `BotonDeUbicacion`, `AccesosRapidos`, `CabeceraDeSeccion`, `PromocionesDelInicio`, `Promocion`, `PROMOCIONES_MOCK`, `RejillaDeServicios`, `ServicioDestacado`, `ServicioDelInicio`, `REJILLA_DEL_INICIO`, `SERVICIO_DESTACADO`, `ACCESOS_RAPIDOS`, `sobreImagen` — usados con el mismo nombre en todas las tareas.

**Riesgos conocidos:** `test/inicioPasajera.test.mjs` cuenta los PRONTO del dibujo web contra los pendientes del fixture: al añadir `delivery`, ambos suben a cinco solos. `esquemas.test.mjs` exige paridad de claves entre esquemas: `sobreImagen` va en los dos.
