# Deploy no Railway (mesmo banco do Replit)

O Torres **não usa** o PostgreSQL local do Replit. O banco é o **Supabase**, com as mesmas variáveis de `[userenv.shared]` no `.replit`.

**Importante:** no Railway **não** use o `.env.example` completo antigo (tinha dezenas de chaves extras). Use **só o padrão Replit** — 33 secrets + `PORT=5000`.

---

## Variáveis no Railway (padrão Replit)

Gere a lista exata no terminal:

```bash
npm run export-env:railway
```

No Railway:

1. Serviço → **Variables** → **Raw Editor**
2. **Selecione tudo e apague** (limpa o que foi colado do `.env` antigo)
3. Cole **somente** o que o comando acima imprimiu (ou o arquivo `.railway.env`)
4. **Save** → **Redeploy**

São **34 linhas** no total (33 do Replit + `PORT=5000`).

---

## Passo a passo (do zero)

### 1. Conta e projeto

1. [https://railway.com](https://railway.com) → GitHub
2. **New Project** → **Deploy from GitHub repo** → `grupotmsegthiago/torres`
3. Railway usa `Dockerfile` + `railway.json`

### 2. Variáveis (só padrão Replit)

```bash
npm run export-env:railway   # imprime o bloco para o Raw Editor
npm run db:test              # opcional: testa Supabase localmente
```

Ou, para gerar `.env` local:

```bash
npm run import-env:replit
```

### 3. Deploy

Redeploy após salvar as variáveis. Domínio: **Settings → Networking → Generate Domain**.

Teste: `https://SEU-DOMINIO.railway.app/healthz` → `{"ok":true,...}`

---

## Lista de chaves (ordem Replit)

```
APIBRASIL_TOKEN
APIBRASIL_DEVICE_NOTAS
APIBRASIL_DEVICE_PROCESSOS
APIBRASIL_DEVICE_CNH
APIBRASIL_DEVICE_CERTIDAO_PJ
APIBRASIL_DEVICE_MULTAS
APIBRASIL_DEVICE_PROTESTO
APIBRASIL_DEVICE_QUOD
APIBRASIL_DEVICE_RISCO_PJ
APIBRASIL_DEVICE_SPC
APIBRASIL_DEVICE_ELEITORAL
APIBRASIL_DEVICE_PLACA_DADOS
APIBRASIL_DEVICE_TOKEN
APIBRASIL_SOCKET_CHANNEL
RECEITAWS_TOKEN
SUPABASE_DATABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GOOGLE_MAPS_API_KEY
TRUCKSCONTROL_CHAVE
TRUCKSCONTROL_SENHA
WDAPI_TOKEN
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_FROM
ASAAS_API_URL
RHID_API_URL
RHID_EMAIL
ASAAS_MUNICIPAL_SERVICE_ID
PORT
```

**Não adicione** no Railway coisas que não estavam no Replit (`SESSION_SECRET`, `PUBLIC_SITE_URL`, `DATABASE_URL`, `TZ`, etc.) — a menos que você saiba que precisa.

---

## Conectar ao banco (como no Replit)

| Método | Como |
|---|---|
| **Supabase Studio** | [supabase.com/dashboard](https://supabase.com/dashboard) → projeto Torres |
| **Teste local** | `npm run import-env:replit` → `npm run db:test` |
| **psql** | `psql "$SUPABASE_DATABASE_URL"` (valor do Replit) |

---

## CLI Railway (alternativa ao Raw Editor)

```bash
npm run import-env:replit
npm install -g @railway/cli
railway login && railway link
npm run push-env:railway
```

O script `push-env:railway` envia **apenas** chaves presentes no `.env` gerado pelo Replit.

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Muitas variáveis no Raw | Apague tudo; cole só `npm run export-env:railway` |
| Build falha VITE_* | Confirme `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na lista Replit |
| App sem dados | Confirme `SUPABASE_DATABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` |
