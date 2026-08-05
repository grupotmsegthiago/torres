# Governança do Sistema Torres

**Status:** normativo e obrigatório  
**Vigência:** a partir da implantação documental (Fase 1.0)  
**Escopo desta pasta:** regras de arquitetura, fontes da verdade, desenvolvimento, segurança, testes, deploy e entrega.

Esta pasta **não descreve apenas como o sistema está hoje**. Ela define **como toda evolução futura DEVE acontecer**.

---

## Finalidade

1. Garantir **integridade financeira e operacional**.
2. Impedir motores, KPIs e telas paralelas que gerem números divergentes.
3. Obrigações claras para agentes (Cursor) e desenvolvedores humanos.
4. Definir o que significa **“concluído”** — compilar não basta.

---

## Ordem de leitura (obrigatória antes de qualquer tarefa)

1. Este `README.md`
2. [`01-ARQUITETURA-OFICIAL.md`](./01-ARQUITETURA-OFICIAL.md) — Constituição
3. [`02-FRAMEWORK-GOVERNANCA.md`](./02-FRAMEWORK-GOVERNANCA.md) — Normas de evolução
4. [`03-FONTES-DA-VERDADE.md`](./03-FONTES-DA-VERDADE.md) — SSOT por domínio
5. [`04-REGRAS-NEGOCIO-CRITICAS.md`](./04-REGRAS-NEGOCIO-CRITICAS.md) — Concluída / Cancelada / Recusada

Leitura sob demanda conforme o tema:

| Tema | Documento |
|------|-----------|
| Segurança / webhooks / RLS | [`05-SEGURANCA.md`](./05-SEGURANCA.md) |
| Testes mínimos | [`06-TESTES-E-VALIDACAO.md`](./06-TESTES-E-VALIDACAO.md) |
| Deploy / rollback | [`07-DEPLOY-E-ROLLBACK.md`](./07-DEPLOY-E-ROLLBACK.md) |
| Responsabilidades (RACI) | [`08-MATRIZ-RACI.md`](./08-MATRIZ-RACI.md) |
| Dívidas conhecidas | [`09-DIVIDAS-E-RISCOS-CONHECIDOS.md`](./09-DIVIDAS-E-RISCOS-CONHECIDOS.md) |
| Iniciar uma feature | [`10-ESPECIFICACAO-FUNCIONAL-TEMPLATE.md`](./10-ESPECIFICACAO-FUNCIONAL-TEMPLATE.md) |
| Fechar uma entrega | [`11-RELATORIO-DE-ENTREGA-TEMPLATE.md`](./11-RELATORIO-DE-ENTREGA-TEMPLATE.md) |
| Histórico desta pasta | [`CHANGELOG-GOVERNANCA.md`](./CHANGELOG-GOVERNANCA.md) |

---

## Documentos normativos vs informativos

| Documento | Natureza |
|-----------|----------|
| `01` … `08`, este README | **Normativos** — obrigatórios |
| `09` Dívidas | Normativo quanto à restrição “não ampliar”; descritivo quanto ao estado |
| `10` e `11` Templates | Normativos de processo (devem ser preenchidos) |
| `docs/ARCHITECTURE.md`, `docs/KNOWLEDGE_GRAPH.md`, `MAPA_SISTEMA_COMPLETO.md`, `AGENT_RULES.md`, `RULES.md` | **Complementares / parcialmente históricos** — em conflito, perdem para esta pasta |

---

## Precedência em caso de conflito

1. **Segurança fail-closed**
2. **Integridade financeira**
3. **Arquitetura Oficial** (`01`)
4. **Framework de Governança** (`02`)
5. **Performance e experiência**
6. **Conveniência de implementação**

Timezone BRT (`America/Sao_Paulo`) e proibições técnicas de `RULES.md` / `AGENT_RULES.md` **permanecem válidas**, desde que não contradigam a precedência acima.

---

## Como uma nova tarefa deve começar

1. Ler a ordem obrigatória acima.
2. **Pesquisar reutilização** (D11/P13): solução, componente, função, regra, API, serviço ou tela já existente — com evidências.
3. Preencher a [Especificação Funcional](./10-ESPECIFICACAO-FUNCIONAL-TEMPLATE.md) (mesmo que resumida), incluindo a decisão de reutilizar/estender/criar.
4. Declarar: **domínio dono**, **tipo do dado** (Fato / Resultado / Snapshot / Projeção / Espelho / Cache / Satélite), **camada da hierarquia**.
5. Procurar a **causa raiz** com evidência (arquivo, tabela, API).
6. Implementar **somente o escopo** — estendendo o existente quando possível; sem refatorar vizinhos.
7. Rodar testes da suíte mínima aplicável ([`06`](./06-TESTES-E-VALIDACAO.md)).
8. Preencher o [Relatório de Entrega](./11-RELATORIO-DE-ENTREGA-TEMPLATE.md).
9. Deploy **somente** se o usuário pedir publicação / após gates — ver [`07`](./07-DEPLOY-E-ROLLBACK.md).

---

## Definição oficial de “concluído”

Uma tarefa só está concluída quando:

- [ ] Escopo pedido atendido (nada a mais, nada a menos material)
- [ ] Reutilização pesquisada e documentada (ou inviabilidade evidenciada)
- [ ] Domínio dono e tipo de dado respeitados
- [ ] Hierarquia oficial não violada
- [ ] Testes aplicáveis executados e verdes
- [ ] Sem secrets no diff
- [ ] Cache invalidado se houve escrita em fato/snapshot
- [ ] Relatório de entrega preenchido
- [ ] Se houve deploy: backup/ponto seguro + healthcheck + validação pós-deploy

**Não é concluído:** “compilou”, “parece certo na tela”, “só mudei um detalhe”.

---

## Deploy

Deploy **não** é automático em toda tarefa.  
É etapa final e controlada, após testes e gates.  
Publicação em produção segue o pedido explícito do usuário e o fluxo do projeto (`publicar.ps1` / política vigente), sem force-push em `main`.
