# REPORTE DE MICRO-POLISH VISUAL — PASSENGER (+58EXPRESS)

**Fecha:** Septiembre 2026  
**Alcance:** Experiencia Pasajera (Passenger) — Optimización basada en pruebas reales sobre dispositivo móvil (APK)  
**Estado General:** `PASSENGER_MICRO_POLISH: PASS`

---

## 1. Resumen Ejecutivo

A partir de las pruebas de usuario en dispositivo real (APK en mano), se aplicó un micro-pulido visual enfocado en devolver área de interacción al mapa, agilizar la apertura de la hoja de servicios, elevar el acabado de las tarjetas principales y secundarias, y mejorar la legibilidad y respuesta táctil de la barra de navegación y el perfil, preservando estrictamente la arquitectura, rutas, auth y contratos del sistema.

```
PASSENGER_MICRO_POLISH: PASS
Files changed:
  • mobile/preview/pantallaInicioPasajera.tsx
  • mobile/ui/Navegacion.tsx
  • mobile/preview/pantallasC2Secciones.tsx
Visual changes: Map-first padding recovery, lighter bottom sheet with bezier curve, hero & secondary card polish, high-contrast bottom nav with refined micro-motion, profile row polish, future banner slot.
Tests: 982/982 passed (100%), typecheck 0 errors.
Responsive result: Verified on 390×844 and 320×700 without overflow or clipping.
```

---

## 2. Detalle de Cambios Visuales y de Interacción

### 2.1 Home Map-First & Cabecera
- **Área de mapa devuelta:** Se redujo el `paddingTop` de la cabecera a `12 + insetTop` (anteriormente `18 + insetTop`) y el `paddingBottom` a `8px`.
- **Avatar compacto:** Ajustado a `46×46px` con borde pulido de 2px, optimizando la línea visual con respecto al saludo y la tasa de cambio.
- **Buscador flotante:** Reducción del margen inferior del contenedor a `10px`, permitiendo recuperar aproximadamente 18px verticales de mapa interactivo en pantalla completa.

### 2.2 Bottom Sheet "¿Qué necesitas hoy?"
- **Dimensiones más ligeras:** Altura máxima inicial reducida a `Math.min(alto * 0.78, alto - 80)` (anteriormente ocupaba el 82% de la pantalla), eliminando la sensación de peso excesivo sobre el mapa.
- **Cabecera de la hoja:** Reducida a `minHeight: 62px` (anteriormente 72px), con asidero central estilizado (`38×4px`) y botón de cierre táctil circular `×` de `40×40px` (`borderRadius: 20`, tamaño de fuente `24px`).
- **Curva de animación con aceleración/desaceleración suave:**
  - Entrada rápida y desaceleración orgánica al final con curva de Bezier cúbica:  
    `EasingAnimada.bezier(0.16, 1, 0.3, 1)` con duración de `260ms`.
  - Salida rápida y limpia: `EasingAnimada.bezier(0.4, 0, 1, 1)` con duración de `200ms`.
- **Scroll interior:** `paddingTop: 14px`, `paddingBottom: 110px`, garantizando visibilidad completa de todas las tarjetas secundarias sin solaparse con la barra de navegación.

### 2.3 Card "Viajes" (Hero Card)
- **Relación moto/texto perfeccionada:** Altura ajustada a `126px` con contenedor de arte de `176×116px` ubicado en `right: -6, bottom: -4`.
- **Humo de escape dinámico:** Preservado con volutas grises contextuales sincronizadas en bucle suave para denotar vehículo encendido.
- **Jerarquía tipográfica:** Título en `fontWeight: '800'` con `letterSpacing: -0.2`, texto de apoyo acotado al `56%` del ancho (`fontSize: 12, lineHeight: 16`).
- **Micro-botón de acción:** Cápsula "Pedir" con micro-dot amarillo en acento al 12% de opacidad y borde refinado de `0.44`. Feedback elástico al tacto (`scale: 0.985`).

### 2.4 Cards Secundarias (Comercios, Transporte Seguro, Envíos, Comida, Mercado, Compra y vende)
- **Eliminación del efecto "sticker negro":** Los iconos y emblemas ahora están contenidos en un squircle estilizado de `50×50px` (`borderRadius: 14`) con borde sutil (`tema.color.borde`) y fondo `superficieElevada`.
- **Dimensión de iconos:** Estandarizados a `44×44px` con centrado milimétrico.
- **Altura de tarjeta:** Optimizada a `minHeight: 136px` (anteriormente 148px), reduciendo espacio vertical sobrante.
- **Badge "PRONTO":** Refinado a cápsula de `paddingHorizontal: 6, paddingVertical: 2` sobre superficie hundida con tipografía en `9.5px, fontWeight: '700'`.
- **Feedback táctil:** Micro-press elástico sutil (`scale: 0.98`).

### 2.5 Bottom Navigation Passenger
- **Botón Central "Pedir":** Intacto (100% preservado en dimensiones, aspa `×`, heartbeat de disponibilidad, color amarillo y elevación).
- **Iconos laterales aumentados:** Tamaño elevado a `27.5px` (anteriormente 26px) para maximizar legibilidad en pantallas de alta densidad.
- **Contraste inactivo mejorado:** Uso de `tema.color.textoSecundario` en reemplazo de `textoTenue` para visualización clara bajo luz solar directa.
- **Micro-motion calibrado:** Al activarse, la pestaña ejecuta un impulso sutil a `1.10` en 110ms (`bezier(0.23, 1, 0.32, 1)`) seguido de amortiguación elástica de 170ms (`dampingRatio: 0.88`). Al tocar, respuesta de compresión suave a `0.93` en 90ms.
- **Preservación estricta de contratos:** Mantenidos íntegros `[0, -4]`, `pulsacion.get() * pulso.get()`, `ultimoIndiceDePasajera`, y `withSpring(destino)`.

### 2.6 Perfil
- **Icon containment en filas:** Contenedores squircle de `40×40px` (`borderRadius: 12`) con micro-borde para uniformar la lectura.
- **Espaciado y alineación:** `paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14` con área táctil cómoda.
- **Feedback de pulsación:** Micro-escala elástica `scale: 0.988` con resaltado translúcido de superficie.
- **Chevron refinado:** Icono indicador en `tema.color.textoSecundario` con trazo `1.8` y micro-avance dinámico al presionar (`translateX: 3`).
- **Conservación:** Cero impacto sobre callbacks existentes ni navegación entre secciones.

### 2.7 Preparación de Espacio para Banner Futuro
- Se introdujo la propiedad opcional `slotBanner?: React.ReactNode` en el componente `C2InicioPasajera`.
- Ubicada estratégicamente debajo del buscador y las alertas de estado, renderiza `{slotBanner ?? null}` sin generar espacio vacío cuando no está presente y sin interferir con la apertura de la hoja ni los gestos del mapa.

---

## 3. Pruebas y Validación Técnica

### 3.1 Pruebas Automatizadas
- **Suite de Pruebas Móviles:** `npm run mobile:test`
  - Total pruebas ejecutadas: **982**
  - Pruebas superadas: **982 (100%)**
  - Pruebas fallidas: **0**
- **Verificación de Tipos TypeScript:** `npm --prefix mobile run typecheck`
  - Errores encontrados: **0**

### 3.2 Validación Responsive
| Viewport | Componente Evaluado | Resultado |
|---|---|---|
| **390 × 844** (iPhone estándar / Android moderno) | Home, Sheet 'Pedir', Bottom Nav, Perfil | Balance perfecto de mapa visible, cards en rejilla 2 columnas sin salto de línea en títulos, bottom nav perfectamente alineada con safe area. |
| **320 × 700** (Dispositivos compactos / Android accesible) | Home, Sheet 'Pedir', Bottom Nav, Perfil | Sin desbordamiento de texto, botones respetan área táctil mínima de 48px, scroll fluido en hoja sin bloqueo de cierre. |

---

## 4. Compromiso de Integridad del Código
- **Backend / Supabase:** Intocado.
- **Autenticación y Sesiones:** Intocado.
- **Rutas y Navegación del Router:** Intocado.
- **Experiencia Driver:** Intocada (conserva su disco verde y navegación bouncy independiente).
- **Dependencias:** Cero paquetes o librerías adicionales.
