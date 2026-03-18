import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
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
import ConsultasPage from "@/pages/admin/consultas";
import GuiaMissaoPage from "@/pages/admin/guia-missao";
import UsersPage from "@/pages/admin/users";
import ProfilePage from "@/pages/admin/profile";
import MobileHomePage from "@/pages/mobile/home";
import MobileMissaoPage from "@/pages/mobile/missao";
import MobileChecklistPage from "@/pages/mobile/checklist";
import MobilePerfilPage from "@/pages/mobile/perfil";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-neutral-400">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    setLocation("/admin");
    return null;
  }

  return <Component />;
}

function MobileProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-neutral-400">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    setLocation("/admin");
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
      <Route path="/admin/trips">{() => <ProtectedRoute component={TripsPage} />}</Route>
      <Route path="/admin/fueling">{() => <ProtectedRoute component={FuelingPage} />}</Route>
      <Route path="/admin/maintenance">{() => <ProtectedRoute component={MaintenancePage} />}</Route>
      <Route path="/admin/timesheets">{() => <ProtectedRoute component={TimesheetsPage} />}</Route>
      <Route path="/admin/tracker">{() => <ProtectedRoute component={TrackerPage} />}</Route>
      <Route path="/admin/mission">{() => <ProtectedRoute component={MissionPage} />}</Route>
      <Route path="/admin/operational-grid">{() => <ProtectedRoute component={OperationalGridPage} />}</Route>
      <Route path="/admin/consultas">{() => <ProtectedRoute component={ConsultasPage} />}</Route>
      <Route path="/admin/guia-missao">{() => <ProtectedRoute component={GuiaMissaoPage} />}</Route>
      <Route path="/admin/usuarios">{() => <ProtectedRoute component={UsersPage} />}</Route>
      <Route path="/admin/perfil">{() => <ProtectedRoute component={ProfilePage} />}</Route>
      <Route path="/mobile">{() => <MobileProtectedRoute component={MobileHomePage} />}</Route>
      <Route path="/mobile/missao">{() => <MobileProtectedRoute component={MobileMissaoPage} />}</Route>
      <Route path="/mobile/checklist">{() => <MobileProtectedRoute component={MobileChecklistPage} />}</Route>
      <Route path="/mobile/perfil">{() => <MobileProtectedRoute component={MobilePerfilPage} />}</Route>
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
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
