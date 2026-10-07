## Relatório de Entrega — Login da gestão por e-mail ou CPF

**Data:** 2026-10-03
**Branch:** `cursor/gestao-login-cpf-admin-8c7c`
**Ambiente validado:** [x] local (teste de contrato)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca: `cpf-lookup`, `loginMode`, `isPrivilegedRole`, `isCpfInput`.
- Existente aproveitado: `POST /api/auth/cpf-lookup`, aba Gestão, `isPrivilegedRole`.
- Algo novo criado? [x] Não — extensão do lookup (`gestao: true`) e da aba já existente.

### Causa raiz
- Aba Gestão só aceitava e-mail (`type=email`).
- Ricardo Tadeu (id 46) ainda está `funcionario` no banco; CPF na aba Funcionário cai no app de campo e a gestão recusa.

### O que foi alterado
- Gestão: campo “E-mail ou CPF”.
- Lookup com `gestao: true` só libera admin/diretoria.
- Cliente: se alguém com papel funcionário autenticar na aba Gestão, sai e vê recusa.

### O que NÃO foi alterado
- Aba Funcionário (CPF → app de campo).
- Papel no banco do Ricardo (SQL da sessão é só leitura).

### Arquivos modificados
- `shared/perfis-acesso.ts` + teste
- `server/routes.ts`
- `client/src/pages/admin/login.tsx`
- changelog + este relatório

### Banco / migrations
- [x] Nenhuma. Pendente: `UPDATE users SET role = 'admin' WHERE id = 46 AND role = 'funcionario';` na tela Usuários.

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/perfis-acesso.test.ts` | ver execução desta entrega |

### Resultados (negócio)
- Domínio dono: acesso / auth.
- Tipo do dado: fato `users.role` (não alterado aqui).
- Risco: comercial/financeiro não entram por CPF na gestão (e-mail segue válido).
- Rollback: reverter o commit.

### Fora do escopo
- Publicação (token GitHub recusou push da `main` nesta sessão).
