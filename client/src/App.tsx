import { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import AccessDeniedPage from "@/pages/access-denied";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import LoginPage from "@/pages/admin/login";
import DashboardPage from "@/pages/admin/dashboard";
import ClientsPage from "@/pages/admin/clients";
import EmployeesPage from "@/pages/admin/employees";
import VehiclesPage from "@/pages/admin/vehicles";
import ServiceOrdersPage from "@/pages/admin/service-orders";
import TripsPage from "@/pages/admin/trips";
import FuelingPage from "@/pages/admin/fueling";
import MaintenancePage from "@/pages/admin/maintenance";
import TimesheetsPage from "@/pages/admin/timesheets";
import TrackerPage from "@/pages/admin/tracker";
import MissionPage from "@/pages/admin/mission";
import OperationalGridPage from "@/pages/admin/operational-grid";
import TelemetryPage from "@/pages/admin/telemetry";

import GuiaMissaoPage from "@/pages/admin/guia-missao";
import WeaponsPage from "@/pages/admin/weapons";
import UsersPage from "@/pages/admin/users";
import ProfilePage from "@/pages/admin/profile";
import AuditPage from "@/pages/admin/audit";
import FinanceiroPage from "@/pages/admin/financeiro";
import BoletimMedicaoPage from "@/pages/admin/boletim-medicao";
import RelatorioFaturamentoPage from "@/pages/admin/relatorio-faturamento";
import BalancoGerencialPage from "@/pages/admin/balanco-gerencial";
import SimuladorMissaoPage from "@/pages/admin/simulador-missao";
import CotacaoGastoPage from "@/pages/admin/cotacao-gasto";
import FaturasPage from "@/pages/admin/faturas";
import MobileHomePage from "@/pages/mobile/home";
import MobileMissaoPage from "@/pages/mobile/missao";
import MobileChecklistPage from "@/pages/mobile/checklist";
import MobilePerfilPage from "@/pages/mobile/perfil";
import MobileRHPage from "@/pages/mobile/meu-rh";
import MobileSelfiePage from "@/pages/mobile/selfie";
import MobilePontoPage from "@/pages/mobile/ponto";
import MobileAbastecimentoPage from "@/pages/mobile/abastecimento";
import MobilePedagioPage from "@/pages/mobile/pedagio";
import MobileOcorrenciaPage from "@/pages/mobile/ocorrencia";
import MobilePontoOperacionalPage from "@/pages/mobile/ponto-operacional";
import PontoOperacionalPage from "@/pages/admin/ponto-operacional";
import HoleritesPage from "@/pages/admin/holerites";
import CalculadoraJornadaPage from "@/pages/admin/calculadora-jornada";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/admin");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-neutral-400">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (user.role === "funcionario") {
    return <AccessDeniedPage />;
  }

  return <Component />;
}

function MobileProtectedRoute({ component: Component, skipSelfieCheck }: { component: React.ComponentType; skipSelfieCheck?: boolean }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selfieChecked, setSelfieChecked] = useState(false);
  const [selfieOk, setSelfieOk] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/admin");
    }
  }, [isLoading, user, setLocation]);

  useEffect(() => {
    if (user && user.role === "funcionario" && !skipSelfieCheck) {
      apiRequest("GET", "/api/auth/login-selfie-today")
        .then(r => r.ok ? r.json() : { hasSelfieToday: false })
        .then(data => {
          if (!data.hasSelfieToday) {
            setLocation("/mobile/selfie");
          } else {
            setSelfieOk(true);
          }
          setSelfieChecked(true);
        })
        .catch(() => {
          setSelfieOk(true);
          setSelfieChecked(true);
        });
    } else if (user) {
      setSelfieOk(true);
      setSelfieChecked(true);
    }
  }, [user, skipSelfieCheck, setLocation]);

  if (isLoading || (!selfieChecked && user)) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-neutral-400">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!selfieOk && !skipSelfieCheck) {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={LoginPage} />
      <Route path="/admin/dashboard">{() => <ProtectedRoute component={DashboardPage} />}</Route>
      <Route path="/admin/clients">{() => <ProtectedRoute component={ClientsPage} />}</Route>
      <Route path="/admin/employees">{() => <ProtectedRoute component={EmployeesPage} />}</Route>
      <Route path="/admin/vehicles">{() => <ProtectedRoute component={VehiclesPage} />}</Route>
      <Route path="/admin/service-orders">{() => <ProtectedRoute component={ServiceOrdersPage} />}</Route>
      <Route path="/admin/boletim-medicao">{() => <ProtectedRoute component={BoletimMedicaoPage} />}</Route>
      <Route path="/admin/relatorio-faturamento">{() => <ProtectedRoute component={RelatorioFaturamentoPage} />}</Route>
      <Route path="/admin/trips">{() => <ProtectedRoute component={TripsPage} />}</Route>
      <Route path="/admin/fueling">{() => <ProtectedRoute component={FuelingPage} />}</Route>
      <Route path="/admin/maintenance">{() => <ProtectedRoute component={MaintenancePage} />}</Route>
      <Route path="/admin/timesheets">{() => <ProtectedRoute component={TimesheetsPage} />}</Route>
      <Route path="/admin/tracker">{() => <ProtectedRoute component={TrackerPage} />}</Route>
      <Route path="/admin/mission">{() => <ProtectedRoute component={MissionPage} />}</Route>
      <Route path="/admin/operational-grid">{() => <ProtectedRoute component={OperationalGridPage} />}</Route>
      <Route path="/admin/telemetria">{() => <ProtectedRoute component={TelemetryPage} />}</Route>
      <Route path="/admin/guia-missao">{() => <ProtectedRoute component={GuiaMissaoPage} />}</Route>
      <Route path="/admin/simulador-missao">{() => <ProtectedRoute component={SimuladorMissaoPage} />}</Route>
      <Route path="/admin/cotacao-gasto">{() => <ProtectedRoute component={CotacaoGastoPage} />}</Route>
      <Route path="/admin/armamento">{() => <ProtectedRoute component={WeaponsPage} />}</Route>
      <Route path="/admin/usuarios">{() => <ProtectedRoute component={UsersPage} />}</Route>
      <Route path="/admin/auditoria">{() => <ProtectedRoute component={AuditPage} />}</Route>
      <Route path="/admin/financeiro">{() => <ProtectedRoute component={FinanceiroPage} />}</Route>
      <Route path="/admin/balanco-gerencial">{() => <ProtectedRoute component={BalancoGerencialPage} />}</Route>
      <Route path="/admin/faturas">{() => <ProtectedRoute component={FaturasPage} />}</Route>
      <Route path="/admin/holerites">{() => <ProtectedRoute component={HoleritesPage} />}</Route>
      <Route path="/admin/calculadora-jornada">{() => <ProtectedRoute component={CalculadoraJornadaPage} />}</Route>

      <Route path="/admin/perfil">{() => <ProtectedRoute component={ProfilePage} />}</Route>
      <Route path="/mobile">{() => <MobileProtectedRoute component={MobileHomePage} />}</Route>
      <Route path="/mobile/missao">{() => <MobileProtectedRoute component={MobileMissaoPage} />}</Route>
      <Route path="/mobile/checklist">{() => <MobileProtectedRoute component={MobileChecklistPage} />}</Route>
      <Route path="/mobile/perfil">{() => <MobileProtectedRoute component={MobilePerfilPage} />}</Route>
      <Route path="/mobile/meu-rh">{() => <MobileProtectedRoute component={MobileRHPage} />}</Route>
      <Route path="/mobile/selfie">{() => <MobileProtectedRoute component={MobileSelfiePage} skipSelfieCheck />}</Route>
      <Route path="/mobile/ponto">{() => <MobileProtectedRoute component={MobilePontoPage} />}</Route>
      <Route path="/mobile/abastecimento">{() => <MobileProtectedRoute component={MobileAbastecimentoPage} />}</Route>
      <Route path="/mobile/pedagio">{() => <MobileProtectedRoute component={MobilePedagioPage} />}</Route>
      <Route path="/mobile/ocorrencia">{() => <MobileProtectedRoute component={MobileOcorrenciaPage} />}</Route>
      <Route path="/mobile/ponto-operacional">{() => <MobileProtectedRoute component={MobilePontoOperacionalPage} />}</Route>
      <Route path="/admin/ponto-operacional">{() => <ProtectedRoute component={PontoOperacionalPage} />}</Route>
      <Route path="/mobile-test">{() => <MobileProtectedRoute component={MobileMissaoPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAInstallPrompt />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
