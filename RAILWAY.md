# Deploy no Railway (mesmo banco do Replit)

O Torres **não usa** o PostgreSQL local do Replit. Em produção o banco é o **Supabase** (PostgreSQL na nuvem), via estas variáveis:

| Variável | Para quê |
|---|---|
| `SUPABASE_DATABASE_URL` | Conexão SQL direta (pooler, porta 6543) — **igual ao Replit** |
| `SUPABASE_URL` | API REST do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (acesso admin) |
| `SUPABASE_ANON_KEY` / `VITE_SUPABASE_*` | Frontend |

No Railway você só precisa **copiar as mesmas variáveis** que já existiam no Replit (`Secrets` ou seção `[userenv.shared]` do `.replit`).

---

## Passo a passo (do zero)

### 1. Conta e projeto

1. Acesse [https://railway.com](https://railway.com) e entre com GitHub.
2. **New Project** → **Deploy from GitHub repo** → escolha `grupotmsegthiago/torres`.
3. Railway detecta o `Dockerfile` e o `railway.json` automaticamente.

### 2. Variáveis de ambiente (copiar do Replit)

**Opção A — automático (recomendado)**

Se o projeto ainda tem o `.replit` com `[userenv.shared]`:

```bash
npm run import-env:replit   # gera .env com as mesmas vars do Replit
npm run db:test             # confirma conexão com o Supabase
```

Depois cole o conteúdo do `.env` no Railway (Raw Editor) ou use a Opção C.

**Opção B — painel (manual)**

1. No Replit: **Tools → Secrets** (ou abra `.replit` → `[userenv.shared]`).
2. No Railway: clique no serviço → **Variables** → **Raw Editor**.
3. Cole todas as variáveis no formato `CHAVE=valor` (uma por linha).
4. Confirme que existem pelo menos:
   - `SUPABASE_DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SESSION_SECRET`
   - `PUBLIC_SITE_URL`

**Opção C — script Railway CLI (terminal)**

```bash
# 1. Copie os secrets do Replit para um arquivo .env na raiz do projeto
# 2. Instale e autentique o CLI do Railway
npm install -g @railway/cli
railway login
railway link          # escolha o projeto/serviço Torres

# 3. Envia todas as variáveis não vazias do .env
npm run push-env:railway
```

### 3. Deploy

O Railway faz deploy automaticamente a cada push na branch conectada. Para forçar:

- Painel → serviço → **Deploy** → **Redeploy**
- Ou no terminal: `railway up`

### 4. Conferir se subiu

- Logs: painel Railway → **Deployments** → clique no deploy → **View Logs**
- Healthcheck: `https://SEU-DOMINIO.railway.app/healthz` → deve retornar `{"ok":true,...}`
- Domínio: **Settings** → **Networking** → **Generate Domain**

---

## Conectar ao banco (como no Replit)

O banco de dados **é o mesmo Supabase** de antes. Nada migra — só muda **onde o app roda** (Railway em vez de Replit).

### Opção 1 — Supabase Studio (recomendado, igual “Table Editor”)

1. [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Projeto **erjhxwbutjyylxdthuuz** (Torres)
3. **Table Editor** ou **SQL Editor** — mesmas tabelas de sempre

### Opção 2 — Terminal (`psql`)

Pegue a connection string em **Supabase → Project Settings → Database → Connection string → URI**.

```bash
# Pooler (mesmo que o app usa — porta 6543, ?pgbouncer=true)
psql "$SUPABASE_DATABASE_URL"

# Ou direto (migrations/admin — porta 5432)
psql "postgresql://postgres:SUA_SENHA@db.erjhxwbutjyylxdthuuz.supabase.co:5432/postgres"
```

A senha está em **Supabase → Project Settings → Database → Database password** (ou copie do Replit Secrets).

### Opção 3 — Testar conexão pelo projeto

Com o `.env` preenchido (mesmos valores do Replit):

```bash
npm run db:test
```

Saída esperada:

```
[db:test] Conectado ao Supabase
  database: postgres
  user: postgres
  server_time: ...
```

### Opção 4 — Drizzle (migrations)

```bash
npm run db:push
```

Usa `SUPABASE_DATABASE_URL` do `.env` (ver `drizzle.config.ts`).

### Opção 5 — DBeaver / pgAdmin / TablePlus

| Campo | Valor |
|---|---|
| Host | `db.erjhxwbutjyylxdthuuz.supabase.co` |
| Port | `6543` (pooler) ou `5432` (direto) |
| Database | `postgres` |
| User | `postgres` |
| Password | senha do Supabase |
| SSL | obrigatório (Require) |

---

## Variáveis mínimas para o Railway funcionar

```
SUPABASE_DATABASE_URL=postgresql://postgres:...@db.erjhxwbutjyylxdthuuz.supabase.co:6543/postgres?pgbouncer=true
SUPABASE_URL=https://erjhxwbutjyylxdthuuz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
VITE_SUPABASE_URL=https://erjhxwbutjyylxdthuuz.supabase.co
VITE_SUPABASE_ANON_KEY=...
SESSION_SECRET=...
PUBLIC_SITE_URL=https://torresseguranca.vercel.app
TZ=America/Sao_Paulo
DISABLE_LOCAL_FALLBACK=true
```

Copie os valores reais do Replit — **não** use os placeholders acima.

---

## Vercel + Railway juntos

| O quê | Onde |
|---|---|
| Site + API serverless + crons HTTP | **Vercel** (`vercel.json`) |
| Servidor persistente + crons em memória | **Railway** (`Dockerfile`) |

Os dois apontam para o **mesmo Supabase**. Evite rodar os mesmos crons nos dois ao mesmo tempo (WhatsApp, etc.) — escolha um ambiente como “dono” dos jobs em background.

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Build falha “VITE_SUPABASE_* ausentes” | Vars de build não definidas | Adicione `VITE_SUPABASE_*` (ou `SUPABASE_*`) nas Variables do Railway |
| App sobe mas login/dados falham | `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_DATABASE_URL` faltando | Copie do Replit Secrets |
| Healthcheck falha | Deploy ainda iniciando | Aguarde 1–2 min; veja logs |
| `db:test` falha localmente | `.env` vazio ou senha errada | Copie secrets do Replit para `.env` |
