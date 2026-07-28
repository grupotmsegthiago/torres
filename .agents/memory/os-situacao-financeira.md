---
name: Situação financeira por OS
description: Como o status de recebimento por OS é derivado e consumido nas telas
---
Regra: a situação financeira de uma OS é SEMPRE projeção derivada (billing + invoice + status da OS) calculada no servidor (`derivarSituacaoFinanceira`), nunca flag manual nem cálculo no front — telas consomem o `porOs` do endpoint batch `POST /api/os-financeiro/situacao`.

**Why:** evita divergência entre telas e preserva §8.1 (recusada=SEM_COBRANCA); um flag manual dessincroniza do gateway.

**How to apply:**
- Novo consumidor: usar o hook `useSituacaoFinanceira` (já divide em lotes de 500; endpoint recusa >2000 ids por chamada).
- Status do gateway tem grafias duplas (`CANCELLED`/`CANCELED`) e `AWAITING_PAYMENT` conta como em aberto; status desconhecido vira DIVERGENCIA explicada — ao integrar novo gateway, ampliar os Sets em `server/lib/os-financeiro.ts` + testes.
- Fatura agrupada: mesma invoice com N billings é informada via `faturaQtdOs`.
- `escort_billings` tem NOT NULL em `km_inicial` e `invoices` exige `description`/`due_date` — lembrar em testes vivos.
