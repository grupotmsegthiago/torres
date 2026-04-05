import { ShieldAlert, Smartphone, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function AccessDeniedPage() {
  const { logoutMutation } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-800 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-red-400" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white" data-testid="text-access-denied-title">
            Acesso Negado
          </h1>
          <p className="text-neutral-400 mt-2 text-sm leading-relaxed">
            Sua conta é de <span className="text-amber-400 font-semibold">Agente de Campo</span>.
            O acesso ao painel administrativo é restrito a administradores.
          </p>
        </div>

        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-3 text-left">
            <Smartphone className="w-8 h-8 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-white font-semibold text-sm">Use o Aplicativo Mobile</p>
              <p className="text-neutral-400 text-xs mt-0.5">
                Acesse pelo celular em <span className="text-blue-400 font-mono">/mobile</span> para utilizar o sistema de missões.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => logoutMutation.mutate()}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-neutral-700 text-white text-sm font-semibold hover:bg-neutral-600 transition-colors"
          data-testid="button-logout-denied"
        >
          <ArrowLeft className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );
}
