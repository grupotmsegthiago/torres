import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, Users, Car, FileText, Route, Wrench,
  Fuel, Clock, MapPin, Menu, X, LogOut, UserCircle,
  ChevronDown, ChevronRight, Building2, Target, Radio, Search, Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";

const menuItems = [
  { path: "/admin/dashboard", label: "Painel", icon: LayoutDashboard },
  { path: "/admin/operational-grid", label: "Grid Operacional", icon: Radio },
  { path: "/admin/clients", label: "Clientes", icon: Building2 },
  { path: "/admin/employees", label: "Funcionários", icon: Users },
  { path: "/admin/service-orders", label: "Ordens de Serviço", icon: FileText },
  {
    label: "Frota",
    icon: Car,
    children: [
      { path: "/admin/vehicles", label: "Veículos", icon: Car },
      { path: "/admin/trips", label: "Viagens", icon: Route },
      { path: "/admin/fueling", label: "Abastecimento", icon: Fuel },
      { path: "/admin/maintenance", label: "Manutenção", icon: Wrench },
      { path: "/admin/tracker", label: "Rastreador", icon: MapPin },
    ],
  },
  { path: "/admin/timesheets", label: "Folha de Ponto", icon: Clock },
  { path: "/admin/consultas", label: "Consultas", icon: Search },
  { path: "/admin/mission", label: "Missão Ativa", icon: Target },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flotaOpen, setFlotaOpen] = useState(true);
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-neutral-100 flex" data-testid="admin-layout">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-neutral-900 text-white transform transition-transform duration-200 lg:translate-x-0 lg:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        data-testid="admin-sidebar"
      >
        <div className="p-4 border-b border-white/10">
          <Link href="/">
            <span className="text-lg font-bold tracking-tight cursor-pointer" data-testid="link-admin-home">
              TORRES
            </span>
          </Link>
          <p className="text-xs text-white/40 mt-1">Área Interna</p>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-140px)]">
          {menuItems.map((item, i) => {
            if ("children" in item) {
              return (
                <div key={i}>
                  <button
                    onClick={() => setFlotaOpen(!flotaOpen)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                    data-testid="button-fleet-menu"
                  >
                    <item.icon className="w-4 h-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {flotaOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {flotaOpen && (
                    <div className="ml-4 space-y-1 mt-1">
                      {item.children.map((child) => (
                        <Link key={child.path} href={child.path}>
                          <span
                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                              location === child.path
                                ? "bg-white/10 text-white"
                                : "text-white/40 hover:text-white hover:bg-white/5"
                            }`}
                            data-testid={`link-${child.path.split("/").pop()}`}
                          >
                            <child.icon className="w-4 h-4" />
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
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
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
              onClick={logout}
              className="text-white/40 hover:text-white hover:bg-white/10"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
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
