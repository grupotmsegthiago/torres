import { useEffect, useState, lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";

import Home from "@/pages/home";
import LoginPage from "@/pages/admin/login";
import NotFound from "@/pages/not-found";
import AccessDeniedPage from "@/pages/access-denied";

const DashboardPage = lazy(() => import("@/pages/admin/dashboard"));
const ClientsPage = lazy(() => import("@/pages/admin/clients"));
const EmployeesPage = lazy(() => import("@/pages/admin/employees"));
const VehiclesPage = lazy(() => import("@/pages/admin/vehicles"));
const ServiceOrdersPage = lazy(() => import("@/pages/admin/service-orders"));
const FuelingPage = lazy(() => import("@/pages/admin/fueling"));
const MaintenancePage = lazy(() => import("@/pages/admin/maintenance"));
const TimesheetsPage = lazy(() => import("@/pages/admin/timesheets"));
const TrackerPage = lazy(() => import("@/pages/admin/tracker"));
const MissionPage = lazy(() => import("@/pages/admin/mission"));
const OperationalGridPage = lazy(() => import("@/pages/admin/operational-grid"));
const AgendaVtrPage = lazy(() => import("@/pages/admin/agenda-vtr"));
const GuiaMissaoPage = lazy(() => import("@/pages/admin/guia-missao"));
const WeaponsPage = lazy(() => import("@/pages/admin/weapons"));
const UsersPage = lazy(() => import("@/pages/admin/users"));
const ProfilePage = lazy(() => import("@/pages/admin/profile"));
const AuditPage = lazy(() => import("@/pages/admin/audit"));
const FinanceiroPage = lazy(() => import("@/pages/admin/financeiro"));
const BoletimMedicaoPage = lazy(() => import("@/pages/admin/boletim-medicao"));
const RelatorioFaturamentoPage = lazy(() => import("@/pages/admin/relatorio-faturamento"));
const BalancoGerencialPage = lazy(() => import("@/pages/admin/balanco-gerencial"));
const SimuladorMissaoPage = lazy(() => import("@/pages/admin/simulador-missao"));
const RelatorioOSPage = lazy(() => import("@/pages/admin/relatorio-os"));
const CotacaoGastoPage = lazy(() => import("@/pages/admin/cotacao-gasto"));
const FaturasPage = lazy(() => import("@/pages/admin/faturas"));
const HoleritesPage = lazy(() => import("@/pages/admin/holerites"));
const LaudoPage = lazy(() => import("@/pages/admin/laudo"));
const JornadaDiretoriaPage = lazy(() => import("@/pages/admin/jornada-diretoria"));
const ChatPage = lazy(() => import("@/pages/admin/chat"));
const PontoOperacionalPage = lazy(() => import("@/pages/admin/ponto-operacional"));
const AprovacaoPage = lazy(() => import("@/pages/aprovacao"));
const PhotoInspectionPage = lazy(() => import("@/pages/admin/photo-inspection"));

const ControleCondutorPage = lazy(() => import("@/pages/admin/controle-condutor"));
const LeadsPage = lazy(() => import("@/pages/admin/leads"));

const MobileHomePage = lazy(() => import("@/pages/mobile/home"));
const MobileMissaoPage = lazy(() => import("@/pages/mobile/missao"));
const MobileChecklistPage = lazy(() => import("@/pages/mobile/checklist"));
const MobilePerfilPage = lazy(() => import("@/pages/mobile/perfil"));
const MobileRHPage = lazy(() => import("@/pages/mobile/meu-rh"));
const MobileSelfiePage = lazy(() => import("@/pages/mobile/selfie"));
const MobilePontoPage = lazy(() => import("@/pages/mobile/ponto"));
const MobileAbastecimentoPage = lazy(() => import("@/pages/mobile/abastecimento"));
const MobilePedagioPage = lazy(() => import("@/pages/mobile/pedagio"));
const MobileOcorrenciaPage = lazy(() => import("@/pages/mobile/ocorrencia"));
const MobilePontoOperacionalPage = lazy(() => import("@/pages/mobile/ponto-operacional"));
const MobileChatPage = lazy(() => import("@/pages/mobile/chat"));
const MobileControleCondutorPage = lazy(() => import("@/pages/mobile/controle-condutor"));

function LazyFallback() {
  return (
    <div className="min-h-screen bg-neutral-100 flex">
      <div className="hidden lg:block w-64 bg-neutral-900 shrink-0" />
      <div className="flex-1 p-6 lg:p-8 space-y-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="h-8 w-48 bg-neutral-200 rounded-lg" />
          <div className="h-8 w-32 bg-neutral-200 rounded-lg ml-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 bg-white rounded-xl border border-neutral-200" />
          <div className="h-24 bg-white rounded-xl border border-neutral-200" />
          <div className="h-24 bg-white rounded-xl border border-neutral-200" />
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 w-16 bg-neutral-100 rounded" />
              <div className="h-4 flex-1 bg-neutral-100 rounded" />
              <div className="h-4 w-24 bg-neutral-100 rounded" />
              <div className="h-4 w-20 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/admin");
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return <LazyFallback />;
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
      if (sessionStorage.getItem("selfieOk") === "1") {
        setSelfieOk(true);
        setSelfieChecked(true);
        return;
      }
      apiRequest("GET", "/api/auth/login-selfie-today")
        .then(r => r.ok ? r.json() : { hasSelfieToday: false })
        .then(data => {
          if (!data.hasSelfieToday) {
            setLocation("/mobile/selfie");
          } else {
            sessionStorage.setItem("selfieOk", "1");
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
    return <LazyFallback />;
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
    <Suspense fallback={<LazyFallback />}>
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
        <Route path="/admin/fueling">{() => <ProtectedRoute component={FuelingPage} />}</Route>
        <Route path="/admin/maintenance">{() => <ProtectedRoute component={MaintenancePage} />}</Route>
        <Route path="/admin/timesheets">{() => <ProtectedRoute component={TimesheetsPage} />}</Route>
        <Route path="/admin/tracker">{() => <ProtectedRoute component={TrackerPage} />}</Route>
        <Route path="/admin/mission">{() => <ProtectedRoute component={MissionPage} />}</Route>
        <Route path="/admin/operational-grid">{() => <ProtectedRoute component={OperationalGridPage} />}</Route>
        <Route path="/admin/agenda-vtr">{() => <ProtectedRoute component={AgendaVtrPage} />}</Route>
        <Route path="/admin/laudo/:osId">{() => <ProtectedRoute component={LaudoPage} />}</Route>
        <Route path="/admin/guia-missao">{() => <ProtectedRoute component={GuiaMissaoPage} />}</Route>
        <Route path="/admin/simulador-missao">{() => <ProtectedRoute component={SimuladorMissaoPage} />}</Route>
        <Route path="/admin/relatorio-os">{() => <ProtectedRoute component={RelatorioOSPage} />}</Route>
        <Route path="/admin/cotacao-gasto">{() => <ProtectedRoute component={CotacaoGastoPage} />}</Route>
        <Route path="/admin/armamento">{() => <ProtectedRoute component={WeaponsPage} />}</Route>
        <Route path="/admin/usuarios">{() => <ProtectedRoute component={UsersPage} />}</Route>
        <Route path="/admin/auditoria">{() => <ProtectedRoute component={AuditPage} />}</Route>
        <Route path="/admin/financeiro">{() => <ProtectedRoute component={FinanceiroPage} />}</Route>
        <Route path="/admin/balanco-gerencial">{() => <ProtectedRoute component={BalancoGerencialPage} />}</Route>
        <Route path="/admin/faturas">{() => <ProtectedRoute component={FaturasPage} />}</Route>
        <Route path="/admin/holerites">{() => <ProtectedRoute component={HoleritesPage} />}</Route>
        <Route path="/admin/jornada-diretoria">{() => <ProtectedRoute component={JornadaDiretoriaPage} />}</Route>
        <Route path="/admin/chat">{() => <ProtectedRoute component={ChatPage} />}</Route>
        <Route path="/admin/perfil">{() => <ProtectedRoute component={ProfilePage} />}</Route>
        <Route path="/admin/ponto-operacional">{() => <ProtectedRoute component={PontoOperacionalPage} />}</Route>
        <Route path="/admin/controle-condutor">{() => <ProtectedRoute component={ControleCondutorPage} />}</Route>
        <Route path="/admin/leads">{() => <ProtectedRoute component={LeadsPage} />}</Route>
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
        <Route path="/mobile/chat">{() => <MobileProtectedRoute component={MobileChatPage} />}</Route>
        <Route path="/mobile/ponto-operacional">{() => <MobileProtectedRoute component={MobilePontoOperacionalPage} />}</Route>
        <Route path="/mobile/controle-condutor">{() => <MobileProtectedRoute component={MobileControleCondutorPage} />}</Route>
        <Route path="/mobile-test">{() => <MobileProtectedRoute component={MobileMissaoPage} />}</Route>
        <Route path="/admin/photo-inspection/:osId">{() => <ProtectedRoute component={PhotoInspectionPage} />}</Route>
        <Route path="/aprovacao/:token" component={AprovacaoPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
