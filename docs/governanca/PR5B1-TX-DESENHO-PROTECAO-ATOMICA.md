# PR5B.1-TX — Desenho da proteção atômica de billing

**Status:** implementado no PR #58; migrations versionadas, revisáveis e ainda não aplicadas live
**Domínio dono:** faturamento
**Dados protegidos:** `escort_billings` (SNAPSHOT financeiro) e `boletim_approvals.billing_snapshot` (SNAPSHOT comercial)
**Camadas:** 5 e 6 da Arquitetura Oficial
**Banco alterado nesta fase:** não
**SQL executado nesta fase:** 10 consultas read-only TX; zero SQL de escrita

## 1. Problema

O guard aplicativo atual executa duas operações:

1. consulta status/snapshot;
2. grava `escort_billings`.

Outro fluxo pode criar `billing_snapshot` entre as duas operações. O `UPSERT`
e o índice único por `service_order_id` evitam duplicidade, mas não serializam
o snapshot comercial com a mutação do billing.

Consequência: existe TOCTOU real. Testes unitários do guard não eliminam essa
janela.

## 2. Reutilização e inventário versionado

### 2.1 Encontrado e reutilizável

| Artefato | Evidência | Reuso proposto |
|---|---|---|
| Motor canônico | `server/billing-calc.ts` (`calcularEscolta`, `computeBillingPayloadForOs`) | permanece em TypeScript; não será duplicado em SQL |
| Cancelada | `server/lib/cancelada-billing.ts` | permanece em TypeScript |
| Recusada | `server/lib/recusada-guard.ts` | permanece em TypeScript |
| Guard de UX | `server/lib/billing-frozen.ts` | permanece como precheck e mensagem rápida; deixa de ser fronteira de integridade |
| Snapshot comercial | `server/routes/boletim-approval.ts` | writer precisa entrar no mesmo protocolo de lock/versionamento |
| Unicidade por OS | `uniq_eb_so_id` em `server/db-init.ts` | deve ser promovida a constraint/index versionado, após preflight de duplicidades |
| Auditoria | `logSystemAudit` e `system_audit_logs` | reutilizar em exceções explícitas de reabertura/refaturamento |

### 2.2 O que não resolve o bloqueio

- `isBillingProtected`: check remoto separado do write.
- `UPSERT ... ON CONFLICT (service_order_id)`: resolve concorrência de INSERT,
  não imutabilidade de snapshot.
- RLS: o backend usa `service_role`; RLS não substitui invariante.
- `exec_sql`: DDL genérico, não contrato transacional de faturamento.
- `db-init.ts`: bootstrap best-effort; governança B2/B7 e dívidas D13/D14
  exigem migration versionada para a trava crítica.
- `server/supabase.ts`: cliente REST resiliente; cada chamada PostgREST é uma
  transação independente.
- `server/storage.ts`: abstrai consultas, mas não oferece unit-of-work que
  mantenha `FOR UPDATE` entre operações.
- conexão `pg` de `db-init.ts`: pertence ao bootstrap/DDL e não deve virar
  segundo caminho runtime para billing.

Não há FK entre os itens JSON de `billing_snapshot` e `escort_billings`. A
única barreira estrutural comprovada no repositório é o índice unique por OS,
criado hoje de forma best-effort.

Nem a criação original de `escort_billings`, nem PK/FKs para
`service_order_id`/`invoice_id` estão versionadas. As definições live precisam
ser coletadas antes de a migration futura decidir quais constraints apenas
validar, promover ou criar.

O arquivo `server/lib/boletim-resync.ts`, citado na governança, não foi
localizado no estado auditado. O único writer versionado de
`billing_snapshot` encontrado é a criação em
`server/routes/boletim-approval.ts`. Qualquer resync futuro precisa de admissão
formal; não deve ser presumido como fluxo ativo.

Além dos cinco writers de cálculo, `server/asaas.ts` altera status,
`invoice_id`, `faturado_em` e `pago_em` em vários fluxos; a aprovação comercial
altera status em `server/routes/boletim-approval.ts`; e `server/routes.ts`
executa backfill runtime. O enforcement não pode ser ativado enquanto esses
writers não aderirem ao contrato atômico ou forem formalmente retirados.

Há ainda dois caminhos críticos:

- `server/asaas.ts` pode apagar `boletim_approvals`; isso remove a evidência
  consultada por `billingHasCommercialSnapshot` e precisa ser substituído por
  estado/arquivamento, não hard delete;
- `server/pg-fallback.ts` inclui `escort_billings` entre tabelas core; qualquer
  replay/sync deve chamar o mesmo contrato atômico ou ficar desabilitado para
  esse snapshot.

### 2.3 Código × banco

As dez consultas TX foram executadas via MCP read-only no banco Torres,
confirmado por fingerprint. Evidência live:

| Objeto | Definição real | Classificação | Adequação ao P1-02 |
|---|---|---|---|
| `trg_validate_escort_billing_approval` | `BEFORE UPDATE` em `escort_billings`; chama `validate_escort_billing_approval` | LIVE-ONLY, legado | não consulta `boletim_approvals.billing_snapshot`, não cobre DELETE/INSERT/concorrência |
| `validate_escort_billing_approval` | valida transição para `APROVADO`, `snapshot_data`, `fat_total` e `edit_reason`; SECURITY INVOKER | LIVE-ONLY, legado | não protege status atuais (`APROVADA/FATURADO/PAGO`) nem snapshot comercial |
| `trg_validate_service_order_approval` | `BEFORE UPDATE` em `service_orders`; chama `validate_service_order_approval` | LIVE-ONLY, legado | não protege billing |
| `validate_service_order_approval` | valida aprovação legada em `service_orders`; SECURITY INVOKER | LIVE-ONLY, legado | não protege billing |
| `trg_ajustar_data_missao` / `fn_ajustar_data_missao` | ajusta data operacional em `service_orders` | VERSIONADA | não relacionada |

O enforcement substitui somente `trg_validate_escort_billing_approval`.
`trg_validate_service_order_approval` permanece intacto por pertencer ao fato
operacional, não ao billing.

Não existem triggers live em `boletim_approvals`, `invoices` ou
`financial_transactions`. Não existe RPC de billing, `FOR UPDATE`, proteção de
hard delete ou vínculo relacional entre JSONB e billing.

Classificação final: **CÓDIGO × BANCO — OBJETOS LIVE NÃO VERSIONADOS E NÃO
ADEQUADOS À ATOMICIDADE**.

O TOCTOU permanece real; a implementação nova versionada é necessária.

## 3. Alternativas avaliadas

| Opção | Atomicidade real | Race residual | UPDATE | DELETE | INSERT | Snapshot concorrente | Migration | Vercel/Supabase | Auditabilidade | Risco |
|---|---|---|---|---|---|---|---|---|---|---|
| A. Trigger somente em `escort_billings` | parcial | snapshot pode ser inserido em outra transação sem lock coordenado | sim | sim | não | ambos podem confirmar | sim | transparente | média | alto |
| B. RPC isolada de billing | parcial | snapshot writer continua fora do protocolo | sim | sim | sim | snapshot pode vencer fora do lock | sim | compatível; uma chamada PostgREST | alta | alto |
| C. `UPDATE ... WHERE NOT EXISTS(snapshot)` | parcial | MVCC permite INSERT concorrente depois do snapshot do statement | sim | exige segundo statement equivalente | não | ambos podem confirmar | não/sim | compatível | baixa | alto |
| D. `SELECT ... FOR UPDATE` | completa apenas se billing **e snapshot** usam o mesmo lock | writer que não participa reabre a race | sim | sim | exige advisory lock por chave de negócio | determinístico se bilateral | sim | precisa RPC; não funciona entre duas chamadas serverless | alta | médio |
| E. Constraint/regra existente | não comprovada | definição live ausente | desconhecido | desconhecido | unique cobre só duplicidade | desconhecido | a decidir | desconhecido | desconhecida | crítico |
| F. RPCs coordenadas + triggers de enforcement | sim | nenhuma entre writers aderentes; direct DML é rejeitado | sim | sim | sim | uma operação vence; a outra revalida e bloqueia/retry | sim | compatível com PostgREST e serverless | alta | menor |

| Opção | Complexidade | Impacto em produção | Billing já frozen | Rollback |
|---|---|---|---|---|
| A | média | trigger afeta qualquer DML na tabela | bloqueia se o trigger reconhecer o estado | remover trigger/function |
| B | média/alta | migração coordenada dos writers | bloqueia dentro da função | app volta ao writer anterior; depois revoga/remove RPC |
| C | baixa | alteração apenas nas queries | filtro retorna zero linhas | restaurar query anterior |
| D | alta | contenção curta por billing; batch exige ordem estável | check após lock bloqueia | remover protocolo de lock/RPC |
| E | desconhecida | impossível estimar sem definição live | desconhecido | impossível definir antes da introspecção |
| F | alta na implantação, baixa na operação | duas fases expand/contract; locks curtos e observáveis | normal write bloqueia; exceção exige ação auditada | remover enforcement só após rollback do app |

### Conclusões por opção

#### A — Trigger `BEFORE UPDATE/DELETE`

É boa defesa contra snapshot já confirmado, inclusive para writers esquecidos.
Sozinha não ordena a transação que cria `billing_snapshot`. Também não trata
INSERT nem snapshot stale construído antes de o trigger adquirir lock.

#### B — RPC `SECURITY DEFINER`

Uma função engloba check + write em uma transação Postgres. Só é completa se o
writer do snapshot adquirir os mesmos locks. Deve ter `search_path` fixo,
allowlist de campos, grants revogados de `PUBLIC/anon/authenticated` e execução
exclusiva por `service_role`.

#### C — write condicional

É melhor que check aplicativo separado para snapshots já visíveis, mas não
serializa um INSERT concorrente em outra tabela. Não atende o gate.

#### D — locking explícito

`FOR UPDATE` deve ocorrer dentro da RPC; uma chamada PostgREST não mantém
transação aberta para a chamada seguinte. Snapshots com múltiplos billings
devem travar IDs em ordem determinística para evitar deadlock.

#### E — objetos existentes

O índice `uniq_eb_so_id` é reutilizável depois de versionado. Nenhum trigger,
RPC, constraint ou policy versionado comprovou a invariante snapshot × write.

#### F — combinação

É a única opção que fecha a race, impede bypass acidental e mantém os motores
financeiros no TypeScript.

## 4. Solução recomendada

### 4.1 Arquitetura

Adotar **F: protocolo bilateral de RPC + enforcement por trigger**, com uma
versão otimista no billing:

1. `escort_billings.lock_version BIGINT NOT NULL DEFAULT 0`.
2. role interna `torres_billing_rpc_owner` (`NOLOGIN`, sem membership das
   roles PostgREST) como proprietária das RPCs;
3. RPC de escrita de billing:
   - adquire lock por `service_order_id` para INSERT;
   - carrega billing existente com `FOR UPDATE`;
   - valida `lock_version` esperado;
   - valida status frozen e existência em snapshot;
   - aplica somente colunas permitidas;
   - incrementa `lock_version`;
   - grava auditoria quando a ação é excepcional;
   - retorna linha e versão nova.
4. RPC de criação/resync de snapshot:
   - trava todos os billings com `FOR UPDATE`, em ordem por ID;
   - compara `billing_version` recebido com `lock_version` atual;
   - rejeita payload stale;
   - permite resync somente quando approval está `PENDENTE`;
   - insere/atualiza `billing_snapshot` sem recalcular preço;
   - nunca altera invoice ou ledger.
5. Trigger de enforcement em `escort_billings`:
   - rejeita UPDATE/DELETE direto fora da RPC controlada;
   - valida `current_user = torres_billing_rpc_owner`; custom GUC não é
     autorização;
   - atua como fail-closed para writer legado esquecido.
6. Trigger de enforcement em `boletim_approvals.billing_snapshot`:
   - rejeita INSERT/UPDATE/DELETE direto fora da RPC de snapshot;
   - bloqueia alteração quando status não é `PENDENTE`.
7. `uniq_eb_so_id` passa a ser criado/validado por migration, sem `.catch()`.
8. índice GIN versionado em `billing_snapshot` sustenta o containment check
   executado em todo write, após medir volume/impacto no preflight.

O banco protege integridade, imutabilidade e ordem. `calcularEscolta`,
`computeCanceladaBilling`, `billingTotalForBoletim` e preparação de inputs
continuam no domínio TypeScript.

### 4.1.1 Ordem global de locks

Todas as RPCs seguem a mesma ordem determinística:

1. advisory locks por `service_order_id`, em ordem crescente;
2. `service_orders` em ordem de ID, `FOR SHARE`;
3. `escort_contracts FOR SHARE` pelos UUIDs distintos vinculados às OS, em ordem
   crescente — inclusive em `UPDATE_OPEN`, `DELETE_OPEN`, snapshot/freeze/invoice
   via `lock_service_orders_for_billings`;
4. `escort_billings FOR UPDATE` em ordem de UUID;
5. `boletim_approvals` ou `invoices FOR UPDATE`, quando aplicável.

Nenhuma RPC pode adquirir billing/approval/invoice antes do prefixo
`advisory -> service_orders -> contracts`. `UPDATE_OPEN` e `DELETE_OPEN`
compartilham o mesmo prefixo. Leituras de `mission_photos` são factuais e não
usam `FOR SHARE` após o lock de billing.

Após o último lock, membership de billing/OS/invoice é revalidado. Mudança
concorrente de contrato, reparent de invoice ou alteração do conjunto aborta a
transação com conflito stale.

#### FIX2B — causa raiz dos deadlocks snapshot × update/delete

O deadlock ocorria quando o teste (ou qualquer caminho) adquiria
`escort_billings FOR UPDATE` **antes** do advisory da OS, enquanto a RPC
concorrente já detinha o advisory e esperava o billing. Ordem invertida:

- TxA: billing → (depois) advisory
- TxB: advisory → billing

Correção: prefixo global único em write e em
`lock_service_orders_for_billings` (usado por create/freeze/invoice).

#### FIX2B — `CONTRACT_NOT_FOUND` × `TIMESTAMPS_REQUIRED`

Causa A (fixture): o caso de timestamps exigia OS com
`escort_contract_id` apontando para contrato inexistente na tabela. A RPC
valida contrato no slot global antes dos timestamps; sem a row do contrato,
retorna `PR5B1_TX_CONTRACT_NOT_FOUND`. A ordem de validação em produção
permanece correta (contrato → timestamps → KM).

### 4.2 Resultado concorrente determinístico

#### Snapshot adquire lock primeiro

1. snapshot RPC trava o billing;
2. valida versão e grava o snapshot;
3. billing RPC espera;
4. após adquirir lock, encontra snapshot e bloqueia o write.

#### Billing adquire lock primeiro

1. billing RPC trava e atualiza o billing;
2. incrementa `lock_version`;
3. snapshot RPC espera;
4. ao adquirir lock, encontra versão diferente;
5. snapshot stale é rejeitado e deve ser reconstruído/reexecutado.

Em nenhum caso um snapshot stale e uma mutação concorrente confirmam juntos.

### 4.3 INSERT

- A RPC adquire advisory transaction lock derivado de `service_order_id`
  antes de procurar/criar o billing.
- A unique constraint versionada permanece como segunda barreira.
- `service_order_id = NULL` só é permitido para o fluxo avulso explicitamente
  autorizado; não pode ser usado para contornar snapshot de OS.
- Snapshot não pode referenciar billing inexistente; a RPC valida todos os IDs.
- A RPC também verifica conflito com approvals ativos; o parâmetro `force` da
  aplicação não pode contornar a invariante sem ação excepcional auditada.
- Approvals legados ativos (`PENDENTE`/`APROVADO`) sem JSON snapshot protegem
  temporariamente os billings referenciados em `billing_ids`.
- `DELETE_OPEN` só remove billing sem snapshot/frozen e sem vínculo no ledger;
  ledger relacionado bloqueia o delete e permanece auditável.

### 4.4 Reabertura e refaturamento

Não usar bypass genérico.

A mesma RPC recebe uma ação fechada, por exemplo:

- `NORMAL_WRITE`;
- `DELETE_OPEN`;
- `REOPEN_APPROVED`;
- `RELEASE_REBILL`;
- `FREEZE_COMMERCIAL`.

As ações excepcionais:

- exigem estado de origem compatível;
- exigem ator e motivo;
- são chamadas apenas por rotas já autorizadas;
- gravam `system_audit_logs` na mesma transação;
- nunca alteram `billing_snapshot`;
- nunca alteram `invoices`;
- nunca alteram `financial_transactions` dentro desta RPC.

Invoice/ledger continuam com seus donos e fluxos próprios.

## 5. SQL conceitual — não executável

O trecho abaixo descreve o contrato. A migration futura deve listar
explicitamente a allowlist real de colunas; não deve usar merge JSON irrestrito.

```sql
-- CONCEITUAL: não executar nesta fase.

ALTER TABLE public.escort_billings
  ADD COLUMN lock_version bigint NOT NULL DEFAULT 0;

CREATE INDEX idx_boletim_snapshot_billing_lookup
  ON public.boletim_approvals
  USING gin (billing_snapshot jsonb_path_ops)
  WHERE billing_snapshot IS NOT NULL;

CREATE FUNCTION public.write_escort_billing_atomic(
  p_billing_id uuid,
  p_service_order_id bigint,
  p_expected_version bigint,
  p_action text,
  p_payload jsonb,
  p_actor jsonb
) RETURNS public.escort_billings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  current_row public.escort_billings;
BEGIN
  -- INSERT usa advisory xact lock por service_order_id.
  -- UPDATE/DELETE usa SELECT ... FOR UPDATE.
  -- Validar expected_version, status e snapshot.
  -- Validar ação excepcional + motivo.
  -- Aplicar allowlist explícita de colunas.
  -- Incrementar lock_version em UPDATE.
  -- Gravar auditoria excepcional na mesma transação.
  -- Nunca tocar billing_snapshot, invoice ou ledger.
  RETURN current_row;
END;
$$;

CREATE FUNCTION public.write_boletim_snapshot_atomic(
  p_approval jsonb,
  p_snapshot jsonb
) RETURNS public.boletim_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Extrair billing_id + billing_version.
  -- Ordenar IDs e travar todos com FOR UPDATE.
  -- Validar existência, versão e status da approval.
  -- INSERT ou resync somente PENDENTE.
  -- Não recalcular total; persistir payload preparado pelo domínio oficial.
  -- Nunca tocar invoice ou ledger.
END;
$$;

CREATE TRIGGER guard_escort_billing_direct_write
BEFORE UPDATE OR DELETE ON public.escort_billings
FOR EACH ROW EXECUTE FUNCTION public.guard_escort_billing_direct_write();

CREATE TRIGGER guard_boletim_snapshot_direct_write
BEFORE INSERT OR UPDATE OF billing_snapshot ON public.boletim_approvals
FOR EACH ROW EXECUTE FUNCTION public.guard_boletim_snapshot_direct_write();

CREATE TRIGGER guard_boletim_snapshot_delete
BEFORE DELETE ON public.boletim_approvals
FOR EACH ROW EXECUTE FUNCTION public.guard_boletim_snapshot_direct_write();
```

## 6. Objetos a versionar na implementação futura

1. migration única e transacional;
2. role interna `NOLOGIN` proprietária das RPCs;
3. coluna `escort_billings.lock_version`;
4. constraint/index unique total em `service_order_id`;
5. índice GIN para busca por `billing_id` no JSONB;
6. funções atômicas de billing, snapshot e lifecycle por invoice;
7. função-trigger de enforcement do billing;
8. função-trigger de enforcement do snapshot;
9. grants/revokes explícitos;
10. comentários SQL dos objetos;
11. rollback estrutural que remove novos triggers/functions somente após
    rollback do app.

`exec_sql` não deve criar esses objetos no boot.

## 7. Writers que migrariam

| Writer | Arquivo | Mudança futura |
|---|---|---|
| Cron | `server/cron.ts` | INSERT via RPC |
| Manual | `server/routes/service-orders.ts` | UPSERT/UPDATE via RPC |
| Mission | `server/routes/mission.ts` | UPSERT/DELETE/transições via RPC |
| Submit/lote/salvar/revisar | `server/routes/escort.ts` | todas as mutações via RPC |
| Envio de boletim | `server/routes/boletim-approval.ts` | snapshot via RPC coordenada |
| Resync pendente | não localizado no código ativo | só admitir futuramente via RPC `PENDING_RESYNC` |
| Reabrir/refaturar | `server/routes/escort.ts` | ação excepcional auditável da RPC |
| Aprovação do cliente | `server/routes/boletim-approval.ts` | `FREEZE_COMMERCIAL` via RPC após validar approval/snapshot |
| Vínculo/status de invoice e pagamento | `server/asaas.ts` | ações fechadas `LINK_INVOICE`, `MARK_INVOICED`, `MARK_PAID`, `UNLINK_FOR_REBILL`; a RPC não altera a invoice |
| Exclusão de approval | `server/asaas.ts` | remover hard delete; preservar snapshot por status/arquivo auditável |
| Backfill runtime | `server/routes.ts` | remover como writer runtime; transformar em migration/backfill controlado antes do enforcement |
| Fallback/offline sync | `server/pg-fallback.ts` | impedir replay direto de billing ou encaminhar ao contrato atômico |

`billing-frozen.ts` continua sendo precheck, não autorização final.

### 7.1 Implantação expand/contract

Ativar trigger e app em um único passo cria incompatibilidade:

- app novo antes das RPCs: chamadas falham;
- enforcement antes do app novo: writers antigos falham.

Sequência segura futura:

1. migration **expand**: coluna, constraint validada, RPCs e funções auxiliares,
   ainda sem bloquear writers antigos;
2. deploy do app: todos os writers passam às RPCs;
3. telemetria confirma zero DML direto em `escort_billings` e
   `billing_snapshot`;
4. migration **contract/enforcement**: ativa os dois triggers fail-closed e
   revoga execução indevida;
5. smoke tests e testes concorrentes;
6. rollback segue a ordem inversa.

Impacto esperado: locks por billing durante milissegundos; no envio de boletim,
locks em lote e em ordem determinística. Deve haver timeout e métrica para
espera/deadlock, sem retry cego de mutação financeira.

## 8. P1-07 — diagnóstico dos inputs canônicos

### 8.1 Classificação

- **FATO:** `service_orders`, última foto válida por etapa, timestamps reais,
  `mission_costs` expense/revenue.
- **CONTRATO:** `escort_contracts`.
- **PROJEÇÃO:** `calcularFaturamentoLive`; proibida no writer oficial.
- **FALLBACK legado/proibido no writer oficial:** contrato default,
  `horasMissao`, `now`, body e billing anterior quando fatos faltam.
- **ESTIMATIVA:** `pedagio_estimado`, rota textual/KM estimado; proibidos no
  writer oficial.

### 8.2 Matriz

A matriz abaixo registra o comportamento atual divergente; não representa a
regra alvo já fechada em 8.4.

| Campo | Cron | Manual | Mission | Lote | Submit | Fonte oficial | Divergência |
|---|---|---|---|---|---|---|---|
| Status OS | linha DB; concluída/cancelada/recusada ou etapa final | storage por ID | storage da missão | reconsulta DB | DB quando vinculada; body quando avulsa | `service_orders` — FATO | submit avulso não tem OS |
| Contrato | ID da OS → contrato ativo do cliente → `DEFAULT_BILLING_CONTRACT` | ID → primeiro ativo do cliente → literal default | ID → primeiro contrato do cliente → literal default | ID da OS → ID já persistido; sem fallback cliente | ID OS/body → primeiro contrato do cliente → literal default | `escort_contracts` — CONTRATO | seleção/status/default não são idênticos |
| KM inicial | última `km_chegada`; fallback última `km_saida` | igual | helper compartilhado | helper compartilhado | helper se vinculada; body se avulsa | `mission_photos` — FATO | avulso diverge |
| KM final | última `km_final`, clamp em KM inicial | igual | helper compartilhado | helper compartilhado | helper se vinculada; body se avulsa | `mission_photos` — FATO | avulso diverge |
| KM vazio/rota | zero; rota não entra | zero; rota não entra | zero; rota não entra | zero | helper zero; avulso aceita body | fato comprovado; rota é ESTIMATIVA | avulso aceita input não canônico |
| Início | `mission_started_at` | timestamp real; HH:MM pode usar último step log | `mission_started_at` | `mission_started_at` | DB vinculada; body avulso | `service_orders.mission_started_at` — FATO | manual tem fallback adicional |
| Fim | `completed_date`; fallback now no helper | `completedDate`/`hora_fim_missao`/step log | `completed_date` atualizado | `completed_date` | DB vinculada; body avulso | `service_orders.completed_date` — FATO | fallbacks diferem quando fato falta |
| Horas fallback | `getHorasElapsedFromDB` | zero + HH:MM fallback | zero | horas do billing anterior | body | timestamps reais; fallback precisa decisão | diverge quando timestamp incompleto |
| Estadia/pernoite | zero | zero | zero | helper zero | helper zero; avulso aceita body | fato de campo comprovado | avulso diverge; fatos não centralizados |
| Pedágio | `mission_costs` via split | igual | igual | igual | igual se vinculada; body se avulsa | `mission_costs` expense — FATO | avulso diverge |
| Combustível/outras | `mission_costs` via split | igual | igual | igual | igual se vinculada; body se avulsa | `mission_costs` — FATO | avulso diverge |
| Receitas | split ignora revenue de pedágio | igual | igual | igual | igual se vinculada; body se avulsa | `mission_costs` — FATO | avulso diverge |
| Status do billing | `A_VERIFICAR` | `A_VERIFICAR` | `A_VERIFICAR` | preserva status aberto | `A_VERIFICAR` | regra do fluxo | lote é exceção intencional |
| Metadata | maps batelados | storage | storage | billing anterior | body para nomes/placa | cadastros mestres — FATO | não muda fórmula, mas pode ficar stale |

### 8.3 Divergências materiais confirmadas

| ID | Divergência | Impacto possível |
|---|---|---|
| D1 | builder usa `mission_started_at`; manual pode preferir `step_logs` para início | hora extra, noturno e horário considerado |
| D2 | builder usa `now` quando `completed_date` falta | horas infladas em OS materializada prematuramente |
| D3 | submit aceita `body.horas_missao`; lote aceita `existing.horas_missao` | fallback financeiro baseado em request/billing stale |
| D4 | resolução de contrato difere por writer e nem todos filtram `status=Ativo` | tarifa diferente ou batch ignorado |
| D5 | defaults inline não são iguais a `DEFAULT_BILLING_CONTRACT` | franquias/HE/KM diferentes sem contrato comprovado |
| D6 | auto-recalc do PATCH de OS usa campos KM da OS, não `mission_photos` | `fat_km` diferente de cron/mission/manual calcular |
| D7 | cron combina `getHorasElapsedFromDB` com o cálculo temporal do motor | regra dupla em casos de timestamp incompleto |
| D8 | submit avulso usa body para KM, horas e despesas | valores sem vínculo com fatos oficiais |

Diferenças de `created_by`, nomes, placa e metadata não alteram a fórmula, mas
podem produzir espelhos stale. Elas não devem ser confundidas com D1–D8.

### 8.4 Decisões de negócio fechadas

#### Contrato — decisão do proprietário (opção 2)

1. Todo billing oficial usa exclusivamente
   `service_orders.escort_contract_id`.
2. Não há fallback automático por `client_id`, ordem, nome, criação, prioridade
   implícita ou default tarifário inline.
3. Se houver exatamente um contrato ativo, a UI pode selecioná-lo
   automaticamente, mas deve persistir o ID na OS.
4. Com múltiplos ativos, o usuário seleciona explicitamente antes da
   criação/conclusão financeira.
5. Reprocessamento reutiliza o ID originalmente persistido; nunca reescolhe.
6. OS legada sem vínculo entra em correção operacional auditada e não
   gera/recalcula billing oficial.
7. Múltiplos contratos ativos continuam permitidos; não será criado critério
   automático de prioridade/vigência nesta fase.

#### Timestamps

- Billing de concluída exige `mission_started_at` e `completed_date` reais.
- Agendamento, `now`, body, RPC secundária ou billing anterior não substituem
  timestamps ausentes.
- Fato incompleto bloqueia materialização/reprocessamento e exige correção
  operacional auditada.

#### KM

- KM oficial vem da última evidência válida em `mission_photos`.
- `km_final` ausente ou inválido bloqueia billing de concluída.
- Rota, estimativa, clamp silencioso, KM da OS ou billing anterior não
  substituem a foto factual.
- Cancelada mantém exclusivamente a regra já fechada de
  `computeCanceladaBilling`.
- O contrato da cancelada deve estar `Ativo` e possuir exatamente
  `franquia_km=100` e `franquia_horas=3`; incompatibilidade falha fechado.

#### Submit avulso

- `submit-os` oficial exige `service_order_id`.
- O ramo sem OS é legado e deve ser descontinuado no fluxo oficial.
- Não adere à RPC oficial e não pode alimentar snapshot/invoice.

#### Demais inputs já fechados

- Pedágio/despesas: `mission_costs`; sem registro factual, zero.
- Rota: projeção, nunca input oficial.
- A preparação oficial deve ser única, estendendo
  `computeBillingPayloadForOs`; não criar segundo motor.

P1-07 permanece **parcial apenas no código**; fontes e regras de negócio estão
fechadas para implementação.

## 9. Rollback futuro

Ordem segura:

1. manter código compatível com RPC e retorno antigo;
2. desativar uso das RPCs no app;
3. restaurar writers antigos somente em janela controlada;
4. remover triggers de enforcement;
5. remover grants/functions;
6. preservar `lock_version` quando houver qualquer snapshot versionado;
7. remover a role interna somente após remover RPCs e revogar privilégios.

Rollback não apaga snapshots, invoices, ledger ou auditoria.

## 10. Plano de homologação

### Testes automatizados em banco efêmero

1. INSERT aberto cria um billing e versão inicial.
2. INSERT concorrente da mesma OS: um registro, sem duplicidade.
3. UPDATE aberto com versão atual: sucesso e versão incrementada.
4. UPDATE com versão stale: erro de concorrência.
5. Billing frozen: UPDATE e DELETE normais bloqueados.
6. Billing em snapshot: UPDATE e DELETE normais bloqueados.
7. DML direto fora da RPC: trigger bloqueia.
8. Snapshot com versão stale: bloqueia sem gravar approval.
9. UPDATE/NULL/DELETE direto de `billing_snapshot`: bloqueado.
10. Duas sessões:
   - sessão A trava para snapshot;
   - sessão B tenta write;
   - A confirma;
   - B bloqueia.
11. Ordem inversa:
    - B atualiza/incrementa versão;
    - A detecta versão stale;
    - nenhum snapshot stale é criado.
12. Reabertura/refaturamento autorizada:
    estado permitido + ator + motivo + auditoria atômicos.
13. Reabertura inválida ou sem motivo: bloqueada.
14. Snapshot aprovado: resync e hard delete bloqueados.
15. RPC não altera `billing_snapshot`, `invoices` ou `financial_transactions`
    fora de sua responsabilidade.

### Golden fixtures read-only

- aberta: OS 981 / TOR-0586;
- frozen: OS 941 / TOR-0546;
- recusada: OS 35 / TOR-0018;
- snapshot consistente: OS 749 / TOR-0471;
- snapshot divergente: OS 438 / TOR-0291.

Esses registros só entram em verificação SELECT; testes mutáveis usam banco
efêmero ou dados de homologação autorizados.

## 11. Evidências concluídas e gates da implementação

Concluídos:

1. banco Torres confirmado por fingerprint;
2. pacote TX-01 a TX-10 executado read-only;
3. triggers/functions live coletados e classificados como não adequados;
4. `uniq_eb_so_id`, PKs, FKs, CHECKs, índices e RLS inventariados;
5. ausência de trigger/RPC/lock atômico comprovada;
6. hard delete de snapshot/billing mapeado;
7. writers diretos e caminhos de fallback inventariados;
8. P1-07 e regra contratual fechados pelo proprietário.

Implementados na PR5B.1-TX-IMPLEMENTAÇÃO:

1. migration expand versionada e rollback;
2. RPCs com allowlist real de colunas e grants explícitos;
3. migração dos writers identificados;
4. migration contract/enforcement mantida em `migrations/pending`;
5. testes concorrentes em PostgreSQL efêmero;
6. CI de integração PostgreSQL;
7. rollback que preserva `lock_version`.

Ainda obrigatório: revisão humana das migrations e autorização explícita antes
de qualquer aplicação live.

### Ordem manual e CSVs

Statements executados isoladamente via MCP read-only:

1. `TX-01` → `pr5b1_tx_01_context.csv`;
2. `TX-02` → `pr5b1_tx_02_known_validate_triggers.csv`;
3. `TX-03` → `pr5b1_tx_03_critical_table_triggers.csv`;
4. `TX-04` → `pr5b1_tx_04_trigger_functions.csv`;
5. `TX-05` → `pr5b1_tx_05_candidate_routines.csv`;
6. `TX-06` → `pr5b1_tx_06_constraints.csv`;
7. `TX-07` → `pr5b1_tx_07_indexes.csv`;
8. `TX-08` → `pr5b1_tx_08_rls_policies.csv`;
9. `TX-09` → `pr5b1_tx_09_grants.csv`;
10. `TX-10` → `pr5b1_tx_10_dependencies.csv`.

Não executar `verify`, DDL, DML, `exec_sql` ou chamadas administrativas junto
com esse pacote.

## 12. Decisão

**PR5B.1-TX-FIX2 CONCLUÍDA — PRONTA PARA NOVA HOMOLOGAÇÃO**

O desenho, a evidência live, os objetos SQL, o rollout expand/contract, o
rollback, os writers, os testes concorrentes e as regras de negócio estão na
branch do PR #58. FIX2B fechou deadlock snapshot×update/delete (ordem global
única com contrato no mesmo prefixo) e o falso `CONTRACT_NOT_FOUND` do caso de
timestamps (fixture A). Nenhuma migration foi aplicada no banco live; o
próximo gate é nova homologação humana — sem apply/merge/publish.
