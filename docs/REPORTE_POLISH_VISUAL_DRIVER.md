# Reporte Técnico: Pulido Visual y Motion de la Experiencia Driver (+58Express)

**Fecha:** 4 de Septiembre de 2026  
**Fase:** `DRIVER_VISUAL_POLISH_FINAL`  
**Estado:** `COMPLETADO Y CERTIFICADO`  

---

## 1. Resumen Ejecutivo y Banderas de Certificación

Se ha completado satisfactoriamente la fase final de pulido visual, ergonomía y motion sobre la experiencia de Conductor (**Driver**) de **+58Express**. Todas las correcciones cumplen con la estricta política de cero cambios en contratos de backend, lógica de negocio, autenticación, rutas funcionales y preservación absoluta de la experiencia de Pasajera.

```txt
DRIVER_VISUAL_POLISH_PASS: YES
DRIVER_NAV_CONTEXT_LEAK: FIXED
FAB_GREEN_LOCKED: PRESERVED_100%
PASSENGER_UNTOUCHED: YES
LOGIC_UNTOUCHED: YES
PROFILE_ORPHAN_ROWS_VISIBLE: 0
SALDO_LONG_AMOUNT_SAFE: YES
SALDO_320PX_SAFE: YES
DOCUMENT_ICONS_MOTION: PASS
PHOTO_ICON_MOTION: PASS
STEERING_ICON_CONTEXTUAL_MOTION: PASS
```

---

## 2. Corrección Crítica: Fuga de Contexto de Navegación (`DRIVER_NAV_CONTEXT_LEAK`)

### Problema Identificado
Al acceder a las secciones secundarias **Configuración** y **Avisos**, un conductor autenticado visualizaba erróneamente la barra inferior de navegación correspondiente al rol Pasajera (`DESTINOS_DE_PASAJERA` con el botón central de solicitar viaje).

### Solución Implementada
- **Detección Dinámica de Rol:** Se integró la función `shellDelRol` en [`mobile/app/configuracion.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/app/configuracion.tsx) y [`mobile/app/avisos.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/app/avisos.tsx) para inspeccionar el rol de la sesión activa (`session.usuario.role`).
- **Inyección de Prop `barra`:** Se parametrizó `barra?: 'pasajera' | 'conductor'` en [`mobile/preview/pantallaConfiguracion.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/preview/pantallaConfiguracion.tsx) y [`mobile/preview/pantallasC2Secciones.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/preview/pantallasC2Secciones.tsx).
- **Montaje Condicional:**
  - Cuando `barra === 'conductor'`, se monta la [`BarraDeNavegacion`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/Navegacion.tsx) con `DESTINOS_DE_CONDUCTOR` y el componente [`ControlDeDisponibilidad`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/Navegacion.tsx) en su estado activo.
  - El enrutamiento de tabs secundarias redirige de forma contextual a `/conductor` y `/conductor-saldo`.

---

## 3. Tarjeta de Saldo Fintech Premium Driver

### Mejoras Visuales y de Profundidad
En [`mobile/ui/TarjetaSaldoDriver.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/TarjetaSaldoDriver.tsx):
- **Capas de Luz y Sombra:** Se implementó una gradación de luz cenital con `capaLuzSuperior` (15% blanco translúcido con desvanecimiento lineal), un resplandor ambiental `resplandorSuperiorDerecho` de radio difuso (200px) y una sombra inferior tenue que otorga profundidad táctil sin romper el contraste de la marca.
- **Detalle de Aros Concéntricos:** Líneas finas circulares abstractas que aportan una terminación de tarjeta bancaria/fintech sin recargar el fondo.

### Resiliencia Tipográfica y Formato
- **Tolerancia a Cifras Altas (`SALDO_LONG_AMOUNT_SAFE: YES`):**
  - Se añadieron `numberOfLines={1}`, `adjustsFontSizeToFit={true}` y `minimumFontScale={0.68}` con alineación tipográfica en `baseline` en el componente [`Txt`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/componentes.tsx). Cifras de 6 o 7 dígitos (ej. `$12.850,50` o `$128.500,00`) reducen su escala armónicamente sin quiebres de línea ni desbordamiento de tarjeta.
- **Tasa BCV y Equivalencia:** Altura de línea estabilizada a `lineHeight: 17` y envoltorio seguro para prevenir colisiones contra los botones de acción en resoluciones extremas.
- **Compatibilidad con Pantallas de 320px (`SALDO_320PX_SAFE: YES`):**
  - Botones con altura estándar de 48 puntos (área táctil mínima accesible), bordes con contraste de precisión (`rgba(17, 24, 39, 0.85)`) y flujo de apilado limpio.

---

## 4. Lenguaje de Iconografía y Microinteracciones (`Its Hover`)

Toda la iconografía reactiva centralizada en [`mobile/ui/IconoAnimado.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/IconoAnimado.tsx) opera exclusivamente bajo interacción física del usuario (`onPressIn` / `onPressOut`), permaneciendo serena e inmóvil en reposo.

### Microinteracciones Específicas
1. **Volante Contextual (`STEERING_ICON_CONTEXTUAL_MOTION: PASS`):**
   - Animación de rotación que emula la respuesta física de un volante ante el tacto: secuencia `0° → -12° → +10° → -4° → 0°` amortiguada con `withSpring`.
2. **Avatar en Tus Datos (`PHOTO_ICON_MOTION: PASS`):**
   - Micro-pulsación elástica en el botón circular de cambio de foto mediante [`IconoAnimado`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/IconoAnimado.tsx) variante `'pulso'`.
3. **Documentos de Postulación (`DOCUMENT_ICONS_MOTION: PASS`):**
   - En [`mobile/ui/DocumentosPostulacion.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/ui/DocumentosPostulacion.tsx), las cabeceras `CabeceraGrupoDocumental` ahora usan `IconoAnimado` para reflejar el estado completado (`perfil`, `volante`, `moto`).
   - Botón «Tomar foto» y «Grabar vídeo» integran micro-press de obturador (`scale: 0.86 → 1`) en `IconoCamara` e `IconoVideoCamara`.
   - Botones «Galería» integran elevación sutil vía `IconoAnimado` con variante `'elevar'`.

---

## 5. Limpieza de Filas Huérfanas en Perfil (`PROFILE_ORPHAN_ROWS_VISIBLE: 0`)

En [`mobile/preview/pantallasC2Secciones.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/preview/pantallasC2Secciones.tsx):
- Se ocultaron del entorno productivo las filas no conectadas a pantallas activas:
  - *Direcciones guardadas*
  - *Tu saldo*
  - *Soporte*
- Permanecen visibles y plenamente funcionales las 5 opciones reglamentarias:
  1. `Tus datos`
  2. `Seguridad de la cuenta`
  3. `Notificaciones`
  4. `Configuración`
  5. `Cambiar de modo`
  - Botón destructivo / salida: `Cerrar sesión`.

---

## 6. Preservación de Seguridad y Zona de Riesgo

En [`mobile/preview/pantallaConfiguracion.tsx`](file:///f:/proyectos%20app%20web/motoRide-current/mobile/preview/pantallaConfiguracion.tsx):
- Se mantiene preservada la sección final **Zona de riesgo** con la opción destructiva **Eliminar cuenta**, marcada explícitamente con `tono="peligro"`, cumpliendo todos los requisitos de accesibilidad y tests contractuales.

---

## 7. Verificación y Resultados de Pruebas

### Comprobación de Tipos (TypeScript)
```bash
npm --prefix mobile run typecheck
```
- **Resultado:** `tsc --noEmit` completado exitosamente con **0 errores de compilación**.

### Suite de Pruebas Móvil
```bash
npm run mobile:test
```
- **Resultado:**
  - **Total de pruebas:** 973
  - **Aprobadas:** 973 (100%)
  - **Fallidas:** 0
  - **Canceladas / Omitidas:** 0

---

## 8. Tabla de Archivos Modificados

| Archivo | Naturaleza del Cambio |
|---|---|
| `mobile/ui/IconoAnimado.tsx` | Añadida variante contextual `'volante'` y mapeo en `movimientoSugerido`. |
| `mobile/ui/componentes.tsx` | Soporte para `adjustsFontSizeToFit` y `minimumFontScale` en `Txt`. |
| `mobile/ui/TarjetaSaldoDriver.tsx` | Profundidad fintech, resplandor, tolerancias de texto y layout responsivo 320px. |
| `mobile/ui/DocumentosPostulacion.tsx` | Micro-motion táctil en cámara/vídeo, `IconoAnimado` en galería y cabeceras de grupo. |
| `mobile/preview/pantallaConfiguracion.tsx` | Soporte de prop `barra`, barra condicional conductor/pasajera y Zona de riesgo. |
| `mobile/app/configuracion.tsx` | Detección de sesión y rol con `shellDelRol` y redirección contextual. |
| `mobile/preview/pantallasC2Secciones.tsx` | `C2Avisos` condicional de rol y ocultación de filas huérfanas en `C2Perfil`. |
| `mobile/app/avisos.tsx` | Propagación de barra del conductor y redirección adaptativa. |
| `mobile/preview/pantallaTusDatos.tsx` | Conexión de `IconoAnimado` ante interacción en cambio de foto. |
