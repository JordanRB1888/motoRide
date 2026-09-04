# 003 — Continuous Physics Spring on Floating Central Disc «Pedir»

- **Status**: TODO
- **Commit**: d8f6a44
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 1 file (`mobile/ui/Navegacion.tsx`)

## Problem

In `mobile/ui/Navegacion.tsx:327`, the prominent floating yellow button «Pedir» (and in line 273 `ControlDeDisponibilidad`) uses a hardcoded binary scale jump: `transform: [{ scale: pressed ? 0.94 : 1 }]`. When tapped rapidly or released mid-gesture, the scale snaps instantly without fluid momentum, dropping the illusion of a physical floating suspension.

```typescript
/* mobile/ui/Navegacion.tsx:327 — current */
style={({ pressed }) => ({
  alignItems: 'center',
  gap: AIRE_DEL_ROTULO,
  marginTop: -SALIENTE,
  transform: [{ scale: pressed ? 0.94 : 1 }]
})}
```

## Target

Drive button depression and release with an `Animated.Value` spring (`resorte`):
- When pressed in: animated timing or spring to `0.92` (100ms, crisp).
- When released: spring bounce to `1.0` (`bounciness: 8`, `speed: 16`), feeling like an authentic tactile suspension switch.
- Respect `useMovimientoReducido`: snap instantly without bounce if reduced motion is requested.

## Repo conventions to follow

- Existing `Animated.Value` usage in `Navegacion.tsx` (`latido`, `flote`).

## Steps

1. In `ControlDePedido` and `ControlDeDisponibilidad` in `mobile/ui/Navegacion.tsx`, add an `Animated.Value` for press compression (`escalaPulsacion = useRef(new Animated.Value(1)).current`).
2. Implement `onPressIn` and `onPressOut` handlers using `Animated.spring` with native driver.
3. Wrap the container in `Animated.View` applying `transform: [{ scale: escalaPulsacion }]`.

## Boundaries

- Do NOT alter button sizing (`DIAMETRO = 56`), `SALIENTE = 34`, or cutout notch dimensions.
- Do NOT change navigation dispatch logic.

## Verification

- **Mechanical**: `npm run mobile:typecheck` and `npm run mobile:test`.
- **Feel check**: Rapidly tap the «Pedir» button; verify smooth spring feedback with no dropped frames or hard visual clipping.
- **Done when**: The «Pedir» FAB depresses and springs back with realistic momentum.
