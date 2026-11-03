import MobileLayout from "@/components/mobile/layout";
import { PosicaoConfirmada } from "@/components/mobile/posicao-confirmada";
import { loadGoogleMapsScript } from "@/components/places-autocomplete";
import { authFetch } from "@/lib/queryClient";
import {
  acceptMapPoint,
  catalogPhrase,
  formatPinList,
  haversineKm,
  isAnpBaseNotLoaded,
  MAP_PIN_MAX_KM,
  noStationMessage,
  ONDE_ABASTECER_RADIUS_STEPS_KM,
  ONDE_ABASTECER_STATION_KEY,
  rankFromCoordinates,
  type AnpCatalog,
  type ClientPin,
  type EmptyReason,
  type StationToLocate,
} from "@shared/anp-onde-abastecer";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Loader2, MapPin, ShieldCheck } from "lucide-react";

interface StationCard {
  cnpj: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  driveMinutes: number;
  gasolinePrice: number | null;
  ethanolPrice: number | null;
  researchLabel: string | null;
  qualityPhrase: string;
  priced: boolean;
}

interface Payload {
  mode: "priced" | "nearest" | "empty";
  emptyReason?: EmptyReason | null;
  message: string | null;
  stations: StationCard[];
  pendingGeo: number;
  radiusKm?: number;
  cityLabel?: string | null;
  origin?: { lat: number; lng: number };
  catalog?: AnpCatalog;
  toLocate?: StationToLocate[];
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
              <div
                className={`h-1.5 rounded-full ${reached ? "bg-emerald-600" : "bg-neutral-200"} ${opening ? "animate-pulse" : ""}`}
              />
              <p className={`mt-1 text-center text-[10px] font-bold ${reached && step === activeKm ? "text-emerald-800" : "text-neutral-400"}`}>
                {step}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-0.5 text-center text-[10px] font-medium text-neutral-400">km</p>
    </div>
  );
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Não pesquisado";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
}

function rememberStation(name: string) {
  try {
    sessionStorage.setItem(ONDE_ABASTECER_STATION_KEY, name);
  } catch {
    /* sessão indisponível não impede a rota */
  }
}

function openWaze(lat: number, lng: number, name: string) {
  rememberStation(name);
  window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, "_blank", "noopener,noreferrer");
}

function openGoogleMaps(lat: number, lng: number, name: string) {
  rememberStation(name);
  window.open(
    `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${lat},${lng}&travelmode=driving`,
    "_blank",
    "noopener,noreferrer",
  );
}

function RouteButtons({ station }: { station: StationCard }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => openWaze(station.latitude, station.longitude, station.name)}
        className="h-12 rounded-2xl border-2 border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-800"
        data-testid={`button-waze-${station.cnpj}`}
      >
        Waze
      </button>
      <button
        type="button"
        onClick={() => openGoogleMaps(station.latitude, station.longitude, station.name)}
        className="h-12 rounded-2xl border-2 border-neutral-200 bg-white text-xs font-bold uppercase tracking-wider text-neutral-800"
        data-testid={`button-maps-${station.cnpj}`}
      >
        Google Maps
      </button>
    </div>
  );
}

export default function OndeAbastecerPage() {
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
    let timer = 0;
    const ask = (attempt: number) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return;
          try {
            const { latitude, longitude, accuracy } = position.coords;
            setFix({ lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null });
            const res = await authFetch(`/api/mobile/onde-abastecer?lat=${latitude}&lng=${longitude}`);
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.message || "Erro ao buscar postos próximos.");
            }
            if (cancelled) return;
            setPayload(data);
            const first = data.stations?.[0];
            if (first?.name) rememberStation(first.name);
            const todo = (data.toLocate ?? []) as StationToLocate[];
            if (!data.stations?.length && todo.length) {
              setLendoMapa(true);
              setLocating(true);
              const ready = await mapsGeocoderReady();
              if (cancelled) return;
              const pins: ClientPin[] = [];
              const located: Array<Omit<StationToLocate, "query" | "houseNumber" | "cep" | "city" | "state"> & { latitude: number; longitude: number }> = [];
              if (ready) {
                const found = await Promise.all(todo.map(async (item) => {
                  const point = await geocodeAddress(item.query, { lat: latitude, lng: longitude });
                  return point ? { item, point } : null;
                }));
                if (cancelled) return;
                for (const hit of found) {
                  if (!hit) continue;
                  pins.push({ cep: hit.item.cep, lat: hit.point.lat, lng: hit.point.lng });
                  located.push({
                    cnpj: hit.item.cnpj,
                    name: hit.item.name,
                    address: hit.item.address,
                    latitude: hit.point.lat,
                    longitude: hit.point.lng,
                    anpScore: hit.item.anpScore,
                    gasolinePrice: hit.item.gasolinePrice,
                    ethanolPrice: hit.item.ethanolPrice,
                    researchDate: hit.item.researchDate,
                  });
                }
              }
              const ranked = rankFromCoordinates(latitude, longitude, located);
              if (ranked) {
                setPayload({
                  ...data,
                  ...ranked,
                  emptyReason: null,
                  pendingGeo: 0,
                  toLocate: [],
                });
                if (ranked.stations[0]?.name) rememberStation(ranked.stations[0].name);
              } else if (!ready) {
                setPayload({
                  ...data,
                  emptyReason: "no_station",
                  message: "O mapa não carregou para ler o endereço do posto.",
                  toLocate: [],
                });
              } else {
                setPayload({
                  ...data,
                  emptyReason: "no_station",
                  message: noStationMessage(25),
                  toLocate: [],
                });
              }
              if (cancelled) return;
              setLendoMapa(false);
              setLocating(false);
              setLoading(false);
              if (pins.length) {
                try {
                  const savedRes = await authFetch(
                    `/api/mobile/onde-abastecer?lat=${latitude}&lng=${longitude}&pins=${encodeURIComponent(formatPinList(pins))}`,
                  );
                  const saved = await savedRes.json();
                  if (!cancelled && savedRes.ok && saved.stations?.length) {
                    setPayload(saved);
                    if (saved.stations[0]?.name) rememberStation(saved.stations[0].name);
                  }
                } catch {
                  /* a lista já lida no mapa continua nesta abertura */
                }
              }
              return;
            }
            if (data.emptyReason === "locating" && attempt < 2) {
              setLocating(true);
              timer = window.setTimeout(() => ask(attempt + 1), 900);
              return;
            }
            setLocating(false);
            setLoading(false);
          } catch (err: any) {
            if (cancelled) return;
            setErrorMsg(err.message || "Erro de conexão ao buscar postos.");
            setLoading(false);
          }
        },
        () => {
          if (cancelled) return;
          setErrorMsg("Não foi possível obter sua localização. Verifique as permissões do GPS.");
          setLoading(false);
        },
        { enableHighAccuracy: attempt === 0, timeout: 15000, maximumAge: 60000 },
      );
    };
    ask(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const primary = payload?.stations?.[0];
  const others = payload?.stations?.slice(1) || [];

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-[80vh] pb-8" data-testid="mobile-onde-abastecer-page">
        <div className="flex items-center gap-3 py-3 px-4 border-b border-neutral-100 bg-white">
          <Link href="/mobile" className="p-1 rounded-xl hover:bg-neutral-100" data-testid="button-back">
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </Link>
          <h1 className="text-base font-bold text-neutral-900">Onde abastecer</h1>
        </div>

        {!isAnpBaseNotLoaded(payload) && (
          <RadiusRuler
            activeKm={payload?.radiusKm ?? null}
            opening={loading || payload?.emptyReason === "locating"}
          />
        )}

        {fix && (
          <div className="px-4 pt-3 space-y-2" data-testid="bloco-mapa">
            <PosicaoConfirmada
              lat={fix.lat}
              lng={fix.lng}
              accuracy={fix.accuracy}
              stations={payload?.stations}
              radiusKm={payload?.radiusKm ?? 5}
            />
            <p className="text-xs text-neutral-600" data-testid="text-lista-sistema">
              {payload?.catalog
                ? catalogPhrase(payload.catalog, payload.cityLabel ?? null)
                : "Conferindo a lista no sistema..."}
            </p>
          </div>
        )}

        <div className="p-4 flex-1 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm text-neutral-500 font-medium">
                {lendoMapa
                  ? "Lendo o endereço dos postos no mapa..."
                  : locating
                    ? "Abrindo a régua de 5 até 25 km..."
                    : "Buscando postos no raio de 5 km..."}
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800" data-testid="text-onde-abastecer-error">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {!loading && !errorMsg && !primary && payload?.emptyReason === "locating" && (
            <div
              className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 text-center space-y-2"
              data-testid="empty-locating"
            >
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-emerald-600" />
              <h2 className="text-base font-bold text-neutral-800">Localizando os postos</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                {payload.message || "O endereço ainda está sendo buscado. Abra de novo em instantes."}
              </p>
            </div>
          )}

          {!loading && !errorMsg && !primary && payload?.emptyReason !== "locating" && (
            isAnpBaseNotLoaded(payload) ? (
              <div
                className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2"
                data-testid="empty-not-loaded"
              >
                <AlertCircle className="w-8 h-8 mx-auto text-amber-600" />
                <h2 className="text-base font-bold text-amber-900">Histórico da ANP ainda não carregado</h2>
                <p className="text-xs text-amber-700 leading-relaxed">
                  {payload?.message || "A sincronização roda a cada 30 minutos ou pode ser disparada por um administrador."}
                </p>
              </div>
            ) : (
              <div
                className="bg-neutral-50 border border-neutral-200 rounded-2xl p-6 text-center space-y-2"
                data-testid="empty-no-station"
              >
                <MapPin className="w-8 h-8 mx-auto text-neutral-400" />
                <h2 className="text-base font-bold text-neutral-800">Nenhum posto elegível encontrado</h2>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {payload?.message || "Não há postos com histórico limpo no raio de 5 km."}
                </p>
              </div>
            )
          )}

          {!loading && !errorMsg && primary && (
            <div className="bg-white border border-neutral-200 rounded-3xl p-5 shadow-sm space-y-4" data-testid="card-posto-principal">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">{primary.name}</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {primary.distanceKm.toFixed(1)} km · cerca de {primary.driveMinutes} min
                  {payload?.radiusKm && payload.radiusKm > 5 ? ` · régua em ${payload.radiusKm} km` : ""}
                </p>
                {primary.address && <p className="text-xs text-neutral-400 mt-1">{primary.address}</p>}
              </div>

              <div className="bg-neutral-50 rounded-2xl p-3.5 space-y-2 border border-neutral-100">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-600 font-medium">Gasolina</span>
                  <span className="font-bold text-neutral-900" data-testid="text-gasolina">{money(primary.gasolinePrice)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-600 font-medium">Álcool</span>
                  <span className="font-bold text-neutral-900" data-testid="text-alcool">{money(primary.ethanolPrice)}</span>
                </div>
                {primary.priced && primary.researchLabel && (
                  <p className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-200/60">
                    Pesquisa ANP da semana de {primary.researchLabel}
                  </p>
                )}
                {!primary.priced && (
                  <p className="text-[11px] font-bold text-amber-800 pt-1 border-t border-neutral-200/60" data-testid="text-sem-preco">
                    Preço desta semana ainda não pesquisado
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 bg-emerald-50/70 border border-emerald-100 rounded-xl p-3" data-testid="text-qualidade">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-emerald-900 leading-snug">{primary.qualityPhrase}</p>
              </div>

              <RouteButtons station={primary} />

              {others.length > 0 && (
                <div className="pt-2 border-t border-neutral-100 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 py-1"
                    data-testid="button-ver-outros"
                  >
                    Ver outros postos ({others.length})
                  </button>
                </div>
              )}
            </div>
          )}

          {showAll && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
                <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                  <h3 className="font-bold text-base text-neutral-900">Outros postos no raio de {payload?.radiusKm ?? 5} km</h3>
                  <button
                    type="button"
                    onClick={() => setShowAll(false)}
                    className="text-xs font-bold text-neutral-500 hover:text-neutral-900 px-2 py-1"
                    data-testid="button-fechar-outros"
                  >
                    Fechar
                  </button>
                </div>
                <div className="space-y-3">
                  {others.map((st) => (
                    <div key={st.cnpj} className="border border-neutral-200 rounded-2xl p-4 space-y-3 bg-neutral-50/50" data-testid={`card-posto-${st.cnpj}`}>
                      <div>
                        <h4 className="font-bold text-sm text-neutral-900">{st.name}</h4>
                        <p className="text-xs text-neutral-500">
                          {st.distanceKm.toFixed(1)} km · cerca de {st.driveMinutes} min
                        </p>
                      </div>
                      <div className="flex justify-between text-xs bg-white p-2.5 rounded-xl border border-neutral-100">
                        <span>Gasolina: <strong className="text-neutral-900">{money(st.gasolinePrice)}</strong></span>
                        <span>Álcool: <strong className="text-neutral-900">{money(st.ethanolPrice)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 bg-emerald-50/50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{st.qualityPhrase}</span>
                      </div>
                      <RouteButtons station={st} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!loading && (payload?.pendingGeo ?? 0) > 0 && payload?.mode !== "empty" && (
            <p className="text-[11px] text-neutral-400 text-center">Outros postos desta cidade ainda estão sendo localizados.</p>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
