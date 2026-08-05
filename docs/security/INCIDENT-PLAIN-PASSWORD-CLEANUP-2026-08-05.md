# Incidente / evento â€” limpeza ad-hoc de `plain_password` (2026-08-05)

**ClassificaÃ§Ã£o:** evento operacional fora do fluxo controlado (nÃ£o Ã© restore, nÃ£o Ã© DROP).
**Severidade residual:** baixa para disponibilidade; mÃ©dia para governanÃ§a (histÃ³rico de migration desalinhado).
**Status D13 apÃ³s PR3C:** valores legados limpos; coluna ainda presente (PR4 pendente).

---

## Resumo

Entre a validaÃ§Ã£o pÃ³s-merge do PR #52 e o prÃ©-voo do PR3B, o estado de `public.users.plain_password` passou de **36 preenchidos / 0 nulos** para **0 preenchidos / 36 nulos**, **sem** registro da migration versionada `20260805190500_null_legacy_plain_password` no histÃ³rico Supabase.

A aplicaÃ§Ã£o controlada via `apply_migration` / arquivo versionado **nÃ£o** foi executada pelo fluxo PR3B (prÃ©-voo abortado por divergÃªncia). O efeito desejado da limpeza **jÃ¡ estava presente**.

---

## Linha do tempo (aproximada, UTC-3 / UTC)

| Momento | EvidÃªncia |
|---------|-----------|
| ~16:37 -03 (19:37 UTC) | PÃ³s-merge PR #52: baseline filled=36, null=0 |
| ~16:41â€“16:43 -03 (19:41â€“19:43 UTC) | PrÃ©-voo PR3B: filled=0, null=36 |
| Janela | **~4â€“6 minutos** entre as duas leituras |

HorÃ¡rio aproximado da limpeza: **2026-08-05 entre 16:37 e 16:43 (America/Sao_Paulo)**.

---

## Estado conhecido

### Antes (baseline conhecido PR3A / pÃ³s-merge #52)

- `total_users` = 36
- `plain_password_filled` = 36
- `plain_password_is_null` = 0
- Auth match publicâ†’auth = 36/36

### No prÃ©-voo PR3B e na homologaÃ§Ã£o PR3C

- `total_users` = 36
- `plain_password_filled` = 0
- `plain_password_is_null` = 36
- `plain_password_empty_string` = 0
- Auth match = 36/36
- Coluna `plain_password` **ainda existe**
- `verify-plain-password-cleanup.sql` = **PASS**
- Migration `20260805190500_null_legacy_plain_password` **ausente** em `list_migrations` (Ãºltimo security: `harden_users_rls`)

### Metadados de tabela (`pg_stat_user_tables`)

- `n_tup_upd` â‰ˆ **36** em `public.users` â€” compatÃ­vel com UPDATE em todas as linhas (sem prova de SQL textual exato).

### Outras colunas (contagens)

- `name` / `email` / `role` / `supabase_uid`: sem wipe detectado (0 nulos inesperados em name/email/role/uid).
- `username`: 36 vazios/nulos â€” padrÃ£o legado jÃ¡ observado; **nÃ£o** atribuÃ­do a este evento sem evidÃªncia adicional.
- `employee_id` / `must_change_password`: preservados (ex.: ~30 com employee_id; must_change ativo/done ~10/26).

---

## Origem provÃ¡vel (apenas evidÃªncia)

| HipÃ³tese | EvidÃªncia | Autoria |
|----------|-----------|---------|
| SQL Editor / sessÃ£o administrativa ad-hoc | Logs Postgres no perÃ­odo: erros de SQL malformado (`column "password" does not exist`, `cannot alter type of a column used by a view or rule`, `FATAL â€¦ user "admin"`) â€” tÃ­picos de tentativa manual no painel | **NÃ£o atribuÃ­da** a pessoa especÃ­fica |
| Migration versionada / `apply_migration` | **Descartada** â€” versÃ£o nÃ£o consta no histÃ³rico | â€” |
| Fluxo PR3B deste agente | **Descartado** â€” prÃ©-voo parou; nenhum UPDATE enviado | â€” |

NÃ£o hÃ¡ evidÃªncia suficiente para atribuir autoria pessoal.

---

## O que NÃƒO foi feito

- NÃ£o se restaurou senha em texto.
- NÃ£o se regravou `plain_password`.
- NÃ£o se executou rollback documental.
- NÃ£o se alterou `auth.users` (senhas Auth).
- NÃ£o se removeu a coluna (PR4).
- NÃ£o se inseriu registro falso da migration no histÃ³rico Supabase.
- NÃ£o se publicou Production / nÃ£o se alterou `main`.

---

## HomologaÃ§Ã£o pÃ³s-limpeza (PR3C)

### Verify / RLS

- Verify PASS (total, filled=0, null=total, empty=0, Auth match, RLS, sem USING(true), `users_select_own`, anon sem grants, authenticated sem grant da coluna, `service_role` SELECT, coluna existe).

### Smoke

| Item | Resultado |
|------|-----------|
| Contratos unitÃ¡rios (cleanup / writers / safe-user / RLS) | **67/67 pass** |
| SessÃµes Auth ao vivo (`/auth/v1/user` 200) | Observadas em logs API pÃ³s-limpeza |
| Chat (`chat_messages` / `chat_participants` 200) | Observado em logs |
| RH (`employees` 200) | Observado em logs |
| Leituras `users` via select seguro (sem `plain_password` no select tipado) | Observadas em logs |
| Login admin/funcionÃ¡rio conduzido pelo agente | **NÃ£o executado** â€” credenciais de homologaÃ§Ã£o ausentes no ambiente |
| reset/change/create/register-by-cpf | Cobertos por **mocks/contratos** (sem alterar usuÃ¡rio real) |

### Logs (~10+ minutos de observaÃ§Ã£o)

- Sem avalanche de falhas de login atribuÃ­veis Ã  limpeza.
- TrÃ¡fego operacional normal (chat, missÃµes, veÃ­culos, Auth).
- Erros Postgres de SQL Editor concentrados na janela do evento; separados dos erros de aplicaÃ§Ã£o.
- Sem referÃªncias de falha de aplicaÃ§Ã£o a `plain_password` nos logs amostrados.

---

## Tratamento do histÃ³rico da migration

**OpÃ§Ã£o adotada (transparente):**

1. **NÃ£o** inserir registro falso de `20260805190500_null_legacy_plain_password` no histÃ³rico remoto.
2. Manter o arquivo no repositÃ³rio como **intenÃ§Ã£o preparada / artefato PR3A**.
3. Documentar aqui e no runbook que o **efeito** foi alcanÃ§ado via SQL ad-hoc.
4. Migration de reconciliaÃ§Ã£o sÃ³-asserts: **nÃ£o criada** nesta fase (opcional futuro se necessÃ¡rio).

---

## LiÃ§Ã£o preventiva

- Nunca executar SQL traduzido/manual no editor no lugar da migration revisada.
- Janela PR3B deve revalidar baseline imediatamente antes e sÃ³ entÃ£o aplicar o arquivo versionado.
- Fail-closed da migration (total/filled=36) impede reexecuÃ§Ã£o apÃ³s limpeza â€” correto, mas exige disciplina de processo.

---

## PrÃ³ximos passos

1. Merge documental PR3C em `dev` (quando autorizado).
2. ObservaÃ§Ã£o operacional contÃ­nua (24h recomendada no runbook).
3. **PR4** (DROP da coluna) â€” **nÃ£o iniciado**; somente apÃ³s autorizaÃ§Ã£o explÃ­cita e runbook prÃ³prio.
