---
name: Proposta — portão de batida órfã (não implementado)
description: Modelo de dados e fluxo para justificar órfãs antes do fechamento de folha; fora da primeira PR de pares
---

# Portão de batida órfã — PROPOSTA (não implementar nesta PR)

`control_id_locked_periods` **não** deve ser reutilizado: ele trava **período/import**, não decide evento individual.

## Tabela proposta (futura migration — exige aprovação)

```sql
CREATE TABLE IF NOT EXISTS control_id_orphan_justifications (
  id              BIGSERIAL PRIMARY KEY,
  punch_id        INTEGER NOT NULL REFERENCES control_id_punches(id),
  employee_id     INTEGER NOT NULL REFERENCES employees(id),
  jornada_date    DATE NOT NULL,              -- dia BRT da jornada
  punch_at        TIMESTAMPTZ NOT NULL,
  reason_code     TEXT NOT NULL,              -- unpaired_trailing | non_increasing | other
  justification   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'justificada', 'rejeitada')),
  justified_by    INTEGER REFERENCES employees(id),  -- ou system_users.id
  justified_at    TIMESTAMPTZ,
  reviewed_by     INTEGER,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orphan_just_punch
  ON control_id_orphan_justifications(punch_id);
CREATE INDEX IF NOT EXISTS idx_orphan_just_emp_date
  ON control_id_orphan_justifications(employee_id, jornada_date);
```

## Campos / significados

| Campo | Uso |
|-------|-----|
| `punch_id` | Batida órfã identificada pelo motor `computeJornadaPares` |
| `employee_id` | Funcionário |
| `jornada_date` | Data BRT da jornada |
| `reason_code` | Motivo técnico do motor |
| `justification` | Texto do responsável |
| `status` | `pendente` → `justificada` / `rejeitada` |
| `justified_by` / `justified_at` | Quem justificou |
| `reviewed_by` / `reviewed_at` | Quem aprovou/rejeitou (RH/Diretoria) |

## Histórico de auditoria

Tabela satélite ou append-only:

```sql
CREATE TABLE IF NOT EXISTS control_id_orphan_justification_events (
  id              BIGSERIAL PRIMARY KEY,
  justification_id BIGINT NOT NULL REFERENCES control_id_orphan_justifications(id),
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  actor_id        INTEGER,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Permissões

| Ação | Papel |
|------|-------|
| Listar órfãs do mês | admin / RH |
| Justificar | admin / RH / gestor autorizado |
| Aprovar / rejeitar | Diretoria (ou RH sênior) |
| Fechar competência com órfã pendente | **bloqueado** |

## Comportamento no fechamento

1. Motor `pares` lista `orphanPunches` por dia.
2. Para cada órfã sem linha `justificada`, status da competência = **bloqueada para fechamento**.
3. Snapshot `folha_historico_mensal` / lock `control_id_locked_periods` só após zero órfãs pendentes (ou waiver Diretoria).
4. Justificativa **não** altera `workedMinutes` automaticamente — só libera o fechamento; correção de batida continua manual/import.

## Fora de escopo desta PR

Sem migration, sem UI, sem gate ativo. Motor já emite `orphanPunches` + `auditFlags` para alimentar o gate futuro.
