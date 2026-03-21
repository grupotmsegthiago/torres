import MobileLayout from "@/components/mobile/layout";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Crosshair, Clock, Car, Shield, ChevronRight, AlertCircle } from "lucide-react";

export default function MobileHomePage() {
  const { user } = useAuth();

  const { data: mission, isLoading } = useQuery<any>({
    queryKey: ["/api/mission/active"],
    refetchInterval: 2 * 60 * 1000,
  });

  const firstName = user?.name?.split(" ")[0] || "Agente";
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <MobileLayout>
      <div className="p-4 space-y-4" data-testid="mobile-home-page">
        <div className="bg-neutral-900 rounded-2xl p-5 text-white">
          <p className="text-sm text-neutral-400">{greeting},</p>
          <h1 className="text-xl font-black uppercase tracking-wider" data-testid="text-mobile-greeting">
            {firstName}
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
            <p className="text-sm text-neutral-400">Carregando missão...</p>
          </div>
        ) : mission ? (
          <Link href="/mobile/missao">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 active:bg-neutral-50 transition-colors" data-testid="card-mission-active">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                    <Crosshair className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Missão Ativa</p>
                    <p className="text-[11px] text-neutral-400">{mission.osNumber}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-300" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Car className="w-3 h-3 text-neutral-400" />
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Viatura</span>
                  </div>
                  <p className="text-xs font-bold text-neutral-700">{mission.vehiclePlate || "—"}</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Shield className="w-3 h-3 text-neutral-400" />
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">Status</span>
                  </div>
                  <p className="text-xs font-bold text-neutral-700 capitalize">{
                    (() => {
                      const s = mission.missionStatus;
                      if (!s || s === "aguardando" || s === "checkout_armamento" || s === "checkout_viatura" || s === "checkout_km_saida") return "Saída da Base";
                      if (s === "em_transito_origem" || s === "checkin_chegada_km" || s === "checkin_veiculo_escoltado" || s === "checkin_dados_motorista") return "Chegada na Origem";
                      if (s === "iniciar_missao") return "Início de Missão";
                      if (s === "em_transito_destino") return "Chegada no Destino";
                      if (s === "checkout_km_final" || s === "checkout_viatura_retorno") return "Término de Missão";
                      if (s === "finalizada") return "Finalizada";
                      return s.replace(/_/g, " ");
                    })()
                  }</p>
                </div>
              </div>

              <div className="mt-3 h-11 bg-neutral-900 rounded-xl flex items-center justify-center">
                <span className="text-sm font-bold text-white uppercase tracking-wider">Acessar Missão</span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center" data-testid="card-no-mission">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-neutral-300" />
            </div>
            <p className="text-sm font-bold text-neutral-700">Nenhuma missão ativa</p>
            <p className="text-xs text-neutral-400 mt-1">Aguarde a atribuição de uma nova OS</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link href="/mobile/checklist">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 text-center active:bg-neutral-50 transition-colors" data-testid="link-checklist">
              <Clock className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Checklist</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">Etapas da missão</p>
            </div>
          </Link>
          <Link href="/mobile/perfil">
            <div className="bg-white rounded-2xl border border-neutral-200 p-4 text-center active:bg-neutral-50 transition-colors" data-testid="link-perfil">
              <Shield className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Meu Perfil</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">Dados e credencial</p>
            </div>
          </Link>
        </div>
      </div>
    </MobileLayout>
  );
}
