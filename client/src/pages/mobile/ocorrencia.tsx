import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback } from "react";
import { Camera, ArrowLeft, Loader2, AlertTriangle, CheckCircle, X, Plus, Send, Wrench, Car, ShieldAlert, Hammer, FileWarning } from "lucide-react";
import { Link } from "wouter";

const TYPES = [
  { value: "acidente", label: "Acidente", icon: Car },
  { value: "quebra", label: "Quebra Mecânica", icon: Wrench },
  { value: "avaria", label: "Avaria", icon: Hammer },
  { value: "manutencao", label: "Manutenção", icon: Wrench },
  { value: "seguranca", label: "Segurança", icon: ShieldAlert },
  { value: "outro", label: "Outro", icon: FileWarning },
];

export default function MobileOcorrenciaPage() {
  const { user } = useAuth();
  const geo = useGeolocation();
  const { toast } = useToast();
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState<"form" | "history">("form");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { data: history, isLoading: loadingHistory } = useQuery<any[]>({
    queryKey: ["/api/mobile/ocorrencias"],
    enabled: tab === "history",
  });

  const { data: vehicle } = useQuery<any>({
    queryKey: ["/api/mobile/abastecimento/vehicle"],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mobile/ocorrencias", {
        type, description, photos, vehicleId: vehicle?.id || null,
        latitude: geo.latitude?.toString(), longitude: geo.longitude?.toString(),
      });
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/ocorrencias"] });
      toast({ title: "Ocorrência registrada!" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const startCamera = useCallback(async () => {
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 960 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { toast({ title: "Erro ao acessar câmera", variant: "destructive" }); setCapturing(false); }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCapturing(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const cv = canvasRef.current; const video = videoRef.current;
    cv.width = Math.min(video.videoWidth, 1280); cv.height = Math.min(video.videoHeight, 1280);
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    setPhotos(p => [...p, cv.toDataURL("image/jpeg", 0.7)]);
    stopCamera();
  }, [stopCamera]);

  const removePhoto = (i: number) => setPhotos(p => p.filter((_, idx) => idx !== i));

  if (capturing) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4">
          <button onClick={stopCamera} className="flex items-center gap-2 text-sm text-neutral-500"><ArrowLeft size={18} /> Voltar</button>
          <div className="bg-black rounded-2xl overflow-hidden relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <button onClick={capturePhoto} className="w-full py-3 bg-white rounded-xl text-black font-black uppercase text-sm flex items-center justify-center gap-2" data-testid="button-capture-occurrence">
                <Camera size={18} /> Capturar
              </button>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </MobileLayout>
    );
  }

  if (submitted) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <CheckCircle className="mx-auto text-emerald-600 mb-3" size={40} />
            <h2 className="text-lg font-black text-emerald-800">Ocorrência Registrada</h2>
            <p className="text-sm text-emerald-600 mt-1">O administrador será notificado.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setSubmitted(false); setType(""); setDescription(""); setPhotos([]); }}
              className="py-3 bg-neutral-100 text-neutral-700 rounded-xl font-bold text-sm uppercase" data-testid="button-new-occurrence">Nova Ocorrência</button>
            <Link href="/mobile">
              <button className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold text-sm uppercase" data-testid="button-back-home">Início</button>
            </Link>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-ocorrencia-page">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/mobile"><button className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center"><ArrowLeft size={18} className="text-neutral-600" /></button></Link>
          <div>
            <h1 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Ocorrência</h1>
            <p className="text-xs text-neutral-400">Registrar incidentes e avarias</p>
          </div>
        </div>

        <div className="flex gap-2 bg-neutral-100 rounded-xl p-1">
          <button onClick={() => setTab("form")} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${tab === "form" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`} data-testid="tab-form">Registrar</button>
          <button onClick={() => setTab("history")} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${tab === "history" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`} data-testid="tab-history">Histórico</button>
        </div>

        {tab === "form" ? (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Tipo de Ocorrência *</p>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map(t => {
                  const Icon = t.icon;
                  const active = type === t.value;
                  return (
                    <button key={t.value} onClick={() => setType(t.value)} data-testid={`type-${t.value}`}
                      className={`p-3 rounded-xl border text-center transition-all ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-600"}`}>
                      <Icon size={18} className="mx-auto mb-1" />
                      <span className="text-[10px] font-bold block">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Descrição *</p>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Descreva a ocorrência em detalhes..."
                className="w-full p-3 border border-neutral-200 rounded-xl text-sm resize-none" data-testid="input-description" />
            </div>

            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Fotos</p>
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img src={p} className="w-20 h-20 rounded-lg object-cover border" alt={`Foto ${i + 1}`} />
                    <button onClick={() => removePhoto(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center" data-testid={`remove-photo-${i}`}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button onClick={startCamera} className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-400" data-testid="button-add-photo">
                    <Plus size={18} />
                    <span className="text-[9px] font-bold mt-0.5">Foto</span>
                  </button>
                )}
              </div>
            </div>

            {vehicle && (
              <div className="bg-neutral-50 rounded-xl p-3 flex items-center gap-2">
                <Car size={16} className="text-neutral-400" />
                <span className="text-xs text-neutral-600">Veículo: <b>{vehicle.plate}</b> — {vehicle.model}</span>
              </div>
            )}

            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !type || !description} data-testid="button-submit-occurrence"
              className="w-full py-4 bg-neutral-900 text-white rounded-xl font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-40">
              {submitMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Enviar Ocorrência
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-neutral-300" /></div>
            ) : !history?.length ? (
              <div className="text-center py-8 text-sm text-neutral-400">Nenhuma ocorrência registrada</div>
            ) : history.map((o: any) => (
              <div key={o.id} className="bg-white border border-neutral-200 rounded-2xl p-4" data-testid={`occurrence-${o.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase text-neutral-700">{TYPES.find(t => t.value === o.type)?.label || o.type}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${o.status === "aberta" ? "bg-amber-100 text-amber-700" : o.status === "resolvida" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{o.status?.toUpperCase()}</span>
                </div>
                <p className="text-sm text-neutral-600 line-clamp-2">{o.description}</p>
                {o.photos?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {o.photos.slice(0, 3).map((p: string, i: number) => (
                      <img key={i} src={p} className="w-12 h-12 rounded object-cover border" alt="" />
                    ))}
                    {o.photos.length > 3 && <span className="text-xs text-neutral-400 self-center ml-1">+{o.photos.length - 3}</span>}
                  </div>
                )}
                <p className="text-[10px] text-neutral-400 mt-2">{new Date(o.created_at || o.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                {o.admin_notes && (
                  <div className="mt-2 bg-blue-50 rounded-lg p-2">
                    <p className="text-[10px] font-bold text-blue-600">Resposta do Admin:</p>
                    <p className="text-xs text-blue-700">{o.admin_notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
