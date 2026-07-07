---
name: WhatsApp PV fleet resumo
description: "resumo" no PV do bot devolve panorama da frota (owner-only, com financeiro); como difere do resumo de grupo e qual motor de faturamento usa.
---

# Resumo de frota no PV do bot (WhatsApp)

Quando um número AUTORIZADO manda "resumo" (ou "frota") no PRIVADO do bot, a Central
responde com um panorama de TODOS os veículos cadastrados (🟢 DISPONÍVEIS / 🟡 EM VIAGEM
+ bloco 📊). Implementado em `server/lib/fleet-summary.ts`, disparado pelo branch PV do
webhook em `server/routes/whatsapp.ts` (`if (!parsed.isGroup && !parsed.fromMe)`,
fire-and-forget).

**Financeiro (Fat.) É permitido aqui** — é o dono no PV. Isso é o OPOSTO do resumo do
grupo de cliente (`agent-central-mention.ts`), que nunca mostra dado interno/financeiro.
**Why:** por isso a resposta é travada a uma allowlist de 3 números; qualquer outro no PV
é ignorado em SILÊNCIO (anti-ban, bot não fala com estranho). Allowlist casa pelos **11
dígitos finais** (DDD+número, tolera o DDI 55 da Z-API), override por env
`WHATSAPP_RESUMO_ALLOWED_PHONES`. **How to apply:** ao mexer na auth, não afrouxar pra
suffix curto (< 11) — vazaria frota+Fat pra número de outro DDD.

## Motor de faturamento (qual número)
Usa o MESMO caminho do CARD do Grid Operacional: `calcularFaturamentoLive` (motor
simplificado) + `despesas_pedagio` + `receitas_os` de `splitMissionCostsForBilling`, e o
`fatCalculado` congelado quando `custosCongeladosEm` está setado. **NÃO** usa o
`canonico`/`calcularEscolta` (esse é o do Balanço Gerencial). **Why:** o resumo é
operacional (contexto do Grid), então casa com o número que o dono vê na tela do Grid, não
com o do Balanço. É SÓ LEITURA — nenhum write de billing (respeita §8 INTOCÁVEIS).

## Classificação
- EM VIAGEM = OS com `status === "em_andamento"` e `missionStatus` NÃO em conjunto de
  finalizados (`encerrada/finalizada/retorno_base/chegada_base/cancelada/recusada`).
  `missionStatus` vazio/null em `em_andamento` conta como EM VIAGEM (estado transitório).
- Contagem "OS: N" por veículo = OSs do DIA (BRT), excluindo recusada/cancelada. Missão
  multi-dia em curso tem `osDateKey` de dia anterior ⇒ aparece em EM VIAGEM mas com "OS: 0".
- "Próxima viagem" (só disponível) = OS `agendada` com `scheduledDate` no futuro (nº da OS),
  senão "Não".
