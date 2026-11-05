/**
 * Uma viatura só pode ter uma OS ativa no cartão e no formulário.
 * Quando várias OS apontam para o mesmo vehicle_id, escolhemos a que já saiu
 * do aguardando com mais progresso — e, se empatar, a que casa com a sessão.
 */

export const PASSOS_MISSAO = [
  "aguardando",
  "checkout_armamento",
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
] as const;

const PASSOS_ENCERRADOS = new Set(["finalizada", "retorno_base", "chegada_base", "encerrada"]);

export interface OsCandidataViatura {
  id: number;
  osNumber?: string | null;
  status?: string | null;
  missionStatus?: string | null;
  scheduledDate?: string | Date | null;
  missionStartedAt?: string | Date | null;
  assignedEmployeeId?: number | null;
  assignedEmployee2Id?: number | null;
}

export interface SessaoViatura {
  driverId?: number | null;
  partnerId?: number | null;
}

export function indicePassoMissao(passo: string | null | undefined): number {
  if (!passo) return -1;
  return PASSOS_MISSAO.indexOf(passo as (typeof PASSOS_MISSAO)[number]);
}

/** Missão que já saiu do aguardando e ainda não encerrou. */
export function missaoEmCursoNaViatura(os: OsCandidataViatura): boolean {
  const status = (os.status || "").toLowerCase();
  if (status === "concluida" || status === "concluída" || status === "cancelada" || status === "recusada") return false;
  const passo = (os.missionStatus || "").toLowerCase();
  if (!passo || passo === "aguardando" || PASSOS_ENCERRADOS.has(passo)) return false;
  return status === "em_andamento" || status === "agendada";
}

function instante(valor: string | Date | null | undefined): number {
  if (!valor) return 0;
  const t = new Date(valor).getTime();
  return Number.isFinite(t) ? t : 0;
}

function casaComSessao(os: OsCandidataViatura, sessao?: SessaoViatura | null): number {
  if (!sessao) return 0;
  const ids = [os.assignedEmployeeId, os.assignedEmployee2Id]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return 0;
  const condutor = Number(sessao.driverId);
  const parceiro = Number(sessao.partnerId);
  let pontos = 0;
  if (condutor > 0 && ids.includes(condutor)) pontos += 2;
  if (parceiro > 0 && ids.includes(parceiro)) pontos += 1;
  return pontos;
}

/**
 * Escolhe a OS que o cartão e o formulário devem mostrar para a viatura.
 * Empate de horário de agenda não pode ficar instável.
 */
export function escolherOsAtivaDaViatura<T extends OsCandidataViatura>(
  candidatas: T[],
  sessao?: SessaoViatura | null,
): T | undefined {
  const abertas = candidatas.filter((os) => {
    const status = (os.status || "").toLowerCase();
    if (status === "concluida" || status === "concluída" || status === "cancelada" || status === "recusada") return false;
    const passo = (os.missionStatus || "").toLowerCase();
    if (PASSOS_ENCERRADOS.has(passo)) return false;
    return status === "em_andamento" || (status === "agendada" && !!passo);
  });
  if (!abertas.length) return undefined;

  return [...abertas].sort((a, b) => {
    const aCurso = missaoEmCursoNaViatura(a) ? 1 : 0;
    const bCurso = missaoEmCursoNaViatura(b) ? 1 : 0;
    if (aCurso !== bCurso) return bCurso - aCurso;

    const aInicio = a.missionStartedAt ? 1 : 0;
    const bInicio = b.missionStartedAt ? 1 : 0;
    if (aInicio !== bInicio) return bInicio - aInicio;

    const aPasso = indicePassoMissao(a.missionStatus);
    const bPasso = indicePassoMissao(b.missionStatus);
    if (aPasso !== bPasso) return bPasso - aPasso;

    const aSessao = casaComSessao(a, sessao);
    const bSessao = casaComSessao(b, sessao);
    if (aSessao !== bSessao) return bSessao - aSessao;

    const aAgenda = instante(a.scheduledDate);
    const bAgenda = instante(b.scheduledDate);
    if (aAgenda !== bAgenda) return aAgenda - bAgenda;

    return Number(b.id) - Number(a.id);
  })[0];
}

/** Outra OS já em curso na mesma viatura (não a própria). */
export function outraMissaoEmCursoNaViatura<T extends OsCandidataViatura>(
  candidatas: T[],
  osIdAtual: number,
): T | undefined {
  return candidatas.find((os) => os.id !== osIdAtual && missaoEmCursoNaViatura(os));
}

export interface OsComViatura extends OsCandidataViatura {
  vehicleId?: number | null;
}

/**
 * Enquanto a missão em curso da viatura não acabar, a próxima OS dessa placa
 * não entra no painel. Só a OS ativa da viatura permanece visível.
 */
export function osOcultaNoPainelPorMissaoAnterior<T extends OsComViatura>(
  os: T,
  todas: T[],
): { oculta: boolean; aguardaOsNumber: string | null } {
  const vehicleId = Number(os.vehicleId);
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    return { oculta: false, aguardaOsNumber: null };
  }
  const mesmaViatura = todas.filter((item) => Number(item.vehicleId) === vehicleId);
  const ativa = escolherOsAtivaDaViatura(mesmaViatura);
  if (!ativa || ativa.id === os.id) {
    return { oculta: false, aguardaOsNumber: null };
  }
  if (!missaoEmCursoNaViatura(ativa)) {
    return { oculta: false, aguardaOsNumber: null };
  }
  const status = (os.status || "").toLowerCase();
  if (status === "concluida" || status === "concluída" || status === "cancelada" || status === "recusada") {
    return { oculta: false, aguardaOsNumber: null };
  }
  return {
    oculta: true,
    aguardaOsNumber: (ativa.osNumber || String(ativa.id)).trim() || null,
  };
}
