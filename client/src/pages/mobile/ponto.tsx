import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback } from "react";
import { Camera, Clock, MapPin, CheckCircle, ArrowLeft, Loader2, Sun, Coffee, LogOut } from "lucide-react";
import { Link } from "wouter";

const STEPS = [
  { key: "clock_in", label: "Entrada", icon: Sun, color: "bg-emerald-600", done: (r: any) => !!r?.clockIn },
  { key: "lunch_out", label: "Saída Almoço", icon: Coffee, color: "bg-amber-600", done: (r: any) => !!r?.lunchOut },
  { key: "lunch_in", label: "Retorno Almoço", icon: Coffee, color: "bg-blue-600", done: (r: any) => !!r?.lunchIn },
  { key: "clock_out", label: "Saída", icon: LogOut, color: "bg-red-600", done: (r: any) => !!r?.clockOut },
];

export default function MobilePontoPage() {
  const { user } = useAuth();
  const geo = useGeolocation();
  const { toast } = useToast();
  const [capturing, setCapturing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { data: record, isLoading } = useQuery<any>({
    queryKey: ["/api/mobile/ponto/today"],
    refetchInterval: 30000,
  });

  const clockMutation = useMutation({
    mutationFn: async ({ action, photo }: { action: string; photo: string }) => {
      const res = await apiRequest("POST", "/api/mobile/ponto/clock", {
        action, photo,
        latitude: geo.latitude?.toString(),
        longitude: geo.longitude?.toString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/ponto/today"] });
      toast({ title: "Ponto registrado com sucesso!" });
      stopCamera();
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      stopCamera();
    },
  });

  const startCamera = useCallback(async (action: string) => {
    setActiveAction(action);
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast({ title: "Erro ao acessar câmera", variant: "destructive" });
      setCapturing(false);
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCapturing(false);
    setActiveAction(null);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !activeAction) return;
    const cv = canvasRef.current;
    const video = videoRef.current;
    cv.width = Math.min(video.videoWidth, 1280);
    cv.height = Math.min(video.videoHeight, 1280);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.7);
    clockMutation.mutate({ action: activeAction, photo: dataUrl });
  }, [activeAction, clockMutation]);

  const nextStep = STEPS.find(s => !s.done(record));
  const now = new Date();

  if (capturing) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4" data-testid="ponto-camera">
          <button onClick={stopCamera} className="flex items-center gap-2 text-sm text-neutral-500" data-testid="button-back-camera">
            <ArrowLeft size={18} /> Voltar
          </button>
          <div className="bg-black rounded-2xl overflow-hidden relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <div className="flex items-center justify-between text-white text-xs mb-3">
                <span className="flex items-center gap-1"><Clock size={12} /> {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex items-center gap-1"><MapPin size={12} /> {geo.latitude ? `${Number(geo.latitude).toFixed(4)}, ${Number(geo.longitude).toFixed(4)}` : "Obtendo..."}</span>
              </div>
              <button onClick={capturePhoto} disabled={clockMutation.isPending} data-testid="button-capture-ponto"
                className="w-full py-3 bg-white rounded-xl text-black font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-50">
                {clockMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                Registrar Ponto
              </button>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-ponto-page">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/mobile">
            <button className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center" data-testid="button-back-home">
              <ArrowLeft size={18} className="text-neutral-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Folha de Ponto</h1>
            <p className="text-xs text-neutral-400">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
        </div>

        <div className="bg-neutral-900 rounded-2xl p-5 text-center">
          <p className="text-3xl font-black text-white font-mono" data-testid="text-current-time">
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-xs text-neutral-400 mt-1 flex items-center justify-center gap-1">
            <MapPin size={10} /> {geo.latitude ? "Localização ativa" : "Obtendo localização..."}
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-neutral-300" /></div>
        ) : (
          <div className="space-y-3">
            {STEPS.map(step => {
              const done = step.done(record);
              const isNext = step.key === nextStep?.key;
              const timeVal = record?.[step.key === "clock_in" ? "clockIn" : step.key === "lunch_out" ? "lunchOut" : step.key === "lunch_in" ? "lunchIn" : "clockOut"];
              const Icon = step.icon;

              return (
                <div key={step.key} className={`rounded-2xl border p-4 transition-all ${done ? "bg-neutral-50 border-neutral-200" : isNext ? "bg-white border-neutral-300 shadow-sm" : "bg-neutral-50 border-neutral-100 opacity-50"}`} data-testid={`card-ponto-${step.key}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${done ? "bg-emerald-100" : isNext ? step.color : "bg-neutral-200"}`}>
                        {done ? <CheckCircle size={20} className="text-emerald-600" /> : <Icon size={20} className={isNext ? "text-white" : "text-neutral-400"} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-800">{step.label}</p>
                        {done && timeVal && <p className="text-xs text-neutral-500 font-mono">{timeVal}</p>}
                      </div>
                    </div>
                    {isNext && !done && (
                      <button onClick={() => startCamera(step.key)} data-testid={`button-ponto-${step.key}`}
                        className={`px-4 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 ${step.color}`}>
                        <Camera size={14} /> Registrar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {record?.clockIn && record?.clockOut && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <CheckCircle className="mx-auto text-emerald-600 mb-2" size={28} />
                <p className="text-sm font-bold text-emerald-800">Ponto completo!</p>
                <p className="text-xs text-emerald-600 mt-1">Todos os registros do dia foram feitos.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
