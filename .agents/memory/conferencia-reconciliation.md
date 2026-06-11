---
name: Conciliação read-only de boletim externo (Conferência TM SEG)
description: Padrão de matching/aceite e mapeamento de colunas para conciliar planilha externa contra faturamento do sistema sem gravar nada.
---

# Conferência de boletim externo × faturamento (read-only)

Feature aditiva que recebe um boletim externo e concilia contra `escort_billings`+`service_orders`+`escort_contracts` via `supabaseAdmin`, só mostrando divergências. **Nunca grava** (correção é manual depois).

## Dois layouts de boletim diferentes (cuidado com as colunas)
A planilha pode vir em DOIS layouts distintos, parseados pelo MESMO `findHeaderRow` (cabeçalho por NOME/alias):
- **Layout do sistema** (boletim que o Torres gera): `KM INICIAL/KM FINAL/KM TOTAL` explícitos; placa em "VIATURA"; só **uma** coluna "TOTAL" (o valor final).
- **Layout TORRES (fornecedor)**: usa `INICIAL/FINAL/TOTAL` (sem "KM"); placa em "VIATURA" (col K); e tem **5 colunas "TOTAL"** (km, horas, km extra R$, hr extra R$, e o grande total). O valor final é a ÚLTIMA "total"; o km total é a 1ª "total" logo após "FINAL".

**Regra de mapeamento (vale p/ ambos):** valor final = a **última** coluna "total"; km total = "km total" explícito OU, se ausente, a 1ª "total" após a coluna de km final. No layout do sistema last===first, então a regra não altera nada lá.
**Why:** parser antigo (feito p/ o layout do sistema) lia a 1ª "total" (= km total) como valor final no layout TORRES → mostrava "valor final" absurdo (ex.: R$1.344 que era km) e fabricava dezenas de divergências falsas.

## Matching: DATA + PLACA + (KM inicial **ou** KM final) é OBRIGATÓRIO
Candidatos = mesma `DATA(BRT)|PLACA(normalizada)` (fallback ±1 dia p/ missões que viram a noite). **Aceite exige** KM inicial OU KM final batendo (tol. `MATCH_TOL_KM`=5km). Nº da OS, km total e rota só DESEMPATAM entre candidatos que já têm o KM batendo — não bastam sozinhos.
**Why (regra do dono):** o nº da planilha do fornecedor (ex.: 4989) NÃO é o nº da OS do sistema (TOR-0194); casar só por data+placa pega a missão errada quando há >1 no dia. O KM físico (odômetro) é a identidade real da OS. KM=0 conta como "ausente" (não casa) — odômetro não registrado não deve casar duas missões zeradas.

## Lado cliente vs fornecedor (mesma OS, valores comparáveis)
A planilha do CLIENTE (TM SEG, client_id=6) é o boletim que o sistema gera → bate 1:1 com `escort_billings`. A planilha TORRES (fornecedor) cobre as MESMAS OSs e seu grande total é comparável ao `fat_total` do sistema (ex.: 12.579 vs 12.561 — diferença real pequena, não cost-vs-revenue). Conciliar a planilha TORRES é feito selecionando o cliente TM SEG (não há billings sob o "cliente" TORRES).

## Rota = CIDADE (Origem × Destino), não o nome do local
`escort_billings.origem/destino` e `service_orders.origin/destination` guardam o ENDEREÇO COMPLETO (ex.: "Mineração Taboca - ... - Pirapora do Bom Jesus - SP, CEP, Brasil"), não a cidade. `extractCity` deve pegar o trecho ANTES do "- UF"/", UF" (e a última parte após vírgula em "BAIRRO, CIDADE"); pegar o 1º pedaço devolve o nome do local/empresa ("MINERAÇÃO TABOCA"). A rota só desempata o match (+2), KM continua sendo o aceite — melhorar a cidade não regride o match.

## Gotchas
- Janela de busca: `data_missao` ±3 dias. Aritmética de data SEM `toISOString()` de Date local → `Date.UTC(y,m-1,d)` + `setUTCDate`.
- `parseNum` aceita BR (`5.947,20`) e US (`5947.2`) e objeto de fórmula do exceljs.
- Rota financeira: `requireAuth, requireAdminRole` (de `../auth`).
- Upload: base64 cru em JSON (NÃO multer); WAF bloqueia só o prefixo `data:image/...;base64,`.
- Testes: unit puro do mapeamento de colunas (sem DB) em `server/routes/conferencia-tmseg.test.ts`; teste com arquivos reais (precisa DB) em `.local/test_conferencia_torres_layout.mts`.
