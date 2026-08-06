# 05 — Segurança (riscos conhecidos)

**Natureza:** normativo quanto à priorização e regras; descritivo quanto ao estado atual
**Atualização:** C1 (Inter) mitigado na PR1 de desativação; C2/C3 e demais ainda abertos.
**Não inclui secrets nem valores reais de chaves.**

Regras aplicáveis: Framework S1–S12 ([`02-FRAMEWORK-GOVERNANCA.md`](./02-FRAMEWORK-GOVERNANCA.md)).

---

## CRÍTICOS

### C1 — Webhook Banco Inter sem autenticação adequada

| Campo | Conteúdo |
|-------|----------|
| Evidência | `server/routes/inter.ts` — `POST /api/inter/webhook/cobranca` processava eventos e atualizava invoices/FT sem validação de token/assinatura |
| Impacto | Atacante poderia forjar confirmação de pagamento / criar lançamentos financeiros |
| Prioridade | P0 |
| Framework | S2, P9, Y1 |
| Mitigação PR1 | Integração **desativada por padrão** (`INTER_INTEGRATION_ENABLED`); webhook responde **410 Gone** sem mutar invoice/FT/eventos; escritas e crons bloqueados. Dados históricos `inter_*` e colunas invoice preservados. |
| Limpeza definitiva | Pendente PR2 (UI/código), PR3 (banco histórico), PR4 (envs) |
| Status | **MITIGADO (fail-closed / desativação)** — remoção completa ainda pendente |

### C2 — Webhook Z-API com token opcional

| Campo | Conteúdo |
|-------|----------|
| Evidência | `server/routes/whatsapp.ts` — se `ZAPI_TOKEN` existe mas o request não envia token, a requisição é aceita |
| Impacto | Injeção de mensagens, acionamento indevido de automações/IA |
| Prioridade | P0 |
| Framework | S2, P9 |
| Orientação futura | Token obrigatório quando configurado; rejeitar ausência |
| Status | **NÃO CORRIGIDO** |

### C3 — Tabela `users` com acesso permissivo

| Campo | Conteúdo |
|-------|----------|
| Evidência | Policies com `USING (true)` (`Acesso Total Emergencial`, `Acesso público aos perfis`); `anon` com privilégios excessivos; authenticated listava todos (incl. `plain_password`) |
| Impacto | Vazamento de perfis/roles/senhas via PostgREST com JWT autenticado |
| Prioridade | P0 |
| Framework | S3, S4 |
| Mitigação (código) | Migration `supabase/migrations/20260805164000_harden_users_rls.sql`: drop USING(true); revoke anon; authenticated possui SELECT somente nas colunas seguras + RLS own; `plain_password` nunca concedida; admin permanece via API+service_role |
| Aplicação DB | **APLICADA** em 2026-08-05 ~17:36 UTC no Supabase compartilhado (Preview=Prod); backup nativo 2026-08-05 07:59:48 UTC; verify + smoke OK (`docs/security/RUNBOOK-USERS-RLS.md`) |
| Status | **CORRIGIDO E HOMOLOGADO** |

**Camada adicional (D13):** PR1–PR3C concluídos (valores limpos; incidente documentado). **PR4A:** `plainPassword` removido de `shared/schema.ts` e tipos de aplicação; `sanitizeUserWrite`/`toSafeUser`/`USER_SAFE_SELECT` permanecem. **PR4B / 4.5B:** migration `20260805210000_drop_users_plain_password` + homologação PASS/FAIL versionadas — **ainda não aplicadas**; guards com `pg_depend`/procedures/rules (diagnóstico 4.5A: zero deps reais; cobertura reforçada; homologação estática OK). Coluna física ainda no banco. Status: **PR4B / 4.5B HOMOLOGAÇÃO ESTÁTICA OK — BASELINE DB PENDENTE — DROP AINDA NÃO APLICADO**. Backup nativo + SQL `homologate-drop-plain-password-baseline.sql` obrigatórios antes da aplicação. PR4C fará documentação final (D13 permanece aberta).

---

## ALTOS

### A1 — Webhook Asaas fail-open

| Campo | Conteúdo |
|-------|----------|
| Evidência | `server/asaas.ts` — webhook padrão pode aceitar se token e API key estiverem ausentes |
| Impacto | Atualização indevida de status de pagamento/NF |
| Prioridade | P1 |
| Framework | S2, P9 |
| Orientação futura | Fail-closed sem credencial; validar header sempre |
| Status | **NÃO CORRIGIDO** |

### A2 — View financeira SECURITY DEFINER

| Campo | Conteúdo |
|-------|----------|
| Evidência | Advisor Supabase: `public.v_resumo_financeiro` SECURITY DEFINER |
| Impacto | Bypass potencial de RLS do consultante |
| Prioridade | P1 |
| Framework | S5, B5 |
| Orientação futura | `security_invoker` ou restringir grants |
| Status | **NÃO CORRIGIDO** |

### A3 — Chave criptográfica com fallback hardcoded

| Campo | Conteúdo |
|-------|----------|
| Evidência | `server/lib/control-id-parsers.ts` — deriva AES de env ou literal conhecido |
| Impacto | Debilidade de criptografia de credenciais Control iD |
| Prioridade | P1 |
| Framework | S9 |
| Orientação futura | Exigir `CONTROLID_ENC_KEY` / secret forte; falhar boot se ausente |
| Status | **NÃO CORRIGIDO** |

### A4 — Ausência de proteção global adequada

| Campo | Conteúdo |
|-------|----------|
| Evidência | Sem Helmet/CSP/CORS global/rate limit genérico evidentes em `create-app.ts` / `vercel.json` (apenas cache headers) |
| Impacto | Superfície ampliada a XSS/clickjacking/abuso de API |
| Prioridade | P1 |
| Framework | S6, S7 |
| Orientação futura | Headers de segurança + rate limit em públicos e IA |
| Status | **NÃO CORRIGIDO** |

### A5 — Módulos desconectados referenciados pela UI

| Campo | Conteúdo |
|-------|----------|
| Evidência | UI/chamadas a `/api/gestor-medicao`, `/api/gestor-dados`, `/api/os-financeiro` sem `register*` em `routes.ts`; `/admin/consultas` linkado sem rota em `App.tsx` (estado auditado) |
| Impacto | Funcionalidade quebrada; falsa sensação de controle; risco ao “religar” sem gates |
| Prioridade | P1 |
| Framework | D4, A10, Artigo XI |
| Orientação futura | Registrar completo com testes **ou** remover links até admissão formal |
| Status | **NÃO CORRIGIDO** |

---

## MÉDIOS (amostra)

| ID | Tema | Framework | Status |
|----|------|-----------|--------|
| M1 | Busca interpolada em `.or()` (filter injection) | S8 | NÃO CORRIGIDO |
| M2 | CI sem `npm audit` / anon key no workflow | S11, D8 | NÃO CORRIGIDO |
| M3 | Auth cache stale em outagem Supabase | S1 | NÃO CORRIGIDO |
| M4 | Leaked password protection desabilitada (Auth) | S12 | NÃO CORRIGIDO |

---

## Nota

Correções destes itens **não fazem parte da Fase 1.0**.
Qualquer correção futura deve seguir Especificação Funcional + gates G1–G16 + testes de [`06`](./06-TESTES-E-VALIDACAO.md).
