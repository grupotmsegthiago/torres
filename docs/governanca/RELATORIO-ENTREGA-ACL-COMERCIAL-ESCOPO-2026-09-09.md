## Relatório de Entrega — ACL de linha do perfil comercial

**Data:** 2026-09-09
**Branch:** `dev`
**Commit(s):** (pendente até o proprietário pedir commit/publicação)
**Ambiente validado:** [x] local (testes de contrato)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `responsavel_comercial_id`, `requireComercial`, `perfis-acesso`, `GET /api/clients`, `GET /api/service-orders`, `toSafeUser`.
- Existente aproveitado: UUID TM SEG já gravado em `clients.responsavel_comercial_id`; `requireRoles` (admin/diretoria continuam irrestritos); rotas e telas atuais (sem segundo cadastro de comerciais).
- Algo novo criado? [ ] Não  [x] Sim — inviabilidade: não havia mapeamento `users` ↔ UUID TM SEG nem `created_by_user_id` no cliente; filtro só na UI vazaria via API.

### O que foi alterado
- Perfil comercial só vê clientes vinculados a ele **ou** cadastrados por ele.
- OS, veículos, billing, boletim, contratos tarifários, rotas e contratos documentais seguem o mesmo conjunto de clientes.
- Admin/diretoria/financeiro/funcionário não são filtrados por esta regra.

### O que NÃO foi alterado
- Motor `calcularEscolta`, ledger, snapshot de boletim, tabela `comerciais` (continua proibida).
- ACL de menu (`perfis-acesso`).
- Visibilidade de OS do funcionário no campo.

### Arquivos modificados
- `server/lib/comercial-scope.ts` + testes
- `shared/schema.ts`, `server/db-init.ts`, `server/lib/safe-user.ts`, `server/lib/user-write.ts`
- `server/routes/clients.ts`, `service-orders.ts`, `escort.ts`, `leads.ts`, `hr.ts`
- `client/src/pages/admin/users.tsx`, `clients.tsx`, `client/src/lib/auth-api.ts`
- `docs/governanca/03-FONTES-DA-VERDADE.md`, `CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Sim (idempotente via `db-init`, sem FK):
  - `users.comercial_id UUID`
  - `clients.created_by_user_id INTEGER`
  - índices em `responsavel_comercial_id` e `created_by_user_id`

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `server/lib/comercial-scope.test.ts` | pass |
| `server/lib/safe-user.test.ts` | pass |
| `server/lib/stop-plain-password-writers.test.ts` | pass |
| `shared/perfis-acesso.test.ts` | pass |
| Suíte conjunta (64 testes) | pass |

### Resultados (negócio)
Comercial deixa de ver carteira, OS e faturamento de cliente de outro vendedor; só aparece o que está no nome dele ou o que ele cadastrou.

### Regressões verificadas
- Funcionário continua acessando OS atribuída (middleware ignora role ≠ comercial).
- Financeiro/admin continuam vendo todos os clientes.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Sim — fail-closed no servidor (404, lista vazia); RLS de `users` não ganhou GRANT novo (leitura via service_role / `USER_SAFE_SELECT`).

### Backup / ponto de restauração
Rollback: reverter o commit; colunas novas podem permanecer (não quebram leitores antigos).

### Pendências / próximo passo
1. Em **Usuários e perfis**, vincular cada usuário comercial ao UUID da TM SEG (Miguel, Cassiane, etc.).
2. Clientes já existentes só aparecem para o comercial se `responsavel_comercial_id` estiver preenchido com o mesmo UUID.
3. Publicar somente com pedido explícito.

### Gates (resumo)
G1 reutilização · G3 SSOT UUID TM SEG · G5 fail-closed · G9 testes de contrato · G17 relatório.
