---
name: Testes de integração no build do publish
description: prebuild roda npm test no ambiente de build do deploy, onde a rede até o Supabase é lenta/instável — testes de integração devem pular, não falhar
---

O `prebuild` roda `npm test` também dentro do ambiente de build do publish (Cloud Run builder). Lá a rede até o Supabase é lenta/instável (inserts de 9s+, AbortError), então testes de integração que batem no Supabase real podem derrubar o deploy sem haver bug.

**Why:** deploy de 20/07/2026 falhou só por timeout de rede em `driver-control-auth.test.mts`; localmente a suíte passava 504/504.

**How to apply:** todo novo teste `.test.mts` que fala com o Supabase real deve fazer um probe rápido (query leve com `Promise.race` + timeout ~5s) e usar `{ skip: msg }` quando o probe falhar (ver padrão em `server/routes/driver-control-auth.test.mts`). Testes puros/unitários não precisam. Diagnóstico de build failure: `listDeploymentBuilds` + `getDeploymentBuild(buildId)` — o erro fica no fim dos logs.
