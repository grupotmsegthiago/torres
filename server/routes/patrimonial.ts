/**
 * Módulo Patrimonial: matriz de impostos, comissão, bônus e proposta.
 * Independente da área Comercial já existente.
 */
import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import {
  PATRIMONIAL_REGIONS,
  PATRIMONIAL_SERVICE_TYPES,
  calcPatrimonialProposal,
  roundMoney,
  type PatrimonialMatrix,
} from "../../shared/patrimonial-proposal";

const MATRIX_TABLE = "financial_matrix_config";
const PROPOSAL_TABLE = "commercial_proposals";

function num(value: unknown, label: string, opts?: { min?: number; max?: number }): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new Error(`${label} inválido`);
  }
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  if (n < min || n > max) {
    throw new Error(`${label} fora da faixa permitida`);
  }
  return n;
}

function matrixFromRow(row: Record<string, unknown>): PatrimonialMatrix & { id: string; companyName: string; updatedAt: string } {
  return {
    id: String(row.id),
    companyName: String(row.company_name || "Grupo TM Seg"),
    taxPercentage: Number(row.tax_percentage),
    commissionPercentage: Number(row.commission_percentage),
    bonusThreshold1: Number(row.bonus_threshold_1),
    bonusValue1: Number(row.bonus_value_1),
    bonusThreshold2: Number(row.bonus_threshold_2),
    bonusValue2: Number(row.bonus_value_2),
    updatedAt: String(row.updated_at || ""),
  };
}

function proposalFromRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    clientName: String(row.client_name),
    region: String(row.region),
    serviceType: String(row.service_type),
    estimatedGrossValue: Number(row.estimated_gross_value),
    calculatedTax: Number(row.calculated_tax),
    netResult: Number(row.net_result),
    calculatedCommission: Number(row.calculated_commission),
    calculatedBonus: Number(row.calculated_bonus),
    totalPayableProvider: Number(row.total_payable_provider),
    createdAt: String(row.created_at || ""),
  };
}

async function loadMatrixRow() {
  const { data, error } = await supabaseAdmin
    .from(MATRIX_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function registerPatrimonialRoutes(app: Express) {
  app.get("/api/patrimonial/matriz", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const row = await loadMatrixRow();
      if (!row) return res.status(404).json({ message: "Matriz patrimonial ainda não configurada" });
      res.json(matrixFromRow(row));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/patrimonial/matriz", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const taxPercentage = num(req.body?.taxPercentage, "Imposto", { max: 100 });
      const commissionPercentage = num(req.body?.commissionPercentage, "Comissão", { max: 100 });
      const bonusThreshold1 = num(req.body?.bonusThreshold1, "Meta de bônus 1");
      const bonusValue1 = num(req.body?.bonusValue1, "Prêmio 1");
      const bonusThreshold2 = num(req.body?.bonusThreshold2, "Meta de bônus 2");
      const bonusValue2 = num(req.body?.bonusValue2, "Prêmio 2");
      if (bonusThreshold2 < bonusThreshold1) {
        return res.status(400).json({ message: "A meta 2 precisa ser maior ou igual à meta 1" });
      }
      const companyName = String(req.body?.companyName || "Grupo TM Seg").trim() || "Grupo TM Seg";
      const current = await loadMatrixRow();
      const payload = {
        company_name: companyName,
        tax_percentage: roundMoney(taxPercentage),
        commission_percentage: roundMoney(commissionPercentage),
        bonus_threshold_1: roundMoney(bonusThreshold1),
        bonus_value_1: roundMoney(bonusValue1),
        bonus_threshold_2: roundMoney(bonusThreshold2),
        bonus_value_2: roundMoney(bonusValue2),
        updated_at: new Date().toISOString(),
      };
      const query = current
        ? supabaseAdmin.from(MATRIX_TABLE).update(payload).eq("id", current.id).select("*").single()
        : supabaseAdmin.from(MATRIX_TABLE).insert(payload).select("*").single();
      const { data, error } = await query;
      if (error) throw error;
      res.json(matrixFromRow(data));
    } catch (err: any) {
      const status = String(err.message || "").includes("inválido") || String(err.message || "").includes("faixa") ? 400 : 500;
      res.status(status).json({ message: err.message });
    }
  });

  app.get("/api/patrimonial/propostas", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from(PROPOSAL_TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      res.json((data || []).map(proposalFromRow));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/patrimonial/propostas", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const clientName = String(req.body?.clientName || "").trim();
      const region = String(req.body?.region || "").trim();
      const serviceType = String(req.body?.serviceType || "").trim();
      if (!clientName) return res.status(400).json({ message: "Informe o nome do cliente" });
      if (!PATRIMONIAL_REGIONS.includes(region as typeof PATRIMONIAL_REGIONS[number])) {
        return res.status(400).json({ message: "Região não reconhecida" });
      }
      if (!PATRIMONIAL_SERVICE_TYPES.includes(serviceType as typeof PATRIMONIAL_SERVICE_TYPES[number])) {
        return res.status(400).json({ message: "Tipo de serviço não reconhecido" });
      }
      const gross = roundMoney(num(req.body?.estimatedGrossValue, "Valor bruto"));

      const matrixRow = await loadMatrixRow();
      if (!matrixRow) return res.status(409).json({ message: "Salve a matriz patrimonial antes de gerar a proposta" });
      const matrix = matrixFromRow(matrixRow);
      const calc = calcPatrimonialProposal(gross, matrix);

      const { data, error } = await supabaseAdmin
        .from(PROPOSAL_TABLE)
        .insert({
          client_name: clientName,
          region,
          service_type: serviceType,
          base_activation_value: 0,
          km_franchise: 0,
          extra_km_value: 0,
          extra_hour_value: 0,
          estimated_gross_value: gross,
          calculated_tax: calc.taxAmount,
          net_result: calc.netResult,
          calculated_commission: calc.commissionAmount,
          calculated_bonus: calc.bonusAmount,
          total_payable_provider: calc.totalPayable,
          created_by: req.user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      res.status(201).json(proposalFromRow(data));
    } catch (err: any) {
      const status = String(err.message || "").includes("inválido") || String(err.message || "").includes("faixa") ? 400 : 500;
      res.status(status).json({ message: err.message });
    }
  });
}
