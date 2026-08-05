# Incidente / evento — limpeza ad-hoc de `plain_password` (2026-08-05)

**Classificação:** evento operacional fora do fluxo controlado (não é restore, não é DROP).
**Severidade residual:** baixa para disponibilidade; média para governança (histórico de migration desalinhado).
**Status D13 após PR3C:** valores legados limpos; coluna ainda presente (PR4 pendente).

---

## Resumo

Entre a validação pós-merge do PR #52 e o pré-voo do PR3B, o estado de `public.users.plain_password` passou de **36 preenchidos / 0 nulos** para **0 preenchidos / 36 nulos**, **sem** registro da migration versionada `20260805190500_null_legacy_plain_password` no histórico Supabase.

A aplicação controlada via `apply_migration` / arquivo versionado **não** foi executada pelo fluxo PR3B (pré-voo abortado por divergência). O efeito desejado da limpeza **já estava presente**.

---

## Linha do tempo (aproximada, UTC-3 / UTC)

| Momento | Evidência |
|---------|-----------|
| ~16:37 -03 (19:37 UTC) | Pós-merge PR #52: baseline filled=36, null=0 |
| ~16:41–16:43 -03 (19:41–19:43 UTC) | Pré-voo PR3B: filled=0, null=36 |
| Janela | **~4–6 minutos** entre as duas leituras |

Horário aproximado da limpeza: **2026-08-05 entre 16:37 e 16:43 (America/Sao_Paulo)**.

---

## Estado conhecido

### Antes (baseline conhecido PR3A / pós-merge #52)

- `total_users` = 36
- `plain_password_filled` = 36
- `plain_password_is_null` = 0
- Auth match public→auth = 36/36

### No pré-voo PR3B e na homologação PR3C

- `total_users` = 36
- `plain_password_filled` = 0
- `plain_password_is_null` = 36
- `plain_password_empty_string` = 0
- Auth match = 36/36
- Coluna `plain_password` **ainda existe**
- `verify-plain-password-cleanup.sql` = **PASS**
- Migration `20260805190500_null_legacy_plain_password` **ausente** em `list_migrations` (último security: `harden_users_rls`)

### Metadados de tabela (`pg_stat_user_tables`)

- `n_tup_upd` ≈ **36** em `public.users` — compatível com UPDATE em todas as linhas (sem prova de SQL textual exato).

### Outras colunas (contagens)

- `name` / `email` / `role` / `supabase_uid`: sem wipe detectado (0 nulos inesperados em name/email/role/uid).
- `username`: 36 vazios/nulos — padrão legado já observado; **não** atribuído a este evento sem evidência adicional.
- `employee_id` / `must_change_password`: preservados (ex.: ~30 com employee_id; must_change ativo/done ~10/26).

---

## Origem provável (apenas evidência)

| Hipótese | Evidência | Autoria |
|----------|-----------|---------|
| SQL Editor / sessão administrativa ad-hoc | Logs Postgres no período: erros de SQL malformado (`column "password" does not exist`, `cannot alter type of a column used by a view or rule`, `FATAL … user "admin"`) — típicos de tentativa manual no painel | **Não atribuída** a pessoa específica |
| Migration versionada / `apply_migration` | **Descartada** — versão não consta no histórico | — |
| Fluxo PR3B deste agente | **Descartado** — pré-voo parou; nenhum UPDATE enviado | — |

Não há evidência suficiente para atribuir autoria pessoal.

---

## O que NÃO foi feito

- Não se restaurou senha em texto.
- Não se regravou `plain_password`.
- Não se executou rollback documental.
- Não se alterou `auth.users` (senhas Auth).
- Não se removeu a coluna (PR4).
- Não se inseriu registro falso da migration no histórico Supabase.
- Não se publicou Production / não se alterou `main`.

Observação de contexto (sem relação causal com este PR documental): `origin/main` foi observado em `60a6fce3…` por mudança externa.

---

## Homologação pós-limpeza (PR3C)

### Verify / RLS

- Verify PASS (total, filled=0, null=total, empty=0, Auth match, RLS, sem USING(true), `users_select_own`, anon sem grants, authenticated sem grant da coluna, `service_role` SELECT, coluna existe).

### Smoke

| Item | Resultado |
|------|-----------|
| Contratos unitários (cleanup / writers / safe-user / RLS) | **67/67 pass** |
| Sessões Auth ao vivo (`/auth/v1/user` 200) | Observadas em logs API pós-limpeza |
| Chat (`chat_messages` / `chat_participants` 200) | Observado em logs |
| RH (`employees` 200) | Observado em logs |
| Leituras `users` via select seguro (sem `plain_password` no select tipado) | Observadas em logs |
| Login admin/funcionário conduzido pelo agente | **Não executado** — credenciais de homologação ausentes no ambiente (homologado com ressalva) |
| reset/change/create/register-by-cpf | Cobertos por **mocks/contratos** (sem alterar usuário real) |

### Logs (~10+ minutos de observação)

- Sem avalanche de falhas de login atribuíveis à limpeza.
- Tráfego operacional normal (chat, missões, veículos, Auth).
- Erros Postgres de SQL Editor concentrados na janela do evento; separados dos erros de aplicação.
- Sem referências de falha de aplicação a `plain_password` nos logs amostrados.

---

## Tratamento do histórico da migration

**Opção adotada (transparente):**

1. **Não** inserir registro falso de `20260805190500_null_legacy_plain_password` no histórico remoto.
2. Manter o arquivo no repositório como **intenção preparada / artefato PR3A**.
3. Documentar aqui e no runbook que o **efeito** foi alcançado via SQL ad-hoc.
4. Migration de reconciliação só-asserts: **não criada** nesta fase (opcional futuro se necessário).

---

## Lição preventiva

- Nunca executar SQL traduzido/manual no editor no lugar da migration revisada.
- Janela PR3B deve revalidar baseline imediatamente antes e só então aplicar o arquivo versionado.
- Fail-closed da migration (total/filled=36) impede reexecução após limpeza — correto, mas exige disciplina de processo.

---

## Próximos passos

1. Merge documental PR3C em `dev` (quando autorizado).
2. Observação operacional contínua (24h recomendada no runbook).
3. **PR4** (DROP da coluna) — **não iniciado**; somente após autorização explícita e runbook próprio.
