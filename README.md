# +58express

Aplicación de mototaxi para pasajeros, conductores y administración. El proyecto conserva una sola interfaz Vite y un solo servidor Express/Socket.IO.

## Desarrollo

Requisitos: Node.js 24 o superior.

```bash
npm install
npm --prefix server install
npm run dev:server
npm run dev
```

La interfaz abre en `http://localhost:3000` y el servidor escucha en `http://localhost:4000`.

## Variables

En el frontend deben configurarse `VITE_API_URL` (incluyendo `/api`) y `VITE_SOCKET_URL`. En el servidor se admiten `PORT`, `CLIENT_ORIGIN` y `DATA_FILE`.

Para Railway, monte un volumen persistente en `/data` y configure `DATA_FILE=/data/plus58express.sqlite`.

También deben configurarse `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` antes de publicar. Las credenciales iniciales de desarrollo están documentadas en `server/.env.example` y deben cambiarse en producción.

## Estructura

- `src/pages/passenger`: aplicación del pasajero.
- `src/pages/driver`: aplicación del conductor.
- `src/pages/admin`: panel administrativo.
- `src/services/socketClient.js`: comunicación en tiempo real compartida.
- `server/index.js`: API REST, despacho y sincronización Socket.IO.
- `server/data/plus58express.sqlite`: base SQLite transaccional generada automáticamente y excluida de Git.

El antiguo backend NestJS/Prisma fue retirado porque coexistía con el servidor activo y utilizaba contratos incompatibles.
