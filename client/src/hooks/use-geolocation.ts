import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/queryClient";

const INTERVAL_IDLE_MS = 10 * 60 * 1000;
const INTERVAL_MISSION_MS = 30 * 1000;

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

export function useGeolocation(missionActive = false) {
  const { user } = useAuth();
  const [denied, setDenied] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initDone = useRef(false);

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    setPosition(pos);
    setLoading(false);
    setDenied(false);
    setError(null);
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

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) return;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDenied(false);
        setPosition(pos);
        setLoading(false);
        setError(null);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = missionActive ? INTERVAL_MISSION_MS : INTERVAL_IDLE_MS;
    intervalRef.current = setInterval(() => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => sendLocation(pos),
        () => {},
        GPS_OPTIONS
      );
    }, ms);
  }, [sendLocation, missionActive]);

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
      (pos) => {
        sendLocation(pos);
        startWatch();
        startInterval();
      },
      handleGeoError,
      GPS_OPTIONS
    );
  }, [sendLocation, startWatch, startInterval, handleGeoError]);

  useEffect(() => {
    if (initDone.current && intervalRef.current) {
      startInterval();
    }
  }, [missionActive, startInterval]);

  useEffect(() => {
    if (!user || !navigator.geolocation || initDone.current) return;
    initDone.current = true;

    const autoFetch = () => {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          sendLocation(pos);
          startWatch();
          startInterval();
        },
        () => { setLoading(false); },
        GPS_OPTIONS
      );
    };

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
      }).catch(() => {
      });
    }

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, sendLocation, startWatch, startInterval]);

  return { denied, position, loading, error, requestPermission };
}
