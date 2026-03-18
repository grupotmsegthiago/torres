import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { Shield, Mail, LogOut, Crown, User } from "lucide-react";

export default function MobilePerfilPage() {
  const { user, logout } = useAuth();

  const roleLabel = user?.role === "diretoria" ? "Diretoria" : user?.role === "admin" ? "Administrador" : "Agente";

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-perfil-page">
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-3">
            {user?.role === "diretoria" ? (
              <Crown className="w-8 h-8 text-white" />
            ) : (
              <User className="w-8 h-8 text-white" />
            )}
          </div>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-wider" data-testid="text-profile-name">
            {user?.name || "Agente"}
          </h2>
          <p className="text-xs text-neutral-400 uppercase tracking-wider mt-0.5">{roleLabel}</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
            <Mail className="w-4 h-4 text-neutral-400" />
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">E-mail</p>
              <p className="text-xs text-neutral-700" data-testid="text-profile-email">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Shield className="w-4 h-4 text-neutral-400" />
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Função</p>
              <p className="text-xs text-neutral-700" data-testid="text-profile-role">{roleLabel}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="w-full h-14 bg-white border border-neutral-200 text-neutral-600 rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:bg-neutral-50 transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="w-5 h-5" />
          Sair do Sistema
        </button>
      </div>
    </MobileLayout>
  );
}
