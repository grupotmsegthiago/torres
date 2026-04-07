# Torres Vigilância Patrimonial — Documentação Completa do Sistema

**Empresa:** Torres Vigilância Patrimonial  
**CNPJ:** 36.982.392/0001-89  
**Data:** 07/04/2026  

---

## 1. Visão Geral

Sistema institucional completo para gestão de operações de vigilância patrimonial e escolta armada. Composto por:
- **Landing Page** institucional pública
- **Painel Administrativo** (desktop) para gestão completa
- **App Mobile** para agentes em campo
- **API REST** com 13 módulos de rotas
- **Banco de Dados** Supabase PostgreSQL com Realtime

### Stack Tecnológico
| Camada | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite |
| UI | Tailwind CSS + Shadcn/UI + Lucide Icons |
| Backend | Express.js + Node.js |
| Banco de Dados | Supabase PostgreSQL (Drizzle ORM + REST API) |
| Autenticação | Supabase Auth (JWT) |
| Tempo Real | Supabase Realtime |
| Pagamentos | Asaas (boleto/PIX) |
| Rastreamento | TrucksControl SOAP API |
| Mapas | Google Maps Platform |
| OCR | OpenAI Vision (gpt-4o-mini) |
| Email | Nodemailer (SMTP) |

---

## 2. Landing Page

**Rota:** `/`

Página institucional pública com apresentação da empresa, serviços oferecidos, diferenciais e formulário de contato. Design profissional preto/branco com tipografia Montserrat/Inter.

---

## 3. Painel Administrativo (30 Páginas)

Acessível em `/admin/*`. Restrito a roles `admin` e `diretoria`. Agentes (`funcionario`) são bloqueados com tela "Acesso Negado".

### 3.1 Painel de Controle (`/admin/dashboard`)
- KPIs gerais: missões ativas, veículos, funcionários, faturamento
- Gráficos de performance operacional
- Alertas e notificações

### 3.2 Clientes (`/admin/clients`)
- CRUD completo de clientes
- Sistema de "Pasta do Cliente" com abas:
  - **Veículos** — veículos do cliente (auto-cadastro via missões)
  - **Tabelas** — tabelas de preço e rotas frequentes
  - **Contratos** — contratos de serviço com geração de PDF
  - **Relatório de Missões** — histórico por período
  - **Relatório de Faturamento** — boletins abertos/fechados
  - **Homologação** — envio de documentos por email
- Ciclo financeiro configurável (por missão/quinzenal/mensal)
- Bloqueio de acesso sem contrato ativo

### 3.3 Ordens de Serviço (`/admin/service-orders`)
- Criação e gestão completa de OS
- Cálculo automático de pedágio (Google Routes API v2)
- Timeline de etapas (step_logs JSONB)
- Custos operacionais por missão (mission_costs)
- Geração de Relatório de Missão em PDF
- Fluxo: Criação → Ativa → Em Andamento → Encerrada → Concluída

### 3.4 Boletim de Medição (`/admin/boletim-medicao`)
- OS concluídas agrupadas por cliente
- Filtros: Todas / A Verificar / Aprovadas / Rejeitadas
- Modal detalhado com breakdown financeiro
- Edição gerencial inline (KM, horários, valores)
- Fluxo de aprovação/rejeição
- Geração de fatura após aprovação

### 3.5 Relatório de Faturamento (`/admin/relatorio-faturamento`)
- Resumo de faturamento por período e cliente

### 3.6 Funcionários — Cadastro (`/admin/employees`)
- CRUD com "Pasta do Funcionário" (8 abas):
  - **Documentos** — uploads com controle de validade
  - **Contrato** — dados + geração de contrato PDF
  - **Multas** — infrações de trânsito
  - **Disciplinar** — advertências/suspensões
  - **Faltas** — ausências e atestados
  - **Ponto** — folha de ponto + export Excel (CLT Art 74/3)
  - **Holerite** — contracheques
  - **Salários** — histórico salarial

### 3.7 Folha de Ponto (`/admin/timesheets`)
- Gestão de registros de ponto
- Edição restrita a Diretoria/Admin

### 3.8 Holerites (`/admin/holerites`)
- Gestão de contracheques (adminOnly)
- Sugestão inteligente: puxa salário CCT (R$2.432,50), periculosidade (30%), horas extras dos timesheets
- Composição editável: Base + Periculosidade + HE + Noturno + Benefícios - Descontos
- Fluxo: Pendente → Agendado → Pago (auto-cria despesa no financeiro)
- Upload de comprovante (PDF/imagem)
- Relatório anual por funcionário (12 meses)
- Importação via OCR (OpenAI Vision)

### 3.9 Ponto Operacional (`/admin/ponto-operacional`)
- Controle de jornada longa (viagens multi-dia)
- Barra de progresso: verde < 190h, amarelo 190-220h, vermelho > 220h
- Badge "Em Viagem" para shifts abertos
- Histórico por agente com expandir/colapsar
- Regra 220h: acima = hora extra (50/50 folha + bônus)

### 3.10 Guia Operacional (`/admin/guia-missao`)
- Manual operacional para agentes

### 3.11 Armamento (`/admin/armamento`)
- Inventário de armas (CRUD)
- Atribuições de armas a funcionários

### 3.12 Grid Operacional (`/admin/operational-grid`)
- Painel operacional em tempo real
- Mapa com posições de veículos
- Geofences automáticos (1km) em origem/destino/residências
- Cards de veículos com status, velocidade, último update
- Alerta VTR Offline (5min) e Crítico (15min) com sons
- Menu de contexto (right-click) em cards e markers
- Comandos remotos: bloquear, desbloquear, sirene, mensagem
- Barra de progresso GPS da rota
- Copiar relatório WhatsApp com foto

### 3.13 Missão Ativa (`/admin/mission`)
- Detalhes da missão em andamento
- Atualizações dos agentes em tempo real

### 3.14 Simulador de Missão (`/admin/simulador-missao`)
- Ferramenta de simulação de custos/logística

### 3.15 Veículos (`/admin/vehicles`)
- CRUD completo da frota
- KM atual, último abastecimento, alertas de óleo

### 3.16 Viagens (`/admin/trips`)
- Registro e histórico de viagens

### 3.17 Abastecimento (`/admin/fueling`)
- Dashboard de consumo de combustível
- KPIs: total litros, custo, km/L médio, R$/km
- Cards por veículo com histórico expansível
- Validação de KM (rejeita saltos > 1500km)
- Cálculo de consumo por tanque cheio
- Alerta de consumo anormal (< 6 km/L)

### 3.18 Manutenção (`/admin/maintenance`)
- CRUD de manutenções preventivas/corretivas

### 3.19 Rastreador (`/admin/tracker`)
- Posições de agentes em tempo real no mapa
- Status online/offline (threshold 15min)
- Histórico de posições por dia

### 3.20 Telemetria (`/admin/telemetria`)
- Dados de telemetria dos veículos via TrucksControl

### 3.21 Financeiro — Contas (`/admin/financeiro`)
- 5 abas: Pagar, Receber, Conferência, Relatório, Fechamento
- CRUD de transações (receitas e despesas)
- Transações automáticas (origin_type): escort_billing, fueling, maintenance, holerite, mission_cost
- Transações automáticas são bloqueadas para edição/exclusão manual
- Resumo financeiro com saldo realizado

### 3.22 Faturas / Cobranças (`/admin/faturas`)
- Integração Asaas (boleto/PIX)
- CRUD de faturas com sincronização
- Funciona sem Asaas (registro local)

### 3.23 Balanço Gerencial (`/admin/balanco-gerencial`)
- Dashboard de lucratividade operacional
- Navegação por período (diário/semanal/mensal/trimestral/semestral/anual)
- KPIs: faturamento, custos, lucro bruto, margem %
- 4 abas: Balanço, Viaturas, Agentes, Missões
- Meta R$35k/mês por viatura
- Ranking de veículos e agentes

### 3.24 Cotação Gasto Mínimo (`/admin/cotacao-gasto`)
- Estimativa de gastos com cálculo automático de pedágio

### 3.25 Calculadora Jornada (`/admin/calculadora-jornada`)
- Cálculo de jornada de trabalho baseado na CCT

### 3.26 Chat Interno (`/admin/chat`)
- Conversas em tempo real com agentes
- Mensagens texto, localização GPS, imagens
- Indicador online/offline
- Contagem de não lidas
- Supabase Realtime para atualização instantânea

### 3.27 Jornada Diretoria (`/admin/jornada-diretoria`)
- Visão consolidada de jornadas (adminOnly)

### 3.28 Usuários (`/admin/usuarios`)
- Gestão de usuários do sistema (adminOnly)
- Roles: diretoria, admin, funcionario

### 3.29 Auditoria (`/admin/auditoria`)
- Logs de auditoria do sistema (adminOnly)
- Ações de agentes, visualizações, eventos de segurança

### 3.30 Perfil (`/admin/perfil`)
- Perfil pessoal do usuário logado

---

## 4. App Mobile (12 Telas)

Acessível em `/mobile/*`. Exclusivo para role `funcionario`. Exige GPS ativo e selfie diária.

### 4.1 Home (`/mobile`)
- Dashboard do agente com atalhos rápidos

### 4.2 Missão (`/mobile/missao`)
- Workflow completo da missão em etapas:
  1. `aguardando` → Aguardando início
  2. `checkout_armamento` → Checkout de armas (inicia cronômetro)
  3. `em_transito_origem` → A caminho da origem
  4. `chegada_origem` → Chegou na origem
  5. `em_transito_destino` → A caminho do destino
  6. `chegada_destino` → Chegou no destino
  7. `retorno_base` → Retornando à base
  8. `encerrada` → Missão encerrada
- Cada etapa exige fotos obrigatórias + GPS
- Lançamento inline de pedágio durante trânsito
- Atualizações com foto + mensagem para central
- Controle de início antecipado (>30min = precisa aprovação admin)

### 4.3 Checklist (`/mobile/checklist`)
- Checklist de veículo/equipamento

### 4.4 Chat (`/mobile/chat`)
- Mensagens em tempo real com central
- Lista de conversas + thread full-screen
- Envio de localização GPS
- Filtro: só vê admin/diretoria para iniciar conversa

### 4.5 Meu RH (`/mobile/meu-rh`)
- Área pessoal do agente: documentos, holerites

### 4.6 Perfil (`/mobile/perfil`)
- Dados pessoais do agente

### 4.7 Selfie (`/mobile/selfie`)
- Verificação facial obrigatória no login diário

### 4.8 Ponto (`/mobile/ponto`)
- Registro de ponto em 4 etapas: Entrada → Saída Almoço → Retorno → Saída
- Cada etapa exige foto (câmera frontal) + GPS

### 4.9 Abastecimento (`/mobile/abastecimento`)
- Registro de abastecimento com 3 fotos obrigatórias (bomba, NF, hodômetro)
- Auto-calcula total, valida KM, atualiza odômetro
- Linkagem tripla: financial_transaction + mission_cost (se OS ativa) + vehicle_fueling
- Alerta de troca de óleo

### 4.10 Pedágio (`/mobile/pedagio`)
- Registro de pedágio vazio (sem missão ativa)
- Foto do comprovante + valor + GPS
- Vincula ao veículo via last assignment

### 4.11 Ocorrência (`/mobile/ocorrencia`)
- Registro de incidentes: Acidente, Quebra, Avaria, Manutenção, Segurança, Outro
- Até 5 fotos + descrição + GPS
- Histórico com respostas do admin

### 4.12 Ponto Operacional (`/mobile/ponto-operacional`)
- Abertura/fechamento de jornada longa (viagens multi-dia)
- Cronômetro em tempo real
- Horas acumuladas no mês

---

## 5. Backend — Módulos de Rotas (13 Arquivos)

Diretório: `server/routes/`

| Arquivo | Módulo | Endpoints |
|---|---|---|
| `clients.ts` | Clientes | CRUD clientes, veículos do cliente, contratos, homologação |
| `employees.ts` | Funcionários | CRUD funcionários, documentos, OCR |
| `vehicles.ts` | Veículos | CRUD veículos, atribuições |
| `service-orders.ts` | Ordens de Serviço | CRUD OS, PDF relatório, custos, timeline |
| `fleet.ts` | Frota | Viagens, manutenção, abastecimento |
| `operational.ts` | Grid Operacional | Grid tempo real, telemetria, comandos remotos |
| `mission.ts` | Missões | Updates de agentes, posições, rota, fotos |
| `escort.ts` | Escolta/Billing | Billings, boletins, cálculo escolta, contratos |
| `hr.ts` | RH | Folha de ponto, holerites, faltas, multas, disciplinar, salários |
| `mobile.ts` | Mobile | Endpoints específicos do app mobile |
| `chat.ts` | Chat | Conversas, mensagens, presença, usuários |
| `consultas.ts` | Consultas | Integração ApiBrasil (CPF/CNPJ) |
| `_helpers.ts` | Utilitários | Funções auxiliares compartilhadas |

Arquivo principal: `server/routes.ts` — registra todos os módulos + rotas de auth, configurações, AI, cron jobs.

---

## 6. Motor de Cálculo de Escolta

Arquivo: `server/billing-calc.ts`

### Funções Principais
| Função | Descrição |
|---|---|
| `calcularEscolta()` | Cálculo completo de faturamento + pagamento + resultado |
| `calcularFaturamentoLive()` | Cálculo simplificado para Grid em tempo real |
| `getHorasElapsedFromDB()` | Busca horas via RPC Supabase |
| `calcularInicioCobranca()` | Define horário considerado (agendado vs real) |
| `calcularHorasTrabalhadas()` | Calcula horas entre início e fim |

### Modelo de Acionamento (valor_acionamento > 0)
- Faturamento = Acionamento + KM Excedente × Valor/km + Hora Extra × Valor/h
- KM Excedente = max(0, KM Carregado - Franquia KM)
- Hora Extra = max(0, Horas Missão - Franquia Horas)

### Modelo KM (sem acionamento)
- Faturamento = max(KM Carregado, Franquia) × Valor/km Carregado + KM Vazio × Valor/km Vazio

### Adicionais
- Estadia (horas × valor)
- Pernoite/Diária
- Adicional Noturno (% sobre KM, se início/fim entre 22h-5h)
- Periculosidade (% sobre VRP, acima do limite de horas)

### Resultado
- Resultado Bruto = Faturamento - Pagamento
- Resultado Líquido = Bruto - Despesas
- Margem % = Líquido / Faturamento × 100

---

## 7. Banco de Dados — Tabelas Principais

Todas as tabelas residem no Supabase PostgreSQL. Acesso via Drizzle ORM (`db.*`) ou REST API (`supabaseAdmin.from()`).

### Tabelas Operacionais
| Tabela | Descrição |
|---|---|
| `users` | Usuários do sistema (auth vinculado ao Supabase Auth) |
| `employees` | Funcionários com dados pessoais, documentos, endereço GPS |
| `clients` | Clientes com ciclo financeiro |
| `vehicles` | Frota de veículos |
| `service_orders` | Ordens de serviço (OS) com step_logs e campos congelados |
| `escort_contracts` | Tabelas de preço por cliente (a tabela de preço) |
| `escort_billings` | Boletins de medição com cálculos |
| `mission_costs` | Custos operacionais por missão |
| `mission_updates` | Atualizações de agentes (fotos + mensagem + GPS) |
| `mission_positions` | Posições GPS durante missão (filtro 50m) |
| `mission_photos` | Fotos de etapas da missão |

### Tabelas de Frota
| Tabela | Descrição |
|---|---|
| `vehicle_fueling` | Abastecimentos com fotos, preços, consumo |
| `vehicle_maintenance` | Manutenções |
| `vehicle_assignments` | Atribuição veículo↔funcionário |
| `telemetry_events` | Eventos de telemetria TrucksControl |

### Tabelas de RH
| Tabela | Descrição |
|---|---|
| `employee_timesheets` | Folha de ponto com fotos/GPS |
| `employee_payslips` | Holerites |
| `employee_documents` | Documentos com validade |
| `employee_absences` | Faltas e atestados |
| `employee_fines` | Multas de trânsito |
| `employee_disciplinary` | Advertências e suspensões |
| `employee_salary_discounts` | Descontos salariais |
| `employee_occurrences` | Ocorrências de campo |
| `ponto_operacional` | Ponto de jornada longa |
| `login_selfies` | Selfies de login diário |

### Tabelas Financeiras
| Tabela | Descrição |
|---|---|
| `financial_transactions` | Receitas e despesas (auto + manual) |
| `invoices` | Faturas (integração Asaas) |
| `billing_alerts` | Alertas de faturamento pendente |
| `financial_audit_logs` | Log de alterações financeiras |

### Tabelas de Chat
| Tabela | Descrição |
|---|---|
| `chat_conversations` | Conversas (direct/group/mission) |
| `chat_participants` | Participantes com last_read_at |
| `chat_messages` | Mensagens (text/image/location/system) |
| `chat_presence` | Status online/offline |

### Tabelas de Suporte
| Tabela | Descrição |
|---|---|
| `weapons` | Armas do inventário |
| `weapon_assignments` | Atribuição arma↔funcionário |
| `reference_points` | Pontos de referência no mapa |
| `agent_locations` | Posição atual dos agentes |
| `agent_location_history` | Histórico de posições |
| `gerenciadoras` | Gerenciadoras de risco |
| `client_vehicles` | Veículos dos clientes |
| `company_documents` | Documentos da empresa |
| `homologation_logs` | Log de envios de homologação |
| `audit_logs` | Logs de auditoria de agentes |
| `system_audit_logs` | Logs de auditoria do sistema |
| `system_settings` | Configurações do sistema |
| `perfis_acesso` | Perfis de acesso (RBAC) |
| `token_failure_logs` | Log de falhas de autenticação |

---

## 8. Integrações Externas

### 8.1 Supabase
- **Auth:** Autenticação JWT, refresh token 30 dias, renovação proativa a cada 45min
- **Database:** PostgreSQL hospedado, acesso via REST API e conexão direta
- **Realtime:** Push de eventos em tabelas (INSERT/UPDATE) para frontend

### 8.2 TrucksControl / NewRastreamentoOnline
- SOAP webservice para rastreamento veicular
- Posições GPS em tempo real, velocidade, ignição
- Comandos remotos: bloquear, desbloquear, sirene, aviso cabine, mensagem texto
- Espelhamento de veículos
- Alerta automático de veículo parado com motor ligado

### 8.3 Google Maps Platform
- Maps JavaScript API (mapa no grid operacional)
- Places API (autocomplete de endereços)
- Geocoding API (endereço → coordenadas)
- Routes API v2 (cálculo de pedágio automático)
- Directions API (rota planejada)

### 8.4 OpenAI Vision (gpt-4o-mini)
- OCR de documentos: CNH, CNV, registro de arma
- OCR de holerites (importação automática)
- Auto-preenchimento de formulários

### 8.5 Asaas
- Gateway de pagamentos brasileiro
- Geração de boletos e cobranças PIX
- Webhook para atualização de status
- Funciona sem API key (modo local)

### 8.6 ApiBrasil
- Consulta CPF/CNPJ
- Validação de documentos

### 8.7 Nominatim (OpenStreetMap)
- Reverse geocoding: coordenadas GPS → endereço
- Cache client-side, rate limit 1 req/seg

### 8.8 Nodemailer (SMTP)
- Envio de emails de homologação
- Template HTML com branding Torres

---

## 9. Segurança

### Segregação de Funções
| Regra | Descrição |
|---|---|
| Barreira Web | Agentes bloqueados no `/admin/*` → tela "Acesso Negado" |
| Blindagem Financeira | Rotas `/api/financial/*`, `/api/escort/*` exigem adminRole |
| Omissão Mobile | App não mostra faturamento, lucro, margem ou DRE |
| Dados Imutáveis | Custos congelados após conclusão da missão |
| Transações Automáticas | Bloqueadas para edição/exclusão manual |

### Auditoria
- `audit_logs`: ações de agentes (visualizações, screenshots, mudanças de aba)
- `system_audit_logs`: ações financeiras (aprovar, rejeitar, editar medição)
- `financial_audit_logs`: alterações em transações financeiras
- `token_failure_logs`: falhas de autenticação em campo

### App Mobile
- GPS obrigatório para acesso
- Selfie diária obrigatória no login
- Watermark com nome/matrícula/horário em todas as telas
- Detecção de screenshot
- WakeLock para manter tela ativa durante missão

---

## 10. Resiliência e Tempo Real

### Conexão do Agente (App Mobile)
- Token de longa duração (refresh 30 dias)
- Renovação proativa a cada 45min
- Retry automático em 401 antes de falhar
- Fila offline: ações armazenadas em localStorage
- 12 retries com backoff exponencial (5s→30s + jitter)
- Reconexão agressiva: ping a cada 5s quando offline
- WakeLock: previne tela de dormir durante missão

### Grid Operacional (Admin)
- Supabase Realtime: reconexão infinita, heartbeat 60s
- Auto-refresh global a cada 30s
- Alerta sonoro para updates de agentes
- Alerta VTR Offline (5min) e Crítico (15min) com sons distintos
- Payload otimizado: fotos carregam on-demand (grid < 1s)

### Sincronização de Dados
- `invalidateRelatedQueries()`: cascata entre queries relacionadas
- BroadcastChannel: propaga invalidações entre abas abertas
- Supabase Realtime: escuta INSERT/UPDATE em tabelas críticas

---

## 11. CRON Jobs Automáticos

| Job | Horário | Função |
|---|---|---|
| Frota | Diário 02:00 BRT | Monitoramento de frota |
| RH | Trimestral dia 1 03:00 BRT | Verificação de compliance RH |
| Rodízio | Seg-Sex 06:30 e 16:30 BRT | Alerta de rodízio SP via TrucksControl |
| Billing | A cada 30min | Recálculo de faturamento de missões ativas |
| BillingAlerts | Diário 03:00 BRT | Alertas de faturamento pendente/atrasado |
| Provisão Salário | Diário 23:59 BRT | Provisão de folha de pagamento |
| JornadaAlerta | Diário 08:00 BRT | Alerta de jornada excedida |

---

## 12. Chat Interno (Sistema Completo)

### Banco de Dados (4 tabelas)
- `chat_conversations`: conversas (direct/group/mission)
- `chat_participants`: participantes com controle de leitura
- `chat_messages`: mensagens (text/image/location/system)
- `chat_presence`: status online/offline

### API
9 endpoints no módulo `server/routes/chat.ts` — ver inventário completo na seção 13.16.

### Frontend Admin (`/admin/chat`)
- Sidebar de conversas (busca, badges, status online)
- Thread com bolhas estilo WhatsApp (verde enviado, branco recebido)
- Modal nova conversa
- Envio de localização GPS
- Indicadores de entrega (✓ / ✓✓)
- Supabase Realtime para mensagens instantâneas

### Frontend Mobile (`/mobile/chat`)
- Lista de conversas dentro do MobileLayout
- Thread full-screen (sem bottom nav)
- Bottom sheet para nova conversa
- Envio de localização GPS
- Filtro: agentes só veem admin/diretoria

### Presença
- Heartbeat a cada 60s
- sendBeacon ao fechar página
- Polling: presença 30s, conversas 15s, mensagens 5s

---

## 13. Inventário Completo de Endpoints da API

Todas as rotas exigem `requireAuth` salvo indicado. Acesso restrito indicado por `admin` (requireAdminRole) ou `diretoria` (requireDiretoria).

### 13.1 Autenticação e Sistema (`server/routes.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/health` | Público | Health check |
| POST | `/api/auth/token-failure` | Público | Log de falhas de token |
| GET | `/api/auth/setup-check` | Público | Verificar setup inicial |
| POST | `/api/auth/setup` | Público | Setup do primeiro usuário |
| POST | `/api/auth/cpf-lookup` | Público | Busca por CPF no login |
| GET | `/api/auth/me` | Auth | Dados do usuário logado |
| POST | `/api/auth/accept-terms` | Auth | Aceitar termos de uso |
| POST | `/api/auth/login-selfie` | Auth | Enviar selfie de login |
| GET | `/api/auth/login-selfie-today` | Auth | Verificar selfie de hoje |
| GET | `/api/admin/login-selfies` | Auth | Listar selfies (admin) |
| GET | `/api/admin/login-selfie/:id` | Auth | Detalhe selfie (admin) |
| POST | `/api/auth/change-password` | Auth | Alterar senha |
| GET | `/api/auth/perfil` | Auth | Perfil do usuário |
| GET | `/api/auth/perfis` | Admin | Listar perfis de acesso |
| GET | `/api/system-settings/:key` | Auth | Ler configuração |
| PUT | `/api/system-settings/:key` | Admin | Alterar configuração |

### 13.2 Armamento (`server/routes.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/weapons` | Admin | Listar armas |
| GET | `/api/weapons/:id` | Admin | Detalhe arma |
| POST | `/api/weapons` | Admin | Cadastrar arma |
| PATCH | `/api/weapons/:id` | Admin | Editar arma |
| DELETE | `/api/weapons/:id` | Diretoria | Excluir arma |
| GET | `/api/weapon-assignments/:weaponId` | Admin | Atribuições de arma |
| POST | `/api/weapon-assignments` | Admin | Atribuir arma |
| GET | `/api/weapon-kits` | Admin | Listar kits de arma |
| GET | `/api/weapon-kits/:id` | Admin | Detalhe kit |
| POST | `/api/weapon-kits` | Admin | Criar kit |
| PATCH | `/api/weapon-kits/:id` | Admin | Editar kit |
| DELETE | `/api/weapon-kits/:id` | Diretoria | Excluir kit |
| POST | `/api/weapon-kits/send-docs` | Admin | Enviar docs do kit |
| POST | `/api/weapons/ocr` | Admin | OCR de documento de arma |
| POST | `/api/weapons/ocr-batch` | Admin | OCR em lote |
| POST | `/api/weapons/batch` | Admin | Cadastro em lote |

### 13.3 Veículos e Localização (`server/routes.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/vehicle-assignments/:vehicleId` | Admin | Atribuições de veículo |
| POST | `/api/vehicle-assignments` | Admin | Atribuir veículo |
| POST | `/api/agent/location` | Auth | Enviar localização do agente |
| GET | `/api/agent/locations` | Admin | Posições atuais dos agentes |
| GET | `/api/agent/locations/:userId/history` | Admin | Histórico de posições |

### 13.4 Documentos e Email (`server/routes.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/company-documents` | Auth | Listar documentos da empresa |
| POST | `/api/company-documents` | Auth | Upload documento |
| DELETE | `/api/company-documents/:docType` | Diretoria | Excluir documento |
| GET | `/api/homologation-logs/:clientId` | Auth | Logs de homologação |
| GET | `/api/email-config` | Auth | Configuração de email |
| POST | `/api/email-test` | Admin | Testar email |
| POST | `/api/homologation/send` | Auth | Enviar homologação |

### 13.5 Clientes (`server/routes/clients.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/clients` | Auth | Listar clientes |
| GET | `/api/clients/:id` | Auth | Detalhe do cliente |
| GET | `/api/clients/:id/contrato-pdf` | Auth | PDF do contrato |
| POST | `/api/clients` | Auth | Cadastrar cliente |
| PATCH | `/api/clients/:id` | Auth | Editar cliente |
| DELETE | `/api/clients/:id` | Diretoria | Excluir cliente |
| GET | `/api/clients/:id/vehicles` | Auth | Veículos do cliente |
| POST | `/api/clients/:id/vehicles` | Auth | Adicionar veículo ao cliente |
| PATCH | `/api/client-vehicles/:id` | Auth | Editar veículo do cliente |
| DELETE | `/api/client-vehicles/:id` | Diretoria | Excluir veículo do cliente |
| GET | `/api/clients/:id/billing-config` | Auth | Config de faturamento |

### 13.6 Funcionários (`server/routes/employees.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/employees` | Auth | Listar funcionários |
| GET | `/api/employees/next-matricula` | Auth | Próxima matrícula disponível |
| GET | `/api/employees/:id` | Auth | Detalhe do funcionário |
| POST | `/api/employees` | Auth | Cadastrar funcionário |
| PATCH | `/api/employees/:id` | Auth | Editar funcionário |
| DELETE | `/api/employees/:id` | Diretoria | Excluir funcionário |
| GET | `/api/employees/:id/salaries` | Auth | Histórico salarial |
| POST | `/api/employees/:id/salaries` | Auth | Adicionar salário |
| DELETE | `/api/employee-salaries/:id` | Diretoria | Excluir salário |
| GET | `/api/employees/:id/salary-discounts` | Admin | Descontos salariais |
| POST | `/api/employees/:id/salary-discounts` | Admin | Adicionar desconto |
| DELETE | `/api/salary-discounts/:id` | Diretoria | Excluir desconto |
| GET | `/api/employees/:id/salary-summary` | Admin | Resumo salarial |
| POST | `/api/payroll/sync-financial` | Diretoria | Sincronizar folha com financeiro |
| POST | `/api/employees/apply-cct-kit` | Diretoria | Aplicar kit CCT |
| GET | `/api/employees/monthly-hours` | Auth | Horas mensais |
| GET | `/api/employees/:id/cost-detail` | Auth | Detalhe de custo |
| GET | `/api/cpf-lookup/:cpf` | Auth | Consulta CPF |
| POST | `/api/employees/ocr` | Admin | OCR de documento |
| POST | `/api/employees/ocr-document` | Admin | OCR de documento avançado |

### 13.7 Veículos (`server/routes/vehicles.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/vehicles` | Auth | Listar veículos |
| GET | `/api/vehicles/:id` | Auth | Detalhe do veículo |
| POST | `/api/vehicles` | Auth | Cadastrar veículo |
| PATCH | `/api/vehicles/:id` | Auth | Editar veículo |
| PATCH | `/api/vehicles/:id/km` | Auth | Atualizar KM |
| DELETE | `/api/vehicles/:id` | Diretoria | Excluir veículo |

### 13.8 Ordens de Serviço (`server/routes/service-orders.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/service-orders` | Auth | Listar OS |
| GET | `/api/service-orders/:id` | Auth | Detalhe da OS |
| GET | `/api/service-orders/:id/step-data` | Auth | Dados de etapa |
| PATCH | `/api/service-orders/:id/step-adjustments` | Auth | Ajustar etapa |
| PATCH | `/api/service-orders/:id/fuel-allocation` | Auth | Alocação combustível |
| GET | `/api/service-orders/:id/enriched` | Auth | OS enriquecida |
| POST | `/api/service-orders` | Auth | Criar OS |
| PATCH | `/api/service-orders/:id` | Auth | Editar OS |
| DELETE | `/api/service-orders/:id` | Diretoria | Excluir OS |
| POST | `/api/service-orders/:id/send-report-email` | Auth | Enviar relatório por email |
| POST | `/api/service-orders/:id/approve-early-start` | Auth | Aprovar início antecipado |
| GET | `/api/service-orders/:id/pdf` | Auth | PDF da OS |
| GET | `/api/service-orders/:id/positions` | Auth | Posições GPS da OS |
| GET | `/api/reverse-geocode` | Auth | Geocodificação reversa |
| POST | `/api/road-distance` | Auth | Distância rodoviária |
| GET | `/api/boletim-medicao/os-concluidas` | Auth | OS concluídas p/ boletim |
| POST | `/api/boletim-medicao/calcular/:osId` | Admin | Calcular medição |
| PATCH | `/api/boletim-medicao/os/:id/diretoria-override` | Auth | Override diretoria |

### 13.9 Frota (`server/routes/fleet.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/trips` | Auth | Listar viagens |
| GET | `/api/trips/:id` | Auth | Detalhe viagem |
| POST | `/api/trips` | Auth | Registrar viagem |
| PATCH | `/api/trips/:id` | Auth | Editar viagem |
| DELETE | `/api/trips/:id` | Diretoria | Excluir viagem |
| GET | `/api/maintenance` | Auth | Listar manutenções |
| GET | `/api/maintenance/:id` | Auth | Detalhe manutenção |
| POST | `/api/maintenance` | Auth | Registrar manutenção |
| PATCH | `/api/maintenance/:id` | Auth | Editar manutenção |
| DELETE | `/api/maintenance/:id` | Diretoria | Excluir manutenção |
| GET | `/api/fueling` | Auth | Listar abastecimentos |
| GET | `/api/fueling/:id` | Auth | Detalhe abastecimento |
| POST | `/api/fueling` | Auth | Registrar abastecimento |
| PATCH | `/api/fueling/:id` | Auth | Editar abastecimento |
| DELETE | `/api/fueling/:id` | Diretoria | Excluir abastecimento |
| GET | `/api/timesheets` | Auth | Listar folhas de ponto |
| GET | `/api/timesheets/:id` | Auth | Detalhe folha |
| POST | `/api/timesheets` | Auth | Registrar ponto |
| PATCH | `/api/timesheets/:id` | Auth | Editar ponto |
| DELETE | `/api/timesheets/:id` | Diretoria | Excluir ponto |

### 13.10 Operacional (`server/routes/operational.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/operational-grid` | Auth | Grid operacional |
| GET | `/api/vehicle-tracking` | Auth | Rastreamento de veículos |
| GET | `/api/truckscontrol/test` | Admin | Testar conexão TrucksControl |
| GET | `/api/truckscontrol/debug` | Admin | Debug TrucksControl |
| GET | `/api/truckscontrol/positions` | Admin | Posições GPS veículos |
| GET | `/api/truckscontrol/spy` | Admin | Spy mode rastreador |
| POST | `/api/truckscontrol/command` | Admin | Enviar comando remoto |
| GET | `/api/gerenciadoras` | Admin | Listar gerenciadoras |
| POST | `/api/gerenciadoras` | Admin | Cadastrar gerenciadora |
| PATCH | `/api/gerenciadoras/:id` | Admin | Editar gerenciadora |
| DELETE | `/api/gerenciadoras/:id` | Diretoria | Excluir gerenciadora |
| POST | `/api/gerenciadoras/:id/mirror` | Admin | Espelhar na gerenciadora |
| GET | `/api/telemetry/events` | Admin | Eventos de telemetria |
| GET | `/api/telemetry/summary` | Admin | Resumo de telemetria |
| GET | `/api/truckscontrol/espelhados` | Admin | Veículos espelhados |
| GET | `/api/truckscontrol/espelhamentos-pendentes` | Admin | Espelhamentos pendentes |
| POST | `/api/truckscontrol/espelhar` | Admin | Espelhar veículo |
| POST | `/api/truckscontrol/espelhar/diagnostico` | Admin | Diagnóstico espelhamento |
| POST | `/api/truckscontrol/espelhamento/aceitar` | Admin | Aceitar espelhamento |
| POST | `/api/truckscontrol/espelhamento/rejeitar` | Admin | Rejeitar espelhamento |
| POST | `/api/truckscontrol/espelhamento/cancelar` | Admin | Cancelar espelhamento |

### 13.11 Missão (`server/routes/mission.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/mission/active` | Auth | Missão ativa |
| GET | `/api/mission/scheduled` | Auth | Missões agendadas |
| POST | `/api/mission/update` | Auth | Enviar atualização |
| GET | `/api/service-orders/:id/updates` | Auth | Atualizações da OS |
| GET | `/api/mission/updates` | Admin | Todas as atualizações |
| GET | `/api/mission/updates/:id/photo` | Admin | Foto de atualização |
| PATCH | `/api/mission/updates/mark-read` | Admin | Marcar como lida |
| POST | `/api/mission/updates/:id/copy-audit` | Admin | Copiar para auditoria |
| POST | `/api/mission/updates/:id/forward` | Admin | Encaminhar atualização |
| GET | `/api/service-orders/:id/forwards` | Admin | Encaminhamentos da OS |
| GET | `/api/mission/status/:serviceOrderId` | Auth | Status da missão |
| GET | `/api/mission/photos/:serviceOrderId` | Auth | Fotos da missão |
| GET | `/api/mission/photo/:id` | Auth | Foto individual |
| POST | `/api/mission/photo` | Auth | Upload foto |
| POST | `/api/mission/escort-data` | Auth | Dados de escolta |
| POST | `/api/mission/start` | Auth | Iniciar missão |
| POST | `/api/mission/rollback-step` | Admin | Voltar etapa |
| POST | `/api/mission/cancel` | Admin | Cancelar missão |
| POST | `/api/mission/finish` | Admin | Finalizar missão |
| POST | `/api/mission/advance` | Auth | Avançar etapa |
| POST | `/api/mission/base-clean` | Auth | Limpar base |
| POST | `/api/mission/simulate-step` | Admin | Simular etapa |
| POST | `/api/mission/nova-entrega` | Auth | Nova entrega |

### 13.12 Escolta e Faturamento (`server/routes/escort.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/escort/billings` | Admin | Criar boletim |
| GET | `/api/escort/billings` | Admin | Listar boletins |
| PUT | `/api/escort/billings/:id` | Admin | Atualizar boletim |
| PATCH | `/api/escort/billings/:id` | Admin | Editar boletim parcial |
| DELETE | `/api/escort/billings/:id` | Diretoria | Excluir boletim |
| POST | `/api/escort/billings/submit-os` | Admin | Submeter OS ao boletim |
| PATCH | `/api/escort/billings/:id/salvar` | Admin | Salvar rascunho |
| POST | `/api/escort/billings/:id/revisar` | Admin | Enviar para revisão |
| POST | `/api/escort/billings/:id/reabrir` | Diretoria | Reabrir boletim |
| GET | `/api/escort/billings/pendentes` | Admin | Boletins pendentes |
| GET | `/api/system-audit-logs` | Admin | Logs de auditoria do sistema |
| GET | `/api/billing-alerts` | Admin | Alertas de faturamento |
| PATCH | `/api/billing-alerts/:id/resolve` | Admin | Resolver alerta |
| GET | `/api/escort/routes` | Auth | Listar rotas de escolta |
| POST | `/api/escort/routes` | Admin | Criar rota |
| PUT | `/api/escort/routes/:id` | Admin | Editar rota |
| DELETE | `/api/escort/routes/:id` | Diretoria | Excluir rota |
| POST | `/api/escort/billings/:id/gerar-boletim` | Admin | Gerar boletim PDF |
| GET | `/api/financial/dashboard` | Admin | Dashboard financeiro |
| GET | `/api/service-contracts/:id/pdf` | Admin | PDF contrato de serviço |
| GET | `/api/escort/relatorio/:clientId` | Auth | Relatório escolta por cliente |
| POST | `/api/audit-log` | Auth | Registrar log de auditoria |
| GET | `/api/audit-logs` | Admin | Listar logs de auditoria |
| GET | `/api/audit-logs/stats` | Admin | Estatísticas de auditoria |

### 13.13 RH (`server/routes/hr.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/my/hr-summary` | Auth | Resumo RH do agente logado |
| GET | `/api/employees/:id/absences` | Admin | Faltas do funcionário |
| POST | `/api/employees/:id/absences` | Admin | Registrar falta |
| DELETE | `/api/absences/:id` | Diretoria | Excluir falta |
| GET | `/api/employees/:id/fines` | Admin | Multas do funcionário |
| POST | `/api/employees/:id/fines` | Admin | Registrar multa |
| DELETE | `/api/fines/:id` | Diretoria | Excluir multa |
| GET | `/api/employees/:id/disciplinary` | Admin | Disciplinares |
| POST | `/api/employees/:id/disciplinary` | Admin | Registrar disciplinar |
| DELETE | `/api/disciplinary/:id` | Diretoria | Excluir disciplinar |
| GET | `/api/employees/:id/timesheets` | Admin | Folhas de ponto |
| POST | `/api/employees/:id/timesheets` | Admin | Registrar ponto |
| GET | `/api/employees/:id/folha-ponto-excel` | Admin | Exportar ponto Excel |
| GET | `/api/employees/:id/payslips` | Admin | Holerites do funcionário |
| GET | `/api/payslips` | Admin | Todos os holerites |
| GET | `/api/payslips/suggestion` | Admin | Sugestão de holerite |
| POST | `/api/employees/:id/payslips` | Admin | Criar holerite |
| PATCH | `/api/payslips/:id` | Admin | Editar holerite |
| DELETE | `/api/payslips/:id` | Diretoria | Excluir holerite |
| GET | `/api/payslips/employee-report/:id` | Admin | Relatório do funcionário |
| POST | `/api/payslips/ocr` | Admin | OCR de holerite |
| GET | `/api/users` | Admin | Listar usuários do sistema |
| POST | `/api/users` | Admin | Criar usuário |
| PATCH | `/api/users/:id` | Admin | Editar usuário |

### 13.14 Mobile (`server/routes/mobile.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/mobile/ponto/today` | Auth | Ponto de hoje |
| POST | `/api/mobile/ponto/clock` | Auth | Registrar entrada/saída |
| GET | `/api/employees/:id/ponto-detalhado/:timesheetId` | Admin | Ponto detalhado |
| GET | `/api/mobile/abastecimento/vehicles` | Auth | Veículos p/ abastecimento |
| GET | `/api/mobile/abastecimento/vehicle` | Auth | Veículo atual |
| POST | `/api/mobile/abastecimento` | Auth | Registrar abastecimento |
| POST | `/api/mobile/pedagio-missao` | Auth | Registrar pedágio em missão |
| POST | `/api/mobile/pedagio-vazio` | Auth | Registrar pedágio avulso |
| GET | `/api/mobile/ocorrencias` | Auth | Minhas ocorrências |
| POST | `/api/mobile/ocorrencias` | Auth | Registrar ocorrência |
| GET | `/api/ocorrencias` | Admin | Todas as ocorrências |
| PATCH | `/api/ocorrencias/:id` | Admin | Resolver ocorrência |
| GET | `/api/mobile/oil-alert/:vehicleId` | Auth | Alerta de troca de óleo |
| GET | `/api/reference-points` | Auth | Pontos de referência |
| POST | `/api/reference-points` | Auth | Criar ponto |
| PATCH | `/api/reference-points/:id` | Auth | Editar ponto |
| DELETE | `/api/reference-points/:id` | Diretoria | Excluir ponto |
| GET | `/api/ponto-operacional/aberto` | Auth | Ponto operacional aberto |
| POST | `/api/ponto-operacional/entrada` | Auth | Registrar entrada operacional |
| POST | `/api/ponto-operacional/saida` | Auth | Registrar saída operacional |
| GET | `/api/ponto-operacional/resumo-mensal` | Auth | Resumo mensal |
| GET | `/api/ponto-operacional/historico/:employeeId` | Auth | Histórico operacional |
| DELETE | `/api/ponto-operacional/:id` | Auth | Excluir ponto operacional |

### 13.15 Consultas Externas (`server/routes/consultas.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/consulta/testar-todas` | Admin | Testar todas as APIs |
| GET | `/api/datajud/:cnpj` | Auth | Consulta DataJud |
| GET | `/api/plate-lookup/:plate` | Auth | Consulta placa |
| GET | `/api/consulta/multas-prf/:placa` | Admin | Multas PRF |
| GET | `/api/consulta/cnh/:cpf` | Admin | Consulta CNH |
| GET | `/api/consulta/processos/:cpf` | Admin | Processos judiciais |
| GET | `/api/consulta/spc/:document` | Admin | Consulta SPC |
| GET | `/api/consulta/quod/:document` | Admin | Consulta QUOD |
| GET | `/api/consulta/protesto/:document` | Admin | Consulta protestos |
| GET | `/api/consulta/situacao-eleitoral/:cpf` | Admin | Situação eleitoral |
| POST | `/api/consulta/emitir-nf` | Admin | Emitir nota fiscal |
| GET | `/api/consulta/analise-risco/:document` | Admin | Análise de risco |
| GET | `/api/api-logs` | Auth | Logs de API |
| GET | `/api/api-logs/stats` | Auth | Estatísticas de API |

### 13.16 Chat Interno (`server/routes/chat.ts`)
| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/chat/conversations` | Auth | Listar conversas |
| POST | `/api/chat/conversations` | Auth | Criar conversa |
| GET | `/api/chat/conversations/:id/messages` | Auth | Buscar mensagens |
| POST | `/api/chat/conversations/:id/messages` | Auth | Enviar mensagem |
| PATCH | `/api/chat/conversations/:id/read` | Auth | Marcar como lido |
| POST | `/api/chat/presence` | Auth | Atualizar presença |
| GET | `/api/chat/presence` | Auth | Consultar presença |
| GET | `/api/chat/unread-count` | Auth | Contar não lidas |
| GET | `/api/chat/users` | Auth | Listar usuários para chat |

**Total: 210+ endpoints em 13 módulos de rota**

---

## 14. Tarefas Concluídas (Histórico)

| # | Tarefa | Status |
|---|---|---|
| #1 | Corrigir permissão de localização no iOS | Concluída |
| #2 | Rastreamento de Rota da Missão no Mapa | Concluída |
| #3 | Validação CNV/CNH obrigatória na criação de OS | Concluída |
| #4 | Ocultar cliente TM Segurança nos filtros | Concluída |
| #5 | Relatório de Missão PDF — Layout Profissional | Concluída |
| #6 | Integração Financeira Automática — Tabelas se Conversam | Concluída |
| #7 | Alerta sonoro para atualizações dos agentes | Concluída |
| #8 | Integração OS ↔ Financeiro ↔ DRE | Concluída |
| #9 | Resiliência de Retry no App Mobile | Concluída |
| #10 | Documentação Completa do Projeto | Concluída |

### Correções Aplicadas (sem tarefa formal)
- **Bug timezone RPC:** `calc_mission_elapsed_hours` retornava horas negativas. Corrigido `NOW()` para `(NOW() AT TIME ZONE 'UTC')::timestamp`
- **Pedágio Ida e Volta:** Adicionado ao PDF do relatório de missão e coluna `pedagio_ida_volta` no banco
- **Coordenadas da base:** Corrigido para lat -23.489, lng -46.7234, raio 800m

---

## 16. Variáveis de Ambiente

| Variável | Uso |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anônima Supabase (frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin Supabase (backend) |
| `SUPABASE_DATABASE_URL` | Conexão PostgreSQL direta |
| `SESSION_SECRET` | Segredo de sessão Express |
| `SMTP_PASS` | Senha SMTP para envio de emails |
| `APIBRASIL_TOKEN` | Token da API Brasil |
| `ASAAS_API_KEY` | Chave da API Asaas (opcional) |
| `VITE_SUPABASE_URL` | URL Supabase para frontend |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima para frontend |
| `VITE_GOOGLE_MAPS_API_KEY` | Chave Google Maps |

---

## 17. Estrutura de Arquivos Principais

```
client/src/
├── App.tsx                          # Rotas e proteção de acesso
├── pages/
│   ├── home.tsx                     # Landing page
│   ├── admin/
│   │   ├── dashboard.tsx            # Painel de controle
│   │   ├── clients.tsx              # Clientes
│   │   ├── employees.tsx            # Funcionários
│   │   ├── vehicles.tsx             # Veículos
│   │   ├── service-orders.tsx       # Ordens de serviço
│   │   ├── boletim-medicao.tsx      # Boletim de medição
│   │   ├── relatorio-faturamento.tsx# Relatório faturamento
│   │   ├── operational-grid.tsx     # Grid operacional
│   │   ├── mission.tsx              # Missão ativa
│   │   ├── simulador-missao.tsx     # Simulador
│   │   ├── trips.tsx                # Viagens
│   │   ├── fueling.tsx              # Abastecimento
│   │   ├── maintenance.tsx          # Manutenção
│   │   ├── tracker.tsx              # Rastreador agentes
│   │   ├── telemetry.tsx            # Telemetria
│   │   ├── timesheets.tsx           # Folha de ponto
│   │   ├── holerites.tsx            # Holerites
│   │   ├── ponto-operacional.tsx    # Ponto operacional
│   │   ├── guia-missao.tsx          # Guia operacional
│   │   ├── weapons.tsx              # Armamento
│   │   ├── financeiro.tsx           # Financeiro
│   │   ├── faturas.tsx              # Faturas/Cobranças
│   │   ├── balanco-gerencial.tsx    # Balanço gerencial
│   │   ├── cotacao-gasto.tsx        # Cotação gasto
│   │   ├── calculadora-jornada.tsx  # Calculadora jornada
│   │   ├── jornada-diretoria.tsx    # Jornada diretoria
│   │   ├── chat.tsx                 # Chat interno
│   │   ├── users.tsx                # Usuários
│   │   ├── audit.tsx                # Auditoria
│   │   └── profile.tsx              # Perfil
│   └── mobile/
│       ├── home.tsx                 # Home agente
│       ├── missao.tsx               # Missão
│       ├── checklist.tsx            # Checklist
│       ├── chat.tsx                 # Chat mobile
│       ├── meu-rh.tsx               # Meu RH
│       ├── perfil.tsx               # Perfil
│       ├── selfie.tsx               # Selfie login
│       ├── ponto.tsx                # Ponto
│       ├── abastecimento.tsx        # Abastecimento
│       ├── pedagio.tsx              # Pedágio
│       ├── ocorrencia.tsx           # Ocorrência
│       └── ponto-operacional.tsx    # Ponto operacional
├── components/
│   ├── admin/layout.tsx             # Layout admin + sidebar
│   └── mobile/layout.tsx            # Layout mobile + bottom nav
└── lib/
    ├── queryClient.ts               # authFetch + apiRequest + cache
    ├── supabase.ts                  # Cliente Supabase frontend
    └── offlineQueue.ts              # Fila offline v2

server/
├── routes.ts                        # Registro de rotas + auth + cron
├── routes/
│   ├── clients.ts
│   ├── employees.ts
│   ├── vehicles.ts
│   ├── service-orders.ts
│   ├── fleet.ts
│   ├── operational.ts
│   ├── mission.ts
│   ├── escort.ts
│   ├── hr.ts
│   ├── mobile.ts
│   ├── chat.ts
│   ├── consultas.ts
│   └── _helpers.ts
├── billing-calc.ts                  # Motor de cálculo de escolta
├── db.ts                            # Conexão Drizzle ORM
├── db-init.ts                       # Inicialização de tabelas + RPCs
├── storage.ts                       # Interface de storage (Supabase REST)
├── auth.ts                          # Middleware de autenticação
├── supabase.ts                      # Cliente Supabase admin
├── asaas.ts                         # Integração Asaas
├── telemetry-engine.ts              # Motor de telemetria
├── truckscontrol.ts                 # Integração TrucksControl
├── apibrasil.ts                     # Integração ApiBrasil
├── contract-pdf.ts                  # Geração de PDF de contrato
└── audit.ts                         # Helper de auditoria

shared/
└── schema.ts                        # Schema Drizzle + tipos TypeScript
```

---

*Documento gerado automaticamente em 07/04/2026 pelo sistema Torres Vigilância Patrimonial.*
