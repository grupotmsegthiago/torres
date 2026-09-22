/**
 * Fonte única de verdade do checklist de documentos por perfil.
 * Usado por:
 *   - client/src/pages/admin/employees.tsx  (checklist visual + alerta da lista)
 *   - server/routes/onboarding.ts            (bloqueio de OS por pendência)
 *   - server/jobs/document-compliance.ts     (e-mail diário de compliance)
 *
 * Perfis:
 *   - vigilante  → cargos operacionais (vigilante/escolta/operador/operacional)
 *   - admin      → demais cargos (Adm/Gerente/Supervisor/Auxiliar de Limpeza)
 *
 * Flags por item:
 *   vigilanteOnly  — só aparece no perfil vigilante
 *   adminOnly      — só aparece no perfil admin
 *   optional       — aparece no checklist mas NÃO conta como pendência
 *   (sem flag)     — obrigatório pra todos os perfis em que o item aparece
 */

export type DocItem = {
  type: string;
  label: string;
  vigilanteOnly?: boolean;
  adminOnly?: boolean;
  optional?: boolean;
};
export type DocGroup = { group: string; items: DocItem[] };

export type EmployeeProfile = "vigilante" | "admin";

/** Cargos considerados "operacionais" (perfil vigilante). Auxiliar de Limpeza
 *  e demais administrativos caem em "admin". */
export function profileFromRole(role?: string | null): EmployeeProfile {
  const r = (role || "").toLowerCase();
  if (r.includes("vigilante") || r.includes("escolt") || r.includes("operacional") || r.includes("operador")) {
    return "vigilante";
  }
  return "admin";
}

export function buildRequiredDocsCatalog(): DocGroup[] {
  return [
    { group: "Identificação e Documentos Pessoais", items: [
      { type: "RG", label: "RG" },
      { type: "CPF", label: "CPF" },
      { type: "CTPS", label: "Carteira de Trabalho (CTPS)" },
      { type: "PIS/PASEP/NIS", label: "PIS/PASEP/NIS" },
      { type: "Comprovante de Residência", label: "Comprovante de Residência" },
      { type: "Fotos 3x4", label: "03 Fotos 3x4 recentes" },
      { type: "Título de Eleitor", label: "Título de Eleitor" },
      { type: "Certificado de Reservista", label: "Certificado de Reservista (homens 18-45)", vigilanteOnly: true },
    ]},
    { group: "Habilitação e Formação", items: [
      { type: "CNH", label: "CNH / CNV", vigilanteOnly: true },
      // Decidido com o dono (jun/2026): Pontuação CNH NÃO é obrigatória (opcional).
      { type: "Certidão de Pontuação CNH", label: "Certidão de Pontuação de CNH", vigilanteOnly: true, optional: true },
      // Opcionais (decidido 27/05/2026): aparecem no checklist mas não bloqueiam alerta.
      { type: "Carteira de Vacinação", label: "Carteira de Vacinação", optional: true },
      { type: "Comprovante de Formação Escolar", label: "Comprovante de Formação Escolar", optional: true },
      // Formação é cobrada uma única vez. Escolta armada é extensão: o certificado
      // aparece no checklist, mas não é pendência separada — se a formação já está
      // no sistema, não cobra de novo. Quem renova é só a reciclagem.
      { type: "Certificado Formação Vigilante", label: "Certificado de Formação de Vigilante (validade dispensada)", vigilanteOnly: true },
      { type: "Certificado Formação Escolta Armada", label: "Certificado de Formação de Escolta Armada (validade dispensada)", vigilanteOnly: true, optional: true },
      { type: "Reciclagem Escolta Armada", label: "Última Reciclagem de Escolta Armada", vigilanteOnly: true },
      { type: "ASO", label: "ASO - Atestado de Saúde Ocupacional" },
    ]},
    { group: "Dependentes (se necessário)", items: [
      { type: "Certidão Nascimento/Casamento", label: "Certidão de Casamento", optional: true },
      { type: "Certidão Nascimento Filhos", label: "Certidão de Nascimento de Filhos (menores 14 anos)", optional: true },
      { type: "Carteira Vacinação/Comprovante Escolar", label: "Carteira de Vacinação dos Filhos", optional: true },
    ]},
    { group: "Certidões Obrigatórias", items: [
      { type: "Antecedentes Criminais", label: "Antecedentes Criminais", adminOnly: true },
      // Decidido com o dono (jun/2026): Antec. Civil e Militar NÃO são obrigatórios (opcionais).
      { type: "Antecedente Criminal Polícia Civil", label: "Antecedente Criminal Polícia Civil", vigilanteOnly: true, optional: true },
      { type: "Antecedente Criminal Polícia Militar", label: "Antecedente Criminal Polícia Militar", vigilanteOnly: true, optional: true },
      { type: "Certidão de COP", label: "Certidão de COP (Objeto em Pé)", vigilanteOnly: true },
    ]},
  ];
}

/** Filtra o catálogo pra um perfil específico. Remove grupos vazios. */
export function filterDocsCatalogByProfile(catalog: DocGroup[], profile: EmployeeProfile): DocGroup[] {
  // Decidido com o dono: funcionário comum (perfil "admin" — Adm/Gerente/
  // Supervisor/Auxiliar de Limpeza) NÃO tem cobrança de documentos. Checklist e
  // alertas zerados. Somente cargos operacionais (vigilante) têm cobrança.
  if (profile === "admin") return [];
  const isVig = profile === "vigilante";
  return catalog
    .map(g => ({
      group: g.group,
      items: g.items.filter(i => {
        if (i.vigilanteOnly && !isVig) return false;
        if (i.adminOnly && isVig) return false;
        return true;
      }),
    }))
    .filter(g => g.items.length > 0);
}

/** Backcompat com a assinatura antiga do client (isVigilante boolean). */
export function filterDocsCatalogByRole(catalog: DocGroup[], isVigilante: boolean): DocGroup[] {
  return filterDocsCatalogByProfile(catalog, isVigilante ? "vigilante" : "admin");
}

/** Lista plana só dos `type` obrigatórios (exclui Dependentes e optional=true)
 *  para o perfil dado. É o que o backend usa pra checar pendência. */
export function getMandatoryDocTypesForProfile(profile: EmployeeProfile): string[] {
  const filtered = filterDocsCatalogByProfile(buildRequiredDocsCatalog(), profile);
  return filtered
    .filter(g => g.group !== "Dependentes (se necessário)")
    .flatMap(g => g.items.filter(i => !i.optional).map(i => i.type));
}

/** Lista plana de TODOS os `type` (mandatórios + opcionais, fora Dependentes)
 *  para o perfil dado. Usado pelo checklist visual. */
export function getAllDocTypesForProfile(profile: EmployeeProfile): string[] {
  const filtered = filterDocsCatalogByProfile(buildRequiredDocsCatalog(), profile);
  return filtered
    .filter(g => g.group !== "Dependentes (se necessário)")
    .flatMap(g => g.items.map(i => i.type));
}

/** Tipos de doc que possuem validade (data de expiração).
 *  Decidido com o dono: cobrar validade SOMENTE de CNH e CNV. */
export const DOCS_WITH_EXPIRY = new Set<string>([
  "CNH",
  "CNV",
]);

/** Tipo do doc de reciclagem de escolta armada (cobrança que renova). */
export const RECICLAGEM_ESCOLTA_TYPE = "Reciclagem Escolta Armada";

/** Formação de vigilante — cobrança única. */
export const FORMACAO_VIGILANTE_TYPE = "Certificado Formação Vigilante";

/** Extensão de escolta armada. Não é pendência separada da formação. */
export const FORMACAO_ESCOLTA_TYPE = "Certificado Formação Escolta Armada";

const FORMACAO_TYPE_SET = new Set<string>([FORMACAO_VIGILANTE_TYPE, FORMACAO_ESCOLTA_TYPE]);

/** Inativo não entra em cobrança de pendência nem de documentação. */
export function isInactiveEmployee(status?: string | null): boolean {
  return String(status || "").trim().toLowerCase() === "inativo";
}

/** Prazo liberado pela Diretoria (inclusive no dia). Sem data → não libera. */
export function isWithinDiretoriaGrace(graceUntil?: string | null, today: string = brtToday()): boolean {
  const grace = dateOnly(graceUntil);
  if (!grace) return false;
  return today <= grace;
}

export function dateOnly(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function addYearsYmd(ymd: string, years: number): string | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Formação é uma vez. Escolta armada é extensão: se qualquer certificado de
 * formação já está no sistema, nenhum dos dois entra como pendência.
 * Sem nenhum, cobra só a formação de vigilante.
 */
export function filterFormacaoOnce(types: string[], presentTypes: string[]): string[] {
  const present = new Set(presentTypes);
  const hasFormacao = [...FORMACAO_TYPE_SET].some(t => present.has(t));
  if (hasFormacao) return types.filter(t => !FORMACAO_TYPE_SET.has(t));
  return types.filter(t => t !== FORMACAO_ESCOLTA_TYPE);
}

/** Curso de formação ou extensão de escolta. Reciclagem não conta. */
export function isFormacaoTrainingType(type?: string | null): boolean {
  const t = (type || "").toLowerCase();
  if (t.includes("recicl") || t.includes("escolar")) return false;
  return t.includes("forma") || t.includes("especializ");
}

export function isReciclagemType(type?: string | null): boolean {
  return (type || "").toLowerCase().includes("recicl");
}

function brtToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Reciclagem de escolta armada só é COBRADA quando o CNV completa 2 anos a partir
 * da data de emissão/formação. Decidido com o dono (jun/2026):
 *   - CNV com < 2 anos → NÃO cobra reciclagem.
 *   - CNV com >= 2 anos → cobra.
 *   - Sem data de emissão preenchida → NÃO cobra (evita alerta falso até o RH preencher).
 */
export function isReciclagemDue(cnvIssueDate?: string | null, today: string = brtToday()): boolean {
  if (!cnvIssueDate) return false;
  const [y, m, d] = String(cnvIssueDate).split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return false;
  const dueDate = `${y + 2}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return today >= dueDate;
}

/** Remove a reciclagem de escolta armada da lista de obrigatórios quando ela
 *  ainda NÃO é cobrada para o CNV daquele funcionário (vide isReciclagemDue). */
export function filterReciclagemByCnv(types: string[], cnvIssueDate?: string | null, today: string = brtToday()): string[] {
  if (isReciclagemDue(cnvIssueDate, today)) return types;
  return types.filter(t => t !== RECICLAGEM_ESCOLTA_TYPE);
}

export type ReciclagemSource = {
  type?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  completedAt?: string | null;
};

export type ReciclagemClock = {
  cnvIssueDate?: string | null;
  reciclagemOn?: string | null;
  reciclagemExpiry?: string | null;
  hasReciclagem: boolean;
};

/**
 * Relógio da reciclagem a partir dos certificados e cursos já lançados.
 * Vale o registro cuja validade termina mais tarde. Registro sem data conta
 * como entregue, mas não abre um novo ciclo.
 */
export function resolveReciclagemClock(sources: ReciclagemSource[], cnvIssueDate?: string | null): ReciclagemClock {
  let bestUntil = "";
  let bestOn: string | null = null;
  let bestExpiry: string | null = null;
  let has = false;
  for (const src of sources) {
    if (!isReciclagemType(src.type)) continue;
    has = true;
    const expiry = dateOnly(src.expiryDate);
    const on = dateOnly(src.issueDate) || dateOnly(src.completedAt);
    const until = expiry || (on ? addYearsYmd(on, 2) || "" : "");
    if (until >= bestUntil) {
      bestUntil = until;
      bestOn = on;
      bestExpiry = expiry;
    }
  }
  return {
    cnvIssueDate,
    reciclagemOn: bestOn,
    reciclagemExpiry: bestExpiry,
    hasReciclagem: has,
  };
}

/**
 * Reciclagem é a cobrança que renova.
 * - Com validade explícita: cobra no vencimento.
 * - Com data da reciclagem e sem validade: cobra 2 anos depois.
 * - Sem reciclagem no sistema: cobra quando o CNV completa 2 anos.
 * - Reciclagem sem data nenhuma: não cobra de novo (já está no sistema).
 */
export function isReciclagemRenewalDue(clock: ReciclagemClock, today: string = brtToday()): boolean {
  const expiry = dateOnly(clock.reciclagemExpiry);
  if (expiry) return today >= expiry;
  const on = dateOnly(clock.reciclagemOn);
  if (on) {
    const due = addYearsYmd(on, 2);
    return !!due && today >= due;
  }
  if (clock.hasReciclagem) return false;
  return isReciclagemDue(clock.cnvIssueDate, today);
}

export function reciclagemBlocksEmployee(input: {
  status?: string | null;
  role?: string | null;
  docGraceUntil?: string | null;
  clock: ReciclagemClock;
  today?: string;
}): { block: boolean; detail: string } {
  if (isInactiveEmployee(input.status)) {
    return { block: false, detail: "Funcionário inativo — sem cobrança" };
  }
  if (input.role != null && profileFromRole(input.role) !== "vigilante") {
    return { block: false, detail: "Cargo sem cobrança de reciclagem" };
  }
  const today = input.today || brtToday();
  if (isWithinDiretoriaGrace(input.docGraceUntil, today)) {
    return { block: false, detail: `Prazo da Diretoria até ${dateOnly(input.docGraceUntil)} — sem trava` };
  }
  if (!isReciclagemRenewalDue(input.clock, today)) {
    return { block: false, detail: "Reciclagem em dia" };
  }
  return {
    block: true,
    detail: "Reciclagem de escolta armada pendente ou vencida. A Diretoria pode liberar um prazo para não travar no sistema.",
  };
}
