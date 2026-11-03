import { loadGoogleMapsScript } from "@/components/places-autocomplete";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PosicaoFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: number;
};

export type PosicaoPosto = {
  cnpj: string;
  name: string;
  latitude: number;
  longitude: number;
};

const SEM_POSTOS: PosicaoPosto[] = [];

/** Mesma frase da tela em que a posição foi confirmada. */
export function textoPosicaoConfirmada(lat: number, lng: number, accuracy: number | null): string {
  const base = `Posição confirmada · ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (accuracy == null || !Number.isFinite(accuracy)) return base;
  return `${base} · precisão ${Math.round(accuracy)} m`;
}

export function bboxPosicao(lat: number, lng: number, radiusKm: number): { west: number; south: number; east: number; north: number } {
  const reach = Math.max(radiusKm, 0.35);
  const dLat = reach / 111;
  const dLng = reach / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return { west: lng - dLng, south: lat - dLat, east: lng + dLng, north: lat + dLat };
}

function mapFrame(lat: number, lng: number, radiusKm: number): string {
  const box = bboxPosicao(lat, lng, radiusKm);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${box.west}%2C${box.south}%2C${box.east}%2C${box.north}&layer=mapnik&marker=${lat}%2C${lng}`;
}

/**
 * Mapa e frase usados no Onde abastecer.
 * Sem postos, mostra só o pino da pessoa, no zoom da rua.
 */
export function PosicaoConfirmada({
  lat,
  lng,
  accuracy = null,
  stations,
  radiusKm,
}: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  stations?: PosicaoPosto[];
  radiusKm?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [osm, setOsm] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const list = stations ?? SEM_POSTOS;
  const markerKey = list.map((station) => station.cnpj).join(",");
  const reach = radiusKm ?? 0.35;
  const showRadius = radiusKm != null && radiusKm > 0;

  useEffect(() => {
    if (osm) return;
    let cancelled = false;
    let drew = false;
    const timer = window.setTimeout(() => {
      if (!cancelled && !drew) setOsm(true);
    }, 5000);
    loadGoogleMapsScript(() => {
      if (cancelled || !box.current || !window.google?.maps?.Map) return;
      drew = true;
      window.clearTimeout(timer);
      const g = window.google.maps;
      const map = new g.Map(box.current, {
        center: { lat, lng },
        zoom: showRadius ? 14 : 16,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      const bounds = new g.LatLngBounds();
      bounds.extend({ lat, lng });
      new g.Marker({
        map,
        position: { lat, lng },
        title: "Sua posição",
        zIndex: 20,
        icon: g.SymbolPath ? {
          path: g.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        } : undefined,
      });
      for (const station of list) {
        if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) continue;
        bounds.extend({ lat: station.latitude, lng: station.longitude });
        new g.Marker({
          map,
          position: { lat: station.latitude, lng: station.longitude },
          title: station.name,
          icon: g.SymbolPath ? {
            path: g.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#059669",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          } : undefined,
        });
      }
      if (showRadius && g.Circle) {
        new g.Circle({
          map,
          center: { lat, lng },
          radius: reach * 1000,
          strokeColor: "#059669",
          strokeOpacity: 0.9,
          strokeWeight: 1,
          fillColor: "#059669",
          fillOpacity: 0.08,
        });
      }
      if (list.length > 0) map.fitBounds(bounds, 28);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lat, lng, markerKey, list, reach, osm, showRadius]);

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100" data-testid="map-posicao">
        {osm ? (
          <iframe title="Mapa da posição" src={mapFrame(lat, lng, reach)} className="h-56 w-full border-0" />
        ) : (
          <div ref={box} className="h-56 w-full" />
        )}
      </div>
      <p className="text-xs font-semibold text-neutral-800" data-testid="text-posicao-confirmada">
        {textoPosicaoConfirmada(lat, lng, accuracy)}
      </p>
    </div>
  );
}

const POSICAO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 60000,
};

/**
 * A mesma leitura do Onde abastecer: GPS fino, uma vez, com a precisão em metros.
 * Não liga um segundo acompanhamento contínuo.
 */
export function usePosicaoConfirmada() {
  const [fix, setFix] = useState<PosicaoFix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocalização não é suportada pelo seu navegador.");
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const { latitude, longitude, accuracy } = position.coords;
        setFix({
          lat: latitude,
          lng: longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          at: Date.now(),
        });
        setError(null);
      },
      () => {
        if (!cancelled) setError("Não foi possível obter sua localização. Verifique as permissões do GPS.");
      },
      POSICAO_OPTIONS,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { fix, error };
}

export function BlocoPosicao({ children, testId }: { children?: ReactNode; testId?: string }) {
  const { fix, error } = usePosicaoConfirmada();
  return (
    <div className="space-y-2" data-testid={testId}>
      {fix ? (
        <PosicaoConfirmada lat={fix.lat} lng={fix.lng} accuracy={fix.accuracy} />
      ) : (
        <p className="text-xs text-neutral-500" data-testid="text-posicao-aguardando">
          {error || "Conferindo a posição..."}
        </p>
      )}
      {children}
    </div>
  );
}
