# Pruebas E2E de +58express

Cimientos de Playwright. Abren la aplicación de verdad, en un navegador de
verdad, y comprueban que el armazón funciona.

## Antes que nada: la regla de producción

`apiService` elige su servidor por el **nombre de host de la página**:

```
localhost / 127.0.0.1  →  backend local (http://localhost:4000/api)
cualquier otro         →  PRODUCCIÓN
```

Una suite E2E ejecutada contra un dominio público estaría, sin decirlo,
creando usuarios y viajes reales. Por eso `playwright.config.js` **se niega a
arrancar** contra un host que no sea local. Si algún día hace falta un humo de
**solo lectura** contra un entorno remoto, hay que pedirlo a mano con
`E2E_ALLOW_REMOTE=1` — y esa ejecución no debe escribir nada.

Ninguna prueba de estos cimientos crea datos: no registra usuarios, no pide
carreras y no toca saldos.

## Instalar

Playwright ya está en `devDependencies`. Solo hacen falta los navegadores:

```bash
npm install
npx playwright install chromium webkit
```

Chromium cubre los Android y el escritorio; WebKit es Safari, que es lo que
lleva un iPhone — y esta aplicación es móvil primero.

## Ejecutar

```bash
npm run test:e2e
```

Levanta la compilación real con `vite preview` en el puerto 4173, ejecuta todo
y para el servidor al terminar. Para verlo con ventana:

```bash
npm run test:e2e:headed
```

Y el informe de la última ejecución:

```bash
npm run test:e2e:report
```

Un solo proyecto, o un solo fichero:

```bash
npx playwright test --project=movil-390
npx playwright test e2e/smoke
```

## Variables de entorno

Todas opcionales. **Ninguna credencial se guarda en el repositorio.**

| Variable | Para qué |
|---|---|
| `E2E_BASE_URL` | dónde vive la aplicación. Por defecto `http://localhost:4173` |
| `E2E_SKIP_WEBSERVER=1` | no levantar Vite: ya hay algo escuchando ahí |
| `E2E_ALLOW_REMOTE=1` | permite un host no local. Solo humo de **lectura** |
| `E2E_PASSENGER_EMAIL` / `E2E_PASSENGER_PASSWORD` | cuenta de prueba de pasajera |
| `E2E_DRIVER_EMAIL` / `E2E_DRIVER_PASSWORD` | cuenta de prueba de conductor |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | cuenta de prueba de administración |

Sin cuentas de prueba, los ficheros de rol **se saltan con un motivo legible**
en vez de fabricar credenciales. Es deliberado: un usuario de conveniencia con
contraseña fija en el repositorio es una credencial en el repositorio, se llame
como se llame.

## Proyectos y viewports

La aplicación es móvil primero, así que los anchos reales del producto son la
referencia:

| Proyecto | Ancho | Motor | Qué ejecuta |
|---|---|---|---|
| `movil-360` | 360 | Chromium (Pixel 5) | todo menos administración |
| `movil-390` | 390 | WebKit (iPhone 12) | todo menos administración |
| `movil-430` | 430 | WebKit (iPhone 14 Pro Max) | todo menos administración |
| `escritorio-admin` | 1440 | Chromium | administración y humo |

El panel de administración es de escritorio por diseño, y por eso no se le
exige comportarse a 360 px.

## Dónde aparecen los informes

```
playwright-report/   informe HTML
test-results/        trazas, capturas y vídeos de lo que falló
```

Los dos están en `.gitignore`: pueden contener datos de las cuentas de prueba
y **no deben acabar en el repositorio**. La traza solo se guarda en el
reintento; la captura y el vídeo, solo si la prueba falla.

## Añadir una prueba nueva

Ponla en la carpeta de su rol (`e2e/passenger/`, `e2e/driver/`, …) y usa los
ayudantes que ya existen:

```js
import { test, expect } from '@playwright/test';
import { RUTAS, abrir } from '../helpers/appShell.js';
import { vigilarErrores } from '../helpers/pageErrors.js';

test('lo que tiene que pasar', async ({ page }) => {
  const errores = vigilarErrores(page);
  await abrir(page, RUTAS.inicio);

  await expect(page.getByRole('button', { name: 'Acceder' })).toBeVisible();

  expect(errores.graves()).toEqual([]);
});
```

Tres cosas que conviene respetar:

1. **`abrir()` en vez de `page.goto()`.** La pantalla de bienvenida tapa todo
   con `z-index: 2147483647` hasta que se retira; sin esperarla, los clics van
   contra ella.
2. **Selectores por rol, nombre accesible o texto visible.** `data-testid`
   solo si de verdad no hay otra forma, y nunca si cambia lo que ve una
   persona. Ojo: «Iniciar Sesión» es a la vez la pestaña y el botón de enviar,
   así que para las pestañas están `PESTANA_ENTRAR` y `PESTANA_REGISTRARSE`.
3. **`vigilarErrores` en toda prueba de pantalla.** Una excepción durante el
   montaje deja la pantalla a medio pintar sin que ninguna aserción de
   contenido lo note. Ya pasó en este proyecto.

Si una prueba necesita sesión, usa `entrarComo(page, rol)` y sáltate la prueba
cuando no haya cuenta — nunca inventes una.

## Ruido de consola tolerado

`e2e/helpers/pageErrors.js` enumera el ruido que **no** hace fallar una prueba,
y cada entrada dice por qué. Antes de añadir una excepción nueva hay que
investigar el mensaje: una lista de excepciones sin explicación acaba tapando
defectos de verdad.

Lo que nunca se tolera es una excepción no capturada (`pageerror`).
