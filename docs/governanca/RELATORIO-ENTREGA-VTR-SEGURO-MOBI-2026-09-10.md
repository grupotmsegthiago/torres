## Relatório de Entrega — Seguro do Mobi (apólice + contrato)

**Data:** 2026-09-10
**Branch:** `dev`
**Commit(s):** (não commitado nesta sessão)
**Ambiente validado:** [x] local (testes + colunas no Supabase TORRES)  [ ] preview  [ ] produção (código)
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: cadastro `client/src/pages/admin/vehicles.tsx`, `vehicles.icon_type` / `resolveVehicleIcon`, anexo CRLV (`document_file`), padrão de storage `signable-doc-storage` / comprovantes.
- Existente aproveitado: tabela `vehicles` (FATO), detecção MOBI vs POLO, upload JSON base64 → bucket privado.
- Algo novo criado? [x] Sim — colunas de caminho + bucket `vehicle-docs`. Inviável reusar `document_file` (já é CRLV e é base64 pesado, fora da lista).

### O que foi alterado
- No cadastro da viatura, se for Mobi: campos Apólice e Contrato do seguro.
- Lista: Mobi sem os dois anexos fica em vermelho e badge “Sem seguro”. Polo mostra “—”.

### O que NÃO foi alterado
- Fotos, CRLV, rastreador, Polo/Kwid, motor de faturamento.

### Arquivos modificados
- `shared/schema.ts`, `shared/vehicle-icons.ts`, `server/db-init.ts`, `server/storage.ts`, `server/routes/vehicles.ts`, `server/lib/vehicle-doc-storage.ts`, `client/src/pages/admin/vehicles.tsx`

### Banco / migrations
- [x] Sim: `insurance_policy_file`, `insurance_contract_file` (TEXT) em `vehicles` — aplicados no projeto TORRES.

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/vehicle-icons.test.ts server/lib/vehicle-doc-storage.test.ts` | 8 pass |

### Resultados (negócio)
Cada Mobi tem lugar para a apólice e o contrato; o que faltar aparece vermelho na lista. Polo não pede.

### Segurança
- Secrets no diff? [x] Não
- Bucket privado + signed URL na leitura; upload só admin.

### Pendências
- Publicar para a tela de produção; o bucket é criado no boot/primeiro upload.

### Gates G1–G16
- [x] Atendidos (um cadastro, sem segundo motor, colunas leves na lista)
