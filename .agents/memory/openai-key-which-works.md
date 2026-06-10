---
name: Qual chave OpenAI funciona no projeto
description: Acesso à OpenAI no ERP é via gateway da integração Replit, não pela var legada OPENAI_API_KEY.
---

# Acesso à OpenAI: usar o gateway da integração Replit

Para qualquer chamada OpenAI nova no projeto, instanciar o client assim:

```ts
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
const openai = new OpenAI({ apiKey, baseURL });
```

**Why:** `OPENAI_API_KEY` (var legada) **NÃO está setada** neste ambiente — nem no shell nem no
processo do workflow. O que existe e funciona é o par injetado pela integração
`javascript_openai_ai_integrations`: `AI_INTEGRATIONS_OPENAI_API_KEY` +
`AI_INTEGRATIONS_OPENAI_BASE_URL`. `server/lib/correct-text-ai.ts` ainda usa só
`OPENAI_API_KEY` e por isso cai no "ausente"/skip; as rotas de OCR/IA em `routes.ts` já
usam o par `AI_INTEGRATIONS_*` corretamente.

**How to apply:** Sempre preferir `AI_INTEGRATIONS_OPENAI_*` (com fallback pro legado). As envs
`AI_INTEGRATIONS_*` só existem dentro do processo do workflow/prod — scripts `.local/test_*.mts`
rodados via `npx tsx` no shell NÃO as enxergam, então a geração via OpenAI só dá pra testar de
ponta a ponta dentro do workflow (esperar o timer ou bater na rota), não por script avulso. Leitura
de tabela via `supabaseAdmin` funciona no shell (SUPABASE_* estão presentes).
