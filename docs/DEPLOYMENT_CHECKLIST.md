# Checklist de deploy — Torres

## Pré-requisitos

- [ ] `.env` local normalizado e **ignorado** pelo Git
- [ ] Projeto Supabase **TORRES** (`erjhxwbutjyylxdthuuz`)
- [ ] Remote GitHub `origin` apontando para `grupotmsegthiago/torres`
- [ ] Branch `dev` criada; produção = `main`
- [ ] Projeto Vercel vinculado ao repositório correto
- [ ] Variáveis enviadas (`npm run env:push-vercel`) sem sobrescrever às cegas
- [ ] `INTER_*` preenchidas se o módulo Inter for usado em produção
- [ ] Webhooks Asaas/Z-API apontando para domínio Vercel (não Replit)

## Validação local

```powershell
npm install --legacy-peer-deps
npm test
npm run check   # typecheck (pode haver erros legados)
npm run build
npm run dev
```

- [ ] `/healthz` → 200
- [ ] `/api/version` → JSON
- [ ] Login admin
- [ ] Abrir OS, boletim, balanço, WhatsApp

## Preview Vercel

```powershell
npx vercel login
npx vercel link
npx vercel          # Preview
```

- [ ] Preview abre
- [ ] API responde
- [ ] Auth funciona
- [ ] Sem loop de reload PWA

## Produção (somente após aprovação)

```powershell
.\publicar.ps1
```

- [ ] Crons autenticados com `CRON_SECRET`
- [ ] Domínio + redirects
- [ ] Desligar Replit só depois da validação
