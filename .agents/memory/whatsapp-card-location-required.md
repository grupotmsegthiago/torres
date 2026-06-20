---
name: Localização obrigatória no card do cliente (WhatsApp)
description: O card de missão enviado ao grupo do cliente nunca pode sair sem link de localização.
---

# Card do cliente (WhatsApp) precisa SEMPRE ter localização

O dono exige (20/06/2026) que todo card de atualização/finalização de missão
enviado ao grupo do cliente traga o link de localização (Google Maps).

**Why:** updates de TEXTO (ex.: "MISSÃO SEGUE PADRÃO, SEM NOVIDADES") chegam
SEM coordenadas próprias, então o card saía sem localização — o cliente perdia
a referência de onde a escolta está.

**How to apply:** nunca derivar a localização só de `u.latitude/u.longitude`
da update atual. Resolver a posição por uma cadeia de fallback (prioridade):
(1) GPS da própria update → (2) última posição do rastreamento da OS
(`mission_positions`, mais recente) → (3) última `mission_update` da OS que
tinha coordenadas. Só some o bloco se NENHUMA fonte tiver posição (raríssimo
numa escolta em trânsito). NÃO usar origem/destino da OS como "localização" —
seria enganoso (não é a posição ao vivo).

Aplica-se aos DOIS cards (trânsito e resumo final). O link tem formato único
(4 casas decimais) centralizado num helper para não divergir entre os dois.
