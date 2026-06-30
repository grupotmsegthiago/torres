---
name: NORMAIS/TRABALHADO/NOTURNO na folha de ponto (estilo cartão Control iD)
description: Como exibir horas na folha consolidada do Control iD para bater com o cartão oficial, sem mexer em pagamento.
---

# Folha de ponto: colunas no estilo do cartão Control iD

Na folha de ponto consolidada por funcionário (tela Control iD → aba Folha de Ponto)
as colunas de tempo devem aparecer em **HH:MM** e seguir o cartão oficial do Control iD:

- **TRABALHADO** = horas efetivas (worked). Bate 100% com o cartão.
- **NOTURNO** = minutos noturnos 22h–05h. Bate 100% com o cartão.
- **NORMAIS** = `min(trabalhado, jornada prevista do dia)`. Para TORRES ESCOLTA a
  jornada prevista é fixa **04:00–23:59 = 19h59 = 1199 min** (mesmo horário hardcoded
  em `buildEspelhoRhid.horariosContratuais`). Acima do cap o excedente é "extra" no cartão.
- **H. Extra** continua na base de **PAGAMENTO** (`horas_mensais ÷ 25` = 8h48/dia),
  NÃO na base do cartão. Logo NORMAIS + H.Extra ≠ TRABALHADO — e isso é intencional
  (o dono aceitou: NORMAIS/TRAB/NOTURNO espelham o cartão; H.Extra espelha o que paga).

**Why:** o dono escolheu explicitamente (user_query) "igual ao cartão Control iD" para
NORMAIS, e disse: "ONDE ESTIVER COLUNAS ASSIM PODE APLICAR NA GESTÃO DE PESSOAS".
A H.Extra de pagamento (base 8h48) não pode mudar — é regra de custo de folha (INTOCÁVEL).

**How to apply:** isto é SÓ EXIBIÇÃO. Nunca alterar `buildFolhaStats`/`computeWorkedHours`/
custo. O cálculo vem de `buildFolhaPonto` (server/control-id.ts): expõe `workedMin`,
`normaisMin = min(workedMin, 1199)`, `noturnoMin`, `extraMin` (pagamento). O frontend só
formata via helper `hhmm(min)`.

**Limite conhecido:** o cartão tem uma tolerância proprietária de ~5 min que NÃO é
reproduzível só com as batidas (ex.: GABRIEL #21 26/05 → cartão NORMAIS 19:59, cálculo
19:54). Determinístico a partir das batidas; não emular tolerância sem regra explícita do dono.
