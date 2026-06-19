---
name: Resumo "resumo" do WhatsApp (cliente)
description: O que pode/não pode entrar no resumo automático enviado ao grupo do cliente quando digitam "resumo".
---

# Resumo automático do grupo do cliente ("resumo")

Quando alguém digita "resumo"/"panorama"/"status geral" num grupo WhatsApp vinculado
a um cliente (`clients.whatsapp_group_id`), o sistema responde com um panorama das OS
daquele cliente. Texto montado por `buildClientSummaryByGroup` (server/lib/agent-central-mention.ts).

## Decisões do dono (NÃO reverter sem ordem)
- **É CLIENTE-facing**: vai pro grupo do cliente, não é a "passagem de plantão" interna.
  Por isso NÃO colocar dado interno/financeiro (meta de faturamento, folga da equipe,
  custo, diárias) — só status operacional das viagens DAQUELE cliente.
- **Mostrar a equipe Torres (escolta) é OK** (aprovado 19/06/2026): primeiros nomes dos
  agentes (`assigned_employee_id`/`_2_id`) aparecem no resumo do cliente.

## Limitações de dados (não inventar)
- **Não existe "Local Atual" (GPS ao vivo) nem "Previsão de Término/ETA"** em
  service_orders. O melhor proxy de posição é o `mission_status` (ex.: Pernoite,
  Em Trânsito ao Destino, No Local de Destino). A passagem de plantão manual do dono
  tem esses campos porque são digitados à mão.
- Timestamps (`mission_started_at`, `completed_date`, `scheduled_date`) vêm do Supabase
  COM offset `-03:00` ⇒ `new Date(iso)` + `timeZone: America/Sao_Paulo` formata certo.

## Filtros (prod-testado, não mexer ao só mudar layout)
- Ativas = `status=em_andamento` menos `FINISHED_MISSION_STATUS`.
- Finalizadas hoje = `completed_date` dentro do dia BRT, excluindo cancelada/recusada.
