import { parseBRL, maskBRL } from "@/lib/utils";
import MobileLayout from "@/components/mobile/layout";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useMutation } from "@tanstack/react-query";
import { authFetch, queryClient, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback } from "react";
import { Camera, ArrowLeft, Loader2, CheckCircle, MapPin, Receipt, DollarSign } from "lucide-react";
import { Link } from "wouter";

export default function MobilePedagioPage() {
  const geo = useGeolocation();
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [captureMode, setCaptureMode] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const requestFreshGeo = useCallback((): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      setGeoLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoLoading(false);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => { setGeoLoading(false); reject(new Error("Não foi possível obter localização GPS")); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, []);

  const startCamera = useCallback(async () => {
    setCaptureMode(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 960 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch {
      toast({ title: "Erro ao acessar câmera", variant: "destructive" });
      setCaptureMode(false);
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCaptureMode(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const cv = canvasRef.current;
    const video = videoRef.current;
    cv.width = Math.min(video.videoWidth, 1280);
    cv.height = Math.min(video.videoHeight, 1280);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.7);
    setPhotoUrl(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const coords = await requestFreshGeo();
      const res = await authFetch("/api/mobile/pedagio-vazio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseBRL(amount),
          photoUrl,
          latitude: coords.lat.toString(),
          longitude: coords.lng.toString(),
        }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { message: text }; }
      if (!res.ok) throw new Error(data.message || "Erro ao registrar pedágio");
      return data;
    },
    onSuccess: (data) => {
      setSubmitted(true);
      invalidateRelatedQueries("financial");
      invalidateRelatedQueries("mission-cost");
      toast({ title: `Pedágio registrado! Viatura: ${data.vehiclePlate}` });
    },
    onError: (err: Error) => toast({ title: "Erro ao registrar", description: err.message, variant: "destructive" }),
  });

  if (captureMode) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4" data-testid="pedagio-camera">
          <button onClick={stopCamera} className="flex items-center gap-2 text-sm text-neutral-500" data-testid="button-back-camera">
            <ArrowLeft size={18} /> Voltar
          </button>
          <p className="text-center font-bold text-neutral-700 text-sm uppercase tracking-wider">Foto do Comprovante</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
            <p className="text-xs text-amber-700">Fotografe o comprovante do pedágio com o valor visível</p>
          </div>
          <div className="bg-black rounded-2xl overflow-hidden relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <button onClick={capturePhoto} className="w-full h-14 bg-white rounded-2xl flex items-center justify-center gap-2 font-black text-neutral-900 uppercase tracking-wider text-sm active:bg-neutral-200" data-testid="button-capture-photo">
                <Camera className="w-5 h-5" /> Capturar
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
        <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] space-y-4" data-testid="pedagio-success">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Pedágio Registrado!</h2>
          <p className="text-sm text-neutral-500 text-center">O custo foi registrado como despesa de deslocamento da viatura.</p>
          <div className="flex gap-3 w-full mt-4">
            <button onClick={() => { setSubmitted(false); setAmount(""); setPhotoUrl(""); }} className="flex-1 h-12 bg-neutral-100 rounded-xl font-bold text-sm text-neutral-700 uppercase" data-testid="button-new-toll">
              Novo Pedágio
            </button>
            <Link href="/mobile" className="flex-1">
              <div className="h-12 bg-neutral-900 rounded-xl flex items-center justify-center font-bold text-sm text-white uppercase" data-testid="link-back-home">
                Voltar
              </div>
            </Link>
          </div>
        </div>
      </MobileLayout>
    );
  }

  const parsedAmt = parseBRL(amount);
  const canSubmit = parsedAmt > 0 && !!photoUrl;

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="pedagio-page">
        <div className="flex items-center gap-3">
          <Link href="/mobile">
            <button className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 text-neutral-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-base font-black text-neutral-900 uppercase tracking-wider">Pedágio</h1>
            <p className="text-[11px] text-neutral-400">Registrar custo de pedágio</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-800 font-bold">Sem missão ativa?</p>
          <p className="text-[11px] text-amber-700 mt-0.5">O valor será registrado como <span className="font-bold">Custo de Deslocamento Vazio</span> na última viatura que você utilizou.</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Valor do Pedágio (R$)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(maskBRL(e.target.value))}
                className="w-full h-12 pl-9 pr-4 border border-neutral-200 rounded-xl text-lg font-bold text-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none"
                data-testid="input-amount"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">Foto do Comprovante</label>
            {photoUrl ? (
              <div className="relative">
                <img src={photoUrl} alt="Comprovante" className="w-full aspect-[4/3] object-cover rounded-xl border border-neutral-200" data-testid="img-receipt" />
                <button
                  onClick={() => { setPhotoUrl(""); startCamera(); }}
                  className="absolute top-2 right-2 bg-white/90 rounded-lg px-2 py-1 text-xs font-bold text-neutral-700 border border-neutral-200"
                  data-testid="button-retake"
                >
                  Refazer
                </button>
              </div>
            ) : (
              <button
                onClick={startCamera}
                className="w-full h-24 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center gap-1 active:bg-neutral-50 transition-colors"
                data-testid="button-open-camera"
              >
                <Camera className="w-6 h-6 text-neutral-400" />
                <span className="text-xs font-bold text-neutral-400 uppercase">Tirar Foto</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            {geo.position ? (
              <span className="text-emerald-600 font-semibold">GPS ativo ({geo.position.coords.latitude.toFixed(4)}, {geo.position.coords.longitude.toFixed(4)})</span>
            ) : geo.error ? (
              <span className="text-red-500 font-semibold">GPS indisponível — ative a localização</span>
            ) : (
              <span className="text-neutral-400">Obtendo localização...</span>
            )}
          </div>
        </div>

        <button
          onClick={() => submitMutation.mutate()}
          disabled={!canSubmit || submitMutation.isPending || !geo.position}
          className="w-full h-14 bg-neutral-900 rounded-2xl flex items-center justify-center gap-2 font-black text-white uppercase tracking-wider text-sm disabled:opacity-40 active:bg-neutral-800 transition-colors"
          data-testid="button-submit"
        >
          {submitMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
          ) : geoLoading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Obtendo GPS...</>
          ) : (
            <><Receipt className="w-5 h-5" /> Confirmar Pedágio</>
          )}
        </button>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </MobileLayout>
  );
}
