---
name: Proposta comercial (Gerar Proposta) do cliente
description: Como o PDF de proposta por cliente é montado e a regra de ACIONAMENTO definida pelo dono.
---

# Gerar Proposta (PDF comercial por cliente)

Fluxo: aba TABELA da tela de cliente (componente ClientPastaView), seção **"Tabela de Preços"** — cada tabela de preço (EscortContract) é uma linha da proposta. O usuário marca tabelas por checkbox (há um "Selecionar todas" no header da lista, que opera sobre o resultado filtrado pela busca), clica "Gerar Proposta" e o PDF é gerado 100% no browser via `generatePresentation(clientName, ProposalOptions)`. Não há modal — gera direto, com spinner no botão.

**Por que tabelas e não a seção "Rotas Frequentes":** os clientes cadastram as rotas como tabelas de preço nomeadas (ex.: "ORIGEM - BR x 800 KM"), cada uma já com franquia_km, franquia_horas, valor_km_extra, valor_hora_extra e valor_acionamento — exatamente as colunas da página "ROTAS & FRANQUIAS". A seção "Rotas Frequentes" (EscortRoute) costuma estar vazia. Decisão do dono (24/06/2026).

O gerador (`client/src/lib/presentation.ts`) reaproveita a apresentação comercial e acrescenta página "ROTAS & FRANQUIAS" (monocromática, modelo IMG_2795), fotos reais das viaturas (campo `photoFront` de `/api/vehicles`, buscado dentro do handler) e contatos (site + Instagram + WhatsApp). `ProposalRoute` carrega valores autossuficientes por linha (origem/destino + franquia + excedente + acionamento); não há mais `ProposalContract` único.

Origem/destino são derivados do nome da tabela em `clients.tsx` (`parseTableRoute`): remove o sufixo " x NNN KM" e separa por " - ".

## Regra de negócio (decisão do dono)
- **ACIONAMENTO da proposta = `valor_acionamento` da tabela** (que no cadastro equivale a `franquia_km × valor_km_extra`); fallback para `franquia_km × valor_km_extra` se zerado.
- **Why:** é o número que o dono já vê na coluna ACIONAMENTO da lista de tabelas; a proposta deve bater com a tela. Origem da regra: "ACIONAMENTO = km × valor_km_extra" (modelo IMG_2795).
- **How to apply:** ao mexer na coluna ACIONAMENTO do PDF, manter esse valor; mudança de fórmula precisa de pedido explícito.

## Nota de design
A narrativa do PDF segue preto+vermelho da marca; SÓ a página de tabela é monocromática (réplica do modelo). Tudo monocromático seria follow-up.
