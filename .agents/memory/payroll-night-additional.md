---
name: Adicional noturno — CCT fixa 16,50 (fallback 1,80×)
description: Convenção unificada de cálculo do adicional noturno em toda a folha (holerite, custo, RH/Ponto)
---

# Adicional noturno — CCT fixa 16,50 (fallback 1,80×)

**Regra atual (decisão do dono 29/07/2026):** vigilância Torres usa taxas **fixas do Kit CCT**:
- HE diurna = `horaExtraValor` (padrão **R$ 16,00**/h)
- HE/adicional noturno = `horaExtraNoturnaValor` (padrão **R$ 16,50**/h)

O motor (`calcularFolha` / `buildFolhaStats`) aplica essas taxas quando > 0.
Só se a CCT não tiver taxa (ex.: SIEMACO = 0) cai no fallback antigo
`valorHora × 1,60` (HE) / `valorHora × 1,80` (noturno).

**Why:** a planilha manual (Reis etc.) paga R$ 16 diurna e R$ 16,50 noturna —
não o multiplicador do salário (~R$ 24/h). Ver também `payroll-cct-he-fixas.md`.

**Como aplicar:**
- Sempre passar `valorHoraExtraFixo` / `valorHoraNoturnaFixo` a partir do Kit CCT do cargo.
- DSR fica desligado no modelo Torres.
- Não voltar a multiplicador do salário na vigilância sem ordem do dono.
