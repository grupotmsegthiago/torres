/**
 * Precificação do módulo Patrimonial.
 * Cargos, matriz, ISS por cidade e proposta. Não usa a área Comercial.
 */
import type { Express } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole, requireDiretoriaStrict } from "../auth";
import {
  PATRIMONIAL_SCALES,
  calcPatrimonialPost,
  patrimonialNegotiatedMargin,
  patrimonialReleaseMode,
  roundMoney,
  sumPatrimonialLines,
  sumRates,
  type PatrimonialPostInput,
  type PatrimonialPricingParams,
  type PatrimonialScale,
  type RateItem,
} from "../../shared/patrimonial-pricing";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const ROLE_COLUMNS = "id, name, salary, sort_order, scale, armed, night, interval_indenizado, gratification_percent, he60_hours, he100_hours, holiday_hours, holiday_dsr";

function num(value: unknown, label: string, opts?: { min?: number; max?: number }): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${label} inválido`);
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  if (n < min || n > max) throw new Error(`${label} fora da faixa permitida`);
  return n;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function rateItems(value: unknown): RateItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: String(item?.name || "").trim(),
      percent: Number(item?.percent),
    }))
    .filter((item) => item.name && Number.isFinite(item.percent) && item.percent >= 0 && item.percent <= 100);
}

function paramsFromRow(row: Record<string, any>): PatrimonialPricingParams & { city: string; uf: string } {
  const pct = (value: unknown) => Number(value) / 100;
  return {
    city: String(row.city || "São Paulo"),
    uf: String(row.uf || "SP"),
    periculosidadeRate: pct(row.periculosidade_percent),
    nightHours: Number(row.night_hours),
    nightRate: pct(row.night_percent),
    dsrRate: pct(row.dsr_percent),
    he60Rate: pct(row.he60_percent),
    he100Rate: pct(row.he100_percent),
    holidayRate: pct(row.holiday_percent),
    hourDivisor: Number(row.hour_divisor) || 220,
    vrDaily: Number(row.vr_daily),
    vrDiscountRate: pct(row.vr_discount_percent),
    convenio: Number(row.convenio),
    vaComplement: Number(row.va_complement),
    lifeInsurance: Number(row.life_insurance),
    vtDaily: Number(row.vt_daily),
    vtDiscountRate: pct(row.vt_discount_percent),
    uniformUnarmed: Number(row.uniform_unarmed),
    uniformArmed: Number(row.uniform_armed),
    analiseRisco: Number(row.analise_risco),
    reciclagem: Number(row.reciclagem),
    rh: Number(row.rh),
    ppra: Number(row.ppra),
    ajudaCusto: Number(row.ajuda_custo),
    ppr: Number(row.ppr),
    issRate: pct(row.iss_percent),
    pisRate: pct(row.pis_percent),
    cofinsRate: pct(row.cofins_percent),
    taxaAdmRate: pct(row.taxa_adm_percent),
    lucroRate: pct(row.lucro_percent),
    chargeItems: rateItems(row.charge_items),
    provisionItems: rateItems(row.provision_items),
  };
}

function matrixDto(row: Record<string, any>) {
  const params = paramsFromRow(row);
  return {
    id: String(row.id),
    city: params.city,
    uf: params.uf,
    issPercent: Number(row.iss_percent),
    pisPercent: Number(row.pis_percent),
    cofinsPercent: Number(row.cofins_percent),
    taxaAdmPercent: Number(row.taxa_adm_percent),
    lucroPercent: Number(row.lucro_percent),
    periculosidadePercent: Number(row.periculosidade_percent),
    nightHours: Number(row.night_hours),
    nightPercent: Number(row.night_percent),
    dsrPercent: Number(row.dsr_percent),
    he60Percent: Number(row.he60_percent),
    he100Percent: Number(row.he100_percent),
    holidayPercent: Number(row.holiday_percent),
    hourDivisor: Number(row.hour_divisor),
    vrDaily: Number(row.vr_daily),
    vrDiscountPercent: Number(row.vr_discount_percent),
    convenio: Number(row.convenio),
    vaComplement: Number(row.va_complement),
    lifeInsurance: Number(row.life_insurance),
    vtDaily: Number(row.vt_daily),
    vtDiscountPercent: Number(row.vt_discount_percent),
    uniformUnarmed: Number(row.uniform_unarmed),
    uniformArmed: Number(row.uniform_armed),
    analiseRisco: Number(row.analise_risco),
    reciclagem: Number(row.reciclagem),
    rh: Number(row.rh),
    ppra: Number(row.ppra),
    ajudaCusto: Number(row.ajuda_custo),
    ppr: Number(row.ppr),
    chargeItems: params.chargeItems,
    provisionItems: params.provisionItems,
    chargePercent: Math.round(sumRates(params.chargeItems) * 10000) / 100,
    provisionPercent: Math.round(sumRates(params.provisionItems) * 10000) / 100,
    updatedAt: String(row.updated_at || ""),
  };
}

async function loadMatrix() {
  const { data, error } = await supabaseAdmin
    .from("patrimonial_pricing_matrix")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function roleScale(value: unknown): PatrimonialScale {
  const scale = String(value || "6 x 1") as PatrimonialScale;
  return PATRIMONIAL_SCALES[scale] ? scale : "6 x 1";
}

function roleDto(role: any) {
  return {
    id: String(role.id),
    name: String(role.name),
    salary: Number(role.salary),
    scale: roleScale(role.scale),
    armed: Boolean(role.armed),
    night: Boolean(role.night),
    intervalIndenizado: Boolean(role.interval_indenizado),
    gratificationPercent: Number(role.gratification_percent) || 0,
    he60Hours: Number(role.he60_hours) || 0,
    he100Hours: Number(role.he100_hours) || 0,
    holidayHours: Number(role.holiday_hours) || 0,
    holidayDsr: Boolean(role.holiday_dsr),
  };
}

function actorOf(req: { user?: { id?: number; name?: string; email?: string; role?: string } }) {
  return {
    actor_id: req.user?.id ?? null,
    actor_name: String(req.user?.name || req.user?.email || "Usuário"),
    actor_role: String(req.user?.role || ""),
  };
}

function proposalListDto(row: any) {
  const negotiatedPrice = Number(row.negotiated_price ?? row.total_price);
  return {
    id: String(row.id),
    clientId: row.client_id == null ? null : Number(row.client_id),
    clientName: String(row.client_name),
    city: String(row.city),
    uf: String(row.uf),
    issPercent: Number(row.iss_percent),
    totalPrice: negotiatedPrice,
    listPrice: Number(row.list_price ?? row.total_price),
    negotiatedPrice,
    marginPercent: row.margin_percent == null ? null : Number(row.margin_percent),
    status: String(row.status || "aguardando_diretoria"),
    createdAt: String(row.created_at || ""),
  };
}

function quoteNegotiation(totalCost: number, negotiatedPrice: number, params: PatrimonialPricingParams) {
  const quoted = patrimonialNegotiatedMargin({
    totalCost,
    negotiatedPrice,
    taxRate: params.issRate + params.pisRate + params.cofinsRate,
    taxaAdmRate: params.taxaAdmRate,
  });
  const mode = patrimonialReleaseMode(quoted.lucroPercent);
  if (mode === "bloqueado") throw new Error("Margem de lucro abaixo de 5%. A proposta não pode seguir.");
  return { quoted, status: mode === "automatica" ? "liberada" as const : "aguardando_diretoria" as const };
}

async function addProposalEvent(input: {
  proposalId: string;
  kind: string;
  listPrice: number;
  negotiatedPrice: number;
  marginPercent: number;
  note?: string | null;
  actor: ReturnType<typeof actorOf>;
  at?: Date;
}) {
  const { error } = await supabaseAdmin.from("patrimonial_proposal_events").insert({
    proposal_id: input.proposalId,
    kind: input.kind,
    list_price: roundMoney(input.listPrice),
    negotiated_price: roundMoney(input.negotiatedPrice),
    margin_percent: input.marginPercent,
    note: input.note || null,
    actor_id: input.actor.actor_id,
    actor_name: input.actor.actor_name,
    actor_role: input.actor.actor_role,
    created_at: (input.at || new Date()).toISOString(),
  });
  if (error) throw error;
}

async function rememberIss(cityName: string, uf: string, issPercent: number, ibgeCode?: string | null) {
  const cityKey = fold(cityName);
  const { error } = await supabaseAdmin.from("patrimonial_iss_cities").upsert({
    city_key: cityKey,
    city_name: cityName.trim(),
    uf,
    ibge_code: ibgeCode || null,
    iss_percent: issPercent,
  }, { onConflict: "city_key,uf" });
  if (error) throw error;
}

export function registerPatrimonialPricingRoutes(app: Express) {
  app.get("/api/patrimonial/precificacao", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const matrix = await loadMatrix();
      if (!matrix) return res.status(404).json({ message: "Matriz patrimonial ainda não criada" });
      const { data: roles, error } = await supabaseAdmin
        .from("patrimonial_roles")
        .select(ROLE_COLUMNS)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      res.json({
        matrix: matrixDto(matrix),
        roles: (roles || []).map(roleDto),
        scales: PATRIMONIAL_SCALES,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/patrimonial/precificacao/matriz", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const current = await loadMatrix();
      if (!current) return res.status(404).json({ message: "Matriz patrimonial ainda não criada" });
      const uf = String(req.body?.uf || "SP").toUpperCase();
      if (!UFS.includes(uf)) return res.status(400).json({ message: "UF inválida" });
      const city = String(req.body?.city || "").trim();
      if (!city) return res.status(400).json({ message: "Informe a cidade" });
      const payload = {
        city,
        uf,
        iss_percent: num(req.body?.issPercent, "ISS", { max: 5 }),
        pis_percent: num(req.body?.pisPercent, "PIS", { max: 100 }),
        cofins_percent: num(req.body?.cofinsPercent, "COFINS", { max: 100 }),
        taxa_adm_percent: num(req.body?.taxaAdmPercent, "Taxa administrativa", { max: 100 }),
        lucro_percent: num(req.body?.lucroPercent, "Lucro", { max: 100 }),
        periculosidade_percent: num(req.body?.periculosidadePercent, "Periculosidade", { max: 100 }),
        night_hours: num(req.body?.nightHours, "Horas noturnas", { max: 24 }),
        night_percent: num(req.body?.nightPercent, "Adicional noturno", { max: 100 }),
        dsr_percent: num(req.body?.dsrPercent, "DSR", { max: 100 }),
        he60_percent: num(req.body?.he60Percent, "Hora extra 60%", { max: 300 }),
        he100_percent: num(req.body?.he100Percent, "Hora extra 100%", { max: 300 }),
        holiday_percent: num(req.body?.holidayPercent, "Feriado", { max: 300 }),
        hour_divisor: num(req.body?.hourDivisor, "Divisor de horas", { min: 1, max: 400 }),
        vr_daily: num(req.body?.vrDaily, "VR"),
        vr_discount_percent: num(req.body?.vrDiscountPercent, "Desconto de VR", { max: 100 }),
        convenio: num(req.body?.convenio, "Convênio"),
        va_complement: num(req.body?.vaComplement, "VA complementar"),
        life_insurance: num(req.body?.lifeInsurance, "Seguro de vida"),
        vt_daily: num(req.body?.vtDaily, "VT"),
        vt_discount_percent: num(req.body?.vtDiscountPercent, "Desconto de VT", { max: 100 }),
        uniform_unarmed: num(req.body?.uniformUnarmed, "Uniforme"),
        uniform_armed: num(req.body?.uniformArmed, "Uniforme armado"),
        analise_risco: num(req.body?.analiseRisco, "Análise de risco"),
        reciclagem: num(req.body?.reciclagem, "Reciclagem"),
        rh: num(req.body?.rh, "RH"),
        ppra: num(req.body?.ppra, "PPRA/PCMSO"),
        ajuda_custo: num(req.body?.ajudaCusto, "Ajuda de custo"),
        ppr: num(req.body?.ppr, "PPR"),
        charge_items: rateItems(req.body?.chargeItems),
        provision_items: rateItems(req.body?.provisionItems),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from("patrimonial_pricing_matrix")
        .update(payload)
        .eq("id", current.id)
        .select("*")
        .single();
      if (error) throw error;
      await rememberIss(city, uf, Number(payload.iss_percent));
      res.json(matrixDto(data));
    } catch (err: any) {
      const status = String(err.message || "").includes("inválido") || String(err.message || "").includes("faixa") ? 400 : 500;
      res.status(status).json({ message: err.message });
    }
  });

  app.put("/api/patrimonial/precificacao/cargos", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
      if (roles.length === 0) return res.status(400).json({ message: "Informe ao menos um cargo" });
      const cleaned = roles.map((role: any, index: number) => ({
        id: role.id ? String(role.id) : undefined,
        name: String(role.name || "").trim(),
        salary: num(role.salary, "Salário"),
        sort_order: index + 1,
        scale: roleScale(role.scale),
        armed: Boolean(role.armed),
        night: Boolean(role.night),
        interval_indenizado: Boolean(role.intervalIndenizado),
        gratification_percent: num(role.gratificationPercent ?? 0, "Gratificação", { max: 100 }),
        he60_hours: num(role.he60Hours ?? 0, "Horas 60%", { max: 400 }),
        he100_hours: num(role.he100Hours ?? 0, "Horas 100%", { max: 400 }),
        holiday_hours: num(role.holidayHours ?? 0, "Horas de feriado", { max: 400 }),
        holiday_dsr: Boolean(role.holidayDsr),
      })).filter((role: { name: string }) => role.name);
      if (cleaned.length === 0) return res.status(400).json({ message: "Informe ao menos um cargo" });

      const { data: existing, error: listError } = await supabaseAdmin.from("patrimonial_roles").select("id");
      if (listError) throw listError;
      const keep = new Set(cleaned.map((role: { id?: string }) => role.id).filter(Boolean));
      const remove = (existing || []).map((row) => String(row.id)).filter((id) => !keep.has(id));
      if (remove.length) {
        const { error } = await supabaseAdmin.from("patrimonial_roles").delete().in("id", remove);
        if (error) throw error;
      }
      for (const role of cleaned) {
        if (role.id) {
          const { error } = await supabaseAdmin.from("patrimonial_roles").update({
            name: role.name,
            salary: role.salary,
            sort_order: role.sort_order,
            scale: role.scale,
            armed: role.armed,
            night: role.night,
            interval_indenizado: role.interval_indenizado,
            gratification_percent: role.gratification_percent,
            he60_hours: role.he60_hours,
            he100_hours: role.he100_hours,
            holiday_hours: role.holiday_hours,
            holiday_dsr: role.holiday_dsr,
          }).eq("id", role.id);
          if (error) throw error;
        } else {
          const { error } = await supabaseAdmin.from("patrimonial_roles").insert({
            name: role.name,
            salary: role.salary,
            sort_order: role.sort_order,
            scale: role.scale,
            armed: role.armed,
            night: role.night,
            interval_indenizado: role.interval_indenizado,
            gratification_percent: role.gratification_percent,
            he60_hours: role.he60_hours,
            he100_hours: role.he100_hours,
            holiday_hours: role.holiday_hours,
            holiday_dsr: role.holiday_dsr,
          });
          if (error) throw error;
        }
      }
      const { data, error } = await supabaseAdmin
        .from("patrimonial_roles")
        .select(ROLE_COLUMNS)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      res.json((data || []).map(roleDto));
    } catch (err: any) {
      const status = String(err.message || "").includes("inválido") || String(err.message || "").includes("faixa") ? 400 : 500;
      res.status(status).json({ message: err.message });
    }
  });

  app.get("/api/patrimonial/iss", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const cityName = String(req.query.cidade || "").trim();
      const uf = String(req.query.uf || "SP").toUpperCase();
      if (!cityName) return res.status(400).json({ message: "Informe a cidade" });
      if (!UFS.includes(uf)) return res.status(400).json({ message: "UF inválida" });
      const cityKey = fold(cityName);

      const { data: saved, error } = await supabaseAdmin
        .from("patrimonial_iss_cities")
        .select("city_name, uf, ibge_code, iss_percent")
        .eq("city_key", cityKey)
        .eq("uf", uf)
        .maybeSingle();
      if (error) throw error;

      let ibgeName: string | null = null;
      let ibgeCode: string | null = saved?.ibge_code ? String(saved.ibge_code) : null;
      try {
        const response = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`);
        if (response.ok) {
          const cities = await response.json() as Array<{ nome: string; codigo_ibge: string }>;
          const match = cities.find((city) => fold(city.nome) === cityKey);
          if (match) {
            ibgeName = match.nome;
            ibgeCode = String(match.codigo_ibge);
          }
        }
      } catch {
        ibgeName = null;
      }

      if (saved) {
        return res.json({
          city: ibgeName || String(saved.city_name),
          uf,
          ibgeCode,
          issPercent: Number(saved.iss_percent),
          source: "cadastro",
          message: "ISS deste município já está cadastrado.",
        });
      }

      if (!ibgeName) {
        return res.json({
          city: cityName,
          uf,
          ibgeCode: null,
          issPercent: null,
          source: "informe",
          message: "Cidade não encontrada nessa UF. Confira o nome ou informe o ISS.",
        });
      }

      res.json({
        city: ibgeName,
        uf,
        ibgeCode,
        issPercent: null,
        source: "informe",
        message: "Cidade confirmada no IBGE. Não existe API pública de alíquota de ISS. Informe o percentual e ele fica salvo para a próxima consulta.",
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/patrimonial/precificacao/propostas", requireAuth, requireAdminRole, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("patrimonial_price_proposals")
        .select("id, client_id, client_name, city, uf, iss_percent, total_price, list_price, negotiated_price, margin_percent, status, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      res.json((data || []).map(proposalListDto));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/patrimonial/precificacao/propostas/:id", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("patrimonial_price_proposals")
        .select("id, client_id, client_name, city, uf, iss_percent, lines, total_cost, total_tax, total_margin, total_price, list_price, negotiated_price, margin_percent, status, released_at, created_at")
        .eq("id", req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Proposta não encontrada" });
      const { data: events, error: eventError } = await supabaseAdmin
        .from("patrimonial_proposal_events")
        .select("id, kind, negotiated_price, margin_percent, note, actor_name, actor_role, created_at")
        .eq("proposal_id", req.params.id)
        .order("created_at", { ascending: true });
      if (eventError) throw eventError;
      res.json({
        ...proposalListDto(data),
        lines: Array.isArray(data.lines) ? data.lines : [],
        totalCost: Number(data.total_cost),
        totalTax: Number(data.total_tax),
        totalMargin: Number(data.total_margin),
        releasedAt: data.released_at ? String(data.released_at) : null,
        events: (events || []).map((row) => ({
          id: String(row.id),
          kind: String(row.kind),
          negotiatedPrice: row.negotiated_price == null ? null : Number(row.negotiated_price),
          marginPercent: row.margin_percent == null ? null : Number(row.margin_percent),
          note: row.note ? String(row.note) : "",
          actorName: String(row.actor_name || ""),
          actorRole: String(row.actor_role || ""),
          createdAt: String(row.created_at || ""),
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/patrimonial/precificacao/propostas", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const clientId = Number(req.body?.clientId);
      let clientName = String(req.body?.clientName || "").trim();
      if (Number.isInteger(clientId) && clientId > 0) {
        const { data: client, error: clientError } = await supabaseAdmin
          .from("clients")
          .select("id, name, nome_fantasia, razao_social, status")
          .eq("id", clientId)
          .maybeSingle();
        if (clientError) throw clientError;
        if (!client) return res.status(400).json({ message: "Cliente não encontrado no cadastro" });
        if (String(client.status || "ativo") === "inativo") return res.status(400).json({ message: "Cliente inativo no cadastro" });
        clientName = String(client.nome_fantasia || client.name || client.razao_social || "").trim();
      }
      const city = String(req.body?.city || "").trim();
      const uf = String(req.body?.uf || "SP").toUpperCase();
      if (!clientName) return res.status(400).json({ message: "Selecione um cliente do cadastro" });
      if (!city) return res.status(400).json({ message: "Informe a cidade" });
      if (!UFS.includes(uf)) return res.status(400).json({ message: "UF inválida" });
      const issPercent = num(req.body?.issPercent, "ISS", { max: 5 });
      const matrixRow = await loadMatrix();
      if (!matrixRow) return res.status(404).json({ message: "Salve a matriz antes de gerar a proposta" });
      const params = paramsFromRow(matrixRow);
      params.issRate = issPercent / 100;

      const { data: roles, error: roleError } = await supabaseAdmin.from("patrimonial_roles").select(ROLE_COLUMNS);
      if (roleError) throw roleError;
      const roleById = new Map((roles || []).map((role) => [String(role.id), role]));
      const incoming = Array.isArray(req.body?.lines) ? req.body.lines : [];
      if (incoming.length === 0) return res.status(400).json({ message: "Inclua ao menos uma função" });

      const calculated = incoming.map((line: any) => {
        const role = roleById.get(String(line.roleId || ""));
        if (!role) throw new Error("Cargo não encontrado na matriz");
        const saved = roleDto(role);
        const input: PatrimonialPostInput = {
          salary: saved.salary,
          gratificationRate: saved.gratificationPercent / 100,
          armed: saved.armed,
          night: saved.night,
          scale: saved.scale,
          posts: num(line.posts, "Postos", { min: 0, max: 999 }),
          intervalIndenizado: saved.intervalIndenizado,
          he60Hours: saved.he60Hours,
          he100Hours: saved.he100Hours,
          holidayHours: saved.holidayHours,
          holidayDsr: saved.holidayDsr,
        };
        const result = calcPatrimonialPost(input, params);
        return {
          roleId: String(role.id),
          roleName: String(role.name),
          functionLabel: String(line.functionLabel || role.name),
          ...input,
          gratificationPercent: input.gratificationRate * 100,
          ...result,
        };
      });
      const totals = sumPatrimonialLines(calculated);
      const requestedPrice = req.body?.negotiatedPrice;
      const negotiatedPrice = requestedPrice == null || requestedPrice === ""
        ? totals.totalPrice
        : num(requestedPrice, "Preço negociado", { min: 0.01 });
      const deal = quoteNegotiation(totals.totalCost, negotiatedPrice, params);
      const now = new Date();
      await rememberIss(city, uf, issPercent);

      const { data, error } = await supabaseAdmin.from("patrimonial_price_proposals").insert({
        client_id: Number.isInteger(clientId) && clientId > 0 ? clientId : null,
        client_name: clientName,
        city,
        uf,
        iss_percent: issPercent,
        lines: calculated,
        total_cost: totals.totalCost,
        total_tax: deal.quoted.taxValue,
        total_margin: roundMoney(deal.quoted.taxaAdmValue + deal.quoted.lucroValue),
        total_price: roundMoney(negotiatedPrice),
        list_price: totals.totalPrice,
        negotiated_price: roundMoney(negotiatedPrice),
        margin_percent: deal.quoted.lucroPercent,
        status: deal.status,
        released_at: deal.status === "liberada" ? now.toISOString() : null,
        released_by: deal.status === "liberada" ? req.user?.id ?? null : null,
        created_by: req.user?.id ?? null,
      }).select("id, client_id, client_name, city, uf, iss_percent, total_price, list_price, negotiated_price, margin_percent, status, created_at").single();
      if (error) throw error;
      const actor = actorOf(req);
      await addProposalEvent({
        proposalId: String(data.id),
        kind: "criada",
        listPrice: totals.totalPrice,
        negotiatedPrice,
        marginPercent: deal.quoted.lucroPercent,
        actor,
        at: now,
      });
      if (deal.status === "liberada") {
        await addProposalEvent({
          proposalId: String(data.id),
          kind: "liberada_automatica",
          listPrice: totals.totalPrice,
          negotiatedPrice,
          marginPercent: deal.quoted.lucroPercent,
          actor,
          at: new Date(now.getTime() + 1000),
        });
      }
      res.status(201).json({ ...proposalListDto(data), lines: calculated, totalCost: totals.totalCost });
    } catch (err: any) {
      const message = String(err.message || "");
      const status = message.includes("inválido") || message.includes("faixa") || message.includes("não") || message.includes("Escala") ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  app.post("/api/patrimonial/precificacao/propostas/:id/preco", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const { data: current, error: loadError } = await supabaseAdmin
        .from("patrimonial_price_proposals")
        .select("id, total_cost, iss_percent, list_price, status")
        .eq("id", req.params.id)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!current) return res.status(404).json({ message: "Proposta não encontrada" });
      const negotiatedPrice = num(req.body?.negotiatedPrice, "Preço negociado", { min: 0.01 });
      const note = String(req.body?.note || "").trim().slice(0, 500);
      const matrixRow = await loadMatrix();
      if (!matrixRow) return res.status(404).json({ message: "Salve a matriz antes de negociar a proposta" });
      const params = paramsFromRow(matrixRow);
      params.issRate = Number(current.iss_percent) / 100;
      const deal = quoteNegotiation(Number(current.total_cost), negotiatedPrice, params);
      const previousStatus = String(current.status || "aguardando_diretoria");
      const now = new Date();
      const releasedNow = previousStatus !== "liberada" && deal.status === "liberada";
      const reopened = previousStatus === "liberada" && deal.status === "aguardando_diretoria";
      const patch: Record<string, unknown> = {
        negotiated_price: roundMoney(negotiatedPrice),
        total_price: roundMoney(negotiatedPrice),
        total_tax: deal.quoted.taxValue,
        total_margin: roundMoney(deal.quoted.taxaAdmValue + deal.quoted.lucroValue),
        margin_percent: deal.quoted.lucroPercent,
        status: deal.status,
      };
      if (releasedNow) {
        patch.released_at = now.toISOString();
        patch.released_by = req.user?.id ?? null;
      } else if (reopened) {
        patch.released_at = null;
        patch.released_by = null;
      }
      const { data, error } = await supabaseAdmin.from("patrimonial_price_proposals").update(patch).eq("id", req.params.id)
        .select("id, client_id, client_name, city, uf, iss_percent, total_price, list_price, negotiated_price, margin_percent, status, created_at").single();
      if (error) throw error;
      const actor = actorOf(req);
      await addProposalEvent({ proposalId: String(current.id), kind: "preco_negociado", listPrice: Number(current.list_price), negotiatedPrice, marginPercent: deal.quoted.lucroPercent, note, actor, at: now });
      if (releasedNow) await addProposalEvent({ proposalId: String(current.id), kind: "liberada_automatica", listPrice: Number(current.list_price), negotiatedPrice, marginPercent: deal.quoted.lucroPercent, actor, at: new Date(now.getTime() + 1000) });
      if (reopened) await addProposalEvent({ proposalId: String(current.id), kind: "reaberta_diretoria", listPrice: Number(current.list_price), negotiatedPrice, marginPercent: deal.quoted.lucroPercent, actor, at: new Date(now.getTime() + 1000) });
      res.json(proposalListDto(data));
    } catch (err: any) {
      const message = String(err.message || "");
      const status = message.includes("inválido") || message.includes("faixa") || message.includes("não") ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  app.post("/api/patrimonial/precificacao/propostas/:id/liberar", requireAuth, requireDiretoriaStrict, async (req, res) => {
    try {
      const { data: current, error: loadError } = await supabaseAdmin
        .from("patrimonial_price_proposals")
        .select("id, list_price, negotiated_price, margin_percent, status")
        .eq("id", req.params.id)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!current) return res.status(404).json({ message: "Proposta não encontrada" });
      if (String(current.status) === "liberada") return res.status(400).json({ message: "Esta proposta já está liberada." });
      const mode = patrimonialReleaseMode(Number(current.margin_percent));
      if (mode === "bloqueado") return res.status(400).json({ message: "Margem de lucro abaixo de 5%. A proposta não pode ser liberada." });
      if (mode === "automatica") return res.status(400).json({ message: "Margem acima de 10% libera sozinha. Atualize o preço." });
      const now = new Date();
      const { data, error } = await supabaseAdmin.from("patrimonial_price_proposals").update({
        status: "liberada",
        released_at: now.toISOString(),
        released_by: req.user?.id ?? null,
      }).eq("id", req.params.id).select("id, client_id, client_name, city, uf, iss_percent, total_price, list_price, negotiated_price, margin_percent, status, created_at").single();
      if (error) throw error;
      await addProposalEvent({
        proposalId: String(current.id),
        kind: "liberada_diretoria",
        listPrice: Number(current.list_price),
        negotiatedPrice: Number(current.negotiated_price),
        marginPercent: Number(current.margin_percent),
        actor: actorOf(req),
        at: now,
      });
      res.json(proposalListDto(data));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
