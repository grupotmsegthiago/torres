# 10 — Template: Especificação Funcional

**Uso obrigatório** antes de implementar mudança que toque financeiro, auth, webhooks, schema, ou regra de negócio.
Para hotfixes triviais de UI/texto, uma versão resumida dos campos marcados com ★ basta.

Copie este bloco para o PR / issue / chat e preencha.

---

```markdown
## Especificação Funcional — [TÍTULO]

**Data:**
**Autor:**
**Branch prevista:**
**Referências normativas lidas:** docs/governanca/README + 01 + 02 + 03 + 04

### ★ Problema
(O que está errado ou faltando, em linguagem de negócio.)

### ★ Causa raiz
(Evidência: arquivo, função, tabela, API — não sintoma.)

### ★ Pesquisa de reutilização (D11 / P13) — obrigatória
- Termos / símbolos buscados:
- O que já existe (arquivos / funções / APIs / telas):
- Decisão: [ ] Reutilizar  [ ] Estender/corrigir  [ ] Integrar  [ ] Criar novo
- Se criar novo: por que a reutilização é inviável (evidência, não preferência):

### Evidência
- Arquivo / linha:
- Tabela / campo:
- Reprodução:

### ★ Objetivo
(Resultado mensurável após a mudança.)

### ★ Regra de negócio
(Como DEVE funcionar; citar 04 se aplicável.)

### ★ Domínio dono
(Ex.: escort_billings, boletim_approvals, invoices…)

### ★ Tipo de dado
[ ] FATO  [ ] RESULTADO  [ ] SNAPSHOT  [ ] PROJECAO  [ ] ESPELHO  [ ] CACHE  [ ] SATELITE

### Escopo permitido
-

### Fora do escopo (explícito)
- Não alterar:
- Não refatorar:

### Arquivos esperados
-

### Impacto
- Telas:
- APIs:
- Banco:
- Integrações:
- Performance/cache:

### Riscos
- Financeiro:
- Segurança:
- Regressão:
- Dívida ampliada? [ ] Não  [ ] Sim (justificar ADR)

### Critérios de aceitação
- [ ]
- [ ]

### Testes (suite 06 aplicável)
- [ ]
Comando:

### Backup / ponto de restauração
- Hash / tag:

### Rollback
- Como reverter em uma frase:

### Publicação
- [ ] Não publicar nesta entrega
- [ ] Publicar após gates (quem autoriza):

### Validação pós-deploy
-
```

---

## Decisão do proprietário

Se houver **mais de uma regra de negócio possível**, **interrompa** e peça decisão explícita do dono do produto **antes** de implementar.
