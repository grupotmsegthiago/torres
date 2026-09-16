## Relatório de Entrega — Grid: origem/destino ao lado da placa + linha de evolução da missão

**Data:** 2026-09-09  
**Branch:** `dev`  
**Commit(s):** (ainda não commitado)  
**Ambiente validado:** [ ] local  [ ] preview  [ ] produção  
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca realizada: `origin`/`destination` em `server/routes/operational.ts`; `RouteProgressBar` / `getRouteProgress` / `getMissionProgress` em `operational-grid.tsx`.
- Existente aproveitado: campos já enviados pela API (`clientName`, `origin`, `destination`, lat/lng); barra compacta já usada na visão em tabela.
- Algo novo criado? [x] Não (só helpers de rótulo no mesmo arquivo + reexibição). Sem nova API, tabela ou motor.

### O que foi alterado
- Card âmbar “viatura com atualizações”: ao lado da placa, nome do cliente + origem / destino da OS.
- Barra no padrão da TMSEG: `ACOMPANHAMENTO X.XKM` à esquerda, `X% SALVO` à direita, trilha em cápsula com degradê Torres (âmbar → índigo → negro) e marcador de viatura. Posição do carro = % de `getRouteProgress` (GPS) ou etapa da missão.
- Card principal e visão tabela: origem / destino visíveis junto da identidade da viatura.

### O que NÃO foi alterado
- Motor de faturamento, ledger, boletim, APIs, schema.
- Repositório TM SEG (zero diff). Layout inspirado na ideia da linha de evolução; cálculo continua o do Torres.

### Arquivos modificados
- `client/src/pages/admin/operational-grid.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| Suíte financeira (G1–G17) | N/A — só projeção de UI |
| Linter do arquivo | sem erros |

### Resultados (negócio)
Operador vê, no card da viatura (ex.: TOR-0797 / UDE1087), quem é o cliente e a rota origem/destino, mais a % de evolução da missão sem abrir a OS.

### Regressões verificadas
- Barra compacta da tabela continua a mesma função (`getRouteProgress`); só o rótulo passou a incluir %.
- Sem browser MCP / servidor local nesta sessão — validação visual pendente no Grid Operacional.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter o diff de `operational-grid.tsx`.

### Rollback
- `git checkout -- client/src/pages/admin/operational-grid.tsx`

### Riscos / pendências
- Print da TMSEG não chegou; se o layout do print divergir, ajustar só a apresentação (não o cálculo).
- Origem/destino longos são truncados; tooltip mostra o texto completo.

### Próximo passo
- Conferir no Grid Operacional (card âmbar + card da viatura).
- Publicar só se o proprietário pedir.

### Declaração
- **Domínio dono:** Operational Grid (`/api/operational-grid`)
- **Tipo do dado:** PROJEÇÃO
- **Camada:** 10 (UI operacional)
- **Reutilização:** estender tela existente
- **Risco:** baixo (só display)
- **Gates:** UI; sem escrita financeira
