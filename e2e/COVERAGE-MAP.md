# Mapa de cobertura E2E — qué hay y qué viene

QA-FOUNDATION-1 pone los cimientos. Este documento dice qué está hecho y qué
queda, para que las fases siguientes no tengan que redescubrirlo.

**Nada de lo pendiente está implementado todavía.** Es un mapa, no una promesa
de que exista.

## Hecho

```
ARMAZÓN
  ✔ la aplicación carga y muestra la marca
  ✔ no hay pantalla en blanco
  ✔ ruta desconocida → vuelve al inicio sin romper
  ✔ rutas privadas rechazan a quien no ha entrado
  ✔ navegación repetida no degrada la aplicación
  ✔ sin backend se degrada, no se cae

PUERTA DE ACCESO
  ✔ el formulario vacío no llega al servidor
  ✔ unas credenciales inexistentes no abren sesión
  ✔ cambiar de rol no rompe el formulario
  ✔ alternar entrar/registrarse mantiene la pantalla utilizable
  ✔ el selector de administración solo aparece cuando se pide

ROLES (se saltan sin cuenta de prueba)
  ✔ pasajera · su pantalla se monta
  ✔ conductor · su pantalla se monta con las cuatro pestañas de la barra
  ✔ administración · la ruta rechaza a quien no es administrador  ← sin cuenta
  ✔ administración · el panel se monta en escritorio

HERRAMIENTAS
  ✔ vigilancia de excepciones y errores de consola, con ruido justificado
  ✔ vigilancia de red: 5xx, 4xx y peticiones sin respuesta
  ✔ corte y simulación de la API, para la fase sin conexión
  ✔ sesión por el camino real, sin inyectar tokens
```

## Pendiente

### Acceso

```
· selector de rol con cuentas reales de los tres roles
· OTP por teléfono
· verificación por correo
· Google / Apple, cuando existan
· cierre de sesión y expiración del token
```

### Pasajera

```
· pedir una carrera de principio a fin
· cancelar antes y después de la asignación
· recibir la asignación de conductor
· actualizaciones en tiempo real durante el viaje
· Transporte Seguro: alta, plan, cobertura
· perfil, privacidad y borrado de cuenta
```

### Conductor

```
· ponerse disponible / no disponible
· aceptar una oferta
· ARRIVED → IN_PROGRESS → COMPLETED
· reconexión a mitad de carrera
· recuperación sin conexión (el registro ya existe en el backend)
```

### Administración

```
· usuarios: listado, filtros, paginación
· aprobación de conductores y documentos privados
· viajes
· Transporte Seguro
· finanzas — SOLO cuando DRIVER-FINANCE-1 deje de estar pausado
```

### Responsivo

```
· ampliar 360 / 390 / 430 a las pantallas de cada rol, no solo al armazón
· modo claro y modo oscuro
· `prefers-reduced-motion`
```

## Lo que NO se debe automatizar todavía

**DRIVER-FINANCE-1 está PAUSADO** en `feat/driver-finance-1`. Estos cimientos
no dan por activa ninguna de sus reglas, y ninguna prueba debe asumirlas hasta
que esa fase se reanude y se apruebe:

```
✗ mantenimiento mensual de $1
✗ bloqueo por deuda de −$5
✗ comisiones diferidas
✗ migración del libro contable
✗ activación de la bandera
✗ retiros
```

La cobertura existente de cobro a la pasajera y de Transporte Seguro vive en
las pruebas de backend y **no se toca desde aquí**.

## Cómo crear datos, el día que haga falta

Ninguna prueba de estos cimientos crea datos. Cuando una fase siguiente lo
necesite:

1. **Nunca contra producción.** La configuración ya lo impide, pero la regla es
   anterior a la herramienta.
2. **Por las API autorizadas del producto**, con la sesión de una cuenta de
   prueba — no escribiendo en la base de datos para ir más rápido: eso salta la
   autorización del backend, que es justo lo que hay que comprobar.
3. **Identificable y único**: un prefijo `e2e_` y una marca de tiempo.
4. **Limpiado siempre**, en un `afterAll` que se ejecute aunque la prueba falle.

## Integración continua

El repositorio **no tiene** workflows de GitHub Actions hoy. Playwright ya está
preparado para CI —`forbidOnly`, un reintento, dos trabajadores, informe
HTML—, pero añadir el workflow es una decisión de infraestructura que excede
estos cimientos.

El paso siguiente, cuando se quiera, es un único workflow que ejecute:

```yaml
- npm ci
- npx playwright install --with-deps chromium webkit
- npm run test:e2e
```

con las cuentas de prueba en los secretos del repositorio y el informe subido
como artefacto. Nada más: sin desplegar y sin tocar producción.
