import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";

export function useAuditLog(page: string) {
  const { user } = useAuth();
  const logged = useRef(false);

  useEffect(() => {
    if (!user || logged.current) return;
    logged.current = true;

    fetch("/api/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "page_view",
        page,
        details: `Visualizou: ${page}`,
      }),
    }).catch(() => {});
  }, [user, page]);
}
