## Relatório de Entrega — Ricardo Tadeu administrador sem financeiro

**Data:** 2026-10-03
**Branch:** `cursor/ricardo-admin-sem-financeiro-8c7c`
**Ambiente validado:** [x] local (teste unitário)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca: `Ricardo Tadeu`, `perfis-acesso`, `isMoacirRestrito`, `moacir-escopo`, `canActAsFinanceiro`, `users.role`.
- Existente aproveitado: recorte por pessoa do Moacir (menu + guard de API); catálogo `perfis_acesso` não foi alterado.
- Algo novo criado? [x] Sim — regra só deste usuário. Inviabilidade: o JSON de `perfis_acesso` vale para o papel inteiro; restringir o papel `admin` tiraria Balanço/Contas/NF dos demais administradores. Papel `funcionario` bloqueia o painel admin (`ProtectedRoute`).

### O que foi alterado
- Ricardo Tadeu ativo (users.id 46, hoje `funcionario` ligado ao employee 53) passa a poder ser **administrador operacional**.
- Menu e rotas escondem Controladoria: Contas, Balanço Gerencial, Relatório de NFs, Faturamento da Diretoria, custos fixos, conciliações, fornecedores, faturas, Inter.
- APIs financeiras (`/api/financial`, invoices, Asaas, NFS-e, balanço, etc.) respondem 403 para ele.
- `canActAsFinanceiro` também recusa este usuário.
- Cadastro desativado (users.id 14 / employee 16 `bloqueado_definitivo`) **não** é promovido.

### O que NÃO foi alterado
- Papel e menu dos demais admins, Moacir, financeiro, comercial.
- Motor `calcularEscolta`, boletim, ledger, RLS.
- `role` no banco ainda é `funcionario` até a publicação + UPDATE (ver pendências). Não foi alterado agora para ele não virar admin pleno em produção antes do código entrar.

### Arquivos modificados
- `shared/ricardo-escopo.ts` + teste
- `server/lib/ricardo-escopo-guard.ts`
- `server/create-app.ts`
- `server/auth.ts`
- `client/src/App.tsx`
- `client/src/components/admin/layout.tsx`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma migration. Após publicar: `UPDATE users SET role = 'admin' WHERE id = 46 AND role = 'funcionario';`

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/ricardo-escopo.test.ts` | ver execução desta entrega |

### Resultados (negócio)
- Domínio dono: acesso / ACL por usuário.
- Tipo do dado: projeção de tela (fatos no banco intactos).
- Risco: até publicar + UPDATE do role, ele continua no app de campo. Depois, vê operação/comercial/RH, não vê controladoria.
- Rollback: reverter o PR e, se o role já tiver sido promovido, `UPDATE users SET role = 'funcionario' WHERE id = 46`.

### Fora do escopo
- Publicação em produção (aguardar pedido explícito).
