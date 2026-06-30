import type { Express } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabase";
import { requireAuth, requireAdminRole } from "../auth";
import { toCamelObj, toCamelArray } from "../storage";
import { notifyEmployeesDocBackground, notifyEmployeeDocSignedBackground } from "../lib/signable-doc-notify";
import {
  getTemplate,
  listTemplates,
  esc,
  formatCpfMask,
  DOC_TYPE_LABELS,
  type SignableDocType,
} from "../lib/signable-doc-templates";
import {
  uploadSignableImage,
  resolveSignableImage,
  downloadSignableImageDataUri,
} from "../lib/signable-doc-storage";

const TABLE = "employee_signable_documents";
const CNPJ = "36.982.392/0001-89";

// ===== Schemas Zod (validação forte das rotas novas) =====
const emitSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  documentType: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

const bulkSchema = z.object({
  employeeIds: z.array(z.coerce.number().int().positive()).min(1),
  documentType: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

const geoSchema = z
  .object({
    lat: z.number().optional(),
    lng: z.number().optional(),
    accuracy: z.number().optional(),
  })
  .partial()
  .optional();

export const signSchema = z
  .object({
    // formato novo WAF-safe (base64 cru + mime)
    facialFotoBase64: z.string().min(1).optional(),
    facialFotoMime: z.string().optional(),
    assinaturaBase64: z.string().min(1).optional(),
    assinaturaMime: z.string().optional(),
    // legado: data URI completo
    facialFoto: z.string().optional(),
    assinaturaDesenho: z.string().optional(),
    termoAceito: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar o termo de ciência" }) }),
    termoTexto: z.string().max(4000).optional(),
    geo: geoSchema,
  })
  .refine((d) => !!(d.facialFotoBase64 || d.facialFoto), { message: "Foto facial obrigatória", path: ["facialFotoBase64"] })
  .refine((d) => !!(d.assinaturaBase64 || d.assinaturaDesenho), { message: "Assinatura digital obrigatória", path: ["assinaturaBase64"] });

const dashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

function zodError(res: any, err: z.ZodError) {
  return res.status(400).json({ message: err.errors[0]?.message || "Dados inválidos", errors: err.errors });
}

function todayBrtIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function brtTimestamp(d: Date = new Date()): string {
  // ISO-like com offset BRT fixo (-03:00) para escrita no banco sem toISOString().
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
}

function brtDisplay(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(ts);
  }
}

/**
 * Aceita imagem em 2 formatos por causa do WAF (que bloqueia data:image em POST):
 *  - novo: { base64, mime } cru -> remonta data URI no server
 *  - legado: data URI completo
 * Retorna data URI ou null.
 */
function buildDataUri(rawBase64?: string | null, mime?: string | null, legacyDataUri?: string | null): string | null {
  if (legacyDataUri && /^data:image\//i.test(legacyDataUri)) return legacyDataUri;
  if (rawBase64 && typeof rawBase64 === "string") {
    const clean = rawBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (clean.length > 0) {
      const m = (mime && /^image\//i.test(mime)) ? mime : "image/jpeg";
      return `data:${m};base64,${clean}`;
    }
  }
  return null;
}

async function loadEmployeeMap(ids?: number[]): Promise<Map<number, any>> {
  let q = supabaseAdmin.from("employees").select("id, name, cpf, role, matricula, status, phone");
  if (ids && ids.length) q = q.in("id", ids);
  const { data } = await q;
  const map = new Map<number, any>();
  for (const e of data || []) map.set(e.id, e);
  return map;
}

function buildAuthenticatedHtml(doc: any, emp: any): string {
  const logoUrl = `${process.env.PUBLIC_SITE_URL || ""}/logo-torres-dark.jpeg`;
  const body = doc.content_html || "";
  const assinado = doc.assinatura_status === "assinado";
  const meta = doc.signature_metadata || {};
  const geo = meta.lat && meta.lng ? `${meta.lat}, ${meta.lng}` : "—";

  const authSheet = assinado
    ? `
      <div class="auth">
        <h2>Folha de Autenticação — Assinatura Eletrônica</h2>
        <div class="auth-grid">
          <div class="auth-imgs">
            ${doc.assinatura_facial_foto ? `<div class="auth-img"><span>Reconhecimento facial</span><img src="${doc.assinatura_facial_foto}" alt="facial" /></div>` : ""}
            ${doc.assinatura_desenho ? `<div class="auth-img"><span>Assinatura manuscrita</span><img class="sig" src="${doc.assinatura_desenho}" alt="assinatura" /></div>` : ""}
          </div>
          <table class="auth-meta">
            <tr><td>Signatário</td><td><b>${esc(emp?.name)}</b></td></tr>
            <tr><td>CPF</td><td>${esc(formatCpfMask(emp?.cpf))}</td></tr>
            <tr><td>Data/Hora (BRT)</td><td>${esc(brtDisplay(doc.assinado_em))}</td></tr>
            <tr><td>Endereço IP</td><td>${esc(doc.assinatura_ip || "—")}</td></tr>
            <tr><td>Geolocalização</td><td>${esc(geo)}</td></tr>
            <tr><td>Dispositivo</td><td class="ua">${esc(doc.assinatura_user_agent || "—")}</td></tr>
          </table>
        </div>
        <p class="termo">${esc(doc.assinatura_termo || "")}</p>
        <p class="legal">Assinatura eletrônica com validade jurídica nos termos da Lei 14.063/2020, MP 2.200-2/2001 e art. 219 do Código Civil.</p>
      </div>`
    : `
      <div class="assin">
        <p>Colaborador(a): <b>${esc(emp?.name)}</b></p>
        <p>Assinatura: _____________________________________</p>
        <p>Data: ______ / ______ / __________</p>
        <p class="pending-note">⚠ Documento ainda <b>NÃO assinado eletronicamente</b>.</p>
      </div>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(doc.title)} - ${esc(emp?.name)}</title><style>
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{font-family:'Times New Roman',serif;margin:0;padding:24px;color:#000;background:#fff}
    .folha{max-width:780px;margin:0 auto;border:2px solid #000;padding:40px 44px;box-sizing:border-box}
    .header{text-align:center;border-bottom:1px solid #999;padding-bottom:18px;margin-bottom:26px}
    .header img.logo{width:120px;height:auto;margin:0 auto 12px;display:block}
    .header h3{margin:0 0 4px;font-size:15px;text-transform:uppercase}
    .header .cnpj{font-size:11px;color:#333;margin:2px 0}
    h1{text-align:center;font-size:15px;text-transform:uppercase;line-height:1.4;margin:18px 0 24px}
    p{text-align:justify;font-size:13px;line-height:1.7;margin:12px 0}
    ul{font-size:13px;line-height:1.7;padding-left:22px;margin:10px 0}
    ul li{margin:7px 0;text-align:justify}
    .data{margin-top:30px;font-weight:bold}
    .assin{margin-top:34px;font-size:13px;line-height:2.2}
    .assin p{margin:6px 0;text-align:left}
    .pending-note{color:#b45309;font-weight:bold}
    .auth{margin-top:34px;border-top:2px dashed #999;padding-top:18px}
    .auth h2{font-size:13px;text-transform:uppercase;text-align:center;margin:0 0 16px}
    .auth-grid{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
    .auth-imgs{display:flex;gap:14px;flex-wrap:wrap}
    .auth-img{text-align:center}
    .auth-img span{display:block;font-size:10px;color:#555;margin-bottom:4px;text-transform:uppercase}
    .auth-img img{width:150px;height:150px;object-fit:cover;border:1px solid #000;border-radius:6px}
    .auth-img img.sig{height:90px;width:200px;object-fit:contain;background:#fff}
    .auth-meta{border-collapse:collapse;font-size:12px;flex:1;min-width:260px}
    .auth-meta td{border:1px solid #ccc;padding:5px 8px}
    .auth-meta td:first-child{font-weight:bold;background:#f5f5f5;white-space:nowrap}
    .auth-meta td.ua{font-size:9px;word-break:break-all}
    .termo{font-size:11px;color:#333;margin-top:14px;white-space:pre-line}
    .legal{font-size:10px;color:#666;margin-top:8px;text-align:center}
    @media print{body{padding:0}.folha{border:2px solid #000}}
  </style></head><body>
    <div class="folha">
      <div class="header">
        <img class="logo" src="${logoUrl}" alt="Torres" onerror="this.style.display='none'" />
        <h3>Torres Vigilância Patrimonial Ltda</h3>
        <p class="cnpj">CNPJ: ${CNPJ}</p>
      </div>
      ${body}
      ${authSheet}
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},400)};<\/script>
  </body></html>`;
}

export function registerSignableDocumentRoutes(app: Express) {
  // ===== Tipos de documento disponíveis (admin) =====
  app.get("/api/signable-documents/types", requireAuth, requireAdminRole, (_req, res) => {
    res.json(listTemplates());
  });

  // ===== Emitir documento (individual) — admin =====
  app.post("/api/signable-documents", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const parsed = emitSchema.safeParse(req.body || {});
      if (!parsed.success) return zodError(res, parsed.error);
      const { employeeId, documentType, title } = parsed.data;
      const empId = employeeId;
      const type = (documentType || "beneficio_flash") as SignableDocType;
      const tpl = getTemplate(type);

      const empMap = await loadEmployeeMap([empId]);
      const emp = empMap.get(empId);
      if (!emp) return res.status(404).json({ message: "Funcionário não encontrado" });

      // content_html é SEMPRE gerado pelo template (nunca aceitar HTML cru do request — evita XSS armazenado)
      const payload = {
        employee_id: empId,
        document_type: type,
        title: title || tpl.title,
        content_html: tpl.buildBodyHtml(emp),
        status: "pendente",
        assinatura_status: "pendente",
        created_by: req.user.id || null,
        created_by_name: req.user.name || null,
      };

      const { data, error } = await supabaseAdmin.from(TABLE).insert(payload).select().single();
      if (error) return res.status(500).json({ message: error.message });
      // Avisa o vigilante no WhatsApp (best-effort, em background — não segura a resposta).
      notifyEmployeesDocBackground([emp], data.title, false);
      res.json(toCamelObj(data));
    } catch (err: any) {
      console.error("[signable-docs:emit]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Emitir documento (lote) — admin =====
  app.post("/api/signable-documents/bulk", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const parsed = bulkSchema.safeParse(req.body || {});
      if (!parsed.success) return zodError(res, parsed.error);
      const { employeeIds, documentType, title } = parsed.data;
      const ids = Array.from(new Set(employeeIds));
      const type = (documentType || "beneficio_flash") as SignableDocType;
      const tpl = getTemplate(type);

      const empMap = await loadEmployeeMap(ids);
      const rows = ids
        .filter((id) => empMap.has(id))
        .map((id) => {
          const emp = empMap.get(id);
          return {
            employee_id: id,
            document_type: type,
            title: title || tpl.title,
            content_html: tpl.buildBodyHtml(emp),
            status: "pendente",
            assinatura_status: "pendente",
            created_by: req.user.id || null,
            created_by_name: req.user.name || null,
          };
        });
      if (!rows.length) return res.status(400).json({ message: "Nenhum funcionário válido" });

      const { data, error } = await supabaseAdmin.from(TABLE).insert(rows).select();
      if (error) return res.status(500).json({ message: error.message });
      // Avisa cada vigilante no WhatsApp (best-effort, em background com pacing anti-ban).
      const notifyEmps = (data || [])
        .map((d: any) => empMap.get(d.employee_id))
        .filter(Boolean);
      notifyEmployeesDocBackground(notifyEmps, title || tpl.title, false);
      res.json({ created: data?.length || 0, items: toCamelArray(data || []) });
    } catch (err: any) {
      console.error("[signable-docs:bulk]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Listar documentos (admin) — opcional ?employeeId= =====
  app.get("/api/signable-documents", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
      let q = supabaseAdmin
        .from(TABLE)
        .select("id, employee_id, document_type, title, status, assinatura_status, visualizado_em, assinado_em, reminder_count, last_reminder_at, created_by_name, created_at")
        .order("created_at", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q.limit(500);
      if (error) return res.status(500).json({ message: error.message });

      const empMap = await loadEmployeeMap();
      const items = (data || []).map((d: any) => ({
        ...toCamelObj(d),
        employeeName: empMap.get(d.employee_id)?.name || "—",
        employeeRole: empMap.get(d.employee_id)?.role || "",
      }));
      res.json(items);
    } catch (err: any) {
      console.error("[signable-docs:list]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Documentos do funcionário logado (mobile) =====
  app.get("/api/mobile/my-signable-documents", requireAuth, async (req: any, res) => {
    try {
      if (!req.user.employeeId) return res.json([]);
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .select("id, document_type, title, content_html, status, assinatura_status, visualizado_em, assinado_em, created_at")
        .eq("employee_id", req.user.employeeId)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ message: error.message });
      res.json(toCamelArray(data || []));
    } catch (err: any) {
      console.error("[signable-docs:my]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Marcar como visualizado (mobile) =====
  app.post("/api/signable-documents/:id/view", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin.from(TABLE).select("employee_id, status, assinatura_status").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Documento não encontrado" });
      const doc = rows[0];
      if (!req.user.employeeId || doc.employee_id !== req.user.employeeId) {
        return res.status(403).json({ message: "Documento não pertence a este funcionário" });
      }
      if (doc.assinatura_status !== "assinado" && doc.status === "pendente") {
        await supabaseAdmin.from(TABLE).update({ status: "visualizado", visualizado_em: brtTimestamp() }).eq("id", id);
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Funcionário assina documento =====
  app.post("/api/signable-documents/:id/sign", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = signSchema.safeParse(req.body || {});
      if (!parsed.success) return zodError(res, parsed.error);
      const {
        facialFotoBase64, facialFotoMime, assinaturaBase64, assinaturaMime,
        facialFoto, assinaturaDesenho, // legado (data URI)
        termoTexto, geo,
      } = parsed.data;

      const facialUri = buildDataUri(facialFotoBase64, facialFotoMime, facialFoto);
      const assinaturaUri = buildDataUri(assinaturaBase64, assinaturaMime, assinaturaDesenho);
      if (!facialUri) return res.status(400).json({ message: "Foto facial obrigatória" });
      if (!assinaturaUri) return res.status(400).json({ message: "Assinatura digital obrigatória" });

      const { data: rows } = await supabaseAdmin.from(TABLE).select("*").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Documento não encontrado" });
      const doc = rows[0];
      if (!req.user.employeeId || doc.employee_id !== req.user.employeeId) {
        return res.status(403).json({ message: "Documento não pertence a este funcionário" });
      }
      if (doc.assinatura_status === "assinado") {
        return res.status(400).json({ message: "Documento já assinado" });
      }

      // Sobe as evidências (facial/assinatura) pro bucket PRIVADO e grava o caminho.
      // Fallback: se o upload falhar, grava o data URI cru pra nunca perder a evidência jurídica.
      let facialStored = facialUri;
      let assinaturaStored = assinaturaUri;
      try {
        facialStored = await uploadSignableImage(id, "facial", facialUri, facialFotoMime);
      } catch (e: any) {
        console.warn(`[signable-docs:sign] upload facial falhou (fallback base64) doc#${id}:`, e?.message);
      }
      try {
        assinaturaStored = await uploadSignableImage(id, "assinatura", assinaturaUri, assinaturaMime || "image/png");
      } catch (e: any) {
        console.warn(`[signable-docs:sign] upload assinatura falhou (fallback base64) doc#${id}:`, e?.message);
      }

      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
      const ua = (req.headers["user-agent"] as string) || "";
      const metadata: any = { capturedAt: brtTimestamp() };
      if (geo && typeof geo === "object") {
        if (geo.lat != null) metadata.lat = geo.lat;
        if (geo.lng != null) metadata.lng = geo.lng;
        if (geo.accuracy != null) metadata.accuracy = geo.accuracy;
      }

      const { data: updated, error } = await supabaseAdmin
        .from(TABLE)
        .update({
          status: "assinado",
          assinatura_status: "assinado",
          assinado_em: brtTimestamp(),
          assinatura_facial_foto: facialStored,
          assinatura_desenho: assinaturaStored,
          assinatura_termo: termoTexto || "Declaro que li e estou de acordo com o conteúdo deste documento, reconhecendo a validade jurídica desta assinatura eletrônica nos termos da Lei 14.063/2020 e da MP 2.200-2/2001.",
          assinatura_ip: ip,
          assinatura_user_agent: ua,
          signature_metadata: metadata,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ message: error.message });
      // Confirmação ativa via WhatsApp ao próprio funcionário (best-effort, background).
      try {
        const empMap = await loadEmployeeMap([doc.employee_id]);
        const emp = empMap.get(doc.employee_id);
        if (emp) notifyEmployeeDocSignedBackground(emp, doc.title || updated?.title);
      } catch (e: any) {
        console.warn(`[signable-docs:sign] confirmação WhatsApp falhou doc#${id}:`, e?.message);
      }
      res.json(toCamelObj(updated));
    } catch (err: any) {
      console.error("[signable-docs:sign]", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Evidência da assinatura (admin) — inclui imagens =====
  app.get("/api/signable-documents/:id/signature", requireAuth, requireAdminRole, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin.from(TABLE).select("*").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Documento não encontrado" });
      const doc = toCamelObj(rows[0]) as any;
      // Resolve caminhos do bucket privado em signed URLs de curta duração (não vaza o caminho cru).
      doc.assinaturaFacialFoto = await resolveSignableImage(rows[0].assinatura_facial_foto);
      doc.assinaturaDesenho = await resolveSignableImage(rows[0].assinatura_desenho);
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== PDF / folha de autenticação (admin ou o próprio funcionário) =====
  app.get("/api/signable-documents/:id/pdf", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin.from(TABLE).select("*").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).send("Documento não encontrado");
      const doc = rows[0];

      const isAdmin = req.user.role === "admin" || req.user.role === "diretoria";
      const isOwner = req.user.employeeId && req.user.employeeId === doc.employee_id;
      if (!isAdmin && !isOwner) return res.status(403).send("Acesso negado");

      // PDF precisa ser auto-contido pro print → baixa as imagens do bucket como data URI.
      doc.assinatura_facial_foto = await downloadSignableImageDataUri(doc.assinatura_facial_foto);
      doc.assinatura_desenho = await downloadSignableImageDataUri(doc.assinatura_desenho);

      const empMap = await loadEmployeeMap([doc.employee_id]);
      const emp = empMap.get(doc.employee_id);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(buildAuthenticatedHtml(doc, emp));
    } catch (err: any) {
      console.error("[signable-docs:pdf]", err);
      res.status(500).send(err.message);
    }
  });

  // ===== Enviar lembrete (admin) — alerta in-app =====
  app.post("/api/signable-documents/:id/reminder", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const { data: rows } = await supabaseAdmin.from(TABLE).select("id, employee_id, title, assinatura_status, reminder_count").eq("id", id).limit(1);
      if (!rows?.length) return res.status(404).json({ message: "Documento não encontrado" });
      if (rows[0].assinatura_status === "assinado") return res.status(400).json({ message: "Documento já assinado" });
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .update({ reminder_count: (rows[0].reminder_count || 0) + 1, last_reminder_at: brtTimestamp() })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ message: error.message });
      // Lembrete ativo via WhatsApp (best-effort, em background).
      const empMap = await loadEmployeeMap([rows[0].employee_id]);
      const emp = empMap.get(rows[0].employee_id);
      if (emp) notifyEmployeesDocBackground([emp], rows[0].title || data.title, true);
      res.json(toCamelObj(data));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== Dashboard gerencial RH (admin) =====
  app.get("/api/hr/signable-documents/dashboard", requireAuth, requireAdminRole, async (req: any, res) => {
    try {
      const parsedQ = dashboardQuerySchema.safeParse(req.query || {});
      if (!parsedQ.success) return zodError(res, parsedQ.error);
      const days = parsedQ.data.days;
      const fromDate = (() => {
        const d = new Date(todayBrtIso() + "T00:00:00-03:00");
        d.setDate(d.getDate() - days);
        return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      })();

      const { data: all, error } = await supabaseAdmin
        .from(TABLE)
        .select("id, employee_id, document_type, title, status, assinatura_status, assinado_em, reminder_count, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) return res.status(500).json({ message: error.message });

      const empMap = await loadEmployeeMap();
      const nowMs = Date.now();
      const URGENT_MS = 7 * 24 * 3600 * 1000;

      let emitidos = 0, assinados = 0, pendentes = 0, urgentes = 0;
      const byType: Record<string, { assinados: number; pendentes: number; label: string }> = {};
      const tableRows: any[] = [];

      for (const d of all || []) {
        const createdIso = String(d.created_at).slice(0, 10);
        if (createdIso >= fromDate) emitidos++;
        const isAssinado = d.assinatura_status === "assinado";
        const t = d.document_type || "outros";
        if (!byType[t]) byType[t] = { assinados: 0, pendentes: 0, label: DOC_TYPE_LABELS[t] || t };
        if (isAssinado) { assinados++; byType[t].assinados++; }
        else {
          pendentes++; byType[t].pendentes++;
          const ageMs = nowMs - new Date(d.created_at).getTime();
          if (ageMs > URGENT_MS) urgentes++;
        }
        tableRows.push({
          id: d.id,
          employeeId: d.employee_id,
          employeeName: empMap.get(d.employee_id)?.name || "—",
          documentType: t,
          documentLabel: DOC_TYPE_LABELS[t] || t,
          title: d.title,
          status: isAssinado ? "assinado" : (d.status || "pendente"),
          assinaturaStatus: d.assinatura_status,
          createdAt: d.created_at,
          assinadoEm: d.assinado_em,
          reminderCount: d.reminder_count || 0,
          ageDays: Math.floor((nowMs - new Date(d.created_at).getTime()) / (24 * 3600 * 1000)),
        });
      }

      const totalAll = (all || []).length;
      const conformidade = totalAll > 0 ? Math.round((assinados / totalAll) * 1000) / 10 : 0;

      res.json({
        cards: { emitidosPeriodo: emitidos, assinados, pendentes, urgentes, conformidade, totalAll, periodDays: days },
        byType: Object.entries(byType).map(([type, v]) => ({ type, label: v.label, assinados: v.assinados, pendentes: v.pendentes })),
        rows: tableRows,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[signable-docs:dashboard]", err);
      res.status(500).json({ message: err.message });
    }
  });
}
