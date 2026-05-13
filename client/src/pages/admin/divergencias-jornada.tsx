import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, Calendar, Loader2, ShieldAlert, Clock, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/layout";

type Divergencia =
  | {
      tipo: "MISSAO_SEM_PONTO";
      severidade: "alta";
      osId: number;
      osNumber: string;
      clientName: string;
      employeeId: number;
      employeeName: string;
      missionStartedAt: string | null;
      completedDate: string | null;
      detalhe: string;
    }
  | {
      tipo: "PONTO_FECHADO_OS_ABERTA";
      severidade: "media";
      osId: number;
      osNumber: string;
      clientName: string;
      employeeId: number;
      employeeName: string;
      missionStartedAt: string | null;
      completedDate: string | null;
      lastPunchOutAt: string;
      diffMinutos: number;
      detalhe: string;
    };

type Resp = {
  data: string;
  totalOS: number;
  totalAgentesAvaliados: number;
  divergencias: Divergencia[];
  resumo: { missaoSemPonto: number; pontoFechadoOsAberta: number };
};

function ontemBrtYmd(): string {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  brt.setDate(brt.getDate() - 1);
  return brt.toISOString().slice(0, 10);
}

function fmtBrTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

export default function DivergenciasJornadaPage() {
  const [date, setDate] = useState<string>(ontemBrtYmd());
  const [filtro, setFiltro] = useState<"todos" | "MISSAO_SEM_PONTO" | "PONTO_FECHADO_OS_ABERTA">("todos");

  const { data, isLoading, error } = useQuery<Resp>({
    queryKey: ["/api/divergencias-jornada", date],
  });

  const filtradas = useMemo(() => {
    if (!data) return [];
    if (filtro === "todos") return data.divergencias;
    return data.divergencias.filter((d) => d.tipo === filtro);
  }, [data, filtro]);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              Divergências de Jornada
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cruzamento Ponto (Control iD) × Ordens de Serviço — auditoria diária pra blindar pagamento e passivo trabalhista.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={ontemBrtYmd()}
              className="bg-transparent outline-none text-sm"
              data-testid="input-date"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">OS analisadas em {data?.data ?? "—"}</div>
            <div className="text-2xl font-bold mt-1" data-testid="stat-total-os">{data?.totalOS ?? 0}</div>
          </div>
          <button
            onClick={() => setFiltro(filtro === "MISSAO_SEM_PONTO" ? "todos" : "MISSAO_SEM_PONTO")}
            className={`rounded-lg border p-4 text-left transition ${filtro === "MISSAO_SEM_PONTO" ? "border-red-500 bg-red-500/10" : "bg-card hover:border-red-500/50"}`}
            data-testid="card-missao-sem-ponto"
          >
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-500" /> Missão sem ponto batido
            </div>
            <div className="text-2xl font-bold mt-1 text-red-500" data-testid="stat-missao-sem-ponto">{data?.resumo.missaoSemPonto ?? 0}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Risco de pagar escolta fantasma</div>
          </button>
          <button
            onClick={() => setFiltro(filtro === "PONTO_FECHADO_OS_ABERTA" ? "todos" : "PONTO_FECHADO_OS_ABERTA")}
            className={`rounded-lg border p-4 text-left transition ${filtro === "PONTO_FECHADO_OS_ABERTA" ? "border-amber-500 bg-amber-500/10" : "bg-card hover:border-amber-500/50"}`}
            data-testid="card-ponto-fechado-os-aberta"
          >
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" /> Ponto fechado com OS aberta
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-500" data-testid="stat-ponto-fechado-os-aberta">{data?.resumo.pontoFechadoOsAberta ?? 0}</div>
            <div className="text-[11px] text-muted-foreground mt-1">Hora extra não registrada</div>
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Calculando divergências...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm text-red-500" data-testid="text-error">
            Erro ao carregar: {(error as Error).message}
          </div>
        )}

        {!isLoading && data && filtradas.length === 0 && (
          <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground" data-testid="text-empty">
            Nenhuma divergência encontrada em {data.data}. ✅
          </div>
        )}

        {!isLoading && filtradas.length > 0 && (
          <div className="space-y-2">
            {filtradas.map((d, idx) => (
              <div
                key={`${d.tipo}-${d.osId}-${d.employeeId}-${idx}`}
                className={`rounded-lg border p-4 ${
                  d.tipo === "MISSAO_SEM_PONTO"
                    ? "border-red-500/50 bg-red-500/5"
                    : "border-amber-500/50 bg-amber-500/5"
                }`}
                data-testid={`row-divergencia-${d.osId}-${d.employeeId}`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {d.tipo === "MISSAO_SEM_PONTO" ? (
                      <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold" data-testid={`text-employee-${d.employeeId}`}>
                        {d.employeeName} — OS {d.osNumber}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{d.clientName}</div>
                      <div className="text-sm mt-1.5">{d.detalhe}</div>
                      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                        {d.missionStartedAt && (
                          <span>Início missão: <strong>{fmtBrTime(d.missionStartedAt)}</strong></span>
                        )}
                        {d.completedDate && (
                          <span>Fim missão: <strong>{fmtBrTime(d.completedDate)}</strong></span>
                        )}
                        {d.tipo === "PONTO_FECHADO_OS_ABERTA" && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Último ponto OUT: <strong>{fmtBrTime(d.lastPunchOutAt)}</strong> · diff <strong>{d.diffMinutos} min</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/admin/service-orders/${d.osId}`}
                    className="text-xs flex items-center gap-1 text-blue-400 hover:underline self-start md:self-auto flex-shrink-0"
                    data-testid={`link-os-${d.osId}`}
                  >
                    Abrir OS <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
