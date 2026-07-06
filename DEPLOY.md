# Deploy: GitHub + Vercel

Mesmo fluxo do **Sistema Grupo TM SEG** e **Site Grupo TM SEG**.

## Publicar (dia a dia)

```powershell
.\publicar.ps1
```

O script faz merge `dev` → `main`, push no GitHub e volta para `dev`. A **Vercel** detecta o push na `main` e roda `npm install` + `npm run build` na nuvem — você **não** precisa rodar `npm` localmente para publicar.

## Primeira vez (Vercel)

1. [vercel.com/new](https://vercel.com/new) → importar **grupotmsegthiago/torres**
2. **Production Branch:** `main`
3. Framework: **Other** (usa `vercel.json`)
4. Copiar variáveis do Replit para **Settings → Environment Variables**
5. **Settings → Deployment Protection** → desligar em Production (acesso público)
6. **Settings → Domains** → adicionar `www.torresseguranca.com.br` e `torresseguranca.com.br`

URL padrão após importar: **https://torresseguranca.vercel.app**

Repositório: **https://github.com/grupotmsegthiago/torres**

### Branches

```powershell
git checkout -b dev    # só na primeira vez, se ainda não existir
git push -u origin dev
```

Depois disso, sempre `.\publicar.ps1`.

## Variáveis essenciais

| Variável | Valor |
|----------|-------|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DATABASE_URL` | Banco |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend |
| `SESSION_SECRET`, `CONTROLID_ENC_KEY` | Auth |
| `SMTP_*` | E-mail |
| `ASAAS_API_KEY`, `ASAAS_API_URL` | Cobrança |
| `INTER_*` | Banco Inter |
| `ZAPI_*` | WhatsApp |
| `OPENAI_API_KEY` | IA/OCR |
| `PUBLIC_SITE_URL` | `https://www.torresseguranca.com.br` |
| `CRON_SECRET` | Token dos crons HTTP |
| `TZ` | `America/Sao_Paulo` |

## DNS (domínio próprio)

- `www` → CNAME `cname.vercel-dns.com`
- `@` → A `76.76.21.21`

Quando o domínio estiver **Valid** na Vercel, adicione em `vercel.json` o redirect (igual ao Sistema):

```json
{
  "source": "/:path*",
  "has": [{ "type": "host", "value": "torresseguranca.vercel.app" }],
  "destination": "https://www.torresseguranca.com.br/:path*",
  "permanent": true
}
```

Webhooks (Z-API, Asaas): `https://www.torresseguranca.com.br/api/...`

## Crons na Vercel

6 buckets HTTP em `vercel.json` → `/api/cron?job=...` (ver `server/cron-buckets.ts`).

## Desligar o Replit

Só depois de domínio, login, webhooks e crons validados na Vercel.
