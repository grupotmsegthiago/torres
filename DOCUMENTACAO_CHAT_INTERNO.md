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
