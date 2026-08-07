# PR5B.1-TX — Desenho da proteção atômica de billing

**Status:** proposta técnica; não implementada
**Domínio dono:** faturamento
**Dados protegidos:** `escort_billings` (SNAPSHOT financeiro) e `boletim_approvals.billing_snapshot` (SNAPSHOT comercial)
**Camadas:** 5 e 6 da Arquitetura Oficial
**Banco alterado nesta fase:** não
**SQL executado nesta fase:** nenhum

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

### 2.3 Código × banco

Os nomes abaixo foram observados no catálogo live anterior, mas suas definições
não existem nas migrations versionadas:

- `trg_validate_escort_billing_approval`;
- `trg_validate_service_order_approval`;
- demais `validate_*` live;
- functions live-only associadas.

Classificação: **CÓDIGO × BANCO — OBJETO LIVE NÃO VERSIONADO**.

Não é seguro presumir que esses objetos:

- executam em `BEFORE UPDATE/DELETE`;
- consultam `billing_snapshot`;
- cobrem concorrência com criação de snapshot;
- bloqueiam `service_role`;
- preservam reabertura/refaturamento;
- possuem a mesma definição em todos os ambientes.

O pacote `scripts/pr5b1-tx-live-billing-protection-readonly.sql` deve ser
executado e arquivado antes de autorizar a implementação.

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
2. RPC de escrita de billing:
   - adquire lock por `service_order_id` para INSERT;
   - carrega billing existente com `FOR UPDATE`;
   - valida `lock_version` esperado;
   - valida status frozen e existência em snapshot;
   - aplica somente colunas permitidas;
   - incrementa `lock_version`;
   - grava auditoria quando a ação é excepcional;
   - retorna linha e versão nova.
3. RPC de criação/resync de snapshot:
   - trava todos os billings com `FOR UPDATE`, em ordem por ID;
   - compara `billing_version` recebido com `lock_version` atual;
   - rejeita payload stale;
   - permite resync somente quando approval está `PENDENTE`;
   - insere/atualiza `billing_snapshot` sem recalcular preço;
   - nunca altera invoice ou ledger.
4. Trigger de enforcement em `escort_billings`:
   - rejeita UPDATE/DELETE direto fora da RPC controlada;
   - atua como fail-closed para writer legado esquecido.
5. Trigger de enforcement em `boletim_approvals.billing_snapshot`:
   - rejeita INSERT/UPDATE direto fora da RPC de snapshot;
   - bloqueia alteração quando status não é `PENDENTE`.
6. `uniq_eb_so_id` passa a ser criado/validado por migration, sem `.catch()`.
7. índice GIN versionado em `billing_snapshot` sustenta o containment check
   executado em todo write, após medir volume/impacto no preflight.

O banco protege integridade, imutabilidade e ordem. `calcularEscolta`,
`computeCanceladaBilling`, `billingTotalForBoletim` e preparação de inputs
continuam no domínio TypeScript.

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
```

## 6. Objetos a versionar na implementação futura

1. migration única e transacional;
2. coluna `escort_billings.lock_version`;
3. constraint/index unique total em `service_order_id`;
4. índice GIN para busca por `billing_id` no JSONB;
5. função de escrita atômica de billing;
6. função de criação/resync atômico de snapshot;
7. função-trigger de enforcement do billing;
8. função-trigger de enforcement do snapshot;
9. grants/revokes explícitos;
10. comentários SQL dos objetos;
11. rollback estrutural que remove novos triggers/functions/coluna somente após
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
| Backfill runtime | `server/routes.ts` | remover como writer runtime; transformar em migration/backfill controlado antes do enforcement |

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
- **FALLBACK:** contrato default e `horasMissao` quando timestamps faltam.
- **ESTIMATIVA:** `pedagio_estimado`, rota textual/KM estimado; proibidos no
  writer oficial.

### 8.2 Matriz

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

### 8.3 Decisões ainda necessárias para P1-07

1. Tornar `computeBillingPayloadForOs` a única preparação oficial também no
   manual.
2. Escolher uma única resolução de contrato:
   `escort_contract_id` → contrato ativo do cliente com ordenação normativa →
   default central.
3. Definir se ausência de timestamps reais:
   - bloqueia materialização (fail-closed); ou
   - usa fallback único, rotulado e auditado.
4. Separar `submit-os` avulso do writer de OS; body manual não pode ser tratado
   como fato oficial de uma OS.
5. Definir fatos oficiais de estadia/pernoite antes de permitir valores
   diferentes de zero.

P1-07 continua **parcial**; há decisão arquitetural pendente além de código.

## 9. Rollback futuro

Ordem segura:

1. manter código compatível com RPC e retorno antigo;
2. desativar uso das RPCs no app;
3. restaurar writers antigos somente em janela controlada;
4. remover triggers de enforcement;
5. remover grants/functions;
6. remover `lock_version` por último, somente se não houver snapshot novo que
   dependa de `billing_version`.

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
9. Duas sessões:
   - sessão A trava para snapshot;
   - sessão B tenta write;
   - A confirma;
   - B bloqueia.
10. Ordem inversa:
    - B atualiza/incrementa versão;
    - A detecta versão stale;
    - nenhum snapshot stale é criado.
11. Reabertura/refaturamento autorizada:
    estado permitido + ator + motivo + auditoria atômicos.
12. Reabertura inválida ou sem motivo: bloqueada.
13. Snapshot aprovado: resync bloqueado.
14. RPC não altera `billing_snapshot`, `invoices` ou `financial_transactions`
    fora de sua responsabilidade.

### Golden fixtures read-only

- aberta: OS 981 / TOR-0586;
- frozen: OS 941 / TOR-0546;
- recusada: OS 35 / TOR-0018;
- snapshot consistente: OS 749 / TOR-0471;
- snapshot divergente: OS 438 / TOR-0291.

Esses registros só entram em verificação SELECT; testes mutáveis usam banco
efêmero ou dados de homologação autorizados.

## 11. Preflight obrigatório antes da implementação

1. executar o pacote read-only live;
2. arquivar definições dos triggers/functions live;
3. decidir manter, substituir ou remover cada objeto live-only;
4. confirmar `uniq_eb_so_id` sem duplicidades;
5. confirmar tipos reais de IDs (`uuid`/`bigint`) e colunas do payload;
6. confirmar grants de `exec_sql` e RPCs;
7. fechar decisões P1-07;
8. revisar migration e rollback sem aplicar;
9. só então solicitar autorização explícita.

### Ordem manual e CSVs

Executar cada statement isoladamente no SQL Editor do projeto esperado:

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

**PR5B.1-TX INCOMPLETA — EVIDÊNCIA LIVE ADICIONAL NECESSÁRIA**

Motivo: a arquitetura recomendada está definida, mas as funções e triggers live
`validate_*` não estão versionados nem tiveram sua definição coletada nesta
fase. Implementar antes dessa evidência pode duplicar, conflitar ou enfraquecer
uma proteção existente.
