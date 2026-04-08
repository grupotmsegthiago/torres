import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import { authFetch } from "@/lib/queryClient";

function sendAudit(action: string, page: string, details: string, withGps = false) {
  const send = (lat?: number, lng?: number) => {
    authFetch("/api/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, page, details, latitude: lat || null, longitude: lng || null }),
    }).catch(() => {});
  };

  if (withGps && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => send(pos.coords.latitude, pos.coords.longitude),
      () => send(),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    send();
  }
}

export function useAuditLog(page: string) {
  const { user } = useAuth();
  const logged = useRef(false);

  useEffect(() => {
    if (!user || logged.current) return;
    logged.current = true;
    sendAudit("page_view", page, `Visualizou: ${page}`);
  }, [user, page]);
}

export function useScreenshotDetection(page: string) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === "PrintScreen";
      const isMacScreenshot =
        e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5");
      const isCtrlPrintScreen = e.ctrlKey && e.key === "PrintScreen";
      const isWinSnip = (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "s" || e.key === "S");

      if (isPrintScreen || isMacScreenshot || isCtrlPrintScreen || isWinSnip) {
        sendAudit("screenshot_attempt", page, `Tentativa de captura de tela detectada (tecla: ${e.key})`, true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendAudit("tab_hidden", page, "Aba ficou oculta (possível troca de app/print)", true);
      } else if (document.visibilityState === "visible") {
        sendAudit("tab_visible", page, "Aba voltou a ficar visível");
      }
    };

    const handleBlur = () => {
      sendAudit("window_blur", page, "Janela perdeu foco (possível captura de tela)", true);
    };

    const handleContextMenu = (e: MouseEvent) => {
      sendAudit("context_menu", page, "Menu de contexto aberto (botão direito)");
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [user, page]);
}

export function logAuditAction(action: string, page: string, details: string) {
  sendAudit(action, page, details);
}
