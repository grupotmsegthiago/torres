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
- **API REST** com 12 módulos de rotas
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

## 3. Painel Administrativo (24 Páginas)

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

### API (9 endpoints)
| Método | Rota | Função |
|---|---|---|
| GET | `/api/chat/conversations` | Listar conversas |
| POST | `/api/chat/conversations` | Criar conversa |
| GET | `/api/chat/conversations/:id/messages` | Buscar mensagens |
| POST | `/api/chat/conversations/:id/messages` | Enviar mensagem |
| PATCH | `/api/chat/conversations/:id/read` | Marcar como lido |
| POST | `/api/chat/presence` | Atualizar presença |
| GET | `/api/chat/presence` | Consultar presença |
| GET | `/api/chat/unread-count` | Contar não lidas |
| GET | `/api/chat/users` | Listar usuários |

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

## 13. Tarefas Concluídas (Histórico)

| # | Tarefa | Status |
|---|---|---|
| #1 | Corrigir permissão de localização no iOS | Concluída |
| #2 | Rastreamento de Rota da Missão no Mapa | Concluída |
| #3 | Validação CNV/CNH obrigatória na criação de OS | Concluída |
| #5 | Relatório de Missão PDF — Layout Profissional | Concluída |
| #6 | Integração Financeira Automática — Tabelas se Conversam | Concluída |
| #7 | Alerta sonoro para atualizações dos agentes | Concluída |
| #9 | Resiliência de Retry no App Mobile | Concluída |

### Correções Recentes (sem tarefa formal)
- **Bug timezone RPC:** `calc_mission_elapsed_hours` retornava horas negativas. Corrigido `NOW()` para `(NOW() AT TIME ZONE 'UTC')::timestamp`
- **Pedágio Ida e Volta:** Adicionado ao PDF do relatório de missão e coluna `pedagio_ida_volta` no banco
- **Coordenadas da base:** Corrigido para lat -23.489, lng -46.7234, raio 800m

---

## 14. Variáveis de Ambiente

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

## 15. Estrutura de Arquivos Principais

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
