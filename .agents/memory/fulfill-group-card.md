---
name: Resposta do bot ao pedido de atualização vem no card padrão
description: Regra de elegibilidade pra não dropar a resposta ao pedido de atualização no grupo.
---

A resposta REAL ao pedido de atualização no grupo ("@TORRES atualização TOR-XXXX") volta por `fulfillGroupRequests`, e o dono quer ela no padrão formatado (formulário da OS + rodapé de contato logo/Instagram/WhatsApp/site), não texto puro. Quando há foto nova, o card com foto+marca d'água é entregue pelo cron de encaminhamento; quando é só texto, o fulfill monta o mesmo formulário SEM foto.

**Regra crítica:** "tem foto" NÃO implica "o cron vai mandar o card" — o cron só encaminha updates cujo `mission_step` está na sua allowlist (`FORWARDABLE_STEPS`/`isForwardableStep`). Portanto o fulfill só pode pular o próprio envio quando `hadPhoto && isForwardableStep(step)`. Em qualquer outro caso (sem foto, ou foto em step fora da lista) ele PRECISA enviar o card de texto.

**Why:** o fulfill faz claim atômico (`fulfilled_at`) ANTES de decidir enviar. Um early-return cego só por `hadPhoto` consome o pedido e some a resposta no grupo se o cron também pular aquele step (drop silencioso) — foi exatamente o bug pego em review.

**How to apply:** sempre que mexer no gate "deixa o cron mandar vs. mando eu", a condição de pular tem que casar com a elegibilidade REAL do cron (mesma fonte de verdade do step). Tudo fail-open: erro ao montar o card rico cai no texto simples; nunca segura o envio.
