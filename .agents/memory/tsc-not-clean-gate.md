---
name: tsc não é gate limpo neste projeto
description: npm run check / tsc tem centenas de erros pré-existentes; não tratar como CI verde
---

`npm run check` (= `tsc`) acusa ~425 erros pré-existentes no projeto inteiro. Um padrão recorrente é `parseInt(req.params.id)` em rotas Express dando `Argument of type 'string | string[]' is not assignable to parameter of type 'string'` (os types do Express estão configurados de forma frouxa). Esses erros existem no HEAD.

**Why:** rodar `tsc` e ver erros NÃO significa que você quebrou algo. Tratar tsc como gate verde leva a caça-fantasma.

**How to apply:** ao validar suas mudanças com tsc, filtre só pelos arquivos que você editou e compare contra o baseline (os `parseInt(req.params.id)` e similares já estavam lá). Foque em erros NOVOS introduzidos pela sua mudança, não no total.
