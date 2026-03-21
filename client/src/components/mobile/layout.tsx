import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGeolocation } from "@/hooks/use-geolocation";
import { Home, Crosshair, ClipboardCheck, UserCircle, MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";

const navItems = [
  { path: "/mobile", label: "Início", icon: Home },
  { path: "/mobile/missao", label: "Missão", icon: Crosshair },
  { path: "/mobile/checklist", label: "Checklist", icon: ClipboardCheck },
  { path: "/mobile/meu-rh", label: "Meu RH", icon: FileText },
  { path: "/mobile/perfil", label: "Perfil", icon: UserCircle },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { denied, requestPermission } = useGeolocation();

  if (denied) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col" data-testid="mobile-layout">
        <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="Torres" className="w-7 h-7 object-contain rounded" />
            <span className="text-sm font-black text-neutral-900 uppercase tracking-wider">Torres</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center max-w-sm w-full" data-testid="location-required-block">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider mb-2">Localização Obrigatória</h2>
            <p className="text-sm text-neutral-500 mb-4">
              Para utilizar o sistema, é necessário compartilhar sua localização em tempo real. Isso é essencial para a segurança das operações.
            </p>
            <Button
              onClick={requestPermission}
              className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold uppercase tracking-wider"
              data-testid="btn-allow-location"
            >
              <MapPin className="w-4 h-4 mr-2" />
              Permitir Localização
            </Button>
            <p className="text-[11px] text-neutral-400 mt-3">
              Caso o botão não funcione, ative a localização nas configurações do navegador ou do aparelho.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col select-none" style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as any} data-testid="mobile-layout">
      <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src={logoSrc} alt="Torres" className="w-7 h-7 object-contain rounded" />
          <span className="text-sm font-black text-neutral-900 uppercase tracking-wider">Torres</span>
        </div>
        {user && (
          <span className="text-xs text-neutral-500 font-medium truncate max-w-[140px]" data-testid="text-mobile-user">
            {user.name?.split(" ")[0]}
          </span>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-50 safe-area-bottom" data-testid="mobile-bottom-nav">
        <div className="flex items-center justify-around py-1">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== "/mobile" && location.startsWith(item.path));
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <button
                  className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[64px] rounded-lg transition-colors ${isActive ? "text-neutral-900" : "text-neutral-400"}`}
                  data-testid={`nav-mobile-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
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
