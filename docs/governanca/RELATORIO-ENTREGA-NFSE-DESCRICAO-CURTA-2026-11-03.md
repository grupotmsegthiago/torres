## Relatório de Entrega — Descrição curta da NFS-e

**Data:** 2026-11-03
**Branch:** `cursor/nfse-descricao-curta-b534`
**Commit(s):** `7c15b38e`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Sim — fast-forward de `cursor/nfse-descricao-curta-b534` em `main` e `dev`, para a próxima emissão da fatura 241 usar o texto novo.

### Domínio e dado
- Domínio: NFS-e (satélite Focus). Dono do texto comercial continua `invoices.description`.
- Tipo: o texto da DPS é montado na emissão. Não é fato novo, não grava coluna e não altera valor.

### Reutilização (D11 / P13)
- Busca realizada: `buildDefaultNfseDescription`, `isMultilogClient`, `multilogDiscriminacaoLines`, `processo_omega`, `gtm_number`, `OMEGA SOLUTIONS`.
- Existente aproveitado: o mesmo construtor da descrição da DPS; as linhas `OS.` / `SM.` da MULTILOG; o rótulo `PROCESSO` / `PROCESSOS` do boletim da Omega Solutions.
- Algo novo criado? Não. Não há segunda descrição de boleto nem coluna nova. O vínculo GTM da TM SEG continua só na OS e no WhatsApp — a nota da TM SEG que a Beatriz colou não pede esse número.

### O que foi alterado
- A sugestão que o modal e a emissão automática mandam para a Focus deixa de listar todos os números de OS.
- Para a TM SEGURANÇA, o texto fica assim quando há INSS retido:

```
Ref. escolta armada (16/10/2026 a 31/10/2026)
Retenção de INSS sobre cessão de mão-de-obra (ANEXO IV) - Art. 111, II da IN RFB nº 2.110/2022
Empresa optante pelo Simples Nacional. Não sujeita à retenção das contribuições conforme art. 30 da Lei 10.833/2003
```

- MULTILOG: entram só a OS e a SM do cliente, no formato que o boleto já usa (`OS. 1312` / `SM. 41128477`).
- Omega Solutions: entra o processo, no mesmo rótulo do cabeçalho do boletim (`PROCESSO` ou `PROCESSOS`).
- PIX, agência ou dados bancários que já estejam escritos na fatura continuam no rodapé.

### O que NÃO foi alterado
- `invoices.description`, boleto Asaas, `buildServicoDiscriminacao`, motor `calcularEscolta`, valor, retenção de INSS e o payload fiscal da DPS (regime do Simples, endereço, códigos).
- Quem editar o texto no modal continua enviando o que digitou.

### Arquivos modificados
- `shared/nfse-descricao.ts`
- `server/lib/focus-nfe.ts`
- `server/lib/focus-nfe-helpers.ts`
- `server/lib/focus-nfe-helpers.test.ts`
- `.agents/memory/focus-nfe-satelite.md`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/focus-nfe-helpers.test.ts shared/multilog-refs.test.ts` | 30 pass |

### Resultados (negócio)
A nota deixa de sair com a lista de TOR, BO e OS. O controle aparece só para o cliente que o sistema já trata como obrigatório.

### Regressões verificadas
- Fatura sem INSS não ganha a linha do Anexo IV.
- Fatura da TM SEG com processo e OS de MULTILOG preenchidos por engano não leva esses números.
- Descrição já gravada com `OS.` e `SM.` (caminho da MULTILOG) continua na nota.
- Texto colado no modal, inclusive com `<` e `&`, segue sanitizado.

### Segurança
- Secrets no diff? Não
- Webhook/auth/RLS tocados? Não

### Backup / ponto de restauração
- `main` em `000709e2` antes desta alteração.

### Deploy
- A fatura 241 está cancelada (NFS-e número 1, ref `torres-inv-241-rmw0y0940`, atualizada em 03/11/2026 14:14 America/Sao_Paulo). A próxima emissão usa a sugestão que estiver na `main`.

### Confirmação
- Em 03/11/2026 o dono confirmou que esta configuração funcionou e pediu para publicar e preservar.
- Tag `safety/nfse-dps-ok-2026-11-03` no commit `975fb689`. A regra ficou em `04-REGRAS-NEGOCIO-CRITICAS.md`.

### Pendências
- Troca dos códigos NBS e alíquota cheia do DAS continuam decisão do proprietário, fora deste texto.
