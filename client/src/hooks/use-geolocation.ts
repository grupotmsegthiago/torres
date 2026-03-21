import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/queryClient";

const INTERVAL_MS = 2 * 60 * 1000;

export function useGeolocation() {
  const { user } = useAuth();
  const [denied, setDenied] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    setPosition(pos);
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

  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDenied(false);
        sendLocation(pos);
      },
      () => setDenied(true),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [sendLocation]);

  useEffect(() => {
    if (!user || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDenied(false);
        sendLocation(pos);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setDenied(true);
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDenied(false);
        setPosition(pos);
      },
      () => {},
      { enableHighAccuracy: true }
    );

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendLocation(pos),
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }, INTERVAL_MS);

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, sendLocation]);

  return { denied, position, requestPermission };
}
