import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Car, FileText, Route, Wrench,
  Fuel, Clock, MapPin, Menu, X, LogOut, UserCircle, UserCog,
  ChevronDown, ChevronRight, Building2, Target, Radio, Crown, BookOpen, Smartphone, Crosshair, Gauge, Shield, Wallet, Calculator, BarChart3, Play, Receipt, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

type MenuItem = {
  path?: string;
  label: string;
  icon: any;
  iconColor?: string;
  adminOnly?: boolean;
  children?: MenuItem[];
};

const menuItems: MenuItem[] = [
  { path: "/admin/dashboard", label: "Painel", icon: LayoutDashboard },
  { path: "/admin/clients", label: "Clientes", icon: Building2 },
  { path: "/admin/service-orders", label: "Ordens de Serviço", icon: FileText },
  { path: "/admin/boletim-medicao", label: "Boletim de Medição", icon: Calculator },
  { path: "/admin/relatorio-faturamento", label: "Relatório Faturamento", icon: FileText },
  {
    label: "Funcionários",
    icon: Users,
    children: [
      { path: "/admin/employees", label: "Cadastro", icon: Users },
      { path: "/admin/timesheets", label: "Folha de Ponto", icon: Clock },
      { path: "/admin/holerites", label: "Holerites", icon: Receipt, adminOnly: true },
      { path: "/admin/ponto-operacional", label: "Ponto Operacional", icon: Play },
      { path: "/admin/guia-missao", label: "Guia Operacional", icon: BookOpen },
    ],
  },
  { path: "/admin/armamento", label: "Armamento", icon: Crosshair },
  {
    label: "Grid Operacional",
    icon: Radio,
    iconColor: "text-amber-500",
    children: [
      { path: "/admin/operational-grid", label: "Painel Operacional", icon: Radio, iconColor: "text-amber-500" },
      { path: "/admin/mission", label: "Missao Ativa", icon: Target },
      { path: "/admin/simulador-missao", label: "Simulador Missao", icon: Play },
    ],
  },
  {
    label: "Frota",
    icon: Car,
    children: [
      { path: "/admin/vehicles", label: "Veículos", icon: Car },
      { path: "/admin/trips", label: "Viagens", icon: Route },
      { path: "/admin/fueling", label: "Abastecimento", icon: Fuel },
      { path: "/admin/maintenance", label: "Manutenção", icon: Wrench },
      { path: "/admin/tracker", label: "Rastreador", icon: MapPin },
      { path: "/admin/telemetria", label: "Telemetria", icon: Gauge },
    ],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    adminOnly: true,
    children: [
      { path: "/admin/financeiro", label: "Contas", icon: Wallet },
      { path: "/admin/faturas", label: "Faturas / Cobranças", icon: Receipt },
      { path: "/admin/balanco-gerencial", label: "Balanço Gerencial", icon: BarChart3 },
      { path: "/admin/cotacao-gasto", label: "Cotação Gasto Mínimo", icon: Calculator },
      { path: "/admin/calculadora-jornada", label: "Calculadora Jornada", icon: Clock },
    ],
  },
  { path: "/admin/chat", label: "Chat", icon: MessageCircle },
  { path: "/admin/jornada-diretoria", label: "Jornada", icon: Clock, adminOnly: true },
  { path: "/admin/usuarios", label: "Usuários", icon: UserCog, adminOnly: true },
  { path: "/admin/auditoria", label: "Auditoria", icon: Shield, adminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ "Funcionários": true, "Grid Operacional": true, "Frota": true, "Financeiro": true });
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const { data: chatUnread } = useQuery<{ total: number }>({
    queryKey: ["/api/chat/unread-count"],
    refetchInterval: 30000,
  });
  const unreadCount = chatUnread?.total || 0;

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const filteredItems = menuItems.filter((item) => {
    if (item.adminOnly) {
      return user?.role === "admin" || user?.role === "diretoria";
    }
    return true;
  });

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

        <nav className="p-3 space-y-1 overflow-y-auto flex-1 min-h-0">
          {filteredItems.map((item, i) => {
            if (item.children) {
              const isOpen = openGroups[item.label] ?? false;
              const isChildActive = item.children.some(c => location === c.path);
              return (
                <div key={i}>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                      isChildActive ? "text-white bg-white/5" : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    data-testid={`button-menu-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <item.icon className={`w-4 h-4 ${item.iconColor || ""}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {isOpen && (
                    <div className="ml-4 space-y-1 mt-1">
                      {item.children.filter(child => !child.adminOnly || user?.role === "admin" || user?.role === "diretoria").map((child) => (
                        <Link key={child.path} href={child.path!}>
                          <span
                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                              location === child.path
                                ? "bg-white/10 text-white"
                                : "text-white/40 hover:text-white hover:bg-white/5"
                            }`}
                            data-testid={`link-${child.path!.split("/").pop()}`}
                          >
                            <child.icon className={`w-4 h-4 ${child.iconColor || ""}`} />
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
            );
          })}
        </nav>

        <div className="shrink-0 p-4 border-t border-white/10">
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
          <span className="font-bold text-sm">TORRES - Área Interna</span>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
