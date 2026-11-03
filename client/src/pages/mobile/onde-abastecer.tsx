import MobileLayout from "@/components/mobile/layout";
import { authFetch } from "@/lib/queryClient";
import { ONDE_ABASTECER_STATION_KEY } from "@shared/anp-onde-abastecer";
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
  message: string | null;
  stations: StationCard[];
  pendingGeo: number;
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocalização não é suportada pelo seu navegador.");
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await authFetch(`/api/mobile/onde-abastecer?lat=${latitude}&lng=${longitude}`);
          const body = await res.json();
          if (!res.ok) {
            setErrorMsg(body.message || "Não foi possível carregar os postos.");
            return;
          }
          setPayload(body as Payload);
          const first = (body as Payload).stations?.[0];
          if (first?.name) rememberStation(first.name);
        } catch {
          setErrorMsg("Erro de conexão ao buscar postos.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setErrorMsg("Permissão de localização negada. Ative o GPS para ver os postos próximos.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  const main = payload?.stations[0];
  const others = payload?.stations.slice(1) ?? [];

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-onde-abastecer-page">
        <div className="flex items-center gap-3">
          <Link href="/mobile">
            <button type="button" className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center" data-testid="button-back">
              <ArrowLeft size={18} className="text-neutral-600" />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-black text-neutral-900 uppercase tracking-wider">Onde abastecer</h1>
            <p className="text-xs text-neutral-400">Posto perto e em conta</p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-16 text-neutral-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Buscando postos num raio de 5 km...</p>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800" data-testid="text-onde-abastecer-error">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
        )}

        {!loading && !errorMsg && payload?.mode === "empty" && (
          <div className="text-center py-12" data-testid="text-onde-abastecer-empty">
            <MapPin className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-neutral-800">{payload.message}</p>
          </div>
        )}

        {!loading && main && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4" data-testid="card-posto-principal">
            <div>
              <h2 className="text-lg font-black text-neutral-900">{main.name}</h2>
              <p className="text-xs text-neutral-500 mt-1">
                {main.distanceKm.toFixed(1)} km · cerca de {main.driveMinutes} min
              </p>
              {main.address && <p className="text-xs text-neutral-400 mt-1">{main.address}</p>}
            </div>

            <div className="bg-neutral-50 rounded-xl p-3 space-y-2 border border-neutral-100">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Gasolina</span>
                <span className="font-bold text-neutral-900" data-testid="text-gasolina">{money(main.gasolinePrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Álcool</span>
                <span className="font-bold text-neutral-900" data-testid="text-alcool">{money(main.ethanolPrice)}</span>
              </div>
              {main.priced && main.researchLabel && (
                <p className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-200">
                  Pesquisa ANP da semana de {main.researchLabel}
                </p>
              )}
              {!main.priced && (
                <p className="text-[11px] font-bold text-amber-800 pt-1 border-t border-neutral-200" data-testid="text-sem-preco">
                  Preço desta semana ainda não pesquisado
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl" data-testid="text-qualidade">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{main.qualityPhrase}</span>
            </div>

            <RouteButtons station={main} />

            {others.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAll((open) => !open)}
                className="w-full text-sm font-bold text-neutral-700 py-2 border-t border-neutral-100"
                data-testid="button-ver-outros"
              >
                {showAll ? "Ocultar outros postos" : `Ver outros postos (${others.length})`}
              </button>
            )}
          </div>
        )}

        {showAll && others.map((station) => (
          <div key={station.cnpj} className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-3" data-testid={`card-posto-${station.cnpj}`}>
            <div>
              <h3 className="text-sm font-black text-neutral-900">{station.name}</h3>
              <p className="text-xs text-neutral-500">{station.distanceKm.toFixed(1)} km · cerca de {station.driveMinutes} min</p>
            </div>
            <div className="flex justify-between text-xs bg-neutral-50 rounded-lg px-3 py-2">
              <span>Gasolina <strong>{money(station.gasolinePrice)}</strong></span>
              <span>Álcool <strong>{money(station.ethanolPrice)}</strong></span>
            </div>
            <p className="text-[11px] text-neutral-500">{station.qualityPhrase}</p>
            <RouteButtons station={station} />
          </div>
        ))}

        {!loading && (payload?.pendingGeo ?? 0) > 0 && payload?.mode !== "empty" && (
          <p className="text-[11px] text-neutral-400 text-center">Outros postos desta cidade ainda estão sendo localizados.</p>
        )}
      </div>
    </MobileLayout>
  );
}
