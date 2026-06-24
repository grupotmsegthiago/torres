---
name: Proposta comercial (Gerar Proposta) do cliente
description: Como o PDF de proposta por cliente é montado e a regra de ACIONAMENTO definida pelo dono.
---

# Gerar Proposta (PDF comercial por cliente)

Fluxo: aba TABELA da tela de cliente (componente ClientPastaView), seção "Rotas Frequentes" — usuário marca rotas por checkbox, clica "Gerar Proposta", escolhe a Tabela de Preços num modal (auto-seleciona quando o cliente tem só 1 tabela) e o PDF é gerado 100% no browser via `generatePresentation(clientName, ProposalOptions)`.

O gerador (`client/src/lib/presentation.ts`) reaproveita a apresentação comercial existente e acrescenta página "ROTAS & FRANQUIAS" (monocromática, modelo do dono), fotos reais das viaturas (campo `photoFront` de `/api/vehicles`) e contatos (site + Instagram + WhatsApp).

## Regra de negócio (decisão do dono — INTOCÁVEL sem ordem)
- **ACIONAMENTO da proposta = `estimated_km × valor_km_extra` da tabela escolhida.**
- **Why:** ordem direta do dono (modelo IMG_2795). Não confundir com `valor_acionamento` do contrato nem com o cálculo real de `calcularEscolta` — a proposta é uma estimativa comercial plana por rota.
- **How to apply:** ao mexer na coluna ACIONAMENTO do PDF de proposta, manter a fórmula km×valor_km_extra; qualquer mudança de fórmula precisa de pedido explícito.

## Nota de design
A narrativa do PDF segue preto+vermelho da marca; SÓ a página de tabela é monocromática (réplica do modelo). Se o dono pedir tudo monocromático é follow-up.
