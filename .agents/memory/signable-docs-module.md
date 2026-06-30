---
name: Assinatura digital de documentos RH
description: Padrões e armadilhas do módulo employee_signable_documents (emitir→ver→assinar facial+manuscrita→evidência→dashboard).
---

# Módulo de assinatura digital de documentos RH

Tabela `employee_signable_documents` (Supabase). Backend em `server/routes/signable-documents.ts` (supabaseAdmin direto, sem inchar IStorage) + templates em `server/lib/signable-doc-templates.ts`. App vigilante `client/src/pages/mobile/documentos.tsx`, dashboard `client/src/pages/admin/dashboard-documentos-rh.tsx`, emissão em `employees.tsx`.

## Decisões duráveis
- **Imagens (facial/desenho) vão pro BUCKET PRIVADO `signable-docs`**, não data URI no banco. **Why:** code review barrou data URI de biometria inflando o banco; padrão é o de `mission-photos` (bucket privado + signed URL curto na leitura). Helper: `server/lib/signable-doc-storage.ts` (`uploadSignableImage` grava o CAMINHO; `resolveSignableImage`→signed URL p/ evidência admin; `downloadSignableImageDataUri`→data URI auto-contido p/ PDF). Coluna guarda o caminho; leitura sempre resolve.
- **WRITE continua WAF-safe:** client manda base64 cru + mime, server remonta e SÓ ENTÃO sobe pro bucket — POSTar `data:image...` literal é bloqueado pelo WAF (ver waf-blocks-data-uri).
- **Fallback nunca perde evidência:** se o upload pro bucket falhar, o writer grava o data URI cru na coluna (catch), igual writers de mission-photos. Readers (`resolveSignableImage`/`downloadSignableImageDataUri`) tratam os 3 formatos: caminho de bucket, `data:` legado e `http(s)`.
- **Validação Zod obrigatória** em toda rota nova (emit/bulk/sign/dashboard) via `safeParse`+`zodError` — code review barra rota sem validação de input.

## Armadilhas (já corrigidas — não regredir)
- **Captura em canvas → submit no mesmo clique não pode depender de setState.** O dataURL do canvas/foto deve ser passado DIRETO como argumento da mutation (`mutate(sig)`), nunca lido de `useState` logo após `setState(...)` (assíncrono ⇒ envia null no 1º clique). Vale p/ qualquer fluxo captura+envio imediato.
- **content_html é SEMPRE gerado pelo template no server**, nunca aceitar HTML cru do request body — `buildAuthenticatedHtml` injeta `${body}` sem sanitizar (XSS armazenado). O `esc()` cobre os demais campos; o body do documento é a exceção e por isso só pode vir de template confiável.
- **Lifecycle emit→visualizado→assinado:** o status `visualizado` precisa ser disparado pelo CLIENT (POST `/:id/view`) ao abrir o doc/fluxo (best-effort, fire-and-forget) — o backend não marca sozinho.
- **Câmera ao vivo NÃO pode ser caminho único da selfie.** `getUserMedia` falha em muitos celulares (permissão negada, sem HTTPS, navegador embarcado) ⇒ se a captura ao vivo for a única opção o fluxo trava (sem foto = sem "Avançar"). Sempre ter fallback `<input type="file" accept="image/*" capture="user">` (abre câmera nativa/galeria) e processar a imagem pelo MESMO helper de carimbo/compressão (≤1280px JPEG q0.85) da captura ao vivo. GPS é best-effort e nunca bloqueia.
- **`signSchema` é exportado** p/ teste de contrato (`.local/test_signable_sign_validation.test.mts`): garante rejeição ALTA quando falta facial/assinatura/termo, incluindo base64 vazio (regressão null/vazio). Espelha as guardas defensivas do frontend no `submitMutation`.
