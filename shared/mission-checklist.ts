import { toDateKey } from "./date-key";

/** Itens conferidos na saída da base e no retorno. A configuração anterior permanece. */
export const VEHICLE_CHECKLIST_ITEMS = [
  { id: "estepe", label: "Estepe" },
  { id: "chave_roda", label: "Chave de Roda" },
  { id: "macaco", label: "Macaco" },
  { id: "triangulo", label: "Triângulo" },
  { id: "agua", label: "Água" },
  { id: "oleo", label: "Óleo" },
] as const;

/** Passo já concluído: a viatura saiu (ou passou) da base. */
const JA_SAIU_DA_BASE = new Set([
  "checkout_viatura",
  "checkout_km_saida",
  "em_transito_origem",
  "checkin_chegada_km",
  "checkin_veiculo_escoltado",
  "checkin_dados_motorista",
  "iniciar_missao",
  "em_transito_destino",
  "chegada_destino",
  "checkout_km_final",
  "checkout_viatura_retorno",
  "finalizada",
  "retorno_base",
  "chegada_base",
  "encerrada",
]);

export type OsDoDia = {
  id: number;
  missionStartedAt?: string | null;
  completedDate?: string | null;
  stepLogs?: Array<{ step?: string | null; completedAt?: string | null }> | null;
};

function osJaSaiuNoDia(os: OsDoDia, hoje: string): boolean {
  if (toDateKey(os.missionStartedAt) === hoje) return true;
  if (toDateKey(os.completedDate) === hoje) return true;
  return (os.stepLogs || []).some(
    (log) => !!log?.step && JA_SAIU_DA_BASE.has(log.step) && toDateKey(log.completedAt) === hoje,
  );
}

/**
 * Imediata não cobra o checklist, exceto na primeira saída do vigilante no dia.
 * Agendada (e as demais prioridades) continua cobrando, na saída e no retorno.
 */
export function checklistViaturaObrigatorio(input: {
  priority?: string | null;
  osId: number;
  outras: OsDoDia[];
  hoje?: string;
}): boolean {
  if (String(input.priority || "").toLowerCase() !== "imediata") return true;
  const hoje = input.hoje || toDateKey(new Date()) || "";
  const outraJaSaiu = input.outras.some((os) => os.id !== input.osId && osJaSaiuNoDia(os, hoje));
  return !outraJaSaiu;
}
