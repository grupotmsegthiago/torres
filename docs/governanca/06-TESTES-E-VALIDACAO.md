# 06 — Testes e Validação

**Natureza:** normativo
**Regras:** Framework T1–T8

Mudança financeira/comercial **não** é aprovável sem a suíte mínima aplicável verde.

---

## Suíte mínima obrigatória

### Faturamento de missão

| # | Cenário | Resultado esperado | Âncora de código / teste |
|---|---------|-------------------|--------------------------|
| 1 | Concluída dentro da franquia | Sem cobrança de excedente indevido; `fat_*` coerente com contrato | `calcularEscolta` / testes billing |
| 2 | Concluída com KM excedente | Cobra apenas KM acima da franquia | `billing-calc` / HE-KM tests |
| 3 | Concluída com hora excedente | Cobra HE (fracionada se contrato) | `billing-calc-hora-extra.test.ts` |
| 4 | Concluída com KM + hora excedentes | Soma correta dos componentes | golden / unit |
| 5 | Cancelada dentro da franquia | Cobra mínimo tabela 100 km / 3h (acionamento da tabela) | `cancelada-billing.test.ts` |
| 6 | Cancelada com KM excedente | Mínimo + KM excedente | idem |
| 7 | Cancelada com hora excedente | Mínimo + HE excedente | idem |
| 8 | Recusada = zero | `billingTotalForBoletim` → 0; fora do boletim | `boletim-totals.test.ts` |
| 9 | Pedágio sem duplicação | expense em `despesas_pedagio`; revenue pedágio fora de `receitas_os` | `billing-pedagio-markup.test.ts`, TOR-0179 |
| 10 | Boletim aprovado imutável | Resync não altera APROVADO; snapshot estável | `boletim-resync` + regras |
| 11 | Invoice = boletim | Valor da invoice = `total_value` / snapshot aprovado | fluxo boletim-approval |
| 12 | Balanço usa fonte oficial | Abertas: canônico; congeladas/canceladas: boletim; sem live como oficial | `balanco-calc` |
| 13 | Cache invalidado após escrita | Writer de billing/status chama `bustBalancoCaches` (ou equivalente) | `balanco-cache.ts` |
| 14 | Webhook sem autenticação rejeitado | 401/403 quando secret ausente/inválido | testes a criar na correção de segurança |
| 15 | Idempotência de eventos financeiros | Mesmo `codigoSolicitacao` / payment id não duplica FT | Inter/Asaas handlers |

---

## Quando rodar

| Tipo de mudança | Obrigatório |
|-----------------|-------------|
| `billing-calc`, cancelada, boletim-totals, balanco-calc | Itens 1–12 |
| Webhooks / auth | 14–15 |
| Cache SWR / writers de billing | 13 |
| Qualquer PR financeiro | no mínimo os cenários tocados + pedágio + recusada |

---

## Como executar (referência do projeto)

```bash
npm test
# ou subset com Node test runner nos arquivos *.test.ts do domínio
```

CI atual (`build`) **não substitui** a suíte financeira. Preferir `npm run build:ci` ou rodar testes explicitamente em mudanças de billing.

---

## Evidência no Relatório de Entrega

Listar: comando, arquivos de teste, pass/fail, e se algum item da suíte mínima ficou de fora (com justificativa).
