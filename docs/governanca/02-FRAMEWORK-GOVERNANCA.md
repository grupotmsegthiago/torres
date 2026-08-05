# 02 — Framework de Governança do Sistema Torres

**Natureza:** normativo e obrigatório  
**Origem:** Fase 0.4  
**Leitura prévia:** [`01-ARQUITETURA-OFICIAL.md`](./01-ARQUITETURA-OFICIAL.md)

Nenhuma alteração futura pode ser considerada concluída se violar este Framework.

---

## Missão

Operar, medir, faturar e governar a atividade da Torres com rastreabilidade ponta a ponta — do fato de campo ao indicador gerencial — sem ambiguidade de fonte da verdade.

## Objetivos estratégicos

1. Integridade financeira  
2. Confiabilidade operacional  
3. Clareza gerencial  
4. Segurança fail-closed  
5. Evolução controlada  
6. Separação de responsabilidades  
7. Resiliência (deploy/rollback/monitoramento)

---

## 3. Princípios imutáveis (P1–P12)

| ID | Princípio |
|----|-----------|
| P1 | Uma informação, um dono |
| P2 | Fato ≠ Resultado ≠ Snapshot ≠ Projeção ≠ Espelho ≠ Cache ≠ Satélite |
| P3 | Camada superior não altera camada inferior |
| P4 | Um motor oficial de faturamento de missão |
| P5 | Boletim aprovado é lei comercial |
| P6 | `financial_transactions` é lei de caixa/P&L empresarial |
| P7 | IA nunca é fonte de verdade |
| P8 | Gateway externo é satélite, não dono |
| P9 | Fail-closed em segurança e webhooks |
| P10 | Estimativa deve ser rotulada; nunca vira valor oficial silenciosamente |
| P11 | Escrita crítica é auditável; financeiro é idempotente |
| P12 | Sem migrate/deploy no escuro: teste → revisão → aprovação → publicação |
| P13 | Reutilizar antes de criar: pesquisar o existente; proibido duplicar sem evidência de inviabilidade |

---

## 4. Desenvolvimento (D1–D11)

| ID | Regra |
|----|-------|
| D1 | Todo PR declara domínio dono, tipo do dado, camada da hierarquia |
| D2 | Proibido segundo motor/cálculo para KPI já oficial |
| D3 | Proibido gravar projeção/cache como fato |
| D4 | Código órfão (UI sem rota / rota sem registro) não entra como feature |
| D5 | Preferir estender o dono existente a criar paralelo “parecido” |
| D6 | Nomes públicos refletem o domínio real |
| D7 | GET não muta financeiro; side-effects operacionais só se explícitos |
| D8 | Secrets nunca no client, commits, CI hardcoded ou assets |
| D9 | Mudança financeira exige testes determinísticos no mesmo PR |
| D10 | Refactor sem mudança de regra não altera números oficiais (golden tests) |
| D11 | **Pesquisa de reutilização obrigatória** antes de implementar (ver caixa abaixo) |

### D11 — Reutilização obrigatória (detalhe)

Antes de implementar qualquer alteração, o agente/desenvolvedor **deve pesquisar** se já existe solução, componente, função, regra de negócio, API, serviço ou tela que resolva **parcial ou totalmente** o problema.

É **proibido**, sem evidência escrita de inviabilidade:

- duplicar lógica;
- criar um segundo motor de cálculo;
- criar nova tabela;
- criar nova API;
- criar novo componente.

Se existir implementação semelhante, ela deve ser **estendida, corrigida ou integrada**, preservando a arquitetura existente.

Evidência mínima no relatório/especificação:

1. O que foi buscado (termos / símbolos / arquivos).
2. O que foi encontrado (caminhos).
3. Decisão: reutilizar / estender / criar novo.
4. Se criar novo: por que reutilizar é inviável (não “preferência”).

---

## 5. Segurança (S1–S12)

| ID | Regra |
|----|-------|
| S1 | Rota mutável: auth + role adequada |
| S2 | Webhooks: autenticação obrigatória; sem token/config = rejeitar |
| S3 | Service role só no backend; anon com RLS efetiva |
| S4 | Proibido policy `USING (true)` em dados sensíveis |
| S5 | Views SECURITY DEFINER e RPCs anon exigem revisão de risco |
| S6 | Headers de segurança são obrigação de plataforma |
| S7 | Rate limit em públicos e endpoints caros (OCR/IA/webhooks) |
| S8 | Inputs de busca nunca interpolados crus em filtros |
| S9 | Sem chave criptográfica fallback hardcoded |
| S10 | Logs sem secrets/tokens/payloads sensíveis completos |
| S11 | CI deve falhar em vulnerabilidades críticas conhecidas |
| S12 | Menor privilégio de roles |

Detalhe dos riscos atuais (ainda não corrigidos): [`05-SEGURANCA.md`](./05-SEGURANCA.md).

---

## 6. Banco de dados (B1–B10)

| ID | Regra |
|----|-------|
| B1 | Toda tabela `public` nasce com RLS enabled |
| B2 | Schema evolui por migração versionada e revisada |
| B3 | Proibido dual-table sem deprecação formal |
| B4 | Campos espelho/cache documentados; nunca SSOT |
| B5 | `SECURITY DEFINER` fora do alcance anon salvo justificativa |
| B6 | `exec_sql` e equivalentes: nunca executáveis por roles de cliente |
| B7 | Índices críticos na migração (não best-effort engolido) |
| B8 | Triggers só para invariantes de fato |
| B9 | Soft-delete/status preferível a apagar histórico financeiro |
| B10 | Backup/restore testável; mudança destrutiva exige plano de restore |

---

## 7. APIs (A1–A10)

| ID | Regra |
|----|-------|
| A1 | Uma responsabilidade por endpoint |
| A2 | Escrita passa pelo dono do dado |
| A3 | Respostas financeiras declaram fonte (`snapshot` / `live_estimado` / `ledger` / `balanco_oficial`) |
| A4 | Idempotência em webhooks e criação de FT/invoice |
| A5 | Paginação/limites em listagens crescentes |
| A6 | Novos endpoints projetam colunas (evitar `select('*')` em tabelas quentes) |
| A7 | Erros corretos; sem vazar stack/secrets |
| A8 | Versionar contrato ao mudar semântica financeira |
| A9 | Dashboard/resumo não embute motor de preço paralelo |
| A10 | Rota nova = registrada no app **e** na UI (ou documentada como interna) |

---

## 8. IA (I1–I8)

| ID | Regra |
|----|-------|
| I1 | IA sugere/explica/classifica — não decide valor comercial |
| I2 | Proibido persistir IA como `fat_*`, boletim, invoice ou margem |
| I3 | PII/holerite/docs: finalidade explícita e retenção mínima em logs |
| I4 | Config central de chave/modelo |
| I5 | Fail-open só UX auxiliar; fail-closed se efeito financeiro/auth |
| I6 | Rate limit e teto de custo |
| I7 | Saída estruturada validada (schema) antes do uso |
| I8 | Módulos IA órfãos não ficam “meio ligados” |

---

## 9. Faturamento (F1–F10)

| ID | Regra |
|----|-------|
| F1 | Motor oficial: `calcularEscolta` (+ cancelada / recusada=0) |
| F2 | `calcularFaturamentoLive` só estimativa rotulada |
| F3 | `escort_billings` = snapshot por OS; componentes e `fat_total` consistentes |
| F4 | `APROVADA/FATURADO/FATURADA/PAGO` sem recálculo automático |
| F5 | Boletim enviado/aprovado prevalece; invoice nasce dele |
| F6 | Pedágio: expense é fato; revenue pareado não entra em `receitas_os` |
| F7 | Cancelada: tabela 100 km/3h conforme regra vigente |
| F8 | Recusada: total comercial zero; fora do boletim |
| F9 | Auto-link heurístico de billings ≠ fluxo normal |
| F10 | Mudança F1–F9 exige testes golden + checklist de telas oficiais |

Detalhe: [`04-REGRAS-NEGOCIO-CRITICAS.md`](./04-REGRAS-NEGOCIO-CRITICAS.md).

---

## 10. RH (R1–R8)

| ID | Regra |
|----|-------|
| R1 | Cadastro: `employees` / salários / docs |
| R2 | Batida oficial: `control_id_punches`; legado não primário |
| R3 | Uma engine de custo RH para Balanço (`calcularFolha`) |
| R4 | Snapshot histórico deriva da engine oficial |
| R5 | Holerite é documento; OCR é rascunho até confirmação |
| R6 | HE folha ≠ HE missão (rótulos separados) |
| R7 | Holerite pago → FT idempotente |
| R8 | Sync RHID é satélite; conflitos com política explícita |

---

## 11. Dashboards (H1–H6)

| ID | Regra |
|----|-------|
| H1 | Dashboard não é dono de verdade |
| H2 | Separar: Operacional · Caixa · Resultado (Balanço) |
| H3 | Proibido resumo com fórmula que contradiga `balanco-calc` / FT |
| H4 | Card financeiro cita fonte e validade |
| H5 | Cancelada/recusada: mesmas regras do Boletim/Balanço |
| H6 | Novos KPIs nascem em helpers compartilhados |

---

## 12. Cache (C1–C8)

| ID | Regra |
|----|-------|
| C1 | Cache nunca é SSOT |
| C2 | Writer do fato/snapshot invalida caches dependentes |
| C3 | TTL e chave documentados; SWR opt-in |
| C4 | Divergência: fato vence após bust |
| C5 | Snapshot stale não se apresenta como oficial sem idade |
| C6 | Serverless: memória local ≠ cache global |
| C7 | `staleTime: Infinity` só com invalidação garantida |
| C8 | Espelhos em tabela seguem regras de cache |

---

## 13. Sincronização (Y1–Y7)

| ID | Regra |
|----|-------|
| Y1 | Satélite → interno: adaptador único, autenticado, idempotente, auditado |
| Y2 | Satélite não sobrescreve valor comercial oficial do boletim |
| Y3 | Status gateway atualiza invoice/FT; não reabre componentes do boletim |
| Y4 | WhatsApp produto = tabelas locais |
| Y5 | Asaas/Inter no mesmo invoice: sem double-pay |
| Y6 | Filas com retry, dead-letter e observabilidade |
| Y7 | Sync não “corrige” KPI com motor não oficial |

---

## 14. Auditoria (U1–U7)

| ID | Regra |
|----|-------|
| U1 | Mutação financeira/comercial: ator, antes/depois, timestamp, origem |
| U2 | Falha de auditoria crítica não é silenciosa em produção |
| U3 | Webhooks persistem evento bruto para replay |
| U4 | Aprovações de boletim e exceções de diretoria são trilha |
| U5 | Acesso a dados sensíveis é auditável |
| U6 | Logs de sistema ≠ auditoria de negócio |
| U7 | Retenção mínima para auditoria financeira |

---

## 15. Documentação (O1–O6)

| ID | Regra |
|----|-------|
| O1 | Constituição + este Framework são fontes normativas |
| O2 | Doc contraditória deve ser marcada obsoleta ou corrigida no ciclo |
| O3 | Feature financeira documenta dono, motor, snapshot, telas |
| O4 | ADR para mudança de SSOT/motor/hierarquia |
| O5 | Runbooks: deploy, rollback, restore, webhook, divergência de balanço |
| O6 | Proibido documentar intenção como comportamento ativo |

---

## 16. Testes (T1–T8)

| ID | Regra |
|----|-------|
| T1 | Regras de faturamento: testes unitários determinísticos |
| T2 | Suite mínima sempre verde (ver [`06`](./06-TESTES-E-VALIDACAO.md)) |
| T3 | Mudança em `balanco-calc` / boletim-totals / billing-calc: testes + cenários |
| T4 | Webhooks: auth fail-closed + idempotência |
| T5 | Proibido merge financeiro com testes pulados sem autorização |
| T6 | Testes de regra pura não dependem de rede flaky |
| T7 | Golden numbers quando houver baseline |
| T8 | CI deve exercer testes do domínio alterado |

---

## 17. Deploy (P1–P8)

| ID | Regra |
|----|-------|
| P1 | Trabalho em branch adequada → validação → publicação controlada |
| P2 | Nunca force-push em `main` |
| P3 | Secrets só via env da plataforma |
| P4 | Migrações expand/contract compatíveis com código |
| P5 | Feature flag / compatibilidade quando quebrar leitura antiga |
| P6 | Healthcheck pós-deploy (`/healthz`, `/api/version`) |
| P7 | Crons e webhooks validados após mudança |
| P8 | Deploy não é correção silenciosa de dados sem plano |

Detalhe: [`07-DEPLOY-E-ROLLBACK.md`](./07-DEPLOY-E-ROLLBACK.md).

---

## 18. Rollback (L1–L6)

| ID | Regra |
|----|-------|
| L1 | Deploy de risco tem plano de rollback escrito |
| L2 | Rollback de app não apaga auditoria nem cobranças emitidas sem processo |
| L3 | Migração destrutiva exige backup verificado |
| L4 | Tags/branches de segurança para pontos restauráveis |
| L5 | Divergência financeira pós-deploy: rollback/hotfix — não “ajustar cache” |
| L6 | Incidente de webhook: desligar/flag, reprocessar eventos auditados |

---

## 19. Monitoramento (M1–M6)

| ID | Regra |
|----|-------|
| M1 | Erros API, latência, falhas de cron e webhook |
| M2 | Alertas de divergência boletim/billing/invoice; cancelada zerada indevida |
| M3 | Telemetria de DB não substitui alerta de negócio |
| M4 | Filas e SWR: idade/maturidade visível |
| M5 | Cotas/erros OpenAI e Z-API |
| M6 | Pós-incidente: causa + regra violada + ação preventiva |

---

## 20. Gates de aprovação (G1–G16)

| ID | Critério |
|----|----------|
| G1 | Domínio dono e tipo de dado declarados |
| G2 | Hierarquia não violada |
| G3 | Sem motor/KPI paralelo |
| G4 | Cache/espelho/projeção não viram SSOT |
| G5 | Financeiro/comercial: testes verdes |
| G6 | Segurança/webhook/auth/RLS: fail-closed demonstrado |
| G7 | Banco: migração/compatibilidade e RLS considerados |
| G8 | API registrada, autorizada, paginada se necessário |
| G9 | IA sem persistir como verdade financeira |
| G10 | Invalidação de cache prevista |
| G11 | Auditoria para mutações críticas |
| G12 | Docs normativas atualizadas se mudar SSOT/regra |
| G13 | Plano deploy + rollback em mudança de risco |
| G14 | Sem secrets no diff |
| G15 | Módulo novo completo (lib + rota + UI ou contrato interno) |
| G16 | Revisão humana para billing, boletim, invoice, FT, balanço, auth, webhooks |
| G17 | Pesquisa de reutilização documentada; criação nova só com inviabilidade evidenciada (D11/P13) |

### Conflito de normas

**Segurança fail-closed** > **Integridade financeira** > **Arquitetura Oficial** > **Framework** > **Performance/UX** > **Conveniência**.

### Dívida conhecida

Violações já mapeadas ([`09`](./09-DIVIDAS-E-RISCOS-CONHECIDOS.md)) **não podem ser ampliadas**. Novo código na região endividada inclui passo de conformidade ou ADR.
