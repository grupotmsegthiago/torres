## Relatório de Entrega — /admin/usuarios tela branca

**Data:** 2026-09-01
**Branch:** `cursor/fix-usuarios-tela-branca-4118`
**Ambiente validado:** [x] local (teste)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `UsersPage`, `useAuth`, rota `/admin/usuarios`, `perfis-acesso-panel`
- Existente: hook `useAuth` já usado na página; o import foi apagado no commit `2f815ef0`
- Algo novo criado? [x] Não — restauro do import + teste de regressão no `safe-user.test.ts`

### ★ Causa raiz
`client/src/pages/admin/users.tsx` chama `useAuth()` sem importar. O chunk lazy falha com `ReferenceError` e, sem Error Boundary, a rota fica branca.

### O que foi alterado
- Restaurado `import { useAuth } from "@/hooks/use-auth"`
- Lista de usuários tolerante a payload não-array / nome vazio (evita segundo crash)
- Teste de regressão no arquivo que já protege a UI de usuários

### O que NÃO foi alterado
- API `/api/users`, ACL, senhas, outras telas

### Domínio / tipo
Satélite de apresentação (cadastro `users`). Sem escrita financeira.

### Testes
| Comando | Resultado |
|---------|-----------|
| `npx tsx --test server/lib/safe-user.test.ts` | 17/17 pass |

### Segurança
- Secrets no diff? [x] Não

### Deploy
Não publicar nesta entrega, salvo pedido explícito.

### Rollback
Reverter o commit do import.

### Resumo
1. Tela branca = crash no load do chunk.
2. Faltava o import do `useAuth` desde o PR de perfis.
3. Import restaurado; teste impede regressão.
