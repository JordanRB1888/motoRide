# Contratos compartidos

Tipos de dominio que **frontend, backend y la futura app nativa** pueden usar
sin duplicarlos.

## Tres reglas, y las tres importan

### 1. Neutrales respecto al entorno

Nada de `window`, `document`, DOM, ni APIs exclusivas de Node. Estos contratos
tienen que poder importarse desde React Native + Expo tal cual, sin adaptador.

Si un tipo necesita `Request`, `Response` o `HTMLElement`, **no pertenece
aquí**: pertenece a la capa que lo usa.

### 2. Se derivan del código real, no se inventan

Cada valor de estos contratos sale de una fuente canónica que ya existe en el
producto, y el fichero dice cuál. No se añaden estados nuevos, no se «mejoran»
los que hay, y no se corrigen divergencias desde aquí: eso sería cambiar el
producto por la puerta de atrás.

### 3. Un contrato no es una validación

TypeScript desaparece al compilar. Estos tipos **no sustituyen** —y no deben
usarse como excusa para quitar— ninguna de las defensas reales:

```
validación en runtime · restricciones de PostgreSQL · transacciones
autorización · cerrojos · idempotencia · pruebas
```

Un `TripStatus` en TypeScript no impide que llegue por HTTP la cadena
`"BANANA"`. Lo que lo impide es la comprobación que ya hay en el servidor.

## Qué NO se comparte

Compartir un contrato no es compartir los datos. Aquí no entra nada que
incentive mandar al cliente:

```
hashes de contraseña · interioridades de autenticación · secretos de JWT
datos bancarios · documentos privados del conductor · el libro contable interno
```

Si un tipo necesita un campo así, va en el backend y no aquí.

## Dónde está cada fuente canónica

| Contrato | Fuente de verdad |
|---|---|
| `TripStatus`, `TRIP_STATUSES` | `server/domain/tripStateMachine.js` |
| `DriverStatus`, `DRIVER_STATUSES` | `server/domain/driverState.js` |
| `UserRole`, `USER_ROLES` | `server/index.js` (rutas y guardias de rol) |
| `VehicleType`, `VEHICLE_TYPES` | `server/domain/driverApplicationModel.js` |
| `Coordinates` | `src/services/navigationRoute.js` y afines |
| `ApiError` | `src/services/httpErrorCodes.js` |

Si alguna de esas fuentes cambia, **el contrato se actualiza a mano y a
conciencia**. No hay generación automática, y es deliberado: un cambio de
estado del dominio debe costar una decisión, no aparecer solo.
