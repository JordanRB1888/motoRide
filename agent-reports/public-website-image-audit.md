# Auditoría de recursos visuales — mas58express.com

**13 de septiembre de 2026.** Despliegue auditado: `plus58express-208yl2gkg`.
**Sólo lectura: no se cambió nada.**

Veinte ficheros de imagen en `public/`, de los cuales **dieciocho se sirven** y
dos no los enlaza ninguna página.

---

## 1. El hallazgo que más importa

**Ya existía una foto de El Moján mejor que la que se publicó ayer, en el propio
repositorio.**

| | Origen | El optimizador entrega como mucho |
|---|---|---|
| `zonas/el-mojan.webp` | **720×960** | **640×853** |
| `zulia/el-mojan.jpg` | 335×597 | 335×597 — topa en el original |

Medido pidiéndole al optimizador los dos tamaños y comprobando lo que devuelve,
no leyéndolo del navegador. La imagen se pinta en una tarjeta de 285 px: la de
`zonas/` llega de sobra incluso en pantallas de doble densidad; la de `zulia/` se
queda corta en cuanto el teléfono tiene retina.

Son **la misma fotografía**: la aérea de la iglesia con el lago al fondo. La de
`zonas/` está tratada en blanco y negro y recortada en vertical para las tarjetas
de cobertura de la portada. Lo mismo ocurre con las otras dos.

> **Consecuencia:** el problema de resolución que reporté ayer tenía la solución
> dentro del repositorio. No hacía falta pedir una foto nueva de El Moján — hacía
> falta mirar antes lo que ya había.

Matiz honesto, para no exagerarlo: en la portada esas tres fotos se pintan a
**62×62 px**, como miniaturas junto al nombre de cada zona. No es el mismo papel
que en `/nosotros`, donde se ven a 285 px. No hay duplicación de contenido
visible; sí hay **dos copias del mismo activo**, y la peor es la que se usa
grande.

---

## 2. Inventario completo

### 2.1 Marca

| Fichero | Dimensiones | Peso | Dónde | Render | `next/image` | Alt |
|---|---|---|---|---|---|---|
| `brand/logo-lockup.png` | 2019×536 | 184 KB | Cabecera y pie, todas las páginas | 150×40 · 168×45 | Sí (w=256) | `+58Express` |
| `brand/moto.webp` | 1106×1199 | 215 KB | Hero de la portada | 301×326 | Sí (w=384) | vacío (decorativa) |
| `brand/og.jpg` | 1200×630 | 119 KB | Open Graph y Twitter | — (no se pinta) | No aplica | — |
| `brand/app-icon.png` | 512×512 | 111 KB | Favicon y `logo` del JSON-LD | — | No | — |
| `brand/app-icon-192.png` | 192×192 | 20 KB | Favicon | — | No | — |
| `brand/apple-touch-icon.png` | 180×180 | 18 KB | Icono de iOS | — | No | — |
| `brand/badge-apple.png` | 810×239 | 15 KB | Sección de descarga | 162×48 | Sí (w=256) | `Próximamente en App Store` |
| `brand/badge-google.png` | 810×239 | 16 KB | Sección de descarga | 162×48 | Sí (w=256) | `Próximamente en Google Play` |
| `brand/logo-moto.png` | 1536×1024 | **1128 KB** | **Ninguna** | — | — | — |

### 2.2 Pantallas de la aplicación

| Fichero | Dimensiones | Peso | Dónde | Render | `next/image` | Alt |
|---|---|---|---|---|---|---|
| `app/home.webp` | 941×1672 | 273 KB | Portada, teléfonos 3D | 279×582 · 284×593 | Sí (w=384) | «Inicio de +58Express con los servicios disponibles» |
| `app/map-select.webp` | 800×1579 | 215 KB | Portada | 279×583 · 246×513 | Sí (w=384) | «Mapa con la ruta trazada y el precio del viaje antes de confirmar» |
| `app/driver-onboarding.webp` | 941×1672 | 183 KB | Portada | 279×582 · 246×513 | Sí (w=384) | «Los conductores eligen sus horas de actividad» |
| `app/login.webp` | 800×1578 | 119 KB | Declarada en `content.ts`, **no se descarga** | — | — | — |

> `login.webp` no llega al navegador, y es deliberado: hay una prueba que falla si
> la portada la pide. Se conserva porque el catálogo de pantallas la declara.

### 2.3 Las tres plazas

| Fichero | Dimensiones | Peso | Dónde | Render | `next/image` | Alt |
|---|---|---|---|---|---|---|
| `zonas/santa-cruz-de-mara.webp` | 1080×1440 | 113 KB | Portada, tarjeta de zona | 62×62 | Sí (w=64) | vacío |
| `zonas/el-mojan.webp` | 720×960 | 58 KB | Portada, tarjeta de zona | 62×62 | Sí (w=64) | vacío |
| `zonas/maracaibo.webp` | 720×960 | 54 KB | Portada, tarjeta de zona | 62×62 | Sí (w=64) | vacío |
| `zulia/santa-cruz-de-mara.jpg` | 1600×900 | 218 KB | `/nosotros` | 285×356 | Sí (w=640) | «La plaza de Santa Cruz de Mara, con la estatua de Simón Bolívar…» |
| `zulia/el-mojan.jpg` | **335×597** | 48 KB | `/nosotros` | 285×356 | Sí (w=640) | «Vista aérea de la iglesia de El Moján y su plaza…» |
| `zulia/maracaibo.jpg` | 1080×795 | 106 KB | `/nosotros` | 285×356 | Sí (w=640) | «El monumento a la Virgen de Chiquinquirá en Maracaibo…» |

### 2.4 Sin usar

| Fichero | Dimensiones | Peso | Estado |
|---|---|---|---|
| `photo/campaign-hero.jpg` | 1152×2064 | 580 KB | Huérfana **documentada**: material de campaña que se conservó a propósito |
| `brand/logo-moto.png` | 1536×1024 | **1128 KB** | Huérfana **sin documentar** |

### 2.5 Externas

Las **teselas de OpenStreetMap** del mapa de cobertura: 39 peticiones de 256×256
a `tile.openstreetmap.org`, sin pasar por el optimizador —no pueden, son de otro
dominio— y con `alt` vacío, que es lo correcto para una tesela de mapa. Su
licencia (ODbL) **exige atribución visible**, ya presente en el mapa.

---

## 3. Procedencia — sólo lo que se puede demostrar

No se ha inventado ninguna licencia. Esto es lo que dicen los metadatos, la
extensión de los ficheros originales y la historia del repositorio.

### A. Propiedad u origen conocido

| Recurso | Evidencia |
|---|---|
| `zulia/santa-cruz-de-mara.jpg` | **EXIF del original: `samsung / Galaxy A35 5G`, 21/06/2025 09:01:02.** Es una foto tomada con un teléfono, no descargada |
| `zonas/santa-cruz-de-mara.webp` | Misma escena y mismo encuadre que la anterior: deriva de esa toma |
| `app/*.webp` | Capturas de la propia aplicación de +58Express |
| `brand/logo-lockup.png`, `logo-moto.png`, `moto.webp` | Material de marca del proyecto; `moto.webp` entró como «la moto real de +58Express» |
| `photo/campaign-hero.jpg` | Documentada en `public-website-premium.md` §10 como foto de campaña del cliente |
| `brand/og.jpg`, iconos | Compuestos a partir de la marca propia |

### B. Licencia documentada

| Recurso | Licencia |
|---|---|
| Teselas de OpenStreetMap | **ODbL**, con atribución obligatoria y ya presente |

### C. Procedencia desconocida

| Recurso | Por qué |
|---|---|
| `zulia/el-mojan.jpg` y `zonas/el-mojan.webp` | **Sin EXIF.** El original se llama `plaza el mojan.jfif`, y `.jfif` es la extensión que asigna Windows al **guardar una imagen desde el navegador**. Es indicio, no prueba |
| `zulia/maracaibo.jpg` y `zonas/maracaibo.webp` | **Sin EXIF**, 1080×795 y 108 KB: medidas y peso típicos de una imagen servida por una web, no de una cámara |

> Ningún metadato contiene autor ni aviso de copyright. Que no lo tengan **no
> significa que sean libres**: significa que no se puede saber, y por eso van en C.

### Un recurso que no es de procedencia sino de uso

`badge-apple.png` y `badge-google.png` son las insignias oficiales de las tiendas.
El fichero es legítimo; **lo que tiene condiciones es su uso**. Apple y Google
publican guías de marca para sus insignias, y la de Apple se concede para
aplicaciones que **están** en la App Store. Aquí se usan con el rótulo
«Próximamente», que es honesto, pero conviene revisar sus guías antes del
lanzamiento. No es un problema de licencia de foto: es de marca de terceros.

---

## 4. Optimización y tamaños de descarga

**Ninguna imagen se está descargando a un tamaño innecesariamente grande.**
Comprobado sirviendo cada una desde producción:

- Todas las de `public/` pasan por `next/image` y se entregan en WebP al ancho
  que toca: las capturas de la app bajan de 941 px a 384; el logotipo, de 2019 a
  256; las miniaturas de zona, a 64.
- Los pesos de origen son razonables salvo `logo-moto.png` (1,1 MB), que **no
  llega al navegador** porque no la usa nadie. Es peso de repositorio, no de
  carga.
- Lo único sin optimizar son las teselas de OSM, y no puede ser de otro modo.

El único desajuste real es el inverso: `zulia/el-mojan.jpg` se pide a 640 px y el
optimizador sólo puede devolver 335, porque el original no da más.

---

## 5. Tabla resumen

| IMAGEN | CALIDAD | PROCEDENCIA | RIESGO | ACCIÓN RECOMENDADA |
|---|---|---|---|---|
| `zulia/el-mojan.jpg` | **Insuficiente** (335×597 para 285 px) | **C** | Medio | **Sustituir por `zonas/el-mojan.webp`** (720×960), que ya está en el repositorio |
| `zonas/el-mojan.webp` | Suficiente | **C** | Medio | Confirmar origen antes del lanzamiento |
| `zulia/maracaibo.jpg` | Suficiente | **C** | Medio | Confirmar origen; si no se puede, sustituir por foto propia |
| `zonas/maracaibo.webp` | Suficiente | **C** | Medio | Igual que la anterior |
| `zulia/santa-cruz-de-mara.jpg` | Buena | **A** (EXIF de cámara) | Ninguno | Ninguna |
| `zonas/santa-cruz-de-mara.webp` | Buena | **A** | Ninguno | Ninguna |
| `app/*.webp` (4) | Buena | **A** | Ninguno | Ninguna |
| `brand/logo-lockup.png` | Buena | **A** | Ninguno | Ninguna |
| `brand/moto.webp` | Buena | **A** | Ninguno | Ninguna |
| `brand/og.jpg` + iconos | Buena | **A** | Ninguno | Ninguna |
| `brand/badge-apple.png` · `badge-google.png` | Buena | **A** (insignia oficial) | **Uso de marca ajena** | Revisar las guías de Apple y Google antes del lanzamiento |
| `photo/campaign-hero.jpg` | Buena | **A** | Ninguno | Ninguna. Huérfana a propósito |
| `brand/logo-moto.png` | — | **A** | Ninguno | **Retirar o documentar**: 1,1 MB sin usar ni explicar |
| Teselas de OpenStreetMap | — | **B** (ODbL) | Ninguno | Ninguna. La atribución ya está |

---

## 6. Lo que yo haría, por orden

1. **Cambiar la fuente de El Moján en `/nosotros`** por la de 720×960 que ya
   existe. Es el único defecto de calidad visible y se arregla sin pedir nada a
   nadie.
2. **Confirmar de dónde salieron las fotos de El Moján y Maracaibo.** Si se
   descargaron de una búsqueda, conviene sustituirlas por fotos propias: en un
   sitio comercial de una empresa identificada con RIF y domicilio, una
   reclamación por una foto es barata de evitar y cara de atender.
3. **Revisar las guías de las insignias de tienda** antes de publicar la app.
4. **Decidir qué pasa con `logo-moto.png`**: 1,1 MB que nadie usa ni explica.
