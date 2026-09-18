# Plan: sustituir el basemap de CARTO en la aplicación

**Estado:** plan, sin ejecutar. **No se ha modificado ni un archivo de `src/`.**
**Rama desde la que se documenta:** `feat/public-marketing-site`
**Fecha:** 12 de septiembre de 2026

---

## 1. El fallo

CARTO dejó de servir sus basemaps sin clave. La petición **no falla**: devuelve
**HTTP 200** con una tesela gris de 1.970 bytes estampada en diagonal con

> **API KEY REQUIRED** · carto.com/basemaps/apikey

Eso es lo que hace el fallo difícil de notar desde el código: no hay error 4xx,
no hay excepción, no hay nada en consola. Leaflet coloca las teselas como si todo
fuera bien y el usuario ve un mapa gris con una marca de agua repetida.

Comprobación hecha hoy:

```
curl -A "Mozilla/5.0" https://a.basemaps.cartocdn.com/dark_all/12/1180/1830.png
→ http 200 · 1970 bytes · image/png      (la tesela con la marca de agua)

curl -A "Mozilla/5.0 …Chrome…" https://tile.openstreetmap.org/12/1180/1830.png
→ http 200 · 6987 bytes · image/png      (una tesela real)
```

---

## 2. Dónde está, exactamente

Cuatro archivos de código fuente, **cinco líneas**:

| Archivo | Línea | Qué contiene | ¿Se usa? |
|---|---|---|---|
| `src/components/mapComponent.js` | 83 | tema oscuro: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` | **Sí** — el mapa del pasajero y del conductor |
| `src/components/mapComponent.js` | 84 | tema claro: `.../rastertiles/voyager/{z}/{x}/{y}{r}.png` | **Sí** — mismo mapa en modo día |
| `src/pages/admin/fleetMap.js` | 59 | `dark_all` | **Sí** — mapa de flota del panel |
| `src/pages/admin/adminApp.js` | 50 | `dark_all` | **Sí** — mapa del panel de operaciones |
| `src/utils/constants.js` | 5 | `export const MAP_TILE_URL = '…dark_all…'` | **No.** Está exportada y **ningún archivo la importa** |
| `src/utils/constants.js` | 6 | `MAP_TILE_ATTRIBUTION = '… &copy; CARTO'` | **No.** Igual: exportada y sin un solo importador |

> **Cuidado con esto:** `MAP_TILE_URL` en `constants.js` es la constante que
> parece el sitio del arreglo, pero es **código muerto**. Cambiar solo esa línea
> no arregla absolutamente nada: los cuatro mapas vivos llevan la URL escrita a
> mano en su propio archivo. Hay que tocar las cuatro, o —mejor— hacer que los
> cuatro lean de la constante.

`dist/assets/index-fGMgGlc-.js` también la contiene, pero es un artefacto de
compilación: se regenera con `npm run build`, no se edita.

---

## 3. Reemplazo recomendado

**OpenStreetMap estándar, sin clave**, con el aspecto oscuro conseguido por
filtro CSS — es exactamente lo que se hizo en la web pública, ya en producción y
verificado:

```js
// URL (una sola, para los dos temas)
'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

// atribución obligatoria
'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
```

```css
/* el tema oscuro deja de venir del proveedor y se aplica sobre la tesela */
.mapa-oscuro { filter: grayscale(1) invert(1) brightness(0.86) contrast(1.12); }
```

En Leaflet, el filtro se aplica pasando `className: 'mapa-oscuro'` al
`L.tileLayer(...)`. El tema claro no lleva clase: la tesela va tal cual.

Detalles que cambian respecto a CARTO:

- **Quitar `subdomains: 'abcd'`.** `tile.openstreetmap.org` no usa subdominios;
  dejar `{s}` en la plantilla produce peticiones a hosts inexistentes.
- **Quitar `{r}`** (el sufijo `@2x`): OSM estándar no sirve teselas retina.
- **`maxZoom: 19`** — OSM llega a 19, no a 20.
- La atribución de OpenStreetMap es **obligatoria** por licencia (ODbL) y debe
  quedar visible. La de CARTO sobra cuando ya no se usa CARTO.
- **`adminApp.js:49` crea el mapa con `attributionControl: false`**, así que hoy
  ese mapa no atribuye a nadie. Con teselas de OSM eso deja de ser un descuido y
  pasa a incumplir la licencia: hay que activarlo, aunque sea en pequeño.
- **`fleetMap.js:59` usa `{s}` sin declarar `subdomains`**: funciona con CARTO
  porque Leaflet supone `'abc'` por defecto. Con OSM hay que quitar el `{s}` de
  la plantilla, no solo la opción.

### Alternativas, por si se prefiere pagar

| Opción | Clave | Coste | Nota |
|---|---|---|---|
| **OSM estándar + filtro CSS** | **No** | **0** | Lo recomendado. Ya probado en producción en la web |
| CARTO con clave | Sí | Plan gratuito con límite | Recupera el estilo oscuro original sin filtro |
| MapTiler / Stadia / Thunderforest | Sí | Gratis con límite | Estilos oscuros propios, mejor tipografía de mapa |
| Teselas propias | No | Servidor | Solo tiene sentido con mucho volumen |

> **Política de uso de OSM:** la teselería estándar es para proyectos de volumen
> moderado, exige atribución visible y un `User-Agent`/`Referer` identificable.
> Si la app crece, el paso natural es MapTiler o CARTO con clave — pero eso es
> una decisión de escala, no una urgencia de hoy.

---

## 4. Impacto

**Qué se arregla:** los cuatro mapas de la aplicación vuelven a mostrar el mapa.
Hoy, cualquiera que abra la app o el panel ve un lienzo gris con «API KEY
REQUIRED» cruzándolo: afecta al mapa del pasajero, al del conductor, al de flota
y al del panel de operaciones.

**Qué NO cambia:** coordenadas, marcadores, rutas, lógica de seguimiento, iconos
de vehículo, el centro por defecto ni el zoom. Solo cambia de dónde vienen las
imágenes de fondo.

**Riesgo:** bajo. Es una sustitución de URL más una regla CSS. Lo único que hay
que mirar con calma es que el filtro no apague de más los marcadores: en la web
el filtro se aplica **solo a la capa de teselas** (por `className`), de modo que
el amarillo de los pines queda fuera y sigue siendo el único color de la escena.

**¿Hace falta clave?** **No.** Ni para OSM ni para el filtro CSS. La corrección
no añade ninguna credencial nueva, ni variable de entorno, ni servicio externo.

---

## 5. Cómo ejecutarlo (rama aparte)

1. `git switch -c fix/basemap-sin-clave` desde `master`.
2. Dar a `MAP_TILE_URL` en `src/utils/constants.js` su valor nuevo y añadir la
   constante del tema claro y la clase del filtro.
3. Hacer que los cuatro mapas **importen** esa constante en vez de repetir la URL
   — así el próximo cambio de proveedor es una línea, no cinco.
4. Añadir la regla `.mapa-oscuro` a la hoja de estilos de la app.
5. Revisar la atribución: fuera CARTO, dentro OpenStreetMap, visible.
6. Verificar **con el mapa delante**, no leyendo el código: que cargan teselas
   reales (peso > 4 KB, no 1.970 bytes), que no hay marca de agua, y que los
   marcadores conservan su color en los dos temas.
7. Comprobar los cuatro mapas: pasajero, conductor, flota y operaciones.

Trabajo estimado: una sesión corta. El grueso es la verificación visual, no el
cambio.
