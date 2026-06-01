import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  FileText, Search, Download, RefreshCw,
  CheckCircle2, Clock, AlertTriangle, XCircle, Loader2,
  ChevronDown, ChevronUp, ArrowUpDown, CalendarDays, Pencil,
  X, MapPin, Truck, User, DollarSign, TrendingUp, TrendingDown,
  Fuel, CircleDollarSign, Receipt, Shield, Phone, Navigation,
  Gauge, Timer, Package, Eye, Target, Camera, Info,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseUTCDate } from "@/lib/utils";
import { authFetch } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { exportFormattedExcel } from "@/lib/excel-export";
import { CancelReasonBadge } from "@/components/cancel-reason-badge";
import { formatPhoneBR as displayPhoneBR } from "@/lib/format-contact";

interface ReportOS {
  id: number;
  osNumber: string;
  status: string;
  missionStatus: string;
  clientName: string;
  escortedVehiclePlate: string | null;
  escortedDriverName: string | null;
  escortedDriverPhone: string | null;
  origin: string | null;
  destination: string | null;
  waypoints: string[];
  scheduledDate: string | null;
  missionStartedAt: string | null;
  completedDate: string | null;
  createdAt: string | null;
  type: string | null;
  pedagioEstimado: number | null;
  pedagioIdaVolta: boolean;
  tollValue: number | null;
  estimatedValue: number | null;
  description: string | null;
  observations: string | null;
  priority: string;
  vehicle: { plate: string; model: string; brand?: string } | null;
  employee1: { id?: number; name: string; fullName?: string; phone?: string } | null;
  employee2: { id?: number; name: string; fullName?: string; phone?: string } | null;
  liveCost: {
    faturamento: number;
    faturamento_live?: number;
    pagamento: number;
    custo_combustivel: number;
    custo_pedagio: number;
    custo_outros: number;
    custo_salario?: number;
    custo_diaria?: number;
    custo_manutencao?: number;
    custo_multa?: number;
    custo_total: number;
    resultado: number;
    margem_pct: number;
    km_total: number;
    km_inicial: number;
    km_atual: number;
    horas_missao: number;
    horas_excedentes: number;
    fat_acionamento: number;
    fat_hora_extra: number;
    fat_km_extra: number;
    frozen: boolean;
    contrato_nome: string | null;
    contrato_valores: {
      valor_acionamento: number;
      franquia_horas: number;
      franquia_km: number;
      valor_hora_extra: number;
      valor_km_extra: number;
      valor_km_carregado: number;
      vrp_base: number;
    } | null;
  } | null;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  concluida: { label: "Concluída", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  "concluída": { label: "Concluída", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  em_andamento: { label: "Andamento", color: "text-sky-700", bg: "bg-sky-100", icon: Clock },
  agendada: { label: "Agendada", color: "text-amber-700", bg: "bg-amber-100", icon: AlertTriangle },
  cancelada: { label: "Cancelada", color: "text-red-700", bg: "bg-red-100", icon: XCircle },
  recusada: { label: "Recusada", color: "text-rose-700", bg: "bg-rose-100", icon: XCircle },
  pendente: { label: "Pendente", color: "text-orange-700", bg: "bg-orange-100", icon: Clock },
};

type SortField = "osNumber" | "status" | "clientName" | "scheduledDate" | "faturamento" | "resultado";

function fmtTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = parseUTCDate(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
}

function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = parseUTCDate(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
  } catch { return "—"; }
}

function effectiveStart(o: { scheduledDate?: string | null; missionStartedAt?: string | null }): string | null {
  const sd = o.scheduledDate || null;
  const ms = o.missionStartedAt || null;
  if (!sd) return ms;
  if (!ms) return sd;
  try {
    return new Date(ms).getTime() < new Date(sd).getTime() ? ms : sd;
  } catch {
    return sd;
  }
}

function truncRoute(str: string | null | undefined, max = 25): string {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function getTodayBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function OSSummaryModal({ os, onClose, onNavigateFinanceiro, onNavigatePhotos, inspectionSummary }: { os: ReportOS; onClose: () => void; onNavigateFinanceiro: (id: number) => void; onNavigatePhotos: (id: number) => void; inspectionSummary?: { total: number; approved: number; rejected: number; pending: number } | null }) {
  const lc = os.liveCost;
  const cv = lc?.contrato_valores;
  const sNorm = os.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  const cfg = statusConfig[sNorm] || statusConfig.pendente;
  const StatusIcon = cfg.icon;

  const InfoRow = ({ label, value, icon: Icon, mono }: { label: string; value: string | number | null | undefined; icon?: any; mono?: boolean }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-neutral-100 last:border-0">
      <span className="text-neutral-500 text-xs flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </span>
      <span className={`text-xs font-semibold text-neutral-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );

  const MoneyRow = ({ label, value, color = "text-neutral-800", bold }: { label: string; value: number; color?: string; bold?: boolean }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-neutral-100 last:border-0">
      <span className="text-neutral-500 text-xs">{label}</span>
      <span className={`text-xs ${bold ? "font-black" : "font-semibold"} ${color}`}>
        {value !== 0 ? fmtBRL(value) : "—"}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4" onClick={e => e.stopPropagation()} data-testid="modal-os-summary">
        <div className="rounded-t-2xl px-6 py-4" style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #1e3a5f 100%)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide" data-testid="text-summary-os">{os.osNumber}</h2>
                <p className="text-xs text-neutral-400">Resumo Completo da Operação</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${cfg.color} ${cfg.bg}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {cfg.label}
              </span>
              {lc?.frozen && <span className="text-[10px] text-blue-300 border border-blue-300/30 rounded px-2 py-0.5">Congelado</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onNavigatePhotos(os.id)}
                className={`gap-1.5 font-bold text-xs relative ${inspectionSummary?.rejected ? "bg-red-500 hover:bg-red-600 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"}`}
                data-testid="button-photos-os"
              >
                <Camera className="w-4 h-4" />
                Fotos
                {inspectionSummary?.rejected ? (
                  <span className="absolute -top-1.5 -right-1.5 bg-white text-red-600 text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center border border-red-500 animate-pulse">
                    {inspectionSummary.rejected}
                  </span>
                ) : null}
              </Button>
              <Button
                size="sm"
                onClick={() => onNavigateFinanceiro(os.id)}
                className="bg-amber-500 hover:bg-amber-600 text-black gap-1.5 font-bold text-xs"
                data-testid="button-financeiro-os"
              >
                <DollarSign className="w-4 h-4" />
                Financeiro
              </Button>
              <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors" data-testid="button-close-summary">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {inspectionSummary?.rejected ? (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-pulse cursor-pointer" onClick={() => onNavigatePhotos(os.id)} data-testid="alert-photo-divergence">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">
                  {inspectionSummary.rejected} foto{inspectionSummary.rejected > 1 ? "s" : ""} com divergência detectada pela IA
                </p>
                <p className="text-xs text-red-500">
                  {inspectionSummary.approved} aprovada{inspectionSummary.approved !== 1 ? "s" : ""} · {inspectionSummary.rejected} rejeitada{inspectionSummary.rejected !== 1 ? "s" : ""} de {inspectionSummary.total} total — Clique para ver detalhes
                </p>
              </div>
              <Camera className="w-5 h-5 text-red-400 shrink-0" />
            </div>
          ) : inspectionSummary && inspectionSummary.total > 0 ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 cursor-pointer" onClick={() => onNavigatePhotos(os.id)} data-testid="alert-photo-ok">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-emerald-700">
                  {inspectionSummary.approved} foto{inspectionSummary.approved !== 1 ? "s" : ""} aprovada{inspectionSummary.approved !== 1 ? "s" : ""} pela IA
                </p>
                <p className="text-xs text-emerald-500">Inspeção visual sem divergências — Clique para ver galeria</p>
              </div>
              <Camera className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 border-neutral-200">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Dados da OS
              </h4>
              <InfoRow label="Nº da OS" value={os.osNumber} mono />
              <InfoRow label="Tipo" value={os.type === "escolta" ? "Escolta Armada" : os.type || "—"} />
              <InfoRow label="Status" value={cfg.label} />
              <InfoRow label="Missão" value={os.missionStatus || "—"} />
              <InfoRow label="Prioridade" value={os.priority || "—"} />
              <InfoRow label="Criada em" value={fmtDateShort(os.createdAt)} icon={CalendarDays} />
            </Card>

            <Card className="p-4 border-neutral-200">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Cliente & Escoltado
              </h4>
              <InfoRow label="Cliente" value={os.clientName} />
              <InfoRow label="Contrato" value={lc?.contrato_nome} />
              <InfoRow label="Motorista" value={os.escortedDriverName} icon={User} />
              <InfoRow label="Tel. Motorista" value={os.escortedDriverPhone ? displayPhoneBR(os.escortedDriverPhone) : null} icon={Phone} />
              <InfoRow label="Placa Escoltado" value={os.escortedVehiclePlate} icon={Truck} mono />
              <InfoRow label="Valor Estimado" value={os.estimatedValue ? fmtBRL(os.estimatedValue) : "—"} />
            </Card>

            <Card className="p-4 border-neutral-200">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Equipe & Viatura
              </h4>
              <InfoRow label="Viatura" value={os.vehicle ? `${os.vehicle.plate} - ${os.vehicle.model}` : "—"} icon={Truck} mono />
              <InfoRow label="Agente 1" value={os.employee1?.fullName || os.employee1?.name} icon={User} />
              <InfoRow label="Tel. Agente 1" value={os.employee1?.phone} icon={Phone} />
              <InfoRow label="Agente 2" value={os.employee2?.fullName || os.employee2?.name} icon={User} />
              <InfoRow label="Tel. Agente 2" value={os.employee2?.phone} icon={Phone} />
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 border-neutral-200">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Rota & Horários
              </h4>
              <InfoRow label="Origem" value={os.origin} icon={Navigation} />
              <InfoRow label="Destino" value={os.destination} icon={MapPin} />
              {os.waypoints && os.waypoints.length > 0 && (
                <div className="py-1.5 border-b border-neutral-100">
                  <span className="text-neutral-500 text-xs">Paradas</span>
                  <div className="mt-1 space-y-0.5">
                    {os.waypoints.map((wp: any, i: number) => (
                      <p key={i} className="text-xs text-neutral-700 pl-5">{typeof wp === "string" ? wp : wp.address || wp.name || JSON.stringify(wp)}</p>
                    ))}
                  </div>
                </div>
              )}
              <InfoRow label="Agendamento" value={`${fmtDateShort(os.scheduledDate)} ${fmtTime(os.scheduledDate)}`} icon={CalendarDays} />
              <InfoRow label="Início Missão" value={`${fmtDateShort(os.missionStartedAt)} ${fmtTime(os.missionStartedAt)}`} icon={Timer} />
              <InfoRow label="Fim Missão" value={`${fmtDateShort(os.completedDate)} ${fmtTime(os.completedDate)}`} icon={Timer} />
              <InfoRow label="Duração" value={lc ? `${lc.horas_missao.toFixed(1)}h` : "—"} icon={Clock} />
              <InfoRow label="Horas Excedentes" value={lc?.horas_excedentes ? `${lc.horas_excedentes.toFixed(1)}h` : "—"} icon={Clock} />
            </Card>

            <Card className="p-4 border-neutral-200">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" /> Quilometragem
              </h4>
              <InfoRow label="KM Início (Chegada Origem)" value={lc?.km_inicial ? `${lc.km_inicial.toLocaleString("pt-BR")} km` : "—"} icon={Gauge} mono />
              <InfoRow label="KM Fim (Fim de Missão)" value={lc?.km_atual ? `${lc.km_atual.toLocaleString("pt-BR")} km` : "—"} icon={Gauge} mono />
              <InfoRow label="KM Total Rodado" value={lc?.km_total ? `${lc.km_total.toLocaleString("pt-BR")} km` : "—"} icon={Navigation} mono />
              <InfoRow label="Pedágio Estimado" value={os.pedagioEstimado ? fmtBRL(os.pedagioEstimado) : "—"} />
              <InfoRow label="Pedágio Ida e Volta" value={os.pedagioIdaVolta ? "Sim" : "Não"} />
              {os.description && <InfoRow label="Descrição" value={os.description} />}
              {os.observations && <InfoRow label="Observações" value={os.observations} />}
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 border-l-4 border-l-emerald-500 border-neutral-200">
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Receita (Faturamento)
              </h4>
              <MoneyRow label="Acionamento" value={lc?.fat_acionamento || 0} color="text-emerald-700" />
              <MoneyRow label="KM Extra" value={lc?.fat_km_extra || 0} color="text-emerald-700" />
              <MoneyRow label="Hora Extra" value={lc?.fat_hora_extra || 0} color="text-emerald-700" />
              <div className="my-2 border-t-2 border-emerald-200" />
              <MoneyRow label="TOTAL FATURAMENTO" value={lc?.faturamento || 0} color="text-emerald-700" bold />

              {cv && (
                <>
                  <div className="mt-4 mb-2">
                    <h5 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Valores do Contrato</h5>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between text-neutral-500">
                      <span>Acionamento</span>
                      <span className="font-mono">{fmtBRL(cv.valor_acionamento)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Franquia Horas</span>
                      <span className="font-mono">{cv.franquia_horas}h</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Franquia KM</span>
                      <span className="font-mono">{cv.franquia_km} km</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Valor Hora Extra</span>
                      <span className="font-mono">{fmtBRL(cv.valor_hora_extra)}/h</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Valor KM Extra</span>
                      <span className="font-mono">{fmtBRL(cv.valor_km_extra)}/km</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>Valor KM Carregado</span>
                      <span className="font-mono">{fmtBRL(cv.valor_km_carregado)}/km</span>
                    </div>
                    <div className="flex justify-between text-neutral-500">
                      <span>VRP Base</span>
                      <span className="font-mono">{fmtBRL(cv.vrp_base)}</span>
                    </div>
                  </div>
                </>
              )}
            </Card>

            <Card className="p-4 border-l-4 border-l-red-500 border-neutral-200">
              <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> Despesas (Custos)
              </h4>
              <MoneyRow label="Pagamento Agentes (VRP)" value={lc?.pagamento || 0} color="text-red-700" />
              <MoneyRow label="Salários (rateio diário)" value={lc?.custo_salario || 0} color="text-red-700" />
              <MoneyRow label="Diária Contrato (rateio)" value={lc?.custo_diaria || 0} color="text-red-700" />
              <MoneyRow label="Combustível (rateio)" value={lc?.custo_combustivel || 0} color="text-red-700" />
              <MoneyRow label="Manutenção (rateio dia)" value={lc?.custo_manutencao || 0} color="text-red-700" />
              <MoneyRow label="Multas (rateio)" value={lc?.custo_multa || 0} color="text-red-700" />
              <MoneyRow label="Pedágio" value={lc?.custo_pedagio || 0} color="text-red-700" />
              <MoneyRow label="Outros Custos" value={lc?.custo_outros || 0} color="text-red-700" />
              <div className="my-2 border-t-2 border-red-200" />
              <MoneyRow label="TOTAL DESPESAS" value={lc?.custo_total || 0} color="text-red-700" bold />
            </Card>
          </div>

          <Card className="p-4 border-neutral-200" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Receita</p>
                <p className="text-xl font-black text-emerald-600" data-testid="text-summary-receita">{fmtBRL(lc?.faturamento || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Despesas</p>
                <p className="text-xl font-black text-red-600" data-testid="text-summary-despesas">{fmtBRL(lc?.custo_total || 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Resultado</p>
                <p className={`text-xl font-black ${(lc?.resultado || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`} data-testid="text-summary-resultado">
                  {fmtBRL(lc?.resultado || 0)}
                </p>
                <p className={`text-xs font-bold mt-0.5 ${(lc?.margem_pct || 0) >= 40 ? "text-emerald-500" : (lc?.margem_pct || 0) >= 20 ? "text-amber-500" : "text-red-500"}`}>
                  Margem: {(lc?.margem_pct || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function RelatorioOSPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOs, setSelectedOs] = useState<ReportOS | null>(null);
  const [sortField, setSortField] = useState<SortField>("scheduledDate");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState<string>(getTodayBRT());
  const [dateTo, setDateTo] = useState<string>(getTodayBRT());

  // Regra unificada (alinhada com Custos Fixos / Balanço Gerencial):
  // Meta diária = max(PISO_OPERACIONAL, viaturas × META_DIARIA_VIATURA)
  // Piso garante receita mínima mesmo com frota reduzida.
  const META_DIARIA_VIATURA = 2000;
  const PISO_DIARIO_FIXO = 6000;
  const PISO_POR_VIATURA = 2000;
  const isActiveVehicle = (v: any) => v.status !== "inativo" && !!(v.trackerId || v.truckscontrolIdentifier);

  const { data: allVehicles } = useQuery<any[]>({
    queryKey: ["/api/vehicles"],
  });

  const metas = useMemo(() => {
    const activeCount = (allVehicles || []).filter(isActiveVehicle).length;
    const d1 = new Date(dateFrom + "T12:00:00");
    const d2 = new Date(dateTo + "T12:00:00");
    const days = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const metaPorViaturaDia = META_DIARIA_VIATURA * activeCount;
    const piso = Math.max(PISO_DIARIO_FIXO, activeCount * PISO_POR_VIATURA);
    const diaria = Math.max(metaPorViaturaDia, piso);
    const pisoAplicado = piso > metaPorViaturaDia;
    const receita = diaria * days;
    return { receita, viaturas: activeCount, dias: days, diaria, pisoAplicado, piso };
  }, [allVehicles, dateFrom, dateTo]);

  const pctOf = (value: number, meta: number) => meta > 0 ? Math.min((value / meta) * 100, 150) : 0;
  const pctBar = (value: number, meta: number) => meta > 0 ? Math.min((value / meta) * 100, 100) : 0;

  const gridUrl = `/api/operational-grid?from=${dateFrom}&to=${dateTo}`;

  const { data: gridData = [], isLoading, refetch, isFetching } = useQuery<ReportOS[]>({
    queryKey: ["/api/operational-grid", dateFrom, dateTo],
    queryFn: async () => {
      const res = await authFetch(gridUrl);
      if (!res.ok) throw new Error("Erro ao buscar dados");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  const { data: financialDash } = useQuery<{ byMission?: any[] }>({ queryKey: ["/api/financial/dashboard"], staleTime: 60000 });
  const billingByOsId = useMemo(() => {
    const map = new Map<number, { fat: number; km: number; pedagio: number }>();
    const missions = financialDash?.byMission || [];
    for (const m of missions) {
      const sid = Number(m.service_order_id);
      if (!sid) continue;
      map.set(sid, {
        fat: Number(m.fat_total) || 0,
        km: Number(m.km_total) || 0,
        pedagio: Number(m.despesas_pedagio) || 0,
      });
    }
    return map;
  }, [financialDash]);
  // Faturamento SEMPRE ao vivo: usa o recálculo em tempo real do operational-grid
  // (`faturamento_live`), que recalcula a hora extra inclusive nas concluídas — não usa
  // mais o billing congelado. Recusada tem liveCost nulo => 0. Cancelada preserva
  // acionamento+extras (calcularFaturamentoLive sempre soma o acionamento do contrato).
  const liveFat = (o: ReportOS) =>
    Number(o.liveCost?.faturamento_live ?? o.liveCost?.faturamento) || 0;
  const effectiveFat = (o: ReportOS) => liveFat(o);
  const effectiveKm = (o: ReportOS) => Number(o.liveCost?.km_total) || 0;
  const effectiveResultado = (o: ReportOS) => {
    const fat = effectiveFat(o);
    const custo = Number(o.liveCost?.custo_total) || 0;
    return fat - custo;
  };
  const effectiveMargem = (o: ReportOS) => {
    const fat = effectiveFat(o);
    if (fat <= 0) return 0;
    return (effectiveResultado(o) / fat) * 100;
  };
  // Só a recusada fica de fora do total (R$ 0,00). Cancelada entra.
  const isExcluded = (o: ReportOS) => o.status === "recusada";

  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/invoices"], staleTime: 60000 });
  const { data: invoiceMap = {} } = useQuery<Record<string, { invoiceId: number; billingStatus: string }>>({
    queryKey: ["/api/service-orders/invoice-map"],
    staleTime: 60000,
  });
  const invoiceByOs = useMemo(() => {
    const byId = new Map<number, any>();
    for (const inv of invoices) byId.set(inv.id, inv);

    const map = new Map<number, any>();
    for (const inv of invoices) {
      const sid = inv.service_order_id ?? inv.serviceOrderId;
      if (sid) {
        const prev = map.get(sid);
        if (!prev || new Date(inv.created_at || inv.createdAt || 0) > new Date(prev.created_at || prev.createdAt || 0)) {
          map.set(sid, inv);
        }
      }
    }
    for (const [osId, info] of Object.entries(invoiceMap)) {
      const osIdNum = Number(osId);
      if (map.has(osIdNum)) continue;
      const inv = byId.get(info.invoiceId);
      if (inv) map.set(osIdNum, inv);
    }
    return map;
  }, [invoices, invoiceMap]);

  const osIds = useMemo(() => gridData.map(o => o.id), [gridData]);

  const { data: inspectionMap = {} } = useQuery<Record<number, { total: number; approved: number; rejected: number; pending: number }>>({
    queryKey: ["/api/mission/photo-inspections-batch", osIds],
    queryFn: async () => {
      if (osIds.length === 0) return {};
      const res = await authFetch("/api/mission/photo-inspections-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ osIds }),
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: osIds.length > 0,
    staleTime: 60000,
  });

  const filtered = useMemo(() => {
    let items = [...gridData];

    if (statusFilter !== "all") {
      items = items.filter(o => {
        const s = o.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return s === statusFilter;
      });
    } else {
      items = items.filter(o => !isExcluded(o));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(o =>
        (o.osNumber || "").toLowerCase().includes(q) ||
        (o.clientName || "").toLowerCase().includes(q) ||
        (o.vehicle?.plate || "").toLowerCase().includes(q) ||
        (o.employee1?.name || "").toLowerCase().includes(q) ||
        (o.origin || "").toLowerCase().includes(q) ||
        (o.destination || "").toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      let va: any, vb: any;
      switch (sortField) {
        case "osNumber": va = a.osNumber; vb = b.osNumber; break;
        case "status": va = a.status; vb = b.status; break;
        case "clientName": va = a.clientName; vb = b.clientName; break;
        case "scheduledDate": va = effectiveStart(a) || ""; vb = effectiveStart(b) || ""; break;
        case "faturamento": va = effectiveFat(a); vb = effectiveFat(b); break;
        case "resultado": va = effectiveResultado(a); vb = effectiveResultado(b); break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [gridData, statusFilter, search, sortField, sortDir]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { concluida: 0, em_andamento: 0, agendada: 0, cancelada: 0, recusada: 0, pendente: 0 };
    gridData.forEach(o => {
      const s = o.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (s === "concluida" || s === "concluída") counts.concluida++;
      else if (s === "em_andamento") counts.em_andamento++;
      else if (s === "agendada") counts.agendada++;
      else if (s === "cancelada") counts.cancelada++;
      else if (s === "recusada") counts.recusada++;
      else counts.pendente++;
    });
    return counts;
  }, [gridData]);

  const totals = useMemo(() => {
    const t = { receita: 0, custo: 0, pedagio: 0, resultado: 0, km: 0, pagamento: 0, salario: 0, diaria: 0, combustivel: 0, manutencao: 0, multa: 0, outros: 0 };
    filtered.forEach(o => {
      const lc = o.liveCost;
      t.receita += effectiveFat(o);
      t.custo += lc?.custo_total || 0;
      t.pedagio += lc?.custo_pedagio || 0;
      t.resultado += effectiveResultado(o);
      t.km += effectiveKm(o);
      t.pagamento += lc?.pagamento || 0;
      t.salario += lc?.custo_salario || 0;
      t.diaria += lc?.custo_diaria || 0;
      t.combustivel += lc?.custo_combustivel || 0;
      t.manutencao += lc?.custo_manutencao || 0;
      t.multa += lc?.custo_multa || 0;
      t.outros += lc?.custo_outros || 0;
    });
    return t;
  }, [filtered, billingByOsId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-neutral-300" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-white" /> : <ChevronDown className="w-3 h-3 text-white" />;
  };

  const exportExcel = () => {
    const headers = ["#", "OS", "Status", "Cliente", "Veíc. Escoltado", "Viatura", "Agente 1", "Agente 2", "Origem", "Destino", "Data Inicial", "Hora Inicial", "Data Final", "Hora Final", "Faturamento", "Custo Total", "Pedágio", "Resultado", "% Margem", "KM Total"];
    const rows = filtered.map((o, i) => [
      i + 1,
      o.osNumber,
      o.status === "completed" ? "Concluída" : o.status === "in_progress" ? "Em Andamento" : o.status === "cancelled" ? "Cancelada" : o.status,
      o.clientName,
      o.escortedVehiclePlate || "",
      o.vehicle?.plate || "",
      o.employee1?.name || "",
      o.employee2?.name || "",
      o.origin || "",
      o.destination || "",
      fmtDateShort(effectiveStart(o)),
      fmtTime(effectiveStart(o)),
      fmtDateShort(o.completedDate),
      fmtTime(o.completedDate),
      Number((effectiveFat(o)).toFixed(2)),
      Number((o.liveCost?.custo_total || 0).toFixed(2)),
      Number((o.liveCost?.custo_pedagio || 0).toFixed(2)),
      Number((effectiveResultado(o)).toFixed(2)),
      ((effectiveMargem(o))).toFixed(1) + "%",
      Number((effectiveKm(o)).toFixed(0)),
    ]);
    const totFat = filtered.reduce((s, o) => s + effectiveFat(o), 0);
    const totCusto = filtered.reduce((s, o) => s + (o.liveCost?.custo_total || 0), 0);
    const totPed = filtered.reduce((s, o) => s + (o.liveCost?.custo_pedagio || 0), 0);
    const totRes = filtered.reduce((s, o) => s + effectiveResultado(o), 0);
    const totKm = filtered.reduce((s, o) => s + effectiveKm(o), 0);
    const totalsRow: (string | number)[] = Array(20).fill("");
    totalsRow[0] = "TOTAL";
    totalsRow[13] = `${filtered.length} OS`;
    totalsRow[14] = Number(totFat.toFixed(2));
    totalsRow[15] = Number(totCusto.toFixed(2));
    totalsRow[16] = Number(totPed.toFixed(2));
    totalsRow[17] = Number(totRes.toFixed(2));
    totalsRow[18] = totFat > 0 ? ((totRes / totFat) * 100).toFixed(1) + "%" : "0%";
    totalsRow[19] = Number(totKm.toFixed(0));
    const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    exportFormattedExcel({
      title: "RELATÓRIO DE ORDENS DE SERVIÇO — TORRES VIGILÂNCIA PATRIMONIAL",
      subtitle: "CNPJ 36.982.392/0001-89 — Serviço de Escolta Armada",
      period: `Gerado em ${today}`,
      headers,
      colWidths: [5, 12, 12, 25, 14, 12, 20, 20, 28, 28, 12, 10, 12, 10, 14, 14, 12, 14, 10, 10],
      rows,
      totalsRow,
      currencyColumns: [14, 15, 16, 17],
      fileName: `Relatorio_OS_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}.xlsx`,
      sheetName: "Relatório OS",
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 40%, #1e3a5f 100%)" }}>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-report-title">
                    RELATÓRIO DE OS — {filtered.length} missões
                  </h1>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {dateFrom === dateTo
                      ? `Ordens de Serviço — ${new Date(dateFrom + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })}`
                      : `Ordens de Serviço — ${new Date(dateFrom + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })} a ${new Date(dateTo + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" })}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(["concluida", "em_andamento", "agendada", "cancelada", "recusada"] as const).map(s => {
                  const cfg = statusConfig[s];
                  const count = statusCounts[s] || 0;
                  const active = statusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(active ? "all" : s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${active ? "bg-white/20 border-white/30 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}`}
                      data-testid={`filter-${s}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${active ? "bg-white" : cfg.bg}`} />
                      {cfg.label} {count}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input
                  placeholder="Buscar OS, cliente, placa..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 bg-white/10 border-white/10 text-white placeholder:text-neutral-500 h-9 text-sm"
                  data-testid="input-search-report"
                />
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-neutral-400 shrink-0" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-white/10 border-white/10 text-white h-9 text-sm w-[140px] [color-scheme:dark]"
                  data-testid="input-date-from"
                />
                <span className="text-neutral-500 text-xs">até</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="bg-white/10 border-white/10 text-white h-9 text-sm w-[140px] [color-scheme:dark]"
                  data-testid="input-date-to"
                />
                {(dateFrom !== getTodayBRT() || dateTo !== getTodayBRT()) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setDateFrom(getTodayBRT()); setDateTo(getTodayBRT()); }}
                    className="text-neutral-400 hover:text-white hover:bg-white/10 h-9 px-2 text-xs"
                    data-testid="button-reset-dates"
                  >
                    Hoje
                  </Button>
                )}
              </div>
              <Button size="sm" onClick={async () => {
                const liveOs = gridData.filter(o => {
                  const s = (o.status || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  return s === "em_andamento" || s === "agendada";
                });
                if (liveOs.length > 0) {
                  setIsRecalculating(true);
                  try {
                    await Promise.allSettled(liveOs.map(o =>
                      authFetch(`/api/boletim-medicao/calcular/${o.id}`, { method: "POST" })
                    ));
                  } finally {
                    setIsRecalculating(false);
                  }
                }
                await refetch();
              }} disabled={isFetching || isRecalculating} className="bg-white/10 hover:bg-white/20 text-white border border-white/10 gap-2" data-testid="button-refresh-report">
                <RefreshCw className={`w-4 h-4 ${(isFetching || isRecalculating) ? "animate-spin" : ""}`} />
                {isRecalculating ? "Recalculando..." : "Atualizar"}
              </Button>
              <Button size="sm" onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="button-export-excel">
                <Download className="w-4 h-4" />
                Exportar Excel
              </Button>
            </div>
            {metas.receita > 0 && (
              <div className="mt-4 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <Target className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Meta do Período</span>
                <span className="text-sm font-black text-white">{fmtBRL(metas.receita)}</span>
                <span className="text-[10px] text-neutral-500">
                  {metas.pisoAplicado
                    ? `(piso operacional ${fmtBRL(metas.diaria)}/dia × ${metas.dias}d)`
                    : `(${metas.viaturas} viat. × ${metas.dias}d × ${fmtBRL(META_DIARIA_VIATURA)}/dia)`}
                </span>
                {metas.pisoAplicado && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded px-1.5 py-0.5 uppercase tracking-wider" title={`Piso operacional: max(R$ 6.000, ${metas.viaturas} viat. × R$ 2.000) = ${fmtBRL(metas.piso)}/dia`}>
                    Piso aplicado
                  </span>
                )}
                <div className="flex-1 min-w-[120px]">
                  <div className="flex items-center justify-between text-[9px] mb-0.5">
                    <span className="text-neutral-500">Receita: {fmtBRL(totals.receita)}</span>
                    <span className={`font-bold ${pctOf(totals.receita, metas.receita) >= 100 ? "text-emerald-400" : pctOf(totals.receita, metas.receita) >= 50 ? "text-amber-400" : "text-red-400"}`}>{pctOf(totals.receita, metas.receita).toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${pctOf(totals.receita, metas.receita) >= 100 ? "bg-emerald-400" : pctOf(totals.receita, metas.receita) >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pctBar(totals.receita, metas.receita)}%` }} />
                  </div>
                </div>
                {pctOf(totals.receita, metas.receita) >= 100 && (
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Meta Batida!</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Receita Total</p>
                <p className="text-lg font-black text-emerald-400" data-testid="text-total-receita">{fmtBRL(totals.receita)}</p>
                {metas.receita > 0 && (
                  <p className={`text-[10px] font-bold mt-0.5 ${pctOf(totals.receita, metas.receita) >= 100 ? "text-emerald-400" : "text-amber-400"}`}>{pctOf(totals.receita, metas.receita).toFixed(1)}% da meta</p>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-left hover:bg-white/10 transition-colors" data-testid="btn-total-custo-detail">
                    <p className="text-[10px] text-neutral-400 uppercase font-semibold flex items-center gap-1">
                      Custo Total <Info className="w-3 h-3" />
                    </p>
                    <p className="text-lg font-black text-red-400" data-testid="text-total-custo">{fmtBRL(totals.custo)}</p>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-3 text-xs" align="start">
                  <div className="font-bold text-neutral-700 mb-2 uppercase text-[10px] tracking-wider">Detalhamento de Custos do Período</div>
                  <div className="space-y-1">
                    {[
                      { label: "Pagamento Agentes (VRP)", v: totals.pagamento },
                      { label: "Salários (rateio diário)", v: totals.salario },
                      { label: "Diária Contrato (rateio)", v: totals.diaria },
                      { label: "Combustível (rateio)", v: totals.combustivel },
                      { label: "Manutenção (rateio dia)", v: totals.manutencao },
                      { label: "Multas (rateio)", v: totals.multa },
                      { label: "Pedágio", v: totals.pedagio },
                      { label: "Outros Custos", v: totals.outros },
                    ].map((it) => (
                      <div key={it.label} className="flex justify-between">
                        <span className="text-neutral-600">{it.label}</span>
                        <span className={`font-semibold ${it.v > 0 ? "text-red-700" : "text-neutral-300"}`}>{fmtBRL(it.v)}</span>
                      </div>
                    ))}
                    <div className="border-t border-neutral-200 mt-2 pt-2 flex justify-between font-bold">
                      <span>TOTAL</span>
                      <span className="text-red-700">{fmtBRL(totals.custo)}</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Pedágio Total</p>
                <p className="text-lg font-black text-amber-400" data-testid="text-total-pedagio">{fmtBRL(totals.pedagio)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">Resultado</p>
                <p className={`text-lg font-black ${totals.resultado >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid="text-total-resultado">{fmtBRL(totals.resultado)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="text-[10px] text-neutral-400 uppercase font-semibold">KM Total</p>
                <p className="text-lg font-black text-cyan-400" data-testid="text-total-km">{Math.round(totals.km)} km</p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <Card><div className="p-12 text-center text-neutral-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando relatório...</div></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-report-os">
                <thead>
                  <tr className="bg-neutral-900 text-white text-[10px] uppercase tracking-wider">
                    <th className="px-2 py-2.5 text-center w-8">#</th>
                    <th className="px-2 py-2.5 text-left cursor-pointer select-none" onClick={() => handleSort("osNumber")}>
                      <span className="flex items-center gap-1">OS <SortIcon field="osNumber" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-left cursor-pointer select-none" onClick={() => handleSort("status")}>
                      <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-left cursor-pointer select-none" onClick={() => handleSort("clientName")}>
                      <span className="flex items-center gap-1">Cliente <SortIcon field="clientName" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-left">Veíc. Escoltado</th>
                    <th className="px-2 py-2.5 text-left">Contrato</th>
                    <th className="px-2 py-2.5 text-left">Viatura</th>
                    <th className="px-2 py-2.5 text-left">Agentes</th>
                    <th className="px-2 py-2.5 text-left">Rota</th>
                    <th className="px-2 py-2.5 text-center cursor-pointer select-none" onClick={() => handleSort("scheduledDate")} title="Início real: o mais cedo entre Agendamento e Início da Missão">
                      <span className="flex items-center gap-1 justify-center">Início Real <SortIcon field="scheduledDate" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-center" title="Quando a equipe encerrou a missão (Término)">Data Final</th>
                    <th className="px-2 py-2.5 text-center" title="Quando a equipe encerrou a missão (Término)">Hora Final</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer select-none" onClick={() => handleSort("faturamento")}>
                      <span className="flex items-center gap-1 justify-end">Faturamento <SortIcon field="faturamento" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-center">NF / Cobrança</th>
                    <th className="px-2 py-2.5 text-right">Custo Total</th>
                    <th className="px-2 py-2.5 text-right cursor-pointer select-none" onClick={() => handleSort("resultado")}>
                      <span className="flex items-center gap-1 justify-end">Resultado <SortIcon field="resultado" /></span>
                    </th>
                    <th className="px-2 py-2.5 text-center">% Acerto</th>
                    <th className="px-2 py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={18} className="py-12 text-center text-neutral-400">Nenhuma OS encontrada</td></tr>
                  ) : filtered.map((o, idx) => {
                    const sNorm = o.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
                    const cfg = statusConfig[sNorm] || statusConfig.pendente;
                    const StatusIcon = cfg.icon;
                    const fat = o.liveCost?.faturamento || 0;
                    const custoT = o.liveCost?.custo_total || 0;
                    const result = o.liveCost?.resultado || 0;
                    const margem = o.liveCost?.margem_pct || 0;
                    const agents = [o.employee1?.name, o.employee2?.name].filter(Boolean).join(" / ") || "—";
                    const route = `${truncRoute(o.origin, 20)} → ${truncRoute(o.destination, 20)}`;
                    return (
                      <tr key={o.id} className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-neutral-50/50"}`} data-testid={`row-os-${o.id}`}>
                        <td className="px-2 py-2 text-center text-neutral-400 font-mono">{idx + 1}</td>
                        <td className="px-2 py-2 font-bold text-neutral-900 whitespace-nowrap" data-testid={`text-os-${o.osNumber}`}>{o.osNumber}</td>
                        <td className="px-2 py-2">
                          <div className="inline-flex items-center gap-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.color} ${cfg.bg}`} data-testid={`badge-status-${o.id}`}>
                              <StatusIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                            <CancelReasonBadge status={o.status} reason={(o as any).cancellationReason} />
                          </div>
                        </td>
                        <td className="px-2 py-2 font-semibold text-neutral-800 max-w-[120px] truncate">{o.clientName || "—"}</td>
                        <td className="px-2 py-2 text-neutral-600 whitespace-nowrap">{o.escortedVehiclePlate || "—"}</td>
                        <td className="px-2 py-2 text-neutral-600 max-w-[100px] truncate">{o.liveCost?.contrato_nome || "—"}</td>
                        <td className="px-2 py-2 font-mono text-neutral-700 whitespace-nowrap">{o.vehicle?.plate || "—"}</td>
                        <td className="px-2 py-2 text-neutral-600 max-w-[150px] truncate">{agents}</td>
                        <td className="px-2 py-2 text-neutral-500 max-w-[180px] truncate" title={`${o.origin || ""} → ${o.destination || ""}`}>{route}</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          {(() => { const eff = effectiveStart(o); return (
                            <>
                              <span className="text-neutral-800 font-semibold">{fmtDateShort(eff)}</span>
                              <span className="text-neutral-400 ml-1">{fmtTime(eff)}</span>
                            </>
                          ); })()}
                        </td>
                        <td className="px-2 py-2 text-center text-neutral-600 whitespace-nowrap">{fmtDateShort(o.completedDate)}</td>
                        <td className="px-2 py-2 text-center text-neutral-600 whitespace-nowrap">{fmtTime(o.completedDate)}</td>
                        <td className={`px-2 py-2 text-right whitespace-nowrap ${(o.liveCost?.fat_hora_extra || 0) > 0 ? "font-black text-amber-600" : "font-bold text-emerald-700"}`} data-testid={`text-faturamento-${o.id}`}>
                          {fat > 0 ? (
                            (o.liveCost?.fat_hora_extra || 0) > 0 ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="inline-flex items-center gap-1 hover:underline" data-testid={`btn-fat-detail-${o.id}`}>
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    {fmtBRL(fat)}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-3 text-xs" align="end">
                                  <div className="font-bold text-amber-700 mb-2 uppercase text-[10px] tracking-wider flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Faturamento c/ Hora Extra
                                  </div>
                                  {(() => {
                                    const lc = o.liveCost!;
                                    const cv = lc.contrato_valores;
                                    const items: { label: string; v: number; highlight?: boolean }[] = [
                                      { label: "Acionamento", v: lc.fat_acionamento || 0 },
                                      { label: "KM excedente", v: lc.fat_km_extra || 0 },
                                      { label: `Hora extra (${(lc.horas_excedentes || 0).toFixed(1)}h × ${fmtBRL(cv?.valor_hora_extra || 0)})`, v: lc.fat_hora_extra || 0, highlight: true },
                                    ];
                                    return (
                                      <div className="space-y-1">
                                        {items.map((it) => (
                                          <div key={it.label} className="flex justify-between">
                                            <span className="text-neutral-600">{it.label}</span>
                                            <span className={`font-semibold ${it.highlight ? "text-amber-700" : (it.v > 0 ? "text-emerald-700" : "text-neutral-300")}`}>{fmtBRL(it.v)}</span>
                                          </div>
                                        ))}
                                        <div className="border-t border-neutral-200 pt-1 mt-2 flex justify-between font-bold">
                                          <span>Total</span>
                                          <span className="text-emerald-700">{fmtBRL(fat)}</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-neutral-100 text-[10px] text-neutral-500">
                                          Franquia: {(cv?.franquia_horas || 0).toFixed(1)}h · Missão: {(lc.horas_missao || 0).toFixed(1)}h
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </PopoverContent>
                              </Popover>
                            ) : fmtBRL(fat)
                          ) : "—"}
                        </td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          {(() => {
                            const inv = invoiceByOs.get(o.id);
                            if (!inv) {
                              const concluida = sNorm === "concluida";
                              return concluida && fat > 0
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200" data-testid={`badge-nf-${o.id}`}>Não Faturado</span>
                                : <span className="text-[10px] text-neutral-300">—</span>;
                            }
                            const st = (inv.status || "").toUpperCase();
                            const map: Record<string, { label: string; cls: string }> = {
                              AGUARDANDO_FATURAMENTO: { label: "Aguard. Faturamento", cls: "text-orange-700 bg-orange-50 border-orange-200" },
                              PENDING:                 { label: "Em Aberto", cls: "text-yellow-700 bg-yellow-50 border-yellow-200" },
                              CONFIRMED:               { label: "Recebido", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                              RECEIVED:                { label: "Recebido", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                              RECEIVED_IN_CASH:        { label: "Pago Manual", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                              OVERDUE:                 { label: "Vencido", cls: "text-red-700 bg-red-50 border-red-200" },
                              CANCELLED:               { label: "Cancelado", cls: "text-neutral-500 bg-neutral-100 border-neutral-200" },
                            };
                            const cfgInv = map[st] || { label: st || "Faturado", cls: "text-blue-700 bg-blue-50 border-blue-200" };
                            return (
                              <Link href="/admin/faturas">
                                <a className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border hover:opacity-80 ${cfgInv.cls}`} data-testid={`badge-nf-${o.id}`} title={`Fatura #${inv.id}${inv.due_date ? ` · venc ${inv.due_date}` : ""}`}>
                                  {cfgInv.label}
                                </a>
                              </Link>
                            );
                          })()}
                        </td>
                        <td className="px-2 py-2 text-right text-red-600 whitespace-nowrap">
                          {custoT > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="inline-flex items-center gap-1 hover:underline" data-testid={`btn-custo-detail-${o.id}`}>
                                  {fmtBRL(custoT)}
                                  <Info className="w-3 h-3 text-neutral-400" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-3 text-xs" align="end">
                                <div className="font-bold text-neutral-700 mb-2 uppercase text-[10px] tracking-wider">Detalhamento de Custos</div>
                                {(() => {
                                  const lc = o.liveCost!;
                                  const items: { label: string; v: number }[] = [
                                    { label: "Pagamento Agentes (VRP)", v: lc.pagamento || 0 },
                                    { label: "Salários (rateio diário)", v: lc.custo_salario || 0 },
                                    { label: "Diária Contrato (rateio)", v: lc.custo_diaria || 0 },
                                    { label: "Combustível (rateio)", v: lc.custo_combustivel || 0 },
                                    { label: "Manutenção (rateio dia)", v: lc.custo_manutencao || 0 },
                                    { label: "Multas (rateio)", v: lc.custo_multa || 0 },
                                    { label: "Pedágio", v: lc.custo_pedagio || 0 },
                                    { label: "Outros Custos", v: lc.custo_outros || 0 },
                                  ];
                                  return (
                                    <div className="space-y-1">
                                      {items.map((it) => (
                                        <div key={it.label} className="flex justify-between">
                                          <span className="text-neutral-600">{it.label}</span>
                                          <span className={`font-semibold ${it.v > 0 ? "text-red-700" : "text-neutral-300"}`}>{fmtBRL(it.v)}</span>
                                        </div>
                                      ))}
                                      <div className="border-t border-neutral-200 mt-2 pt-2 flex justify-between font-bold">
                                        <span>TOTAL</span>
                                        <span className="text-red-700">{fmtBRL(custoT)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </PopoverContent>
                            </Popover>
                          ) : "—"}
                        </td>
                        <td className={`px-2 py-2 text-right font-black whitespace-nowrap ${result >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fat > 0 ? fmtBRL(result) : "—"}</td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          {fat > 0 ? (
                            <span className={`font-bold ${margem >= 40 ? "text-emerald-600" : margem >= 20 ? "text-amber-600" : "text-red-600"}`}>
                              {margem.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 hover:bg-emerald-50"
                              onClick={() => setSelectedOs(o)}
                              title={`Resumo ${o.osNumber}`}
                              data-testid={`button-summary-os-${o.id}`}
                            >
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 hover:bg-amber-50"
                              onClick={() => navigate(`/admin/financeiro?search=${o.osNumber}`)}
                              title={`Financeiro ${o.osNumber}`}
                              data-testid={`button-financeiro-os-${o.id}`}
                            >
                              <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 hover:bg-blue-50"
                              onClick={() => navigate(`/admin/service-orders?os=${o.id}`)}
                              title={`Editar ${o.osNumber}`}
                              data-testid={`button-edit-os-${o.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5 text-blue-600" />
                            </Button>
                            {(() => {
                              const insp = inspectionMap[o.id];
                              const hasPhotos = insp && insp.total > 0;
                              const hasRejected = insp && insp.rejected > 0;
                              return (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={`h-7 w-7 p-0 relative ${hasRejected ? "hover:bg-red-50" : "hover:bg-purple-50"}`}
                                  onClick={() => navigate(`/admin/photo-inspection/${o.id}`)}
                                  title={hasRejected ? `Fotos com divergência - ${o.osNumber}` : `Inspeção de Fotos ${o.osNumber}`}
                                  data-testid={`button-photo-inspection-${o.id}`}
                                >
                                  <Camera className={`w-3.5 h-3.5 ${hasRejected ? "text-red-600" : hasPhotos ? "text-purple-600" : "text-neutral-400"}`} />
                                  {hasRejected && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                                      <AlertTriangle className="w-2 h-2 text-white" />
                                    </span>
                                  )}
                                  {hasPhotos && !hasRejected && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white" />
                                  )}
                                </Button>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="bg-neutral-900 text-white font-black text-xs">
                      <td colSpan={13} className="px-2 py-2.5 text-right uppercase tracking-wider">TOTAIS →</td>
                      <td className="px-2 py-2.5 text-right text-emerald-400">{fmtBRL(totals.receita)}</td>
                      <td className="px-2 py-2.5 text-right text-red-400">{fmtBRL(totals.custo)}</td>
                      <td className={`px-2 py-2.5 text-right ${totals.resultado >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtBRL(totals.resultado)}</td>
                      <td className="px-2 py-2.5 text-center text-blue-400">{totals.receita > 0 ? ((totals.resultado / totals.receita) * 100).toFixed(1) + "%" : "—"}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        )}
      </div>
      {selectedOs && (
        <OSSummaryModal
          os={selectedOs}
          onClose={() => setSelectedOs(null)}
          onNavigateFinanceiro={() => { setSelectedOs(null); navigate(`/admin/financeiro?search=${selectedOs!.osNumber}`); }}
          onNavigatePhotos={() => { setSelectedOs(null); navigate(`/admin/photo-inspection/${selectedOs!.id}`); }}
          inspectionSummary={inspectionMap[selectedOs.id] || null}
        />
      )}
    </AdminLayout>
  );
}