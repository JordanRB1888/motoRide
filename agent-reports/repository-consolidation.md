# Consolidación del repositorio — +58Express

**Estado: INVENTARIO Y RESCATE COMPLETOS · INTEGRACIÓN PENDIENTE DE DECISIONES**

Fecha de la auditoría: 18 de septiembre de 2026.
Este documento se escribe **antes** de integrar nada, que es cuando sirve.

---

## 1 · Punto de partida

| | |
|---|---|
| Rama canónica hoy | **`master`** — `e6cb218` |
| ¿Existe `main`? | **No.** No hay ninguna rama con ese nombre, ni local ni remota |
| Default del remoto | `origin/HEAD → origin/master` |
| Ramas locales | **74** |
| Ramas remotas | 73 |
| Worktrees | **15** |
| Stashes | 1 |
| Tags previos | 3 |

## 2 · Respaldos creados antes de tocar nada

| Tag | SHA | Qué protege |
|---|---|---|
| `pre-consolidation-2026-09` | `e6cb218` | El `master` de partida |
| `pre-consolidation-documentos-fix` | `e9cc96a` | El fix de Documentos, los dos commits |

Los tres tags que ya existían —`pre-launch-backup-2026-08-27`,
`respaldo/antes-dependency-unblock-1`,
`respaldo/master-antes-de-fusionar-2026-09-07`— se conservan.

## 3 · El hallazgo que cambia el tamaño del problema

**De las 74 ramas locales, sólo 13 tienen commits que no estén ya en `master`.**
Las otras 61 están fusionadas: no hay nada que rescatar en ellas.

| Rama | Commits fuera de master | Último |
|---|---|---|
| `feat/public-marketing-site` | **71** | 2026-09-17 |
| `feat/driver-finance-1` | 12 | 2026-08-30 |
| `infra/supabase-postgres-integration` | 8 | 2026-08-22 |
| `infra/supabase-postgres-migration` | 4 | 2026-08-22 |
| `stabilization/phase-2b2-4a-chat-media-infrastructure` | 3 | 2026-08-14 |
| `stabilization/phase-2b1-driver-documents` | 3 | 2026-08-13 |
| `hotfix/realtime-driver-dispatch` | 3 | 2026-08-22 |
| `feature/google-maps-integration` | 3 | 2026-08-15 |
| `spike/navigation-sdk` | 2 | 2026-09-07 |
| **`fix/documentos-ping-pong`** | **2** | 2026-09-18 |
| `design/v2-concept-preview` | 1 | 2026-08-21 |
| `checkpoint/sentry-monitoring` | 1 | 2026-08-13 |
| `checkpoint/approved-mobility-interface` | 1 | 2026-08-13 |

`feat/public-marketing-site` son 71 commits porque es **la web pública que hoy
está en producción** en `mas58express.com`. No es trabajo abandonado: es el sitio
vivo, desplegado en Vercel.

## 4 · El tab bar amarillo — NO se había perdido

Éste era el encargo de arqueología, y la respuesta es que **no hay nada que
rescatar**.

| | |
|---|---|
| Componente | **`BATabBar`**, en `mobile/ui/Navegacion.tsx` |
| Commit de origen | **`c260710`** · 2026-09-07 · *«feat(pasajera): el trazo de BATabBar sustituye a la muesca en la barra»* |
| ¿Dónde está? | **Ya en `master`**, y también en `feat/public-testing`, `spike/navigation-sdk` y `fix/documentos-ping-pong` |
| Implementación | Reanimated: `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`. El propio fichero describe el efecto: *«el trazo sale del icono actual, cruza la barra y se enrolla alrededor del nuevo»* |

Se revisó además `01540f5` (2026-09-04, *«las pestañas dejan de deslizarse»*) por
si hubiera retirado el efecto a propósito. **No lo retiró**: ese commit quitó la
transición de pantalla del Stack entre pestañas —el «pasar página» que el dueño
rechazó—, no el trazo. Las dos cosas conviven, y el comentario de
`app/_layout.tsx` lo explica.

## 5 · Por qué el APK lo enseñaba y Metro no — causa demostrada

**No era una rama distinta, ni un SHA distinto, ni un bundle rancio, ni caché de
Gradle, Metro o Expo.** Era el emulador.

```
window_animation_scale       0
transition_animation_scale   0
```

El emulador tenía **las animaciones apagadas a nivel de sistema**. Reanimated lo
respeta y lo dice en voz alta; el aviso estaba en el log de Metro desde el primer
arranque y pasó desapercibido:

```
WARN [Reanimated] Reduced motion setting is enabled on this device.
     Some animations will be disabled by default.
```

Demostración, con el búfer de log limpio entre las dos medidas:

| Escalas de animación | Avisos de «Reduced motion» | Trazo |
|---|---|---|
| `0` | presentes | **no anima** |
| `1.0` | **0** | anima |

El APK anterior enseñaba la animación porque corrió en un dispositivo sin ese
ajuste. El código es el mismo.

> Queda una consecuencia de producto que conviene decidir aparte: hoy, a quien
> tenga «quitar animaciones» activado en su teléfono —un ajuste de
> accesibilidad, y también un truco común para ahorrar batería en gama baja— el
> trazo no se le mueve. Eso puede ser lo correcto o no serlo, pero es una
> decisión de diseño, no un fallo.

## 6 · El fix de Documentos

| Commit | Ficheros | Estado |
|---|---|---|
| `937a1bb` | `theme/TemaDeNavegacion.tsx`, `app/_layout.tsx` | En `fix/documentos-ping-pong`, respaldado por tag |
| `e9cc96a` | `app/postulacion/documentos.tsx`, `test/pingPongDePostulacion.test.mjs` | Ídem |

Ninguno de los cuatro ficheros ha sido tocado en `master` desde el punto del que
parte la rama: **la integración aplica limpia, sin conflictos**.

---

## 7 · Lo que falta, y por qué no lo he hecho todavía

El inventario, los respaldos y las dos investigaciones están cerrados. La
integración no, y no por falta de tiempo: hay tres decisiones que no me
corresponden.

**a) No existe `main`.** Crearla es trivial; cambiar la rama por omisión del
repositorio no lo es. `feat/public-marketing-site` es el sitio **en producción**
y Vercel despliega desde este repositorio. Cambiar la default sin auditar antes
GitHub, Vercel, Railway y EAS puede dejar la web sin desplegar y romper hooks. La
fase 18 del encargo lo dice: auditar primero.

**b) `feat/public-marketing-site` son 71 commits de un sitio vivo.** Fusionarlo a
`master` es correcto, pero es el cambio más grande de toda la consolidación y
merece ir solo, no arrastrado dentro de otros doce.

**c) Hay cuatro ramas de infraestructura de agosto** —las dos de Supabase, el
hotfix de despacho y Google Maps— que tocan backend y base de datos. Ahí puede
haber implementaciones válidas en conflicto (clase D del encargo), y eso se
resuelve mirando cuál se quiere conservar, no fusionando a ciegas.

### Orden que propongo

1. Crear `main` desde `master` **sin** cambiar todavía la default.
2. Integrar `fix/documentos-ping-pong` (limpio, sin conflictos).
3. Integrar `feat/public-marketing-site`, verificando que producción sigue
   desplegando.
4. Revisar una a una las nueve ramas de agosto, clasificándolas.
5. Auditar GitHub/Vercel/Railway/EAS y sólo entonces mover la default.
6. Compilar debug y release del mismo SHA, con la metadata de trazabilidad de la
   fase 15.
7. Limpiar ramas, **sólo** las demostradamente fusionadas.
