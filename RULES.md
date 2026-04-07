# RULES.md — DIRETRIZES IMUTÁVEIS DO SISTEMA TORRES SEGURANÇA

Este arquivo deve ser consultado ANTES de qualquer tarefa no projeto.

---

## 1. Timezone Obrigatório

O sistema opera EXCLUSIVAMENTE em America/Sao_Paulo (UTC-3).

- Datas são armazenadas no Supabase SEM sufixo de timezone. Elas representam horários UTC.
- No frontend, SEMPRE usar `ensureUTC(dateString)` antes de `new Date()` para garantir interpretação correta.
- Toda exibição de horário (Grid, DRE, Chat, OS, Relatórios) DEVE usar `timeZone: "America/Sao_Paulo"`.
- No backend, `process.env.TZ = "America/Sao_Paulo"` já está configurado em `server/index.ts`.
- No backend, usar `(NOW() AT TIME ZONE 'UTC')::timestamp` em RPCs do Supabase.
- NUNCA exibir horário sem `timeZone: "America/Sao_Paulo"` no `toLocaleTimeString` / `toLocaleDateString`.
- NUNCA usar `new Date(dateString)` sem `ensureUTC()` em cálculos de "tempo atrás" (há X min), pois causa offset de 3h.
- Qualquer nova data inserida no sistema DEVE ser tratada como Brasília (UTC-3).

```typescript
// CORRETO
function ensureUTC(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const s = String(ts);
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  return s + "Z";
}
const sd = new Date(ensureUTC(scheduledDate)!);
const timeStr = sd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// PROIBIDO
const sd = new Date(scheduledDate); // sem ensureUTC — causa offset de 3h
```

---

## 2. Persistência no Supabase

- Nenhuma lógica de cálculo (Receita/Custo) deve ser feita apenas no frontend.
- Todo dado deve ser persistido e lido do banco de dados para evitar valores zerados ou "fantasmas" no Grid.
- O campo de custos reais (`mission_costs`) só pode ter valor > 0 para uma OS se houver um registro vinculado na tabela `mission_costs`, `fuel_logs` ou `toll_logs` para aquela OS específica.
- Para missões com status `agendada` ou `aberta` (não iniciadas), NÃO alocar custos estimados de combustível, pedágio ou veículo vazio. Somente custos reais (registros em `mission_costs`) são exibidos.
- A query de `vehicleFuelCache` DEVE sempre filtrar por data (hoje) para nunca puxar registros históricos.

---

## 3. Proibição de Alteração Global

Está PROIBIDO modificar sem autorização explícita:
- Arquivos de configuração de banco (`supabase.ts`, `db.ts`)
- Rotas de autenticação (`auth.ts`)
- Temas visuais ou cores do sistema
- Tipos de colunas de ID (serial ↔ varchar)
- Variáveis de ambiente ou secrets

---

## 4. Preservação de Identidade

- O logotipo da Torres Segurança e as cores do tema escuro são permanentes.
- Não substituir por padrões do Replit ou templates genéricos.
- Manter a identidade visual consistente em todas as telas.

---

## 5. Verificação Pré-Commit

Antes de cada alteração, validar que:
- A nova função não quebra o fuso horário (usa ensureUTC + timeZone: "America/Sao_Paulo")
- Não apaga dados de custo real das OS
- Não aloca custos fantasmas para missões não iniciadas
- Toda chamada de API usa `authFetch` (nunca `fetch` direto)
- Dados sensíveis (senhas, tokens) nunca são expostos no frontend

---

## 6. Regras de Custo de Abastecimento

- Custos de combustível só podem aparecer no Grid se:
  1. Existir um registro em `mission_costs` vinculado à OS, OU
  2. Existir um registro em `financial_transactions` com `origin_type = "fueling"` datado de HOJE com a placa do veículo na descrição
- NUNCA puxar registros de abastecimento de dias anteriores para o Grid de hoje
- Para veículos com múltiplas OS no dia, o custo de combustível é alocado apenas na PRIMEIRA OS (via `vehicleFuelFirstOS`)
- Missões com status `agendada` ou `aberta` NUNCA recebem custo estimado de combustível

---

## 7. Acesso a Dados

- TODA operação de dados usa Supabase (`supabaseAdmin` no backend, `supabase` no frontend)
- `db.ts` usa `SUPABASE_DATABASE_URL` — NUNCA PostgreSQL local
- Chamadas de API no frontend usam `authFetch` de `@/lib/queryClient`
- `escort_contracts` é a tabela de preços dos contratos (valor_acionamento, franquia_km, valor_km_carregado, etc.)
