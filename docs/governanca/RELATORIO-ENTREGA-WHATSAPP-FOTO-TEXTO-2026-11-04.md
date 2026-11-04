## Relatório de Entrega — WhatsApp com foto e texto da atualização

**Data:** 2026-11-04
**Ambiente validado:** local (render do aviso)
**Publicou?** Não

### Reutilização
- Busca: `shareMobileReportWithPhoto` já monta texto e arquivo no `navigator.share`. A lista antiga em `mission-updates-alert` ficou com `className="hidden"` no layout novo.
- Aproveitado: o mesmo compartilhamento e o texto do relatório (`generateReportAsync`). A foto continua vindo de `/api/mission/updates/:id/photo`.
- Nada novo de motor, tabela ou API.

### Domínio e dado
Operação de campo. A atualização é fato (`mission_updates`). O botão só lê e compartilha. Satélite de interface. Não altera boletim, balanço nem `calcularEscolta`.

### O que foi alterado
O aviso que abre quando a atualização chega, e a leitura da mensagem no mapa, ganham o botão verde "WhatsApp · foto e texto" quando o celular sabe compartilhar arquivo. No celular o desenho da viatura encolhe e o aviso rola, para o botão aparecer na mesma tela.

### O que não foi alterado
A lista antiga continua oculta. Copiar foto e copiar texto no computador permanecem. Custo, NFS-e e Mobi não entram.

### Risco
O celular precisa aceitar compartilhar arquivo. Se a foto não carregar, o aviso diz que não foi possível. O texto continua sendo o relatório da viatura, o mesmo de antes.

### Teste
O aviso renderiza o botão só quando o compartilhamento é passado.

### Rollback
Reverter o commit. O aviso volta a só marcar como lida.
