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
      { type: "Certidão de Pontuação CNH", label: "Certidão de Pontuação de CNH", vigilanteOnly: true },
      // Opcionais (decidido 27/05/2026): aparecem no checklist mas não bloqueiam alerta.
      { type: "Carteira de Vacinação", label: "Carteira de Vacinação", optional: true },
      { type: "Comprovante de Formação Escolar", label: "Comprovante de Formação Escolar", optional: true },
      { type: "Certificado Formação Vigilante", label: "Certificado de Formação de Vigilante (validade dispensada)", vigilanteOnly: true },
      { type: "Certificado Formação Escolta Armada", label: "Certificado de Formação de Escolta Armada (validade dispensada)", vigilanteOnly: true },
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
      { type: "Antecedente Criminal Polícia Civil", label: "Antecedente Criminal Polícia Civil", vigilanteOnly: true },
      { type: "Antecedente Criminal Polícia Militar", label: "Antecedente Criminal Polícia Militar", vigilanteOnly: true },
      { type: "Certidão de COP", label: "Certidão de COP (Objeto em Pé)", vigilanteOnly: true },
    ]},
  ];
}

/** Filtra o catálogo pra um perfil específico. Remove grupos vazios. */
export function filterDocsCatalogByProfile(catalog: DocGroup[], profile: EmployeeProfile): DocGroup[] {
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
