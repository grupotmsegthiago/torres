import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, ArrowLeft, Loader2, Fuel, Gauge, Receipt, CheckCircle, AlertTriangle, Droplets, MapPin } from "lucide-react";
import { Link } from "wouter";

type PhotoKey = "pumpPhoto" | "receiptPhoto" | "odometerPhoto";

const PHOTO_STEPS: { key: PhotoKey; label: string; icon: typeof Camera }[] = [
  { key: "pumpPhoto", label: "Foto da Bomba", icon: Fuel },
  { key: "receiptPhoto", label: "Foto da NF", icon: Receipt },
  { key: "odometerPhoto", label: "Foto do Hodômetro", icon: Gauge },
];

export default function MobileAbastecimentoPage() {
  const { user } = useAuth();
  const geo = useGeolocation();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<Record<PhotoKey, string>>({ pumpPhoto: "", receiptPhoto: "", odometerPhoto: "" });
  const [captureTarget, setCaptureTarget] = useState<PhotoKey | null>(null);
  const [km, setKm] = useState("");
  const [liters, setLiters] = useState("");
  const [costPerLiter, setCostPerLiter] = useState("");
  const [station, setStation] = useState("");
  const [oilAlert, setOilAlert] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`);
      const d = await r.json();
      if (d.display_name) setGeoAddress(d.display_name);
    } catch {}
  }, []);

  useEffect(() => {
    if (geo.position && !geoAddress) {
      reverseGeocode(geo.position.coords.latitude, geo.position.coords.longitude);
    }
  }, [geo.position, geoAddress, reverseGeocode]);

  const requestFreshGeo = useCallback((): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      setGeoLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGeoLoading(false);
          reverseGeocode(coords.lat, coords.lng);
          resolve(coords);
        },
        (err) => { setGeoLoading(false); reject(new Error("Não foi possível obter localização GPS")); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [reverseGeocode]);

  const { data: vehicle, isLoading: loadingVehicle } = useQuery<any>({
    queryKey: ["/api/mobile/abastecimento/vehicle"],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const coords = await requestFreshGeo();
      const totalCost = liters && costPerLiter ? (parseFloat(liters) * parseFloat(costPerLiter)).toFixed(2) : undefined;
      const res = await authFetch("/api/mobile/abastecimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: vehicle.id, km: parseInt(km), liters: parseFloat(liters) || 0,
          costPerLiter: parseFloat(costPerLiter) || undefined, totalCost,
          station, ...photos,
          latitude: coords.lat.toString(), longitude: coords.lng.toString(),
          address: geoAddress || undefined,
        }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { message: text }; }
      if (!res.ok) throw new Error(data.message || "Erro ao registrar abastecimento");
      return data;
    },
    onSuccess: (data) => {
      setSubmitted(true);
      if (data.oilAlert) setOilAlert(data.oilAlert);
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/abastecimento/vehicle"] });
      toast({ title: "Abastecimento registrado!" });
    },
    onError: (err: Error) => toast({ title: "Erro ao registrar", description: err.message, variant: "destructive" }),
  });

  const startCamera = useCallback(async (target: PhotoKey) => {
    setCaptureTarget(target);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 960 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch { toast({ title: "Erro ao acessar câmera", variant: "destructive" }); setCaptureTarget(null); }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCaptureTarget(null);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !captureTarget) return;
    const cv = canvasRef.current; const video = videoRef.current;
    cv.width = Math.min(video.videoWidth, 1280); cv.height = Math.min(video.videoHeight, 1280);
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.7);
    setPhotos(p => ({ ...p, [captureTarget]: dataUrl }));
    stopCamera();
  }, [captureTarget, stopCamera]);

  if (captureTarget) {
    const step = PHOTO_STEPS.find(s => s.key === captureTarget);
    return (
      <MobileLayout>
        <div className="p-4 space-y-4" data-testid="abastecimento-camera">
          <button onClick={stopCamera} className="flex items-center gap-2 text-sm text-neutral-500"><ArrowLeft size={18} /> Voltar</button>
          <p className="text-center font-bold text-neutral-700 text-sm uppercase tracking-wider">{step?.label}</p>
          <div className="bg-black rounded-2xl overflow-hidden relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <button onClick={capturePhoto} data-testid="button-capture-fuel"
                className="w-full py-3 bg-white rounded-xl text-black font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2">
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
        <div className="p-4 space-y-4" data-testid="abastecimento-success">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <CheckCircle className="mx-auto text-emerald-600 mb-3" size={40} />
            <h2 className="text-lg font-black text-emerald-800">Abastecimento Registrado!</h2>
            <p className="text-sm text-emerald-600 mt-1">{vehicle?.plate} · {km} km</p>
          </div>
          {oilAlert && (
            <div className={`rounded-2xl p-4 border flex items-start gap-3 ${oilAlert.includes("VENCIDA") ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <AlertTriangle size={20} className={oilAlert.includes("VENCIDA") ? "text-red-600" : "text-amber-600"} />
              <div>
                <p className={`text-sm font-bold ${oilAlert.includes("VENCIDA") ? "text-red-800" : "text-amber-800"}`}>Troca de Óleo</p>
                <p className={`text-xs mt-1 ${oilAlert.includes("VENCIDA") ? "text-red-600" : "text-amber-600"}`}>{oilAlert}</p>
              </div>
            </div>
          )}
          <Link href="/mobile">
            <button className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold text-sm uppercase tracking-wider" data-testid="button-back-home">Voltar ao Início</button>
          </Link>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-abastecimento-page">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/mobile"><button className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center" data-testid="button-back"><ArrowLeft size={18} className="text-neutral-600" /></button></Link>
          <div>
            <h1 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Abastecimento</h1>
            <p className="text-xs text-neutral-400">Registrar abastecimento do veículo</p>
          </div>
        </div>

        {loadingVehicle ? (
          <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-neutral-300" /></div>
        ) : !vehicle ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <AlertTriangle className="mx-auto text-amber-500 mb-2" size={28} />
            <p className="text-sm font-bold text-amber-800">Nenhum veículo vinculado</p>
            <p className="text-xs text-amber-600 mt-1">Solicite ao administrador a vinculação de viatura.</p>
          </div>
        ) : (
          <>
            <div className="bg-neutral-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-700 flex items-center justify-center">
                <Fuel size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-black text-white">{vehicle.plate}</p>
                <p className="text-xs text-neutral-400">{vehicle.model} · KM atual: {(vehicle.km || 0).toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4" data-testid="abastecimento-location">
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={16} className="text-blue-600" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Localização do Abastecimento</p>
              </div>
              {geo.position ? (
                <div className="space-y-1">
                  <p className="text-xs font-mono text-blue-700">
                    {geo.position.coords.latitude.toFixed(5)}, {geo.position.coords.longitude.toFixed(5)}
                  </p>
                  {geoAddress ? (
                    <p className="text-xs text-blue-600 leading-relaxed">{geoAddress}</p>
                  ) : (
                    <p className="text-xs text-blue-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Confirmando endereço...</p>
                  )}
                  <a href={`https://www.google.com/maps?q=${geo.position.coords.latitude},${geo.position.coords.longitude}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 underline font-bold" data-testid="link-map-fuel">
                    Ver no Google Maps
                  </a>
                </div>
              ) : (
                <p className="text-xs text-blue-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Obtendo localização...</p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fotos Obrigatórias</p>
              {PHOTO_STEPS.map(step => {
                const done = !!photos[step.key];
                const Icon = step.icon;
                return (
                  <div key={step.key} className={`rounded-2xl border p-3 flex items-center justify-between ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-neutral-200"}`} data-testid={`photo-${step.key}`}>
                    <div className="flex items-center gap-3">
                      {done ? <CheckCircle size={20} className="text-emerald-600" /> : <Icon size={20} className="text-neutral-400" />}
                      <span className="text-sm font-bold text-neutral-700">{step.label}</span>
                    </div>
                    {done ? (
                      <img src={photos[step.key]} className="w-12 h-12 rounded-lg object-cover border" alt={step.label} />
                    ) : (
                      <button onClick={() => startCamera(step.key)} className="px-3 py-2 bg-neutral-900 text-white rounded-lg text-xs font-bold flex items-center gap-1" data-testid={`button-photo-${step.key}`}>
                        <Camera size={12} /> Tirar Foto
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Dados do Abastecimento</p>
              <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">KM Atual *</label>
                  <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="Ex: 45320"
                    className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-km" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Litros</label>
                    <input type="number" step="0.01" value={liters} onChange={e => setLiters(e.target.value)} placeholder="0.00"
                      className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-liters" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/Litro</label>
                    <input type="number" step="0.01" value={costPerLiter} onChange={e => setCostPerLiter(e.target.value)} placeholder="0.00"
                      className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-cost" />
                  </div>
                </div>
                {liters && costPerLiter && (
                  <div className="bg-neutral-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-neutral-400">Total</p>
                    <p className="text-lg font-black text-neutral-900 font-mono">R$ {(parseFloat(liters) * parseFloat(costPerLiter)).toFixed(2)}</p>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Posto</label>
                  <input type="text" value={station} onChange={e => setStation(e.target.value)} placeholder="Nome do posto"
                    className="w-full p-3 border border-neutral-200 rounded-xl text-sm" data-testid="input-station" />
                </div>
              </div>
            </div>

            <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !km || !photos.pumpPhoto || !photos.receiptPhoto || !photos.odometerPhoto} data-testid="button-submit-fuel"
              className="w-full py-4 bg-neutral-900 text-white rounded-xl font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-40">
              {submitMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Droplets size={18} />}
              Registrar Abastecimento
            </button>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
