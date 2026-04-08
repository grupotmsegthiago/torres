# LOG DE VARIÁVEIS MAPEADAS — Módulo de Laudo Dinâmico
## Rota: GET /api/laudo/:osId

---

## Fonte de Dados (7 queries paralelas ao Supabase)

| # | Tabela Supabase | Filtro | Ordenação |
|---|----------------|--------|-----------|
| 1 | `service_orders` | `.eq("id", osId).single()` | — |
| 2 | `mission_photos` | `.eq("service_order_id", osId)` | `created_at ASC` |
| 3 | `mission_updates` | `.eq("service_order_id", osId)` | `created_at ASC` |
| 4 | `mission_positions` | `.eq("service_order_id", osId)` | `recorded_at ASC` |
| 5 | `mission_costs` | `.eq("service_order_id", osId)` | `created_at ASC` |
| 6 | `mission_acceptances` | `.eq("service_order_id", osId)` | `created_at DESC LIMIT 5` |
| 7 | `escort_billings` | `.eq("service_order_id", osId)` | `LIMIT 1` |

Dados de relação (via storage helpers):
- `clients` → `storage.getClient(so.clientId)`
- `employees` → `storage.getEmployee(so.assignedEmployeeId)` + `storage.getEmployee(so.assignedEmployee2Id)`
- `vehicles` → `storage.getVehicle(so.vehicleId)`

---

## Mapeamento Campo a Campo

### Seção: `os` (Dados da Operação)
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `os.id` | `id` | `service_orders` |
| `os.numero` | `os_number` | `service_orders` |
| `os.tipo` | `type` | `service_orders` |
| `os.status` | `status` | `service_orders` |
| `os.prioridade` | `priority` | `service_orders` |
| `os.descricao` | `description` | `service_orders` |
| `os.rota` | `route` | `service_orders` |
| `os.dataAgendada` | `scheduled_date` | `service_orders` |
| `os.dataConclusao` | `completed_date` | `service_orders` |
| `os.missionStartedAt` | `mission_started_at` | `service_orders` |
| `os.statusMissao` | `mission_status` | `service_orders` |
| `os.escortedDriverName` | `escorted_driver_name` | `service_orders` |
| `os.escortedVehiclePlate` | `escorted_vehicle_plate` | `service_orders` |
| `os.origin` | `origin` | `service_orders` |
| `os.destination` | `destination` | `service_orders` |

### Seção: `cliente` (Empresa Contratante)
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `cliente.nome` | `name` | `clients` |
| `cliente.cnpj` | `cnpj` | `clients` |
| `cliente.contato` | `contact_person` | `clients` |
| `cliente.telefone` | `phone` | `clients` |
| `cliente.email` | `email` | `clients` |

### Seção: `equipe` (Agentes)
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `equipe.agente1.nome` | `name` | `employees` |
| `equipe.agente1.matricula` | `matricula` | `employees` |
| `equipe.agente1.cargo` | `role` | `employees` |
| `equipe.agente1.telefone` | `phone` | `employees` |
| `equipe.agente2.*` | (mesmo padrão) | `employees` |

### Seção: `viatura`
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `viatura.placa` | `plate` | `vehicles` |
| `viatura.modelo` | `model` | `vehicles` |
| `viatura.marca` | `brand` | `vehicles` |
| `viatura.cor` | `color` | `vehicles` |

### Seção: `km` (Quilometragem)
| Campo no Laudo | Origem | Lógica |
|----------------|--------|--------|
| `km.saida` | `mission_photos` | `step = "km_saida"` → `km_value` |
| `km.chegada` | `mission_photos` | Último `step = "km_chegada"` → `km_value` |
| `km.final` | `mission_photos` | `step = "km_final"` → `km_value` |
| `km.rodados` | Calculado | `km.final - km.saida` |

### Seção: `cronologia` (Timeline da Operação)
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `cronologia[].horario` | `created_at` | `mission_updates` |
| `cronologia[].tipo` | `type` | `mission_updates` |
| `cronologia[].descricao` | `description` | `mission_updates` |
| `cronologia[].local` | `location` | `mission_updates` |
| `cronologia[].fotoUrl` | `photo_url` | `mission_updates` |

### Seção: `evidencias` (Fotos)
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `evidencias[].step` | `step` | `mission_photos` |
| `evidencias[].fotoUrl` | `photo_data` | `mission_photos` |
| `evidencias[].km` | `km_value` | `mission_photos` |
| `evidencias[].notas` | `notes` | `mission_photos` |
| `evidencias[].horario` | `created_at` | `mission_photos` |

**IMPORTANTE**: As fotos em `mission_photos.photo_data` são armazenadas como **base64 data URI** (ex: `data:image/jpeg;base64,...`). NÃO são URLs do Supabase Storage — são strings inline. Isso significa que o laudo funciona sem depender do Supabase Storage.

### Seção: `posicoes` (Rastreamento GPS)
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `posicoes[].lat` | `latitude` | `mission_positions` |
| `posicoes[].lng` | `longitude` | `mission_positions` |
| `posicoes[].horario` | `recorded_at` | `mission_positions` |
| `posicoes[].step` | `step` | `mission_positions` |

### Seção: `custos`
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `custos.itens[].tipo` | `cost_type` | `mission_costs` |
| `custos.itens[].descricao` | `description` | `mission_costs` |
| `custos.itens[].valor` | `value` | `mission_costs` |
| `custos.total` | Calculado | `SUM(value)` de todos os custos |

### Seção: `faturamento`
| Campo no Laudo | Coluna no Supabase | Tabela |
|----------------|-------------------|--------|
| `faturamento.status` | `status` | `escort_billings` |
| `faturamento.valorTotal` | `total_value` | `escort_billings` |
| `faturamento.valorEscolta` | `escort_value` | `escort_billings` |

---

## Acesso

- **Rota API**: `GET /api/laudo/:osId` (requer autenticação)
- **Página Frontend**: `/admin/laudo/:osId`
- **Impressão**: Botão "Imprimir" que usa `window.print()` com estilos `print:` do Tailwind
- **Visual**: Preto e branco, sóbrio, otimizado para impressão

## Rodapé

O rodapé exibe:
- "Documento gerado eletronicamente em [data/hora atual do sistema]"
- "Torres Vigilância Patrimonial — CNPJ 36.982.392/0001-89"
- ID único: `{OS_NUMBER}-{OS_ID}`
