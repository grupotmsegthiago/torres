import MobileLayout from "@/components/mobile/layout";
import { PosicaoConfirmada } from "@/components/mobile/posicao-confirmada";
import { loadGoogleMapsScript } from "@/components/places-autocomplete";
import { authFetch } from "@/lib/queryClient";
import {
  acceptMapPoint,
  haversineKm,
  MAP_PIN_MAX_KM,
  ONDE_ABASTECER_RADIUS_STEPS_KM,
} from "@shared/anp-onde-abastecer";
import {
  formatHospitalPinList,
  hospitalCatalogPhrase,
  noHospitalMessage,
  rankHospitals,
  type HospitalCare,
  type HospitalPin,
  type HospitalToLocate,
  type RankedHospital,
} from "@shared/hospitais-cnes";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Loader2, MapPin, Phone } from "lucide-react";

interface Payload {
  mode: "nearest" | "empty";
  emptyReason?: "not_loaded" | "no_city" | "no_station" | "locating" | null;
  message: string | null;
  hospitals: RankedHospital[];
  pendingGeo: number;
  radiusKm?: number;
  cityLabel?: string | null;
  catalog?: { hospitals: number; inCity: number };
  toLocate?: HospitalToLocate[];
}

function viewportDiagonalKm(geometry: { viewport?: { getNorthEast?: () => { lat: () => number; lng: () => number }; getSouthWest?: () => { lat: () => number; lng: () => number } } } | null): number | null {
  const ne = geometry?.viewport?.getNorthEast?.();
  const sw = geometry?.viewport?.getSouthWest?.();
  if (!ne || !sw) return null;
  return haversineKm(ne.lat(), ne.lng(), sw.lat(), sw.lng());
}

function mapsGeocoderReady(): Promise<boolean> {
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
    loadGoogleMapsScript(() => finish(!!window.google?.maps?.Geocoder));
    window.setTimeout(() => finish(!!window.google?.maps?.Geocoder), 5000);
  });
}

function geocodeAddress(query: string, origin: { lat: number; lng: number }): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const geocoderCtor = window.google?.maps?.Geocoder;
    if (!query || !geocoderCtor) {
      resolve(null);
      return;
    }
    const delta = MAP_PIN_MAX_KM / 111;
    const bounds = new window.google.maps.LatLngBounds(
      { lat: origin.lat - delta, lng: origin.lng - delta },
      { lat: origin.lat + delta, lng: origin.lng + delta },
    );
    const timer = window.setTimeout(() => resolve(null), 8000);
    new geocoderCtor().geocode(
      { address: query, region: "br", bounds, componentRestrictions: { country: "BR" } },
      (results: Array<{ geometry?: { location?: { lat: () => number; lng: () => number }; location_type?: string; viewport?: { getNorthEast?: () => { lat: () => number; lng: () => number }; getSouthWest?: () => { lat: () => number; lng: () => number } } }; partial_match?: boolean }> | null, status: string) => {
        window.clearTimeout(timer);
        if (status !== "OK" || !results?.length) {
          resolve(null);
          return;
        }
        for (const result of results) {
          const loc = result.geometry?.location;
          if (!loc) continue;
          const point = acceptMapPoint({
            lat: loc.lat(),
            lng: loc.lng(),
            locationType: result.geometry?.location_type,
            partialMatch: result.partial_match === true,
            viewportDiagonalKm: viewportDiagonalKm(result.geometry ?? null),
          });
          if (!point) continue;
          if (haversineKm(origin.lat, origin.lng, point.lat, point.lng) > MAP_PIN_MAX_KM) continue;
          resolve(point);
          return;
        }
        resolve(null);
      },
    );
  });
}

function RadiusRuler({ activeKm, opening }: { activeKm: number | null; opening: boolean }) {
  return (
    <div className="px-4 pt-4" data-testid="radius-ruler">
      <div className="flex items-end gap-1">
        {ONDE_ABASTECER_RADIUS_STEPS_KM.map((step) => {
          const reached = !opening && activeKm !== null && step <= activeKm;
          return (
            <div key={step} className="flex-1">
              <div className={`h-1.5 rounded-full ${reached ? "bg-emerald-600" : "bg-neutral-200"} ${opening ? "animate-pulse" : ""}`} />
              <p className={`mt-1 text-center text-[10px] font-bold ${reached && step === activeKm ? "text-emerald-800" : "text-neutral-400"}`}>{step}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-0.5 text-center text-[10px] font-medium text-neutral-400">km</p>
    </div>
  );
}

function telHref(phone: string | null): string | null {
  if (!phone) return null;
  return `tel:+55${phone}`;
}

function HospitalCard({ hospital, primary }: { hospital: RankedHospital; primary?: boolean }) {
  const call = telHref(hospital.phone);
  return (
    <div className={primary
      ? "bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm space-y-4"
      : "border border-neutral-200 rounded-2xl p-4 space-y-3 bg-neutral-50/50"}
      data-testid={primary ? "card-hospital-principal" : `card-hospital-${hospital.cnes}`}
    >
      <div>
        <h2 className={primary ? "text-lg font-bold text-neutral-900" : "font-bold text-sm text-neutral-900"}>{hospital.name}</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {hospital.distanceKm.toFixed(1)} km · cerca de {hospital.driveMinutes} min · {hospital.unitLabel}
        </p>
        {hospital.address && <p className="text-xs text-neutral-400 mt-1">{hospital.address}</p>}
      </div>
      <p className="text-xs font-bold text-emerald-900 bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2" data-testid={primary ? "text-categoria" : undefined}>
        {hospital.categoryPhrase}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {call ? (
          <a href={call} className="h-12 rounded-2xl bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1" data-testid={`button-ligar-${hospital.cnes}`}>
            <Phone className="w-4 h-4" /> Ligar
          </a>
        ) : <div />}
        <button
          type="button"
          onClick={() => window.open(`https://waze.com/ul?ll=${hospital.latitude},${hospital.longitude}&navigate=yes`, "_blank", "noopener,noreferrer")}
          className="h-12 rounded-2xl border-2 border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-800"
          data-testid={`button-waze-${hospital.cnes}`}
        >
          Waze
        </button>
      </div>
    </div>
  );
}

export default function HospitaisPage() {
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
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
        try {
          const { latitude, longitude, accuracy } = position.coords;
          setFix({ lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null });
          const res = await authFetch(`/api/mobile/hospitais?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Erro ao buscar hospitais próximos.");
          if (cancelled) return;
          setPayload(data);
          const todo = (data.toLocate ?? []) as HospitalToLocate[];
          if (todo.length) {
            setLendoMapa(true);
            setLocating(true);
            const ready = await mapsGeocoderReady();
            if (cancelled) return;
            const pins: HospitalPin[] = [];
            const located: Array<Omit<RankedHospital, "distanceKm" | "driveMinutes" | "categoryPhrase">> = [];
            if (ready) {
              const found = await Promise.all(todo.map(async (item) => {
                const point = await geocodeAddress(item.query, { lat: latitude, lng: longitude });
                return point ? { item, point } : null;
              }));
              if (cancelled) return;
              for (const hit of found) {
                if (!hit) continue;
                pins.push({ cnes: hit.item.cnes, lat: hit.point.lat, lng: hit.point.lng });
                located.push({
                  cnes: hit.item.cnes,
                  name: hit.item.name,
                  address: hit.item.address,
                  phone: hit.item.phone,
                  care: hit.item.care as HospitalCare,
                  attendsSus: hit.item.attendsSus,
                  unitLabel: hit.item.unitLabel,
                  latitude: hit.point.lat,
                  longitude: hit.point.lng,
                });
              }
            }
            const previous = (data.hospitals ?? []).map((hospital) => ({
              cnes: hospital.cnes,
              name: hospital.name,
              address: hospital.address,
              phone: hospital.phone,
              care: hospital.care,
              attendsSus: hospital.attendsSus,
              unitLabel: hospital.unitLabel,
              latitude: hospital.latitude,
              longitude: hospital.longitude,
            }));
            const ranked = rankHospitals(latitude, longitude, [...previous, ...located]);
            if (ranked) {
              setPayload({ ...data, ...ranked, mode: "nearest", emptyReason: null, message: null, pendingGeo: 0, toLocate: [] });
            } else if (!data.hospitals?.length) {
              setPayload({
                ...data,
                emptyReason: "no_station",
                message: ready ? "O mapa não marcou o hospital. Toque de novo." : "O mapa não carregou para ler o endereço do hospital.",
                toLocate: [],
              });
            }
            if (cancelled) return;
            setLendoMapa(false);
            setLocating(false);
            setLoading(false);
            if (pins.length) {
              try {
                const savedRes = await authFetch(`/api/mobile/hospitais?lat=${latitude}&lng=${longitude}&pins=${encodeURIComponent(formatHospitalPinList(pins))}`);
                const saved = await savedRes.json();
                if (!cancelled && savedRes.ok && saved.hospitals?.length) setPayload(saved);
              } catch {
                /* a lista já lida no mapa continua nesta abertura */
              }
            }
            return;
          }
          setLoading(false);
        } catch (err: any) {
          if (cancelled) return;
          setErrorMsg(err.message || "Erro de conexão ao buscar hospitais.");
          setLoading(false);
        }
      },
      () => {
        if (cancelled) return;
        setErrorMsg("Não foi possível obter sua localização. Verifique as permissões do GPS.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const primary = payload?.hospitals?.[0];
  const others = payload?.hospitals?.slice(1) || [];
  const notLoaded = payload?.emptyReason === "not_loaded";

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-[80vh] pb-8" data-testid="mobile-hospitais-page">
        <div className="flex items-center gap-3 py-3 px-4 border-b border-neutral-100 bg-white">
          <Link href="/mobile" className="p-1 rounded-xl hover:bg-neutral-100" data-testid="button-back">
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </Link>
          <h1 className="text-base font-bold text-neutral-900">Hospitais</h1>
        </div>
        {!notLoaded && <RadiusRuler activeKm={payload?.radiusKm ?? null} opening={loading || locating} />}
        {fix && (
          <div className="px-4 pt-3 space-y-2" data-testid="bloco-mapa">
            <PosicaoConfirmada lat={fix.lat} lng={fix.lng} accuracy={fix.accuracy} stations={payload?.hospitals?.map((hospital) => ({ cnpj: hospital.cnes, name: hospital.name, latitude: hospital.latitude, longitude: hospital.longitude }))} radiusKm={payload?.radiusKm ?? 5} />
            <p className="text-xs text-neutral-600" data-testid="text-lista-sistema">
              {payload?.catalog ? hospitalCatalogPhrase(payload.catalog.hospitals, payload.catalog.inCity, payload.cityLabel ?? null) : "Conferindo a lista no sistema..."}
            </p>
          </div>
        )}
        <div className="p-4 flex-1 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm text-neutral-500 font-medium">
                {lendoMapa ? "Lendo o endereço dos hospitais no mapa..." : "Buscando hospitais no raio de 5 km..."}
              </p>
            </div>
          )}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800" data-testid="text-hospitais-error">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}
          {!loading && !errorMsg && !primary && (
            notLoaded ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2" data-testid="empty-not-loaded">
                <AlertCircle className="w-8 h-8 mx-auto text-amber-600" />
                <h2 className="text-base font-bold text-amber-900">Lista de hospitais ainda não carregada</h2>
                <p className="text-xs text-amber-700 leading-relaxed">{payload?.message}</p>
              </div>
            ) : (
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 text-center space-y-2" data-testid="empty-no-hospital">
                <MapPin className="w-8 h-8 mx-auto text-neutral-400" />
                <h2 className="text-base font-bold text-neutral-800">Nenhum hospital encontrado</h2>
                <p className="text-xs text-neutral-500 leading-relaxed">{payload?.message || noHospitalMessage(25)}</p>
              </div>
            )
          )}
          {!loading && !errorMsg && primary && (
            <>
              <HospitalCard hospital={primary} primary />
              {others.length > 0 && (
                <button type="button" onClick={() => setShowAll(true)} className="w-full text-xs font-bold text-emerald-700 py-1" data-testid="button-ver-outros">
                  Ver outros hospitais ({others.length})
                </button>
              )}
            </>
          )}
          {showAll && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
              <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[85vh] overflow-y-auto p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                  <h3 className="font-bold text-base text-neutral-900">Outros hospitais em {payload?.radiusKm ?? 5} km</h3>
                  <button type="button" onClick={() => setShowAll(false)} className="text-xs font-bold text-neutral-500 px-2 py-1" data-testid="button-fechar-outros">Fechar</button>
                </div>
                {others.map((hospital) => <HospitalCard key={hospital.cnes} hospital={hospital} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
