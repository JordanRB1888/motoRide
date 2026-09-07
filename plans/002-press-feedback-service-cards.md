# 002 — Asymmetric Physical Press Feedback on Service Cards

- **Status**: TODO
- **Commit**: d8f6a44
- **Severity**: HIGH
- **Category**: Physicality & Origin
- **Estimated scope**: 1 file (`mobile/preview/pantallaInicioPasajera.tsx`)

## Problem

In `mobile/preview/pantallaInicioPasajera.tsx:294-332` (`CasillaAncha`) and `lines 390-426` (`Casilla`), service cards are wrapped in `<Pressable>` with static style objects. When the passenger taps "Viajes" or any service (Comercios, Transporte Seguro, Envíos, etc.), there is zero tactile feedback or physical depression. The UI feels unresponsive and dead.

```typescript
/* mobile/preview/pantallaInicioPasajera.tsx:298 — current */
style={{
  width: '100%',
  minHeight: 96,
  // ...
}}
```

## Target

Introduce physical, asymmetric press feedback:
- On `:active` / `pressed`: scale smoothly to `0.98` (for the wide card) and `0.965` (for the compact 2-column tiles) with subtle dimming (`opacity: 0.92`).
- Respect reduced motion: if `quieto` is active, retain opacity change only, without scaling.
- Smooth spring release using React Native `Pressable` style callback function: `({ pressed }) => ({ ... })`.

```typescript
/* target */
style={({ pressed }) => ({
  width: '100%',
  minHeight: 96,
  // ...
  opacity: pressed ? 0.92 : 1,
  transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]
})}
```

## Repo conventions to follow

- Uses `({ pressed }) => ({ ... })` pattern already present in `mobile/ui/Trayecto.tsx:350` and `mobile/app/acceso.tsx:361`.

## Steps

1. In `mobile/preview/pantallaInicioPasajera.tsx`, read `useMovimientoReducido()` inside `CasillaAncha` and `Casilla`.
2. Update the `style` prop of `<Pressable>` in `CasillaAncha` to a function taking `{ pressed }` and applying `transform: [{ scale: pressed && !quieto ? 0.98 : 1 }]` and `opacity: pressed ? 0.92 : 1`.
3. Update the `style` prop of `<Pressable>` in `Casilla` to a function taking `{ pressed }` and applying `transform: [{ scale: pressed && !quieto ? 0.965 : 1 }]` and `opacity: (dato.listo ? (pressed ? 0.88 : 1) : 0.62)`.

## Boundaries

- Do NOT alter navigation or intent logic.
- Do NOT touch `RotuloPronto`, `Humo`, or `Cabecera`.

## Verification

- **Mechanical**: `npm run mobile:typecheck` and `npm run mobile:test`.
- **Feel check**: Press and hold "Viajes" and grid cards: confirm noticeable, crisp tactile depression; release and confirm instant, crisp bounce back.
- **Done when**: Every service card provides immediate, physical feedback when tapped.
