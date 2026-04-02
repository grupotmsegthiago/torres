import { parseBRL } from "@/lib/utils";
import MobileLayout from "@/components/mobile/layout";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, ArrowLeft, Loader2, Fuel, Gauge, Receipt, CheckCircle, AlertTriangle, Droplets, MapPin, Car, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

type PhotoKey = "pumpPhoto" | "receiptPhoto" | "odometerPhoto";
type Step = "SELECT" | "FORM" | "PLATE";
type CaptureMode = "plate" | PhotoKey;

const FUEL_STEPS: { key: PhotoKey; label: string; icon: typeof Camera }[] = [
  { key: "pumpPhoto", label: "Foto da Bomba", icon: Fuel },
  { key: "receiptPhoto", label: "Foto da NF", icon: Receipt },
  { key: "odometerPhoto", label: "Foto do Hodômetro", icon: Gauge },
];

export default function MobileAbastecimentoPage() {
  const geo = useGeolocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("SELECT");
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [platePhoto, setPlatePhoto] = useState("");
  const [plateConfirmed, setPlateConfirmed] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const [photos, setPhotos] = useState<Record<PhotoKey, string>>({ pumpPhoto: "", receiptPhoto: "", odometerPhoto: "" });
  const [km, setKm] = useState("");
  const [fuelType, setFuelType] = useState<"gasolina" | "etanol">("gasolina");
  const [liters, setLiters] = useState("");
  const [costPerLiter, setCostPerLiter] = useState("");
  const [etanolPrice, setEtanolPrice] = useState("");
  const [gasolinaPrice, setGasolinaPrice] = useState("");
  const [station, setStation] = useState("");
  const [oilAlert, setOilAlert] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [searchPlate, setSearchPlate] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery<any[]>({
    queryKey: ["/api/mobile/abastecimento/vehicles"],
  });

  const filteredVehicles = vehicles.filter((v: any) => {
    if (!searchPlate) return true;
    const q = searchPlate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const plate = (v.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const model = (v.model || "").toUpperCase();
    return plate.includes(q) || model.includes(q);
  });

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
        () => { setGeoLoading(false); reject(new Error("Não foi possível obter localização GPS")); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [reverseGeocode]);

  const startCamera = useCallback(async (mode: CaptureMode) => {
    setCaptureMode(mode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 1280, height: 960 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
    } catch {
      toast({ title: "Erro ao acessar câmera", variant: "destructive" });
      setCaptureMode(null);
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCaptureMode(null);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !captureMode) return;
    const cv = canvasRef.current; const video = videoRef.current;
    cv.width = Math.min(video.videoWidth, 1280); cv.height = Math.min(video.videoHeight, 1280);
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const dataUrl = cv.toDataURL("image/jpeg", 0.7);
    if (captureMode === "plate") {
      setPlatePhoto(dataUrl);
      setPlateConfirmed(false);
    } else {
      setPhotos(p => ({ ...p, [captureMode]: dataUrl }));
    }
    stopCamera();
  }, [captureMode, stopCamera]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const coords = await requestFreshGeo();
      const totalCost = liters && costPerLiter ? (parseBRL(liters) * parseBRL(costPerLiter)).toFixed(2) : undefined;
      const res = await authFetch("/api/mobile/abastecimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: selectedVehicle.id, km: parseInt(km), liters: parseBRL(liters) || 0,
          costPerLiter: parseBRL(costPerLiter) || undefined, totalCost,
          fuelType, station, ...photos, platePhoto,
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
      queryClient.invalidateQueries({ queryKey: ["/api/mobile/abastecimento/vehicles"] });
      toast({ title: "Abastecimento registrado!" });
    },
    onError: (err: Error) => toast({ title: "Erro ao registrar", description: err.message, variant: "destructive" }),
  });

  if (captureMode) {
    const label = captureMode === "plate" ? "Foto da Placa" : FUEL_STEPS.find(s => s.key === captureMode)?.label;
    return (
      <MobileLayout>
        <div className="p-4 space-y-4" data-testid="abastecimento-camera">
          <button onClick={stopCamera} className="flex items-center gap-2 text-sm text-neutral-500" data-testid="button-back-camera">
            <ArrowLeft size={18} /> Voltar
          </button>
          <p className="text-center font-bold text-neutral-700 text-sm uppercase tracking-wider">{label}</p>
          {captureMode === "plate" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
              <p className="text-xs text-amber-700">Fotografe a placa do veículo <span className="font-black">{selectedVehicle?.plate}</span></p>
            </div>
          )}
          <div className="bg-black rounded-2xl overflow-hidden relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <button onClick={capturePhoto} data-testid="button-capture-photo"
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
            <p className="text-sm text-emerald-600 mt-1">{selectedVehicle?.plate} · {km} km</p>
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
            <button className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold text-sm uppercase tracking-wider" data-testid="button-back-home">
              Voltar ao Início
            </button>
          </Link>
        </div>
      </MobileLayout>
    );
  }

  const stepLabels: Record<Step, string> = {
    SELECT: "Selecione a viatura",
    FORM: "Dados do abastecimento",
    PLATE: "Confirmar placa",
  };

  const stepOrder: Step[] = ["SELECT", "FORM", "PLATE"];

  const goBack = () => {
    if (step === "FORM") setStep("SELECT");
    else if (step === "PLATE") setStep("FORM");
  };

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-abastecimento-page">

        <div className="flex items-center gap-3 mb-2">
          {step === "SELECT" ? (
            <Link href="/mobile">
              <button className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center" data-testid="button-back">
                <ArrowLeft size={18} className="text-neutral-600" />
              </button>
            </Link>
          ) : (
            <button onClick={goBack}
              className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center" data-testid="button-back">
              <ArrowLeft size={18} className="text-neutral-600" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Abastecimento</h1>
            <p className="text-xs text-neutral-400">{stepLabels[step]}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-1.5 rounded-full flex-1 transition-colors ${stepOrder.indexOf(step) >= i ? "bg-neutral-900" : "bg-neutral-200"}`} />
            </div>
          ))}
        </div>

        {step === "SELECT" && (
          <>
            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Selecione a Viatura</p>
            <input type="text" value={searchPlate} onChange={e => setSearchPlate(e.target.value)}
              placeholder="Buscar por placa ou modelo..."
              className="w-full p-3 border border-neutral-200 rounded-xl text-sm bg-white" data-testid="input-search-vehicle" />
            {loadingVehicles ? (
              <div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-neutral-300" /></div>
            ) : vehicles.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                <AlertTriangle className="mx-auto text-amber-500 mb-2" size={28} />
                <p className="text-sm font-bold text-amber-800">Nenhuma viatura cadastrada</p>
                <p className="text-xs text-amber-600 mt-1">Entre em contato com o administrador.</p>
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div className="bg-neutral-50 rounded-2xl p-6 text-center">
                <p className="text-sm text-neutral-500">Nenhuma viatura encontrada para "<span className="font-bold">{searchPlate}</span>"</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVehicles.map((v: any) => (
                  <button key={v.id} onClick={() => { setSelectedVehicle(v); setStep("FORM"); }}
                    className="w-full bg-white border border-neutral-200 rounded-2xl p-4 flex items-center gap-3 text-left active:bg-neutral-50"
                    data-testid={`vehicle-card-${v.id}`}>
                    <div className="w-11 h-11 rounded-xl bg-neutral-900 flex items-center justify-center shrink-0">
                      <Car size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-black text-neutral-900 tracking-wider">{v.plate}</p>
                      <p className="text-xs text-neutral-500 truncate">{v.model}{v.frota ? ` · Frota ${v.frota}` : ""}</p>
                      <p className="text-[10px] text-neutral-400 font-mono">KM atual: {(v.km || 0).toLocaleString("pt-BR")}</p>
                    </div>
                    <ChevronRight size={18} className="text-neutral-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === "FORM" && selectedVehicle && (
          <>
            <div className="bg-neutral-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-700 flex items-center justify-center">
                <Fuel size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-white tracking-wider">{selectedVehicle.plate}</p>
                <p className="text-xs text-neutral-400">{selectedVehicle.model} · KM: {(selectedVehicle.km || 0).toLocaleString("pt-BR")}</p>
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
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Tipo de Combustível</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFuelType("gasolina")}
                  data-testid="btn-fuel-gasolina"
                  className={`py-3 rounded-xl font-black text-sm uppercase tracking-wider border-2 transition-all ${fuelType === "gasolina" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-neutral-200 bg-white text-neutral-400"}`}
                >
                  ⛽ Gasolina
                </button>
                <button
                  onClick={() => setFuelType("etanol")}
                  data-testid="btn-fuel-etanol"
                  className={`py-3 rounded-xl font-black text-sm uppercase tracking-wider border-2 transition-all ${fuelType === "etanol" ? "border-green-500 bg-green-50 text-green-700" : "border-neutral-200 bg-white text-neutral-400"}`}
                >
                  🌿 Etanol
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Comparar Preços</p>
              <div className="bg-white rounded-2xl border border-neutral-200 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/L Gasolina</label>
                    <input type="text" inputMode="decimal" value={gasolinaPrice} onChange={e => setGasolinaPrice(e.target.value)} placeholder="0.00"
                      className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-gasolina-price" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/L Etanol</label>
                    <input type="text" inputMode="decimal" value={etanolPrice} onChange={e => setEtanolPrice(e.target.value)} placeholder="0.00"
                      className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-etanol-price" />
                  </div>
                </div>
                {gasolinaPrice && etanolPrice && parseBRL(gasolinaPrice) > 0 && (
                  (() => {
                    const ratio = parseBRL(etanolPrice) / parseBRL(gasolinaPrice);
                    const etanolVale = ratio <= 0.7;
                    return (
                      <div className={`mt-3 rounded-xl p-3 text-center border ${etanolVale ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                        <p className="text-[10px] font-bold text-neutral-500 uppercase">Relação Etanol/Gasolina</p>
                        <p className={`text-2xl font-black font-mono ${etanolVale ? "text-green-700" : "text-amber-700"}`}>{(ratio * 100).toFixed(1)}%</p>
                        <p className={`text-xs font-bold mt-1 ${etanolVale ? "text-green-600" : "text-amber-600"}`}>
                          {etanolVale ? "✅ ETANOL compensa! (≤ 70%)" : "⛽ GASOLINA é melhor (> 70%)"}
                        </p>
                      </div>
                    );
                  })()
                )}
              </div>
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
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Litros *</label>
                    <input type="text" inputMode="decimal" value={liters} onChange={e => setLiters(e.target.value)} placeholder="0.00"
                      className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-liters" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">R$/Litro *</label>
                    <input type="text" inputMode="decimal" value={costPerLiter} onChange={e => setCostPerLiter(e.target.value)} placeholder="0.00"
                      className="w-full p-3 border border-neutral-200 rounded-xl text-sm font-mono font-bold" data-testid="input-cost-per-liter" />
                  </div>
                </div>
                {liters && costPerLiter && (
                  <div className="bg-neutral-900 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs text-neutral-400 font-bold uppercase">Total</span>
                    <span className="text-lg font-black text-white font-mono" data-testid="text-total-cost">
                      R$ {(parseBRL(liters) * parseBRL(costPerLiter)).toFixed(2)}
                    </span>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase mb-1 block">Posto / Local</label>
                  <input type="text" value={station} onChange={e => setStation(e.target.value)} placeholder="Nome do posto"
                    className="w-full p-3 border border-neutral-200 rounded-xl text-sm" data-testid="input-station" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fotos Obrigatórias</p>
              {FUEL_STEPS.map(s => {
                const done = !!photos[s.key];
                const Icon = s.icon;
                return (
                  <div key={s.key} className={`rounded-2xl border p-3 flex items-center justify-between ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-neutral-200"}`} data-testid={`photo-${s.key}`}>
                    <div className="flex items-center gap-3">
                      {done ? <CheckCircle size={20} className="text-emerald-600" /> : <Icon size={20} className="text-neutral-400" />}
                      <span className="text-sm font-bold text-neutral-700">{s.label}</span>
                    </div>
                    {done ? (
                      <img src={photos[s.key]} className="w-12 h-12 rounded-lg object-cover border" alt={s.label} />
                    ) : (
                      <button onClick={() => startCamera(s.key)} className="px-3 py-2 bg-neutral-900 text-white rounded-lg text-xs font-bold flex items-center gap-1" data-testid={`button-photo-${s.key}`}>
                        <Camera size={12} /> Tirar Foto
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => setStep("PLATE")}
              disabled={!km || !liters || !costPerLiter || !photos.pumpPhoto || !photos.receiptPhoto || !photos.odometerPhoto}
              className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="button-proceed-plate">
              <ShieldCheck size={16} /> Prosseguir — Verificar Placa
            </button>
          </>
        )}

        {step === "PLATE" && selectedVehicle && (
          <>
            <div className="bg-neutral-900 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-neutral-700 flex items-center justify-center">
                <Car size={20} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-white tracking-wider">{selectedVehicle.plate}</p>
                <p className="text-xs text-neutral-400">{selectedVehicle.model} · KM: {km || (selectedVehicle.km || 0).toLocaleString("pt-BR")}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-neutral-500 uppercase font-bold">Total</p>
                <p className="text-sm font-black text-emerald-400 font-mono">R$ {liters && costPerLiter ? (parseBRL(liters) * parseBRL(costPerLiter)).toFixed(2) : "0.00"}</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-blue-600" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Verificação de Placa</p>
              </div>
              <p className="text-xs text-blue-700">Fotografe a placa física do veículo para confirmar que está abastecendo a viatura correta.</p>

              {!platePhoto ? (
                <button onClick={() => startCamera("plate")} data-testid="button-take-plate-photo"
                  className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2">
                  <Camera size={16} /> Fotografar Placa
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border-2 border-emerald-400">
                    <img src={platePhoto} alt="Foto da placa" className="w-full object-cover" data-testid="img-plate-photo" />
                  </div>
                  <div className="bg-white border border-neutral-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-neutral-400 uppercase">Placa cadastrada</p>
                      <p className="text-xl font-black text-neutral-900 tracking-[0.2em]">{selectedVehicle.plate}</p>
                    </div>
                    <button onClick={() => { setPlatePhoto(""); setPlateConfirmed(false); }} data-testid="button-retake-plate"
                      className="flex items-center gap-1 text-xs text-neutral-500 border border-neutral-200 rounded-lg px-2 py-1.5">
                      <RefreshCw size={12} /> Refazer
                    </button>
                  </div>

                  {!plateConfirmed ? (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-neutral-700 text-center">A placa na foto confere com <span className="text-neutral-900">{selectedVehicle.plate}</span>?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => { setPlatePhoto(""); setPlateConfirmed(false); }} data-testid="button-plate-no"
                          className="py-3 border border-red-200 bg-red-50 text-red-700 rounded-xl text-xs font-black uppercase">
                          Não confere
                        </button>
                        <button onClick={() => setPlateConfirmed(true)} data-testid="button-plate-yes"
                          className="py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase">
                          Confere ✓
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                        <CheckCircle size={16} className="text-emerald-600" />
                        <p className="text-xs font-bold text-emerald-700">Placa confirmada!</p>
                      </div>
                      <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
                        data-testid="button-submit-fueling"
                        className="w-full py-4 bg-emerald-600 text-white rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50">
                        {submitMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                        {submitMutation.isPending ? "Registrando..." : "Registrar Abastecimento"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </MobileLayout>
  );
}
