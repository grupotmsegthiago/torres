---
name: Sandbox bash — processos e buffers
description: Limitações do bash do agente ao rodar testes longos (>2min) neste projeto.
---

- Processos em background (`nohup`, `setsid ... &`) são MORTOS quando o comando bash retorna — não dá pra "deixar rodando e olhar depois" entre chamadas.
- Pipe por `grep` segura o stdout em buffer: se o comando é morto por timeout, a saída some inteira. Padrão que funciona: `timeout N cmd > /tmp/x.log 2>&1; grep ... /tmp/x.log`.
- `process.env` NÃO existe no notebook de code_execution — scripts que precisam de secrets rodam via `npx tsx` no bash (lá os env vars do projeto existem).
- Teste que excede 120s: fatiar por cenário via flag CLI (ex.: `--ep=nome`) e/ou rodar chamadas independentes em `Promise.all` pra caber no orçamento.

**Why:** teste de paridade do Balanço (endpoints de 40s+) falhava mudo com exit -1; a causa era buffer do grep + kill de background, não o teste.
