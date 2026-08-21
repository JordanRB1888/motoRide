# +58express — Sistema visual

Fuente de verdad del lenguaje visual del producto. Si vas a añadir una pantalla
o un componente, esto es lo que debes seguir; si necesitas algo que no está
aquí, amplía este documento en el mismo cambio.

La implementación vive en **`src/styles/design-system.css`**. Los contratos
están fijados por pruebas en **`test/visualDesignSystem.test.js`**: si rompes
uno, la suite te lo dice antes de que llegue a producción.

---

## 1. Marca

+58express es una aplicación de mototaxi y delivery en Venezuela. Tiempo real,
dinero, conductores en la calle, pasajeros que necesitan un viaje ahora.

Eso ordena las prioridades, y el orden no es negociable:

> **claridad → velocidad → legibilidad → confianza → uso con una mano → móvil**,
> y solo después, decoración.

No es un portafolio ni una landing de SaaS. Si una decisión estética compite
con leer un precio bajo el sol o acertar un botón en marcha, gana lo segundo.

El carácter visual lo aportan **el amarillo, el grafito cálido y la escena de
la moto**. La tipografía y las superficies acompañan; no compiten.

---

## 2. Tipografía

Dos familias, ambas variables, ambas OFL-1.1, ambas **autohospedadas** en
`public/fonts/`. Cero peticiones a Google Fonts o cualquier otro CDN.

| Familia | Token | Uso |
|---|---|---|
| **Sora** | `--x58-font-display` | Display, H1, H2, precio, saldo, velocidad |
| **Manrope** | `--x58-font-ui` | Interfaz, cuerpo, campos, botones, navegación y datos operativos |

**Por qué estas dos.** Sora tiene carácter geométrico suficiente para dar voz
propia a los titulares y las cifras grandes, sin la extravagancia que restaría
seriedad a un producto que maneja dinero. Manrope es muy legible a 13–15 px en
español, que es donde vive la mayor parte del texto de esta aplicación. Las dos
comparten construcción geométrica, así que conviven sin friccionar.

**Cobertura.** Solo el subset `latin` (U+0000–00FF y complementos). Verificado
que incluye `á é í ó ú ñ Ñ ü Á É Í Ó Ú` y, en particular, **`¿` y `¡`**, que
en español abren frase y no pueden faltar.

### Escala

| Rol | Familia | Tamaño | Peso | Interletrado |
|---|---|---|---|---|
| Display | Sora | 2.25rem / 1.05 | 700 | −0.03em |
| H1 | Sora | 1.75rem / 1.12 | 700 | −0.025em |
| H2 | Sora | 1.375rem / 1.2 | 700 | −0.02em |
| H3 | Manrope | 1.125rem / 1.25 | 650 | −0.015em |
| Título de tarjeta | Manrope | 1rem / 1.3 | 650 | −0.01em |
| Cuerpo | Manrope | 0.9375rem / 1.5 | 450 | 0 |
| Secundario | Manrope | 0.875rem / 1.45 | 450 | 0 |
| Caption | Manrope | 0.75rem / 1.35 | 550 | +0.01em |
| **Campo** | Manrope | **1rem (16px)** | 500 | 0 |
| Botón | Manrope | 0.9375rem | 650 | +0.005em |
| Navegación | Manrope | 0.6875rem | 600 | +0.02em |

> **Los campos van a 16px reales y no es negociable.** Por debajo de 16 px, iOS
> Safari hace zoom automático al enfocar el campo y descuadra la pantalla. Ya
> pasó una vez con `font-size: 0.92rem` en el Login.

### Cifras

Todo dato numérico operativo —precio, saldo, ETA, distancia, velocidad,
calificación, códigos— usa **cifras tabulares**:

```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum' 1;
```

La razón es funcional, no estética: sin ellas, un ETA que baja de 9 a 8 minutos
cambia de ancho y la línea entera se mueve. Clases disponibles: `.x58-numeric`,
`.x58-price`, `.x58-wallet`, `.x58-eta`, `.x58-distance`, `.x58-speed`,
`.x58-rating`, `.x58-otp`.

---

## 3. Color

### Amarillo — un solo amarillo

```
--x58-yellow          #ffd21f    primario, marca, CTA
--x58-yellow-hover    #ffc400    hover
--x58-yellow-active   #ffb800    pulsado, cierre del degradado del Login
--x58-yellow-soft     rgba(255,210,31,.13)   fondos teñidos
--x58-yellow-line     rgba(255,210,31,.34)   bordes acentuados
--x58-yellow-ink      #1a1500    texto sobre amarillo
```

El degradado certificado del Login es exactamente
`linear-gradient(135deg, #ffd21f, #ffb800)`. La rampa se eligió para preservarlo.

**El amarillo es una herramienta de jerarquía, no un color de relleno.** Se usa
para: CTA, selección, estado activo, precios destacados, "en línea",
confirmaciones importantes y marca. Nada más. La regla mental es
**dominio del grafito, amarillo intencionado**.

Nunca declares un amarillo a mano. Usa el token. Hay una prueba que lo verifica.

### Superficies — grafito cálido

Grafito cálido significa que **el rojo va por delante del azul** en cada
escalón. Un gris azulado se lee frío y genérico; el azul pizarra
(`#0f1420`, `#182232`) fue justamente lo que se eliminó de este producto.

| Token | Oscuro | Claro |
|---|---|---|
| `--x58-surface-0` | `#0e0d0b` | `#f2f0ec` |
| `--x58-surface-1` | `#161512` | `#f8f7f4` |
| `--x58-surface-2` | `#1e1c19` | `#ffffff` |
| `--x58-surface-raised` | `#262420` | `#ffffff` |
| `--x58-surface-overlay` | `rgba(9,8,7,.94)` | `rgba(255,255,255,.96)` |
| `--x58-surface-sunken` | `#0a0908` | `#e8e5df` |

### Texto

| Token | Oscuro | Contraste | Claro | Contraste |
|---|---|---|---|---|
| `--x58-text-primary` | `#f7f6f3` | 17.97 | `#191713` | 15.73 |
| `--x58-text-secondary` | `#a3a09a` | 7.45 | `#56534c` | 6.74 |
| `--x58-text-muted` | `#817e77` | 4.80 | `#6f6b61` | 4.67 |

Contrastes medidos sobre `--x58-surface-0`. **Todos superan WCAG AA (4.5:1)**
para texto normal. Si cambias un color de texto, mide antes de comitear.

### Estado

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--x58-success` | `#55e29a` | `#0f7350` | En línea, confirmado, pagado |
| `--x58-warning` | `#ffa726` | `#a35c00` | Pendiente, atención |
| `--x58-danger` | `#ff6878` | `#c62839` | Cancelado, error, SOS |
| `--x58-info` | `#63c9ff` | `#1668a8` | Informativo |

El cian **no es un color de marca**. Antes actuaba como acento secundario y
competía con el amarillo; ahora solo indica información.

---

## 4. Espaciado, radio y sombra

```
Espaciado   4 · 8 · 12 · 16 · 24 · 32 · 48        --x58-space-1 … -7
```

```
Radio       small   10px   chips, badges, controles menores
            control 14px   botones, campos
            card    20px   tarjetas
            sheet   28px   bottom sheets, modales
            pill    999px  píldoras de estado
```

Los radios se nombran **por función, no por tamaño**: así una tarjeta sigue
siendo una tarjeta aunque el valor cambie.

```
Sombra      subtle    0 1px 2px      separación mínima
            card      0 8px 24px     tarjetas
            floating  0 16px 40px    elementos flotantes
            modal     0 24px 70px    hojas y modales
```

En claro las sombras son más discretas y tienen tinte cálido
(`rgba(24,20,12,…)`), nunca negro puro.

---

## 5. Material

**Oscuro.** Grafito cálido con profundidad sutil, borde translúcido controlado
y un reflejo amarillo muy tenue. Sin glassmorphism en cada tarjeta, sin bordes
brillantes por todas partes, sin neón.

**Claro.** Off-white cálido, grafito para el texto, el mismo amarillo. Las
superficies se separan por sombra suave, no por bordes duros. Diseñado para
leerse bajo luz exterior fuerte, que es la condición real de un conductor.

> El modo claro **no es el oscuro invertido**. Tiene sus propios colores de
> estado, más profundos, porque un verde brillante sobre blanco no contrasta.

**Textura.** Un grano SVG embebido (~0,3 KB, sin petición de red) a opacidad
`.025` en oscuro y `.018` en claro, mediante la clase `.x58-grain`. Existe para
que las superficies grandes no se vean digitalmente planas. Debe percibirse de
forma subconsciente: si lo notas, está mal calibrado. Nunca sobre texto, y se
desactiva con movimiento reducido.

---

## 6. Movimiento

```
--x58-motion-feedback   130ms   pulsación, respuesta inmediata
--x58-motion-fast       170ms   controles
--x58-motion-standard   220ms   tarjetas
--x58-motion-sheet      300ms   bottom sheets
--x58-motion-route      320ms   transiciones de pantalla
```

```
--x58-ease-standard   cubic-bezier(.4, 0, .2, 1)
--x58-ease-out        cubic-bezier(.16, 1, .3, 1)    entradas, hojas
--x58-ease-in         cubic-bezier(.5, 0, .9, .3)    salidas
```

**Anima solo cuando aporte** una de estas cinco cosas: respuesta, continuidad,
cambio de estado, orientación espacial o jerarquía. Si no aporta ninguna, no
animes.

**Usa `transform` y `opacity`.** Animar `left`, `top`, `width` o `height`
obliga al navegador a recalcular la disposición en cada fotograma. Ya se
corrigió un caso (`umEdgeScan` animaba `left`; ahora usa `translateX`).

**Prohibido:** brillos pulsantes permanentes, rebotes infantiles, spinners
decorativos, parallax gratuito. Un `umButtonGlow` infinito sobre los CTA se
retiró justamente por esto: consumía GPU y no comunicaba nada.

**Movimiento infinito solo con estado real detrás**: radar de búsqueda, punto
en vivo, pulso de GPS, SOS, spinner mientras carga de verdad.

Todo movimiento respeta `prefers-reduced-motion: reduce`. Con esa preferencia
la aplicación queda **completa y usable**, sin animación continua.

---

## 7. Controles

Estados que todo control debe definir: `default`, `hover`, `active`,
`focus-visible`, `disabled`, y cuando aplique `loading`, `error`, `success`.

**Foco visible**, contrato único en toda la aplicación:

```css
outline: 2px solid var(--x58-yellow);
outline-offset: 2px;
```

**Objetivo táctil mínimo: 44 px.** Cuando el control debe verse más pequeño
—un ojo de contraseña, una casilla—, no lo agrandes: extiende el área tocable
con un pseudo-elemento invisible centrado, como hace `design-system.css` con
`.liquid-eye-toggle`, `.liquid-checkbox`, `.liquid-forgot-link`, `.role-tab` y
`.auth-tab`. El aspecto no cambia y el dedo acierta.

---

## 8. Tarjetas y hojas

La geometría de tarjetas y bottom sheets está **certificada** (checkpoint
`7fcb0fd`). Refina material, tipografía, borde, sombra y espaciado interno;
**no toques la geometría**.

Reglas:

- Nunca tarjeta dentro de tarjeta dentro de tarjeta. Si una sección simple
  funciona, usa una sección.
- Los bottom sheets conservan `translate(-50%, …)` en todo el arrastre: un
  `translateY` aislado los descentra.
- Ancho limitado al dispositivo, centrado estable, altura máxima acotada.
- Reservan la navegación inferior y respetan `env(safe-area-inset-*)`.

---

## 9. Puntos de ruptura y áreas seguras

Móvil primero. Anchos de verificación obligatoria: **360 · 390 · 430**, más
tablet y escritorio.

En móvil el Login ocupa `100dvh` a ancho completo, sin radio. Toda superficie
fija usa `env(safe-area-inset-*)`. Ninguna pantalla debe producir scroll
horizontal: si `document.documentElement.scrollWidth > window.innerWidth`, hay
un defecto.

---

## 10. Accesibilidad

- Contraste WCAG AA (4.5:1) en texto y colores de estado, en **ambos** temas.
- `focus-visible` en todo control interactivo.
- Objetivo táctil ≥ 44 px, real o extendido.
- `prefers-reduced-motion` respetado.
- Campos a 16 px.
- No se sacrifica accesibilidad por estética. Nunca.

---

## 11. Rendimiento

Presupuesto vigente: **2 familias tipográficas** (58,5 KB, autohospedadas),
**cero CDN de fuentes**, cero fondos de vídeo, cero Three.js, cero canvas
decorativo pesado, cero framework de animación.

Antes de añadir un asset visual, pregúntate si un conductor con conexión
intermitente lo va a agradecer.

---

## 12. Qué está congelado

Tras este checkpoint el lenguaje visual queda **congelado**. Los cambios
posteriores se limitan a:

- corrección de errores,
- funcionalidad nueva que **siga este documento**,
- accesibilidad,
- defectos de responsive,
- soporte de una plataforma o dispositivo nuevo.

No se abren rediseños grandes. Si crees que hace falta uno, la conversación
empieza por modificar este documento, no por escribir CSS.
