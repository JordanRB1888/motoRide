# 001 — Centralize Motion Tokens and Easing Curves

- **Status**: TODO
- **Commit**: d8f6a44
- **Severity**: MEDIUM
- **Category**: Cohesion & Tokens
- **Estimated scope**: 1 file (`mobile/ui/movimiento.ts`)

## Problem

`mobile/ui/movimiento.ts:1-29` currently only exports `useMovimientoReducido()`. There are zero shared animation tokens for curves, durations, or spring configs in the mobile application. Different components duplicate arbitrary easings like `Easing.inOut(Easing.ease)` and `Easing.out(Easing.ease)`, violating cohesion rules.

```typescript
/* mobile/ui/movimiento.ts:15 — current */
export function useMovimientoReducido(): boolean {
  const [quieto, setQuieto] = useState(false);
  // ...
  return quieto;
}
```

## Target

Export standardized, physics-based curves and duration budgets in `mobile/ui/movimiento.ts` adhering strictly to AUDIT.md:
- `curvaUI.easeOut`: `Easing.bezier(0.23, 1, 0.32, 1)` (strong ease-out for UI)
- `curvaUI.easeInOut`: `Easing.bezier(0.77, 0, 0.175, 1)` (strong ease-in-out for on-screen movement)
- `curvaUI.fluido`: `Easing.bezier(0.16, 1, 0.3, 1)` (fluid natural easing)
- `duracionUI.rapida`: `140` ms (press feedback & micro-interactions)
- `duracionUI.estandar`: `220` ms (dropdowns, sheet transitions)
- `duracionUI.pausada`: `300` ms (modal sheets & reveals)
- `resorteUI.suave`: `{ damping: 18, stiffness: 220, mass: 0.8 }`

```typescript
/* target */
import { Easing } from 'react-native';

export const curvaUI = Object.freeze({
  easeOut: Easing.bezier(0.23, 1, 0.32, 1),
  easeInOut: Easing.bezier(0.77, 0, 0.175, 1),
  fluido: Easing.bezier(0.16, 1, 0.3, 1)
});

export const duracionUI = Object.freeze({
  rapida: 140,
  estandar: 220,
  pausada: 300
});

export const resorteUI = Object.freeze({
  suave: Object.freeze({
    damping: 18,
    stiffness: 220,
    mass: 0.8
  })
});
```

## Repo conventions to follow

- Pure TypeScript exports in `mobile/ui/`.
- Zero new external dependencies.

## Steps

1. Edit `mobile/ui/movimiento.ts` to import `Easing` from `'react-native'`.
2. Add frozen objects `curvaUI`, `duracionUI`, and `resorteUI`.
3. Export them alongside `useMovimientoReducido`.

## Boundaries

- Do NOT modify `useMovimientoReducido()` behavior.
- Do NOT touch other components in this plan.

## Verification

- **Mechanical**: `npm run mobile:typecheck` and `npm run mobile:test`.
- **Done when**: `curvaUI`, `duracionUI`, and `resorteUI` are available and strongly typed.
