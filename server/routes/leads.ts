import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "../supabase";
import { requireAdminRole } from "../auth";
import { createSmtpTransporter, getSmtpFrom, nowBRTString } from "./_helpers";

const LEAD_STATUSES = ["novo", "contatado", "qualificado", "proposta_enviada", "negociacao", "ganho", "perdido", "descartado"] as const;
const SETORES_ALVO = [
  "Transportadora", "Logística", "Atacadista", "Centro de Distribuição",
  "Indústria Farmacêutica", "Transporte de Valores", "E-commerce", "Varejo",
  "Agronegócio", "Indústria Alimentícia", "Distribuidora", "Armazém Geral",
];
const ORIGENS = ["google_places", "indicacao", "site", "telefone", "email", "evento", "rede_social", "prospecao_ativa", "outro"] as const;

const SCORING_SETOR: Record<string, number> = {
  "Transporte de Valores": 10,
  "Indústria Farmacêutica": 10,
  "Transportadora": 9,
  "Logística": 8,
  "Centro de Distribuição": 8,
  "E-commerce": 7,
  "Distribuidora": 7,
  "Atacadista": 7,
  "Armazém Geral": 6,
  "Indústria Alimentícia": 6,
  "Agronegócio": 5,
  "Varejo": 4,
};
const ZONAS_RISCO = ["Cajamar", "Guarulhos", "Campinas", "Santos", "Dutra", "Raposo", "Castelo Branco", "Anhanguera", "Bandeirantes", "Fernão Dias", "Régis Bittencourt", "Anchieta", "Imigrantes", "Barueri", "Osasco", "Jundiaí", "Embu"];

function calcLeadScore(setor?: string, endereco?: string, temperatura?: string, valor_estimado?: number): number {
  let score = SCORING_SETOR[setor || ""] || 3;
  const addr = (endereco || "").toLowerCase();
  for (const zona of ZONAS_RISCO) {
    if (addr.includes(zona.toLowerCase())) { score += 2; break; }
  }
  if (temperatura === "quente") score += 3;
  else if (temperatura === "morno") score += 1;
  if ((valor_estimado || 0) >= 50000) score += 2;
  else if ((valor_estimado || 0) >= 20000) score += 1;
  return Math.min(score, 15);
}

async function ensureLeadsTable() {
  const { error } = await supabaseAdmin.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        empresa TEXT NOT NULL,
        cnpj TEXT,
        contato_nome TEXT,
        contato_cargo TEXT,
        telefone TEXT,
        email TEXT,
        website TEXT,
        endereco TEXT,
        cidade TEXT DEFAULT 'São Paulo',
        estado TEXT DEFAULT 'SP',
        cep TEXT,
        setor TEXT,
        origem TEXT DEFAULT 'prospecao_ativa',
        status TEXT DEFAULT 'novo',
        temperatura TEXT DEFAULT 'frio',
        valor_estimado REAL DEFAULT 0,
        notas TEXT,
        motivo_perda TEXT,
        proximo_contato TIMESTAMP,
        ultimo_contato TIMESTAMP,
        responsavel TEXT,
        responsavel_id INTEGER,
        google_place_id TEXT,
        google_rating REAL,
        google_total_reviews INTEGER,
        tags TEXT[],
        historico JSONB DEFAULT '[]'::jsonb,
        emails_enviados INTEGER DEFAULT 0,
        convertido_client_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_setor ON leads(setor);
      CREATE INDEX IF NOT EXISTS idx_leads_cidade ON leads(cidade);
    `,
  });
  if (error) {
    console.log("[leads] Table creation via RPC failed, trying direct:", error.message);
    await supabaseAdmin.from("leads").select("id").limit(1);
  }
}

export function registerLeadRoutes(app: Express) {
  ensureLeadsTable().then(() => console.log("[leads] Tabela leads verificada"));

  app.get("/api/leads", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const withScore = (data || []).map((l: any) => ({
        ...l,
        score: calcLeadScore(l.setor, l.endereco, l.temperatura, l.valor_estimado),
      }));
      res.json(withScore);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/stats", requireAdminRole, async (_req: Request, res: Response) => {
    try {
      const { data, error } = await supabaseAdmin.from("leads").select("status, temperatura, valor_estimado, setor, origem");
      if (error) throw error;
      const leads = data || [];
      const byStatus: Record<string, number> = {};
      const byTemp: Record<string, number> = {};
      const bySetor: Record<string, number> = {};
      const byOrigem: Record<string, number> = {};
      let totalValor = 0;
      let totalGanho = 0;
      for (const l of leads) {
        byStatus[l.status] = (byStatus[l.status] || 0) + 1;
        byTemp[l.temperatura] = (byTemp[l.temperatura] || 0) + 1;
        bySetor[l.setor || "Outro"] = (bySetor[l.setor || "Outro"] || 0) + 1;
        byOrigem[l.origem || "outro"] = (byOrigem[l.origem || "outro"] || 0) + 1;
        totalValor += Number(l.valor_estimado || 0);
        if (l.status === "ganho") totalGanho += Number(l.valor_estimado || 0);
      }
      res.json({ total: leads.length, byStatus, byTemp, bySetor, byOrigem, totalValor, totalGanho });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const body = req.body;
      const historico = [{
        data: nowBRTString(),
        acao: "Lead criado",
        usuario: user?.name || "Sistema",
        detalhes: `Origem: ${body.origem || "manual"}`,
      }];
      const { data, error } = await supabaseAdmin.from("leads").insert({
        ...body,
        responsavel: body.responsavel || user?.name,
        responsavel_id: body.responsavel_id || user?.id,
        historico,
        created_at: nowBRTString(),
        updated_at: nowBRTString(),
      }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/leads/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const body = req.body;

      const { data: existing } = await supabaseAdmin.from("leads").select("historico, status").eq("id", id).single();
      const hist = Array.isArray(existing?.historico) ? [...existing.historico] : [];

      if (body.status && body.status !== existing?.status) {
        hist.push({
          data: nowBRTString(),
          acao: `Status alterado: ${existing?.status} → ${body.status}`,
          usuario: user?.name || "Sistema",
          detalhes: body.motivo_perda ? `Motivo: ${body.motivo_perda}` : undefined,
        });
      }
      if (body._nota) {
        hist.push({
          data: nowBRTString(),
          acao: "Nota adicionada",
          usuario: user?.name || "Sistema",
          detalhes: body._nota,
        });
        delete body._nota;
      }

      const { data, error } = await supabaseAdmin.from("leads").update({
        ...body,
        historico: hist,
        updated_at: nowBRTString(),
      }).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/leads/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { error } = await supabaseAdmin.from("leads").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/:id/enviar-apresentacao", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const { data: lead, error } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
      if (error || !lead) return res.status(404).json({ error: "Lead não encontrado" });
      if (!lead.email) return res.status(400).json({ error: "Lead não possui e-mail cadastrado" });

      const transporter = createSmtpTransporter();
      if (!transporter) return res.status(500).json({ error: "SMTP não configurado" });

      const html = `
<!DOCTYPE html>
<html><body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;background:#f8f9fa;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1a1a2e;padding:30px 20px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:1px;">TORRES VIGILÂNCIA PATRIMONIAL</h1>
    <p style="color:#a0a0c0;font-size:12px;margin:8px 0 0;">CNPJ 36.982.392/0001-89</p>
  </div>
  <div style="background:#fff;padding:30px 24px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <p style="color:#333;font-size:15px;line-height:1.7;">
      Prezado(a) <strong>${lead.contato_nome || "Responsável"}</strong>,
    </p>
    <p style="color:#555;font-size:14px;line-height:1.7;">
      A <strong>Torres Vigilância Patrimonial</strong> é especializada em <strong>Escolta Armada Caracterizada</strong> 
      para operações de logística, transporte de cargas e valores no estado de São Paulo.
    </p>
    <div style="background:#f0f4ff;border-left:4px solid #1a1a2e;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
      <p style="color:#1a1a2e;font-weight:bold;margin:0 0 8px;font-size:14px;">Nossos Diferenciais:</p>
      <ul style="color:#444;font-size:13px;line-height:2;padding-left:20px;margin:0;">
        <li>Viaturas blindadas e caracterizadas com rastreamento em tempo real</li>
        <li>Agentes com treinamento especializado e armamento regulamentado</li>
        <li>Monitoramento 24h via central de operações</li>
        <li>Cobertura completa no estado de São Paulo</li>
        <li>Relatórios operacionais digitais com fotos e geolocalização</li>
        <li>Seguro de responsabilidade civil</li>
      </ul>
    </div>
    <p style="color:#555;font-size:14px;line-height:1.7;">
      Gostaríamos de apresentar nossos serviços e demonstrar como podemos agregar segurança 
      às operações da <strong>${lead.empresa}</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="mailto:escolta@torresseguranca.com.br?subject=Interesse%20em%20Escolta%20-%20${encodeURIComponent(lead.empresa)}" 
         style="display:inline-block;background:#1a1a2e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        SOLICITAR PROPOSTA COMERCIAL
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <div style="text-align:center;">
      <p style="color:#888;font-size:12px;margin:4px 0;"><strong>Torres Vigilância Patrimonial</strong></p>
      <p style="color:#999;font-size:11px;margin:2px 0;">📞 (11) 96369-6699 | ✉️ escolta@torresseguranca.com.br</p>
      <p style="color:#999;font-size:11px;margin:2px 0;">🌐 www.torresseguranca.com.br</p>
    </div>
  </div>
</div>
</body></html>`;

      await transporter.sendMail({
        from: getSmtpFrom(),
        to: lead.email,
        subject: `Torres Vigilância Patrimonial — Segurança para ${lead.empresa}`,
        html,
      });

      const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];
      hist.push({
        data: nowBRTString(),
        acao: "Apresentação enviada por e-mail",
        usuario: user?.name || "Sistema",
        detalhes: `E-mail enviado para ${lead.email}`,
      });

      await supabaseAdmin.from("leads").update({
        emails_enviados: (lead.emails_enviados || 0) + 1,
        ultimo_contato: nowBRTString(),
        status: lead.status === "novo" ? "contatado" : lead.status,
        historico: hist,
        updated_at: nowBRTString(),
      }).eq("id", id);

      res.json({ ok: true, message: `Apresentação enviada para ${lead.email}` });
    } catch (err: any) {
      console.error("[leads] Erro envio apresentação:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/:id/converter", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;
      const { data: lead } = await supabaseAdmin.from("leads").select("*").eq("id", id).single();
      if (!lead) return res.status(404).json({ error: "Lead não encontrado" });

      const { data: existingClient } = await supabaseAdmin.from("clients")
        .select("id")
        .eq("cnpj", lead.cnpj || "")
        .maybeSingle();

      if (existingClient) {
        await supabaseAdmin.from("leads").update({
          status: "ganho",
          convertido_client_id: existingClient.id,
          updated_at: nowBRTString(),
        }).eq("id", id);
        return res.json({ clientId: existingClient.id, existing: true });
      }

      const { data: newClient, error: clientErr } = await supabaseAdmin.from("clients").insert({
        name: lead.empresa,
        cnpj: lead.cnpj || null,
        address: lead.endereco || null,
        city: lead.cidade || "São Paulo",
        state: lead.estado || "SP",
        zip: lead.cep || null,
        phone: lead.telefone || null,
        email: lead.email || null,
        contact_person: lead.contato_nome || null,
        segment: lead.setor || null,
      }).select().single();
      if (clientErr) throw clientErr;

      const hist = Array.isArray(lead.historico) ? [...lead.historico] : [];
      hist.push({
        data: nowBRTString(),
        acao: "Convertido em cliente",
        usuario: user?.name || "Sistema",
        detalhes: `Cliente #${newClient.id} criado`,
      });

      await supabaseAdmin.from("leads").update({
        status: "ganho",
        convertido_client_id: newClient.id,
        historico: hist,
        updated_at: nowBRTString(),
      }).eq("id", id);

      res.json({ clientId: newClient.id, existing: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/leads/setores", requireAdminRole, async (_req: Request, res: Response) => {
    res.json({ setores: SETORES_ALVO, origens: ORIGENS, statuses: LEAD_STATUSES });
  });

  app.post("/api/leads/buscar-google", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { setor, cidade, estado } = req.body;
      const query = `${setor} ${cidade || "São Paulo"} ${estado || "SP"}`;

      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.json({ results: [], message: "Google Maps API key não configurada. Cadastre leads manualmente." });
      }

      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=pt-BR&key=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.status !== "OK") {
        return res.json({ results: [], message: `Google Places: ${data.status}` });
      }

      const results = (data.results || []).slice(0, 20).map((place: any) => ({
        empresa: place.name,
        endereco: place.formatted_address,
        google_place_id: place.place_id,
        google_rating: place.rating,
        google_total_reviews: place.user_ratings_total,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
      }));

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/leads/importar-google", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { leads: leadsToImport, setor, origem } = req.body;
      const user = (req as any).user;
      let imported = 0;
      let duplicates = 0;

      for (const lead of leadsToImport) {
        if (lead.google_place_id) {
          const { data: existing } = await supabaseAdmin.from("leads")
            .select("id").eq("google_place_id", lead.google_place_id).maybeSingle();
          if (existing) { duplicates++; continue; }
        }

        const hist = [{
          data: nowBRTString(),
          acao: "Importado do Google Places",
          usuario: user?.name || "Sistema",
          detalhes: `Setor: ${setor}`,
        }];

        await supabaseAdmin.from("leads").insert({
          empresa: lead.empresa,
          endereco: lead.endereco,
          cidade: lead.cidade || "São Paulo",
          estado: lead.estado || "SP",
          setor: setor || null,
          origem: origem || "google_places",
          google_place_id: lead.google_place_id,
          google_rating: lead.google_rating,
          google_total_reviews: lead.google_total_reviews,
          responsavel: user?.name,
          responsavel_id: user?.id,
          historico: hist,
          created_at: nowBRTString(),
          updated_at: nowBRTString(),
        });
        imported++;
      }

      res.json({ imported, duplicates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[leads] Rotas de prospecção/CRM registradas");
}
