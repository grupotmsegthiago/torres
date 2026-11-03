## Relatório de Entrega — Apólice do Mobi

**Data:** 2026-11-03
**Branch:** `cursor/apolice-seguro-mobi-b534`
**Ambiente validado:** [x] local  [ ] preview  [ ] produção
**Publicou?** [x] Sim — fast-forward de `cursor/apolice-seguro-mobi-b534` em `main` e `dev` em 03/11/2026.

### Domínio e dado
- Domínio: frota (`vehicles`). Tipo: Fato. Caminho do anexo, sem valor financeiro.

### Reutilização (D11 / P13)
- Busca: `isMobiInsuranceIncomplete`, `InsuranceAttachField`, `POST /api/vehicles/:id/insurance/:kind`.
- Existente aproveitado: as colunas `insurance_policy_file` e `insurance_contract_file` e o bucket `vehicle-docs`.
- Algo novo criado? Não. Não há segunda tabela nem segundo upload.

### O que foi alterado
- A viatura TMG0B41 já tinha o PDF em `insurance_contract_file` e a apólice vazia. A tela exigia os dois e ficava vermelha.
- O contrato anexado passa a ser a apólice. A lista deixa de marcar “Sem seguro” quando esse arquivo existe.
- O formulário do Mobi mostra um campo só: Apólice de seguro. O anexo antigo do contrato aparece nele.

### O que NÃO foi alterado
- CRLV, fotos, rastreador, Polo/Kwid e o motor de faturamento.
- O PDF já gravado não foi reenviado.

### Arquivos modificados
- `shared/vehicle-icons.ts`
- `shared/vehicle-icons.test.ts`
- `client/src/pages/admin/vehicles.tsx`
- `server/routes/vehicles.ts`

### Banco / migrations
- Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test shared/vehicle-icons.test.ts server/lib/vehicle-doc-storage.test.ts` | 10 pass |

### Resultados (negócio)
Anexar o contrato do Mobi preenche o seguro. A tela não pede uma segunda apólice.

### Segurança
- Secrets no diff? Não
- Webhook/auth/RLS tocados? Não. Upload continua só para admin.

### Rollback
- Reverter o commit desta branch. Os arquivos no bucket permanecem.
