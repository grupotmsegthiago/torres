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

## 3. Backend — API (8 Endpoints)

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
