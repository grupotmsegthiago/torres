import MobileLayout from "@/components/mobile/layout";
import { authFetch } from "@/lib/queryClient";
import { isAnpBaseNotLoaded, ONDE_ABASTECER_STATION_KEY, type EmptyReason } from "@shared/anp-onde-abastecer";
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
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.message || "Erro ao buscar postos próximos.");
          }
          setPayload(data);
          const first = data.stations?.[0];
          if (first?.name) rememberStation(first.name);
        } catch (err: any) {
          setErrorMsg(err.message || "Erro de conexão ao buscar postos.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setErrorMsg("Não foi possível obter sua localização. Verifique as permissões do GPS.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
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

        <div className="p-4 flex-1 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm text-neutral-500 font-medium">Buscando postos no raio de 5 km...</p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800" data-testid="text-onde-abastecer-error">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <p className="text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {!loading && !errorMsg && !primary && (
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
                  <h3 className="font-bold text-base text-neutral-900">Outros postos no raio de 5 km</h3>
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
