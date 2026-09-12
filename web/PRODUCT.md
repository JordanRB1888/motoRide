# +58Express — verdad de producto

> Todo lo de este documento está verificado contra el código del repositorio
> (`server/src` para endpoints, `src/utils/constants.js` para configuración).
> Lo que no esté aquí, no se afirma en la web.

## Qué es

Plataforma venezolana de movilidad y servicios bajo demanda. Se pide desde el celular:
el pasajero solicita, la plataforma asigna un conductor cercano y ambos siguen el viaje
en tiempo real.

## Quién la usa

| Rol           | Qué hace                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Pasajero**  | Pide viajes, ve el precio antes de confirmar, sigue al conductor, paga, chatea, califica  |
| **Conductor** | Recibe solicitudes, acepta o rechaza, navega, cobra, consulta ganancias e historial       |
| **Admin**     | Usuarios, conductores, tarifas, finanzas, pagos, mapa de flota, soporte, comunicados      |

## Qué funciona hoy (endpoints reales)

- **Viajes**: crear, activo, historial, programados (con reclamación por conductor),
  resumen, reseñas pendientes, chat por viaje con adjuntos.
- **Conductores**: ubicación en vivo, cercanos, estado (online/offline/ocupado),
  documentos y **postulación con aprobación del admin**.
- **Precios**: configuración y **estimación antes de pedir** (`/api/pricing/estimate`).
- **Dinero**: wallet, recargas, transacciones, liquidaciones a conductor.
- **Soporte**: hilos de conversación con el equipo.
- **Notificaciones** y **comunicados** del admin.

Tarifa configurada en código: solo **MOTO** (`PRICING_CONFIG`). Comisión del sistema
**15 %**. Radio de búsqueda **3 km**. Tiempo de aceptación **15 s**.

## Alcance de la comunicación web

Decisión del dueño (2026-09-12): la web presenta **la plataforma completa** — mototaxi,
viajes, delivery, comida, mercado, envíos, encomiendas, comercios, compra y venta,
transporte seguro — **sin etiquetas de disponibilidad por servicio**.

Se advirtió que hoy solo mototaxi tiene respaldo en el backend. La decisión está tomada
y la web se construye así.

**Límites que se mantienen igualmente:**

- **Cero cifras inventadas**: nada de usuarios, viajes diarios, ciudades cubiertas,
  conductores, ratings, descuentos ni estadísticas. No existen datos públicos que citar.
- **Cero logos de terceros** presentados como socios reales.
- **Tiendas**: la app **no está publicada**. Los badges dicen «Próximamente»; no se
  inventan enlaces de descarga.

## Dónde

Maracaibo (centro por defecto del mapa) y la campaña de lanzamiento activa en
**Santa Cruz de Mara → Municipio Mara**, estado Zulia.

## Pagos

Wallet +58express, Pago Móvil, Zelle, Zinli y efectivo.

## Diferenciadores reales (respaldados por código)

1. **Precio antes de pedir** — estimación previa a confirmar.
2. **Tiempo real** — ubicación del conductor por socket, estados de viaje en vivo.
3. **Conductores verificados** — documentación revisada y aprobada por un administrador.
4. **Chat dentro del viaje**, con adjuntos privados.
5. **Viajes programados**.
6. **Pagos locales** pensados para Venezuela.

## Estados de viaje (la narrativa real de la app)

`DRAFT → SEARCHING → DRIVER_ASSIGNED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_TRIP → COMPLETED`

Esta máquina de estados es la columna vertebral del scrollytelling de la home: la web
cuenta exactamente lo que hace el producto, no una ficción paralela.
