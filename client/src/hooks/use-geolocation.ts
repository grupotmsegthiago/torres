import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/queryClient";

// Estratégia GPS (2026-05): NÃO ficamos puxando posição continuamente.
// O servidor recebe a localização do agente apenas:
//   1) Quando ele abre o sistema (mount inicial + permissão concedida)
//   2) Quando a aba/PWA volta do background pra primeiro plano (visibilitychange)
// Antes, este hook rodava watchPosition + setInterval (10min/30s) e gerava
// dezenas de POSTs /api/agent/location por minuto por agente — causa principal
// da saturação do Supabase.

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

// Cache simples por aba pra não disparar dois POSTs em <30s (ex.: visibilitychange
// que dispara várias vezes em sequência em alguns navegadores).
const MIN_RESEND_MS = 30 * 1000;

export function useGeolocation(_missionActive = false) {
  const { user } = useAuth();
  const [denied, setDenied] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initDone = useRef(false);
  const lastSentAt = useRef<number>(0);

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    setPosition(pos);
    setLoading(false);
    setDenied(false);
    setError(null);
    const now = Date.now();
    if (now - lastSentAt.current < MIN_RESEND_MS) return;
    lastSentAt.current = now;
    try {
      await authFetch("/api/agent/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
        }),
      });
    } catch {}
  }, []);

  const captureOnce = useCallback(() => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos),
      () => setLoading(false),
      GPS_OPTIONS
    );
  }, [sendLocation]);

  const handleGeoError = useCallback((err: GeolocationPositionError) => {
    setLoading(false);
    if (err.code === err.PERMISSION_DENIED) {
      setDenied(true);
      setError("Você precisa permitir o acesso ao GPS para continuar.");
    } else if (err.code === err.TIMEOUT) {
      setError("Não foi possível obter sua localização. Tente novamente em local aberto.");
    } else {
      setError("Erro ao capturar localização. Verifique se o GPS está ativado.");
    }
  }, []);

  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      setError("Geolocalização não disponível neste dispositivo.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos),
      handleGeoError,
      GPS_OPTIONS
    );
  }, [sendLocation, handleGeoError]);

  useEffect(() => {
    if (!user || !navigator.geolocation || initDone.current) return;
    initDone.current = true;

    const autoFetch = () => captureOnce();

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        if (result.state === "granted") {
          autoFetch();
        } else if (result.state === "denied") {
          setDenied(true);
        }
        result.addEventListener("change", () => {
          if (result.state === "granted") {
            setDenied(false);
            autoFetch();
          } else if (result.state === "denied") {
            setDenied(true);
            setLoading(false);
          }
        });
      }).catch(() => {});
    } else {
      autoFetch();
    }

    // Re-envia quando o app volta do background (agente reabriu o PWA).
    const onVisibility = () => {
      if (document.visibilityState === "visible") captureOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, captureOnce]);

  return { denied, position, loading, error, requestPermission };
}
