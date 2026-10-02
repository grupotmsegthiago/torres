## Relatório de Entrega — Liberar OS / Boletim / Relatório Faturamento para Moacir

**Data:** 2026-10-02
**Branch:** `cursor/moacir-liberar-tres-telas-a714`
**Ambiente validado:** [x] local (teste unitário)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca: `shared/moacir-escopo.ts`, `moacirEscopoGuard`, filtro `isMoacir` em `layout.tsx`, relatório `RELATORIO-ENTREGA-MOACIR-ESCOPO-OPERACIONAL-2026-10-01.md`.
- Existente aproveitado: allowlist de rotas + bloqueio de API por usuário (sem alterar `perfis_acesso` do papel admin).
- Algo novo criado? [x] Não — só extensão da allowlist e dos prefixes bloqueados.

### O que foi alterado
- Moacir Juvencio (admin id 32) passa a ver no menu e a abrir:
  - Ordens de Serviço (`/admin/service-orders`)
  - Boletim de Medição (`/admin/boletim-medicao`)
  - Relatório Faturamento (`/admin/relatorio-faturamento`)
- APIs necessárias a essas telas liberadas: `service-orders` (lista/PDF/custos), `clients`, `employees`, `boletim*`, `escort/billings`.
- Valores de faturamento deixam de ser redigidos na API (senão boletim/relatório ficam inúteis). Telefone/e-mail/apikey seguem ocultos.

### O que NÃO foi alterado
- Filho (funcionário) e demais admins.
- Menu Clientes, Financeiro, Balanço, Controle de Faturamento, Usuários, Chat, Asaas/NFSe diretos.
- Motor `calcularEscolta`, snapshots de boletim, ledger.

### Arquivos modificados
- `shared/moacir-escopo.ts`
- `shared/moacir-escopo.test.ts`
- `client/src/components/admin/layout.tsx`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/moacir-escopo.test.ts` | ver execução desta entrega |

### Resultados (negócio)
- Domínio dono: acesso / ACL por usuário.
- Tipo do dado: projeção de tela (fatos no banco intactos).
- Risco: Moacir vê valores comerciais nas três telas; demais módulos financeiros continuam fechados.
- Rollback: reverter allowlist/APIs/redação ao estado do commit anterior.

### Fora do escopo
- Publicação em produção (aguardar pedido explícito).
