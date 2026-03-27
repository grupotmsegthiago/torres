import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authFetch } from "@/lib/queryClient";

const INTERVAL_MS = 2 * 60 * 1000;

export function useGeolocation() {
  const { user } = useAuth();
  const [denied, setDenied] = useState(false);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompted, setPrompted] = useState(false);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPrompted(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendLocation(pos);
        startWatch();
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setDenied(true);
        }
      },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  }, [sendLocation, startWatch]);

  useEffect(() => {
    if (!user || !navigator.geolocation) {
      setLoading(false);
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" as PermissionName }).then((result) => {
        if (result.state === "granted") {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              sendLocation(pos);
              startWatch();
            },
            () => { setLoading(false); },
            { enableHighAccuracy: true, timeout: 15000 }
          );
        } else if (result.state === "denied") {
          setDenied(true);
          setLoading(false);
        } else {
          setLoading(false);
        }

        result.addEventListener("change", () => {
          if (result.state === "granted") {
            setDenied(false);
            navigator.geolocation.getCurrentPosition(
              (pos) => sendLocation(pos),
              () => {},
              { enableHighAccuracy: true, timeout: 15000 }
            );
            startWatch();
          } else if (result.state === "denied") {
            setDenied(true);
          }
        });
      }).catch(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => { sendLocation(pos); startWatch(); },
          (err) => {
            setLoading(false);
            if (err.code === err.PERMISSION_DENIED) setDenied(true);
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
      });
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => { sendLocation(pos); startWatch(); },
        (err) => {
          setLoading(false);
          if (err.code === err.PERMISSION_DENIED) setDenied(true);
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    }

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
  }, [user, sendLocation, startWatch]);

  return { denied, position, loading, prompted, requestPermission };
}
