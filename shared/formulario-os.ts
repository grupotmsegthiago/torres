/**
 * Formulário da OS: origem, destino, cliente e escoltado saem só da OS alvo.
 * A viatura pode ter outra missão aberta — isso não empresta a rota.
 */

export interface PessoaFormulario {
  id?: number;
  name?: string | null;
  fullName?: string | null;
  phone?: string | null;
}

export interface OsFormulario {
  id?: number | null;
  osNumber?: string | null;
  status?: string | null;
  missionStatus?: string | null;
  clientName?: string | null;
  origin?: string | null;
  destination?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  route?: string | null;
  scheduledDate?: string | null;
  escortedDriverName?: string | null;
  escortedDriverPhone?: string | null;
  escortedVehiclePlate?: string | null;
  employee1?: PessoaFormulario | null;
  employee2?: PessoaFormulario | null;
  waypoints?: Array<{ address?: string; lat?: number; lng?: number }> | null;
  lastAgentUpdate?: {
    message?: string | null;
    missionStep?: string | null;
    agentName?: string | null;
  } | null;
}

export interface ViaturaFormulario {
  plate?: string | null;
  activeOs?: OsFormulario | null;
  upcomingOrders?: OsFormulario[] | null;
}

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function mesmoNumero(a: unknown, b: unknown): boolean {
  const esquerda = texto(a);
  const direita = texto(b);
  return !!esquerda && !!direita && esquerda === direita;
}

/** Monta a ficha da OS a partir da grade (todos os campos do formulário). */
export function osDaGrade(item: OsFormulario | null | undefined): OsFormulario | null {
  if (!item?.osNumber) return null;
  return {
    id: item.id ?? null,
    osNumber: item.osNumber,
    status: item.status || "",
    missionStatus: item.missionStatus || "",
    clientName: item.clientName || "—",
    origin: item.origin ?? null,
    destination: item.destination ?? null,
    originLat: item.originLat ?? null,
    originLng: item.originLng ?? null,
    destinationLat: item.destinationLat ?? null,
    destinationLng: item.destinationLng ?? null,
    route: item.route ?? null,
    scheduledDate: item.scheduledDate ?? null,
    escortedDriverName: item.escortedDriverName ?? null,
    escortedDriverPhone: item.escortedDriverPhone ?? null,
    escortedVehiclePlate: item.escortedVehiclePlate ?? null,
    employee1: item.employee1 ?? null,
    employee2: item.employee2 ?? null,
    waypoints: item.waypoints ?? [],
    lastAgentUpdate: item.lastAgentUpdate ?? null,
  };
}

/**
 * Resolve a OS do formulário. Se a grade pede TOR-1215, não usa a TOR-1178
 * que estiver ativa na mesma viatura.
 */
export function resolverOsDoFormulario(
  viatura: ViaturaFormulario | null | undefined,
  grade: OsFormulario | null | undefined,
): OsFormulario | null {
  const alvo = texto(grade?.osNumber);
  const ativa = viatura?.activeOs || null;
  const futura = alvo
    ? (viatura?.upcomingOrders || []).find((ordem) => mesmoNumero(ordem.osNumber, alvo)) || null
    : null;

  if (alvo) {
    if (ativa && mesmoNumero(ativa.osNumber, alvo)) {
      return mesclarOs(ativa, grade);
    }
    if (futura) return mesclarOs(futura, grade);
    return osDaGrade(grade);
  }

  if (ativa) return mesclarOs(ativa, grade);
  return osDaGrade(grade);
}

function mesclarOs(base: OsFormulario, grade?: OsFormulario | null): OsFormulario {
  const daGrade = osDaGrade(grade);
  return {
    id: base.id ?? daGrade?.id ?? null,
    osNumber: texto(base.osNumber) || daGrade?.osNumber || "—",
    status: texto(base.status) || daGrade?.status || "",
    missionStatus: texto(base.missionStatus) || daGrade?.missionStatus || "",
    clientName: texto(base.clientName) || daGrade?.clientName || "—",
    origin: texto(base.origin) || daGrade?.origin || null,
    destination: texto(base.destination) || daGrade?.destination || null,
    originLat: base.originLat ?? daGrade?.originLat ?? null,
    originLng: base.originLng ?? daGrade?.originLng ?? null,
    destinationLat: base.destinationLat ?? daGrade?.destinationLat ?? null,
    destinationLng: base.destinationLng ?? daGrade?.destinationLng ?? null,
    route: texto(base.route) || daGrade?.route || null,
    scheduledDate: base.scheduledDate ?? daGrade?.scheduledDate ?? null,
    escortedDriverName: texto(base.escortedDriverName) || daGrade?.escortedDriverName || null,
    escortedDriverPhone: texto(base.escortedDriverPhone) || daGrade?.escortedDriverPhone || null,
    escortedVehiclePlate: texto(base.escortedVehiclePlate) || daGrade?.escortedVehiclePlate || null,
    employee1: base.employee1 || daGrade?.employee1 || null,
    employee2: base.employee2 || daGrade?.employee2 || null,
    waypoints: (base.waypoints && base.waypoints.length ? base.waypoints : null) || daGrade?.waypoints || [],
    lastAgentUpdate: base.lastAgentUpdate || daGrade?.lastAgentUpdate || null,
  };
}

/** Origem/destino/escoltado só da OS resolvida — sem cair na outra missão da viatura. */
export function camposRotaDoFormulario(os: OsFormulario | null | undefined): {
  origin: string;
  destination: string;
  driverName: string;
  driverPhone: string;
  driverPlate: string;
} {
  return {
    origin: texto(os?.origin) || "—",
    destination: texto(os?.destination) || "—",
    driverName: texto(os?.escortedDriverName) || "—",
    driverPhone: texto(os?.escortedDriverPhone) || "—",
    driverPlate: texto(os?.escortedVehiclePlate) || "—",
  };
}
