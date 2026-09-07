# Animation Improvement Plans (+58Express Mobile)

Based on the animation audit conducted under `/improve-animations`.

| Plan | Title | Severity | Category | Status |
| :--- | :--- | :--- | :--- | :--- |
| [001](001-motion-tokens-and-curves.md) | Centralize Motion Tokens and Easing Curves | MEDIUM | Cohesion & Tokens | DONE |
| [002](002-press-feedback-service-cards.md) | Asymmetric Physical Press Feedback on Service Cards | HIGH | Physicality & Origin | DONE |
| [003](003-spring-disc-pedir.md) | Continuous Physics Spring on Floating Central Disc «Pedir» | HIGH | Interruptibility | DONE |
| [004](004-exhaust-smoke-easing.md) | Fluid Dissipation Easing for Exhaust Smoke | MEDIUM | Easing & Duration | DONE |

## Execution Summary

1. **001 (DONE)**: Foundation motion tokens and curves created in `mobile/ui/movimiento.ts` (`curvaUI`, `duracionUI`, `resorteUI`).
2. **002 (DONE)**: Tactile depression feedback implemented on `CasillaAncha` (`scale: 0.98`) and `Casilla` (`scale: 0.965`) in `mobile/preview/pantallaInicioPasajera.tsx`.
3. **003 (DONE)**: Tactile spring bounce (`speed: 18`, `bounciness: 8`) applied to central FAB «Pedir» and availability switch in `mobile/ui/Navegacion.tsx`.
4. **004 (DONE)**: Organic fluid dissipation bezier (`curvaUI.fluido`) applied to exhaust smoke (`Humo`) in `mobile/preview/pantallaInicioPasajera.tsx`.
