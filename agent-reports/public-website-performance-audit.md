# Auditoría de rendimiento y Core Web Vitals — mas58express.com

**14 de septiembre de 2026.** Producción, despliegue `plus58express-1nrka1fsa`.

Este documento tiene dos partes:

1. **[Ronda de corrección](#ronda-de-corrección--14-de-septiembre)** — lo que se
   arregló después de la auditoría, con el veredicto de cada punto. **Empieza por
   aquí.**
2. **[La auditoría original](#a-métricas-actuales)** — sólo medición, sin tocar
   una línea. Se conserva íntegra, con notas de corrección donde la auditoría se
   equivocó.

---

# Ronda de corrección — 14 de septiembre

Encargo: arreglar **únicamente** lo que la auditoría demostró, sin optimización
general, sin tocar diseño aprobado, ni legal, ni formularios públicos.

## Los tres veredictos

| | Veredicto |
|---|---|
| **CLS de `/nosotros`** | **FIXED** — en producción, score de 93 a **100** y CLS de **0,172 a 0,000**. Desplazamiento vertical 0,0000 en 440 cargas frías, local y en producción. Y no era sólo `/nosotros`: eran siete rutas |
| **Turnstile muerto en el paquete** | **REMOVED** — verificado en producción: 0 de 13 scripts iniciales lo contienen, en las cinco rutas comprobadas |
| **Causa del LCP móvil de la portada** | **Demostrada — y no era lo que la auditoría sospechaba.** El «LCP de 3,28 s» era un artefacto del modelo de Lighthouse. Medido con estrangulamiento real, FCP y LCP son el mismo instante. Lo que retrasa ese instante es **Layout y recálculo de estilo (332 ms), no JavaScript (7 ms)**. No se tocó nada |

Y una cosa que empeora, declarada: **el TBT móvil sube de 4 a 6 ms** con la CPU
estrangulada ×4 —del orden de 1 ms en un teléfono real— por resolver cuatro
`local()` más. Está medido y aislado más abajo.

Nada se optimizó por sospecha. Nada de GSAP, Lenis, ScrollTrigger, los teléfonos
3D ni el scrollytelling se tocó.

---

## 1 · El CLS de `/nosotros` — FIXED

### Reproducirlo primero

En localhost el `.woff2` llega en 2 ms y la carrera no se da casi nunca: medir
ahí daría CLS 0 y no significaría nada. El arnés retrasa **la tipografía a
propósito 400 ms**, que es lo que le pasa a quien entra con 4G y caché vacía. Con
eso el defecto salió **12 veces de 12**:

| Ancho | CLS máx | Cargas con desplazamiento |
|---|---|---|
| 1024 px | **0,2029** | 3/3 |
| 1280 px | 0,0327 | 3/3 |
| 1440 px | 0,0291 | 3/3 |
| 1920 px | 0,0218 | 3/3 |

Siempre el mismo nodo, siempre el mismo salto: `SECTION` de `y:501` a `y:422`.
**79 px hacia arriba**, el alto exacto de una línea del titular.

### El defecto no era de `/nosotros`

Al medir los 1224 titulares del sitio (11 rutas × 8 anchos), **96 cambiaban de
número de líneas** entre la fuente real y la reserva. Y midiendo el CLS de todas
las rutas, **7 de 11 desplazaban verticalmente** en los cuatro anchos de
escritorio:

| Ruta | 1024 | 1280 | 1440 | 1920 |
|---|---|---|---|---|
| `/aliados` | **0,0497** | 0,0327 | 0,0291 | 0,0250 |
| `/nosotros` | 0,0379 | 0,0327 | 0,0291 | 0,0250 |
| `/ayuda` | 0,0379 | 0,0327 | 0,0291 | 0,0250 |
| `/servicios` | 0,0354 | 0,0305 | 0,0271 | 0,0238 |
| `/seguridad` | 0,0354 | 0,0305 | 0,0271 | 0,0238 |
| `/contacto` | 0,0354 | 0,0305 | 0,0271 | 0,0238 |
| `/privacidad` | 0,0354 | 0,0305 | 0,0271 | 0,0238 |

`/nosotros` no era la peor: **`/aliados` lo era**. La auditoría sólo la vio a ella
porque fue la única página donde la carrera se dio durante la medición.

### La causa — y aquí me equivoqué al explicarla la primera vez

> **Corrección.** Mi primera redacción decía que `size-adjust: 88.59%` «iguala
> la altura de la x y no hace nada por el ancho de avance». **Es falso, y al
> revés.** Lo encontró la verificación adversaria leyendo el código de Next, y
> lo confirmé midiéndolo.

`size-adjust` es **exactamente** un cociente de anchos de avance. `next/font` lo
calcula así —se puede leer en
`node_modules/next/dist/compiled/@next/font/dist/local/get-fallback-metrics-from-font-file.js`:

```
size-adjust = ancho medio de la fuente ÷ ancho medio de Arial
```

El problema está en la cadena sobre la que saca esa media:

```
'aaabcdeeeefghiijklmnnoopqrrssttuvwxyz      '
```

**Minúsculas.** Y `.display` lleva `text-transform: uppercase`.

En caja baja la corrección es casi perfecta: la reserva quedaba a un **0,3 %** de
Big Shoulders. En caja alta —lo único que este sitio pinta en titulares— Big
Shoulders es mucho más estrecha respecto a Arial, y ese mismo 88,59 % se queda a
un **27,8 % de más**. La reserva estaba bien calculada **para un texto que esta
web no escribe nunca**.

### La elección de la reserva, medida como el sitio pinta

> **Segunda corrección.** Mi primera tabla medía con `canvas`, en minúsculas,
> con Arial **Bold** y sin aplicar el `size-adjust`. Describía otra cosa. Esta
> mide en mayúsculas, con el `letter-spacing: -0.018em` real y con el
> `size-adjust` aplicado de verdad, sobre los 72 titulares del sitio:

| Familia | `size-adjust` | Mediana vs Big Shoulders | Dentro del ±2 % | Dónde está de serie |
|---|---|---|---|---|
| **Impact** | **94 %** | **0,997** | 41/72 | Windows, macOS, iOS |
| **Roboto Condensed** | **85 %** | **0,997** | 52/72 | Android |
| **Roboto** | **75 %** | **1,000** | 55/72 | Android, ChromeOS |
| **Arial** | **70 %** | **1,001** | 44/72 | el resto |
| Arial | 88,59 % | **1,278** | **0/72** | ← la que había |

Por eso la reserva no es una cara con varias familias dentro, sino **cuatro caras
en cascada, cada una con su valor**. Meter Roboto Condensed en la cara de Impact
al 94 % —que es lo que hice al principio— la habría dejado pintando un 10 % de
más en Android.

Y el barrido de `size-adjust` sobre los 1224 titulares reales, contando cuántos
cambian de número de líneas:

```
  ACTUAL: Arial   88,59%    96 fallos
  Arial            80,2%    74
  Arial Narrow     80,2%   165        ← ver abajo: no mide lo que parece
  Impact            100%    22
  Impact             96%    14
  Impact             95%     9
  Impact             94%     8        ← elegido
  Impact             92%    11
  Impact             90%    12
```

**De 96 a 8.** Y de los 8 que quedan, 7 son el mismo `<h2>` de la portada
(«TODO EN UNA SOLA APP»), que en la carga inicial está muy por debajo de la
ventana y por tanto no cuenta para el CLS.

> **Tercera corrección — Arial Narrow.** Los 165 fallos no son «Arial Narrow
> rindiendo mal»: es que **no está instalada**. No hay `ARIALN.TTF` en
> `C:\Windows\Fonts` ni entrada en el registro; viene con Office, no con Windows.
> Una `@font-face` cuyo único `local()` no existe **no casa en absoluto**, así
> que el titular se quedaba sin reserva y sin ajustes. La conclusión práctica
> —no usarla— se mantiene; el motivo que di era otro.

### Un detalle que no se podía copiar

Las métricas verticales que emitía `next/font` —`ascent-override: 111.25%`,
`descent-override: 24.21%`— **están calibradas para multiplicarse por su propio
`size-adjust`**: el navegador aplica `size-adjust` también a ellas. Copiarlas tal
cual con otro `size-adjust` dejaba la caja del titular 6 px más alta y 3 px más
arriba que con la fuente real. Recalculadas:

```
suma efectiva de Big Shoulders = (111,25 + 24,21) × 0,8859 = 120,00 %
para size-adjust 94 %  →  ascent 104,85 %   descent 22,82 %
```

Comprobado en el navegador: con esos valores la caja del titular queda en
`y=176 h=99`, **exactamente donde la deja la fuente real**.

### El resultado

220 cargas frías —11 rutas × 5 vistas × 4 vueltas, con la fuente retrasada
400 ms:

| | Antes | Después |
|---|---|---|
| **CLS vertical máximo** | 0,0497 | **0,0000** |
| Rutas que desplazan verticalmente | **7 de 11** | **0 de 11** |
| CLS máximo global | 0,0497 | **0,0005** *(sólo reflujo horizontal)* |
| Cargas con desbordamiento | 0 | **0** |
| Móvil 390 px | 0,0000 | **0,0000** |

Criterio de aceptación del encargo —10 cargas frías de `/nosotros` en escritorio:

```
  1024 px   CLS máx 0,0000   vertical 0,0000
  1280 px   CLS máx 0,0069   vertical 0,0000
  1440 px   CLS máx 0,0000   vertical 0,0000
  1920 px   CLS máx 0,0031   vertical 0,0000
```

### Lo que queda, y por qué no lo he tocado

El residuo —como mucho 0,0069 en 2 de 40 cargas— **no tiene componente
vertical**: nada se mueve hacia arriba ni hacia abajo. Es el texto corrido
reflujando en horizontal cuando entra Outfit, porque
`.prose-measure { max-width: 68ch }` resuelve la unidad `ch` contra la tipografía
en uso y la caja cambia de ancho al intercambiarla. Está **probado**: fijando ese
ancho en píxeles, el CLS de `/nosotros` caía de 0,0207 a **0,0007** ya antes de
afinar las reservas.

No lo he cambiado. Es texto corrido, no el titular; afecta a las once páginas
—`/privacidad` y `/terminos` incluidas— y el encargo decía explícitamente no
tocar el diseño aprobado. Queda como decisión suya, con la medición hecha.

### Lo que no he podido verificar

Las reservas 2 y 3 —Roboto Condensed y Roboto, las de Android— **no están
instaladas en esta máquina**, así que su `size-adjust` está calibrado midiendo
**el fichero de la fuente** (el mismo diseño que reparte Android), pero no he
podido comprobar de extremo a extremo que `local("Roboto Condensed")` resuelva en
un Android real. Si no resolviera, esa cascada cae a la reserva 3 y luego a la 4,
que están calibradas igual de bien. En el peor caso Android queda como estaba,
nunca peor.

### Lo que NO se usó, y por qué

- **`font-display: optional`** — lo descartó el encargo, y con razón: se perdería
  la tipografía de marca en las primeras visitas lentas.
- **`min-height` en el titular** — no habría servido. El problema es que la
  reserva ocupa **dos** líneas; reservar el alto de una no impide que la caja
  crezca a dos.
- **`white-space: nowrap`** — habría desbordado en los anchos donde la reserva no
  cabe.
- **Arial Narrow** — era mi recomendación en la auditoría. La medición la
  desmintió: ver más abajo.

---

## 2 · Turnstile muerto — REMOVED

### Lo que de verdad pasaba

`WAITLIST_ENABLED` y `PARTNER_LEADS_ENABLED` están apagados, y las páginas ya
comprobaban el interruptor antes de pintar. Pero un `import` estático mete el
módulo en el grafo de cliente **aunque el componente no se renderice nunca**.

### Dos caminos que no funcionaron

| Intento | Resultado |
|---|---|
| `next/dynamic` desde la página | La documentación de Next lo desaconseja explícitamente: «cuando un componente de servidor importa de forma dinámica un componente de cliente, la división automática de código **no está soportada**». Medido: no dividía |
| `await import()` dentro del render del componente de servidor | Más limpio de leer, pero el empaquetador analiza el `import()` igualmente y el módulo seguía saliendo como `<script src>` |

Lo que sí funciona es el `import()` **dentro de un componente de cliente**, que es
lo que hace el fichero nuevo `components/forms/Diferidos.tsx`. Lo que se descarga
siempre es esa envoltura, que no llega a un kilobyte.

### Verificado en ejecución, no en el disco

Con ambos interruptores **apagados**:

```
  ✔ /            peticiones a Cloudflare: 0   scripts con Turnstile: 0/13   CSP abierta: no
  ✔ /aliados     peticiones a Cloudflare: 0   scripts con Turnstile: 0/13   CSP abierta: no
  ✔ /servicios   peticiones a Cloudflare: 0   scripts con Turnstile: 0/13   CSP abierta: no
  ✔ /contacto    peticiones a Cloudflare: 0   scripts con Turnstile: 0/13   CSP abierta: no
  ✔ /nosotros    peticiones a Cloudflare: 0   scripts con Turnstile: 0/13   CSP abierta: no
  ✔ POST /api/waitlist          → 404
  ✔ POST /api/leads/partners    → 404
```

> **Atribución honesta.** De esas cinco comprobaciones, sólo una es mérito de
> este cambio: **«scripts con Turnstile: 0»**. Las otras cuatro —cero peticiones
> a Cloudflare, CSP cerrada, y los dos 404— **ya eran ciertas antes**: el widget
> nunca llegaba a pintarse, la CSP ya se cerraba sola con los interruptores
> apagados y las rutas ya devolvían 404. Lo que se ha arreglado es que el código
> deje de **descargarse**; están ahí porque son la red de seguridad de que nada
> se rompió al moverlo, no porque las haya conseguido esta ronda.

Y con ambos **encendidos**, para descartar que se haya roto el futuro:

```
  ✔ <form> presente en el HTML del servidor (sin JS) en / y en /aliados
  ✔ el paquete del formulario SÍ se descarga ahora
  ✔ la CSP vuelve a permitir Cloudflare, frame-src incluido
  ✔ POST /api/waitlist → 400 (ya no 404)
  ✔ sin errores de consola
```

Que el `<form>` esté en el HTML del servidor demuestra que `next/dynamic` sigue
renderizando en servidor: encender el interruptor no exigirá tocar nada.

### Cuánto pesaba de verdad

> **Corrección a la auditoría.** Dije «31 KB de Turnstile muerto». Ese era el
> tamaño **del chunk**, y ese chunk también llevaba código vivo (el botón de
> WhatsApp, los botones). El peso muerto real, medido como diferencia de lo que
> cada página pide:

| Página | Antes | Después | Δ |
|---|---|---|---|
| `/` | 782 KB (223 KB br) | 772 KB (220 KB br) | **−10 KB** (−3 KB br) |
| `/aliados` | 741 KB (209 KB br) | 733 KB (206 KB br) | **−8 KB** (−3 KB br) |

El código de Turnstile y de los formularios sigue en el build, en dos chunks de
12,7 KB y 11,4 KB **que ningún HTML referencia**. Existen para cuando se
enciendan los interruptores; hasta entonces nadie los pide.

---

## 3 · El LCP móvil de la portada — causa demostrada

El encargo pedía perfilar, no optimizar. Lo que salió del perfil obliga a
**corregir la auditoría**.

### El hueco entre FCP y LCP no existe

La auditoría midió con Lighthouse en su modo por defecto,
`throttling-method=simulate` — el modelo **Lantern**, que no observa las métricas:
las **predice** a partir de una traza poco estrangulada. Misma URL de producción,
mismo día, cambiando sólo el método:

| Método | FCP | LCP | Hueco |
|---|---|---|---|
| `simulate` (el de la auditoría) | 1,0 s | 2,3 s | 1,3 s |
| `simulate` (otra vuelta) | 1,03 s | **3,28 s** | 2,25 s |
| **`devtools` (estrangulamiento real aplicado)** | **2,6 s** | **2,6 s** | **0** |

Con el navegador estrangulado de verdad, **FCP y LCP son el mismo instante**. El
párrafo del hero se pinta en la primera pintura con contenido. No hay nada que
investigar entre los dos: **el hueco era del modelo**.

Medido también en local con 4G lento y CPU ×4: una única candidatura a LCP,
el mismo párrafo, a 1104 ms — el mismo milisegundo que el FCP.

### Qué ocupa el hilo *antes* de esa pintura

De la traza de DevTools de la portada móvil (390×844, 4G lento, CPU ×4), en los
1104 ms previos al primer pintado:

| | ms | % |
|---|---|---|
| **Layout** | **224** | **48 %** |
| **Recálculo de estilo** (`UpdateLayoutTree`) | **108** | **23 %** |
| Gestión de tareas | 36 | 8 % |
| Analizar HTML | 20 | 4 % |
| **JavaScript** (`FunctionCall`) | **7** | **1 %** |
| resto | 69 | 15 % |
| | **464 ms de hilo ocupado** | |

La tarea larga de **279 ms** que arranca a los 720 ms —la única relevante antes
del pintado— se descompone así:

```
  170 ms  Layout            (603 objetos, todos sucios: es el primer layout)
  103 ms  UpdateLayoutTree  (682 elementos)
    5 ms  FunctionCall      ← todo el JavaScript
```

Hay un **segundo layout** a los 1016 ms que rehace 593 de los 603 objetos (54 ms):
es la tipografía llegando y invalidando el árbol.

### Por qué la portada y no las demás

| Página | Elementos | Profundidad | Alto | FCP |
|---|---|---|---|---|
| **`/`** | **580** | 14 | **13 141 px** | **1104 ms** |
| `/servicios` | 237 | 10 | 3 708 px | 924 ms |
| `/nosotros` | 226 | 10 | 4 594 px | — |
| `/conductores` | 226 | 10 | 3 738 px | — |

La portada tiene **2,4 veces más elementos** y es **3,5 veces más alta** que
cualquier otra. Su primer layout cuesta 180 ms más, y eso es exactamente la
diferencia de FCP. No es un problema de scripts: es una página grande.

### Corrección: mi sospecha era falsa

> La auditoría decía: *«Sospechas razonables, por orden: la inicialización de
> GSAP y ScrollTrigger del scrollytelling, y la hidratación de los teléfonos
> 3D»*. **Medido, es falso.**

| Paquete | Qué es | Coste | Cuándo |
|---|---|---|---|
| `3wbl29dm6egzg.js` | **GSAP + Lenis** | **13 ms** | **después** del FCP |
| `2qyr2zzqw7k6q.js` | React + App Router (hidratación) | 238 ms | **después** del FCP |

Ni GSAP, ni Lenis, ni ScrollTrigger, ni la hidratación, ni los teléfonos 3D
retrasan el primer pintado. Todos corren después. **No se ha tocado ninguno, y la
medición dice que no hay motivo para tocarlos.**

### Qué se podría hacer, si algún día se quiere

Nada de esto se ha hecho: hace falta autorización y toca el diseño.

1. **Reducir el árbol de la portada.** 580 elementos y 13 141 px. El coste es
   lineal con el número de objetos de layout; es la única palanca real.
2. **`content-visibility: auto`** en las secciones de debajo de la ventana. Le
   ahorraría al primer layout los objetos que nadie va a ver todavía. Es una
   línea de CSS, pero cambia cómo se calculan alturas y puede afectar al
   scrollytelling, así que exige medirlo con cuidado.
3. **Nada más.** El JavaScript ya no es el problema: 7 ms antes del pintado.

---

## Verificación adversaria de este informe

Antes de desplegar sometí mis propias conclusiones a un panel que sólo tenía un
encargo: **refutarlas**. Trece afirmaciones × tres lentes independientes (los
números, el método de medición, los hechos externos). Mereció la pena:

| Afirmación | Veredicto |
|---|---|
| El CLS lo causaba el ancho, no la altura | **refutada 3/3** — la conclusión aguanta, mi explicación del mecanismo estaba **invertida**. Corregida arriba, y corregida en el código |
| Impact y Roboto Condensed al 94 % | **refutada 3/3** — Impact al 94 % es correcto; **Roboto Condensed necesita 85 %**. Lo medí de nuevo y **cambié el código**: cuatro caras en vez de dos |
| Arial Narrow era mala recomendación | **refutada 3/3** — la conclusión vale, el motivo era otro: no está instalada |
| El defecto afectaba a 7 de 11 rutas | **refutada 2/3** — y **me quedaba corto**: los cambios de línea tocan las once; siete dan CLS medible en escritorio |
| `size-adjust` escala las métricas verticales | **sostenida 3/3** — y además lo manda la especificación, no es sólo cosa de Chromium |
| `next/dynamic` no divide desde un componente de servidor | **sostenida 3/3** — la cita es literal y de la versión instalada |
| Turnstile ya no viaja | **refutada 2/3** — el núcleo aguanta, pero tres de las cuatro pruebas ya eran ciertas antes. Corregido arriba |
| El residuo es «ajeno al titular» | **refutada** — en aquella versión el titular sí entraba en el evento. Con las reservas afinadas ya no, y la redacción está corregida |

**Lo que no se verificó, y hay que decirlo:** 21 de los 43 agentes se quedaron
sin ejecutar al agotarse el límite de la sesión. Se quedaron sin revisar las
afirmaciones sobre el perfil de la portada (el artefacto de Lighthouse, el reparto
de Layout contra JavaScript, el tamaño del árbol) y los cuatro análisis de riesgo
—compatibilidad de navegadores, regresiones del diferido, accesibilidad, y qué se
dejó de mirar—. Esas conclusiones se apoyan sólo en mis propias mediciones.

---

## QA de la ronda

| Comprobación | Resultado |
|---|---|
| TypeScript | ✔ sin errores |
| `next build` | ✔ compila |
| Playwright | ✔ **185 pasadas**, 3 omitidas, **0 fallidas** *(recuento comprobado con `grep`, no leyendo el final de la salida)* |
| axe WCAG 2.1 AA | ✔ 10 rutas × móvil y escritorio, sin violaciones |
| Desbordamiento horizontal | ✔ 0 en 220 cargas × 5 vistas |
| Interruptores encendidos | ✔ formularios, paquete y CSP correctos |

Lighthouse local, estrangulamiento real, media de 3 vueltas:

| | | Antes | Después | |
|---|---|---|---|---|
| `/` móvil | score | 96 | 96 | = |
| | LCP | 2046 ms | **2021 ms** | ✔ |
| | **TBT** | **134 ms** | **150 ms** | **✘ sube** |
| | peso | 556 KB | **544 KB** | ✔ |
| | JS | 238,0 KB | **226,3 KB** | ✔ |
| `/` escritorio | score | 100 | 100 | = |
| | LCP | 324 ms | **311 ms** | ✔ |
| | peso | 583 KB | **563 KB** | ✔ |
| | JS | 251,0 KB | **229,8 KB** | ✔ |
| `/nosotros` escritorio | score | 100 | 100 | = |
| | LCP | 102 ms | **94 ms** | ✔ |
| | peso | 666 KB | **645 KB** | ✔ |
| `/nosotros` móvil | score | 98 | 98 | = |
| | **TBT** | **87 ms** | **97 ms** | **✘ sube** |
| | peso | 686 KB | **674 KB** | ✔ |

### El TBT sube, y no es ruido

`/nosotros` móvil: antes 86 / 88 / 87, después 93 / 96 / 103. No se solapan. Lo
perseguí en vez de darlo por variación, porque `/nosotros` **no cambió ni un byte
de JavaScript** (9 scripts y 727 KB antes y después), así que la causa tenía que
estar en la hoja de estilos.

Aislado con cinco cargas de cada variante, CPU ×4:

| | `/nosotros` | `/` |
|---|---|---|
| Como queda, 4 caras en la cascada | 103 ms | 137 ms |
| Sólo la primera cara | 99 ms | 132 ms |
| Sin ninguna reserva propia | 97 ms | 133 ms |

**Las cuatro caras de reserva cuestan de 4 a 6 ms de tiempo bloqueante** con la
CPU estrangulada a un cuarto — del orden de **1 ms en un teléfono real**. El
resto de la diferencia que ve Lighthouse es variación entre compilaciones.

Lo dejo así a propósito. Seis milisegundos sobre un umbral de 200 ms, a cambio de
que los titulares no salten en Android, que es la mayor parte del público. Pero
el número está aquí y es real: **esta ronda no mejoró el TBT, lo empeoró un
poco.**

### Y una advertencia sobre el propio laboratorio

**Lighthouse en local no reproduce el defecto de CLS** —da 0,0000 antes y
después— porque ahí la tipografía llega antes del pintado. El defecto sólo se ve
con el arnés que lo fuerza, o en producción con una conexión real. Por eso la
auditoría lo vio en producción y el laboratorio local no lo veía.

---

## Verificación en producción

Desplegado como `plus58express-rb8kfbha0`. Medido contra `mas58express.com` con
la red real, no en el laboratorio.

### `/nosotros` en escritorio — la página del encargo

| | Score | CLS |
|---|---|---|
| **Antes** (la auditoría, hoy mismo) | 93 / 100 / 93 / 100 | **0,172 / 0,000 / 0,167 / 0,000** |
| **Después** | **100 / 100 / 100 / 100** | **0,000 / 0,000 / 0,000 / 0,006** |

Los siete puntos que costaba el salto han vuelto, y el CLS ya no aparece en
ninguna de las cuatro vueltas. El peso baja de 654 a **633 KB**.

### `/aliados` en escritorio — la que de verdad era la peor

`100 / 100 / 100`, CLS `0,000` en las tres vueltas.

### La portada en móvil — sin tocar, y se nota

| | Score | LCP | TBT | Peso |
|---|---|---|---|---|
| Antes | 92 | 3,28 s | 55 ms | 547 KB |
| Después | 92 / 97 / 93 | 3,2 / 2,6 / 3,2 s | 90 / 20 / 40 ms | **535 KB** |

Doce kilobytes menos y nada más: es exactamente lo esperado, porque **no se tocó
nada de la portada**. La dispersión entre vueltas —92 a 97 de score, 20 a 90 ms
de TBT— es la del modo `simulate`, y es justo la razón por la que un solo informe
de Lighthouse no debe leerse como un hecho.

### CLS en producción, 40 cargas frías con la fuente retrasada

```
  1024 px   CLS máx 0,0219   vertical 0,0000
  1280 px   CLS máx 0,0152   vertical 0,0000
  1440 px   CLS máx 0,0120   vertical 0,0000
  1920 px   CLS máx 0,0068   vertical 0,0000
```

Más alto que en local —la red real reparte peor los tiempos— pero **ni un solo
píxel de movimiento vertical**: todos los nodos implicados conservan su `y`. Lo
que queda es el reflujo horizontal del texto corrido por el `68ch`, ya
documentado.

### Turnstile en producción

```
  ✔ /  /aliados  /servicios  /contacto  /nosotros
      peticiones a Cloudflare: 0   scripts con Turnstile: 0/13   CSP cerrada
  ✔ POST /api/waitlist → 404      ✔ POST /api/leads/partners → 404
```

---

## A. Métricas actuales

### Móvil (4G simulado, CPU ×4)

| Página | Score | FCP | **LCP** | TBT | CLS | Speed Index | TTFB | Peso |
|---|---|---|---|---|---|---|---|---|
| `/` | **92** | 1,03s | **3,28s** | 55ms | 0 | 2,03s | 100ms | 547 KB |
| `/pasajeros` | 96 | 1,29s | 2,63s | 23ms | 0 | 2,42s | 91ms | 347 KB |
| `/conductores` | 98 | 0,93s | 2,28s | 22ms | 0 | 1,95s | 104ms | 348 KB |
| `/nosotros` | 99 | 0,99s | 2,01s | 47ms | 0 | 1,97s | 93ms | 681 KB |
| `/seguridad` | 100 | 0,99s | 1,29s | 14ms | 0 | 1,50s | 92ms | 347 KB |
| `/aliados` | 100 | 0,95s | 1,25s | 22ms | 0 | 1,62s | 96ms | 340 KB |
| `/servicios` | 100 | 0,99s | 1,14s | 19ms | 0 | 1,46s | 88ms | 347 KB |
| `/contacto` | 99 | 1,02s | 2,00s | 40ms | 0 | 2,08s | 90ms | 349 KB |

### Escritorio

| Página | Score | FCP | LCP | TBT | **CLS** | Speed Index | Peso |
|---|---|---|---|---|---|---|---|
| `/nosotros` | **93** | 0,27s | 0,31s | 0 | **0,172** | 0,56s | 654 KB |
| `/` | 100 | 0,28s | 0,58s | 0 | 0 | 0,68s | 568 KB |
| `/contacto` | 100 | 0,29s | 0,50s | 0 | 0 | 0,79s | 392 KB |
| `/servicios` | 100 | 0,35s | 0,48s | 0 | 0 | 0,71s | 392 KB |
| `/seguridad` | 100 | 0,27s | 0,37s | 0 | 0 | 0,57s | 392 KB |
| `/aliados` | 100 | 0,27s | 0,31s | 0 | 0 | 0,53s | 392 KB |
| `/conductores` | 100 | 0,27s | 0,31s | 0 | 0 | 0,53s | 392 KB |
| `/pasajeros` | 100 | 0,27s | 0,31s | 0 | 0 | 0,53s | 391 KB |

**TTFB 82–104 ms** en todas. **TBT máximo 55 ms.** Ambas cifras son excelentes y
no dejan margen de mejora significativo.

### Qué elemento provoca el LCP

Medido con `PerformanceObserver` en navegador real:

| Página | Móvil | Escritorio |
|---|---|---|
| `/` | párrafo del hero, 800ms | **imagen `moto.webp`**, 412ms |
| `/servicios`, `/nosotros`, `/seguridad`, `/contacto` | párrafo de entradilla, ~190–200ms | H1 o párrafo, ~240ms |
| `/pasajeros`, `/conductores`, `/aliados` | **H1**, ~210–230ms | H1, ~240ms |

**En siete de las ocho páginas el LCP es texto**, no una imagen. Eso importa: no
hay imagen que precargar ni que optimizar para mejorar el LCP en esas rutas — ya
depende sólo de la fuente y del CSS, que están servidos desde el propio dominio y
precargados.

---

## B. Problemas reales encontrados

### B1 · CLS intermitente en `/nosotros` — el H1 se parte en dos líneas

El único problema de Core Web Vitals del sitio, y está **diagnosticado hasta la
causa raíz**.

> **CORREGIDO en parte — el diagnóstico era bueno, el alcance se quedó corto.**
> La causa raíz (ancho de avance de la reserva) era la correcta, pero el defecto
> no era de `/nosotros`: afectaba a **7 de las 11 rutas**, y la peor era
> `/aliados`. Ya está arreglado: ver la ronda de corrección.

Cuatro mediciones de `/nosotros` en escritorio:

| | CLS | LCP | Score |
|---|---|---|---|
| 1ª | **0,172** | 306ms | 93 |
| 2ª | 0,000 | 524ms | 100 |
| 3ª | **0,167** | 292ms | 93 |
| 4ª | 0,000 | 482ms | 100 |

**Dos de cada cuatro cargas.** No es ruido, y el patrón lo delata: el
desplazamiento aparece justo cuando la página pinta **rápido** (~300ms) y
desaparece cuando pinta más lento (~500ms). Es decir, algo llega *después* del
primer pintado.

Ese algo es la tipografía. Medido bloqueando los `.woff2`:

```
con la fuente real   h1 = 79 px  de alto   (una línea)
con el fallback Arial h1 = 158 px de alto   (dos líneas)
documento: 79 px más alto con el fallback
```

**«NACIMOS EN EL ZULIA» cabe en una línea en Big Shoulders y se parte en dos en
Arial.** Cuando la fuente real llega, el H1 colapsa de 158 a 79 px y todo lo que
hay debajo salta 79 px hacia arriba.

**Por qué ocurre pese a que el fallback está ajustado.** La hoja de estilos sí
genera un fallback con métricas corregidas —lo comprobé:

```css
@font-face{font-family:displayBrand Fallback;src:local(Arial);
  ascent-override:111.25%;descent-override:24.21%;size-adjust:88.59%}
```

Pero `size-adjust` corrige **el alto, no el ancho de avance de cada carácter**.
Big Shoulders es una condensada; Arial, aun reducida al 88,59 %, sigue siendo
mucho más ancha. El alto de línea coincide y el punto de corte de línea no.

### B2 · `/` en móvil: LCP 3,28 s

El peor número del sitio, y el único por encima del umbral de 2,5 s junto a
`/pasajeros` (2,63 s). En navegador sin estrangular, el LCP de la portada es un
párrafo a los 800 ms; bajo la simulación de 4G con CPU ×4 se va a 3,28 s.

La portada es también la más pesada después de `/nosotros` (547 KB) y la única
con animación de entrada compleja, teléfonos 3D y la moto.

### B3 · Código de Turnstile todavía en un chunk

**Sigue ocurriendo.** El chunk `3i8dy7jr0bw4b.js` —**31 KB transferidos**— contiene
la URL del cargador de Cloudflare, para un widget que nunca se pinta porque los
interruptores están apagados. Se descarga en la portada.

Es exactamente lo que reporté hace dos rondas y no se ha corregido, porque en
aquel momento decidimos que quedaba fuera del encargo.

> **CORREGIDO y ya arreglado.** Los 31 KB eran el tamaño **del chunk**, no del
> código muerto: ese chunk llevaba también código vivo. El peso muerto real,
> medido como diferencia, es de **10 KB en `/` y 8 KB en `/aliados`** (unos 3 KB
> comprimidos cada uno). Ya no viaja: ver la ronda de corrección.

### B4 · JavaScript que se descarga y no se ejecuta

Según Lighthouse, **62–65 KB comprimidos por página**:

| Chunk | Transferido | Sin usar |
|---|---|---|
| `3uiarbzyou91g.js` — **GSAP + Lenis** | 57 KB | 36 KB en páginas internas, 25 KB en la portada |
| `3bdm9_0y6znj8.js` | 71 KB | 26–28 KB |

> **Una corrección a mí mismo.** Mi primera medición con la API de cobertura dijo
> que **302 KB no se ejecutaban nunca** en las páginas internas. Antes de
> reportarlo lo comprobé funcionalmente: `lenis` está activo y hay 15–16 elementos
> con estilos aplicados por GSAP en `/contacto` y `/seguridad`. **GSAP y Lenis sí
> se ejecutan en todas las páginas.** La cifra buena es la de Lighthouse: ~62 KB,
> no 302. Estuve a punto de dar un titular falso.

### B5 · Peso de `/nosotros`

**681 KB en móvil**, casi el doble que las páginas de sólo texto (~347 KB). Lo
explica el tríptico: tres fotos servidas a 640×800 entre 74 y 102 KB cada una.
No perjudica sus métricas —score 99 en móvil— pero es el mayor consumo de datos
del sitio.

---

## C. Impacto estimado

| # | Problema | Impacto medido |
|---|---|---|
| B1 | CLS `/nosotros` | **0,17 en la mitad de las cargas**; por encima del umbral 0,1. Cuesta 7 puntos de score y, sobre todo, es visible: el texto salta bajo la vista de quien ya está leyendo |
| B2 | LCP `/` móvil | 3,28 s frente a un umbral de 2,5 s. Cuesta 8 puntos |
| B3 | Turnstile muerto | 31 KB descargados y parseados sin poder ejecutarse |
| B4 | JS sin usar | ~62 KB comprimidos. **TBT sigue siendo 14–55 ms**, así que no bloquea de forma apreciable |
| B5 | Peso `/nosotros` | ~330 KB extra frente a una página de texto. Sin efecto en las métricas |

---

## D. Prioridad

### P0 — nada

No hay ningún problema que justifique una intervención urgente. El sitio cumple
Core Web Vitals en quince de dieciséis mediciones.

### P1

1. **B1 · CLS de `/nosotros`.** Es el único Core Web Vital en rojo y se ve.
2. **B2 · LCP de `/` en móvil.** El único LCP claramente por encima del umbral.

### P2

3. **B3 · Turnstile muerto** — 31 KB, arreglo barato.
4. **B4 · JS sin usar** — 62 KB, arreglo caro y de beneficio dudoso.

### P3 — no tocar

5. **B5 · Peso de `/nosotros`** — es el precio de tres fotografías que el dueño
   pidió expresamente y que mejoran la página.

---

## E. Propuesta concreta

### P1-1 · El salto de `/nosotros` (tres caminos, de menos a más invasivo)

**a) Fallback condensado para la tipografía de titulares.** Declarar
`fallback: ["Arial Narrow", "Arial", "sans-serif"]` en la fuente de display.
Arial Narrow existe en Windows y macOS y **sí es condensada**, así que el punto de
corte de línea se parece mucho más. Una línea de `layout.tsx`. Riesgo: en Linux o
Android, donde Arial Narrow no existe, se cae en Arial y el problema vuelve.

> **CORREGIDO — esta recomendación era mala.** Arial Narrow **no estaba
> instalada** en el Windows donde lo probé: lo que parecía Arial Narrow era Arial
> sustituida por el sistema, así que la medida no habría hecho nada. Y donde sí
> se aplicó, empeoró la cuenta de titulares que cambian de líneas de 96 a **165**.
> La reserva que funciona es **Impact / Roboto Condensed al 94 %** — ver la ronda
> de corrección arriba.

**b) Reservar altura en los titulares.** Un `min-height` en el H1 equivalente a
una línea de su tamaño. No depende de qué fuente tenga el sistema. Riesgo: hay que
comprobar los ocho H1 en los seis anchos.

**c) `font-display: optional` para la de display.** Elimina el intercambio por
completo —o llega a tiempo, o se usa el fallback toda la visita— y con ello el
CLS. Riesgo real: en una conexión lenta, la primera visita vería los titulares en
Arial, y son la identidad de la marca.

> **Mi recomendación: (a) + (b).** El fallback condensado resuelve la mayoría de
> los casos y la altura reservada cubre el resto sin depender del sistema
> operativo. Ninguna de las dos toca el diseño aprobado ni las animaciones.

### P1-2 · El LCP de la portada en móvil

El LCP móvil de `/` es **un párrafo de texto**, no una imagen. Eso significa que
no se arregla con `priority` ni precargando nada: llega tarde porque el hilo
principal está ocupado.

**Propuesta: medir antes de tocar.** Un perfil de la portada en móvil
estrangulado para ver qué ocupa el hilo entre el FCP (1,03 s) y el LCP (3,28 s).
Sospechas razonables, por orden: la inicialización de GSAP y ScrollTrigger del
scrollytelling, y la hidratación de los teléfonos 3D. **No propongo cambios a
ciegas sobre la animación aprobada.**

> **CORREGIDO — la sospecha era falsa y el hueco no existía.** El perfil
> demostró dos cosas. Primera: ese hueco entre FCP y LCP es un artefacto del modo
> `simulate` de Lighthouse; con estrangulamiento real, **FCP y LCP son el mismo
> instante**. Segunda: lo que ocupa el hilo antes del pintado es **Layout (224 ms)
> y recálculo de estilo (108 ms)** — el JavaScript son **7 ms**. GSAP y Lenis
> cuestan 13 ms y corren **después** del pintado. Ver la ronda de corrección.

### P2-3 · Turnstile

Cargar los formularios de forma diferida (`next/dynamic`), de modo que su código
—y con él el de Turnstile— viva en un chunk que no se pide mientras los
interruptores estén apagados. Es el cambio que propuse hace dos rondas y quedó
pendiente. Bajo riesgo: los componentes ya devuelven `null`.

### P2-4 · JS sin usar

Se solapa con el anterior. Más allá de eso, los 62 KB son en su mayoría GSAP y
Lenis, que **sí se usan**; el «sin usar» es código de librería que no se alcanza.
Reducirlo exigiría importar GSAP por partes, lo que toca las animaciones
aprobadas. **No lo recomiendo.**

---

## F. Qué NO conviene optimizar

Lo más valioso de una auditoría suele ser la lista de lo que hay que dejar quieto.

| Elemento | Estado | Por qué no tocarlo |
|---|---|---|
| **TTFB** | 82–104 ms | Ya es excelente. No hay nada que ganar |
| **Teselas de OpenStreetMap** | **0 peticiones antes de desplazar**; 43 al llegar a Cobertura, la primera a los 3,9 s | La carga diferida ya funciona perfectamente. No cuesta ni un milisegundo de LCP |
| **Fuentes** | 48 KB los tres WOFF2, subconjunto latino, precargadas, `display: swap` | Ya están optimizadas. El problema B1 **no** se arregla adelgazándolas |
| **Vercel Analytics** | Mismo dominio, sin cookies | No hay coste de tercero. Cero peticiones externas |
| **Imágenes** | Todas por `next/image`, servidas al ancho exacto | Auditado en la ronda anterior: ninguna se descarga sobredimensionada |
| **Escritorio** | 100/100 en siete de ocho | No hay problema que resolver |
| **TBT / INP** | 14–55 ms | Muy por debajo de cualquier umbral. Las animaciones **no** están perjudicando la interactividad |
| **CSS** | Una sola hoja, bloqueante y pequeña | Correcto para un sitio de este tamaño |

### Sobre INP

**No se puede medir INP en laboratorio**: exige interacciones reales de personas
reales. Lo que sí mide Lighthouse es el TBT, su mejor aproximación, y está entre
14 y 55 ms — un décimo del umbral. **No hay indicio de que las animaciones estén
perjudicando la interactividad.** Para INP de verdad haría falta activar el
informe de campo de Vercel Analytics y esperar tráfico.

---

## Resumen en una línea

Dos cosas que arreglar —**el salto del titular en `/nosotros` y el LCP móvil de la
portada**—, una barata que quedó pendiente —**Turnstile muerto**— y una lista
larga de cosas que ya están bien y conviene no tocar.
