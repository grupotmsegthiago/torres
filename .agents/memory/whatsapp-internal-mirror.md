---
name: Tela interna de WhatsApp é espelho de whatsapp_messages
description: Por que mensagens saintes do bot precisam ser persistidas para aparecer na tela interna em tempo real.
---

A tela interna ("Central Torres" / "TORRES - Área Interna") renderiza EXCLUSIVAMENTE o que está na tabela `whatsapp_messages` (realtime via supabase channel + polling React Query). Ela não consulta a Z-API em tempo real para o histórico de mensagens.

**Regra:** todo caminho que ENVIA WhatsApp tem que gravar a mensagem sainte em `whatsapp_messages` (`from_me:true`) + atualizar `whatsapp_chats`, ou ela NÃO aparece no espelho.

**Why:** o dono cobrou (24/06/2026) que as cobranças/DMs do bot não apareciam na tela — ele quer espelho real ("mandou aparece pra todos, recebeu aparece pra todos"). Originalmente só a ENTRADA (webhook) e o ENVIO MANUAL pela tela persistiam; as mensagens que o bot dispara (cobranças, acks, fotos do cron) só apareceriam se a Z-API mandasse de volta um webhook "enviado por mim" — o que não é confiável.

**How to apply:**
- O ponto único de gravação é o helper de saída chamado pelos senders de baixo nível (sendText/sendImageWithCaption). Por padrão eles persistem; quem já grava por conta própria (a rota de envio manual) opta por `persist:false` pra não duplicar.
- chat_id da gravação tem que usar a MESMA normalização do envio (a que bate com `body.phone` do webhook), senão a msg do bot cai em conversa separada da entrada do mesmo contato/grupo.
- Idempotência por `zapi_message_id` (check-then-insert, igual ao webhook) evita duplicar caso a Z-API também dispare o callback "enviado por mim". Não há unique index no banco — a janela de corrida é rara e aceita.
- Imagem base64 NÃO vai pra `media_url` (landmine de base64 pesado derrubar Supabase — ver fueling-list-heavy-base64.md): só URL http; base64 vira mensagem de imagem só com a legenda.
- Persistência é FAIL-OPEN: nunca pode derrubar/bloquear o envio (cron/agente) — o envio já aconteceu.
