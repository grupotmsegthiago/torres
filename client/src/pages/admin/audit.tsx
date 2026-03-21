import AdminLayout from "@/components/admin/layout";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Search, AlertTriangle, Eye, Camera, ArrowRight,
  Monitor, EyeOff, MousePointer, Clock, Users, Activity,
  ChevronLeft, ChevronRight, Filter, X, Smartphone,
} from "lucide-react";

type AuditLog = {
  id: number;
  userId: number;
  userName: string;
  userRole: string;
  action: string;
  page: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AuditStats = {
  total: number;
  today: number;
  securityAlerts: number;
  topUsers: { userId: number; userName: string; count: number }[];
  actionCounts: { action: string; count: number }[];
};

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; severity: "info" | "warning" | "danger" }> = {
  page_view: { label: "Visualização", icon: Eye, color: "bg-blue-50 text-blue-700 border-blue-200", severity: "info" },
  mission_step_advance: { label: "Avanço de Etapa", icon: ArrowRight, color: "bg-green-50 text-green-700 border-green-200", severity: "info" },
  photo_captured: { label: "Foto Capturada", icon: Camera, color: "bg-indigo-50 text-indigo-700 border-indigo-200", severity: "info" },
  mission_status_update: { label: "Status da Missão", icon: Activity, color: "bg-violet-50 text-violet-700 border-violet-200", severity: "info" },
  login_selfie: { label: "Selfie de Login", icon: Camera, color: "bg-cyan-50 text-cyan-700 border-cyan-200", severity: "info" },
  terms_accepted: { label: "Termos Aceitos", icon: Shield, color: "bg-emerald-50 text-emerald-700 border-emerald-200", severity: "info" },
  screenshot_attempt: { label: "Tentativa de Print", icon: AlertTriangle, color: "bg-red-50 text-red-700 border-red-200", severity: "danger" },
  tab_hidden: { label: "Aba Oculta", icon: EyeOff, color: "bg-amber-50 text-amber-700 border-amber-200", severity: "warning" },
  tab_visible: { label: "Aba Visível", icon: Eye, color: "bg-neutral-50 text-neutral-600 border-neutral-200", severity: "info" },
  window_blur: { label: "Perda de Foco", icon: Monitor, color: "bg-orange-50 text-orange-700 border-orange-200", severity: "warning" },
  context_menu: { label: "Menu Contexto", icon: MousePointer, color: "bg-yellow-50 text-yellow-700 border-yellow-200", severity: "warning" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || { label: action, icon: Activity, color: "bg-neutral-50 text-neutral-600 border-neutral-200", severity: "info" as const };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(dateStr: string) {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

function parseUA(ua: string | null): string {
  if (!ua) return "—";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Outro";
}

const ITEMS_PER_PAGE = 50;

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [securityOnly, setSecurityOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(ITEMS_PER_PAGE));
  queryParams.set("offset", String(page * ITEMS_PER_PAGE));
  if (searchTerm) queryParams.set("search", searchTerm);
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  if (securityOnly) queryParams.set("securityOnly", "true");
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data: logsData, isLoading } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ["/api/audit-logs", `?${queryParams.toString()}`],
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery<AuditStats>({
    queryKey: ["/api/audit-logs/stats"],
    refetchInterval: 30000,
  });

  const logs = logsData?.logs || [];
  const total = logsData?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const clearFilters = () => {
    setSearchTerm("");
    setActionFilter("all");
    setSecurityOnly(false);
    setDateFrom("");
    setDateTo("");
    setPage(0);
  };

  const hasFilters = searchTerm || actionFilter !== "all" || securityOnly || dateFrom || dateTo;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto pb-10 px-4" data-testid="audit-page">
        <div className="flex items-center justify-between mb-6 pt-4">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="text-audit-title">
              Auditoria
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Rastreamento completo de ações dos vigilantes</p>
          </div>
          <div className="flex items-center gap-2">
            {stats && stats.securityAlerts > 0 && (
              <Badge variant="destructive" className="gap-1 px-3 py-1" data-testid="badge-security-alerts">
                <AlertTriangle className="w-3.5 h-3.5" />
                {stats.securityAlerts} alertas
              </Badge>
            )}
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card className="p-4 border border-neutral-200" data-testid="stat-total-events">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-neutral-900">{stats.total.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Total de Eventos</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 border border-neutral-200" data-testid="stat-today-events">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-neutral-900">{stats.today.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Hoje</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 border border-neutral-200" data-testid="stat-security-events">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stats.securityAlerts > 0 ? "bg-red-50" : "bg-neutral-50"}`}>
                  <AlertTriangle className={`w-5 h-5 ${stats.securityAlerts > 0 ? "text-red-600" : "text-neutral-400"}`} />
                </div>
                <div>
                  <p className={`text-2xl font-black ${stats.securityAlerts > 0 ? "text-red-600" : "text-neutral-900"}`}>{stats.securityAlerts}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Alertas Segurança</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 border border-neutral-200" data-testid="stat-active-users">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-neutral-900">{stats.topUsers?.length || 0}</p>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider">Usuários Ativos</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {stats && stats.topUsers && stats.topUsers.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            <Card className="p-4 border border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3" data-testid="text-top-users">
                Usuários Mais Ativos
              </h3>
              <div className="space-y-2">
                {stats.topUsers.slice(0, 5).map((u) => (
                  <div key={u.userId} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-semibold text-neutral-800">{u.userName}</span>
                    <Badge variant="secondary" className="text-xs">{u.count} ações</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4 border border-neutral-200">
              <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider mb-3" data-testid="text-action-types">
                Tipos de Ação
              </h3>
              <div className="space-y-2">
                {stats.actionCounts?.slice(0, 5).map((a) => {
                  const cfg = getActionConfig(a.action);
                  return (
                    <div key={a.action} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <cfg.icon className="w-4 h-4 text-neutral-500" />
                        <span className="text-sm font-semibold text-neutral-800">{cfg.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{a.count}</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        <Card className="border border-neutral-200 mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <Input
                placeholder="Buscar por nome, detalhes, página..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                className="pl-9"
                data-testid="input-audit-search"
              />
            </div>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]" data-testid="select-action-filter">
                <SelectValue placeholder="Tipo de ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                <SelectItem value="page_view">Visualização</SelectItem>
                <SelectItem value="mission_step_advance">Avanço de Etapa</SelectItem>
                <SelectItem value="photo_captured">Foto Capturada</SelectItem>
                <SelectItem value="login_selfie">Selfie de Login</SelectItem>
                <SelectItem value="screenshot_attempt">Tentativa de Print</SelectItem>
                <SelectItem value="tab_hidden">Aba Oculta</SelectItem>
                <SelectItem value="window_blur">Perda de Foco</SelectItem>
                <SelectItem value="context_menu">Menu Contexto</SelectItem>
                <SelectItem value="mission_status_update">Status da Missão</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="w-[150px]"
              placeholder="De"
              data-testid="input-date-from"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="w-[150px]"
              placeholder="Até"
              data-testid="input-date-to"
            />
            <Button
              variant={securityOnly ? "destructive" : "outline"}
              size="sm"
              onClick={() => { setSecurityOnly(!securityOnly); setPage(0); }}
              className="gap-1.5"
              data-testid="button-security-filter"
            >
              <AlertTriangle className="w-4 h-4" />
              Alertas
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1" data-testid="button-clear-filters">
                <X className="w-4 h-4" />
                Limpar
              </Button>
            )}
          </div>
        </Card>

        <Card className="border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-audit-logs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">Usuário</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">Ação</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">Detalhes</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">Página</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">Disp.</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-xs tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-neutral-400">
                      Carregando registros...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-neutral-400">
                      Nenhum registro encontrado
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const cfg = getActionConfig(log.action);
                    const isAlert = cfg.severity === "danger" || cfg.severity === "warning";
                    return (
                      <tr
                        key={log.id}
                        className={`border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                          cfg.severity === "danger" ? "bg-red-50/50" : cfg.severity === "warning" ? "bg-amber-50/30" : ""
                        }`}
                        data-testid={`row-audit-${log.id}`}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-xs font-mono text-neutral-700">{formatDate(log.createdAt)}</div>
                          <div className="text-xs font-mono text-neutral-400">{formatTime(log.createdAt)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-neutral-800 text-sm">{log.userName}</div>
                          <div className="text-xs text-neutral-400">{log.userRole}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color}`}>
                            {isAlert && <AlertTriangle className="w-3 h-3" />}
                            {!isAlert && <cfg.icon className="w-3 h-3" />}
                            {cfg.label}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[300px]">
                          <p className="text-xs text-neutral-600 truncate" title={log.details || ""}>{log.details || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-neutral-500 font-mono">{log.page || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Smartphone className="w-3 h-3 text-neutral-400" />
                            <span className="text-xs text-neutral-500">{parseUA(log.userAgent)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-neutral-400 font-mono">{log.ipAddress || "—"}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
              <p className="text-xs text-neutral-500">
                Mostrando {page * ITEMS_PER_PAGE + 1}–{Math.min((page + 1) * ITEMS_PER_PAGE, total)} de {total.toLocaleString("pt-BR")} registros
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-neutral-700">
                  {page + 1} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} data-testid="button-next-page">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
