import AdminLayout from "@/components/admin/layout";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/queryClient";
import {
  Shield, Search, AlertTriangle, ArrowRight, Activity,
  ChevronLeft, ChevronRight, Filter, X, User, Calendar,
  FileText, RefreshCw, Loader2, Clock
} from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  CRIAR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ATUALIZAR: "bg-blue-50 text-blue-700 border-blue-200",
  EXCLUIR: "bg-red-50 text-red-700 border-red-200",
  LOGIN: "bg-violet-50 text-violet-700 border-violet-200",
  APROVAR: "bg-amber-50 text-amber-700 border-amber-200",
  FATURAR: "bg-indigo-50 text-indigo-700 border-indigo-200",
  GERAR: "bg-cyan-50 text-cyan-700 border-cyan-200",
  ENVIAR: "bg-teal-50 text-teal-700 border-teal-200",
  CANCELAR: "bg-red-50 text-red-700 border-red-200",
  REJEITAR: "bg-orange-50 text-orange-700 border-orange-200",
};

function getActionColor(action: string) {
  const upper = (action || "").toUpperCase();
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (upper.includes(key)) return cls;
  }
  return "bg-neutral-50 text-neutral-600 border-neutral-200";
}

function formatDateTime(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [appliedUser, setAppliedUser] = useState("");

  const buildUrl = () => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    if (appliedAction) p.set("action", appliedAction);
    if (appliedUser) p.set("user_name", appliedUser);
    return `/api/system-audit-logs?${p}`;
  };

  const { data, isLoading, refetch } = useQuery<{ logs: any[]; total: number }>({
    queryKey: ["/api/system-audit-logs", page, appliedAction, appliedUser],
    queryFn: async () => { const r = await authFetch(buildUrl()); return r.json(); },
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const applyFilters = () => {
    setAppliedAction(actionFilter);
    setAppliedUser(userFilter);
    setPage(0);
  };

  const clearFilters = () => {
    setActionFilter("");
    setUserFilter("");
    setAppliedAction("");
    setAppliedUser("");
    setPage(0);
  };

  const hasFilters = appliedAction || appliedUser;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto pb-10 px-4" data-testid="audit-page">
        <div className="flex items-center justify-between mb-5 pt-4">
          <div>
            <h1 className="text-xl font-black text-neutral-900 uppercase tracking-wider flex items-center gap-2" data-testid="text-audit-title">
              <Shield size={22} className="text-indigo-600" /> Auditoria do Sistema
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Rastreamento completo de ações no sistema</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs" data-testid="badge-audit-total">{total} registros</Badge>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="text-xs h-8" data-testid="button-refresh-audit">
              <RefreshCw size={14} className="mr-1" /> Atualizar
            </Button>
          </div>
        </div>

        <Card className="border border-neutral-200 mb-4 p-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <FileText size={14} className="absolute left-2.5 top-2.5 text-neutral-400" />
              <Input
                placeholder="Filtrar por ação (ex: CRIAR, APROVAR, FATURAR, HOLERITE)"
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilters()}
                className="pl-8 h-9 text-sm"
                data-testid="input-filter-action"
              />
            </div>
            <div className="relative flex-1">
              <User size={14} className="absolute left-2.5 top-2.5 text-neutral-400" />
              <Input
                placeholder="Filtrar por usuário"
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilters()}
                className="pl-8 h-9 text-sm"
                data-testid="input-filter-user"
              />
            </div>
            <div className="flex gap-1">
              <Button size="sm" onClick={applyFilters} className="h-9" data-testid="button-apply-filter">
                <Filter size={14} className="mr-1" /> Filtrar
              </Button>
              {hasFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="h-9 text-neutral-500" data-testid="button-clear-filter">
                  <X size={14} className="mr-1" /> Limpar
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-audit-logs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">Usuário</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">Ação</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">Tipo/ID</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">Detalhes</th>
                  <th className="text-left px-4 py-3 font-bold text-neutral-600 uppercase text-[10px] tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Loader2 size={24} className="animate-spin text-indigo-500 mx-auto" />
                      <p className="text-sm text-neutral-400 mt-2">Carregando registros...</p>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <Shield size={40} className="mx-auto text-neutral-200 mb-3" />
                      <p className="text-sm text-neutral-400 font-bold">Nenhum registro encontrado</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log: any) => {
                    const actionColor = getActionColor(log.action);
                    return (
                      <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors" data-testid={`row-audit-${log.id}`}>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                            <Clock size={11} className="text-neutral-300" />
                            {formatDateTime(log.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-bold text-neutral-800">{log.user_name || "Sistema"}</div>
                          {log.user_role && <div className="text-[10px] text-neutral-400">{log.user_role}</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge className={`text-[10px] font-bold border ${actionColor}`} data-testid={`badge-action-${log.id}`}>
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          {log.target_type ? (
                            <span className="text-xs text-neutral-500 font-mono">
                              {log.target_type}{log.target_id ? ` #${log.target_id}` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 max-w-[350px]">
                          <p className="text-xs text-neutral-600 truncate" title={log.details || ""}>{log.details || "—"}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] text-neutral-400 font-mono">{log.ip_address || "—"}</span>
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
                Página {page + 1} de {totalPages} ({total.toLocaleString("pt-BR")} registros)
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-8 text-xs" data-testid="button-prev-page">
                  <ChevronLeft size={14} /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-8 text-xs" data-testid="button-next-page">
                  Próxima <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
