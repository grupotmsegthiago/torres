import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch, apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Camera, CheckCircle2, XCircle, AlertTriangle, Clock, Eye,
  Loader2, RefreshCw, Shield, Car, Gauge, Crosshair, MapPin,
  ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const STEP_LABELS: Record<string, string> = {
  viatura_frente: "Viatura — Frente",
  viatura_lateral_esq: "Viatura — Lateral Esq.",
  viatura_lateral_dir: "Viatura — Lateral Dir.",
  viatura_traseira: "Viatura — Traseira",
  escoltado_frente: "Escoltado — Frente",
  escoltado_traseira: "Escoltado — Traseira",
  km_saida: "KM Saída",
  km_chegada: "KM Chegada",
  km_final: "KM Final",
  base_hodometro: "Hodômetro Base",
  agente_equipado: "Agente Equipado",
  arma_pistola_1: "Pistola 1",
  arma_pistola_2: "Pistola 2",
  arma_espingarda: "Espingarda",
  foto_local_destino: "Local de Destino",
  foto_local_origem: "Local de Origem",
  viatura_retorno_frente: "Retorno — Frente",
  viatura_retorno_lateral_esq: "Retorno — Lat. Esq.",
  viatura_retorno_lateral_dir: "Retorno — Lat. Dir.",
  viatura_retorno_traseira: "Retorno — Traseira",
};

const STEP_ICONS: Record<string, any> = {
  viatura_frente: Car, viatura_lateral_esq: Car, viatura_lateral_dir: Car, viatura_traseira: Car,
  escoltado_frente: Car, escoltado_traseira: Car,
  km_saida: Gauge, km_chegada: Gauge, km_final: Gauge, base_hodometro: Gauge,
  agente_equipado: Shield,
  arma_pistola_1: Crosshair, arma_pistola_2: Crosshair, arma_espingarda: Crosshair,
  foto_local_destino: MapPin, foto_local_origem: MapPin,
};

interface PhotoItem {
  id: number;
  step: string;
  photoData: string;
  kmValue: number | null;
  latitude: number | null;
  longitude: number | null;
  aiStatus: string;
  aiResult: any;
  inspectionLog: any;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "aprovado") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold" data-testid="badge-approved"><CheckCircle2 size={10} className="mr-1" /> Aprovado</Badge>;
  if (status === "divergente") return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] font-bold" data-testid="badge-divergent"><XCircle size={10} className="mr-1" /> Divergência</Badge>;
  if (status === "analisando") return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-bold" data-testid="badge-analyzing"><Loader2 size={10} className="mr-1 animate-spin" /> Analisando</Badge>;
  return <Badge className="bg-neutral-100 text-neutral-600 border-neutral-200 text-[10px] font-bold" data-testid="badge-pending"><Clock size={10} className="mr-1" /> Pendente</Badge>;
}

function AiResultPanel({ photo }: { photo: PhotoItem }) {
  const [expanded, setExpanded] = useState(true);
  const r = photo.aiResult;
  if (!r) return <p className="text-xs text-neutral-400 italic mt-2">Sem análise de IA disponível</p>;

  const divergences = r.divergencias || [];
  return (
    <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-lg overflow-hidden" data-testid={`ai-result-${photo.id}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100">
        <span className="flex items-center gap-1.5"><Zap size={12} className="text-amber-500" /> Resultado da IA</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          {r.observacao && <p className="text-neutral-600 leading-relaxed">{r.observacao}</p>}

          <div className="grid grid-cols-2 gap-2">
            {r.placa_detectada !== undefined && r.placa_detectada !== null && (
              <div className="bg-white rounded p-2 border">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">Placa Detectada</span>
                <p className="font-mono font-bold text-sm">{r.placa_detectada || "—"}</p>
                {r.placa_confere === true && <span className="text-emerald-600 text-[10px]">Confere</span>}
                {r.placa_confere === false && <span className="text-red-600 text-[10px] font-bold">NÃO CONFERE</span>}
              </div>
            )}
            {r.km_lido !== undefined && (
              <div className="bg-white rounded p-2 border">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">KM Lido pela IA</span>
                <p className="font-mono font-bold text-sm">{r.km_lido != null ? Number(r.km_lido).toLocaleString("pt-BR") : "—"}</p>
                {r.km_informado && <span className="text-[10px] text-neutral-500">Informado: {Number(r.km_informado).toLocaleString("pt-BR")}</span>}
                {r.km_confere === true && <span className="ml-2 text-emerald-600 text-[10px]">Confere</span>}
                {r.km_confere === false && <span className="ml-2 text-red-600 text-[10px] font-bold">DIVERGE</span>}
              </div>
            )}
            {r.colete_visivel !== undefined && (
              <div className="bg-white rounded p-2 border">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">Colete</span>
                <p className={`font-bold text-sm ${r.colete_visivel ? "text-emerald-700" : "text-red-700"}`}>{r.colete_visivel ? "Visível" : "Não visível"}</p>
              </div>
            )}
            {r.armamento_visivel !== undefined && (
              <div className="bg-white rounded p-2 border">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">Armamento</span>
                <p className={`font-bold text-sm ${r.armamento_visivel ? "text-emerald-700" : "text-red-700"}`}>{r.armamento_visivel ? "Visível" : "Não visível"}</p>
              </div>
            )}
            {r.tipo_arma && (
              <div className="bg-white rounded p-2 border">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">Tipo de Arma</span>
                <p className="font-bold text-sm capitalize">{r.tipo_arma}</p>
              </div>
            )}
            {r.local_identificavel !== undefined && (
              <div className="bg-white rounded p-2 border">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">Local Identificável</span>
                <p className={`font-bold text-sm ${r.local_identificavel ? "text-emerald-700" : "text-amber-700"}`}>{r.local_identificavel ? "Sim" : "Não"}</p>
              </div>
            )}
            <div className="bg-white rounded p-2 border">
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Ângulo</span>
              <p className={`font-bold text-sm ${r.angulo_correto ? "text-emerald-700" : "text-red-700"}`}>{r.angulo_correto ? "Correto" : "Incorreto"}</p>
            </div>
            <div className="bg-white rounded p-2 border">
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Condição</span>
              <p className={`font-bold text-sm capitalize ${r.condicao === "bom" || r.condicao === "adequado" || r.condicao === "legivel" ? "text-emerald-700" : r.condicao === "dano_visivel" || r.condicao === "irregular" || r.condicao === "danificado" || r.condicao === "inadequado" ? "text-red-700" : "text-amber-700"}`}>
                {r.condicao?.replace(/_/g, " ") || "—"}
              </p>
            </div>
          </div>

          {divergences.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-1">
              <p className="text-[10px] font-bold text-red-700 uppercase mb-1">Divergências Encontradas</p>
              <ul className="space-y-1">
                {divergences.map((d: string, i: number) => (
                  <li key={i} className="flex items-start gap-1.5 text-red-700">
                    <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.equipamentos && (
            <div className="bg-white border rounded-lg p-2">
              <p className="text-[10px] font-bold text-neutral-500 uppercase mb-1">Checklist de Equipamentos</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(r.equipamentos).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    {val.presente ? <CheckCircle2 size={10} className="text-emerald-600" /> : <XCircle size={10} className="text-red-600" />}
                    <span className="capitalize">{key.replace(/_/g, " ")}: <span className={val.estado === "bom" ? "text-emerald-700" : "text-red-700"}>{val.estado}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PhotoInspectionPage() {
  const [, params] = useRoute("/admin/photo-inspection/:osId");
  const osId = Number(params?.osId || 0);
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria" || user?.role === "admin";
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);

  const { data: photos = [], isLoading, refetch } = useQuery<PhotoItem[]>({
    queryKey: ["/api/mission/photos-gallery", osId],
    queryFn: async () => {
      const r = await authFetch(`/api/mission/${osId}/photos-gallery`);
      return r.json();
    },
    enabled: osId > 0,
    refetchInterval: 10000,
  });

  const { data: osData } = useQuery<any>({
    queryKey: ["/api/service-orders", osId],
    queryFn: async () => {
      const r = await authFetch(`/api/service-orders/${osId}`);
      return r.json();
    },
    enabled: osId > 0,
  });

  const reInspectMutation = useMutation({
    mutationFn: async (photoIds?: number[]) => {
      return apiRequest("POST", `/api/mission/${osId}/re-inspect`, { photoIds });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Inspeção iniciada", description: data.message });
      setTimeout(() => refetch(), 3000);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const approved = photos.filter(p => p.aiStatus === "aprovado").length;
  const divergent = photos.filter(p => p.aiStatus === "divergente").length;
  const pending = photos.filter(p => !p.aiStatus || p.aiStatus === "pendente").length;
  const analyzing = photos.filter(p => p.aiStatus === "analisando").length;

  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <AdminLayout>
      <div className="space-y-6" data-testid="page-photo-inspection">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="heading-photo-inspection">
              <Camera className="inline w-6 h-6 mr-2 text-neutral-400" />
              Galeria de Fotos — Inspeção IA
            </h1>
            <p className="text-xs text-neutral-400 font-semibold mt-1">
              OS: {osData?.osNumber || `#${osId}`} {osData?.origin ? `• ${osData.origin} → ${osData.destination}` : ""}
            </p>
          </div>
          {isDiretoria && (
            <Button
              size="sm"
              onClick={() => reInspectMutation.mutate(undefined)}
              disabled={reInspectMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
              data-testid="button-reinspect-all"
            >
              {reInspectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Re-analisar Todas as Fotos
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-neutral-200 rounded-xl p-4" data-testid="stat-total-photos">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center"><Camera size={14} className="text-neutral-500" /></div>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Fotos</span>
            </div>
            <p className="text-2xl font-black text-neutral-900">{photos.length}</p>
          </div>
          <div className="bg-white border border-emerald-200 rounded-xl p-4" data-testid="stat-approved">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle2 size={14} className="text-emerald-600" /></div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Aprovadas</span>
            </div>
            <p className="text-2xl font-black text-emerald-700">{approved}</p>
          </div>
          <div className="bg-white border border-red-200 rounded-xl p-4" data-testid="stat-divergent">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center"><XCircle size={14} className="text-red-600" /></div>
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Divergências</span>
            </div>
            <p className="text-2xl font-black text-red-700">{divergent}</p>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-4" data-testid="stat-pending">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><Clock size={14} className="text-amber-600" /></div>
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{analyzing > 0 ? "Analisando" : "Pendentes"}</span>
            </div>
            <p className="text-2xl font-black text-amber-700">{pending + analyzing}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold">Nenhuma foto encontrada para esta OS</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const Icon = STEP_ICONS[photo.step] || Camera;
              const label = STEP_LABELS[photo.step] || photo.step;
              return (
                <div key={photo.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all" data-testid={`photo-card-${photo.id}`}>
                  <div className="relative cursor-pointer" onClick={() => setFullscreenImg(photo.photoData)}>
                    <img
                      src={photo.photoData}
                      alt={label}
                      className="w-full h-48 object-cover"
                      loading="lazy"
                    />
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={photo.aiStatus} />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <div className="flex items-center gap-1.5">
                        <Icon size={14} className="text-white" />
                        <span className="text-white text-xs font-bold uppercase">{label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-2">
                      <span>{fmtDate(photo.createdAt)} às {fmtTime(photo.createdAt)}</span>
                      {photo.kmValue && <span className="font-mono font-bold text-neutral-600">{Number(photo.kmValue).toLocaleString("pt-BR")} km</span>}
                    </div>

                    {photo.aiResult ? (
                      <AiResultPanel photo={photo} />
                    ) : (
                      <div className="mt-1">
                        {isDiretoria && photo.aiStatus !== "analisando" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reInspectMutation.mutate([photo.id])}
                            disabled={reInspectMutation.isPending}
                            className="w-full text-[10px] font-bold uppercase gap-1.5"
                            data-testid={`button-inspect-${photo.id}`}
                          >
                            <Zap size={10} /> Analisar com IA
                          </Button>
                        )}
                        {photo.aiStatus === "analisando" && (
                          <div className="flex items-center justify-center gap-2 py-2 text-blue-600 text-xs">
                            <Loader2 size={12} className="animate-spin" /> Analisando...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!fullscreenImg} onOpenChange={() => setFullscreenImg(null)}>
        <DialogContent className="max-w-4xl p-1 bg-black border-0">
          {fullscreenImg && (
            <img src={fullscreenImg} alt="Foto ampliada" className="w-full h-auto max-h-[85vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
