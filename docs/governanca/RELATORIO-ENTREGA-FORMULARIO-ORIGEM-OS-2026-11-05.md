## Relatório de Entrega — Origem e destino do formulário na OS certa

**Data:** 2026-11-05
**Branch:** `cursor/formulario-origem-os-7ab0`
**Commit(s):** ponta da branch
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `buildReportVars`, `generateReportAsync`, `prepararRelatorioAlerta`, grade operacional, TOR-1215 vs TOR-1178 no banco.
- Existente aproveitado: grade (`origin`/`destination` por OS), `activeOs`, `upcomingOrders`.
- Algo novo criado? [x] Sim — `shared/formulario-os.ts` só resolve qual OS manda no formulário. Sem tabela nem motor de cobrança.

### Domínio e tipo do dado
- Domínio dono: operação de campo / formulário WhatsApp.
- Tipo: leitura de Fato (`service_orders`) no relatório. Não altera billing.

### O que foi alterado
- Evidência: TOR-1215 no banco é Embragen → DHL Osasco; TOR-1178 é RJC Lorena → Viracopos. O formulário da TOR-1215 saía com a rota da TOR-1178 porque `pick()` caía na `activeOs` da outra missão.
- O formulário resolve a OS alvo (grade / upcoming / activeOs com o mesmo número) e não mistura rota entre OS.
- O aviso de atualização monta a ficha pela grade da OS quando a ativa na viatura é outra.
- No painel de OS, enquanto a missão em curso da viatura não acaba, a próxima OS da mesma placa não aparece na lista (só na busca pelo número).

### O que NÃO foi alterado
- Billing, boletim, `calcularEscolta`.
- Dados gravados em TOR-1215 / TOR-1178.

### Arquivos modificados
- `shared/formulario-os.ts`, `shared/formulario-os.test.ts`
- `client/src/pages/admin/operational-grid.tsx`
- `client/src/components/painel-v2/alerta-ficha.ts`, `alerta-ficha.test.ts`
- `server/routes/operational.ts` (lat/lng da grade)
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando | Resultado |
|---|---|
| `npx tsx --test shared/formulario-os.test.ts shared/os-viatura.test.ts client/src/components/painel-v2/alerta-ficha.test.ts` | 11 pass |

### Resultados (negócio)
Compartilhar a TOR-1215 leva Embragen → Osasco. A TOR-1178 na mesma viatura não entra mais na origem/destino.

### Pendências
- Na operação: limpar/trocar a viatura da TOR-1215 se ainda apontar para TMG0E84.

### Resumo executivo
1. Formulário misturava rota de outra OS na mesma placa.
2. Agora origem e destino vêm só da OS do relatório.
3. Testes cobrem TOR-1215 vs TOR-1178.
