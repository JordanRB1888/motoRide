# Ramas eliminadas en la consolidación — 18 de septiembre de 2026

Todas estaban **íntegramente dentro de `main`** (`git rev-list --count main..rama` = 0).
Sus commits siguen en `main`: no se perdió nada, sólo la etiqueta.

Para resucitar cualquiera:

```bash
git branch <nombre> <sha>
```

| Rama | SHA | Último commit |
|---|---|---|
| `backup/visual-complete-1-before-restore` | `8c906c5` | feat(visual): portar las siete pantallas que faltaban y au |
| `checkpoint/frontend-modern-ui` | `2a8c2a8` | fix: preserve theme preference in modern production UI |
| `codex/restore-approved-ui-phase-2b2` | `91e7764` | fix: scope passenger trip photo to its trip and driver |
| `deploy/legacy-payout-gate` | `20a97db` | fix: disable unsafe legacy payouts by default |
| `feat/backend-arch-1` | `8186fb6` | feat: establish incremental NestJS backend foundation |
| `feat/dispatch-2a-road-eta` | `ea36694` | chore: blindar .gitignore para el respaldo oficial |
| `feat/fx-bcv-1` | `c027d60` | fix: harden FX test database guard and preserve BCV revisi |
| `feat/gps-1-location-quality` | `4b508e5` | feat(gps): improve location quality and stability |
| `feat/maps-2a-canonical-places` | `1555874` | feat(maps): add canonical place search foundation |
| `feat/maps-2b-routes-foundation` | `e36026f` | feat(maps): add Google Routes navigation foundation |
| `feat/maps-2c-in-app-navigation` | `3ba8bc6` | feat(maps): add in-app driver navigation |
| `feat/mobile-native-1` | `4fdfaec` | feat: establish Expo React Native mobile foundation |
| `feat/mobile-wave-1-auth` | `290a003` | feat: connect native mobile authentication and secure sess |
| `feat/offline-trip-1a` | `90aff68` | feat(trips): add offline transition foundation |
| `feat/public-testing` | `26511c9` | fix(push): el aviso de carrera prometia quince segundos y  |
| `feat/qa-foundation-1` | `51017aa` | feat: establish Playwright E2E QA foundation |
| `feat/safe-transport-1b` | `c3075c3` | feat(safe-transport): add recurring transport data foundat |
| `feat/safe-transport-1c` | `a86b141` | feat(safe-transport): add recurring subscription backend |
| `feat/safe-transport-1d` | `2a66bd9` | feat(safe-transport): add driver coverage commitments |
| `feat/safe-transport-1e` | `ad5d830` | feat(safe-transport): bridge scheduled rides to trips |
| `feat/safe-transport-1f` | `68b9be1` | chore: trigger vercel deploy after repo visibility change |
| `feat/safe-transport-1g` | `b6e1514` | feat(safe-transport): animate the passenger entry card |
| `feat/safe-transport-2a` | `95e89e0` | fix(safe-transport): fix the plan screen hierarchy and tru |
| `feat/typescript-1` | `cb1aefd` | feat: establish incremental TypeScript foundation |
| `feat/visual-preview-1` | `d77cf31` | feat: create premium mobile visual preview |
| `feat/wallet-payouts-1` | `fa0a993` | chore: add production smoke test for the legacy payout gat |
| `feature/google-maps-1` | `2044fdf` | feat(maps): integrar el cliente de Google Maps con respald |
| `feature/push-1-foundation` | `0f6f1a1` | feat(push): instalar los cimientos de las suscripciones |
| `feature/push-2-client-subscription` | `20c48b2` | fix(push): que la reconciliacion cure el hueco de la fase  |
| `feature/push-3a-dispatch-attention` | `32977bf` | feat(push): avisar por push la oferta de carrera como mejo |
| `feature/push-4a-real-sender` | `a6528f5` | feat(push): anadir el emisor real de web push |
| `fix/db-startup-resilience-1` | `4ca0629` | fix(db): tolerate transient startup connection failures |
| `fix/foto-1-passenger-photo` | `133fcfe` | fix(driver): render authenticated passenger photo |
| `fix/gps-0-driver-location-safety` | `ff13c0b` | fix(gps): prevent false driver location fallback |
| `fix/map-tiles-provider` | `120a514` | fix(maps): sustituir las teselas de CARTO por OpenStreetMa |
| `fix/offline-1b-sync-ux` | `0fa1f65` | fix(driver): keep offline sync status visible |
| `fix/presets-1-destination-corrections` | `fa4916d` | fix(maps): correct verified destination presets |
| `fix/service-worker-cache-v11` | `82492f9` | fix: complete service worker cache isolation |
| `hotfix/auth-rate-limit-separation` | `a05a804` | fix(auth): restaurar el techo previo a la autenticacion en |
| `integration/canonical-production-ui` | `9d03153` | feat(admin): dar cuerpo al modo claro y funcion a la tarje |
| `stabilization/phase-1-backend` | `53bf3de` | fix: harden ride acceptance and canonicalise trip broadcas |
| `stabilization/phase-2a-data-minimization` | `45864cf` | test: make trip integrity verification reproducible |
| `stabilization/phase-2b1-driver-documents-clean` | `3cfe2ba` | fix: close private document viewer lifecycle gaps |
| `stabilization/phase-2b2-1-private-photos` | `ad02afe` | style: drop trailing whitespace on rewritten photo tags |
| `stabilization/phase-2b2-2-local-avatars` | `263ee15` | fix: leave a single local avatar in the assigned driver ca |
| `stabilization/phase-2b2-3-client-image-hygiene` | `4a9d6e7` | fix: accept only the backend's raster data URLs in chat |
| `stabilization/phase-2b2-4b-chat-media` | `9e33bfa` | test(chat-media): mover el bloque de puertos fuera del de  |
| `stabilization/phase-2b2-4c-chat-media-producer` | `105372e` | chore(respaldo): incorporar el trabajo suelto antes de mig |
| `stabilization/phase-3a-incremental-persistence` | `f7100d5` | test: catch port blocks written without spaces |
| `ui/final-visual-design-system` | `2bc9781` | fix(ui): keep the schedule confirm icon on the documented  |
| `ui/login-antigravity-preservation` | `d0a54d9` | test(ui): exigir que el cierre del login sea terminal |
| `workspace/current-production` | `59544f8` | security(db): admitir un certificado raiz verificado en Po |
