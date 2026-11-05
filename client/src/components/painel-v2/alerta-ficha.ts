/** Dados da OS que o aviso de atualização mostra e que o formulário do WhatsApp preenche. */

export interface RefAlerta {
  osNumber?: string | null;
  serviceOrderId?: number | null;
}

export interface AtualizacaoAlerta extends RefAlerta {
  message: string;
  missionStep?: string | null;
  driver?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

interface AtualizacaoOs {
  message?: string | null;
  missionStep?: string | null;
  agentName?: string | null;
  createdAt?: string | null;
}

interface OsAtiva {
  id?: number;
  osNumber?: string | null;
  clientName?: string | null;
  origin?: string | null;
  destination?: string | null;
  status?: string | null;
  missionStatus?: string | null;
  priority?: string | null;
  employee1?: unknown;
  employee2?: unknown;
  escortedDriverName?: string | null;
  escortedDriverPhone?: string | null;
  escortedVehiclePlate?: string | null;
  lastAgentUpdate?: AtualizacaoOs | null;
}

interface OsFutura {
  id?: number;
  osNumber?: string | null;
  status?: string | null;
  priority?: string | null;
  clientName?: string | null;
  origin?: string | null;
  destination?: string | null;
  employee1Name?: string | null;
  employee1Phone?: string | null;
  employee2Name?: string | null;
  employee2Phone?: string | null;
  escortedDriverName?: string | null;
  escortedDriverPhone?: string | null;
  escortedVehiclePlate?: string | null;
}

interface ViaturaAlerta {
  id?: number;
  plate?: string | null;
  model?: string | null;
  tracker?: { latitude?: number | null; longitude?: number | null } | null;
  activeOs?: OsAtiva | null;
  scheduledOs?: { osNumber?: string | null } | null;
  lastOs?: { osNumber?: string | null } | null;
  upcomingOrders?: OsFutura[] | null;
}

interface ItemGrade {
  id?: number;
  osNumber?: string | null;
  status?: string | null;
  clientName?: string | null;
  origin?: string | null;
  destination?: string | null;
  missionStatus?: string | null;
  vehicle?: { plate?: string | null; model?: string | null } | null;
  tracker?: { latitude?: number | null; longitude?: number | null } | null;
  lastAgentUpdate?: AtualizacaoOs | null;
  employee1?: unknown;
  employee2?: unknown;
  escortedDriverName?: string | null;
  escortedDriverPhone?: string | null;
  escortedVehiclePlate?: string | null;
}

export interface FichaAlerta {
  plate: string;
  cliente: string;
  origem: string;
  destino: string;
  vehicle: ViaturaAlerta | null;
  gridItem: ItemGrade | null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function placaLimpa(placa?: string | null): string {
  return (placa || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function coord(valor: unknown): number | null {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** O compartilhamento com foto fica na visão do celular. No computador o painel copia o texto. */
export function mostrarWhatsappNoCelular(celular: boolean, sabeCompartilhar: boolean): boolean {
  return celular && sabeCompartilhar;
}

export interface RotaAlerta {
  osId: number | null;
  origem: string | null;
  destino: string | null;
  origemLat: unknown;
  origemLng: unknown;
  destinoLat: unknown;
  destinoLng: unknown;
  posLat: number | null;
  posLng: number | null;
}

export function rotaDaAtualizacao(origem: {
  serviceOrderId?: number | null;
  origem?: string | null;
  destino?: string | null;
  origemLat?: unknown;
  origemLng?: unknown;
  destinoLat?: unknown;
  destinoLng?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  trackerLat?: unknown;
  trackerLng?: unknown;
}): RotaAlerta {
  return {
    osId: origem.serviceOrderId ?? null,
    origem: texto(origem.origem) || null,
    destino: texto(origem.destino) || null,
    origemLat: origem.origemLat ?? null,
    origemLng: origem.origemLng ?? null,
    destinoLat: origem.destinoLat ?? null,
    destinoLng: origem.destinoLng ?? null,
    posLat: coord(origem.latitude) ?? coord(origem.trackerLat),
    posLng: coord(origem.longitude) ?? coord(origem.trackerLng),
  };
}

export function temRotaNoAlerta(rota: RotaAlerta): boolean {
  return Boolean(
    rota.origem
    || rota.destino
    || (rota.posLat != null && rota.posLng != null)
    || (coord(rota.origemLat) != null && coord(rota.origemLng) != null)
    || (coord(rota.destinoLat) != null && coord(rota.destinoLng) != null),
  );
}

export function resolverFichaAlerta(
  ref: RefAlerta,
  vehicles: ViaturaAlerta[],
  grid: ItemGrade[],
): FichaAlerta {
  const osNumber = texto(ref.osNumber) || null;
  const soId = ref.serviceOrderId != null && Number.isFinite(Number(ref.serviceOrderId))
    ? Number(ref.serviceOrderId)
    : null;
  const gridItem = grid.find((item) =>
    (osNumber != null && item.osNumber === osNumber) || (soId != null && item.id === soId),
  ) || null;

  // SSOT: alerta só casa com missão ativa / agendada / fila — nunca lastOs (vaza OS antiga).
  const vehicle = vehicles.find((viatura) => {
    if (osNumber && (
      viatura.activeOs?.osNumber === osNumber
      || viatura.scheduledOs?.osNumber === osNumber
      || viatura.upcomingOrders?.some((ordem) => ordem.osNumber === osNumber)
    )) return true;
    if (osNumber && viatura.activeOs?.osNumber && viatura.activeOs.osNumber !== osNumber) {
      return false;
    }
    const placaGrid = placaLimpa(gridItem?.vehicle?.plate);
    return placaGrid !== "" && placaLimpa(viatura.plate) === placaGrid;
  }) || null;

  const osAtiva = osNumber && vehicle?.activeOs?.osNumber === osNumber ? vehicle.activeOs : null;
  const futura = osNumber ? vehicle?.upcomingOrders?.find((ordem) => ordem.osNumber === osNumber) : undefined;
  const cliente = texto(osAtiva?.clientName) || texto(futura?.clientName) || texto(gridItem?.clientName);
  const origem = texto(osAtiva?.origin) || texto(futura?.origin) || texto(gridItem?.origin);
  const destino = texto(osAtiva?.destination) || texto(futura?.destination) || texto(gridItem?.destination);
  const plate = texto(vehicle?.plate) || texto(gridItem?.vehicle?.plate) || "—";

  return { plate, cliente, origem, destino, vehicle, gridItem };
}

function viaturaVazia(plate: string): ViaturaAlerta {
  return {
    id: 0,
    plate,
    model: "",
    tracker: null,
    activeOs: null,
    scheduledOs: null,
    lastOs: null,
    upcomingOrders: [],
  };
}

/** Monta a viatura e a OS que `generateReportAsync` já transforma no formulário oficial. */
export function prepararRelatorioAlerta(ficha: FichaAlerta, atualizacao: AtualizacaoAlerta): {
  vehicle: ViaturaAlerta;
  gridItem: ItemGrade | null;
} {
  const osNumber = texto(atualizacao.osNumber) || null;
  const gridItem = ficha.gridItem
    ? {
        ...ficha.gridItem,
        lastAgentUpdate: {
          ...(ficha.gridItem.lastAgentUpdate || {}),
          message: atualizacao.message,
          missionStep: atualizacao.missionStep || ficha.gridItem.lastAgentUpdate?.missionStep || null,
          agentName: atualizacao.driver || ficha.gridItem.lastAgentUpdate?.agentName || null,
        },
      }
    : null;

  const base = ficha.vehicle ? { ...ficha.vehicle } : viaturaVazia(ficha.plate);
  const osBate = Boolean(osNumber && base.activeOs?.osNumber === osNumber);
  const futura = osNumber ? base.upcomingOrders?.find((ordem) => ordem.osNumber === osNumber) : undefined;

  let activeOs: OsAtiva | null = osBate && base.activeOs ? { ...base.activeOs } : null;
  if (!activeOs && futura) {
    activeOs = {
      id: futura.id || 0,
      osNumber: futura.osNumber,
      status: futura.status || "",
      missionStatus: gridItem?.missionStatus || "",
      clientName: texto(futura.clientName) || texto(gridItem?.clientName),
      origin: texto(futura.origin) || texto(gridItem?.origin) || null,
      destination: texto(futura.destination) || texto(gridItem?.destination) || null,
      priority: futura.priority || "",
      employee1: futura.employee1Name
        ? { id: 0, name: futura.employee1Name, fullName: futura.employee1Name, phone: futura.employee1Phone || null }
        : gridItem?.employee1 || null,
      employee2: futura.employee2Name
        ? { id: 0, name: futura.employee2Name, fullName: futura.employee2Name, phone: futura.employee2Phone || null }
        : gridItem?.employee2 || null,
      escortedDriverName: futura.escortedDriverName || null,
      escortedDriverPhone: futura.escortedDriverPhone || null,
      escortedVehiclePlate: futura.escortedVehiclePlate || null,
      lastAgentUpdate: null,
    };
  }
  // Grade da OS alvo: não deixa a missão ativa de outra OS emprestar a rota.
  if (!activeOs && gridItem) {
    activeOs = {
      id: gridItem.id || atualizacao.serviceOrderId || 0,
      osNumber: gridItem.osNumber || osNumber || "—",
      status: gridItem.status || "",
      missionStatus: gridItem.missionStatus || atualizacao.missionStep || "",
      clientName: texto(gridItem.clientName) || ficha.cliente || "—",
      origin: texto(gridItem.origin) || null,
      destination: texto(gridItem.destination) || null,
      priority: "",
      employee1: gridItem.employee1 || null,
      employee2: gridItem.employee2 || null,
      escortedDriverName: (gridItem as { escortedDriverName?: string | null }).escortedDriverName || null,
      escortedDriverPhone: (gridItem as { escortedDriverPhone?: string | null }).escortedDriverPhone || null,
      escortedVehiclePlate: (gridItem as { escortedVehiclePlate?: string | null }).escortedVehiclePlate || null,
      lastAgentUpdate: null,
    };
  }
  if (!activeOs && !gridItem) {
    activeOs = {
      id: atualizacao.serviceOrderId || 0,
      osNumber: osNumber || "—",
      status: "",
      missionStatus: atualizacao.missionStep || "",
      clientName: ficha.cliente || "—",
      origin: ficha.origem || null,
      destination: ficha.destino || null,
      priority: "",
      employee1: atualizacao.driver ? { id: 0, name: atualizacao.driver, fullName: atualizacao.driver, phone: null } : null,
      employee2: null,
      lastAgentUpdate: null,
    };
  }
  if (activeOs) {
    const anterior = activeOs.lastAgentUpdate || {};
    const mesmaOsFicha = !osNumber || !ficha.origem || texto(activeOs.origin) === texto(ficha.origem) || texto(gridItem?.origin) === texto(ficha.origem);
    activeOs = {
      ...activeOs,
      clientName: texto(activeOs.clientName) || texto(gridItem?.clientName) || ficha.cliente || "—",
      // Só completa origem/destino com a ficha se for a mesma OS — senão a TOR-1178 vaza na TOR-1215.
      origin: texto(activeOs.origin) || texto(gridItem?.origin) || (mesmaOsFicha ? texto(ficha.origem) : "") || null,
      destination: texto(activeOs.destination) || texto(gridItem?.destination) || (mesmaOsFicha ? texto(ficha.destino) : "") || null,
      lastAgentUpdate: {
        ...anterior,
        message: atualizacao.message,
        missionStep: atualizacao.missionStep || anterior.missionStep || gridItem?.lastAgentUpdate?.missionStep || null,
        agentName: atualizacao.driver || anterior.agentName || null,
      },
    };
  }

  const lat = coord(base.tracker?.latitude) ?? coord(atualizacao.latitude) ?? coord(gridItem?.tracker?.latitude);
  const lng = coord(base.tracker?.longitude) ?? coord(atualizacao.longitude) ?? coord(gridItem?.tracker?.longitude);
  const tracker = lat != null && lng != null
    ? { ...(base.tracker || {}), latitude: lat, longitude: lng }
    : base.tracker || null;

  return {
    vehicle: {
      ...base,
      plate: ficha.plate !== "—" ? ficha.plate : (texto(base.plate) || "—"),
      activeOs,
      tracker,
    },
    gridItem,
  };
}
