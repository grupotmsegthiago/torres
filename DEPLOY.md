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
| `npm test` falhou no build | `prebuild` roda testes; corrigir teste ou ver log |
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

No Replit, os crons rodavam em processo contínuo (`node-cron`). Na Vercel, os jobs críticos estão em `vercel.json` → `crons`, chamando `/api/cron?job=...`.

Jobs já migrados:

| Job | Frequência Vercel | Antes (Replit) |
|-----|-------------------|----------------|
| `whatsapp-forward` | 1 min | 30 s |
| `agent-central-escalation` | 1 min | 1 min |
| `whatsapp-monitor` | 3 min | 3 min |
| `billing` | 30 min | 30 min |
| `nf-reconcile` | 15 min | 15 min |
| `aceite-expirado` | 30 min | 30 min |

**Atenção:** dezenas de outros crons (Control iD, Inter backfill, RH, rodízio, e-mails diários, etc.) ainda estão só em `server/cron.ts` e **não rodam na Vercel** até serem adicionados em `server/cron-vercel.ts` + `vercel.json`. Enquanto a migração não estiver 100%, mantenha o Replit em paralelo ou migre os jobs restantes.

Plano Hobby da Vercel: crons no mínimo a cada 1 minuto (não suporta 30 s).

## 5. Desligar o Replit

Só desative o deploy no Replit depois de:

- [ ] Domínio apontando para a Vercel
- [ ] Login e painel admin funcionando
- [ ] Webhooks (WhatsApp, banco) atualizados
- [ ] Crons críticos validados nos logs da Vercel
- [ ] Variáveis sensíveis removidas do `.replit` versionado (se aplicável)

## Desenvolvimento local

```bash
npm install
npm run dev    # Replit/Node tradicional na porta 5000
npm test
npm run build
npm start      # produção local
```

Para simular Vercel localmente: `npx vercel dev` (requer CLI e login).
