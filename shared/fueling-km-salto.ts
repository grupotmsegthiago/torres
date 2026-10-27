/** Acima disto o app pede confirmação. O bloqueio duro de digitação continua em 1.500 km. */
export const FUELING_KM_SALTO_ALERTA = 500;

/** Percurso sem abastecimento na OS que dispara o aviso no painel TrucksControl. */
export const FUELING_TRACKER_REMINDER_KM = 400;

export const FUELING_REMINDER_MESSAGE =
  "Lembrete Operacional: Verifique se todos os comprovantes de combustível do seu turno foram anexados no sistema.";

export const FUELING_TRACKER_REMINDER_TEXT =
  "Torres Seg: Lembrar de registrar abastecimento e filipeta no app ao parar no posto.";

export type FuelingKmSaltoAlert = {
  code: "salto_km";
  message: string;
  delta: number;
  lastKm: number;
  currentKm: number;
};

/**
 * Salto de hodômetro acima da autonomia média, ainda abaixo do bloqueio duro.
 * Sem confirmação explícita a API responde 422. Com confirmação, segue.
 */
export function fuelingKmSaltoAlert(
  currentKmRaw: number | null | undefined,
  lastKmRaw: number | null | undefined,
  confirmed: boolean,
): FuelingKmSaltoAlert | null {
  const lastKm = Number(lastKmRaw) || 0;
  const currentKm = Number(currentKmRaw) || 0;
  if (lastKm <= 0 || currentKm < lastKm) return null;
  const delta = currentKm - lastKm;
  if (delta <= FUELING_KM_SALTO_ALERTA || confirmed) return null;
  return {
    code: "salto_km",
    delta,
    lastKm,
    currentKm,
    message: `Atenção: O KM informado (${currentKm}) tem uma diferença de ${delta} km em relação ao último registro (${lastKm}). Houve algum abastecimento intermediário esquecido? Se confirma que não houve, marque a caixa de confirmação para prosseguir.`,
  };
}

/** Banner do app: missão recente e nenhum abastecimento na data da missão ou depois. */
export function shouldShowFuelingReminder(opts: {
  hasRecentMission: boolean;
  missionDate: string | null;
  lastFuelingDate: string | null;
}): boolean {
  if (!opts.hasRecentMission || !opts.missionDate) return false;
  const mission = opts.missionDate.slice(0, 10);
  const last = opts.lastFuelingDate ? opts.lastFuelingDate.slice(0, 10) : null;
  if (!last) return true;
  return last < mission;
}

/** Aviso no rastreador: missão ativa, mais de 400 km desde o último abastecimento e nada lançado na OS. */
export function shouldSendFuelingTrackerReminder(opts: {
  missionActive: boolean;
  kmDriven: number;
  hasFuelingOnMission: boolean;
}): boolean {
  if (!opts.missionActive || opts.hasFuelingOnMission) return false;
  return Number(opts.kmDriven) > FUELING_TRACKER_REMINDER_KM;
}
