# SYSTEM_OVERVIEW — Torres Vigilância Patrimonial
**CNPJ**: 36.982.392/0001-89  
**Stack**: React + TypeScript + Express + Supabase (PostgreSQL) + Drizzle ORM  
**Auth**: Supabase Auth (JWT via `Authorization: Bearer`)  
**Infra**: Replit (Node.js), Supabase hosted DB, Asaas billing API, API Brasil consultas, TrucksControl telemetria  

---

## 1. ARQUITETURA GERAL

```
client/ (React + Vite + TailwindCSS + shadcn/ui)
├── src/App.tsx           → Rotas (wouter)
├── src/hooks/use-auth.tsx → AuthProvider (Supabase JWT)
├── src/lib/queryClient.ts → authFetch(), apiRequest(), TanStack Query
├── src/lib/supabase.ts    → Supabase client + Realtime listeners
├── src/pages/admin/       → 30 telas admin
├── src/pages/mobile/      → 12 telas vigilante (mobile-first)
├── src/components/admin/layout.tsx → Sidebar admin
├── src/components/mobile/layout.tsx → Layout mobile vigilante

server/ (Express)
├── index.ts       → Entrypoint, porta 5000
├── routes.ts      → ~290 rotas API (o maior arquivo)
├── asaas.ts       → Rotas Asaas (faturas, cobranças, webhook)
├── auth.ts        → Middleware requireAuth/requireAdmin/requireDiretoria
├── storage.ts     → IStorage (Supabase REST via supabaseAdmin)
├── supabase.ts    → supabaseAdmin client (service role)
├── db.ts          → Drizzle ORM (SUPABASE_DATABASE_URL)
├── db-init.ts     → CREATE TABLE IF NOT EXISTS (26+ tabelas extras)
├── audit.ts       → logSystemAudit()
├── billing-calc.ts → Motor de cálculo de escolta
├── cron.ts        → 6 cron jobs
├── truckscontrol.ts → Integração TrucksControl (rastreamento)
├── apibrasil.ts   → API Brasil (CNH, multas, SPC, processos)
├── contract-pdf.ts → Geração PDF contratos
├── telemetry-engine.ts → Motor telemetria
├── static.ts      → Serve arquivos estáticos

shared/
└── schema.ts      → Drizzle schemas + Zod insert schemas (44 tabelas)
```

---

## 2. TABELAS SUPABASE (TODAS)

### Definidas em `shared/schema.ts` (Drizzle ORM):
| Tabela | Colunas Principais |
|--------|-------------------|
| `users` | id, email, name, role (admin/vigilante/gerente/diretoria), password_hash, cpf, active |
| `perfis_acesso` | id, name, permissions (jsonb) |
| `clients` | id, name, cnpj, email, phone, address, city, state, contact_name, billing_day, payment_terms, status, notes |
| `client_vehicles` | id, client_id, plate, brand, model, year, color, vehicle_type, renavam, chassis |
| `employees` | id, name, cpf, rg, birth_date, phone, email, address, role, status, admission_date, dismissal_date, salary, ctps, pis, bank_name, bank_agency, bank_account, pix_key, cnh_number, cnh_category, cnh_expiry, photo_url, matricula, escala, funcao, cargo |
| `employee_salaries` | id, employee_id, base_salary, effective_date, reason |
| `employee_salary_discounts` | id, employee_id, discount_type, description, amount, start_date, end_date, recurrent, active |
| `vehicles` | id, plate, brand, model, year, color, renavam, chassis, fuel_type, km_current, status, tracker_id, insurance_company, insurance_policy, insurance_expiry, ipva_paid, licensing_date, oil_change_km, oil_change_date |
| `service_orders` | id, os_number, client_id, vehicle_id, assigned_employee_id, assigned_employee_2_id, origin, destination, cargo_type, cargo_value, status, scheduled_date, data_missao, mission_started_at, mission_ended_at, escort_contract_id, km_inicial, km_final, notes, tipo_missao, gerenciadora_id, sm_number |
| `trips` | id, vehicle_id, employee_id, origin, destination, start_date, end_date, km_start, km_end, purpose, status |
| `vehicle_maintenance` | id, vehicle_id, type, description, cost, date, km, workshop, next_due_km, next_due_date, status |
| `vehicle_fueling` | id, vehicle_id, date, liters, cost_per_liter, total_cost, km, fuel_type, station, receipt_url, employee_id, service_order_id, approved |
| `timesheets` | id, employee_id, date, entry_time, exit_time, hours_worked, overtime, status, notes |
| `mission_photos` | id, service_order_id, step, photo_url, km_value, lat, lng, timestamp, notes |
| `employee_documents` | id, employee_id, doc_type, doc_url, uploaded_at, expiry_date, notes |
| `weapons` | id, type, brand, model, serial_number, caliber, registration_number, status, acquisition_date, notes |
| `weapon_assignments` | id, weapon_id, employee_id, assigned_date, returned_date, notes |
| `vehicle_assignments` | id, vehicle_id, employee_id, assigned_date, returned_date, notes |
| `weapon_kits` | id, name, description |
| `weapon_kit_items` | id, kit_id, weapon_id |
| `gerenciadoras` | id, name, phone, email, contact_name, integration_type, api_url, api_token, sm_prefix, auto_accept, status, notes |
| `telemetry_events` | id, vehicle_id, event_type, lat, lng, speed, heading, ignition, timestamp, raw_data |
| `api_logs` | id, endpoint, method, status_code, response_time, user_id, ip_address, user_agent |
| `agent_locations` | id, employee_id, lat, lng, accuracy, speed, heading, battery, updated_at |
| `agent_location_history` | id, employee_id, lat, lng, accuracy, speed, heading, battery, timestamp |
| `employee_absences` | id, employee_id, type, start_date, end_date, reason, document_url, status |
| `employee_fines` | id, employee_id, fine_type, description, amount, date, status, document_url |
| `employee_disciplinary` | id, employee_id, type, description, date, severity, document_url, applied_by |
| `employee_timesheets` | id, employee_id, month, year, days_worked, hours_normal, hours_extra, hours_noturno, faltas, atrasos, dsr, status |
| `employee_payslips` | id, employee_id, month, year, salario_base, horas_extras, adicional_noturno, adicional_periculosidade, vale_transporte, vale_alimentacao, inss, irrf, fgts, outros_descontos, outros_proventos, salario_liquido, status, notes |
| `login_selfies` | id, user_id, photo_url, lat, lng, timestamp, ip_address, user_agent |
| `audit_logs` | id, user_id, user_name, user_role, action, page, details, ip_address, user_agent |
| `system_audit_logs` | id, user_id, user_name, user_role, action, target_type, target_id, details, ip_address |
| `billing_alerts` | id, client_id, client_name, alert_type, message, due_date, amount, status, resolved_at, resolved_by |
| `company_documents` | id, doc_type, doc_url, uploaded_at, notes |
| `homologation_logs` | id, client_id, sent_by, sent_at, documents_sent, email_to, status |
| `mission_updates` | id, service_order_id, employee_id, employee_name, update_type, step_name, message, photo_url, lat, lng, km_value, timestamp, read |
| `employee_occurrences` | id, employee_id, employee_name, type, description, photo_url, lat, lng, service_order_id, timestamp, status, admin_notes |
| `reference_points` | id, name, lat, lng, radius, type, client_id, notes |
| `mission_positions` | id, service_order_id, employee_id, lat, lng, speed, heading, accuracy, battery, timestamp |
| `client_forwards` | id, service_order_id, client_id, forward_type, recipients, subject, message, attachments, sent_at, sent_by |
| `mission_costs` | id, service_order_id, category, description, amount, cost_type, receipt_url, created_at |
| `system_settings` | id, key, value, updated_at |
| `invoices` | id, client_id, asaas_id, description, value, due_date, status, billing_type, installment_count, pix_qr_code, pix_payload, invoice_url, month_ref |

### Tabelas Supabase-only (sem Drizzle, acessadas via `supabaseAdmin.from()`):
| Tabela | Uso |
|--------|-----|
| `escort_billings` | Medições de escolta (status: A_VERIFICAR → APROVADA → FATURADO → PAGO) |
| `escort_contracts` | Contratos de escolta por cliente (valor_km, valor_hora, valor_fixo, etc.) |
| `escort_routes` | Rotas fixas de escolta (origem, destino, km_estimado, valor) |
| `financial_transactions` | Lançamentos financeiros (receita/despesa, origin_type, origin_id) |
| `financial_accounts` | Contas bancárias da empresa |
| `financial_categories` | Categorias financeiras (receita/despesa) |
| `financial_audit_logs` | Log de auditoria financeira |
| `ponto_operacional` | Ponto operacional (entrada/saída em missão) |
| `service_contracts` | Contratos de prestação de serviço |
| `payslips` | (alias legado, usa employee_payslips) |
| `fueling_records` | (alias legado, usa vehicle_fueling) |
| `token_failure_logs` | Logs de falha de token JWT |
| `weapon_movements` | Movimentações de armas |
| `v_resumo_financeiro` | VIEW: resumo financeiro mensal |

---

## 3. ROTAS BACKEND (~290 endpoints em `server/routes.ts` + 12 em `server/asaas.ts`)

### Auth (`/api/auth/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/token-failure` | Log falha de token |
| GET | `/api/auth/setup-check` | Verifica se setup inicial foi feito |
| POST | `/api/auth/setup` | Setup inicial (cria user admin) |
| POST | `/api/auth/cpf-lookup` | Login por CPF |
| GET | `/api/auth/me` | Dados do usuário logado |
| POST | `/api/auth/accept-terms` | Aceitar termos de uso |
| POST | `/api/auth/login-selfie` | Upload selfie de login |
| GET | `/api/auth/login-selfie-today` | Selfie de hoje |
| GET | `/api/admin/login-selfies` | Listar selfies (admin) |
| POST | `/api/auth/change-password` | Alterar senha |
| GET | `/api/auth/perfil` | Perfil do usuário |
| GET | `/api/auth/perfis` | Listar perfis de acesso |

### System Settings
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/system-settings/:key` | Ler configuração |
| PUT | `/api/system-settings/:key` | Salvar configuração |

### Clientes (`/api/clients/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/clients` | Listar clientes |
| GET | `/api/clients/:id` | Detalhe cliente |
| GET | `/api/clients/:id/contrato-pdf` | Gerar PDF contrato |
| POST | `/api/clients` | Criar cliente |
| PATCH | `/api/clients/:id` | Atualizar cliente |
| DELETE | `/api/clients/:id` | Excluir (diretoria) |
| GET | `/api/clients/:id/vehicles` | Veículos do cliente |
| POST | `/api/clients/:id/vehicles` | Adicionar veículo cliente |
| PATCH | `/api/client-vehicles/:id` | Editar veículo cliente |
| DELETE | `/api/client-vehicles/:id` | Excluir veículo cliente |
| GET | `/api/clients/:id/billing-config` | Config faturamento |

### Funcionários (`/api/employees/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/employees` | Listar funcionários |
| GET | `/api/employees/next-matricula` | Próxima matrícula |
| GET | `/api/employees/:id` | Detalhe funcionário |
| POST | `/api/employees` | Criar funcionário (+ cria user Supabase Auth) |
| PATCH | `/api/employees/:id` | Atualizar funcionário |
| DELETE | `/api/employees/:id` | Excluir (diretoria) |
| GET | `/api/employees/:id/salaries` | Histórico salarial |
| POST | `/api/employees/:id/salaries` | Novo registro salarial |
| DELETE | `/api/employee-salaries/:id` | Excluir salário |
| GET | `/api/employees/:id/salary-discounts` | Descontos fixos |
| POST | `/api/employees/:id/salary-discounts` | Adicionar desconto fixo |
| DELETE | `/api/salary-discounts/:id` | Excluir desconto |
| GET | `/api/employees/:id/salary-summary` | Resumo salarial |
| POST | `/api/payroll/sync-financial` | Sincronizar folha → financeiro |
| POST | `/api/employees/apply-cct-kit` | Aplicar kit CCT (reajuste coletivo) |
| GET | `/api/employees/monthly-hours` | Horas mensais |
| GET | `/api/employees/:id/cost-detail` | Custo detalhado do funcionário |
| POST | `/api/employees/ocr` | OCR documento admissional (OpenAI Vision) |
| POST | `/api/employees/ocr-document` | OCR documento genérico |

### Holerites/Payslips (`/api/payslips/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/payslips` | Listar holerites |
| POST | `/api/payslips` | Criar holerite |
| PATCH | `/api/payslips/:id` | Atualizar holerite |
| DELETE | `/api/payslips/:id` | Excluir holerite |
| POST | `/api/payslips/ocr` | OCR importar holerite (OpenAI Vision) |
| POST | `/api/payslips/generate-batch` | Gerar holerites em lote |

### Veículos (`/api/vehicles/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/vehicles` | Listar veículos |
| GET | `/api/vehicles/:id` | Detalhe veículo |
| POST | `/api/vehicles` | Criar veículo |
| PATCH | `/api/vehicles/:id` | Atualizar veículo |
| DELETE | `/api/vehicles/:id` | Excluir (diretoria) |

### Ordens de Serviço (`/api/service-orders/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/service-orders` | Listar OS |
| GET | `/api/service-orders/:id` | Detalhe OS |
| POST | `/api/service-orders` | Criar OS |
| PATCH | `/api/service-orders/:id` | Atualizar OS |
| DELETE | `/api/service-orders/:id` | Excluir (diretoria) |
| GET | `/api/service-orders/:id/photos` | Fotos da missão |
| POST | `/api/service-orders/:id/photos` | Upload foto missão |
| GET | `/api/service-orders/:id/costs` | Custos da missão |
| POST | `/api/service-orders/:id/costs` | Adicionar custo |
| DELETE | `/api/service-orders/:id/costs/:costId` | Excluir custo |
| GET | `/api/service-orders/:id/route` | Rota da missão |
| GET | `/api/service-orders/:id/relatorio-missao` | Relatório missão |
| GET | `/api/service-orders/:id/updates` | Atualizações da missão |
| GET | `/api/service-orders/:id/forwards` | Encaminhamentos ao cliente |

### Missão Mobile (`/api/mission/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/mission/active` | Missão ativa do vigilante |
| GET | `/api/mission/scheduled` | Missões agendadas |
| POST | `/api/mission/update` | Enviar update de missão |
| GET | `/api/mission/updates` | Listar updates (admin) |
| GET | `/api/mission/updates/:id/photo` | Foto do update |
| PATCH | `/api/mission/updates/mark-read` | Marcar como lido |
| POST | `/api/mission/updates/:id/copy-audit` | Copiar para auditoria |
| POST | `/api/mission/updates/:id/forward` | Encaminhar ao cliente |
| GET | `/api/mission/status/:serviceOrderId` | Status da missão |

### Escort/Billing (`/api/escort/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/escort/billings` | Listar medições |
| GET | `/api/escort/billings/:id` | Detalhe medição |
| PATCH | `/api/escort/billings/:id` | Atualizar medição |
| POST | `/api/escort/billings/:id/aprovar` | Aprovar medição |
| POST | `/api/escort/billings/:id/revisar` | Enviar para revisão |
| POST | `/api/escort/billings/:id/reabrir` | Reabrir medição |
| GET | `/api/escort/billings/pendentes` | Medições pendentes |
| POST | `/api/escort/billings/:id/gerar-boletim` | Gerar boletim medição |
| GET | `/api/escort/contracts` | Listar contratos escolta |
| POST | `/api/escort/contracts` | Criar contrato |
| PATCH | `/api/escort/contracts/:id` | Atualizar contrato |
| DELETE | `/api/escort/contracts/:id` | Excluir contrato |
| GET | `/api/escort/routes` | Rotas de escolta |
| POST | `/api/escort/routes` | Criar rota |
| PUT | `/api/escort/routes/:id` | Atualizar rota |
| DELETE | `/api/escort/routes/:id` | Excluir rota |
| GET | `/api/escort/relatorio/:clientId` | Relatório faturamento |

### Financeiro (`/api/financial/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/financial/dashboard` | Dashboard financeiro |
| GET | `/api/financial/transactions` | Listar transações |
| POST | `/api/financial/transactions` | Criar transação |
| PATCH | `/api/financial/transactions/:id` | Atualizar transação |
| DELETE | `/api/financial/transactions/:id` | Excluir transação |
| GET | `/api/financial/categories` | Categorias |
| GET | `/api/financial/accounts` | Contas |

### Asaas (`server/asaas.ts`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/asaas/status` | Status conexão Asaas |
| GET | `/api/asaas/customers` | Clientes Asaas |
| GET | `/api/asaas/payments` | Pagamentos Asaas |
| GET | `/api/invoices` | Listar faturas |
| POST | `/api/invoices` | Criar fatura (envia pro Asaas) |
| PATCH | `/api/invoices/:id` | Atualizar fatura |
| DELETE | `/api/invoices/:id` | Excluir fatura |
| POST | `/api/invoices/:id/sync` | Sincronizar status com Asaas |
| POST | `/api/invoices/:id/resend` | Reenviar cobrança |
| GET | `/api/invoices/:id/pix` | QR Code Pix |
| POST | `/api/asaas/webhook` | Webhook Asaas (recebe pagamentos) |
| POST | `/api/boletim-medicao/gerar-fatura/:clientId` | Gerar fatura do boletim |

### Viagens, Manutenção, Abastecimento
| Método | Rota | Descrição |
|--------|------|-----------|
| CRUD | `/api/trips` | Viagens |
| CRUD | `/api/maintenance` | Manutenção veículos |
| CRUD | `/api/fueling` | Abastecimentos |
| CRUD | `/api/timesheets` | Folhas de ponto |

### Consultas API Brasil (`/api/consulta/`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/consulta/multas-prf/:placa` | Multas PRF |
| GET | `/api/consulta/cnh/:cpf` | Consulta CNH |
| GET | `/api/consulta/processos/:cpf` | Processos judiciais |
| GET | `/api/consulta/spc/:document` | Consulta SPC |
| GET | `/api/consulta/quod/:document` | Consulta QUOD |
| GET | `/api/consulta/protesto/:document` | Consulta protestos |
| GET | `/api/consulta/situacao-eleitoral/:cpf` | Situação eleitoral |
| POST | `/api/consulta/emitir-nf` | Emitir nota fiscal |
| GET | `/api/consulta/analise-risco/:document` | Análise de risco |
| GET | `/api/cpf-lookup/:cpf` | Lookup CPF |
| GET | `/api/datajud/:cnpj` | Consulta DataJud |
| GET | `/api/plate-lookup/:plate` | Consulta placa |

### TrucksControl / Telemetria
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/truckscontrol/positions` | Posições veículos |
| GET | `/api/truckscontrol/spy` | Espionagem rastreador |
| POST | `/api/truckscontrol/command` | Enviar comando (bloquear, etc.) |
| GET | `/api/truckscontrol/espelhados` | Veículos espelhados |
| POST | `/api/truckscontrol/espelhar` | Espelhar veículo |
| GET | `/api/vehicle-tracking` | Tracking consolidado |
| GET | `/api/telemetry/events` | Eventos telemetria |
| GET | `/api/telemetry/summary` | Resumo telemetria |

### Gerenciadoras
| Método | Rota | Descrição |
|--------|------|-----------|
| CRUD | `/api/gerenciadoras` | Gerenciadoras de risco |
| POST | `/api/gerenciadoras/:id/mirror` | Espelhar gerenciadora |

### Grid Operacional, Auditoria, Alertas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/operational-grid` | Grid operacional |
| GET | `/api/system-audit-logs` | Logs de auditoria (paginado + filtros) |
| GET | `/api/billing-alerts` | Alertas de cobrança |
| PATCH | `/api/billing-alerts/:id/resolve` | Resolver alerta |
| GET | `/api/api-logs` | Logs de API |

### Mobile Vigilante
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/mobile/ponto/today` | Ponto de hoje |
| POST | `/api/mobile/ponto/clock` | Bater ponto |
| GET | `/api/mobile/abastecimento/vehicles` | Veículos para abastecer |
| POST | `/api/mobile/abastecimento` | Registrar abastecimento |
| POST | `/api/mobile/pedagio-missao` | Registrar pedágio (missão) |
| POST | `/api/mobile/pedagio-vazio` | Registrar pedágio (vazio) |
| GET | `/api/mobile/ocorrencias` | Minhas ocorrências |
| POST | `/api/mobile/ocorrencias` | Registrar ocorrência |
| GET | `/api/mobile/oil-alert/:vehicleId` | Alerta troca óleo |
| GET/POST | `/api/ponto-operacional/*` | Ponto operacional |
| GET | `/api/reference-points` | Pontos de referência |

### Documentos e Email
| Método | Rota | Descrição |
|--------|------|-----------|
| CRUD | `/api/company-documents` | Documentos da empresa |
| GET | `/api/homologation-logs/:clientId` | Logs homologação |
| GET | `/api/email-config` | Config email |
| POST | `/api/email-test` | Testar email |
| POST | `/api/homologation/send` | Enviar homologação |
| GET | `/api/service-contracts/:id/pdf` | PDF contrato serviço |

---

## 4. FRONTEND — PÁGINAS ADMIN (30 telas)

| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `dashboard.tsx` | `/admin` | Dashboard principal |
| `login.tsx` | `/admin/login` | Login (logo Torres) |
| `clients.tsx` | `/admin/clientes` | Gestão de clientes + pasta do cliente |
| `employees.tsx` | `/admin/funcionarios` | Gestão de funcionários |
| `vehicles.tsx` | `/admin/veiculos` | Gestão de frota |
| `service-orders.tsx` | `/admin/ordens-servico` | Ordens de serviço |
| `mission.tsx` | `/admin/missao` | Central de missão (painel tempo real) |
| `tracker.tsx` | `/admin/rastreamento` | Rastreamento GPS |
| `telemetry.tsx` | `/admin/telemetria` | Telemetria veículos |
| `trips.tsx` | `/admin/viagens` | Controle de viagens |
| `fueling.tsx` | `/admin/abastecimentos` | Abastecimentos |
| `maintenance.tsx` | `/admin/manutencao` | Manutenção veicular |
| `timesheets.tsx` | `/admin/ponto` | Folhas de ponto |
| `ponto-operacional.tsx` | `/admin/ponto-operacional` | Ponto operacional |
| `weapons.tsx` | `/admin/armamento` | Gestão de armamento |
| `users.tsx` | `/admin/usuarios` | Gestão de usuários |
| `escort-billing.tsx` | `/admin/medicoes` | Medições de escolta |
| `boletim-medicao.tsx` | `/admin/boletim-medicao` | Boletim de medição |
| `financeiro.tsx` | `/admin/financeiro` | Módulo financeiro |
| `faturas.tsx` | `/admin/faturas` | Faturas Asaas |
| `holerites.tsx` | `/admin/holerites` | Holerites/Folha pagamento |
| `balanco-gerencial.tsx` | `/admin/balanco` | Balanço gerencial |
| `relatorio-faturamento.tsx` | `/admin/relatorio-faturamento` | Relatório faturamento |
| `operational-grid.tsx` | `/admin/grid-operacional` | Grade operacional |
| `simulador-missao.tsx` | `/admin/simulador` | Simulador de missão |
| `cotacao-gasto.tsx` | `/admin/cotacao-gasto` | Cotação/gastos |
| `consultas.tsx` | `/admin/consultas` | Consultas externas (API Brasil) |
| `guia-missao.tsx` | `/admin/guia-missao` | Guia de missão |
| `audit.tsx` | `/admin/auditoria` | Auditoria do sistema |
| `profile.tsx` | `/admin/perfil` | Perfil do admin |

## 5. FRONTEND — PÁGINAS MOBILE VIGILANTE (12 telas)

| Arquivo | Rota | Descrição |
|---------|------|-----------|
| `home.tsx` | `/mobile` | Home do vigilante |
| `missao.tsx` | `/mobile/missao` | Workflow missão (step-by-step) |
| `ponto.tsx` | `/mobile/ponto` | Bater ponto |
| `ponto-operacional.tsx` | `/mobile/ponto-operacional` | Ponto operacional (missão) |
| `abastecimento.tsx` | `/mobile/abastecimento` | Registrar abastecimento |
| `pedagio.tsx` | `/mobile/pedagio` | Registrar pedágio |
| `selfie.tsx` | `/mobile/selfie` | Selfie de login |
| `checklist.tsx` | `/mobile/checklist` | Checklist veículo |
| `ocorrencia.tsx` | `/mobile/ocorrencia` | Registrar ocorrência |
| `meu-rh.tsx` | `/mobile/meu-rh` | Meu RH (holerites, dados) |
| `perfil.tsx` | `/mobile/perfil` | Perfil do vigilante |

---

## 6. INTEGRAÇÕES EXTERNAS

### Asaas (Cobrança/Faturamento)
- **Env**: `ASAAS_API_KEY` (sandbox ou produção)
- **Uso**: Gerar boletos/Pix, receber webhooks de pagamento, sincronizar status faturas
- **Fluxo**: Medição APROVADA → Gerar Fatura → Asaas cria cobrança → Webhook confirma pagamento → Status PAGO

### API Brasil (`server/apibrasil.ts`)
- **Env**: `APIBRASIL_TOKEN`
- **Endpoints**: CNH, multas PRF, SPC/Serasa, QUOD, protestos, processos judiciais, situação eleitoral, análise de risco, emissão NF, consulta placa (FIPE)
- **Uso**: Consultas RH/compliance e verificação de veículos

### TrucksControl (`server/truckscontrol.ts`)
- **Uso**: Rastreamento GPS de frota, envio de comandos (bloquear/desbloquear), espelhamento de veículos
- **Integração**: API REST TrucksControl + cache local

### OpenAI (via Replit AI Integrations)
- **Modelo**: `gpt-4o-mini`
- **Uso 1**: OCR de documentos admissionais → extrai campos do funcionário
- **Uso 2**: OCR de holerites → extrai campos salariais e match por CPF/nome
- **Uso 3**: Geração de relatórios e análises

### Supabase Realtime
- **6 canais**: `mission_costs`, `financial_transactions`, `vehicle_fueling`, `service_orders`, `mission_updates`, `escort_billings`
- **Evento**: `*` (INSERT + UPDATE + DELETE)
- **Reconexão**: `queryClient.invalidateQueries()` ao reconectar

### Email SMTP
- **Env**: `SMTP_PASS`
- **Uso**: Envio de homologação, notificações

---

## 7. CRON JOBS (`server/cron.ts`)

| Schedule | Job | Descrição |
|----------|-----|-----------|
| `0 2 * * *` | Frota | Consulta multas PRF para todos os veículos |
| `0 3 1 */3 *` | RH Compliance | CNH + processos + situação eleitoral (trimestral) |
| `30 9,19 * * 1-5` | Rodízio | Alerta rodízio SP (06:30 e 16:30 BRT) via TrucksControl |
| `*/30 * * * *` | Billing | Recalcula medições de escolta (a cada 30min) |
| `0 6 * * *` | BillingAlerts | Verifica pendências de cobrança, gera alertas |
| `59 2 * * *` | Provisão Salário | Provisão diária de salários → financial_transactions |

---

## 8. REGRAS DE NEGÓCIO CRÍTICAS

### Billing/Medição de Escolta
- **Fluxo de Status**: `A_VERIFICAR` → `APROVADA` → `FATURADO` → `PAGO`
- **Lock**: Status FATURADO e PAGO não podem ser editados
- **Cálculo**: `server/billing-calc.ts` → horas missão, km total, valor faturamento (por contrato)
- **Cron**: Recalcula automaticamente a cada 30 minutos

### Holerites
- **Quando status = `pago`**: Auto-cria `financial_transactions` (origin_type: "holerite")
- **Quando excluído**: Cancela a transação financeira vinculada
- **OCR**: `POST /api/payslips/ocr` → OpenAI Vision extrai campos → match por CPF ou nome fuzzy

### Autenticação
- **Supabase Auth**: JWT token no header `Authorization: Bearer`
- **Roles**: `admin`, `vigilante`, `gerente`, `diretoria`
- **Frontend**: `authFetch()` em `queryClient.ts` adiciona token automaticamente
- **REGRA**: NUNCA usar `fetch()` direto — sempre `authFetch()`

### Timezone
- **Regra**: Sempre usar BRT (America/Sao_Paulo)
- **`data_missao`**: Armazenado como ISO timestamp completo
- **Frontend**: Usar `parseUTCTimestamp()` para exibir datas

### Auditoria
- **`logSystemAudit()`** em `server/audit.ts`
- **Tabela**: `system_audit_logs` (snake_case)
- **Importar**: `import { logSystemAudit } from "./audit"`

---

## 9. ARQUIVOS IMPORTANTES

| Arquivo | Propósito |
|---------|-----------|
| `shared/schema.ts` | Modelos de dados (Drizzle + Zod) |
| `server/routes.ts` | Todas as rotas API (~6000+ linhas) |
| `server/asaas.ts` | Integração Asaas (faturas) |
| `server/billing-calc.ts` | Motor cálculo escolta |
| `server/cron.ts` | Jobs agendados |
| `server/audit.ts` | Sistema de auditoria |
| `server/auth.ts` | Middlewares de autenticação |
| `server/storage.ts` | Interface storage (Supabase REST) |
| `server/supabase.ts` | Cliente Supabase Admin |
| `server/truckscontrol.ts` | Integração TrucksControl |
| `server/apibrasil.ts` | Integração API Brasil |
| `client/src/lib/queryClient.ts` | authFetch, apiRequest, TanStack Query config |
| `client/src/lib/supabase.ts` | Supabase client + Realtime |
| `client/src/hooks/use-auth.tsx` | AuthProvider |
| `client/src/components/admin/layout.tsx` | Sidebar admin (menu items) |

---

## 10. VARIÁVEIS DE AMBIENTE

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | PostgreSQL local (Replit) |
| `SUPABASE_DATABASE_URL` | PostgreSQL Supabase (produção) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anônima Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role Supabase |
| `ASAAS_API_KEY` | API key Asaas (faturamento) |
| `APIBRASIL_TOKEN` | Token API Brasil (consultas) |
| `SESSION_SECRET` | Secret para sessões Express |
| `SMTP_PASS` | Senha SMTP (email) |
| `VITE_SUPABASE_URL` | Supabase URL (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (frontend) |
| `VITE_GOOGLE_MAPS_KEY` | Google Maps API key |
