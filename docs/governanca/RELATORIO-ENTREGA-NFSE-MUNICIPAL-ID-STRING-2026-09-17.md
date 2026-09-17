## Relatório de Entrega — NFS-e municipalServiceId string `"402"`

**Data:** 2026-09-17
**Branch:** `dev`
**Commit(s):** (não commitado nesta sessão)
**Ambiente validado:** [x] local (testes)  [ ] preview  [ ] produção
**Publicou?** [x] Não

### Reutilização (D11 / P13)
- Busca: `buildNfseInvoicePayload`, `buildNfsePutPayload`, `asaasRequest`, log Asaas `402.0`.
- Existente: motor único em `asaas-helpers.ts`.
- Algo novo? [x] Não — coerção + log no payload já existente.

### O que foi alterado
- `municipalServiceId` no fio é sempre string `"402"` (`asMunicipalServiceIdString`).
- `municipalServiceCode` omitido (prefeitura).
- Log `[asaas] NFS-e wire JSON` com tipo e `JSON.stringify` do ID (aspas visíveis).

### O que NÃO foi alterado
- `calcularEscolta`, boletim, ledger, ISS/INSS desta entrega.
- Sem emissão live nesta correção.

### Arquivos modificados
- `server/lib/asaas-helpers.ts`, `server/lib/asaas-helpers.test.ts`, `server/asaas.ts`
- `docs/governanca/CHANGELOG-GOVERNANCA.md`

### Banco / migrations
- [x] Nenhuma

### Testes executados
| Comando / arquivo | Resultado |
|-------------------|-----------|
| `npx tsx --test server/lib/asaas-helpers.test.ts` | 100 pass |

### Resultados (negócio)
O JSON enviado ao Asaas passa a ser `"municipalServiceId": "402"`, não `402.0`.

### Segurança
- Secrets no diff? [x] Não
- Webhook/auth/RLS tocados? [x] Não

### Backup / ponto de restauração
- Reverter `asMunicipalServiceIdString` / envio do ID.

### Deploy
- Precisa publicar para o Natan deixar de ver `402.0` em produção.

### Pendências
- Publicar `dev` → `main` quando o dono pedir.

### Gates G1–G16
- [x] N/A justificado (satélite Asaas, um motor, sem schema)

### Resumo executivo
1. O Asaas lia o ID como número (`402.0`).
2. O Torres agora manda texto `"402"` e grava o JSON da chamada no log.
3. Só vale em produção depois de publicar.
