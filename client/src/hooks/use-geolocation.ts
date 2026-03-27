import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/queryClient";

const INTERVAL_MS = 2 * 60 * 1000;

export function useGeolocation() {
  const { user } = useAuth();
  const [denied, setDenied] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initDone = useRef(false);

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    setPosition(pos);
    setLoading(false);
    setDenied(false);
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
      },
      () => {},
      { enableHighAccuracy: true }
    );
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => sendLocation(pos),
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }, INTERVAL_MS);
  }, [sendLocation]);

  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendLocation(pos);
        startWatch();
        startInterval();
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setDenied(true);
        }
      },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  }, [sendLocation, startWatch, startInterval]);

  useEffect(() => {
    if (!user || !navigator.geolocation || initDone.current) return;
    initDone.current = true;

    const autoFetch = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          sendLocation(pos);
          startWatch();
          startInterval();
        },
        () => { setLoading(false); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        if (result.state === "granted") {
          setLoading(true);
          autoFetch();
        } else if (result.state === "denied") {
          setDenied(true);
        }

        result.addEventListener("change", () => {
          if (result.state === "granted") {
            setDenied(false);
            setLoading(true);
            autoFetch();
          } else if (result.state === "denied") {
            setDenied(true);
            setLoading(false);
          }
        });
      }).catch(() => {
        // iOS Safari: Permissions API not supported for geolocation
        // Do NOT auto-request — wait for user gesture via requestPermission()
      });
    }
    // No Permissions API at all (older browsers) — wait for user gesture

    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, sendLocation, startWatch, startInterval]);

  return { denied, position, loading, requestPermission };
}
