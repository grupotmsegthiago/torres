---
name: Assinatura digital de documentos RH
description: Padrões e armadilhas do módulo employee_signable_documents (emitir→ver→assinar facial+manuscrita→evidência→dashboard).
---

# Módulo de assinatura digital de documentos RH

Tabela `employee_signable_documents` (Supabase). Backend em `server/routes/signable-documents.ts` (supabaseAdmin direto, sem inchar IStorage) + templates em `server/lib/signable-doc-templates.ts`. App vigilante `client/src/pages/mobile/documentos.tsx`, dashboard `client/src/pages/admin/dashboard-documentos-rh.tsx`, emissão em `employees.tsx`.

## Decisões duráveis
- **Imagens (facial/desenho) como data URI nas colunas**, não bucket — consistência com infra de assinatura existente (probation/payslips) e baixo volume. **Why:** reuso do display de evidência. WRITE é WAF-safe: client manda base64 cru + mime (`splitDataUri`), server remonta `data:<mime>;base64,<raw>` — POSTar `data:image...` literal é bloqueado pelo WAF (ver waf-blocks-data-uri).

## Armadilhas (já corrigidas — não regredir)
- **Captura em canvas → submit no mesmo clique não pode depender de setState.** O dataURL do canvas/foto deve ser passado DIRETO como argumento da mutation (`mutate(sig)`), nunca lido de `useState` logo após `setState(...)` (assíncrono ⇒ envia null no 1º clique). Vale p/ qualquer fluxo captura+envio imediato.
- **content_html é SEMPRE gerado pelo template no server**, nunca aceitar HTML cru do request body — `buildAuthenticatedHtml` injeta `${body}` sem sanitizar (XSS armazenado). O `esc()` cobre os demais campos; o body do documento é a exceção e por isso só pode vir de template confiável.
- **Lifecycle emit→visualizado→assinado:** o status `visualizado` precisa ser disparado pelo CLIENT (POST `/:id/view`) ao abrir o doc/fluxo (best-effort, fire-and-forget) — o backend não marca sozinho.
