import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useAuditLog, useScreenshotDetection } from "@/hooks/use-audit";
import { titleCase } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Home, Crosshair, ClipboardCheck, UserCircle, MapPin, FileText, Loader2, Shield, CloudOff, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeQueue } from "@/lib/offlineQueue";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";
import ChatWidget from "@/components/chat-widget";

const navItems = [
  { path: "/mobile", label: "Início", icon: Home },
  { path: "/mobile/missao", label: "Missão", icon: Crosshair },
  { path: "/mobile/chat", label: "Chat", icon: MessageCircle },
  { path: "/mobile/meu-rh", label: "Meu RH", icon: FileText },
  { path: "/mobile/perfil", label: "Perfil", icon: UserCircle },
];

function Watermark({ name, matricula }: { name: string; matricula: string }) {
  const [now, setNow] = useState(() => {
    const d = new Date();
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setNow(d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const label = `${name} \u2022 ${matricula} \u2022 ${now}`;

  const positions = useMemo(() => {
    const items: { x: number; y: number }[] = [];
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 6; col++) {
        items.push({
          x: col * 280 + (row % 2 === 0 ? 0 : 140) - 100,
          y: row * 120 - 50,
        });
      }
    }
    return items;
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden" aria-hidden="true">
      <svg width="100%" height="100%" className="absolute inset-0" style={{ width: "200vw", height: "200vh" }}>
        {positions.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={p.y}
            transform={`rotate(-30, ${p.x}, ${p.y})`}
            fill="rgba(180,180,180,0.13)"
            fontSize="10"
            fontFamily="Inter, sans-serif"
            fontWeight="500"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function PendingBadge() {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    return subscribeQueue((info) => {
      setCount(info.pendingCount);
      setSyncing(info.status === "syncing");
    });
  }, []);
  if (count === 0) return null;
  return (
    <span
      className={`relative flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${syncing ? "bg-amber-500" : "bg-red-500"}`}
      data-testid="badge-pending-sync"
    >
      {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudOff className="w-3 h-3" />}
      {count}
    </span>
  );
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isMissionActive = location.startsWith("/mobile/missao");
  const { denied, position, loading, error, requestPermission } = useGeolocation(isMissionActive);
  useAuditLog(location);
  useScreenshotDetection(location);

  const { data: chatUnread } = useQuery<{ total: number }>({
    queryKey: ["/api/chat/unread-count"],
    refetchInterval: 30000,
  });
  const unreadCount = chatUnread?.total || 0;

  if (!position) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col" data-testid="mobile-layout">
        <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="Torres" className="w-7 h-7 object-contain rounded" />
            <span className="text-sm font-black text-neutral-900 uppercase tracking-wider">Torres</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          {loading ? (
            <div className="text-center" data-testid="location-loading">
              <Loader2 className="w-10 h-10 text-neutral-400 animate-spin mx-auto mb-4" />
              <p className="text-sm font-bold text-neutral-700">Capturando localização...</p>
              <p className="text-xs text-neutral-400 mt-1">GPS de alta precisão ativo. Aguarde...</p>
            </div>
          ) : denied ? (
            <div className="bg-white rounded-2xl border border-red-200 p-6 text-center max-w-sm w-full" data-testid="location-denied-block">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-2">Localização Bloqueada</h2>
              <p className="text-sm text-neutral-500 mb-3">
                Você precisa permitir o acesso ao GPS para continuar. Ative a localização:
              </p>
              <ol className="text-[12px] text-neutral-600 text-left ml-4 mb-4 list-decimal space-y-1">
                <li>Abra os <strong>Ajustes</strong> do celular</li>
                <li>Vá em <strong>Privacidade → Serviços de Localização</strong></li>
                <li>Encontre o <strong>navegador</strong> (Safari/Chrome)</li>
                <li>Selecione <strong>"Ao Usar o App"</strong></li>
              </ol>
              {error && (
                <p className="text-[11px] text-red-600 bg-red-50 rounded-lg p-2 mb-3" data-testid="text-geo-error">{error}</p>
              )}
              <Button
                onClick={requestPermission}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider"
                data-testid="btn-retry-location"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center max-w-sm w-full" data-testid="location-required-block">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-2">Localização em Tempo Real</h2>
              <p className="text-sm text-neutral-500 mb-2">
                Para acessar o sistema Torres, é obrigatório habilitar a localização em tempo real.
              </p>
              <p className="text-xs text-neutral-400 mb-5">
                Sua posição será monitorada durante o uso para garantir a segurança das operações.
              </p>
              {error && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 mb-3" data-testid="text-geo-error">{error}</p>
              )}
              <Button
                onClick={requestPermission}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-sm py-3"
                data-testid="btn-allow-location"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Habilitar Localização
              </Button>
              <p className="text-[11px] text-neutral-400 mt-3">
                Ao tocar, o celular solicitará permissão de acesso à sua localização. Selecione <strong>"Permitir"</strong>.
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col select-none" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as any} data-testid="mobile-layout">
      {user && <Watermark name={user.name || user.username || "—"} matricula={user.matricula || "---"} />}
      <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src={logoSrc} alt="Torres" className="w-7 h-7 object-contain rounded" />
          <span className="text-sm font-black text-neutral-900 uppercase tracking-wider">Torres</span>
        </div>
        <div className="flex items-center gap-2">
          <PendingBadge />
          {user && (
            <span className="text-xs text-neutral-500 font-medium truncate max-w-[140px]" data-testid="text-mobile-user">
              {titleCase(user.name?.split(" ")[0])}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <ChatWidget />
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-50 safe-area-bottom" data-testid="mobile-bottom-nav">
        <div className="flex items-center justify-around py-1">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== "/mobile" && location.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={`relative flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] rounded-lg transition-colors ${isActive ? "text-neutral-900" : "text-neutral-400"}`}
                  data-testid={`nav-mobile-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
                    {item.label === "Chat" && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5" data-testid="badge-mobile-chat-unread">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider ${isActive ? "font-bold" : "font-medium"}`}>
                    {item.label}
                  </span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
