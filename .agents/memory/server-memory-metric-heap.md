---
name: Métrica de memória do servidor (Node/V8)
description: Por que "Heap % usado" no /admin/database mostrava ~97% falso e como medir memória do Node de forma honesta.
---

# Memória do servidor: heapUsed/heapTotal engana (~97% sempre)

O card "Memória Servidor" do `/admin/database` mostrava **Heap 97% usado** e ficava vermelho, assustando o dono — mas era **falso alarme**.

**Causa:** o cálculo era `heapUsed / heapTotal`. No V8 esse valor é quase sempre alto (90%+): o V8 mantém `heapTotal` (o já comprometido) compacto e o **cresce sob demanda** até um teto. heapUsed perto de heapTotal é o estado normal, não pressão de memória.

**Métrica correta:** `heapUsed / heap_size_limit` (o TETO que o V8 pode crescer, via `v8.getHeapStatistics().heap_size_limit`). Só vira problema real quando heapUsed se aproxima desse teto. Medido: teto ~4144 MB, processo usando ~100–490 MB de RSS num container de 16 GB → uso real ~2–12%, saudável.

**Why:** evitar pânico/diagnóstico errado e thresholds (good/warn/bad) disparando à toa.

**How to apply:** qualquer % de memória de processo Node deve usar heapUsed vs heap_size_limit (ou RSS vs limite do container), NUNCA heapUsed/heapTotal. `getMemoryStats()` em `server/db-telemetry.ts` já segue isso e expõe heap_used_mb/heap_limit_mb pro card.
