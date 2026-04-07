# AUDITORIA COMPLETA — SISTEMA DE CHAT INTERNO
## Torres Vigilância Patrimonial
### Data: 07/04/2026

---

## PONTO 1 — BANCO DE DADOS

### Tabelas (4 tabelas necessárias)

| Tabela | Status | Observação |
|--------|--------|------------|
| `chat_conversations` | ✅ EXISTE | Armazena conversas (direct, group, mission). Campos: id, type, name, mission_id, created_by, created_at |
| `chat_messages` | ✅ EXISTE | Armazena mensagens individuais. Campos: id, conversation_id, sender_id, content, type, file_url, lat, lng, delivered_at, created_at |
| `chat_participants` | ✅ EXISTE | Vincula usuários a conversas e rastreia leitura. Campos: id, conversation_id, user_id, last_read_at |
| `chat_presence` | ✅ EXISTE | Status online dos usuários. Campos: user_id, online, last_seen |

### Supabase Realtime

| Tabela | Realtime Habilitado? | Observação |
|--------|---------------------|------------|
| `chat_messages` | ✅ SIM | Canal ativo no admin ("chat-realtime") e mobile ("mobile-chat-rt"), escutando INSERT |
| `chat_conversations` | 🔴 NÃO | Novas conversas só aparecem via polling a cada 15 segundos |
| `chat_presence` | 🔴 NÃO | Status de presença depende apenas de polling a cada 30 segundos |

### Contagem de mensagens
- ✅ Endpoint `GET /api/chat/unread-count` faz a contagem correta comparando `last_read_at` com `created_at` das mensagens (excluindo as do próprio usuário)

---

## PONTO 2 — BACKEND (9 Endpoints)

Todos os endpoints estão registrados no arquivo `server/routes/chat.ts` e protegidos por middleware `requireAuth`.

| # | Método | Endpoint | Status | Funcionalidade |
|---|--------|----------|--------|---------------|
| 1 | GET | `/api/chat/conversations` | ✅ EXISTE | Lista conversas do usuário com unread count, último msg, participantes |
| 2 | POST | `/api/chat/conversations` | ✅ EXISTE | Cria nova conversa (direct, group ou mission) |
| 3 | GET | `/api/chat/conversations/:id/messages` | ✅ EXISTE | Lista mensagens com paginação (before/limit) |
| 4 | POST | `/api/chat/conversations/:id/messages` | ✅ EXISTE | Envia mensagem (tipos: text, image, file, location, system) |
| 5 | PATCH | `/api/chat/conversations/:id/read` | ✅ EXISTE | Marca conversa como lida (atualiza last_read_at) |
| 6 | POST | `/api/chat/presence` | ✅ EXISTE | Atualiza status online e last_seen via upsert |
| 7 | GET | `/api/chat/presence` | ✅ EXISTE | Retorna presença de todos os usuários |
| 8 | GET | `/api/chat/unread-count` | ✅ EXISTE | Total de mensagens não lidas em todas as conversas |
| 9 | GET | `/api/chat/users` | ✅ EXISTE | Lista usuários disponíveis para chat (id, name, email, role, avatar_url) |

### ⚠️ Problema identificado no backend:
O `navigator.sendBeacon()` usado no `beforeunload` para marcar offline envia `POST /api/chat/presence` com `{ online: false }`. Porém este endpoint exige `requireAuth` (sessão). O `sendBeacon` nem sempre envia cookies de sessão em todos os navegadores, podendo falhar silenciosamente ao marcar o usuário como offline.

---

## PONTO 3 — REALTIME NO FRONTEND

### Canais Supabase Realtime ativos

| Página | Canal | Tabela | Evento | Ação |
|--------|-------|--------|--------|------|
| Admin (`admin/chat.tsx`) | `chat-realtime` | `chat_messages` | INSERT | Refetch mensagens + conversas |
| Mobile (`mobile/chat.tsx`) | `mobile-chat-rt` | `chat_messages` | INSERT | Refetch mensagens + conversas |

### Verificação detalhada

| Item | Status | Detalhe |
|------|--------|---------|
| `chat_messages` está no canal Realtime? | ✅ SIM | Ambas as páginas escutam INSERT |
| `chat_conversations` está no canal Realtime? | 🔴 NÃO | Novas conversas só aparecem via polling (15s) |
| `chat_presence` está no canal Realtime? | 🔴 NÃO | Presença atualiza apenas via polling (30s) |
| Quando nova mensagem chega, invalida queries? | ✅ SIM | Chama `refetchMsgs()` e `refetchConvs()` automaticamente |

### Polling como fallback (configurado nos dois frontends)

| Dado | Intervalo | Status |
|------|-----------|--------|
| Conversas | 15 segundos | ✅ Ativo |
| Mensagens (conversa ativa) | 5 segundos | ✅ Ativo |
| Presença | 30 segundos | ✅ Ativo |

---

## PONTO 4 — NOTIFICAÇÕES MOBILE (`client/src/pages/mobile/chat.tsx`)

| Item | Status | Detalhe |
|------|--------|---------|
| Lógica de notificação quando app em background | 🔴 NÃO EXISTE | Nenhum código para notificar quando app perde foco |
| `Notification.requestPermission()` sendo chamado? | 🔴 NÃO EXISTE | Nenhuma chamada em todo o código mobile |
| Service Worker registrado para push notifications? | 🔴 NÃO EXISTE | O `sw.js` atual é um placeholder vazio. O `main.tsx` DESREGISTRA service workers existentes |
| Heartbeat de presença (a cada 60s)? | ✅ SIM | `setInterval` de 60s chamando `POST /api/chat/presence` com `{ online: true }` |
| `beforeunload` para marcar offline? | 🔴 NÃO EXISTE NO MOBILE | Este handler só existe no admin. Mobile depende do timeout do heartbeat para marcar offline |

---

## PONTO 5 — NOTIFICAÇÕES WEB / ADMIN (`client/src/pages/admin/chat.tsx`)

| Item | Status | Detalhe |
|------|--------|---------|
| `Notification.requestPermission()` sendo chamado? | 🔴 NÃO EXISTE | Nenhuma chamada no código admin |
| Quando chega mensagem nova via Realtime, dispara notificação do browser? | 🔴 NÃO EXISTE | O Realtime apenas faz refetch silencioso dos dados, sem notificação visual/sonora |
| Badge de não lidas no menu atualiza em tempo real? | 🔴 NÃO EXISTE NO MENU | O sidebar mostra "Chat" sem nenhum contador. Badge de não lidas só aparece DENTRO da página de chat, na lista de conversas |
| Polling de fallback está configurado? | ✅ SIM | 3 intervalos ativos: conversas (15s), mensagens (5s), presença (30s) |
| `beforeunload` para marcar offline? | ✅ SIM | Usa `navigator.sendBeacon("/api/chat/presence", JSON.stringify({ online: false }))` |
| Som de notificação? | ⚠️ PARCIAL | O hook `useNotificationSound` existe no código (`client/src/hooks/use-notification-sound.ts`) e gera um beep via Web Audio API, mas NÃO está ativo/importado nas páginas de chat |

---

## PONTO 6 — FLUXO COMPLETO

| Passo | Status | Detalhe |
|-------|--------|---------|
| Criar conversa entre admin e agente | ✅ FUNCIONA | Via `POST /api/chat/conversations` com type: "direct" |
| Enviar mensagem de teste | ✅ FUNCIONA | Via `POST /api/chat/conversations/:id/messages` |
| Mensagem salva no banco | ✅ FUNCIONA | Insert na tabela `chat_messages` via Supabase |
| Realtime propaga | ✅ FUNCIONA | Canal `chat_messages` INSERT dispara refetch automático em ambos os clientes |

---

## RESUMO GERAL

### ✅ O que está funcionando (12 itens)
1. Banco de dados — 4 tabelas criadas e operacionais no Supabase
2. Backend — 9 endpoints registrados, protegidos por autenticação
3. Realtime para `chat_messages` — INSERT propagado nos dois frontends
4. Polling fallback — 3 intervalos configurados (5s, 15s, 30s)
5. Heartbeat de presença — Admin e Mobile enviam a cada 60s
6. `beforeunload` no admin — Marca offline ao fechar aba
7. Badge de não lidas — Funciona DENTRO da página de chat
8. Contagem de não lidas — Endpoint calculando corretamente
9. Paginação de mensagens — Suporta `before` e `limit`
10. Tipos de mensagem — text, image, file, location, system
11. Tipos de conversa — direct, group, mission
12. Fluxo completo — Criar conversa → enviar → salvar → propagar funciona

### 🔴 O que está quebrado ou faltando (8 itens)
1. **Browser Notifications** — `Notification.requestPermission()` não existe em nenhum lugar
2. **Push Notifications** — Nenhum sistema de push implementado
3. **Service Worker** — Arquivo `sw.js` é placeholder vazio; `main.tsx` desregistra workers
4. **`beforeunload` no Mobile** — Faltando completamente, usuário não é marcado offline ao fechar
5. **Badge no menu/sidebar** — Nenhum contador de não lidas no menu lateral (admin nem mobile)
6. **Realtime para `chat_conversations`** — Novas conversas dependem exclusivamente de polling
7. **Realtime para `chat_presence`** — Status online/offline depende exclusivamente de polling
8. **Notificação sonora** — Hook existe mas não está conectado ao chat

### ⚠️ O que está parcial (2 itens)
1. **Som de notificação** — `useNotificationSound` existe e funciona (testado na grid operacional) mas não foi importado/ativado nas páginas de chat
2. **`sendBeacon` para presença offline** — Implementado no admin mas pode falhar silenciosamente pois o endpoint exige sessão autenticada e `sendBeacon` nem sempre envia cookies

---

## ARQUIVOS RELEVANTES

| Arquivo | Descrição |
|---------|-----------|
| `server/routes/chat.ts` | Todos os 9 endpoints do chat |
| `server/routes.ts` | Registro das rotas (linha 342) |
| `client/src/pages/admin/chat.tsx` | Interface chat admin (437 linhas) |
| `client/src/pages/mobile/chat.tsx` | Interface chat mobile (352 linhas) |
| `client/src/lib/supabase.ts` | Cliente Supabase (10 linhas) |
| `client/src/hooks/use-notification-sound.ts` | Hook de som (não usado no chat) |
| `client/src/components/admin/layout.tsx` | Sidebar admin (sem badge de chat) |
| `client/src/components/mobile/layout.tsx` | Navigation mobile (sem badge de chat) |
| `client/public/sw.js` | Service Worker placeholder vazio |
| `client/src/main.tsx` | Desregistra service workers (linhas 6-17) |

---

*Relatório gerado automaticamente — Sistema Torres Gestão Operacional*
*Nenhuma alteração foi feita no código — apenas verificação e reporte.*
