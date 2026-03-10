import AdminLayout from "@/components/admin/layout";
import { useAuth } from "@/hooks/use-auth";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";
import {
  Shield, Camera, Car, Truck, User, Siren,
  CheckCircle2, ChevronRight, Crosshair, Users, MapPin,
  Smartphone, Lock, ArrowRight, Gauge, Route,
} from "lucide-react";

const steps = [
  {
    number: 1,
    title: "LOGIN DO AGENTE",
    subtitle: "Acesso ao sistema",
    phase: "acesso",
    icon: Lock,
    description: "O vigilante acessa o sistema com seu login e senha pessoal. O sistema identifica automaticamente qual OS está atribuída a ele.",
    details: [
      "Login com usuário e senha criados pelo admin",
      "O sistema vincula o login ao cadastro do funcionário",
      "Ao entrar, a missão ativa é carregada automaticamente",
    ],
    mockup: "login",
  },
  {
    number: 2,
    title: "DADOS DA MISSÃO",
    subtitle: "Status: Aguardando",
    phase: "preparacao",
    icon: Shield,
    description: "O agente visualiza todos os dados da missão antes de iniciar: equipe, viatura, cliente e informações da OS.",
    details: [
      "Foto e nome dos 2 agentes (Agente 1 e Agente 2)",
      "Placa e modelo da viatura designada",
      "Nome do cliente, número da OS, agendamento",
      "Descrição do serviço a ser executado",
      "Relógio em tempo real",
    ],
    mockup: "aguardando",
    action: "INICIAR CHECK-OUT",
  },
  {
    number: 3,
    title: "CONFERÊNCIA DE ARMAMENTO",
    subtitle: "Check-out · Etapa 1/11",
    phase: "checkout",
    icon: Crosshair,
    description: "O agente fotografa obrigatoriamente todo o armamento antes de sair da base. Sem as 3 fotos, não é possível avançar.",
    details: [
      "Foto 1: Pistola 1 — registro visual da arma",
      "Foto 2: Pistola 2 — registro visual da segunda arma",
      "Foto 3: Espingarda 12 — registro visual da espingarda",
      "GPS capturado automaticamente em cada foto",
      "Cada foto é comprimida antes do envio",
    ],
    mockup: "armamento",
    action: "CONFIRMAR ARMAMENTO",
    mandatory: "3 fotos obrigatórias",
  },
  {
    number: 4,
    title: "CHECK-OUT DA VIATURA",
    subtitle: "Check-out · Etapa 2/11",
    phase: "checkout",
    icon: Car,
    description: "Registro fotográfico completo da viatura em 4 ângulos para documentar o estado do veículo antes da saída.",
    details: [
      "Foto 1: Dianteira — frente do veículo",
      "Foto 2: Lateral Esquerda",
      "Foto 3: Lateral Direita",
      "Foto 4: Traseira — parte de trás",
      "Serve como prova do estado do veículo na saída",
    ],
    mockup: "viatura",
    action: "CONFIRMAR VIATURA",
    mandatory: "4 fotos obrigatórias",
  },
  {
    number: 5,
    title: "KM DE SAÍDA",
    subtitle: "Check-out · Etapa 3/11",
    phase: "checkout",
    icon: Gauge,
    description: "O agente registra a quilometragem de saída com foto do hodômetro e digitação do valor.",
    details: [
      "Campo numérico para digitar o KM atual",
      "Foto obrigatória do hodômetro do veículo",
      "GPS capturado para registrar local de saída",
      "Ao confirmar → \"OK, Viagem Liberada!\"",
    ],
    mockup: "km",
    action: "LIBERAR VIAGEM",
    mandatory: "1 foto + KM obrigatório",
  },
  {
    number: 6,
    title: "EM TRÂNSITO (ORIGEM)",
    subtitle: "Deslocamento · Etapa 4/11",
    phase: "transito",
    icon: Route,
    description: "Tela de deslocamento até o cliente. O veículo animado indica que a viatura está em movimento.",
    details: [
      "Ícone de viatura com animação pulsante",
      "Mensagem: \"Deslocamento até o cliente\"",
      "Relógio em tempo real",
      "Nenhuma foto necessária nesta etapa",
    ],
    mockup: "transito",
    action: "CONFIRMAR CHEGADA",
  },
  {
    number: 7,
    title: "KM CHEGADA (CLIENTE)",
    subtitle: "Check-in · Etapa 5/11",
    phase: "checkin",
    icon: Gauge,
    description: "Registro da quilometragem de chegada ao local do cliente.",
    details: [
      "Campo numérico para digitar o KM de chegada",
      "Foto obrigatória do hodômetro",
      "GPS capturado para validar localização",
      "Diferença de KM calculável (saída vs chegada)",
    ],
    mockup: "km",
    action: "CONFIRMAR KM CHEGADA",
    mandatory: "1 foto + KM obrigatório",
  },
  {
    number: 8,
    title: "VEÍCULO ESCOLTADO",
    subtitle: "Check-in · Etapa 6/11",
    phase: "checkin",
    icon: Truck,
    description: "Registro fotográfico do caminhão ou veículo que será escoltado, documentando frente e traseira.",
    details: [
      "Foto 1: Frente do Caminhão — com placa visível",
      "Foto 2: Traseira do Caminhão — com placa visível",
      "Identifica visualmente o veículo escoltado",
      "GPS capturado em cada foto",
    ],
    mockup: "escoltado",
    action: "CONFIRMAR VEÍCULO ESCOLTADO",
    mandatory: "2 fotos obrigatórias",
  },
  {
    number: 9,
    title: "DADOS DO MOTORISTA",
    subtitle: "Check-in · Etapa 7/11",
    phase: "checkin",
    icon: User,
    description: "O agente registra o nome do motorista do veículo escoltado e a placa do veículo. Dados salvos na OS.",
    details: [
      "Campo: Nome completo do motorista",
      "Campo: Placa do veículo escoltado (formato ABC1D23)",
      "Dados ficam vinculados permanentemente à OS",
      "Não é possível avançar sem preencher os dois campos",
    ],
    mockup: "motorista",
    action: "SALVAR E AVANÇAR",
    mandatory: "Nome + Placa obrigatórios",
  },
  {
    number: 10,
    title: "INICIAR MISSÃO",
    subtitle: "Execução · Etapa 8/11",
    phase: "execucao",
    icon: Siren,
    description: "Momento crucial: o agente confirma o início da escolta. O sistema registra o timestamp exato e inicia o cronômetro da missão.",
    details: [
      "Ícone grande de sirene no centro da tela",
      "Resumo dos dados do motorista e placa escoltada",
      "Ao confirmar: timestamp registrado no servidor",
      "Cronômetro de missão inicia a contagem",
      "A partir daqui, o timer mostra tempo decorrido",
    ],
    mockup: "iniciar",
    action: "INICIAR MISSÃO",
  },
  {
    number: 11,
    title: "EM TRÂNSITO (DESTINO)",
    subtitle: "Execução · Etapa 9/11",
    phase: "transito",
    icon: Route,
    description: "Deslocamento ao destino final com a escolta ativa. O cronômetro mostra o tempo de missão decorrido.",
    details: [
      "Viatura animada em deslocamento",
      "Timer mostrando HH:MM:SS desde início da missão",
      "Mensagem: \"Deslocamento ao destino final\"",
      "Nenhuma foto necessária",
    ],
    mockup: "transito",
    action: "CONFIRMAR CHEGADA",
  },
  {
    number: 12,
    title: "KM FINAL",
    subtitle: "Finalização · Etapa 10/11",
    phase: "finalizacao",
    icon: Gauge,
    description: "Registro da quilometragem final no destino. Última medição de odômetro da missão.",
    details: [
      "Campo numérico para KM final",
      "Foto obrigatória do hodômetro",
      "GPS capturado para validar destino",
      "Permite calcular KM total percorrido na missão",
    ],
    mockup: "km",
    action: "CONFIRMAR KM FINAL",
    mandatory: "1 foto + KM obrigatório",
  },
  {
    number: 13,
    title: "VIATURA RETORNO",
    subtitle: "Finalização · Etapa 11/11",
    phase: "finalizacao",
    icon: Car,
    description: "Registro fotográfico final da viatura para conferência de avarias pós-missão. Compara com as fotos da saída.",
    details: [
      "Foto 1: Dianteira",
      "Foto 2: Lateral Esquerda",
      "Foto 3: Lateral Direita",
      "Foto 4: Traseira",
      "Comparação com fotos de saída para detectar danos",
    ],
    mockup: "viatura_retorno",
    action: "CONFIRMAR VIATURA RETORNO",
    mandatory: "4 fotos obrigatórias",
  },
  {
    number: 14,
    title: "MISSÃO FINALIZADA",
    subtitle: "Status: Concluída",
    phase: "concluida",
    icon: CheckCircle2,
    description: "A OS é automaticamente marcada como 'Concluída'. Todos os registros ficam salvos no sistema para auditoria.",
    details: [
      "OS muda para status 'Concluída' automaticamente",
      "Todas as fotos ficam no banco de dados",
      "GPS de cada foto registrado para auditoria",
      "KMs registrados (saída, chegada, final)",
      "Timestamp de início e fim da missão salvos",
      "Admin pode consultar todos os dados no painel",
    ],
    mockup: "finalizada",
  },
];

const phaseConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  acesso: { label: "Acesso", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  preparacao: { label: "Preparação", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  checkout: { label: "Check-out", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  transito: { label: "Em Trânsito", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  checkin: { label: "Check-in", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  execucao: { label: "Execução", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  finalizacao: { label: "Finalização", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  concluida: { label: "Concluída", color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
};

function PhoneMockup({ step }: { step: typeof steps[0] }) {
  const { user } = useAuth();
  const isVigilante = user?.role === "funcionario";
  const phase = phaseConfig[step.phase];

  return (
    <div className="w-full max-w-[280px] mx-auto" data-testid={`mockup-step-${step.number}`}>
      <div className="rounded-[2rem] border-2 border-neutral-700 bg-neutral-950 overflow-hidden shadow-2xl shadow-black/40">
        <div className="bg-neutral-950 pt-2 pb-0 px-6">
          <div className="w-20 h-1 bg-neutral-700 rounded-full mx-auto" />
        </div>

        <div className="bg-neutral-900 mx-1 mt-2 rounded-t-2xl overflow-hidden">
          <div className="bg-white px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <img src={logoSrc} alt="" className="w-4 h-4 object-contain rounded-sm" />
              <span className="text-[9px] font-black text-neutral-900 uppercase tracking-widest">Torres</span>
            </div>
            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${phase.bg} ${phase.color}`}>
              {phase.label}
            </span>
          </div>

          <div className="p-3 min-h-[260px] flex flex-col justify-center bg-neutral-900">
            {step.mockup === "login" && (
              <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5 text-neutral-400" />
                </div>
                <p className="text-[10px] text-neutral-500 font-medium">Acesse sua conta</p>
                <div className="space-y-2 px-2">
                  <div className="h-8 bg-neutral-800 rounded-lg border border-neutral-700 flex items-center px-2.5">
                    <span className="text-[9px] text-neutral-500">E-mail</span>
                  </div>
                  <div className="h-8 bg-neutral-800 rounded-lg border border-neutral-700 flex items-center px-2.5">
                    <span className="text-[9px] text-neutral-500">Senha</span>
                  </div>
                </div>
                <div className="h-8 bg-white rounded-lg mx-2 flex items-center justify-center">
                  <span className="text-[9px] font-black text-neutral-900 uppercase tracking-wider">Entrar</span>
                </div>
              </div>
            )}

            {step.mockup === "aguardando" && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="text-center">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mx-auto mb-0.5">
                      <Users className="w-4 h-4 text-neutral-900" />
                    </div>
                    <p className="text-[8px] font-bold text-white">Carlos S.</p>
                    <p className="text-[7px] text-neutral-500">Agente 1</p>
                  </div>
                  <span className="text-neutral-600 text-[10px]">+</span>
                  <div className="text-center">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center mx-auto mb-0.5">
                      <Users className="w-4 h-4 text-neutral-900" />
                    </div>
                    <p className="text-[8px] font-bold text-white">Roberto S.</p>
                    <p className="text-[7px] text-neutral-500">Agente 2</p>
                  </div>
                </div>
                <div className="bg-neutral-800/80 rounded-lg border border-neutral-700/50 p-2 text-[9px] space-y-0.5 text-neutral-400">
                  {!isVigilante && <p><span className="text-white font-semibold">Cliente:</span> Torres Vigilância</p>}
                  <p><span className="text-white font-semibold">OS:</span> OS-2026-001</p>
                  <p><span className="text-white font-semibold">Viatura:</span> RIO2A34 · Hilux SW4</p>
                </div>
                <div className="h-8 bg-white rounded-lg flex items-center justify-center gap-1.5">
                  <span className="text-[9px] font-black text-neutral-900 uppercase tracking-wider">Iniciar Check-Out</span>
                  <ArrowRight className="w-3 h-3 text-neutral-900" />
                </div>
              </div>
            )}

            {step.mockup === "armamento" && (
              <div className="space-y-2">
                <div className="text-center mb-1">
                  <Crosshair className="w-5 h-5 text-neutral-500 mx-auto" />
                  <p className="text-[9px] text-neutral-500 mt-1">Fotografe o armamento</p>
                </div>
                {["Pistola 1", "Pistola 2", "Espingarda 12"].map((label, i) => (
                  <div key={i} className={`h-8 rounded-lg border flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-wide transition-all ${i === 0 ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-neutral-700 bg-neutral-800 text-neutral-400"}`}>
                    {i === 0 ? <CheckCircle2 className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
                    {label}
                  </div>
                ))}
                <div className="h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center mt-1">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Confirmar Armamento</span>
                </div>
              </div>
            )}

            {(step.mockup === "viatura" || step.mockup === "viatura_retorno") && (
              <div className="space-y-2">
                <div className="text-center mb-1">
                  <Car className="w-5 h-5 text-neutral-500 mx-auto" />
                  <p className="text-[9px] text-neutral-500 mt-1">
                    {step.mockup === "viatura" ? "Fotografe a viatura" : "Viatura no retorno"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {["Dianteira", "Lat. Esq.", "Lat. Dir.", "Traseira"].map((label, i) => (
                    <div key={i} className="h-8 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center gap-1 text-[8px] font-bold text-neutral-400 uppercase">
                      <Camera className="w-2.5 h-2.5" /> {label}
                    </div>
                  ))}
                </div>
                <div className="h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center mt-1">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">
                    {step.mockup === "viatura" ? "Confirmar Viatura" : "Confirmar Retorno"}
                  </span>
                </div>
              </div>
            )}

            {step.mockup === "km" && (
              <div className="space-y-2.5">
                <div className="text-center mb-1">
                  <Gauge className="w-5 h-5 text-neutral-500 mx-auto" />
                  <p className="text-[9px] text-neutral-500 mt-1">Registre o hodômetro</p>
                </div>
                <div className="h-10 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center">
                  <span className="text-base font-mono font-bold text-white tracking-widest">45.230</span>
                  <span className="text-[8px] text-neutral-500 ml-1.5">km</span>
                </div>
                <div className="h-8 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center gap-1.5 text-[9px] font-bold text-neutral-400 uppercase">
                  <Camera className="w-3 h-3" /> Foto do Hodômetro
                </div>
                <div className="h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-[9px] font-black text-neutral-900 uppercase tracking-wider">
                    {step.number === 5 ? "Liberar Viagem" : "Confirmar"}
                  </span>
                </div>
              </div>
            )}

            {step.mockup === "transito" && (
              <div className="text-center space-y-3 py-2">
                <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center mx-auto animate-pulse">
                  <Car className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white uppercase tracking-wider">Em deslocamento</p>
                  <p className="text-[8px] text-neutral-500 mt-0.5">Confirmem a chegada ao destino</p>
                </div>
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg py-1.5 px-4 inline-block">
                  <p className="font-mono text-sm font-bold text-white tracking-wider">00:42:15</p>
                </div>
                <div className="h-8 bg-white rounded-lg flex items-center justify-center mx-2">
                  <span className="text-[9px] font-black text-neutral-900 uppercase tracking-wider">Confirmar Chegada</span>
                </div>
              </div>
            )}

            {step.mockup === "escoltado" && (
              <div className="space-y-2">
                <div className="text-center mb-1">
                  <Truck className="w-5 h-5 text-neutral-500 mx-auto" />
                  <p className="text-[9px] text-neutral-500 mt-1">Fotografe o veículo escoltado</p>
                </div>
                {["Frente do Caminhão", "Traseira do Caminhão"].map((label, i) => (
                  <div key={i} className="h-8 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center gap-1.5 text-[9px] font-bold text-neutral-400 uppercase">
                    <Camera className="w-3 h-3" /> {label}
                  </div>
                ))}
                <div className="h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center mt-1">
                  <span className="text-[9px] font-bold text-neutral-500 uppercase">Confirmar Veículo</span>
                </div>
              </div>
            )}

            {step.mockup === "motorista" && (
              <div className="space-y-2.5">
                <div className="text-center mb-1">
                  <User className="w-5 h-5 text-neutral-500 mx-auto" />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-neutral-500 uppercase mb-1 tracking-wider">Nome do Motorista</p>
                  <div className="h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center px-2.5">
                    <span className="text-[9px] text-neutral-500">José da Silva</span>
                  </div>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-neutral-500 uppercase mb-1 tracking-wider">Placa do Veículo</p>
                  <div className="h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center">
                    <span className="text-[10px] font-mono font-bold text-white tracking-widest">ABC1D23</span>
                  </div>
                </div>
                <div className="h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-[9px] font-black text-neutral-900 uppercase tracking-wider">Salvar e Avançar</span>
                </div>
              </div>
            )}

            {step.mockup === "iniciar" && (
              <div className="text-center space-y-3 py-2">
                <div className="w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto">
                  <Siren className="w-7 h-7 text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-wider">Pronto para iniciar?</p>
                  <p className="text-[8px] text-neutral-500 mt-0.5">O sistema registrará o horário exato</p>
                </div>
                <div className="bg-neutral-800/80 rounded-lg border border-neutral-700/50 p-2 text-[9px] space-y-0.5 text-left text-neutral-400">
                  <p><span className="text-white font-semibold">Motorista:</span> José da Silva</p>
                  <p><span className="text-white font-semibold">Placa:</span> XYZ4H56</p>
                </div>
                <div className="h-8 bg-red-500 rounded-lg flex items-center justify-center mx-2">
                  <span className="text-[9px] font-black text-white uppercase tracking-wider">Iniciar Missão</span>
                </div>
              </div>
            )}

            {step.mockup === "finalizada" && (
              <div className="text-center space-y-3 py-2">
                <div className="w-14 h-14 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase tracking-wider">Missão Finalizada</p>
                  <p className="text-[8px] text-neutral-500 mt-0.5">Todas as etapas concluídas</p>
                </div>
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg py-2 px-4">
                  <p className="text-[8px] text-neutral-500 uppercase mb-0.5">Tempo de Missão</p>
                  <p className="font-mono text-base font-bold text-white tracking-wider">02:34:12</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-neutral-950 py-2 px-6">
          <div className="w-24 h-1 bg-neutral-700 rounded-full mx-auto" />
        </div>
      </div>
    </div>
  );
}

function TimelineConnector() {
  return (
    <div className="flex justify-center py-1">
      <div className="w-px h-8 bg-gradient-to-b from-neutral-700 to-neutral-800" />
    </div>
  );
}

export default function GuiaMissaoPage() {
  const { user } = useAuth();
  const isVigilante = user?.role === "funcionario";
  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto pb-20 px-4" data-testid="guia-missao-page">
        <div className="text-center mb-12 pt-6">
          <div className="inline-flex items-center gap-3 mb-5">
            <img src={logoSrc} alt="Torres" className="w-10 h-10 object-contain rounded" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-[0.2em] mb-2" data-testid="text-guia-title">
            Guia Operacional
          </h1>
          <p className="text-sm font-semibold text-neutral-500 uppercase tracking-[0.15em]">
            Fluxo Digital — Escolta Armada
          </p>
          <p className="text-xs text-neutral-600 mt-3 max-w-md mx-auto leading-relaxed">
            Passo a passo completo do sistema de gestão de missões para os vigilantes da Torres Vigilância Patrimonial.
          </p>
        </div>

        <div className="mb-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: "14", label: "Etapas", icon: Shield },
            { value: "18", label: "Fotos Totais", icon: Camera },
            { value: "3", label: "Leituras KM", icon: Gauge },
            { value: "GPS", label: "Em Cada Foto", icon: MapPin },
          ].map((stat) => (
            <div key={stat.label} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}>
              <stat.icon className="w-4 h-4 text-neutral-600 mx-auto mb-2" />
              <p className="text-xl font-black text-white">{stat.value}</p>
              <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-12 bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-white mb-0.5">Sincronização em Tempo Real</p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Ambos os agentes veem o mesmo estado da missão em tempo real. Qualquer alteração feita por um agente aparece no celular do outro em até 5 segundos.
            </p>
          </div>
        </div>

        <div className="space-y-0">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const phase = phaseConfig[step.phase];
            return (
              <div key={step.number} data-testid={`guia-step-${step.number}`}>
                {idx > 0 && <TimelineConnector />}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-neutral-800">
                    <div className={`w-7 h-7 rounded-lg ${phase.bg} ${phase.border} border flex items-center justify-center shrink-0`}>
                      <span className={`text-xs font-black ${phase.color}`}>{step.number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider truncate">{step.title}</h3>
                      <p className="text-[10px] text-neutral-500">{step.subtitle}</p>
                    </div>
                    <Icon className="w-4 h-4 text-neutral-600 shrink-0" />
                  </div>

                  <div className="p-5">
                    <div className="grid md:grid-cols-[1fr,280px] gap-6 items-start">
                      <div>
                        <p className="text-[13px] text-neutral-300 leading-relaxed mb-4">
                          {isVigilante ? step.description.replace(/,?\s*cliente/gi, '').replace(/cliente,?\s*/gi, '') : step.description}
                        </p>

                        <div className="space-y-1.5">
                          {step.details.filter(d => !isVigilante || !d.toLowerCase().includes("cliente")).map((detail, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <ChevronRight className="w-3 h-3 text-neutral-600 mt-0.5 shrink-0" />
                              <p className="text-[11px] text-neutral-500 leading-relaxed">{detail}</p>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-4">
                          {step.mandatory && (
                            <div className={`inline-flex items-center gap-1.5 ${phase.bg} ${phase.border} border rounded-md px-2.5 py-1`}>
                              <Lock className="w-2.5 h-2.5" />
                              <span className={`text-[9px] font-bold uppercase tracking-wider ${phase.color}`}>{step.mandatory}</span>
                            </div>
                          )}
                          {step.action && (
                            <div className="inline-flex items-center gap-1.5 bg-white/5 border border-neutral-700 rounded-md px-2.5 py-1">
                              <ArrowRight className="w-2.5 h-2.5 text-neutral-400" />
                              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">{step.action}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <PhoneMockup step={step} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-16 border border-neutral-800 rounded-xl p-8 text-center bg-neutral-900/50">
          <img src={logoSrc} alt="Torres" className="w-10 h-10 object-contain mx-auto mb-4 rounded" />
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-1">
            Torres Vigilância Patrimonial
          </h3>
          <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-4">
            CNPJ 36.982.392/0001-89
          </p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
            Sistema de gestão de missões com documentação fotográfica obrigatória, rastreamento GPS e sincronização em tempo real entre agentes.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
