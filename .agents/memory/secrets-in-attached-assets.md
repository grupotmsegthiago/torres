---
name: Credenciais vazadas em attached_assets
description: Arquivos colados pelo usuário em attached_assets/ podem conter tokens/credenciais reais em texto puro.
---

# Credenciais em attached_assets/

Arquivos `attached_assets/Pasted-*.txt` são conteúdo colado pelo usuário (ex.: exemplos
de curl / docs de API). Eles podem conter **credenciais reais** em texto puro
(headers `Authorization:`, API keys, senhas) e são **rastreados pelo git** → entram no histórico.

**Regra:** ao mexer em `attached_assets/` (ou antes de commitar), rodar uma varredura rápida
por `Authorization:`, `api_key`, `token`, `password` em `attached_assets/`. Se achar credencial:
1. Redigir o valor no arquivo (substituir por placeholder).
2. Avisar o dono para **rotacionar/revogar** a credencial no provedor — redigir o arquivo NÃO remove do histórico do git; só a rotação mata o valor de fato.
3. Remoção do histórico do git é operação destrutiva → tarefa separada.

**Why:** uma varredura de segurança encontrou um token SSX (SystemSatX,
`integration.systemsatx.com.br`, corresponde ao secret `SSX_TOKEN`) vazado em texto puro
num `attached_assets/Pasted-*.txt` rastreado. Provedores não detectam isso sozinhos.

**How to apply:** sempre que a tarefa tocar `attached_assets/` ou um security scan apontar
credencial, seguir os 3 passos acima — rotação é a mitigação crítica, não a redação do arquivo.
