export type OsStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelada"
  | "recusada";

export type BillingStatus =
  | "ESTIMATIVA"
  | "A_VERIFICAR"
  | "PENDENTE"
  | "ENVIADA_APROVACAO"
  | "APROVADA"
  | "REJEITADA"
  | "CALCULADO"
  | "FATURADO"
  | "FATURADA"
  | "PAGO"
  | "CANCELADO"
  | "CANCELADA";

export interface StatusDescriptor {
  label: string;
  color: "emerald" | "red" | "orange" | "yellow" | "blue" | "indigo" | "amber" | "gray";
  badgeClass: string;
  textClass: string;
  dotClass: string;
  appearsInMedicao: boolean;
  appearsInFaturamento: boolean;
  countsRevenue: boolean;
}

const PALETTE: Record<StatusDescriptor["color"], { badge: string; text: string; dot: string }> = {
  emerald: { badge: "bg-emerald-100 text-emerald-700 border border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500" },
  red:     { badge: "bg-red-100 text-red-700 border border-red-300",             text: "text-red-700",     dot: "bg-red-500" },
  orange:  { badge: "bg-orange-100 text-orange-700 border border-orange-300",     text: "text-orange-700",  dot: "bg-orange-500" },
  yellow:  { badge: "bg-yellow-100 text-yellow-800 border border-yellow-300",     text: "text-yellow-800",  dot: "bg-yellow-500" },
  blue:    { badge: "bg-blue-100 text-blue-700 border border-blue-300",           text: "text-blue-700",    dot: "bg-blue-500" },
  indigo:  { badge: "bg-indigo-100 text-indigo-700 border border-indigo-300",     text: "text-indigo-700",  dot: "bg-indigo-500" },
  amber:   { badge: "bg-amber-100 text-amber-800 border border-amber-300",        text: "text-amber-800",   dot: "bg-amber-500" },
  gray:    { badge: "bg-neutral-100 text-neutral-600 border border-neutral-300",  text: "text-neutral-600", dot: "bg-neutral-400" },
};

const desc = (
  label: string,
  color: StatusDescriptor["color"],
  flags: { appearsInMedicao: boolean; appearsInFaturamento: boolean; countsRevenue: boolean }
): StatusDescriptor => ({
  label,
  color,
  badgeClass: PALETTE[color].badge,
  textClass: PALETTE[color].text,
  dotClass: PALETTE[color].dot,
  ...flags,
});

export const OS_STATUS_MAP: Record<OsStatus, StatusDescriptor> = {
  pending:     desc("Pendente",     "yellow",  { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false }),
  accepted:    desc("Aceita",       "blue",    { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false }),
  in_progress: desc("Em Andamento", "indigo",  { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false }),
  completed:   desc("Concluída",    "emerald", { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  cancelada:   desc("Cancelada",    "red",     { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: false }),
  recusada:    desc("Recusada",     "orange",  { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: false }),
};

export const BILLING_STATUS_MAP: Record<BillingStatus, StatusDescriptor> = {
  ESTIMATIVA:        desc("Estimativa",        "blue",    { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false }),
  A_VERIFICAR:       desc("A Verificar",       "yellow",  { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  PENDENTE:          desc("Pendente",          "blue",    { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  ENVIADA_APROVACAO: desc("Enviada Aprovação", "blue",    { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  APROVADA:          desc("Aprovada",          "emerald", { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  REJEITADA:         desc("Recusada",          "red",     { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false }),
  CALCULADO:         desc("Calculado",         "blue",    { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  FATURADO:          desc("Faturada",          "amber",   { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  FATURADA:          desc("Faturada",          "amber",   { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  PAGO:              desc("Pago",              "emerald", { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: true  }),
  CANCELADO:         desc("Cancelada",         "red",     { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: false }),
  CANCELADA:         desc("Cancelada",         "red",     { appearsInMedicao: true,  appearsInFaturamento: true,  countsRevenue: false }),
};

export function getOsStatusInfo(osStatus: string | null | undefined): StatusDescriptor {
  const key = (osStatus || "") as OsStatus;
  return OS_STATUS_MAP[key] || desc(osStatus || "—", "gray", { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false });
}

export function getBillingStatusInfo(billingStatus: string | null | undefined): StatusDescriptor {
  const key = (billingStatus || "") as BillingStatus;
  return BILLING_STATUS_MAP[key] || desc(billingStatus || "—", "gray", { appearsInMedicao: false, appearsInFaturamento: false, countsRevenue: false });
}

export function getRelatorioStatus(
  osStatus: string | null | undefined,
  billingStatus: string | null | undefined,
  osMissionStatus?: string | null | undefined
): StatusDescriptor {
  if (osStatus === "recusada") return OS_STATUS_MAP.recusada;
  if (osStatus === "cancelada") return OS_STATUS_MAP.cancelada;
  // Operacional manda no Faturamento: OS concluída + missão encerrada vale como APROVADA
  // mesmo que o financeiro ainda não tenha revisado o billing.
  const isOsConcluida = (osStatus === "concluída" || osStatus === "concluida" || osStatus === "completed");
  const isMissionEncerrada = (osMissionStatus === "encerrada");
  if (isOsConcluida && isMissionEncerrada && billingStatus !== "FATURADO" && billingStatus !== "FATURADA" && billingStatus !== "PAGO" && billingStatus !== "CANCELADO" && billingStatus !== "CANCELADA" && billingStatus !== "REJEITADA") {
    return BILLING_STATUS_MAP.APROVADA;
  }
  return getBillingStatusInfo(billingStatus);
}

export function appearsInMedicao(
  osStatus: string | null | undefined,
  billingStatus: string | null | undefined
): boolean {
  if (osStatus === "recusada" || osStatus === "cancelada") return true;
  return getBillingStatusInfo(billingStatus).appearsInMedicao;
}
