# 004 — Fluid Dissipation Easing for Exhaust Smoke

- **Status**: TODO
- **Commit**: d8f6a44
- **Severity**: MEDIUM
- **Category**: Easing & Duration
- **Estimated scope**: 1 file (`mobile/preview/pantallaInicioPasajera.tsx`)

## Problem

In `mobile/preview/pantallaInicioPasajera.tsx:247`, each exhaust puff (`Voluta`) animates using `Easing.out(Easing.ease)` across a flat 2800ms timeline:

```typescript
/* mobile/preview/pantallaInicioPasajera.tsx:247 — current */
Animated.timing(valor, { toValue: 1, duration: 2800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
```

`Easing.out(Easing.ease)` is a weak generic easing curve. Real smoke dissipation accelerates rapidly as it leaves the exhaust pipe and decelerates organically as it disperses into ambient air.

## Target

Use a fluid cubic-bezier curve (`curvaUI.fluido` / `Easing.bezier(0.16, 1, 0.3, 1)`) with optimized dissipation timing (2400ms) and staggered scale expansion (`scale: [0.4, 2.6]`).

## Repo conventions to follow

- Consume `curvaUI` from `mobile/ui/movimiento.ts`.

## Steps

1. In `mobile/preview/pantallaInicioPasajera.tsx`, import `curvaUI` from `'../ui/movimiento'`.
2. Replace `Easing.out(Easing.ease)` with `curvaUI.fluido` in `Voluta`.
3. Adjust duration to `2400ms` and delays accordingly.

## Boundaries

- Do NOT change smoke positioning relative to the motorcycle graphic.
- Preserve full unmount when `quieto` is true.

## Verification

- **Mechanical**: `npm run mobile:typecheck` and `npm run mobile:test`.
- **Feel check**: Observe the exhaust puffs behind the motorcycle: they emerge briskly and disperse softly with organic air friction.
- **Done when**: Smoke dissipation feels organic and fluid.
