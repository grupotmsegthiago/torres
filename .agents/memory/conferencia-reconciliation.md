---
name: Conciliação read-only de boletim externo (Conferência TM SEG)
description: Padrão de matching/aceite para conciliar planilha externa contra faturamento do sistema sem gravar nada.
---

# Conferência de boletim externo × faturamento (read-only)

Feature aditiva que recebe um boletim externo (MESMO layout do que o sistema gera) e concilia contra `escort_billings`+`service_orders`+`escort_contracts` via `supabaseAdmin`, só mostrando divergências. **Nunca grava** (correção é manual depois).

## Matching por chave composta + confiança mínima
Chave = `DATA(BRT)|PLACA(normalizada)`. Score: OS exata=5, KM inicial≈=3, KM final≈=3, KM total≈=2, rota≈=2.
**Regra de aceite (evita par errado):** aceitar SE candidato exato único (data+placa é forte o bastante p/ pegar divergência de KM/valor) OU houver corroboração `score>=2`. Sem isso → "fora do sistema" em vez de forçar um par.
**Why:** date+placa pode ter >1 missão/dia; pegar o "melhor" com score 0 fabrica divergência falsa e esconde missing real.

## Lado cliente vs fornecedor
A planilha do CLIENTE (ex.: TM SEG, client_id=6) bate 1:1 com `escort_billings` daquele client_id (é o boletim que o sistema gera → totais idênticos). A planilha "TORRES" é perspectiva FORNECEDOR (numero=processo, valores = custo, não receita) e **não** tem billings sob client_id=2 (TORRES é a empresa, não cliente faturável). Conciliar fornecedor exigiria comparar contra custo, não receita — escopo separado.

## Gotchas
- Janela de busca: `data_missao` ±3 dias (missões multi-dia). Aritmética de data SEM `toISOString()` de Date local → usar `Date.UTC(y,m-1,d)` + `setUTCDate` p/ ser TZ-independente em datas-only.
- Parser: cabeçalho detectado por NOME (aliases), não por posição → robusto à coluna extra PROCESSO do layout Omega. `parseNum` aceita BR (`5.947,20`) e US (`5947.2`) e objeto de fórmula do exceljs.
- Rota financeira: guardar com `requireAuth, requireAdminRole` (de `../auth`) — é a convenção das rotas financeiras (conciliacao.ts), não só `req.user`.
- Upload: base64 em JSON (NÃO multer); WAF só bloqueia prefixo `data:image/...;base64,`, base64 cru passa.
