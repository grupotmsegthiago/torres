---
name: Mobile GPS gate (use-geolocation)
description: Por que o gate de GPS do app mobile não pode auto-disparar getCurrentPosition no primeiro acesso.
---

# Gate de GPS do app mobile

O `useGeolocation` (consumido só por `client/src/components/mobile/layout.tsx`) bloqueia todo o app mobile enquanto `!position`. Regras que evitam o bug "tela piscando buscando GPS e travada":

- **Nunca auto-disparar `getCurrentPosition` sem gesto do usuário** no primeiro acesso (permissão `"prompt"` OU navegador sem Permissions API, ex.: iOS Safari). Auto-disparo liga o spinner sem gesto; com `enableHighAccuracy`+`maximumAge:0` o GPS dá timeout indoor; e o `visibilitychange` redisparava em loop → spinner pisca.
  **Como aplicar:** só chamar `captureOnce()` automaticamente quando a permissão já está `"granted"`. Em `"prompt"`/sem-API, mostrar a tela "Habilitar Localização" e esperar o toque (o gesto força o prompt nativo via `requestPermission`).
- **Resume (`visibilitychange`) só re-captura após permissão confirmada.** Usar um ref (`grantedRef`) que vira `true` só depois de `sendLocation`/`state==='granted'` e volta a `false` em `PERMISSION_DENIED`. Não usar `!permRef || granted` (em browsers sem Permissions API `permRef` é null → re-capturava indevidamente).
  **Why:** sem Permissions API o resume voltava a piscar.
- **`bootstrapping`**: enquanto o status inicial de permissão não resolve, manter a UI em loading (`loading || bootstrapping`) — senão quem já concedeu vê um flash do botão "Habilitar Localização" antes do auto-capture.
- **Fallback de baixa precisão**: se a alta precisão falhar por timeout/indisponível (NÃO por permissão negada), refazer com `enableHighAccuracy:false` (rede) pra não travar "buscando GPS".
- **Captura é one-shot** (mount + resume), NUNCA `watchPosition`/`setInterval` — isso saturava o Supabase com POSTs `/api/agent/location`. `MIN_RESEND_MS` (30s) evita POST duplicado.
