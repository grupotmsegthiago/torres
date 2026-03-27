import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Clock, MapPin, CheckCircle, ArrowLeft, Loader2, Sun, Coffee, LogOut, ExternalLink } from "lucide-react";
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

  const [freshGeo, setFreshGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const lastGeoRef = useRef<string | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (lastGeoRef.current === key) return;
    lastGeoRef.current = key;
    setAddressLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { "Accept-Language": "pt-BR" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          setGeoAddress(data.display_name);
        }
      }
    } catch {}
    setAddressLoading(false);
  }, []);

  useEffect(() => {
    if (geo.position) {
      reverseGeocode(geo.position.coords.latitude, geo.position.coords.longitude);
    }
  }, [geo.position, reverseGeocode]);

  const requestFreshGeo = useCallback((): Promise<{ lat: number; lng: number }> => {
    setGeoLoading(true);
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setGeoLoading(false);
        reject(new Error("Geolocalização não disponível neste dispositivo"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setFreshGeo(coords);
          setGeoLoading(false);
          reverseGeocode(coords.lat, coords.lng);
          resolve(coords);
        },
        (err) => {
          setGeoLoading(false);
          if (err.code === err.PERMISSION_DENIED) {
            reject(new Error("Permissão de localização negada. Ative a localização nas configurações do celular e tente novamente."));
          } else if (err.code === err.TIMEOUT) {
            reject(new Error("Não foi possível obter sua localização. Verifique se o GPS está ativado e tente novamente."));
          } else {
            reject(new Error("Erro ao obter localização. Ative o GPS e tente novamente."));
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [reverseGeocode]);

  const clockMutation = useMutation({
    mutationFn: async ({ action, photo, lat, lng }: { action: string; photo: string; lat: number; lng: number }) => {
      const res = await apiRequest("POST", "/api/mobile/ponto/clock", {
        action, photo,
        latitude: lat.toString(),
        longitude: lng.toString(),
        address: geoAddress || undefined,
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

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !activeAction) return;
    try {
      const coords = await requestFreshGeo();
      const cv = canvasRef.current;
      const video = videoRef.current;
      cv.width = Math.min(video.videoWidth, 1280);
      cv.height = Math.min(video.videoHeight, 1280);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      const dataUrl = cv.toDataURL("image/jpeg", 0.7);
      clockMutation.mutate({ action: activeAction, photo: dataUrl, lat: coords.lat, lng: coords.lng });
    } catch (err: any) {
      toast({ title: "Localização obrigatória", description: err.message, variant: "destructive" });
    }
  }, [activeAction, clockMutation, requestFreshGeo, toast]);

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
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-white text-xs">
                  <span className="flex items-center gap-1"><Clock size={12} /> {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="flex items-center gap-1"><MapPin size={12} /> {freshGeo ? `${freshGeo.lat.toFixed(4)}, ${freshGeo.lng.toFixed(4)}` : geo.position ? `${geo.position.coords.latitude.toFixed(4)}, ${geo.position.coords.longitude.toFixed(4)}` : "Obtendo..."}</span>
                </div>
                {geoAddress && (
                  <p className="text-[10px] text-white/70 leading-tight truncate">{geoAddress}</p>
                )}
              </div>
              <button onClick={capturePhoto} disabled={clockMutation.isPending || geoLoading} data-testid="button-capture-ponto"
                className="w-full py-3 bg-white rounded-xl text-black font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-50">
                {(clockMutation.isPending || geoLoading) ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                {geoLoading ? "Obtendo GPS..." : "Registrar Ponto"}
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
          {geo.denied ? (
            <p className="text-xs mt-1 flex items-center justify-center gap-1 text-red-400">
              <MapPin size={10} /> Localização negada — ative nas configurações
            </p>
          ) : geo.position ? (
            <p className="text-xs mt-1 flex items-center justify-center gap-1 text-emerald-400">
              <MapPin size={10} /> Localização ativa
            </p>
          ) : !geo.loading && !geo.position ? (
            <button
              onClick={geo.requestPermission}
              className="mt-2 px-4 py-2 bg-emerald-600 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 mx-auto"
              data-testid="button-allow-location"
            >
              <MapPin size={14} /> Permitir Localização
            </button>
          ) : (
            <p className="text-xs mt-1 flex items-center justify-center gap-1 text-neutral-400">
              <Loader2 size={10} className="animate-spin" /> Obtendo localização...
            </p>
          )}
        </div>

        {geo.position && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-4" data-testid="card-geo-address">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Sua Localização Confirmada</p>
                {addressLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 text-neutral-400 animate-spin" />
                    <p className="text-xs text-neutral-400">Confirmando endereço...</p>
                  </div>
                ) : geoAddress ? (
                  <p className="text-xs text-neutral-700 leading-relaxed" data-testid="text-geo-address">{geoAddress}</p>
                ) : (
                  <p className="text-xs text-neutral-500">{geo.position.coords.latitude.toFixed(6)}, {geo.position.coords.longitude.toFixed(6)}</p>
                )}
                <a
                  href={`https://www.google.com/maps?q=${geo.position.coords.latitude},${geo.position.coords.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-bold mt-1.5"
                  data-testid="link-google-maps"
                >
                  <ExternalLink className="w-3 h-3" /> Ver no Google Maps
                </a>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-neutral-300" /></div>
        ) : (
          <div className="space-y-3">
            {geo.denied && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3" data-testid="alert-geo-denied">
                <MapPin className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-700 uppercase">Localização Bloqueada</p>
                  <p className="text-[11px] text-red-600 mt-0.5">A permissão de localização foi negada. Para registrar o ponto, você precisa:</p>
                  <ol className="text-[11px] text-red-600 mt-1 ml-3 list-decimal space-y-0.5">
                    <li>Abrir <strong>Ajustes</strong> do celular</li>
                    <li>Ir em <strong>Privacidade → Serviços de Localização</strong></li>
                    <li>Encontrar o <strong>navegador</strong> (Safari/Chrome)</li>
                    <li>Selecionar <strong>"Ao Usar o App"</strong></li>
                  </ol>
                  <button onClick={geo.requestPermission} className="mt-3 w-full px-3 py-2.5 bg-red-600 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2" data-testid="button-retry-geo">
                    <MapPin size={14} /> Tentar Novamente
                  </button>
                </div>
              </div>
            )}
            {!geo.denied && !geo.position && !geo.loading && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3" data-testid="alert-geo-needed">
                <MapPin className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-700 uppercase">Localização Necessária</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">Para registrar o ponto, precisamos acessar sua localização. Toque no botão abaixo para permitir.</p>
                  <button onClick={geo.requestPermission} className="mt-3 w-full px-3 py-2.5 bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2" data-testid="button-request-geo">
                    <MapPin size={14} /> Permitir Localização
                  </button>
                </div>
              </div>
            )}
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
