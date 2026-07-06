# Deploy: GitHub + Vercel

Este projeto foi preparado para sair do Replit e rodar em **GitHub** (código/CI) + **Vercel** (produção).

## ⚠️ Repo GitHub vazio = Vercel não funciona

Se em `https://github.com/grupotmsegthiago/torres` aparece **"Quick setup"** (sem arquivos, sem README), a Vercel **não tem o que publicar**. O código está só no PC/Replit — precisa do **primeiro push** (seção abaixo).

Depois do push, a Vercel detecta o commit na `main` e faz o deploy sozinha (se o projeto já estiver importado).

## 1. Publicar no GitHub

Repositório: **https://github.com/grupotmsegthiago/torres**

### Primeiro push (repo vazio no GitHub)

O `origin` neste clone já aponta para o GitHub. No terminal **com Git instalado** (Git Bash, GitHub Desktop → Open in Git Bash, ou Replit Shell):

```powershell
cd "C:\Users\SAMSUNG\OneDrive\04. Sistemas\Torres"

git status
git add -A
git commit -m "Publica Torres no GitHub para deploy Vercel."

git push -u origin main
```

**Sem Git no Windows?** Opções:

1. **GitHub Desktop** — File → Add local repository → pasta `Torres` → Push origin
2. **Replit** — no Shell do projeto: `git remote add origin https://github.com/grupotmsegthiago/torres.git` (se ainda não tiver) e `git push -u origin main`

Confirme no GitHub que aparecem pastas `api/`, `server/`, `client/`, `vercel.json`, `package.json`.

### Fluxo contínuo (depois do primeiro push)

```powershell
git checkout dev    # criar uma vez: git checkout -b dev
# ... commits na dev ...
.\publicar.ps1      # merge dev → main + push (Vercel deploya a main)
```

O workflow `.github/workflows/ci.yml` roda testes, typecheck e build em cada push/PR.

## 2. Conectar na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e importe **grupotmsegthiago/torres** (só depois do primeiro push).
2. **Production Branch:** `main`
3. Framework: **Other** (usa `vercel.json`).
4. Build: `npm run build` (já no `vercel.json`).
5. **Node.js 20** (`.nvmrc`).
6. Copie as variáveis do Replit para **Settings → Environment Variables** (lista abaixo).

Se o deploy falhar nos **logs da Vercel**, causas comuns:

| Erro | Solução |
|------|---------|
| Repositório vazio / sem commits | Fazer o primeiro push (acima) |
| `npm test` falhou no build | Testes rodam no GitHub CI (`build:ci`), não na Vercel; ver Actions |
| `Cannot find module` | Conferir `installCommand` com `legacy-peer-deps` (já no `vercel.json`) |
| Site abre mas login/API quebra | Faltam env vars (`SUPABASE_*`, `SESSION_SECRET`, etc.) |

Variáveis essenciais (lista completa em `replit.md`):

| Variável | Uso |
|----------|-----|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DATABASE_URL` | Banco |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend |
| `SESSION_SECRET`, `CONTROLID_ENC_KEY` | Auth/sessão |
| `SMTP_*` | E-mail |
| `ASAAS_API_KEY`, `ASAAS_API_URL` | Cobrança |
| `INTER_*` | Banco Inter |
| `ZAPI_*` | WhatsApp |
| `OPENAI_API_KEY` | IA/OCR |
| `PUBLIC_SITE_URL` | `https://www.torresseguranca.com.br` |
| `CRON_SECRET` | Token dos crons HTTP (gere um valor aleatório longo) |

Na Vercel, defina também `TZ=America/Sao_Paulo`.

## 3. Domínio customizado

Em **Vercel → Domains**, adicione `www.torresseguranca.com.br` e configure o DNS (CNAME para `cname.vercel-dns.com`).

Atualize webhooks externos (Z-API, Asaas, Inter) para apontar para o novo domínio Vercel.

## 4. Crons na Vercel

No Replit, os crons rodavam em processo contínuo (`node-cron`). Na Vercel, **todos os jobs** foram consolidados em **6 buckets** (`server/cron-buckets.ts` + `server/cron-jobs.ts`), chamando `/api/cron?job=...` conforme `vercel.json`.

| Bucket | Frequência | Conteúdo principal |
|--------|------------|-------------------|
| `minute` | 1 min | WhatsApp forward, escalonamento Agente Central, **jobs diários em horário BRT** |
| `three-min` | 3 min | Monitor de conexão WhatsApp |
| `five-min` | 5 min | Fila RHID, Inter (2 dias), Agente Central proativo |
| `ten-min` | 10 min | Billing live + meta de faturamento |
| `fifteen-min` | 15 min | Reconciliação NF Asaas |
| `thirty-min` | 30 min | Aceites de missão expirados |

Jobs com horário fixo (Control iD, Inter backfill, folha, rodízio, e-mails da diretoria, alertas RH/frota, etc.) rodam no bucket `minute` quando o relógio BRT bate o horário — ver `runBrtScheduledJobs()` em `server/cron-buckets.ts`.

Replit/local usa os **mesmos buckets** via `initCronJobs()` em `server/cron.ts` (sem duplicar lógica).

Plano Hobby da Vercel: crons no mínimo a cada 1 minuto (WhatsApp forward passou de 30 s para 1 min na Vercel; no Replit continua 30 s via `initWhatsappForwardCron`).

## 5. Desligar o Replit

Só desative o deploy no Replit depois de:

- [ ] Domínio apontando para a Vercel
- [ ] Login e painel admin funcionando
- [ ] Webhooks (WhatsApp, banco) atualizados
- [ ] Crons críticos validados nos logs da Vercel
- [ ] Variáveis sensíveis removidas do `.replit` versionado (se aplicável)

### Como parar o bot no Replit (evita duplicar mensagem com a Vercel)

Se o WhatsApp mostra **duas** notificações de "código de segurança mudou" ou o bot manda **duas respostas**, quase sempre são **Replit + Vercel** com as mesmas chaves `ZAPI_*`.

1. Abra o projeto no [replit.com](https://replit.com)
2. Clique em **Stop** (parar o Repl) — o processo `node`/`npm` deve encerrar
3. Em **Deployments** / **Autoscale** / **Always On** → **desligue** (Off)
4. **Secrets** do Repl → remova ou esvazie `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` (opcional mas recomendado)
5. Painel **Z-API** → webhook **"Ao receber"** → **somente**  
   `https://www.torresseguranca.com.br/api/whatsapp/webhook`  
   (nada de `*.replit.app` ou `*.replit.dev`)
6. Confirme: Console do Replit **sem** logs `[whatsapp-forward-cron]` ou `[agent-central-mention]` após Stop

Enquanto o Replit estiver ligado com código **antigo**, ele ainda manda **"Resumo Operacional do Dia" no grupo** — comportamento que já foi removido no código novo (resumo só no PV dos 2 celulares autorizados).

## Desenvolvimento local

```bash
npm install
npm run dev    # Replit/Node tradicional na porta 5000
npm test
npm run build
npm start      # produção local
```

Para simular Vercel localmente: `npx vercel dev` (requer CLI e login).
