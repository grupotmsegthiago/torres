---
name: Edge WAF bloqueia data:image base64 (403 em uploads de foto)
description: Por que uploads de foto dão "403 Forbidden" (HTML) em produção e como contornar
---

# Edge WAF bloqueia `data:image/...;base64,` → 403 antes do Express

**Sintoma:** em produção (deployment), qualquer POST cujo corpo contenha o prefixo
`data:image/...;base64,` volta com a página minimalista `<title>403</title>403 Forbidden`
(formato do Google Front End / Cloud Armor), ANTES de chegar ao Express. No log do app
NÃO aparece a requisição (nenhum `[express] POST ...`). O app só devolve 403 em JSON,
então 403 em HTML = bloqueio no edge, não no código.

**Causa (testada contra prod via curl):** o WAF do edge (Google Cloud Armor à frente da
deployment) trata o esquema de data URI `data:image/...;base64,` como assinatura de XSS e
bloqueia o corpo. Provado isolando a causa:
- corpo `data:image/jpeg;base64,<b64>` (até 5KB) → **403**
- o MESMO base64 cru, SEM o prefixo `data:` → **401/200 (chega ao app)**
- `data:image/jpeg,<b64>` (sem a palavra base64) → **403** também (é o esquema `data:`)
- base64 de baixa entropia sem prefixo → passa
Ou seja: o gatilho é o **prefixo `data:`**, não tamanho nem entropia. Vale nas DUAS URLs
(domínio próprio e `.replit.app`) — o domínio próprio só faz proxy pro mesmo edge GCP.

**Regra de código (como contornar):** NUNCA enviar `data:image/...;base64,` no corpo de
um POST em produção. O cliente deve **remover o prefixo** e mandar só o base64 cru + o
mime num campo separado; o servidor **remonta** o data URI (`data:${mime};base64,${raw}`)
antes de armazenar/exibir — assim o storage e a UI ficam idênticos. Helper:
`server/lib/photo-data-uri.ts` (`normalizePhotoDataUri`, aceita legado completo p/ compat).

**Abrangência:** afeta TODOS os endpoints de foto, não só a selfie de login. Telas que
montam `data:image` e enviam no corpo (e portanto quebram igual): `mobile/selfie`,
`mobile/missao` (fotos de missão), `mobile/abastecimento` + `admin/fueling` (NF/bomba/
hodômetro/placa), `mobile/ponto`, `mobile/ocorrencia`, `mobile/pedagio`, facial em
`mobile/contratos`/`mobile/holerites`, e vários `admin/*`. Em 04/06/2026 só a selfie de
login (`/api/auth/login-selfie`) foi corrigida; o resto ficou pendente de aprovação do dono.

**Confirmação só pós-deploy:** o WAF só existe na deployment (não no dev local). Validar a
correção exige republicar e testar a tela real (ou curl com base64 cru → deixa de dar 403).
