## Relatório de Entrega — Posição confirmada na operação e no abastecimento

**Data:** 3 de novembro de 2026
**Branch:** `cursor/posicao-confirmada-telas-b534`
**Commit(s):** neste branch, a partir de `c1656e8b`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Não  [ ] Sim

### Reutilização (D11 / P13)
- Busca realizada: mapa e frase em `onde-abastecer.tsx`, GPS de `use-geolocation`, cartão de texto em `abastecimento.tsx`, telas `missao.tsx` e `ponto-operacional.tsx`.
- Existente aproveitado: o mesmo mapa (Google ou OpenStreetMap) e a mesma frase com precisão. O GPS contínuo do layout não foi duplicado.
- Algo novo criado? [x] Não  [ ] Sim — o componente só junta o que a tela do Onde abastecer já mostrava.

### O que foi alterado
- Missão, ponto operacional e abastecimento mostram o mapa da posição e a frase "Posição confirmada · latitude, longitude · precisão N m".
- O abastecimento, se não conseguir uma leitura nova na hora de salvar, grava a posição que já está na tela.

### O que NÃO foi alterado
- Horas do ponto operacional, `calcularEscolta`, boletim, balanço e o preço do abastecimento.
- A grade operacional do escritório.

### Arquivos modificados
- `client/src/components/mobile/posicao-confirmada.tsx`
- `client/src/components/mobile/posicao-confirmada.test.ts`
- `client/src/pages/mobile/onde-abastecer.tsx`
- `client/src/pages/mobile/abastecimento.tsx`
- `client/src/pages/mobile/missao.tsx`
- `client/src/pages/mobile/ponto-operacional.tsx`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test client/src/components/mobile/posicao-confirmada.test.ts` | 2 pass / 0 fail |

### Resultados (negócio)
Quem abastece ou está em missão vê o mesmo mapa e a mesma precisão que confirmaram a posição no Onde abastecer.

### Regressões verificadas
- O Onde abastecer continua com o pino da pessoa, os postos e o raio.
- O ponto operacional não passou a gravar coordenada nem a mudar hora.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- `c1656e8b` na `main`.

### Deploy
- Não publicado neste passo.

### Pendências
- O celular só mostra o mapa nessas telas depois da publicação.

### Gates G1–G17
- [x] N/A financeiro. G17 registrado acima. A tela pede login; a verificação visual no navegador desta máquina não entrou na sessão do agente.

### Resumo executivo (3 linhas)
1. A posição que funcionou no Onde abastecer agora abre na missão, no ponto operacional e no abastecimento.
2. É o mesmo mapa e a mesma frase, com a precisão em metros.
3. O custo do abastecimento e as horas do ponto não mudam.
