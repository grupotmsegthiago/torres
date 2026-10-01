## Relatório de Entrega — Escopo operacional do Moacir Juvencio

**Data:** 2026-10-01
**Branch:** dev (não publicado)
**Commit(s):** não commitado
**Ambiente validado:** [x] local (teste unitário)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: `perfis-acesso`, `isThiago`, menu `layout.tsx`, `operational-grid`.
- Existente aproveitado: ACL de menu e o guard por pessoa já usado para o Thiago (`server/auth.ts`). O perfil `admin` não foi alterado.
- Algo novo criado? [x] Sim — regra só deste usuário. Inviabilidade: o JSON de `perfis_acesso` vale para o papel inteiro; restringir o papel `admin` tiraria o acesso dos outros administradores.

### O que foi alterado
- Somente o usuário Moacir Juvencio (admin, id 32, escoltas@torresseguranca.com.br) entra no painel operacional.
- Clientes, telefone, e-mail, módulos financeiros e valores aparecem como oculto ou deixam de ser entregues pela API.
- O nome do cliente na OS do grid permanece, para ele saber qual demanda está atualizando.

### O que NÃO foi alterado
- Papel e menu dos demais usuários, inclusive o Moacir Juvencio Filho (funcionário).
- Motor de faturamento, boletim, ledger e banco.

### Arquivos modificados
- `shared/moacir-escopo.ts` (+ teste)
- `server/lib/moacir-escopo-guard.ts`
- `server/create-app.ts`
- `client/src/App.tsx`
- `client/src/pages/admin/login.tsx`
- `client/src/components/admin/layout.tsx`
- `client/src/lib/moacir-ui.ts`
- `client/src/pages/admin/operational-grid.tsx`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/moacir-escopo.test.ts` | ver execução desta entrega |

### Resultados (negócio)
- Domínio dono: acesso / operação.
- Tipo do dado: projeção de tela (o fato no banco não muda).
- Risco: o Moacir deixa de abrir OS, clientes e financeiro. Atualização de status da missão no grid continua.
- Rollback: remover o guard e o filtro de menu deste usuário.

### Fora do escopo
- Publicação. Os outros administradores seguem iguais.
