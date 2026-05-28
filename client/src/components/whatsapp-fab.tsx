import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SiWhatsapp } from "react-icons/si";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface ChatListItem {
  id: string;
  name: string;
  unread: number;
}

let _audioCtx: AudioContext | null = null;
function ding() {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.35);
  } catch {}
}

export default function WhatsAppFab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const qc = useQueryClient();
  const onWhatsAppPage = location.startsWith("/admin/whatsapp");
  const isAdmin = user?.role === "admin" || user?.role === "diretoria";
  const lastNotifyRef = useRef<number>(0);

  const { data: chatsResp } = useQuery<{ ok: boolean; chats?: ChatListItem[] } | ChatListItem[]>({
    queryKey: ["/api/whatsapp/chats"],
    refetchInterval: 30000,
    enabled: !!isAdmin,
  });

  const chats: ChatListItem[] = Array.isArray(chatsResp)
    ? chatsResp
    : Array.isArray((chatsResp as any)?.chats)
      ? ((chatsResp as any).chats as ChatListItem[])
      : [];

  // Conta CONVERSAS com não-lidas (não a soma total de mensagens)
  const totalUnread = chats.filter((c) => (Number(c?.unread) || 0) > 0).length;

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel(`whatsapp-fab-rt-${user?.id || "anon"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg?.from_me) return;
        qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/whatsapp/chats" });
        const visible = document.visibilityState === "visible" && onWhatsAppPage;
        if (visible) return;
        const now = Date.now();
        if (now - lastNotifyRef.current < 1500) return;
        lastNotifyRef.current = now;
        ding();
        const preview = msg?.body ? String(msg.body).slice(0, 120) : "(mídia)";
        toast({ title: "WhatsApp — nova mensagem", description: preview, duration: 5000 });
        if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
          try {
            new Notification("WhatsApp — nova mensagem", {
              body: preview,
              icon: "/icon-192x192.png",
              tag: `wa-${msg?.chat_id}`,
            });
          } catch {}
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_chats" }, () => {
        // Conversa mudou (ex.: marcada como lida em outro dispositivo) → atualiza contagem na hora
        qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/whatsapp/chats" });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, onWhatsAppPage, qc, toast]);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin/whatsapp"
      className="fixed bottom-6 right-24 z-40 group"
      title="Abrir WhatsApp"
      aria-label="Abrir WhatsApp"
      data-testid="link-whatsapp-fab"
    >
      <span className="flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1ebe57] shadow-lg shadow-emerald-900/30 transition-transform group-hover:scale-105">
        <SiWhatsapp className="w-7 h-7 text-white" />
      </span>
      {totalUnread > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white shadow"
          data-testid="badge-whatsapp-unread"
        >
          {totalUnread > 99 ? "99+" : totalUnread}
        </span>
      )}
    </Link>
  );
}
