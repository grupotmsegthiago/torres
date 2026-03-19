import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { MapPin, Radio, AlertCircle } from "lucide-react";
import type { Vehicle } from "@shared/schema";

export default function TrackerPage() {
  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({ queryKey: ["/api/vehicles"], queryFn: getQueryFn({ on401: "throw" }) });

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-tracker-title">Rastreamento de Veículos</h1>
        <p className="text-sm text-neutral-500 mt-1">Monitoramento em tempo real da frota</p>
      </div>

      <Card className="p-6 bg-amber-50 border-amber-200 mb-6" data-testid="card-tracker-notice">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">API de Rastreamento</p>
            <p className="text-sm text-amber-700 mt-1">
              Configure o ID e URL da API do rastreador em cada veículo para ativar o monitoramento em tempo real.
              O sistema está preparado para integrar com APIs de rastreamento quando disponíveis.
            </p>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="p-8 text-center text-neutral-400">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(vehicles || []).map((vehicle) => (
            <Card key={vehicle.id} className="p-5 bg-white border-neutral-200" data-testid={`card-tracker-${vehicle.id}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold text-neutral-900">{vehicle.plate}</p>
                  <p className="text-xs text-neutral-500">{vehicle.brand} {vehicle.model}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${
                  vehicle.status === "disponível" ? "bg-green-500" :
                  vehicle.status === "em_uso" ? "bg-amber-500" :
                  "bg-red-500"
                }`} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-neutral-400" />
                  <span className="text-neutral-600">
                    {vehicle.trackerId ? `ID: ${vehicle.trackerId}` : "Rastreador não configurado"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Radio className="w-4 h-4 text-neutral-400" />
                  <span className="text-neutral-600">
                    {vehicle.trackerApiUrl ? "API configurada" : "API não configurada"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-100">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">KM Atual</span>
                  <span className="font-medium text-neutral-900">{vehicle.km?.toLocaleString() || "0"} km</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-neutral-500">Status</span>
                  <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold uppercase tracking-wide ${
                    vehicle.status === "disponível" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                    vehicle.status === "em_uso" ? "bg-neutral-900 text-white" :
                    "bg-red-50 text-red-700 border border-red-200"
                  }`}>{vehicle.status === "em_uso" ? "EM USO" : vehicle.status === "disponível" ? "DISPONÍVEL" : "MANUTENÇÃO"}</span>
                </div>
              </div>
            </Card>
          ))}

          {(vehicles || []).length === 0 && (
            <div className="col-span-full p-8 text-center text-neutral-400">
              Nenhum veículo cadastrado. Cadastre veículos para visualizar o rastreamento.
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
