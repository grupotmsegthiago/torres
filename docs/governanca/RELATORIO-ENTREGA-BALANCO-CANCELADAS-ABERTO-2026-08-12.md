## Relatório de Entrega — Balanço: canceladas em “OSs em Aberto” com valor errado

**Data:** 2026-08-12  
**Branch:** `cursor/fix-balanco-canceladas-aberto-ea3f`  
**Ambiente validado:** [x] local (unit)  [ ] preview  [ ] produção  
**Publicou?** [x] Não

### Declaração de domínio
- **Domínio dono:** Balanço / Billing (KPI + snapshot `escort_billings`)
- **Tipo do dado:** RESULTADO (KPI) lendo SNAPSHOT (`escort_billings`) + PROJEÇÃO (grid canônico)
- **Camada:** 9 (indicadores) + 10 (cache SWR) — sem escrever fatos

### Reutilização (D11 / P13)
- Busca: `fatAberto`, `useBoletim`, `byMission`, `recusadaOsIds`, `TOR-0560`, `PAGE_SIZE`, `fetchAll`
- Existente aproveitado: padrão de paginação já usado em FTs no mesmo handler; regra §8.1b já em `balanco-gerencial` / `computeCanceladaBilling`; fix parcial `ebb54f14`
- Algo novo criado? [x] Sim — inviabilidade: lógica de receita estava inline sem teste; paginação estava duplicada e incompleta no dashboard. Extraídos `fetchAllSupabaseRows` e `resolveBalancoOsRevenue` (sem novo motor/API/tabela).

### Causa raiz (evidência)
1. `/api/financial/dashboard` lia `escort_billings` **sem paginação**, `order data_missao ASC` → PostgREST devolve só as **1000 mais antigas**.
2. Canceladas recentes (ex. TOR-0560) **sumiam do `byMission`**.
3. Balanço caía no `liveFat` canônico (contrato cheio) → ~R$ 4.340 em vez de R$ 767,83 (tabela 100 km do boletim).
4. Como `useBoletim` ficava falso, `is_frozen=false` → OS cancelada aparecia em **“OSs em Aberto”**.
5. O Boletim lia `/api/escort/billings` em **DESC** (também limitado a 1000) → recentes ok → telas divergiam apesar do mapeamento de regras.

### O que foi alterado
- Paginação de billings, FTs e invoices no financial-dashboard
- Paginação da lista `/api/escort/billings`
- Cache key `financial-dashboard-v2` + bust da v1/v2
- Fail-closed: cancelada sem snapshot **não** usa canônico; não entra em “em aberto” com valor inflado
- Testes unitários da paginação e da resolução de receita

### O que NÃO foi alterado
- Motor `calcularEscolta` / `computeCanceladaBilling`
- Regras de boletim aprovado / invoice / ledger
- UI visual do Balanço além da fonte do número

### Arquivos modificados
- `server/lib/supabase-page.ts` (+ test)
- `server/routes/escort.ts`
- `server/lib/balanco-cache.ts`
- `client/src/lib/balanco-revenue.ts`
- `client/src/pages/admin/balanco-gerencial.tsx`
- `tests/balanco-revenue.test.ts`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/supabase-page.test.ts tests/balanco-revenue.test.ts server/lib/cancelada-billing.test.ts server/lib/boletim-totals.test.ts tests/balanco-period.test.ts` | pass (31/31) |

### Resultados (negócio)
Canceladas no Balanço (mês) passam a usar o mesmo valor do Boletim (tabela 100 km) e deixam de poluir “OSs em Aberto” com previsão canônica errada.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Pendências
- Após deploy: clicar **Atualizar agora** no Balanço (ou aguardar warm da v2) para invalidar qualquer cache antigo.
- Relatório de OS ainda depende do mesmo `byMission` (corrigido na fonte).

### Resumo executivo
1. Não era falha de regra de cancelada — era **corte silencioso em 1000 billings**.
2. Boletim e Balanço liam subconjuntos diferentes da mesma tabela.
3. Paginação + fail-closed + nova chave de cache fecham o buraco.
