## Relatório de Entrega — Header iPhone da área interna

**Data:** 2026-10-03
**Branch:** `cursor/iphone-header-safe-area-8c7c`
**Ambiente validado:** [x] local (teste de contrato)  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca: `safe-area`, `safe-area-inset-top`, `fix-admin-iphone-safe-area`, `layout.tsx` header `lg:hidden`.
- Existente aproveitado: o patch já escrito em `4ad5e76d` / `1ff18563` (não estava na `main`). Classes `.safe-area-top` do app do vigilante. `viewport-fit=cover` em `client/index.html`.
- Algo novo criado? [x] Não — reaplicação + teste de contrato para não perder de novo.

### Causa raiz
- `apple-mobile-web-app-status-bar-style=black-translucent` desenha o conteúdo sob o relógio.
- Header usava `py-3` sem `safe-area-inset-top`.
- O pedido anterior ficou só na branch `cursor/fix-admin-iphone-safe-area-6527` e **não foi publicado**.

### O que foi alterado
- Header mobile: `pt-[calc(0.75rem+env(safe-area-inset-top,0px))]`, botão de menu 44px.
- Drawer: recuo no topo/base, botão fechar, fecha ao mudar de rota.
- `h-dvh` no shell.

### O que NÃO foi alterado
- Meta tags PWA, app do vigilante, ACL Moacir/Ricardo, regras de negócio.

### Arquivos modificados
- `client/src/components/admin/layout.tsx`
- `shared/admin-layout-iphone.test.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`
- este relatório

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/admin-layout-iphone.test.ts` | ver execução desta entrega |

### Resultados (negócio)
- Domínio dono: apresentação (área interna).
- Tipo do dado: projeção de tela.
- Risco: baixo. Sem recuo o menu continua morto no iPhone.
- Rollback: reverter o commit.

### Fora do escopo
- Publicação (aguardar pedido explícito). Conferência num iPhone físico após o deploy.
