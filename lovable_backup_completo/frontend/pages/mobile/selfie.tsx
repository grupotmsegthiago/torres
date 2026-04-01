import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Loader2, RotateCcw, CheckCircle2, MapPin } from "lucide-react";

export default function SelfiePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [locationInfo, setLocationInfo] = useState<{ lat: string; lng: string; accuracy: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      toast({
        title: "Câmera não disponível",
        description: "Permita o acesso à câmera para continuar.",
        variant: "destructive",
      });
    }
  }, [facingMode, toast]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    startCamera();
    getPosition().then(pos => {
      setLocationInfo(pos);
      setLocationLoading(false);
    });
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!capturedPhoto) {
      startCamera();
    }
  }, [facingMode]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast({ title: "Aguarde a câmera carregar", variant: "destructive" });
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const getPosition = (): Promise<{ lat: string; lng: string; accuracy: string } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: String(pos.coords.latitude),
          lng: String(pos.coords.longitude),
          accuracy: String(pos.coords.accuracy),
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleSubmit = async () => {
    if (!capturedPhoto) return;
    setSubmitting(true);
    try {
      const pos = await getPosition();
      await apiRequest("POST", "/api/auth/login-selfie", {
        photoData: capturedPhoto,
        latitude: pos?.lat || null,
        longitude: pos?.lng || null,
      });
      toast({ title: "Selfie registrada com sucesso!" });
      setLocation("/mobile");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <div className="bg-neutral-900 text-white px-4 py-3 flex items-center gap-3">
        <Camera className="w-5 h-5" />
        <div>
          <p className="text-sm font-bold uppercase tracking-wider">Registro de Presença</p>
          <p className="text-[10px] text-neutral-400">Tire uma selfie para confirmar sua identidade</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden w-full max-w-sm">
          <div className="relative aspect-[3/4] bg-black">
            {!capturedPhoto && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
                data-testid="video-selfie"
              />
            )}
            {capturedPhoto && (
              <img
                src={capturedPhoto}
                alt="Selfie capturada"
                className="w-full h-full object-cover"
                data-testid="img-selfie-preview"
              />
            )}
            <canvas ref={canvasRef} className="hidden" />

            {!capturedPhoto && cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/40 rounded-full" />
              </div>
            )}
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-neutral-700">
            {user.name}
          </p>
          <p className="text-[10px] text-neutral-400">
            {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {" · "}
            {new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
          </p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <MapPin className="w-3 h-3 text-emerald-500" />
            {locationLoading ? (
              <span className="text-[10px] text-neutral-400">Capturando localização...</span>
            ) : locationInfo ? (
              <span className="text-[10px] text-emerald-600 font-semibold">
                Localização capturada ({parseFloat(locationInfo.lat).toFixed(6)}, {parseFloat(locationInfo.lng).toFixed(6)})
              </span>
            ) : (
              <span className="text-[10px] text-red-500">Localização indisponível</span>
            )}
          </div>
        </div>

        {!capturedPhoto ? (
          <button
            onClick={capturePhoto}
            disabled={!cameraActive}
            className="w-full max-w-sm h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
            data-testid="button-capture-selfie"
          >
            <Camera className="w-5 h-5" />
            Capturar Selfie
          </button>
        ) : (
          <div className="w-full max-w-sm space-y-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-confirm-selfie"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Confirmar e Entrar
            </button>
            <button
              onClick={retakePhoto}
              disabled={submitting}
              className="w-full h-12 bg-white border-2 border-neutral-300 text-neutral-700 rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              data-testid="button-retake-selfie"
            >
              <RotateCcw className="w-4 h-4" />
              Tirar Novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
