/**
 * Catálogo de permissões da tabela existente `perfis_acesso`.
 * Não cria segundo ACL: menus e ações de fatura leem o JSON `permissions`.
 */

export const INTEGRATION_ACTOR = "Integração";

export function resolveActorName(opts: {
  userName?: string | null;
  createdBy?: number | string | null;
}): string {
  const name = String(opts.userName || "").trim();
  if (name) return name;
  if (opts.createdBy) return "Usuário";
  return INTEGRATION_ACTOR;
}

export type PermissionGroup = "Geral" | "Comercial" | "Operações" | "Pessoas" | "Controladoria" | "Sistema" | "Fatura";

export type PermissionDef = {
  key: string;
  label: string;
  group: PermissionGroup;
  /** Caminho de menu, se a permissão abre uma tela. */
  path?: string;
};

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: "dashboard", label: "Painel", group: "Geral", path: "/admin/dashboard" },
  { key: "whatsapp", label: "WhatsApp", group: "Geral", path: "/admin/whatsapp" },

  { key: "leads", label: "Prospecção & Leads", group: "Comercial", path: "/admin/leads" },
  { key: "clients", label: "Clientes", group: "Comercial", path: "/admin/clients" },
  { key: "service_orders", label: "Ordens de Serviço", group: "Comercial", path: "/admin/service-orders" },
  { key: "boletim_medicao", label: "Boletim de Medição", group: "Comercial", path: "/admin/boletim-medicao" },
  { key: "relatorio_faturamento", label: "Relatório Faturamento", group: "Comercial", path: "/admin/relatorio-faturamento" },

  { key: "operational_grid", label: "Painel Operacional", group: "Operações", path: "/admin/operational-grid" },
  { key: "agenda_vtr", label: "Agenda da VTR", group: "Operações", path: "/admin/agenda-vtr" },
  { key: "relatorio_os", label: "Relatório de OS", group: "Operações", path: "/admin/relatorio-os" },
  { key: "armamento", label: "Armamento", group: "Operações", path: "/admin/armamento" },
  { key: "vehicles", label: "Veículos", group: "Operações", path: "/admin/vehicles" },
  { key: "cameras_live", label: "Câmera AO VIVO", group: "Operações", path: "/admin/cameras-live" },
  { key: "maintenance", label: "Manutenção", group: "Operações", path: "/admin/maintenance" },
  { key: "tracker", label: "Rastreador", group: "Operações", path: "/admin/tracker" },
  { key: "controle_condutor", label: "Controle Condutor", group: "Operações", path: "/admin/controle-condutor" },

  { key: "employees", label: "Cadastro de funcionários", group: "Pessoas", path: "/admin/employees" },
  { key: "control_id", label: "Ponto Control iD", group: "Pessoas", path: "/admin/control-id" },
  { key: "relatorio_horas", label: "Relatório de Horas", group: "Pessoas", path: "/admin/relatorio-horas" },
  { key: "holerites", label: "Holerites", group: "Pessoas", path: "/admin/holerites" },
  { key: "documentos_rh", label: "Documentos RH", group: "Pessoas", path: "/admin/documentos-rh" },

  { key: "financeiro_contas", label: "Contas (financeiro)", group: "Controladoria", path: "/admin/financeiro" },
  { key: "relatorio_nf", label: "Relatório de NFs / Faturas", group: "Controladoria", path: "/admin/relatorio-nf" },
  { key: "cobranca_judicial", label: "Cobrança Judicial", group: "Controladoria", path: "/admin/cobranca-judicial" },
  { key: "auditoria_faturamento", label: "Auditoria de Ciclo", group: "Controladoria", path: "/admin/auditoria-faturamento" },
  { key: "balanco", label: "Balanço Gerencial", group: "Controladoria", path: "/admin/balanco-gerencial" },
  { key: "custos_fixos", label: "Custos Fixos", group: "Controladoria", path: "/admin/custos-fixos" },
  { key: "relatorio_abastecimento", label: "Relatório Abastecimento", group: "Controladoria", path: "/admin/relatorio-abastecimento" },
  { key: "conciliacao_ticketlog", label: "Conciliação TicketLog", group: "Controladoria", path: "/admin/conciliacao-ticketlog" },
  { key: "conferencia_pedagio", label: "Pedágio: Pago × Cobrado", group: "Controladoria", path: "/admin/conferencia-pedagio" },
  { key: "conferencia_tmseg", label: "Conferência TM SEG", group: "Controladoria", path: "/admin/conferencia-tmseg" },
  { key: "fornecedores", label: "Fornecedores", group: "Controladoria", path: "/admin/fornecedores" },

  { key: "auditoria", label: "Auditoria do sistema", group: "Sistema", path: "/admin/auditoria" },
  { key: "users", label: "Usuários e perfis", group: "Sistema", path: "/admin/usuarios" },
  { key: "database", label: "Banco de Dados", group: "Sistema", path: "/admin/database" },
  { key: "guia_missao", label: "Guia Operacional", group: "Sistema", path: "/admin/guia-missao" },
  { key: "simulador_missao", label: "Simulador Missão", group: "Sistema", path: "/admin/simulador-missao" },

  { key: "invoice_baixa", label: "Dar baixa na fatura", group: "Fatura" },
  { key: "invoice_comprovante", label: "Anexar comprovante de pagamento", group: "Fatura" },
  { key: "invoice_ocorrencia", label: "Informar ocorrência na fatura", group: "Fatura" },
  { key: "invoice_resolver_nf", label: "Corrigir cadastro e reemitir NF", group: "Fatura" },
];

export const PATH_TO_PERMISSION: Record<string, string> = Object.fromEntries(
  PERMISSION_CATALOG.filter((p) => p.path).map((p) => [p.path as string, p.key]),
);

export const DEFAULT_PROFILE_PERMISSIONS: Record<string, string[]> = {
  diretoria: ["*"],
  admin: PERMISSION_CATALOG.map((p) => p.key).filter((k) => k !== "database"),
  financeiro: [
    "dashboard",
    "clients",
    "relatorio_nf",
    "invoice_baixa",
    "invoice_comprovante",
    "invoice_ocorrencia",
    "invoice_resolver_nf",
  ],
  funcionario: ["dashboard", "guia_missao"],
};

export const PROFILE_LABELS: Record<string, string> = {
  diretoria: "Diretoria",
  admin: "Administrador",
  financeiro: "Financeiro",
  funcionario: "Funcionário",
};

export function parsePermissions(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function hasPermission(permissions: string[] | null | undefined, key: string): boolean {
  const list = permissions || [];
  if (list.includes("*")) return true;
  return list.includes(key);
}

export function canSeePath(permissions: string[] | null | undefined, path: string): boolean {
  const key = PATH_TO_PERMISSION[path];
  if (!key) return hasPermission(permissions, "*");
  return hasPermission(permissions, key);
}

export const NFSE_ERROR_ALERT_TO = [
  "financeiro@torreseguranca.com.br",
  "adm@torresseguranca.com.br",
  "diretoria@torresseguranca.com.br",
];

export const NF_AWAITING_CORRECTION = "AWAITING_CORRECTION";
export const NF_CORRECTION_REQUIRED_CODE = "NF_CORRECTION_REQUIRED";
