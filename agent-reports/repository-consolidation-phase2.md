# Consolidación — Fase 2: integración real

**Estado: PARTIAL.** La integración está hecha y verificada. Faltan la
compilación desde `main` (fase 9), la metadata de trazabilidad (fase 8) y dos
decisiones que no me corresponden.

Fecha: 18 de septiembre de 2026. Continúa
[repository-consolidation.md](repository-consolidation.md).

---

## 1-2 · `main`

| | |
|---|---|
| SHA inicial | **`e6cb218`** — exactamente `master`, como se pidió |
| SHA actual | **`34dc76d`** |
| Remoto | Publicada como `origin/main` |
| Default del repo | **Sigue siendo `master`.** No se ha tocado `origin/HEAD` ni CI/CD |
| Worktree | `F:/proyectos app web/motoRide-main`, creado para no perturbar los demás |

## 3-4 · Integración del fix de Documentos

Fusionada `fix/documentos-ping-pong` con `--no-ff`. **Sin conflictos**: ninguno
de los cuatro ficheros se había tocado en `master` desde el punto de partida.

| Commit | Ficheros | Estado |
|---|---|---|
| **`937a1bb`** | `mobile/theme/TemaDeNavegacion.tsx`, `mobile/app/_layout.tsx` | **INTEGRADO** |
| **`e9cc96a`** | `mobile/app/postulacion/documentos.tsx`, `mobile/test/pingPongDePostulacion.test.mjs` | **INTEGRADO** |

Invariantes comprobadas sobre el árbol de `main`:

| | |
|---|---|
| Los cuatro ficheros presentes | ✔ |
| `<TemaDeNavegacion>` montado en `_layout` | ✔ 1 aparición |
| `fijarSolicitud(null)` antes de navegar | ✔ 1 aparición |
| `rgb(242,242,242)` como color en el código | ✔ **0** — las dos apariciones que quedan son los comentarios que documentan el fallo |
| Test `pingPongDePostulacion` | ✔ presente, 2/2 en verde |

## 5 · Web pública

Fusionada `feat/public-marketing-site` con `--no-ff`, **sin conflictos**.

- 72 commits, `merge-base` en `105372e4`.
- Toca **121 ficheros de `web/`, 15 de `agent-reports/` y 1 de `.claude/`**.
- **Cero ficheros compartidos** con `mobile/`, `server/`, `src/` o `supabase/`:
  no puede pisar el trabajo del móvil ni del backend.
- El único fichero relacionado con despliegues es `web/vercel.json`, que vive
  dentro del propio proyecto web. No hay configuración de raíz afectada.
- **No se ha cambiado la Production Branch de Vercel.**

## 6 · Conflictos encontrados

**Ninguno.** Las dos fusiones aplicaron limpias. No hizo falta `-X ours`,
`-X theirs` ni `reset --hard` en ningún momento.

## 7-8 · Las once ramas técnicas

Medido con `git cherry main <rama>` — `-` significa que el commit ya está en
`main` por identidad de parche, `+` que no.

| Rama | `+` | `-` | Clasificación |
|---|---|---|---|
| `infra/supabase-postgres-migration` | 0 | 4 | **SUPERSEDED** — íntegra en `main` |
| `stabilization/phase-2b1-driver-documents` | 0 | 3 | **SUPERSEDED** |
| `hotfix/realtime-driver-dispatch` | 0 | 3 | **SUPERSEDED** |
| `checkpoint/approved-mobility-interface` | 0 | 1 | **SUPERSEDED** |
| `infra/supabase-postgres-integration` | 1 | 7 | **SUPERSEDED** — ver abajo |
| `stabilization/phase-2b2-4a-chat-media-infrastructure` | 2 | 1 | **SUPERSEDED** — ver abajo |
| `feat/driver-finance-1` | 12 | 0 | **SUPERSEDED** por reescritura |
| `feature/google-maps-integration` | 3 | 0 | **SUPERSEDED** por reescritura |
| `checkpoint/sentry-monitoring` | 1 | 0 | **SUPERSEDED** por reescritura |
| `spike/navigation-sdk` | 2 | 0 | **EXPERIMENTAL** |
| `design/v2-concept-preview` | 1 | 0 | **EXPERIMENTAL** |

**Ninguna clasificada CONFLICT ni DANGEROUS. Ninguna KEEP.**

### Por qué «SUPERSEDED por reescritura» y no «KEEP»

`git cherry` las marca como ausentes porque sus parches concretos no están, pero
la funcionalidad sí. Comprobado sobre el árbol de `main`:

| Rama | Lo que traía | En `main` hoy |
|---|---|---|
| `checkpoint/sentry-monitoring` | Sentry en `server/` y `src/` | **9 ficheros** ya lo implementan |
| `feature/google-maps-integration` | Routes API en el servidor | **8 ficheros** ya lo implementan |
| `feat/driver-finance-1` | Finanzas del conductor | **33 ficheros** ya lo implementan |

### Los dos commits sueltos, verificados uno a uno

- **`eed9eab`** *«await critical postgres writes»* — el arreglo **ya está en
  `main`**: `chatMediaPipeline.js` tiene 1 `await persist*` y
  `driverApplications.js` tiene 6.
- **`ff007c8` + `569d4aa`** *chat media private storage / endpoint* — `main` ya
  trae `server/services/chatMediaStorage.js`, `chatMediaPipeline.js` y sus
  pruebas.

**Conclusión: no hay una sola funcionalidad sin recuperar en las once ramas.**

## 9 · TypeScript — BLOQUEADO, requiere decisión

`mobile/ui/CargandoDeMarca.tsx`, dos errores (líneas 122 y 133). Es una
**incompatibilidad de tipos de Reanimated**: `CSSAnimationProperties` no encaja
en el `style` de `Animated.View`. Curiosamente sólo falla en las dos llamadas a
`girar()`; `voltereta` y `latido`, del mismo fichero y del mismo tipo, sí tipan.

**No se ha tapado**, y por qué:

- `react-native-reanimated` **está en la versión que espera el SDK** — no es
  desalineación, así que no se arregla actualizando.
- Las salidas serían un `as` en los dos sitios —que es esconderlo— o subir
  Reanimated, que es decisión arquitectónica.

Hay además **10 paquetes de Expo por detrás** de lo que pide el SDK 57
(`expo@57.0.18` vs `~57.0.24`, `expo-router@57.0.17` vs `~57.0.22`, y ocho más).
Actualizarlos dentro de una consolidación sería meter una variable enorme en una
operación que hasta ahora no ha tenido ni un conflicto. **Queda documentado, sin
tocar.**

## 10 · Tests

| | |
|---|---|
| **Móvil** | **1213 en verde, 0 en rojo** |
| `jsonwebtoken` | **RESUELTO** |

La deuda era trivial y el diagnóstico lo confirmó: `jsonwebtoken@^9.0.2` **sí
estaba declarado** en `server/package.json` **y en el lockfile** — sencillamente
no estaba instalado en `server/node_modules`. Un `npm install` en `server/` (182
paquetes, 7 s) lo resolvió. **No hubo que tocar ni una línea de código**, y por
eso no hay commit: era el entorno, no el repositorio.

## 11-14 · Estado por área

| Área | Estado |
|---|---|
| **Web** | Integrada. Producción sirviendo desde `plus58express-9jnp6stl4`. No se ha recompilado desde `main` |
| **Backend** | En `main`; las cuatro ramas de infraestructura resultaron superseded. Dependencias ya instaladas |
| **Móvil** | Fix de Documentos integrado y verificado. 1213 pruebas en verde |
| **Admin** | Vive en `src/` (la aplicación Vite). Sin cambios en esta fase |

## 15-16 · Tab bar

Confirmado en la fase anterior y sin tocar nada:

| | |
|---|---|
| Fichero | `mobile/ui/Navegacion.tsx` — componente `BATabBar` |
| Commit | **`c260710`** · 2026-09-07 |
| Dónde | **Ya en `master`, y ahora en `main`** |

Causa real de que Metro no lo enseñara, **demostrada**:

```
window_animation_scale       0
transition_animation_scale   0
```

El emulador tenía las animaciones apagadas a nivel de sistema. Reanimated lo
respeta y lo avisaba en el log desde el primer arranque:
`[Reanimated] Reduced motion setting is enabled on this device`.

Verificación con el búfer de log limpio entre medidas:

| Escalas | Avisos | Trazo |
|---|---|---|
| `0` | presentes | no anima |
| **`1.0`** | **0** | anima |

**No se fuerza la animación** cuando el usuario tiene reducción de movimiento
activada: es un ajuste de accesibilidad y respetarlo es lo correcto.

## 17-19 · Metadata de build y APK — NO HECHO

Las fases 8 y 9 no se han ejecutado. La metadata de trazabilidad (SHA, versión,
fecha, tipo) es un cambio de código en el móvil, y compilar desde `main` exige
instalar `node_modules` completo en el worktree nuevo más una pasada de Gradle.
No hay, por tanto, ni SHA de Metro ni SHA de APK que comparar todavía.

**El último APK sigue siendo el de `C:/p58b`**, generado antes de la
consolidación, y por definición **no** corresponde al SHA de `main`.

## 20 · Auditoría de despliegues — el resultado tranquiliza

| Sistema | Rama actual | Rama deseada | Riesgo | Cambio necesario |
|---|---|---|---|---|
| **GitHub** | default `master` | `main` | **Bajo** | Cambiar default + `origin/HEAD` |
| **GitHub Actions** | — | — | **Ninguno** | **No hay workflows**: el directorio `.github/workflows` no existe |
| **Vercel** (`plus58express-web`) | **ninguna** | — | **Ninguno** | **Ninguno** |
| **Railway** | sin referencias en el repositorio | — | Por confirmar | Revisar en el panel |
| **EAS** | `eas.json` sin referencias a ramas | — | **Ninguno** | Ninguno |

El hallazgo que importa: **Vercel no despliega desde una rama.** Los despliegues
de producción se hacen por **CLI**, subiendo el directorio —aparecen a nombre de
un usuario, sin rama asociada—. Comprobado en `vercel list`: los dos últimos
despliegues de producción son subidas directas.

**Consecuencia: cambiar la rama por omisión a `main` no pone en riesgo la web.**
No hay Actions, no hay integración de git en Vercel y EAS no nombra ramas.

## 21 · Nada se ha borrado

Conforme a la fase 11: **cero** ramas, worktrees, tags o stashes eliminados.

- 76 ramas locales (las 74 de antes + `main` + `fix/documentos-ping-pong`).
- 16 worktrees (los 15 de antes + el de `main`).
- 5 tags, incluidos los dos de seguridad.
- 1 stash, intacto.

**No debe eliminarse todavía ninguna rama**, ni siquiera las once clasificadas
SUPERSEDED, hasta que se revise este informe.

## 22 · Decisiones que requieren aprobación

1. **TypeScript de `CargandoDeMarca.tsx`**: ¿un `as` acotado en las dos llamadas,
   documentado como hueco de tipos de la librería, o subir Reanimated/Expo? Lo
   segundo arrastra diez paquetes.
2. **Compilar desde `main`** (fases 8 y 9): instalar `node_modules` en el
   worktree nuevo, añadir la metadata de trazabilidad y generar debug + release.
   Es la parte más larga que queda.
3. **Cambiar la default a `main`**: la auditoría dice que el riesgo es bajo —no
   hay Actions ni integración de git en Vercel—, pero sigue siendo tu decisión.
