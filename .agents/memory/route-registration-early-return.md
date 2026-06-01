---
name: Early return in route-registration kills later routes
description: When disabling an integration, an early return inside a register*Routes() function silently unregisters every route after it in the same file.
---

# Early `return` ao desativar integração = mata rotas seguintes do arquivo

**Regra:** Num arquivo `register*Routes(app)` que mistura rotas de uma integração desativada com rotas não relacionadas, **nunca** use `return` antecipado para "desligar" a integração. Use guards de prefixo (`app.use("/api/<prefixo>", guard)`) registrados ANTES dos handlers reais.

**Why:** Em `server/routes/conciliacao.ts`, o bloco `if (TICKETLOG_DISABLED) { app.use(...guards...); return; }` dava `return` e impedia o registro de TODAS as rotas definidas depois — inclusive `/api/controladoria/pedagio-cobrado` (a calculadora "Pedágio: Pago × Cobrado", que não tem nada a ver com TicketLog). Rota não registrada → cai no catch-all do Vite → devolve `index.html` (HTML, status 200) → o front faz `res.json()` e estoura **"Unexpected token '<', '<!DOCTYPE'... is not valid JSON"**.

**How to apply:**
- Sintoma "Unexpected token '<' ... is not valid JSON" num fetch = o backend devolveu HTML; quase sempre a rota `/api/...` não está registrada (ou está atrás de um catch-all). Confirme batendo no endpoint e checando `content-type` (HTML = fallback do Vite).
- Guards de prefixo `app.use(prefixo, guard)` continuam bloqueando os handlers reais do mesmo prefixo mesmo sem `return`, porque o Express respeita a ordem de registro (guard registrado antes → intercepta primeiro com 503).
- O dev server NÃO faz hot-reload de mudanças no `server/` — precisa reiniciar o workflow "Start application" para a rota nova/alterada subir.
