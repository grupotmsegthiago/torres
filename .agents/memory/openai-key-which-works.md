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

**How to apply:** Sempre preferir `AI_INTEGRATIONS_OPENAI_*` (com fallback pro legado via
`resolveOpenAIConfig()` em `server/lib/holerite-parse.ts`). Na **Vercel**, o gateway
`AI_INTEGRATIONS_OPENAI_BASE_URL` (Replit) costuma falhar com `Connection error` — configure
`OPENAI_API_KEY` (API OpenAI direta) conforme `DEPLOY.md`. O OCR de holerite PDF layout Torres
usa parser determinístico e **não chama OpenAI** quando o texto é legível.

As envs `AI_INTEGRATIONS_*` só existem dentro do processo do workflow — scripts `.local/test_*.mts`
no shell NÃO as enxergam. Leitura via `supabaseAdmin` funciona no shell (SUPABASE_* presentes).
