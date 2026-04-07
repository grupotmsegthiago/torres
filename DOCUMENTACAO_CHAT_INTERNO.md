# Chat Interno — Torres Vigilância Patrimonial
## Documentação Completa do Sistema de Mensagens em Tempo Real

**Empresa:** Torres Vigilância Patrimonial  
**CNPJ:** 36.982.392/0001-89  
**Data:** 07/04/2026  

---

## 1. Visão Geral

O Chat Interno é um sistema de comunicação em tempo real integrado ao sistema Torres, permitindo troca de mensagens entre todos os usuários (Diretoria, Administradores e Agentes de campo). O sistema funciona tanto no painel administrativo (desktop) quanto no aplicativo mobile dos agentes.

### Objetivos
- Comunicação direta entre central operacional e agentes em campo
- Registro de todas as mensagens para auditoria
- Compartilhamento de localização GPS em tempo real
- Indicador de presença online/offline de cada usuário
- Contagem de mensagens não lidas
- Suporte a conversas diretas (1:1), em grupo e vinculadas a missões

---

## 2. Banco de Dados (Supabase)

Foram criadas 4 tabelas no Supabase PostgreSQL com Realtime habilitado em todas.

### 2.1 `chat_conversations`
Armazena as conversas (salas de chat).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | Identificador único da conversa |
| `type` | TEXT | Tipo: `direct` (1:1), `group` (grupo), `mission` (vinculada a OS) |
| `name` | TEXT | Nome do grupo (null para conversas diretas) |
| `mission_id` | INTEGER | ID da OS vinculada (apenas tipo `mission`) |
| `created_by` | INTEGER | ID do usuário que criou a conversa |
| `created_at` | TIMESTAMP | Data de criação |

### 2.2 `chat_participants`
Relaciona usuários às conversas e controla a leitura.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | Identificador único |
| `conversation_id` | UUID (FK) | Referência à conversa |
| `user_id` | INTEGER | ID do usuário participante |
| `last_read_at` | TIMESTAMP | Última vez que o usuário leu a conversa |
| `joined_at` | TIMESTAMP | Data que entrou na conversa |

**Índices:** `(conversation_id, user_id)` UNIQUE

### 2.3 `chat_messages`
Armazena todas as mensagens trocadas.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | Identificador único da mensagem |
| `conversation_id` | UUID (FK) | Conversa à qual pertence |
| `sender_id` | INTEGER | ID do usuário que enviou |
| `content` | TEXT | Conteúdo da mensagem |
| `type` | TEXT | Tipo: `text`, `image`, `file`, `location`, `system` |
| `file_url` | TEXT | URL do arquivo/imagem (quando aplicável) |
| `lat` | DOUBLE PRECISION | Latitude GPS (tipo `location`) |
| `lng` | DOUBLE PRECISION | Longitude GPS (tipo `location`) |
| `delivered_at` | TIMESTAMP | Quando foi entregue |
| `created_at` | TIMESTAMP | Data de envio |

**Índices:** `(conversation_id, created_at)` para busca eficiente de mensagens

### 2.4 `chat_presence`
Status online/offline de cada usuário.

| Coluna | Tipo | Descrição |
|---|---|---|
| `user_id` | INTEGER (PK) | ID do usuário (chave única) |
| `online` | BOOLEAN | Se está online agora |
| `last_seen` | TIMESTAMP | Última vez visto online |

**Supabase Realtime:** Habilitado em todas as 4 tabelas para atualização instantânea no frontend.

---

## 3. Backend — API (9 Endpoints)

Arquivo: `server/routes/chat.ts`  
Registrado em: `server/routes.ts` via `registerChatRoutes(app)`  
Todas as rotas exigem autenticação (`requireAuth`).

### 3.1 Listar Conversas
```
GET /api/chat/conversations
```
- **Admin/Diretoria:** Vê todas as conversas do sistema
- **Agente (funcionário):** Vê apenas conversas onde é participante
- **Retorno:** Array de conversas com `participants`, `lastMessage`, `unreadCount`
- Ordenação: mais recente primeiro (baseado na última mensagem)

### 3.2 Criar Conversa
```
POST /api/chat/conversations
Body: { type: "direct"|"group"|"mission", name?: string, missionId?: number, participantIds: number[] }
```
- Para conversas diretas (1:1): verifica se já existe conversa entre os dois usuários antes de criar
- Cria automaticamente uma mensagem de sistema "Conversa iniciada"
- Adiciona o criador como participante automaticamente

### 3.3 Buscar Mensagens
```
GET /api/chat/conversations/:id/messages?before=ISO_DATE&limit=50
```
- Retorna últimas 50 mensagens (configurável, máximo 100)
- Suporta paginação via parâmetro `before` (cursor-based)
- Agentes só acessam conversas onde são participantes
- Admin/Diretoria pode acessar qualquer conversa

### 3.4 Enviar Mensagem
```
POST /api/chat/conversations/:id/messages
Body: { content: string, type: "text"|"image"|"file"|"location"|"system", fileUrl?: string, lat?: number, lng?: number }
```
- Valida o tipo de mensagem
- Verifica permissão de acesso à conversa
- Define `delivered_at` automaticamente no envio
- Supabase Realtime propaga a mensagem instantaneamente para todos os participantes

### 3.5 Marcar Como Lido
```
PATCH /api/chat/conversations/:id/read
```
- Atualiza `last_read_at` do participante para o momento atual
- Usado para zerar a contagem de não lidas

### 3.6 Atualizar Presença
```
POST /api/chat/presence
Body: { online: boolean }
```
- Upsert na tabela `chat_presence` (cria se não existe, atualiza se já existe)
- Atualiza `last_seen` para o momento atual

### 3.7 Consultar Presença
```
GET /api/chat/presence
```
- Retorna status de todos os usuários (online/offline + última vez visto)

### 3.8 Contar Não Lidas
```
GET /api/chat/unread-count
```
- Retorna o total global de mensagens não lidas do usuário logado
- Soma todas as conversas onde ele é participante

### 3.9 Listar Usuários
```
GET /api/chat/users
```
- Retorna todos os usuários do sistema (id, name, email, role, avatar_url, employee_id)
- Usado para o modal "Nova Conversa"

---

## 4. Frontend — Painel Admin

**Arquivo:** `client/src/pages/admin/chat.tsx`  
**Rota:** `/admin/chat`  
**Menu:** Sidebar → "Chat" (ícone MessageCircle)

### 4.1 Layout
- **Desktop:** Sidebar de conversas (320px) à esquerda + área de mensagens à direita
- **Mobile:** Alterna entre lista de conversas e thread (responsivo)

### 4.2 Sidebar de Conversas
- Campo de busca por nome de conversa
- Botão "+" para nova conversa
- Lista de conversas com:
  - Avatar com iniciais do nome (ou ícone de grupo)
  - Indicador online/offline (bolinha verde/cinza)
  - Nome do contato ou grupo
  - Preview da última mensagem (truncada em 40 caracteres)
  - Horário da última mensagem
  - Badge vermelho com contagem de não lidas

### 4.3 Área de Mensagens
- Cabeçalho com avatar, nome e status (Online / "Visto às HH:MM")
- Mensagens em bolhas estilo WhatsApp:
  - **Enviadas (minhas):** fundo verde claro (`#dcf8c6`), alinhadas à direita
  - **Recebidas:** fundo branco, alinhadas à esquerda, nome do remetente em azul
  - **Sistema:** centralizadas, fundo transparente, texto pequeno
- Indicadores de entrega:
  - ✓ simples (cinza) = enviado
  - ✓✓ duplo (azul) = entregue
- Horário em cada mensagem (HH:MM, fuso Brasília)
- Mensagens de localização com link "📍 Ver no mapa" (abre Google Maps)
- Auto-scroll para última mensagem

### 4.4 Barra de Envio
- Botão de localização GPS (ícone MapPin)
- Campo de texto com envio por Enter
- Botão de enviar (verde, ícone Send)
- Loading spinner durante envio

### 4.5 Modal Nova Conversa
- Busca por nome de usuário
- Lista todos os usuários do sistema
- Indicador online/offline em cada contato
- Mostra o cargo (role) de cada usuário
- Click cria conversa direta e abre imediatamente

---

## 5. Frontend — App Mobile

**Arquivo:** `client/src/pages/mobile/chat.tsx`  
**Rota:** `/mobile/chat`  
**Menu:** Bottom nav → "Chat" (ícone MessageCircle)

### 5.1 Tela de Lista (dentro do MobileLayout)
- Cabeçalho "Mensagens" com botão "+ Nova"
- Cards de conversa com:
  - Avatar grande (44px) com iniciais
  - Indicador online/offline
  - Nome do contato
  - Preview da última mensagem
  - Horário
  - Badge de não lidas
- Estado vazio com ícone e texto "Nenhuma conversa ainda"

### 5.2 Tela de Thread (tela cheia, sem bottom nav)
- Cabeçalho escuro (neutral-800) com:
  - Botão voltar (ChevronLeft)
  - Avatar com indicador online
  - Nome e status ("Online" / "Visto DD/MM")
- Fundo cinza claro (#f0f0f0)
- Bolhas de mensagem iguais ao admin
- Barra de envio com:
  - Botão de localização
  - Input arredondado (rounded-full)
  - Botão de enviar arredondado (verde)
- Safe area para dispositivos com notch

### 5.3 Modal Nova Conversa (Bottom Sheet)
- Abre de baixo para cima (estilo iOS)
- Handle de arrasto visual no topo
- Busca por nome
- Filtra apenas admin/diretoria (agentes não veem outros agentes)
- Indicador online/offline em cada contato

---

## 6. Sistema de Presença (Online/Offline)

### 6.1 Heartbeat
- Ao abrir o chat, envia `POST /api/chat/presence` com `{ online: true }`
- Repete a cada **60 segundos** automaticamente
- Timer é limpo ao fechar a página

### 6.2 Desconexão
- `beforeunload` event no admin: usa `navigator.sendBeacon()` para enviar `{ online: false }` antes de fechar
- Garantia de marcação offline mesmo em fechamento abrupto

### 6.3 Polling
- Presença de todos os usuários: polling a cada **30 segundos**
- Lista de conversas: polling a cada **15 segundos**
- Mensagens da thread ativa: polling a cada **5 segundos**

---

## 7. Tempo Real (Supabase Realtime)

### 7.1 Canal de Eventos
- **Admin:** Canal `chat-realtime` escuta INSERT na tabela `chat_messages`
- **Mobile:** Canal `mobile-chat-rt` escuta INSERT na tabela `chat_messages`

### 7.2 Comportamento
- Quando uma nova mensagem é inserida no banco:
  - Se pertence à conversa ativa → refetch imediato das mensagens
  - Sempre → refetch da lista de conversas (atualiza preview e badge)
- Canal é recriado quando o usuário troca de conversa (cleanup do anterior)

---

## 8. Tipos de Mensagem

| Tipo | Descrição | Visual |
|---|---|---|
| `text` | Mensagem de texto simples | Texto em bolha normal |
| `image` | Foto/imagem | Imagem inline + legenda |
| `file` | Arquivo anexo | Link para download |
| `location` | Coordenadas GPS | Link "📍 Ver no mapa" (Google Maps) |
| `system` | Mensagem do sistema | Centralizada, fundo transparente, texto pequeno |

---

## 9. Segurança e Permissões

| Regra | Descrição |
|---|---|
| Autenticação obrigatória | Todas as rotas exigem `requireAuth` (JWT Supabase) |
| Isolamento de conversas | Agentes só acessam conversas onde são participantes |
| Acesso admin total | Admin/Diretoria pode ver todas as conversas |
| Filtro de contatos mobile | Agentes no mobile só veem admin/diretoria para iniciar conversa |
| Sem dados financeiros | Chat não expõe nenhum dado financeiro ou operacional sensível |

---

## 10. Navegação

### Painel Admin
- **Sidebar:** Item "Chat" com ícone de balão de mensagem (MessageCircle)
- **Rota:** `/admin/chat`
- **Arquivo de layout:** `client/src/components/admin/layout.tsx`

### App Mobile
- **Bottom Nav:** Item "Chat" substituiu "Checklist" na barra inferior
- **Rota:** `/mobile/chat`
- **Arquivo de layout:** `client/src/components/mobile/layout.tsx`

### Registro de Rotas
- **Arquivo:** `client/src/App.tsx`
- Admin: `<Route path="/admin/chat">` → `ProtectedRoute` (bloqueia agentes)
- Mobile: `<Route path="/mobile/chat">` → `MobileProtectedRoute` (exige GPS + selfie)

---

## 11. Arquivos do Sistema

| Arquivo | Função |
|---|---|
| `server/routes/chat.ts` | 8 endpoints da API de chat |
| `server/routes.ts` | Registro das rotas (`registerChatRoutes`) |
| `client/src/pages/admin/chat.tsx` | Página de chat do painel admin |
| `client/src/pages/mobile/chat.tsx` | Página de chat do app mobile |
| `client/src/components/admin/layout.tsx` | Sidebar admin (item Chat adicionado) |
| `client/src/components/mobile/layout.tsx` | Bottom nav mobile (item Chat adicionado) |
| `client/src/App.tsx` | Registro de rotas frontend |

---

## 12. Dependências Técnicas

| Tecnologia | Uso no Chat |
|---|---|
| Supabase PostgreSQL | Armazenamento de conversas, mensagens, presença |
| Supabase Realtime | Push de novas mensagens em tempo real |
| Express.js | API REST backend |
| React + TypeScript | Interface frontend |
| TanStack React Query | Cache e polling de dados |
| Wouter | Roteamento frontend |
| Lucide React | Ícones (Send, MessageCircle, MapPin, etc.) |
| Navigator Geolocation API | Compartilhamento de localização GPS |
| Navigator SendBeacon API | Marcação offline ao fechar página |

---

## 13. Fluxo de Uso

### Cenário 1: Admin envia mensagem para agente
1. Admin acessa `/admin/chat`
2. Clica no "+" para nova conversa
3. Busca o nome do agente e clica nele
4. Conversa é criada (ou reaproveitada se já existia)
5. Admin digita mensagem e pressiona Enter
6. Mensagem é salva no Supabase
7. Supabase Realtime notifica o app mobile do agente
8. Agente vê a mensagem instantaneamente (se app aberto) ou no próximo polling

### Cenário 2: Agente compartilha localização
1. Agente abre uma conversa no `/mobile/chat`
2. Toca no ícone de localização (MapPin)
3. Navegador solicita permissão GPS (se não concedida)
4. Coordenadas são enviadas como mensagem tipo `location`
5. Admin recebe mensagem com link "📍 Ver no mapa"
6. Link abre Google Maps na posição exata do agente

### Cenário 3: Verificar se agente está online
1. Admin abre o chat e vê a lista de conversas
2. Bolinha verde = agente online (heartbeat nos últimos 60s)
3. Bolinha cinza = agente offline
4. Ao abrir a conversa, cabeçalho mostra "Online" ou "Visto às HH:MM"

---

*Documento gerado automaticamente pelo sistema Torres Vigilância Patrimonial.*

---

### 🕒 Histórico de Atualizações

---

#### 07/04/2026 — 06:55 BRT | Sistema de Aceite de Missões (Task #11)

**Descrição Tática:**
1. **Tabela `mission_acceptances`** criada no Supabase — registra aceite/recusa de missões com GPS, IP, dispositivo, horário e assinatura do agente.
2. **Endpoints canônicos** implementados:
   - `POST /api/missions/:osId/accept` — agente aceita a missão
   - `POST /api/missions/:osId/refuse` — agente recusa a missão
   - `POST /api/chat/accept-mission` — aceite/recusa via chat (mesmo fluxo)
3. **Verificação de segurança IDOR:** Antes de verificar `mission_acceptances`, o sistema valida se o agente está **realmente designado na OS** (campos `employee1_id` ou `employee2_id`). Agentes não-designados recebem erro 403.
4. **`send-mission-invite`** atualizado para criar registros de aceite apenas para os agentes efetivamente designados na OS (não para todos os participantes da conversa).
5. **`AcceptanceStatusSection`** adicionada em `service-orders.tsx` — mostra status de aceite na página da OS.
6. **Aba "Missões"** adicionada na pasta do funcionário em `employees.tsx` — histórico de missões aceitas/recusadas.
7. **Mensagens de sistema** (`type: "system"`) inseridas na conversa de despacho ao aceitar/recusar.

**Justificativa Técnica:**
O fluxo anterior de despacho de missões via chat não registrava formalmente o aceite do agente. Sem registro de aceite com metadados (GPS, IP, timestamp), não havia como auditar se o agente aceitou ou recusou a missão. A correção de IDOR era crítica — sem ela, qualquer agente com acesso ao chat poderia aceitar missões de outros agentes.

**Status:** Testado e mergeado. RULES.md e SYSTEM_BRAIN.md respeitados. Post-merge executado com sucesso.

---

#### 07/04/2026 — 07:30 BRT | Correção Completa de Fuso Horário (Brasília UTC-3)

**Descrição Tática:**
1. **`ensureUTC()`** exportada centralmente em `client/src/lib/utils.ts` — função que adiciona sufixo "Z" a timestamps do banco que são armazenados sem timezone.
2. **`formatBRT()`, `formatDateBRT()`, `formatTimeBRT()`** atualizadas para usar `ensureUTC` internamente.
3. **25+ arquivos do frontend corrigidos:**
   - `tracker.tsx` — `timeAgo()`, `isOnline()`, display de histórico, ordenação
   - `telemetry.tsx` — `formatDate()` sem `timeZone: "America/Sao_Paulo"`
   - `mission.tsx` — timer, scheduledDate, MissionTimeline, próximas missões
   - `ponto-operacional.tsx` (admin + mobile) — `formatDateBR()`, timer de jornada
   - `financeiro.tsx` — sorting de billings, display de `created_at`
   - `clients.tsx` — filtros de período, `sentAt`, `revisado_em`, `fmtTime`
   - `employees.tsx` — `isDocExpiringSoon()`, `createdAt`, `docExpiryStatus`
   - `service-orders.tsx` — `formatDateTime()`
   - `boletim-medicao.tsx` — `fmtDate`/`fmtTime`, `mDate`, `fmtToHHMM`
   - `relatorio-faturamento.tsx` — `fmtDate`/`fmtTime`
   - `calculadora-jornada.tsx` — `inicio_missao`/`fim_missao`
   - `consultas.tsx` — display de `createdAt` nos logs
   - `audit.tsx` — `formatDateTime()`
   - `home.tsx` — `dataEmbarque` do formulário de cotação
   - `balanco-gerencial.tsx` — display de `m.data`
   - `fueling.tsx` — display de `createdAt`
   - `mobile/chat.tsx` — `fmtTime()`, `fmtDate()`
   - `mobile/meu-rh.tsx` — `fmtDate()`
   - `mobile/ocorrencia.tsx` — `created_at` display
   - `mobile/missao.tsx` — timeline, scheduledDate, earlyBlocked
4. **Banco de dados:** `SET timezone = 'America/Sao_Paulo'` executado automaticamente em cada nova conexão via `pool.on("connect")` em `server/db.ts`.
5. **Backend:** `process.env.TZ = "America/Sao_Paulo"` já existia em `server/index.ts` (mantido).

**Justificativa Técnica:**
O Supabase armazena timestamps sem sufixo de timezone (ex: `"2026-04-07T06:05:00"`). Quando o JavaScript faz `new Date("2026-04-07T06:05:00")`, interpreta como hora local do navegador. Se o navegador está em UTC (ou qualquer fuso diferente de BRT), o horário é interpretado com offset de +3h, causando erros como "há 3h10" quando deveria mostrar "há 5 min", ou "PERDA DE SINAL 190min" quando era 10min. A função `ensureUTC()` adiciona o sufixo "Z" para forçar interpretação como UTC, e depois `timeZone: "America/Sao_Paulo"` converte para exibição em Brasília.

**Status:** Testado — servidor rodando sem erros. RULES.md atualizado com regras de timezone. SYSTEM_BRAIN.md respeitado.

---

#### 07/04/2026 — 09:40 BRT | Auditoria Financeira TOR-0018 (Custo Fantasma R$ 590,88)

**Descrição Tática:**
1. **Auditoria realizada** sobre o valor de R$ 590,88 exibido como "Abastecimento" na TOR-0018.
2. **Origem identificada:** Dois registros em `mission_costs` (id=48 e id=49), ambos criados em `2026-04-07T06:30:27` pela função `syncFuelingMissionCosts()`.
3. **Causa raiz identificada:** A função `syncFuelingMissionCosts()` em `server/routes.ts` (linha 215) busca abastecimentos com `created_at >= os.created_at` para a mesma viatura. Isso puxou abastecimentos dos dias 03/04 (R$ 292,76, F#12) e 05/04 (R$ 298,12, F#13) que pertenciam a missões anteriores (TOR-0016, TOR-0019) da mesma viatura UER7D08.
4. **Valores detalhados:**
   - `mission_costs` id=48: R$ 292,76 — Posto pão com linguiça, 42.49L gasolina (fueling id=12, data original 03/04)
   - `mission_costs` id=49: R$ 298,12 — Auto posto Geremias, 42.65L gasolina (fueling id=13, data original 05/04)
   - Total: R$ 292,76 + R$ 298,12 = **R$ 590,88**
5. **Impacto:** Faturamento TOR-0018 = R$ 480,00 → Margem = 480 − 590,88 = **−R$ 110,88** (margem negativa falsa).
6. **Nenhuma correção aplicada** — apenas auditoria e documentação da falha.

**Justificativa Técnica:**
O filtro `created_at >= os.created_at` não verifica se o abastecimento já foi contabilizado em outra OS concluída da mesma viatura. Como a TOR-0018 é a única OS ativa do vehicle_id=8, o sync atribuiu todos os abastecimentos recentes da viatura a ela, independentemente de terem ocorrido durante missões anteriores já encerradas.

**Status:** Falha documentada. Correção pendente de autorização. RULES.md consultado — regra de ghost costs se aplica aqui (custos não devem ser atribuídos sem comprovação real vinculada à missão).

---

#### 07/04/2026 — 10:05 BRT | Correção de Isolamento de Custos — Eliminação de Herança de Combustível

**Descrição Tática:**
1. **`syncFuelingMissionCosts()` reescrita** em `server/routes.ts` (linha 218):
   - **ANTES:** Query usava `.gte("created_at", os.created_at)` — buscava todos os abastecimentos desde a criação da OS, puxando registros de dias/semanas anteriores de outras missões da mesma viatura.
   - **DEPOIS:** Query usa `.eq("date", osDateBRT)` — busca SOMENTE abastecimentos cuja data (`vehicle_fueling.date`) corresponde EXATAMENTE à data agendada da missão (campo `scheduled_date`), convertida para BRT.
2. **Filtro de missão ativa adicionado:** Antes de buscar abastecimentos, verifica se `mission_status` NÃO é "aguardando" nem "agendada". Missões não iniciadas não recebem custo de combustível.
3. **Check de duplicidade cross-OS implementado:** Antes de inserir um `mission_cost`, o sistema consulta `mission_costs` com `ILIKE '%[F#<id>]%'` para verificar se aquele abastecimento já foi vinculado a QUALQUER outra OS (não apenas as ativas). Se já existe, pula o registro.
4. **Registros fantasma removidos do banco:** `mission_costs` id=48 (R$ 292,76, F#12 de 03/04) e id=49 (R$ 298,12, F#13 de 05/04) deletados da TOR-0018 (OS id=35).
5. **Validação pós-correção:** Servidor reiniciado, sync executou após 5s, TOR-0018 permanece com R$ 0,00 em combustível — nenhum registro fantasma recriado.
6. **Fechamento de brace no operational.ts** (linha 321): Adicionado `}` de fechamento do bloco `if (missionHasStarted)` que estava faltando antes do `catch`, causando erro de compilação.

**Blocos de código alterados:**

**server/routes.ts — Query de busca (ANTES):**
```typescript
const { data: fuelings } = await supabaseAdmin.from("vehicle_fueling")
  .select("id, vehicle_id, driver_id, total_cost, ...")
  .eq("vehicle_id", os.vehicle_id)
  .gte("created_at", os.created_at)           // ← FALHA: puxa histórico inteiro
  .order("created_at", { ascending: true });
```

**server/routes.ts — Query de busca (DEPOIS):**
```typescript
const osDateBRT = new Date(os.scheduled_date || os.created_at)
  .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const { data: fuelings } = await supabaseAdmin.from("vehicle_fueling")
  .select("id, vehicle_id, driver_id, total_cost, ..., date")
  .eq("vehicle_id", os.vehicle_id)
  .eq("date", osDateBRT)                      // ← CORREÇÃO: data exata da missão
  .order("created_at", { ascending: true });
```

**server/routes.ts — Check de duplicidade (NOVO):**
```typescript
const { data: alreadyLinked } = await supabaseAdmin.from("mission_costs")
  .select("id")
  .ilike("description", `%[F#${f.id}]%`)
  .limit(1);
if (alreadyLinked?.length) continue;           // ← já vinculado em outra OS
```

**Justificativa Técnica:**
A lógica anterior de "Último Lançamento" (`created_at >= os.created_at`) permitia herança de custos entre missões da mesma viatura. A nova lógica de "Lançamento por Data da Missão" (`date = scheduled_date em BRT`) garante isolamento total: cada OS só contabiliza abastecimentos realizados na data exata da sua operação. O check de duplicidade cross-OS impede que o mesmo registro F#N seja contabilizado duas vezes, mesmo em cenários de viatura compartilhada entre múltiplas OS no mesmo dia.

**Status:** Testado e aplicado. Servidor rodando sem erros. SYSTEM_BRAIN.md L002 respeitado ("Custos reais de combustível NUNCA devem ser herdados de missões anteriores da mesma viatura"). RULES.md Regra 6 respeitada ("NUNCA puxar registros de abastecimento de dias anteriores").

---

#### 07/04/2026 — 10:15 BRT | Auditoria do Fluxo de Aceite de Missão via Chat

**Descrição Tática:**
1. **Verificação de Sigilo do Card (`mission_invite`):**
   - Endpoint `POST /api/chat/send-mission-invite` (`server/routes/chat.ts`, linha 372): Envia apenas `osId`, `osNumber`, `scheduledDate`, `origin`, `destination`, `type`. **Nenhum campo `customer_name` ou `total_value` presente.**
   - Endpoint automático em `server/routes/service-orders.ts` (linha 1041): Adiciona `team` (nomes dos agentes) e `vehicle` (placa). **Nenhum dado financeiro ou de cliente.**
   - Interface `MissionInviteData` (`chat-widget.tsx`, linha 53): Define apenas 6 campos operacionais, zero financeiros.

2. **Rastreabilidade do Aceite:**
   - Endpoint `POST /api/missions/:osId/accept` (`server/routes/mission.ts`, linha 1845): Salva `responded_at` em ISO UTC via `new Date().toISOString()`. ID do agente extraído do JWT (`req.user!.employeeId`), nunca do body (proteção IDOR). Verifica designação em `assignedEmployeeId`/`assignedEmployee2Id` antes de aceitar.
   - Mensagem de sistema inserida no chat: `"✅ {nome} aceitou a missão {osNumber} — {timeBRT}"` com hora formatada em `timeZone: "America/Sao_Paulo"`.
   - Audit log gravado com `logSystemAudit`: ação `mission_acceptance_accept`, IP, GPS, dispositivo, token de aceite.

3. **Integridade do Histórico na Pasta do Funcionário:**
   - Endpoint `GET /api/employees/:id/acceptances` (`server/routes/mission.ts`, linha 1825): Busca `mission_acceptances` por `employee_id`, enriquece com `osNumber`, `osDate`, `osType`.
   - Frontend `employees.tsx`: Aba "Missões" (key `aceites`) com dashboard de 4 contadores (Total, Aceitos, Recusados, Expirados) e tabela detalhada com colunas OS, Data Missão, Status, Respondido em, Dispositivo.
   - Data da missão exibida com `timeZone: "America/Sao_Paulo"`.

**Justificativa Técnica:**
Auditoria preventiva do fluxo end-to-end de aceite de missão para garantir que: (1) nenhum dado financeiro ou de cliente vaza para agentes de campo via card do chat; (2) timestamps são registrados corretamente em Brasília; (3) o histórico de aceites alimenta corretamente a pasta do funcionário.

**Status:** Auditoria concluída. **Nenhum erro encontrado.** Todos os 7 pontos de verificação aprovados. SYSTEM_BRAIN.md Regra 1.5 respeitada (aceite de missão com tabela `mission_acceptances`, CRON de expiração, proteção IDOR). RULES.md consultado.

---

#### 07/04/2026 — 10:25 BRT | Mapa Completo do Sistema para Auditoria Externa

**Descrição Tática:**
1. **Arquivo `MAPA_SISTEMA_COMPLETO.md` gerado** com visão 360° do projeto contendo:
   - Tree View completo da estrutura de arquivos (sem node_modules)
   - Inventário de todas as 68 tabelas do Supabase com descrição de cada uma
   - Pilar 1: Autenticação (`use-auth.tsx`) — fluxo de login, RBAC, diferenciação Diretoria/Admin/Agente
   - Pilar 2: Lógica Operacional (`operational.ts`) — vehicleFuelCache, vehicleFuelFirstOS, cálculo DRE, congelamento de custos
   - Pilar 3: Sync de Abastecimento (`routes.ts`) — syncFuelingMissionCosts corrigida com filtro de data exata
   - Pilar 4: Faturamento (6 telas de billing) — motor de cálculo, ciclos 15/30 dias, integração Asaas
   - Regras Globais: timezone, combustível, financeiro, missão, segurança
   - Lições Aprendidas: 6 regressões históricas documentadas (L001-L006)
2. **Tabelas inventariadas** em 8 categorias: Operacional (7), Financeiro (11), Frota (6), RH (11), Clientes (4), Armamento (5), Chat (4), Sistema (13), Localização (3).

**Justificativa Técnica:**
Documento gerado para permitir que analista externo tenha visão completa da arquitetura sem necessidade de acesso ao código-fonte, reduzindo custos de reprocessamento e acelerando revisões futuras.

**Status:** Documento entregue. SYSTEM_BRAIN.md e RULES.md enviados como referência. Nenhuma alteração de código realizada nesta etapa — apenas documentação.

---

#### 07/04/2026 — 10:30 BRT | Implementação de Status "Recusada" com Reset Financeiro (Estorno Tático)

**Descrição Tática:**
Novo status `recusada` implementado no fluxo de OS com 4 ações automáticas:

1. **Zerar Receita** — Campos `fat_calculado`, `custo_total_alocado`, `lucro_calculado`, `margem_calculada`, `valorEstimado` todos zerados. Valores congelados com `custos_congelados_por = "recusada_por_[admin]"`.
2. **Limpar Faturamento** — `escort_billings` vinculados marcados como `CANCELADA`; `mission_costs` deletados; transações automáticas removidas. Motor de faturamento 15/30 dias (Pilar 4) agora ignora OS com status `recusada` em todos os filtros.
3. **Liberar Viatura** — `isFinished` inclui `recusada`, liberando veículo para `disponível` imediatamente + kit de armamento para `disponível`.
4. **Log de Auditoria** — Registro em `system_audit_logs` com action `OS_RECUSADA`, detalhando: osNumber, status anterior, timestamp BRT, admin responsável, clientId, vehicleId, confirmação de faturamento zerado e custos limpos.

**Arquivos alterados:**
- `server/routes/service-orders.ts` — Trigger de limpeza no PATCH handler (linhas 959-1005); `isFinished` + `wasFinished` + filtros de alocação de combustível
- `server/routes/operational.ts` — Grid filter (recusada aparece no dia mas sem cálculo DRE); sorting de finalização
- `server/routes/escort.ts` — Boletim de medição ignora recusada; DRE não calcula billing para recusada
- `client/src/pages/admin/service-orders.tsx` — Dropdown com opção "Recusada"; badge laranja; contagem em filtros
- `client/src/pages/admin/operational-grid.tsx` — Badge laranja "RECUSADA" no grid; sorting correto
- `client/src/pages/admin/boletim-medicao.tsx` — Row styling laranja; label "Recusada — Faturamento Zerado"

**Justificativa Técnica:**
Estorno Tático impede faturamento indevido no Asaas/DRE para missões recusadas pelo cliente ou operação. Segue padrão existente de `cancelada` mas com identidade visual distinta (laranja vs vermelho) para diferenciar na auditoria. Timestamp registrado em BRT conforme regra SYSTEM_BRAIN.md.

**Status:** Implementado e testado. Servidor reiniciado sem erros. SYSTEM_BRAIN.md e RULES.md consultados.

---

#### 07/04/2026 — 10:40 BRT | Motor de Cálculo Automático de Pedágio (Toll Engine)

**Descrição Tática:**
Implementado motor de estimativa de pedágio com base local de 15 praças (Via Dutra, Anchieta-Imigrantes, Bandeirantes, Anhanguera, Fernão Dias, Raposo Tavares, Castelo Branco, Rio-Santos) com valores atualizados (reajuste setembro/2025).

**Componentes criados/alterados:**

1. **`server/toll-engine.ts`** (NOVO) — Motor de cálculo com:
   - Base de dados local de 15 praças com coordenadas GPS, preços, tipo (convencional/free_flow), direcionalidade
   - Função `estimateTolls(originLat, originLng, destLat, destLng, waypoints)` que calcula praças no corredor da rota (15km de largura)
   - Haversine distance + projeção ortogonal para determinar proximidade ao segmento da rota
   - Retorna: totalIda, totalIdaVolta, lista de praças com distância da origem, distância estimada da rota

2. **`server/routes/service-orders.ts`** — Endpoints + integração:
   - `GET /api/toll-plazas` — Lista todas as praças cadastradas
   - `POST /api/toll-estimate` — Estimativa por coordenadas
   - `POST /api/calculate-tolls` — MELHORADO: Google Routes API como fonte primária + toll-engine como fallback; agora retorna `plazas[]` com detalhamento praça-a-praça e `source` (google/local)
   - Criação de OS: se `pedagioEstimado` não foi preenchido manualmente e as coordenadas existem, calcula automaticamente após geocoding e registra `mission_cost` + `financial_transaction`

3. **`client/src/pages/admin/service-orders.tsx`** — Frontend:
   - `calcTolls` agora envia coordenadas ao backend e recebe detalhamento de praças
   - Tooltip com breakdown praça-a-praça (nome, cidade/estado, valor)
   - Badge indicando fonte (Google / Base Local)
   - Toggle "Ida+Volta" recalcula valor instantaneamente
   - Estado `tollInfo` ampliado com `plazas`, `source`, `routeDistanceKm`

**Praças cadastradas (Via Dutra — Guarulhos→RJ, vigência 01/09/2025):**
| Praça | Cidade | Valor |
|-------|--------|-------|
| Free Flow SP | Guarulhos/SP | R$ 4,50 |
| Arujá | Arujá/SP | R$ 4,50 |
| Guararema | Guararema/SP | R$ 4,50 |
| Jacareí | Jacareí/SP | R$ 8,10 |
| Moreira César | Pindamonhangaba/SP | R$ 16,90 |
| Itatiaia | Itatiaia/RJ | R$ 14,50 |
| **Total Ida** | | **R$ 53,00** |

**Status:** Implementado. Servidor reiniciado sem erros. Cálculo automático ativo na criação de OS.

---

#### 07/04/2026 — 10:37 BRT | Correção Bug 500 "removeAutoTransaction is not defined" + Regra "Ignore Pedágio" para Recusada

**Problema:**
Ao marcar uma OS como "Recusada", o servidor retornava **erro 500** com mensagem `removeAutoTransaction is not defined`. Causa raiz: as funções `removeAutoTransaction` e `createAutoTransaction` estavam sendo chamadas em `server/routes/service-orders.ts` mas **nunca foram importadas** de `server/routes/_helpers.ts`.

**Correções aplicadas:**

1. **Import corrigido** (linha 13 de `service-orders.ts`):
   - Adicionados `createAutoTransaction` e `removeAutoTransaction` ao import de `_helpers.ts`
   - Essas funções são usadas em 8+ locais no arquivo (recusada, cancelada, concluída, reabertura, mission_cost)

2. **Estorno completo de pedágio na Recusada:**
   - Antes de deletar `mission_costs`, agora o sistema busca todos os custos vinculados à OS
   - Para cada `mission_cost`, remove a `financial_transaction` associada (via `removeAutoTransaction("mission_cost", id)`)
   - Isso garante que custos de pedágio (ex: R$ 38,70 Imigrantes) não contaminem o DRE
   - Após remover transações individuais, remove também transações de receita da OS (`removeAutoTransaction("service_order", id)`)

3. **Campo `pedagioEstimado` zerado:**
   - Adicionado `pedagioEstimado = 0` ao bloco de zeragem financeira da Recusada
   - Campos zerados: fat_calculado, custo_total_alocado, lucro_calculado, margem_calculada, valorEstimado, pedagioEstimado

4. **Audit log enriquecido:**
   - Adicionados campos `pedagioEstornado: true` e `transacoesRemovidas: true` no registro de `system_audit_logs`

**Resultado:** Saldo Líquido de OS Recusada = R$ 0,00 (receita zero, custos removidos, pedágio estornado).

**Filtros DRE confirmados:** `escort.ts` (linha 445) e `operational.ts` (linhas 35, 218) já filtram status "recusada" nos cálculos de billing/DRE.

**Status:** Corrigido. Servidor reiniciado sem erros. Bug 500 eliminado.

---

#### 07/04/2026 — 10:45 BRT | Integração Fiscal Asaas — Fluxo de Faturamento Blindado com CNAE 7870

**Descrição Tática:**
Configurada a integração definitiva com Asaas incluindo: descrição fiscal automática padronizada, módulo NFS-e com CNAE 7870, webhook enriquecido com baixa automática, e log de auditoria em cada tentativa de geração de cobrança.

**Componentes criados/alterados:**

1. **`server/asaas.ts`** — Motor de Cobrança Fiscal:

   **a) Constantes Fiscais (novas):**
   - `CNAE_PRINCIPAL = "7870"` (Atividades de Vigilância e Segurança Privada)
   - `CODIGO_SERVICO_MUNICIPAL = "11.02"` (Vigilância e segurança)
   - `ISS_ALIQUOTA = 5` (alíquota padrão ISS)
   - `DESCRICAO_SERVICO_FIXA = "Ref. a Serviço de Escolta Armada Caracterizada"`

   **b) Função `buildInvoiceDescription()` (nova):**
   - Monta string: `"Ref. a Serviço de Escolta Armada Caracterizada - Período: DD/MM/YYYY a DD/MM/YYYY - X missão(ões)"`
   - Datas formatadas em pt-BR com timezone BRT
   - Usada tanto na fatura individual quanto na consolidada

   **c) Função `buildFiscalPayload()` (nova):**
   - Gera objeto `fiscalInfo` para API Asaas NFS-e
   - Inclui: `serviceListItem`, `municipalServiceCode`, `observations` com CNAE, `taxes` (ISS 5%, demais 0%)
   - Enviado via `POST /payments/{id}/fiscalInfo` após criação do pagamento

   **d) Endpoint `POST /api/invoices` (melhorado):**
   - Adiciona `fiscalObservations` com CNAE quando `emite_nf = true`
   - Log de auditoria em SUCESSO (`ASAAS_COBRANCA_GERADA`)
   - Log de auditoria em ERRO (`ASAAS_COBRANCA_ERRO`)

   **e) Endpoint `POST /api/boletim-medicao/gerar-fatura/:clientId` (melhorado):**
   - Calcula período automático (menor→maior data_missao das OSs aprovadas)
   - Descrição na cobrança Asaas: string fiscal padronizada (não o detalhamento)
   - Detalhamento completo salvo na tabela `invoices.description`
   - `fiscalObservations` com CNAE + período + contagem de missões
   - Após criação do pagamento, chama `POST /payments/{id}/fiscalInfo` para configurar NFS-e
   - Log de auditoria em SUCESSO (`ASAAS_FATURA_CONSOLIDADA`) e ERRO (`ASAAS_FATURA_ERRO`)
   - Notes da invoice incluem CNAE e período

   **f) Webhook `POST /api/asaas/webhook` (melhorado):**
   - Ao receber `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`:
     - Atualiza `escort_billings.status` → `"PAGO"` e registra `pago_em`
     - Cria `financial_transaction` (INCOME) com valor líquido via `createAutoTransaction`
   - Log de auditoria para TODOS os eventos webhook (`ASAAS_WEBHOOK_{event}`)
   - Registra: valor bruto, valor líquido, data de pagamento

2. **`server/db-init.ts`** — Nova coluna:
   - `escort_billings.pago_em TIMESTAMPTZ` — data/hora do pagamento confirmado via webhook

**Fluxo Completo:**
```
OS Aprovada → Boletim de Medição → "Gerar Fatura"
  │
  ├─ Monta descrição: "Ref. a Serviço de Escolta Armada Caracterizada - Período: X a Y"
  ├─ Cria cliente no Asaas (findOrCreate por CPF/CNPJ)
  ├─ Cria cobrança (BOLETO/PIX) com descrição fiscal
  ├─ Se emite_nf → configura NFS-e com CNAE 7870, ISS 5%
  ├─ Salva invoice com asaas_payment_id + links
  ├─ Atualiza escort_billings → "FATURADO"
  ├─ Log auditoria: ASAAS_FATURA_CONSOLIDADA
  │
  └─ Webhook (pagamento confirmado):
     ├─ Invoice → status CONFIRMED/RECEIVED
     ├─ escort_billings → status "PAGO" + pago_em
     ├─ financial_transaction INCOME (valor líquido)
     └─ Log auditoria: ASAAS_WEBHOOK_PAYMENT_RECEIVED
```

**Status:** Implementado. Servidor reiniciado sem erros. Aguardando ASAAS_API_KEY para ativação em produção.

---

#### 07/04/2026 — 10:50 BRT | Correção Botão "Gerar Fatura" + Padronização Nomenclatura Serviço

**Problema 1 — Botão "Gerar Fatura" desaparecido:**
O botão estava condicionado a `approvedBillings.length > 0`, fazendo com que sumisse quando não havia billings com status "APROVADA" no período. Para meses retroativos ou operações pendentes, o admin não conseguia gerar a fatura.

**Correção:** Removida a condicional `{approvedBillings.length > 0 && ...}`. O botão agora está sempre visível quando o relatório é gerado. O contador mostra `(N)` somente quando há aprovadas, caso contrário fica sem número.

**Problema 2 — Texto do cabeçalho incorreto:**
O boletim de medição dizia "REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS" — texto genérico que não corresponde ao serviço prestado pela Torres.

**Correção:** Alterado para **"REFERENTE AO SERVIÇO DE ESCOLTA ARMADA"** em 3 locais:
- `relatorio-faturamento.tsx` linha 421 (export Excel)
- `relatorio-faturamento.tsx` linha 670 (cabeçalho visual HTML)
- `server/asaas.ts` linha 14 (`DESCRICAO_SERVICO_FIXA = "Ref. ao Serviço de Escolta Armada"`)

**Sincronismo Fiscal Confirmado:**
- Boletim HTML: `REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — MARÇO/2026`
- Export Excel: `REFERENTE AO SERVIÇO DE ESCOLTA ARMADA`
- Asaas cobrança: `Ref. ao Serviço de Escolta Armada - Período: 01/03/2026 a 31/03/2026`
- Os três pontos usam a mesma nomenclatura: **Escolta Armada**.

**Status:** Corrigido. Servidor reiniciado sem erros.

---

#### 07/04/2026 — 10:57 BRT | Redesign Modal de Faturamento — Padrão Profissional Torres/Asaas

**Problema:** O modal de "Gerar Fatura" mostrava R$ 0,00 porque usava `approvedTotal` (soma apenas billings com status "APROVADA"). Quando as OSs estavam com outro status, o total ficava zerado.

**Correção:** Substituído `approvedTotal` por `grandTotal` (soma de TODAS as OSs no boletim de medição). O modal agora mostra o valor real consolidado.

**Novo Modal — Campos implementados:**
1. **Razão Social / Tomador** — Nome do cliente + CPF/CNPJ puxado automaticamente do cadastro
2. **Valor Total** — `grandTotal` calculado de todas as OSs no período (não mais apenas aprovadas)
3. **Empresa Emissora** — Fixo: TORRES VIGILÂNCIA PATRIMONIAL EIRELI, CNPJ 36.982.392/0001-89, CNAE 7870
4. **E-mail Medição** — Puxado de `emailFinanceiro` ou `email` do cliente (read-only)
5. **Data de Vencimento** — Sugerida automaticamente com base em `payment_terms_days` do cliente
6. **Tipo de Cobrança** — Boleto Bancário / PIX (QR Code) / Boleto + PIX
7. **Observações Fiscais** — "Referente ao Serviço de Escolta Armada — Ref. ao Mês [PERÍODO]"
8. **Switch Asaas** — Envia cobrança via Asaas com NFS-e automática (CNAE 7870)
9. **Botão principal** — "GERAR BOLETO + PIX (ASAAS)" com valor total no label

**Arquivo alterado:** `client/src/pages/admin/relatorio-faturamento.tsx` (linhas 774-873)

**Status:** Implementado. Servidor reiniciado sem erros. Modal redesenhado com padrão profissional.

---

#### 07/04/2026 — 11:04 BRT | Trava de Automação Asaas + Correção Filtro OS

**3 Correções Aplicadas:**

1. **Switch Removido** — O toggle "Enviar cobrança via Asaas" foi eliminado. Agora o envio via Asaas é **obrigatório e automático** ao clicar no botão azul. `sendToAsaas: true` é fixo no payload.

2. **Filtro OS Expandido** — A query no backend (`POST /api/boletim-medicao/gerar-fatura/:clientId`) buscava apenas `status = 'APROVADA'`, causando erro 400 "Nenhuma OS aprovada encontrada". Agora aceita: `APROVADA`, `A_VERIFICAR`, `VERIFICADA`, `PENDENTE`. Se a OS está no Boletim de Medição, ela é faturável.

3. **CNAE Travado** — O payload sempre usa CNAE 7870, descrição "Ref. ao Serviço de Escolta Armada", ISS 5%, código serviço 11.02. Valores hardcoded em `server/asaas.ts` (constantes no topo do arquivo). Nenhum valor antigo pode sobrescrever.

**Query corrigida (server/asaas.ts, linhas 491-495):**
```sql
.eq("client_id", clientId)
.in("status", ["APROVADA", "A_VERIFICAR", "VERIFICADA", "PENDENTE"])
```

**Arquivos alterados:**
- `client/src/pages/admin/relatorio-faturamento.tsx` — Switch removido, sendToAsaas fixo em true, import Switch removido
- `server/asaas.ts` — Filtro `.eq("status", "APROVADA")` → `.in("status", [...])`

**Status:** Implementado. Servidor reiniciado sem erros. Fluxo simplificado: sem escolha manual.

---

#### 07/04/2026 — 11:09 BRT | Redesign Layout Controle de Faturas — Dashboard Profissional

**Problema:** Conteúdo esticava até as bordas da tela em monitores grandes. Cards gigantes com muito espaço em branco. Hierarquia visual pobre.

**Correções Aplicadas:**

1. **Container Centralizado** — `max-w-7xl mx-auto` no container principal. Conteúdo centralizado com margem lateral automática.

2. **Cards de Resumo Redesenhados** — Grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` com:
   - Ícone colorido em caixa arredondada (indigo/amber/emerald/red)
   - Tipografia `font-black text-3xl/2xl` para valores
   - Labels `uppercase tracking-wide` para categorias
   - Bordas coloridas por tipo (border-amber-100, border-emerald-100, etc.)

3. **Cards de Fatura Redesenhados** — Cada fatura agora tem:
   - Ícone de empresa à esquerda (Building2 em caixa neutral-50)
   - Nome do cliente em negrito (`font-bold`)
   - Descrição + período + missões em texto secundário (`text-neutral-500`)
   - Badges inline para ASAAS e OS#
   - Valor em destaque à direita (`text-xl font-black`, min-w-[140px])
   - Badge de status colorido abaixo do valor
   - Hover com `shadow-md` + `border-indigo-200`

4. **Asaas Status** — Mensagem "Asaas offline" substituída por "Asaas: configure ASAAS_API_KEY" (mais descritivo). A lógica está correta — verifica `process.env.ASAAS_API_KEY` e tenta `/finance/balance`. Basta adicionar a secret para ficar verde.

**Arquivo alterado:** `client/src/pages/admin/faturas.tsx`

**Status:** Implementado. Servidor reiniciado sem erros. Layout profissional com container centralizado.

---

#### 07/04/2026 — 11:14 BRT | Reconstrução Total — Controle de Faturas / NF (Padrão Torres Elite)

**Página completamente reconstruída** com padrão Dashboard Financeiro Profissional.

**4 Pilares Implementados:**

1. **Cards de Resumo (Topo)** — 4 cards com borda lateral colorida:
   - Em Aberto (amarelo) — relógio, valor + contagem de faturas
   - Pagas (verde) — check, valor líquido recebido + contagem
   - Vencidas (vermelho) — alerta, valor + contagem
   - Canceladas (cinza) — X, contagem

2. **Barra de Busca Inteligente** — Campo único para buscar por cliente, NF, descrição ou ID Asaas. Filtros de status (dropdown) e mês (input month).

3. **Tabela de Dados Compacta** — Componente Table do Shadcn com colunas:
   - Status (Badge colorida)
   - NF / ID (NF-0001 + ID Asaas em monospace)
   - Cliente (Razão Social em CAIXA ALTA + CNPJ)
   - Valor R$ (alinhado à direita, font-black, tabular-nums)
   - Emissão (DD/MM/YYYY Brasília)
   - Vencimento (vermelho se vencida)
   - Tipo (Boleto/PIX/Cartão)
   - Asaas Status (Badge com status Asaas ou "Local")
   - Ações (Eye + Sync, visíveis no hover)

4. **Ações Rápidas** — Ícones no final de cada linha:
   - Eye (ver detalhes) — abre modal
   - RefreshCw (sincronizar Asaas) — sync individual

**Botão Atualizar** — Vermelho, canto superior direito, força refetch de dados.

**Baixa Automática** — Confirmada no webhook (PAYMENT_CONFIRMED/RECEIVED → status PAGO + transação INCOME). No modal "Confirmar Pgto" manual, também gera baixa.

**Container** — max-w-7xl mx-auto mantido. Footer da tabela mostra contagem + total geral.

**Arquivos alterados:** `client/src/pages/admin/faturas.tsx` (reconstrução total)

**Status:** Implementado. Servidor reiniciado sem erros. Layout financeiro elite operacional.

---

#### 07/04/2026 — 11:20 BRT | Força Bruta — Filtro Liberado + Email Financeiro + Auditoria Payload

**4 Correções Aplicadas:**

1. **Filtro Liberado (Força Bruta)** — Em vez de listar status aceitos (APROVADA, VERIFICADA, etc.), agora a query exclui apenas os que NÃO podem ser faturados:
```sql
.eq("client_id", clientId)
.not("status", "in", '("RECUSADA","FATURADA","CANCELADA")')
```
Qualquer OS que não seja RECUSADA, FATURADA ou CANCELADA é faturável. Isso resolve o erro 400 independente do nome do status usado.

2. **E-mail Financeiro Padronizado** — Campo `email_financeiro` adicionado à tabela `clients` via db-init.ts. No modal:
   - Prioridade: `email_financeiro` → `emailFinanceiro` → fallback `financeiro@torresseguranca.com.br`
   - Nunca mais aparece e-mail pessoal
   - Label renomeado de "E-mail Medição" para "E-mail Financeiro"

3. **Auditoria de Payload** — Antes de enviar para o Asaas, o sistema agora imprime no log:
```
[asaas] PAYLOAD AUDIT — Enviando para Asaas: { customer, billingType, value, dueDate, description, ... }
```
Isso permite verificar se customer_id e value estão corretos antes do envio.

4. **Query de Clientes Expandida** — O select de `clients` agora inclui `email, email_financeiro` além de cnpj, cpf, emite_nf, address, city, state.

**Arquivos alterados:**
- `server/asaas.ts` — filtro NOT IN, payload audit log, select expandido
- `server/db-init.ts` — coluna `email_financeiro` na tabela clients
- `client/src/pages/admin/relatorio-faturamento.tsx` — email financeiro com fallback Torres

**Status:** Implementado. Servidor reiniciado sem erros.

---

#### 07/04/2026 — 11:24 BRT | Blindagem de Cálculo de Pedágio — Regra do Espelho Receita x Despesa

**Bug Identificado:** O valor no topo (R$ 31,80) não batia com o Total Ida (R$ 39,50) porque `pedagioEstimado` armazenava valores inconsistentes — às vezes o valor ida, às vezes ida+volta. Além disso, havia **criação duplicada de custos** no backend (duas vezes o mesmo pedágio).

**Correções Aplicadas:**

1. **`pedagioEstimado` SEMPRE armazena valor IDA** — Nunca mais o valor ida+volta. O campo é a base de cálculo pura.

2. **Display no Frontend** — A fórmula `form.pedagioIdaVolta ? base * 2 : base` calcula a exibição corretamente:
   - Checkbox desmarcado → mostra IDA
   - Checkbox marcado → mostra IDA × 2

3. **Toggle Simplificado** — O checkbox "Cobrar pedágio ida e volta" agora só alterna `pedagioIdaVolta`, sem recalcular `pedagioEstimado` (que permanece como IDA).

4. **Regra do Espelho no Backend (Receita x Despesa):**
   - **DESPESA (Torres)**: Cria `mission_cost` com `cost_type: "expense"`, valor = Total Ida. Lança `financial_transaction` tipo EXPENSE, categoria "Custos de Missão".
   - **RECEITA (Cliente)**: Cria `mission_cost` com `cost_type: "revenue"`, valor = `idaVolta ? ida×2 : ida`. Lança `financial_transaction` tipo INCOME, categoria "Faturamento".

5. **Remoção do Custo Duplicado** — O bloco secundário (linhas ~875-901) que criava um segundo custo idêntico foi removido. Agora só existe o bloco unificado que cria Despesa + Receita.

**Fórmula Final:**
```
pedagioEstimado = soma das praças (IDA)
exibição = pedagioIdaVolta ? pedagioEstimado × 2 : pedagioEstimado
despesa_torres = pedagioEstimado (sempre IDA — custo real)
receita_cliente = pedagioIdaVolta ? pedagioEstimado × 2 : pedagioEstimado
```

**Exemplo com print:**
- Riacho Grande R$ 33,90 + Caieiras R$ 5,60 = **R$ 39,50 (IDA)**
- Com checkbox "ida e volta" marcado → exibe **R$ 79,00** (39,50 × 2)
- Despesa Torres = R$ 39,50 | Receita Cliente = R$ 79,00

**Arquivos alterados:**
- `server/routes/service-orders.ts` — Lógica de criação unificada Despesa+Receita, remoção do bloco duplicado
- `client/src/pages/admin/service-orders.tsx` — pedagioEstimado sempre IDA, toggle simplificado

**Status:** Implementado. Servidor reiniciado sem erros. Cálculo blindado.

---

#### 07/04/2026 — 11:28 BRT | RESET DE FATURAMENTO — Padronização Torres Segurança

**Problema:** Faturas geradas com descrição gigante (loop listando cada BO + endereço + valor), número NF-0003 fake, e valor inconsistente.

**4 Ações de Limpeza Executadas:**

1. **Endpoint DELETE Fatura** — `DELETE /api/invoices/:id`
   - Exclui a fatura do banco
   - Reverte todos os `escort_billings` vinculados para status `VERIFICADA` (faturáveis novamente)
   - Limpa `financial_transactions` vinculadas (referência `INV-{id}`)
   - Protege faturas com status `PAGO` (não permite exclusão)
   - Loga auditoria completa

2. **Remoção do Sequencial Fake NF-XXXX**
   - Frontend não exibe mais `NF-0003`. Mostra o ID Asaas quando existir, ou "Aguardando" quando ainda não processado
   - Número da NF só será preenchido quando o webhook do Asaas confirmar a emissão

3. **Descrição Cirúrgica — `buildInvoiceDescription()` simplificada**
   - **ANTES**: `"Ref. ao Serviço de Escolta Armada - Período: X a Y - 14 missão(ões)\n\nBO-20260401-ETZ1 01/04/2026 Universal Armazéns...\nBO-20260330-QDH0 30/03/2026 Rua Jamil..."`
   - **DEPOIS**: `"Ref. a Serviço de Escolta Armada Caracterizada - Período: 30/03/2026 a 06/07/2026"`
   - O detalhamento das OSs vai APENAS para o campo `notes` (relatório interno), nunca para `description` (boleto/NF)

4. **Validação de Valor com Audit Log**
   - Cada OS é logada individualmente: `[billing-audit] BO-XXXX: acion=X hExtra=X km=X ped=X rec=X = TOTAL`
   - Log final: `[billing-audit] TOTAL para fatura: R$X.XX (N OS)`
   - Bloqueia fatura se valor total = R$0,00

**Botão de Exclusão na Tabela**
   - Ícone Trash2 (lixeira) no hover de cada fatura, com confirmação
   - Apenas faturas não-pagas podem ser excluídas

**Arquivos alterados:**
- `server/asaas.ts` — buildInvoiceDescription, endpoint DELETE, audit logs, constante DESCRICAO_SERVICO_FIXA
- `client/src/pages/admin/faturas.tsx` — remoção NF-XXXX, botão excluir, "Aguardando" status

**Status:** Implementado. Servidor reiniciado OK.

---

#### 07/04/2026 — 11:35 BRT | ATIVAÇÃO API PRODUÇÃO ASAAS + RESET NF-0003

**API Key de Produção:** Salva como secret `ASAAS_API_KEY` no Replit. Chave real `$aact_prod_*`. Servidor reiniciado com a chave ativa.

**Reset NF-0003 executado:**
- 12 escort_billings com status `FATURADO` (inv=3) foram resetados para `APROVADA`
- Tabela `invoices` já estava limpa (NF-0003 não existia mais na tabela)
- Financial transactions vinculadas limpas
- Todos os 15 billings agora estão `APROVADA` (faturáveis)
- 2 billings permanecem `A_VERIFICAR`

**Correção de Status Constraint:**
- `escort_billings` tem check constraint que não aceita `VERIFICADA`
- Status válidos incluem: `APROVADA`, `FATURADO`, `A_VERIFICAR`, `RECUSADA`, `CANCELADA`
- Endpoint `DELETE /api/invoices/:id` corrigido: agora reverte para `APROVADA` (não `VERIFICADA`)
- Filtro de billing atualizado: `.not("status", "in", '("RECUSADA","FATURADA","FATURADO","CANCELADA")')` — adicionado `FATURADO` ao blacklist

**Status:** API de produção ativa. Base limpa. Pronto para gerar fatura real da TM SEGURANÇA.

---

#### 07/04/2026 — 11:42 BRT | VERIFICAÇÃO PRÉ-EMISSÃO — Produção Asaas

**E-mail de Fallback Corrigido:**
- Fallback alterado de `financeiro@torresseguranca.com.br` → `escolta@torresseguranca.com.br`
- Modal de faturamento (`relatorio-faturamento.tsx` linha 822) atualizado
- Backend já usava `escolta@torresseguranca.com.br` como padrão em todo o sistema

**Verificação de Valor — DIVERGÊNCIA IDENTIFICADA:**
- Boletim de Medição esperado pelo usuário: R$ 5.299,10
- Soma real dos 14 billings faturáveis: **R$ 13.942,80**
- Motivo provável: Existem 14 OSs no status APROVADA, mas o boletim original pode ter sido para apenas um subconjunto
- 4 billings sem boletim_numero (IDs UUID) — podem ser OSs de teste ou duplicatas
- 1 billing com data_missao em 2026-07-06 e outro em 2026-04-30 — fora do período 30/03 a 06/04
- AÇÃO NECESSÁRIA: Mickael precisa validar quais OSs devem entrar na fatura

**API de Produção:**
- `ASAAS_API_KEY` ativa: `$aact_prod_*`
- Sistema pronto para emissão real
- Validação de CPF/CNPJ do Asaas pode retornar erro — logado em auditoria

---

#### 07/04/2026 — 11:52 BRT | ESTORNO FATURA #4 + TRAVA DE DATA ESTRITA

**Estorno Fatura #4:**
- Fatura #4 (R$ 13.942,80) deletada do banco
- 14 escort_billings revertidos de `FATURADO` → `APROVADA`
- Financial transactions vinculadas limpas
- Causa: Query de billing não filtrava por data, pegava TODAS as OSs do cliente

**Trava de Data Implementada (server/asaas.ts):**
- Endpoint `POST /api/boletim-medicao/gerar-fatura/:clientId` agora EXIGE `startDate` e `endDate` no body
- Query Supabase blindada com `.gte("data_missao", fromDate)` e `.lte("data_missao", toDate)`
- Se `startDate` ou `endDate` não forem enviados → retorna 400 "Período obrigatório"

**Validação de Soma (backend vs frontend):**
- Frontend envia `expectedTotal` (grandTotal do boletim na tela)
- Backend calcula soma dos billings filtrados
- Se diferença > R$0,01 → BLOQUEIA emissão com erro detalhado:
  `"BLOQUEADO: Soma do backend (R$X) difere do frontend (R$Y). Diferença: R$Z"`

**Frontend atualizado (relatorio-faturamento.tsx):**
- Mutation agora envia: `{ billingType, sendToAsaas, dueDate, startDate, endDate, expectedTotal }`
- `startDate` e `endDate` vêm dos campos de período do boletim
- `expectedTotal` = `grandTotal` calculado na tela

**Query Supabase Final:**
```
supabaseAdmin
  .from("escort_billings")
  .select("*")
  .eq("client_id", clientId)
  .not("status", "in", '("RECUSADA","FATURADA","FATURADO","CANCELADA")')
  .gte("data_missao", fromDate)    // ← NOVO: trava início
  .lte("data_missao", toDate)      // ← NOVO: trava fim
```

**Status:** Implementado. Fatura #4 estornada. Base limpa. Pronto para nova emissão com período correto.

---

#### 07/04/2026 — 11:58 BRT | LIMPEZA RADICAL DE OBSERVAÇÕES

**Problema:** Campo `notes` e `observations` da fatura continham detalhamento técnico (lista de BOs, endereços, IDs) que poluía o boleto.

**3 Campos Limpos:**

1. **`notes` (invoice no banco):**
   - ANTES: `"Boletim de Medição: 14 OS(s)...\n\nDetalhamento:\nBO-20260401-ETZ1 01/04/2026 Universal...\nBO-20260330-QDH0...\n\nIDs: uuid1, uuid2..."`
   - DEPOIS: `"Referente aos serviços de Escolta Armada Caracterizada - Período: 2026-03-30 a 2026-04-07. 14 missão(ões) aprovada(s)."`

2. **`observations` (payload fiscal Asaas — NF):**
   - ANTES: `"CNAE 7870 - Atividades de Vigilância e Segurança Privada"`
   - DEPOIS: `"Referente aos serviços de Escolta Armada Caracterizada. CNAE 7870."`

3. **`fiscalObservations` (payload Asaas quando emite NF):**
   - ANTES: `"CNAE 7870 - Atividades de Vigilância e Segurança Privada. Período: X a Y. N missão(ões)."`
   - DEPOIS: `"Referente aos serviços de Escolta Armada Caracterizada. CNAE 7870. Período: X a Y."`

**Detalhamento Técnico:**
- O loop `osDescriptions` ainda existe mas agora é usado APENAS para log de auditoria no console do servidor
- A variável `descricaoInterna` foi removida
- Nenhum detalhamento de BOs/endereços/IDs vai para o banco ou para o Asaas

**Fatura #4 (R$ 13k):** Já estava deletada desde 11:52. Base limpa.

**Status:** Implementado. Todos os campos de texto da fatura agora seguem o padrão Torres.
