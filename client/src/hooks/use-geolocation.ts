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
//
// Correção (2026-06): no PRIMEIRO acesso (permissão "prompt" ou navegador sem
// Permissions API, ex.: iOS Safari) NÃO auto-disparamos a captura — isso ligava
// o spinner "Capturando localização..." sem gesto do usuário e, combinado com o
// re-disparo do visibilitychange + timeout de alta precisão indoor, fazia a tela
// ficar "piscando buscando GPS" e travada. Agora só auto-capturamos quando a
// permissão JÁ está concedida (grantedRef); no estado "prompt" mostramos a tela
// "Habilitar Localização" que obriga o toque do usuário (o gesto força o prompt
// nativo). O re-disparo no resume (visibilitychange) também só ocorre depois que
// a permissão foi confirmada — inclusive em navegadores sem Permissions API.

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0,
};

// Fallback quando o GPS de alta precisão expira/falha (ex.: indoor): posição por
// rede (Wi-Fi/torres), mais rápida e funciona em ambiente fechado. Evita o
// usuário ficar preso na tela "buscando GPS".
const GPS_FALLBACK_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 60000,
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
  // bootstrapping = ainda resolvendo o status inicial de permissão. Mantém a tela
  // de loading (em vez de mostrar "Habilitar Localização") pra quem já concedeu
  // não ver um flash do botão antes do auto-capture.
  const [bootstrapping, setBootstrapping] = useState(true);
  const initDone = useRef(false);
  const lastSentAt = useRef<number>(0);
  // Só libera re-captura no resume depois que a permissão foi confirmada.
  const grantedRef = useRef(false);

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    grantedRef.current = true;
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

  const handleGeoError = useCallback((err: GeolocationPositionError) => {
    setLoading(false);
    if (err.code === err.PERMISSION_DENIED) {
      grantedRef.current = false;
      setDenied(true);
      setError("Você precisa permitir o acesso ao GPS para continuar.");
    } else if (err.code === err.TIMEOUT) {
      setError("Não foi possível obter sua localização. Tente novamente em local aberto.");
    } else {
      setError("Erro ao capturar localização. Verifique se o GPS está ativado.");
    }
  }, []);

  // Captura a posição uma vez. Se a alta precisão falhar (timeout/indisponível —
  // mas NÃO por permissão negada), tenta de novo por rede (baixa precisão) pra
  // não deixar o usuário travado na tela "buscando GPS".
  const captureOnce = useCallback(() => {
    if (!navigator.geolocation) return;
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => sendLocation(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          handleGeoError(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => sendLocation(pos),
          handleGeoError,
          GPS_FALLBACK_OPTIONS,
        );
      },
      GPS_OPTIONS,
    );
  }, [sendLocation, handleGeoError]);

  // Disparado por gesto do usuário (botão "Habilitar Localização" / "Tentar
  // Novamente"): força o prompt nativo de permissão.
  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) {
      setDenied(true);
      setLoading(false);
      setError("Geolocalização não disponível neste dispositivo.");
      return;
    }
    captureOnce();
  }, [captureOnce]);

  useEffect(() => {
    if (!user || !navigator.geolocation) {
      setBootstrapping(false);
      return;
    }
    if (initDone.current) return;
    initDone.current = true;

    let isMounted = true;
    let permObj: PermissionStatus | null = null;
    let onChange: (() => void) | null = null;

    // Re-captura ao voltar do background SÓ se a permissão já foi confirmada —
    // senão o visibilitychange ligava o spinner repetidamente (efeito "piscando"),
    // inclusive em navegadores sem Permissions API.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (grantedRef.current) captureOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const finishBootstrap = () => {
      if (isMounted) setBootstrapping(false);
    };

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (!isMounted) return;
          permObj = result;
          if (result.state === "granted") {
            grantedRef.current = true;
            captureOnce();
          } else if (result.state === "denied") {
            setDenied(true);
          }
          // "prompt": NÃO auto-dispara. A tela "Habilitar Localização" obriga o
          // usuário a tocar, e o gesto força o prompt nativo de permissão.
          finishBootstrap();
          onChange = () => {
            if (result.state === "granted") {
              grantedRef.current = true;
              setDenied(false);
              captureOnce();
            } else if (result.state === "denied") {
              grantedRef.current = false;
              setDenied(true);
              setLoading(false);
            }
          };
          result.addEventListener("change", onChange);
        })
        .catch(() => {
          finishBootstrap();
        });
    } else {
      // Sem Permissions API (ex.: iOS Safari antigo): NÃO auto-dispara — mostra a
      // tela "Habilitar Localização" e espera o toque do usuário pra forçar o prompt.
      finishBootstrap();
    }

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (permObj && onChange) permObj.removeEventListener("change", onChange);
    };
  }, [user, captureOnce]);

  return { denied, position, loading, bootstrapping, error, requestPermission };
}
