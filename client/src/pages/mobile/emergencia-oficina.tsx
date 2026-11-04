import MobileLayout from "@/components/mobile/layout";
import { PosicaoConfirmada } from "@/components/mobile/posicao-confirmada";
import { loadGoogleMapsScript } from "@/components/places-autocomplete";
import { authFetch } from "@/lib/queryClient";
import { ONDE_ABASTECER_RADIUS_STEPS_KM, maxRadiusStepKm } from "@shared/anp-onde-abastecer";
import {
  OFICINA_SEARCH_FAILED,
  noOficinaMessage,
  oficinaFromPlace,
  oficinaTelHref,
  oficinasPayload,
  type OficinaHit,
  type RankedOficina,
} from "@shared/emergencia-oficina";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Loader2, MapPin, Phone } from "lucide-react";

interface Payload {
  mode: "nearest" | "empty";
  emptyReason?: "no_station" | "search_failed" | null;
  message: string | null;
  shops: RankedOficina[];
  radiusKm?: number;
}

function RadiusRuler({ activeKm, opening }: { activeKm: number | null; opening: boolean }) {
  return (
    <div className="px-4 pt-4" data-testid="radius-ruler">
      <div className="flex items-end gap-1">
        {ONDE_ABASTECER_RADIUS_STEPS_KM.map((step) => {
          const reached = !opening && activeKm !== null && step <= activeKm;
          return (
            <div key={step} className="flex-1">
              <div className={`h-1.5 rounded-full ${reached ? "bg-amber-600" : "bg-neutral-200"} ${opening ? "animate-pulse" : ""}`} />
              <p className={`mt-1 text-center text-[10px] font-bold ${reached && step === activeKm ? "text-amber-800" : "text-neutral-400"}`}>{step}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-0.5 text-center text-[10px] font-medium text-neutral-400">km</p>
    </div>
  );
}

function mapsPlacesReady(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    loadGoogleMapsScript(() => finish(!!window.google?.maps?.places?.PlacesService));
    window.setTimeout(() => finish(!!window.google?.maps?.places?.PlacesService), 5000);
  });
}

function nearbyPlaces(keyword: string, origin: { lat: number; lng: number }): Promise<OficinaHit[]> {
  return new Promise((resolve) => {
    const Ctor = window.google?.maps?.places?.PlacesService;
    if (!Ctor) {
      resolve([]);
      return;
    }
    const service = new Ctor(document.createElement("div"));
    const timer = window.setTimeout(() => resolve([]), 8000);
    service.nearbySearch(
      { location: origin, radius: maxRadiusStepKm() * 1000, keyword },
      (results: Array<{ place_id?: string; name?: string; vicinity?: string; business_status?: string; types?: string[]; geometry?: { location?: { lat: () => number; lng: () => number } } }> | null, status: string) => {
        window.clearTimeout(timer);
        if (status !== "OK" || !results) {
          resolve([]);
          return;
        }
        const hits: OficinaHit[] = [];
        for (const result of results) {
          const loc = result.geometry?.location;
          if (!loc || !result.place_id || !result.name) continue;
          const hit = oficinaFromPlace({
            placeId: result.place_id,
            name: result.name,
            lat: loc.lat(),
            lng: loc.lng(),
            vicinity: result.vicinity,
            types: result.types,
            businessStatus: result.business_status,
          });
          if (hit) hits.push(hit);
        }
        resolve(hits);
      },
    );
  });
}

async function shopsFromPhoneMap(origin: { lat: number; lng: number }): Promise<Payload | null> {
  const ready = await mapsPlacesReady();
  if (!ready) return null;
  const batches = await Promise.all([
    nearbyPlaces("borracharia", origin),
    nearbyPlaces("oficina mecânica", origin),
  ]);
  const ranked = oficinasPayload(origin.lat, origin.lng, batches.flat(), true);
  return ranked.shops.length ? ranked : null;
}

function ShopCard({ shop, primary }: { shop: RankedOficina; primary?: boolean }) {
  const call = oficinaTelHref(shop.phone);
  return (
    <div
      className={primary
        ? "bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm space-y-4"
        : "border border-neutral-200 rounded-2xl p-4 space-y-3 bg-neutral-50/50"}
      data-testid={primary ? "card-oficina-principal" : `card-oficina-${shop.id}`}
    >
      <div>
        <h2 className={primary ? "text-lg font-bold text-neutral-900" : "font-bold text-sm text-neutral-900"}>{shop.name}</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {shop.distanceKm.toFixed(1)} km · cerca de {shop.driveMinutes} min
        </p>
        {shop.address && <p className="text-xs text-neutral-400 mt-1">{shop.address}</p>}
        {shop.phone && <p className="text-xs font-semibold text-neutral-800 mt-1" data-testid={primary ? "text-telefone" : `text-telefone-${shop.id}`}>{shop.phone}</p>}
      </div>
      <p className="text-xs font-bold text-amber-950 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2" data-testid={primary ? "text-tipo-oficina" : undefined}>
        {shop.kindLabel}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {call ? (
          <a href={call} className="h-12 rounded-2xl bg-amber-700 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1" data-testid={`button-ligar-${shop.id}`}>
            <Phone className="w-4 h-4" /> Ligar
          </a>
        ) : <div />}
        <button
          type="button"
          onClick={() => window.open(`https://waze.com/ul?ll=${shop.latitude},${shop.longitude}&navigate=yes`, "_blank", "noopener,noreferrer")}
          className="h-12 rounded-2xl border-2 border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-800"
          data-testid={`button-waze-${shop.id}`}
        >
          Waze
        </button>
      </div>
    </div>
  );
}

export default function EmergenciaOficinaPage() {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lendoMapa, setLendoMapa] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocalização não é suportada pelo seu navegador.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (cancelled) return;
        const { latitude, longitude, accuracy } = position.coords;
        setFix({ lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null });
        setLendoMapa(false);
        try {
          const res = await authFetch(`/api/mobile/emergencia-oficina?lat=${latitude}&lng=${longitude}`);
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.status === 400) throw new Error(data.message || "Latitude e longitude são obrigatórias.");
          const serverFailed = !res.ok || data.emptyReason === "search_failed";
          if (!serverFailed) {
            setPayload(data);
            setLoading(false);
            return;
          }
          setLendoMapa(true);
          const fromMap = await shopsFromPhoneMap({ lat: latitude, lng: longitude });
          if (cancelled) return;
          setPayload(fromMap ?? {
            mode: "empty",
            emptyReason: "search_failed",
            message: data.message || OFICINA_SEARCH_FAILED,
            shops: [],
          });
          setLoading(false);
        } catch (err: any) {
          if (cancelled) return;
          setErrorMsg(err.message || "Erro de conexão ao buscar borracharia e mecânico.");
          setLoading(false);
        }
      },
      () => {
        if (cancelled) return;
        setErrorMsg("Não foi possível obter sua localização. Verifique as permissões do GPS.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const primary = payload?.shops?.[0];
  const others = payload?.shops?.slice(1) || [];
  const failed = payload?.emptyReason === "search_failed";

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-[80vh] pb-8" data-testid="mobile-emergencia-oficina-page">
        <div className="flex items-center gap-3 py-3 px-4 border-b border-neutral-100 bg-white">
          <Link href="/mobile" className="p-1 rounded-xl hover:bg-neutral-100" data-testid="button-back">
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </Link>
          <h1 className="text-base font-bold text-neutral-900">Socorro: borracharia / mecânico</h1>
        </div>
        <RadiusRuler activeKm={payload?.radiusKm ?? null} opening={loading} />
        {fix && (
          <div className="px-4 pt-3" data-testid="bloco-mapa">
            <PosicaoConfirmada
              lat={fix.lat}
              lng={fix.lng}
              accuracy={fix.accuracy}
              stations={payload?.shops?.map((shop) => ({ cnpj: shop.id, name: shop.name, latitude: shop.latitude, longitude: shop.longitude }))}
              radiusKm={payload?.radiusKm ?? 5}
            />
          </div>
        )}
        <div className="p-4 flex-1 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-700" />
              <p className="text-sm text-neutral-500 font-medium text-center">
                {lendoMapa ? "A busca não respondeu. Lendo o mapa do celular..." : "Buscando borracharia e mecânico em volta de você..."}
              </p>
            </div>
          )}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800" data-testid="text-oficina-error">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}
          {!loading && !errorMsg && !primary && (
            failed ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3" data-testid="empty-search-failed">
                <AlertCircle className="w-8 h-8 mx-auto text-amber-600" />
                <h2 className="text-base font-bold text-amber-900">A busca não respondeu</h2>
                <p className="text-xs text-amber-700 leading-relaxed">{payload?.message || OFICINA_SEARCH_FAILED}</p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setPayload(null);
                    setLoading(true);
                    setAttempt((value) => value + 1);
                  }}
                  className="h-12 px-4 rounded-2xl bg-amber-700 text-white text-xs font-bold uppercase tracking-wider"
                  data-testid="button-tentar-busca"
                >
                  Tentar de novo
                </button>
              </div>
            ) : (
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 text-center space-y-2" data-testid="empty-no-oficina">
                <MapPin className="w-8 h-8 mx-auto text-neutral-400" />
                <h2 className="text-base font-bold text-neutral-800">Nenhuma borracharia ou mecânico</h2>
                <p className="text-xs text-neutral-500 leading-relaxed">{payload?.message || noOficinaMessage(maxRadiusStepKm())}</p>
              </div>
            )
          )}
          {!loading && !errorMsg && primary && (
            <>
              <ShopCard shop={primary} primary />
              {others.length > 0 && (
                <button type="button" onClick={() => setShowAll(true)} className="w-full text-xs font-bold text-amber-800 py-1" data-testid="button-ver-outros">
                  Ver outros ({others.length})
                </button>
              )}
            </>
          )}
          {showAll && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
              <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[85vh] overflow-y-auto p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                  <h3 className="font-bold text-base text-neutral-900">Outros em {payload?.radiusKm ?? 5} km</h3>
                  <button type="button" onClick={() => setShowAll(false)} className="text-xs font-bold text-neutral-500 px-2 py-1" data-testid="button-fechar-outros">Fechar</button>
                </div>
                {others.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
