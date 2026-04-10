import { useState, memo, useCallback, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  LayoutDashboard, Users, Car, FileText, Wrench,
  Fuel, Clock, MapPin, Menu, X, LogOut, UserCircle, UserCog,
  ChevronDown, ChevronRight, Building2, Target, Radio, Crown, BookOpen, Smartphone, Crosshair, Shield, Wallet, Calculator, BarChart3, Play, Receipt, MessageCircle,
  Briefcase, Radar, UserCheck, Landmark, Activity, Wifi, WifiOff, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatWidget from "@/components/chat-widget";

type MenuItem = {
  path?: string;
  label: string;
  icon: any;
  iconColor?: string;
  adminOnly?: boolean;
  children?: MenuItem[];
  prefetchKey?: string;
};

type MenuSection = {
  title: string;
  icon: any;
  iconColor: string;
  items: MenuItem[];
  adminOnly?: boolean;
};

const PREFETCH_MAP: Record<string, string[]> = {
  "/admin/dashboard": ["/api/service-orders", "/api/clients", "/api/employees", "/api/vehicles"],
  "/admin/clients": ["/api/clients"],
  "/admin/service-orders": ["/api/service-orders", "/api/clients", "/api/employees", "/api/vehicles"],
  "/admin/employees": ["/api/employees"],
  "/admin/vehicles": ["/api/vehicles"],
  "/admin/financeiro": ["/api/financial/transactions", "/api/financial/categories", "/api/financial/accounts"],
  "/admin/operational-grid": ["/api/operational-grid", "/api/vehicle-tracking"],
  "/admin/fueling": ["/api/fueling", "/api/vehicles"],
  "/admin/boletim-medicao": ["/api/boletim-medicao/os-concluidas"],
  "/admin/balanco-gerencial": ["/api/financial/dashboard"],
  "/admin/timesheets": ["/api/timesheets", "/api/employees"],
  "/admin/maintenance": ["/api/maintenance", "/api/vehicles"],
  "/admin/faturas": ["/api/escort-billings"],
};

const menuSections: MenuSection[] = [
  {
    title: "COMERCIAL",
    icon: Briefcase,
    iconColor: "text-blue-400",
    items: [
      { path: "/admin/clients", label: "Clientes", icon: Building2 },
      { path: "/admin/service-orders", label: "Ordens de Serviço", icon: FileText },
      { path: "/admin/boletim-medicao", label: "Boletim de Medição", icon: Calculator },
      { path: "/admin/relatorio-faturamento", label: "Relatório Faturamento", icon: BarChart3 },
    ],
  },
  {
    title: "OPERAÇÕES",
    icon: Radar,
    iconColor: "text-amber-400",
    items: [
      {
        label: "Grid Operacional",
        icon: Radio,
        iconColor: "text-amber-500",
        children: [
          { path: "/admin/operational-grid", label: "Painel Operacional", icon: Radio, iconColor: "text-amber-500" },
          { path: "/admin/relatorio-os", label: "Relatório de OS", icon: FileText },
          { path: "/admin/armamento", label: "Armamento", icon: Crosshair },
        ],
      },
      {
        label: "Frota",
        icon: Car,
        iconColor: "text-sky-500",
        children: [
          { path: "/admin/vehicles", label: "Veículos", icon: Car },
          { path: "/admin/fueling", label: "Abastecimento", icon: Fuel },
          { path: "/admin/maintenance", label: "Manutenção", icon: Wrench },
          { path: "/admin/tracker", label: "Rastreador", icon: MapPin },
        ],
      },
    ],
  },
  {
    title: "GESTÃO DE PESSOAS",
    icon: UserCheck,
    iconColor: "text-emerald-400",
    items: [
      {
        label: "Funcionários",
        icon: Users,
        children: [
          { path: "/admin/employees", label: "Cadastro", icon: Users },
          { path: "/admin/timesheets", label: "Folha de Ponto", icon: Clock },
          { path: "/admin/holerites", label: "Holerites", icon: Receipt, adminOnly: true },
          { path: "/admin/ponto-operacional", label: "Ponto Operacional", icon: Play },
          { path: "/admin/jornada-diretoria", label: "Jornada", icon: Clock, adminOnly: true },
        ],
      },
    ],
  },
  {
    title: "CONTROLADORIA",
    icon: Landmark,
    iconColor: "text-violet-400",
    adminOnly: true,
    items: [
      {
        label: "Financeiro",
        icon: Wallet,
        adminOnly: true,
        children: [
          { path: "/admin/financeiro", label: "Contas", icon: Wallet },
          { path: "/admin/faturas", label: "Faturas / Cobranças", icon: Receipt },
          { path: "/admin/balanco-gerencial", label: "Balanço Gerencial", icon: BarChart3 },
          { path: "/admin/cotacao-gasto", label: "Cotação Gasto Mínimo", icon: Calculator },
        ],
      },
    ],
  },
  {
    title: "SISTEMA",
    icon: Settings,
    iconColor: "text-rose-400",
    items: [
      { path: "/admin/auditoria", label: "Auditoria", icon: Shield, adminOnly: true },
      { path: "/admin/usuarios", label: "Usuários", icon: UserCog, adminOnly: true },
      { path: "/admin/guia-missao", label: "Guia Operacional", icon: BookOpen },
      { path: "/admin/simulador-missao", label: "Simulador Missão", icon: Play },
    ],
  },
];

const rootItems: MenuItem[] = [
  { path: "/admin/dashboard", label: "Painel", icon: LayoutDashboard },
  { path: "/admin/chat", label: "Chat", icon: MessageCircle },
];

function prefetchRoute(path: string) {
  const keys = PREFETCH_MAP[path];
  if (!keys) return;
  for (const key of keys) {
    queryClient.prefetchQuery({ queryKey: [key], staleTime: 30000 });
  }
}

const SystemStatusBadge = memo(function SystemStatusBadge({ compact = false }: { compact?: boolean }) {
  const { data: health } = useQuery<{ supabase: string; localDb: string; mode: string }>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
    refetchInterval: 15000,
    retry: false,
  });

  if (!health) return null;

  const isOnline = health.supabase === "online";
  const isFallback = health.mode === "fallback";

  if (compact) {
    return (
      <div
        className="flex items-center gap-1.5"
        title={isOnline ? "Sistema online (Supabase)" : isFallback ? "Modo fallback (banco local)" : "Sistema offline"}
        data-testid="system-status-compact"
      >
        <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : isFallback ? "bg-amber-400 animate-pulse" : "bg-red-500"}`} />
        <span className={`text-[10px] font-medium ${isOnline ? "text-emerald-400" : isFallback ? "text-amber-400" : "text-red-400"}`}>
          {isOnline ? "ONLINE" : isFallback ? "FALLBACK" : "OFFLINE"}
        </span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 rounded-lg border border-white/10 bg-white/5" data-testid="system-status-panel">
      <div className="flex items-center gap-2 mb-1.5">
        <Activity className="w-3.5 h-3.5 text-white/60" />
        <span className="text-[10px] font-bold tracking-wider text-white/60">STATUS DO SISTEMA</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">Supabase</span>
          <div className="flex items-center gap-1.5">
            {isOnline ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
            <span className={`text-[10px] font-semibold ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">Banco Local</span>
          <div className="flex items-center gap-1.5">
            {health.localDb === "online" ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400" />}
            <span className={`text-[10px] font-semibold ${health.localDb === "online" ? "text-emerald-400" : "text-red-400"}`}>
              {health.localDb === "online" ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">Modo</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isOnline ? "bg-emerald-500/20 text-emerald-400" : isFallback ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"
          }`}>
            {isOnline ? "PRIMÁRIO" : isFallback ? "FALLBACK" : "OFFLINE"}
          </span>
        </div>
      </div>
    </div>
  );
});

const SidebarNav = memo(function SidebarNav({ location, isAdmin, unreadCount }: { location: string; isAdmin: boolean; unreadCount: number }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ "Funcionários": true, "Grid Operacional": true, "Frota": true, "Financeiro": true });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ "COMERCIAL": true, "OPERAÇÕES": true, "GESTÃO DE PESSOAS": true, "CONTROLADORIA": true, "SISTEMA": true });

  const toggleGroup = useCallback((label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }, []);

  const toggleSection = useCallback((title: string) => {
    setOpenSections(prev => ({ ...prev, [title]: !prev[title] }));
  }, []);

  const filterItem = useCallback((item: MenuItem): boolean => {
    if (item.adminOnly) return isAdmin;
    return true;
  }, [isAdmin]);

  return (
    <nav className="p-3 space-y-1 overflow-y-auto flex-1 min-h-0">
      {rootItems.filter(filterItem).map((item) => (
        <Link key={item.path} href={item.path!}>
          <span
            onMouseEnter={() => item.path && prefetchRoute(item.path)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors ${
              location === item.path
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
            data-testid={`link-${item.path!.split("/").pop()}`}
          >
            <item.icon className={`w-4 h-4 ${item.iconColor || ""}`} />
            {item.label}
            {item.label === "Chat" && unreadCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1" data-testid="badge-chat-unread">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </span>
        </Link>
      ))}

      {menuSections.filter(s => !s.adminOnly || isAdmin).map((section) => {
        const isSectionOpen = openSections[section.title] ?? true;
        return (
          <div key={section.title}>
            <div className="h-px bg-white/10 my-3" />
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center gap-2 px-3 py-1.5 mb-1"
              data-testid={`section-${section.title.toLowerCase().replace(/\s/g, '-')}`}
            >
              <section.icon className={`w-3.5 h-3.5 ${section.iconColor}`} />
              <span className={`text-[10px] font-bold tracking-widest ${section.iconColor}`}>{section.title}</span>
              {isSectionOpen ? <ChevronDown className="w-3 h-3 text-white/30 ml-auto" /> : <ChevronRight className="w-3 h-3 text-white/30 ml-auto" />}
            </button>
            {isSectionOpen && (
              <div className="space-y-0.5">
                {section.items.filter(filterItem).map((item, ii) => {
                  if (item.children) {
                    const isOpen = openGroups[item.label] ?? false;
                    const isChildActive = item.children.some(c => location === c.path);
                    return (
                      <div key={ii}>
                        <button
                          onClick={() => toggleGroup(item.label)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                            isChildActive ? "text-white bg-white/5" : "text-white/60 hover:text-white hover:bg-white/5"
                          }`}
                          data-testid={`button-menu-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                        >
                          <item.icon className={`w-4 h-4 ${item.iconColor || ""}`} />
                          <span className="flex-1 text-left">{item.label}</span>
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                        {isOpen && (
                          <div className="ml-4 space-y-0.5 mt-0.5">
                            {item.children.filter(filterItem).map((child) => (
                              <Link key={child.path} href={child.path!}>
                                <span
                                  onMouseEnter={() => child.path && prefetchRoute(child.path)}
                                  className={`flex items-center gap-3 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
                                    location === child.path
                                      ? "bg-white/10 text-white"
                                      : "text-white/40 hover:text-white hover:bg-white/5"
                                  }`}
                                  data-testid={`link-${child.path!.split("/").pop()}`}
                                >
                                  <child.icon className={`w-3.5 h-3.5 ${child.iconColor || ""}`} />
                                  {child.label}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <Link key={item.path} href={item.path!}>
                      <span
                        onMouseEnter={() => item.path && prefetchRoute(item.path)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                          location === item.path
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                        data-testid={`link-${item.path!.split("/").pop()}`}
                      >
                        <item.icon className={`w-4 h-4 ${item.iconColor || ""}`} />
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const { data: chatUnread } = useQuery<{ total: number }>({
    queryKey: ["/api/chat/unread-count"],
    refetchInterval: 30000,
  });
  const unreadCount = chatUnread?.total || 0;
  const isAdmin = user?.role === "admin" || user?.role === "diretoria";
  const isDiretoria = user?.role === "diretoria";

  return (
    <div className="min-h-screen bg-neutral-100 flex" data-testid="admin-layout">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-neutral-900 text-white transform transition-transform duration-200 lg:translate-x-0 lg:static flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        data-testid="admin-sidebar"
      >
        <div className="p-4 border-b border-white/10 shrink-0">
          <Link href="/">
            <span className="text-lg font-bold tracking-tight cursor-pointer" data-testid="link-admin-home">
              TORRES
            </span>
          </Link>
          <p className="text-xs text-white/40 mt-1">Área Interna</p>
        </div>

        <SidebarNav location={location} isAdmin={isAdmin} unreadCount={unreadCount} />

        <div className="shrink-0 p-4 border-t border-white/10 space-y-3">
          {isDiretoria && <SystemStatusBadge />}
          <Link href="/admin/perfil">
            <div className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-md p-1 -m-1 transition-colors" data-testid="link-profile">
              {user?.role === "diretoria" ? (
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
              ) : (
                <UserCircle className="w-8 h-8 text-white/40" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-admin-username">{user?.name}</p>
                <p className={`text-xs ${user?.role === "diretoria" ? "text-amber-400 font-semibold" : "text-white/40"}`}>
                  {user?.role === "diretoria" ? "DIRETORIA" : user?.role}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); logout(); }}
                className="text-white/40 hover:text-white hover:bg-white/10"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </Link>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center gap-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-toggle-sidebar"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <span className="font-bold text-sm flex-1">TORRES - Área Interna</span>
          {isDiretoria && <SystemStatusBadge compact />}
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
