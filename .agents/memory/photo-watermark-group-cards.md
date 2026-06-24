---
name: Marca d'água nas fotos de grupo
description: Como/onde a marca d'água Torres é aplicada nas fotos enviadas aos grupos de cliente.
---

# Marca d'água Torres nas fotos enviadas a grupos de cliente

O dono exige que TODA foto de missão enviada a grupo de cliente leve a marca d'água
aprovada: **logo branco no topo-esquerdo + bloco de 3 contatos no rodapé-direito**
(Instagram/WhatsApp/site), sobre faixas escuras suaves. Layout = `.local/preview/modelo-marca-dagua.jpg`.

**Regra durável:** qualquer NOVO caminho que mande foto a grupo de cliente DEVE
aplicar a marca antes do `sendImageWithCaption` — senão sai foto "pelada" e o dono
reclama. Hoje há 2 caminhos cobertos (forward-cron e o km-final do agente central);
um terceiro writer reabre o buraco.

**Why:** reclamação direta do dono (24/06/2026): bot mandou o card mas "não trouxe o
logo e as informações na foto".

**How to apply:**
- Engine reutilizável aplica a marca a partir de um Buffer e devolve data URL JPEG
  pronto, com tetos de tamanho (entrada e payload final). Assets (logo branco +
  ícone WhatsApp) são EMBUTIDOS como base64/SVG-path porque o esbuild só empacota
  `server/index.ts` e NÃO copia arquivos de `.local/` ou `attached_assets/` pro
  bundle — depender de asset em disco em produção é frágil. Regenerar os assets a
  partir do logo aprovado com o script one-off em `.local`.
- Sempre **fail-open**: se a marca falhar (download, decode, payload grande, sharp
  reclamar de imagem inválida), envia a foto ORIGINAL — nunca segura/derruba o card.
- Normalizar orientação EXIF (`sharp().rotate()`) antes de medir W/H, senão a marca
  fica torta em foto de celular em retrato.
- Foto pode chegar como signed URL do storage (baixar bytes, com timeout) OU como
  base64/data URL (decodificar com teto). Mandar o resultado como `data:base64` ao
  Z-API é OK (é saída server→Z-API, NÃO passa pelo Cloud Armor que bloqueia data URI
  de entrada).
