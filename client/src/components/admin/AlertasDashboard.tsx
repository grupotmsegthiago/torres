import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { AlertTriangle, FileText, Users, Receipt, X } from "lucide-react";

interface AlertasData {
  osPendentes: number;
  docsPendentes: number;
  boletinsPendentes: number;
  employeesComDocPendente: string[];
}

const STORAGE_KEY = "alertas_dispensado_at";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export default function AlertasDashboard() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const isAllowed = user?.role === "diretoria" || (user?.name || "").toLowerCase().includes("mickael");

  const checkDismissed = useCallback(() => {
    const dispensadoAt = localStorage.getItem(STORAGE_KEY);
    if (dispensadoAt) {
      const diff = new Date().getTime() - new Date(dispensadoAt).getTime();
      if (diff < TWO_HOURS_MS) return true;
    }
    return false;
  }, []);

  useEffect(() => {
    setDismissed(checkDismissed());

    const interval = setInterval(() => {
      const stillDismissed = checkDismissed();
      if (!stillDismissed && dismissed) {
        localStorage.removeItem(STORAGE_KEY);
        setDismissed(false);
      }
    }, TWO_HOURS_MS);

    return () => clearInterval(interval);
  }, []);

  const { data } = useQuery<AlertasData>({
    queryKey: ["/api/dashboard/alertas-mickael"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: isAllowed && !dismissed,
    refetchInterval: TWO_HOURS_MS,
  });

  if (!isAllowed || dismissed) return null;
  if (!data) return null;

  const hasAlerts = data.osPendentes > 0 || data.docsPendentes > 0 || data.boletinsPendentes > 0;
  if (!hasAlerts) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setDismissed(true);
  };

  return (
    <div className="mb-6 space-y-3" data-testid="alertas-dashboard">
      {data.osPendentes > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50" data-testid="alerta-os-pendentes">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              ⚠️ Você tem {data.osPendentes} OS pendente{data.osPendentes > 1 ? "s" : ""} aguardando análise
            </p>
            <div className="flex gap-3 mt-2">
              <Link
                href="/admin/service-orders?status=pendente"
                className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors"
                data-testid="link-ver-os-pendentes"
              >
                <FileText className="w-3 h-3 inline mr-1" />
                Ver OS Pendentes
              </Link>
            </div>
          </div>
        </div>
      )}

      {data.docsPendentes > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 bg-orange-50" data-testid="alerta-docs-pendentes">
          <Users className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-800">
              📋 {data.docsPendentes} agente{data.docsPendentes > 1 ? "s" : ""} com documentação pendente/vencida
            </p>
            <p className="text-xs text-orange-600 mt-1">
              CNV vencida, CNH vencida ou curso de reciclagem vencido
            </p>
            <div className="flex gap-3 mt-2">
              <Link
                href="/admin/employees?docs=pendente"
                className="text-xs font-bold text-orange-700 bg-orange-100 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition-colors"
                data-testid="link-ver-funcionarios-docs"
              >
                <Users className="w-3 h-3 inline mr-1" />
                Ver Funcionários
              </Link>
            </div>
          </div>
        </div>
      )}

      {data.boletinsPendentes > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-indigo-200 bg-indigo-50" data-testid="alerta-boletins-pendentes">
          <Receipt className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-indigo-800">
              💰 {data.boletinsPendentes} mediç{data.boletinsPendentes > 1 ? "ões aprovadas aguardando" : "ão aprovada aguardando"} geração de fatura
            </p>
            <div className="flex gap-3 mt-2">
              <Link
                href="/admin/boletim-medicao?status=APROVADA"
                className="text-xs font-bold text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors"
                data-testid="link-gerar-faturas"
              >
                <Receipt className="w-3 h-3 inline mr-1" />
                Gerar Faturas
              </Link>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleDismiss}
        className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1"
        data-testid="button-dispensar-alertas"
      >
        <X className="w-3 h-3" />
        Dispensar por 2h
      </button>
    </div>
  );
}
