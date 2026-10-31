import { useEffect, useRef, useState } from "react";
import { loadGoogleMapsScript } from "@/components/places-autocomplete";
import { pontosDaRota, type PontoRota } from "@shared/mapa-rota-os";

const ESTILO_NOITE = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aa4bf" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1e3a5f" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#16243c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#155e75" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#061018" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0d1726" }] },
];

type EnderecoRota = {
  osId?: number | null;
  origem?: string | null;
  destino?: string | null;
  origemLat?: unknown;
  origemLng?: unknown;
  destinoLat?: unknown;
  destinoLng?: unknown;
  posLat?: unknown;
  posLng?: unknown;
};

function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) return resolve(null);
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { address: endereco, componentRestrictions: { country: "BR" } },
      (results: Array<{ geometry?: { location?: { lat: () => number; lng: () => number } } }> | null, status: string) => {
        const loc = status === "OK" ? results?.[0]?.geometry?.location : null;
        if (!loc) return resolve(null);
        resolve({ lat: loc.lat(), lng: loc.lng() });
      },
    );
  });
}

export function MapaRotaOs({ detalhe }: { detalhe: EnderecoRota }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<any>(null);
  const camadas = useRef<any[]>([]);
  const [pronto, setPronto] = useState(false);
  const [semMapa, setSemMapa] = useState(false);
  const chave = [
    detalhe.osId ?? "",
    detalhe.origemLat ?? "",
    detalhe.origemLng ?? "",
    detalhe.destinoLat ?? "",
    detalhe.destinoLng ?? "",
    detalhe.posLat ?? "",
    detalhe.posLng ?? "",
    detalhe.origem ?? "",
    detalhe.destino ?? "",
  ].join("|");

  useEffect(() => {
    let vivo = true;
    if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
      setSemMapa(true);
      return;
    }
    loadGoogleMapsScript(() => {
      if (vivo) setPronto(true);
    });
    const espera = window.setTimeout(() => {
      if (vivo && !window.google?.maps?.Map) setSemMapa(true);
    }, 8000);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, []);

  useEffect(() => {
    if (!pronto || !caixa.current || !window.google?.maps?.Map) return;
    let vivo = true;
    const overlays: any[] = [];
    const guardar = (item: any) => {
      overlays.push(item);
      camadas.current.push(item);
    };
    const limpar = () => {
      camadas.current.forEach((item) => {
        try { item.setMap?.(null); } catch { /* overlay já solto */ }
      });
      camadas.current = [];
    };

    const desenhar = (pontos: PontoRota[]) => {
      if (!vivo || !caixa.current || pontos.length === 0) return;
      setSemMapa(false);
      if (!mapa.current) {
        mapa.current = new window.google.maps.Map(caixa.current, {
          center: pontos[0],
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: ESTILO_NOITE,
          backgroundColor: "#071019",
        });
      }
      limpar();
      const bounds = new window.google.maps.LatLngBounds();
      for (const ponto of pontos) {
        bounds.extend(ponto);
        const viatura = ponto.papel === "viatura";
        guardar(new window.google.maps.Marker({
          position: ponto,
          map: mapa.current,
          title: ponto.papel === "origem" ? "Origem" : ponto.papel === "destino" ? "Destino" : "Viatura",
          label: viatura ? undefined : ponto.papel === "origem" ? "A" : "B",
          icon: viatura ? {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#22c55e",
            fillOpacity: 1,
            strokeColor: "#ecfeff",
            strokeWeight: 2,
          } : undefined,
        }));
      }
      const origem = pontos.find((p) => p.papel === "origem");
      const destino = pontos.find((p) => p.papel === "destino");
      const enquadrar = () => {
        if (!vivo || !mapa.current) return;
        window.google.maps.event.trigger(mapa.current, "resize");
        if (pontos.length === 1) {
          mapa.current.setCenter(pontos[0]);
          mapa.current.setZoom(14);
        } else {
          mapa.current.fitBounds(bounds, 36);
        }
      };
      if (origem && destino && window.google.maps.DirectionsService) {
        const servico = new window.google.maps.DirectionsService();
        servico.route({
          origin: origem,
          destination: destino,
          travelMode: window.google.maps.TravelMode.DRIVING,
          region: "br",
        }, (resultado: { routes?: unknown[] } | null, status: string) => {
          if (!vivo || !mapa.current) return;
          if (status === "OK" && resultado) {
            const linha = new window.google.maps.DirectionsRenderer({
              map: mapa.current,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: { strokeColor: "#22d3ee", strokeOpacity: 0.95, strokeWeight: 4 },
            });
            linha.setDirections(resultado);
            guardar(linha);
          } else {
            guardar(new window.google.maps.Polyline({
              path: [origem, destino],
              strokeColor: "#22d3ee",
              strokeOpacity: 0.9,
              strokeWeight: 3,
              map: mapa.current,
            }));
          }
          enquadrar();
        });
      } else {
        enquadrar();
      }
      window.setTimeout(enquadrar, 280);
      window.setTimeout(enquadrar, 700);
    };

    const montar = async () => {
      const pontos = pontosDaRota(detalhe);
      if (pontos.some((p) => p.papel === "origem") && pontos.some((p) => p.papel === "destino")) {
        desenhar(pontos);
        return;
      }
      const extras = [...pontos];
      if (!extras.some((p) => p.papel === "origem") && detalhe.origem) {
        const geo = await geocodificar(detalhe.origem);
        if (geo) extras.push({ ...geo, papel: "origem" });
      }
      if (!extras.some((p) => p.papel === "destino") && detalhe.destino) {
        const geo = await geocodificar(detalhe.destino);
        if (geo) extras.push({ ...geo, papel: "destino" });
      }
      if (!vivo) return;
      if (extras.length === 0) setSemMapa(true);
      else desenhar(extras);
    };
    void montar();
    return () => {
      vivo = false;
      limpar();
    };
  }, [pronto, chave]);

  const legenda = [detalhe.origem, detalhe.destino].filter(Boolean).join(" → ");

  return (
    <div className="relative h-56 overflow-hidden rounded-xl border border-cyan-500/25 bg-[#071019]" data-testid="mapa-rota-os">
      <p className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-[#071019]/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100">
        Rota da origem ao destino
      </p>
      <div ref={caixa} className="absolute inset-0" />
      {semMapa ? (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-[#071019] px-4 text-center text-xs text-slate-400">
          {legenda || "Rota sem coordenadas de origem e destino."}
        </div>
      ) : null}
    </div>
  );
}
