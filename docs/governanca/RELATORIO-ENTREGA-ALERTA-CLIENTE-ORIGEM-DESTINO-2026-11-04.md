## Relatório de Entrega — Cliente, origem e destino no aviso da atualização

**Data:** 2026-11-04
**Ambiente validado:** local (render do aviso e ficha da OS)
**Publicou?** Não

### Reutilização
- Busca: `AlertaViaturaMensagem`, `generateReportAsync`, `FALLBACK_REPORT_TEMPLATE`, `fichaDoCard`, `buildRichCaption`.
- Aproveitado: o aviso que já abre no celular e o formulário oficial montado por `generateReportAsync` (modelo `report_template`). A foto continua vindo de `/api/mission/updates/:id/photo` e segue no mesmo `shareMobileReportWithPhoto`.
- Cliente, origem e destino já existem na ordem de serviço da grade e na OS ativa da viatura. Nada novo de motor, tabela ou API.

### Domínio e dado
Operação de campo. A atualização é fato (`mission_updates`). Cliente, origem e destino são fatos da ordem de serviço, só lidos. Satélite de interface. Não altera boletim, balanço nem `calcularEscolta`.

### O que foi alterado
O aviso mostra o nome do cliente, a origem e o destino. O botão verde manda a foto e o formulário completo da missão, com a frase que acabou de chegar no campo de atualização. Se a viatura do rastreamento ainda não casou com a OS, a grade operacional preenche a ficha.

### O que não foi alterado
A lista antiga continua oculta. Copiar foto e copiar texto no computador permanecem. O modelo do formulário não mudou. Custo, NFS-e e Mobi não entram.

### Risco
Se a ordem de serviço não estiver na grade nem na viatura, o formulário sai com traço no cliente e na rota, e a frase da atualização continua no texto. O celular precisa aceitar compartilhar arquivo.

### Teste
O aviso renderiza cliente, origem e destino. A ficha da grade preenche a OS quando o rastreamento não casou. Outra missão da mesma placa não entra no formulário. A frase compartilhada é a desta atualização.

### Rollback
Reverter o commit. O aviso volta a mostrar só agente e frase, e o WhatsApp sem viatura volta a mandar só a frase.
