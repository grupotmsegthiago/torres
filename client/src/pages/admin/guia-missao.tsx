import AdminLayout from "@/components/admin/layout";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";
import {
  Shield, Camera, Car, Clock, Truck, User, Siren,
  CheckCircle2, ChevronRight, Crosshair, Users, MapPin,
  ArrowDown, Smartphone, Lock, Eye,
} from "lucide-react";

const steps = [
  {
    number: 1,
    title: "LOGIN DO AGENTE",
    subtitle: "Acesso ao sistema",
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
    subtitle: "Tela inicial — Status: Aguardando",
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
    action: "Botão: INICIAR CHECK-OUT",
  },
  {
    number: 3,
    title: "CONFERÊNCIA DE ARMAMENTO",
    subtitle: "Check-out — Etapa 1 de 11",
    icon: Crosshair,
    description: "O agente fotografa obrigatoriamente todo o armamento antes de sair da base. Sem as 3 fotos, não é possível avançar.",
    details: [
      "Foto 1: Pistola 1 — registro visual da arma",
      "Foto 2: Pistola 2 — registro visual da segunda arma",
      "Foto 3: Espingarda 12 — registro visual da espingarda",
      "GPS capturado automaticamente em cada foto",
      "Cada foto é comprimida antes do envio (economia de dados)",
    ],
    mockup: "armamento",
    action: "Botão: CONFIRMAR ARMAMENTO",
    mandatory: "3 fotos obrigatórias",
  },
  {
    number: 4,
    title: "CHECK-OUT DA VIATURA",
    subtitle: "Check-out — Etapa 2 de 11",
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
    action: "Botão: CONFIRMAR VIATURA",
    mandatory: "4 fotos obrigatórias",
  },
  {
    number: 5,
    title: "KM DE SAÍDA",
    subtitle: "Check-out — Etapa 3 de 11",
    icon: Clock,
    description: "O agente registra a quilometragem de saída com foto do hodômetro e digitação do valor.",
    details: [
      "Campo numérico para digitar o KM atual",
      "Foto obrigatória do hodômetro do veículo",
      "GPS capturado para registrar local de saída",
      "Ao confirmar → Toast: \"OK, Viagem Liberada!\"",
    ],
    mockup: "km",
    action: "Botão: LIBERAR VIAGEM → Toast de confirmação",
    mandatory: "1 foto + KM obrigatório",
  },
  {
    number: 6,
    title: "EM TRÂNSITO (ORIGEM)",
    subtitle: "Deslocamento — Etapa 4 de 11",
    icon: Car,
    description: "Tela de deslocamento até o cliente. O veículo animado indica que a viatura está em movimento.",
    details: [
      "Ícone de viatura com animação pulsante",
      "Mensagem: \"Deslocamento até o cliente\"",
      "Relógio em tempo real",
      "Nenhuma foto necessária nesta etapa",
    ],
    mockup: "transito",
    action: "Botão: CONFIRMAR CHEGADA",
  },
  {
    number: 7,
    title: "KM CHEGADA (CLIENTE)",
    subtitle: "Check-in — Etapa 5 de 11",
    icon: Clock,
    description: "Registro da quilometragem de chegada ao local do cliente.",
    details: [
      "Campo numérico para digitar o KM de chegada",
      "Foto obrigatória do hodômetro",
      "GPS capturado para validar localização",
      "Diferença de KM calculável (saída vs chegada)",
    ],
    mockup: "km",
    action: "Botão: CONFIRMAR KM CHEGADA",
    mandatory: "1 foto + KM obrigatório",
  },
  {
    number: 8,
    title: "VEÍCULO ESCOLTADO",
    subtitle: "Check-in — Etapa 6 de 11",
    icon: Truck,
    description: "Registro fotográfico do caminhão ou veículo que será escoltado, documentando frente e traseira.",
    details: [
      "Foto 1: Frente do Caminhão — com placa visível",
      "Foto 2: Traseira do Caminhão — com placa visível",
      "Identifica visualmente o veículo escoltado",
      "GPS capturado em cada foto",
    ],
    mockup: "escoltado",
    action: "Botão: CONFIRMAR VEÍCULO ESCOLTADO",
    mandatory: "2 fotos obrigatórias",
  },
  {
    number: 9,
    title: "DADOS DO MOTORISTA",
    subtitle: "Check-in — Etapa 7 de 11",
    icon: User,
    description: "O agente registra o nome do motorista do veículo escoltado e a placa do veículo. Dados salvos na OS.",
    details: [
      "Campo: Nome completo do motorista",
      "Campo: Placa do veículo escoltado (formato ABC1D23)",
      "Dados ficam vinculados permanentemente à OS",
      "Não é possível avançar sem preencher os dois campos",
    ],
    mockup: "motorista",
    action: "Botão: SALVAR E AVANÇAR",
    mandatory: "Nome + Placa obrigatórios",
  },
  {
    number: 10,
    title: "INICIAR MISSÃO",
    subtitle: "Execução — Etapa 8 de 11",
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
    action: "Botão: INICIAR MISSÃO",
  },
  {
    number: 11,
    title: "EM TRÂNSITO (DESTINO)",
    subtitle: "Execução — Etapa 9 de 11",
    icon: Car,
    description: "Deslocamento ao destino final com a escolta ativa. O cronômetro mostra o tempo de missão decorrido.",
    details: [
      "Viatura animada em deslocamento",
      "Timer mostrando HH:MM:SS desde início da missão",
      "Mensagem: \"Deslocamento ao destino final\"",
      "Nenhuma foto necessária",
    ],
    mockup: "transito",
    action: "Botão: CONFIRMAR CHEGADA",
  },
  {
    number: 12,
    title: "KM FINAL",
    subtitle: "Finalização — Etapa 10 de 11",
    icon: Clock,
    description: "Registro da quilometragem final no destino. Última medição de odômetro da missão.",
    details: [
      "Campo numérico para KM final",
      "Foto obrigatória do hodômetro",
      "GPS capturado para validar destino",
      "Permite calcular KM total percorrido na missão",
    ],
    mockup: "km",
    action: "Botão: CONFIRMAR KM FINAL",
    mandatory: "1 foto + KM obrigatório",
  },
  {
    number: 13,
    title: "VIATURA RETORNO (CHECK-OUT FINAL)",
    subtitle: "Finalização — Etapa 11 de 11",
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
    action: "Botão: CONFIRMAR VIATURA RETORNO",
    mandatory: "4 fotos obrigatórias",
  },
  {
    number: 14,
    title: "MISSÃO FINALIZADA",
    subtitle: "Status: Concluída",
    icon: CheckCircle2,
    description: "A OS é automaticamente marcada como 'Concluída'. Todos os registros (fotos, KMs, GPS, timestamps) ficam salvos no sistema.",
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

function StepMockup({ step }: { step: typeof steps[0] }) {
  const Icon = step.icon;

  return (
    <div className="w-full max-w-[320px] mx-auto">
      <div className="bg-gradient-to-b from-card to-muted rounded-2xl border border-border overflow-hidden shadow-sm">
        <div className="bg-foreground text-background px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoSrc} alt="" className="w-5 h-5 object-contain rounded" />
            <span className="text-xs font-bold uppercase tracking-wider">Torres Vigilância</span>
          </div>
          <span className="text-[10px] text-background/60">{step.subtitle.split("—")[0].trim()}</span>
        </div>

        <div className="p-4">
          {step.mockup === "login" && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <div className="h-10 bg-muted rounded-xl border border-border mx-4 flex items-center px-3">
                  <span className="text-xs text-muted-foreground">Usuário</span>
                </div>
                <div className="h-10 bg-muted rounded-xl border border-border mx-4 flex items-center px-3">
                  <span className="text-xs text-muted-foreground">Senha</span>
                </div>
              </div>
              <div className="h-10 bg-foreground rounded-xl mx-4 flex items-center justify-center">
                <span className="text-xs font-bold text-background uppercase">Entrar</span>
              </div>
            </div>
          )}

          {step.mockup === "aguardando" && (
            <div className="text-center py-3 space-y-3">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center mx-auto mb-1">
                    <Users className="w-5 h-5 text-background" />
                  </div>
                  <p className="text-[10px] font-bold">Carlos S.</p>
                  <p className="text-[8px] text-muted-foreground">Agente 1</p>
                </div>
                <span className="text-muted-foreground text-xs">+</span>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center mx-auto mb-1">
                    <Users className="w-5 h-5 text-background" />
                  </div>
                  <p className="text-[10px] font-bold">Roberto S.</p>
                  <p className="text-[8px] text-muted-foreground">Agente 2</p>
                </div>
              </div>
              <div className="bg-muted/60 rounded-lg border border-border p-2 text-[10px] space-y-1 text-left">
                <p><span className="font-bold">CLIENTE:</span> Torres Vigilância</p>
                <p><span className="font-bold">OS:</span> OS-2026-001</p>
                <p><span className="font-bold">VIATURA:</span> RIO2A34 (Hilux SW4)</p>
              </div>
              <div className="h-9 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-[10px] font-black text-background uppercase tracking-wider">Iniciar Check-Out</span>
              </div>
            </div>
          )}

          {step.mockup === "armamento" && (
            <div className="py-3 space-y-2">
              <div className="text-center mb-2">
                <Crosshair className="w-6 h-6 text-muted-foreground mx-auto" />
              </div>
              {["Pistola 1", "Pistola 2", "Espingarda 12"].map((label, i) => (
                <div key={i} className={`h-9 rounded-xl border-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase ${i === 0 ? "border-foreground bg-foreground/10" : "border-foreground bg-background"}`}>
                  {i === 0 ? <CheckCircle2 className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  {label}
                </div>
              ))}
              <div className="h-9 bg-foreground/20 rounded-full flex items-center justify-center mt-2">
                <span className="text-[10px] font-black text-muted-foreground uppercase">Confirmar Armamento</span>
              </div>
            </div>
          )}

          {step.mockup === "viatura" && (
            <div className="py-3 space-y-2">
              <div className="text-center mb-2">
                <Car className="w-6 h-6 text-muted-foreground mx-auto" />
              </div>
              {["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"].map((label, i) => (
                <div key={i} className="h-9 rounded-xl border-2 border-foreground bg-background flex items-center justify-center gap-2 text-[10px] font-bold uppercase">
                  <Camera className="w-4 h-4" /> {label}
                </div>
              ))}
              <div className="h-9 bg-foreground/20 rounded-full flex items-center justify-center mt-2">
                <span className="text-[10px] font-black text-muted-foreground uppercase">Confirmar Viatura</span>
              </div>
            </div>
          )}

          {step.mockup === "viatura_retorno" && (
            <div className="py-3 space-y-2">
              <div className="text-center mb-2">
                <Car className="w-6 h-6 text-muted-foreground mx-auto" />
              </div>
              {["Dianteira", "Lateral Esq.", "Lateral Dir.", "Traseira"].map((label, i) => (
                <div key={i} className="h-9 rounded-xl border-2 border-foreground bg-background flex items-center justify-center gap-2 text-[10px] font-bold uppercase">
                  <Camera className="w-4 h-4" /> {label}
                </div>
              ))}
              <div className="h-9 bg-foreground/20 rounded-full flex items-center justify-center mt-2">
                <span className="text-[10px] font-black text-muted-foreground uppercase">Confirmar Viatura Retorno</span>
              </div>
            </div>
          )}

          {step.mockup === "km" && (
            <div className="py-3 space-y-3">
              <div className="text-center mb-2">
                <Clock className="w-6 h-6 text-muted-foreground mx-auto" />
              </div>
              <div className="h-12 bg-background border-2 border-foreground rounded-xl flex items-center justify-center">
                <span className="text-sm font-mono font-bold text-muted-foreground">45.230</span>
              </div>
              <div className="h-9 rounded-xl border-2 border-foreground bg-background flex items-center justify-center gap-2 text-[10px] font-bold uppercase">
                <Camera className="w-4 h-4" /> Hodômetro
              </div>
              <div className="h-9 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-[10px] font-black text-background uppercase">
                  {step.number === 5 ? "Liberar Viagem" : "Confirmar"}
                </span>
              </div>
            </div>
          )}

          {step.mockup === "transito" && (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto animate-pulse">
                <Car className="w-7 h-7 text-foreground" />
              </div>
              <p className="text-xs font-bold uppercase">Em deslocamento</p>
              <p className="text-[10px] text-muted-foreground">Confirmem a chegada ao destino</p>
              <p className="font-mono text-lg font-bold">00:42:15</p>
              <div className="h-9 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-[10px] font-black text-background uppercase">Confirmar Chegada</span>
              </div>
            </div>
          )}

          {step.mockup === "escoltado" && (
            <div className="py-3 space-y-2">
              <div className="text-center mb-2">
                <Truck className="w-6 h-6 text-muted-foreground mx-auto" />
              </div>
              {["Frente Caminhão", "Traseira Caminhão"].map((label, i) => (
                <div key={i} className="h-9 rounded-xl border-2 border-foreground bg-background flex items-center justify-center gap-2 text-[10px] font-bold uppercase">
                  <Camera className="w-4 h-4" /> {label}
                </div>
              ))}
              <div className="h-9 bg-foreground/20 rounded-full flex items-center justify-center mt-2">
                <span className="text-[10px] font-black text-muted-foreground uppercase">Confirmar Veículo Escoltado</span>
              </div>
            </div>
          )}

          {step.mockup === "motorista" && (
            <div className="py-3 space-y-3">
              <div className="text-center mb-2">
                <User className="w-6 h-6 text-muted-foreground mx-auto" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Nome do Motorista</p>
                <div className="h-10 bg-background border-2 border-foreground rounded-xl flex items-center px-3">
                  <span className="text-xs text-muted-foreground">Nome completo</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Placa do Veículo</p>
                <div className="h-10 bg-background border-2 border-foreground rounded-xl flex items-center justify-center">
                  <span className="text-xs font-mono font-bold text-muted-foreground">ABC1D23</span>
                </div>
              </div>
              <div className="h-9 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-[10px] font-black text-background uppercase">Salvar e Avançar</span>
              </div>
            </div>
          )}

          {step.mockup === "iniciar" && (
            <div className="py-4 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center mx-auto shadow-lg">
                <Siren className="w-8 h-8 text-background" />
              </div>
              <p className="text-sm font-black uppercase tracking-wider">Pronto para iniciar?</p>
              <p className="text-[10px] text-muted-foreground">O sistema registrará o horário de início da escolta</p>
              <div className="bg-muted/60 rounded-lg border border-border p-2 text-[10px] space-y-1 text-left">
                <p><span className="font-bold">Motorista:</span> José da Silva</p>
                <p><span className="font-bold">Placa:</span> XYZ4H56</p>
              </div>
              <div className="h-9 bg-foreground rounded-full flex items-center justify-center">
                <span className="text-[10px] font-black text-background uppercase">Iniciar Missão</span>
              </div>
            </div>
          )}

          {step.mockup === "finalizada" && (
            <div className="py-6 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-background" />
              </div>
              <p className="text-lg font-black uppercase tracking-wider">Missão Finalizada</p>
              <p className="text-[10px] text-muted-foreground">Todas as etapas concluídas</p>
              <div className="bg-muted/60 rounded-lg border border-border px-4 py-2">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Tempo de Missão</p>
                <p className="font-mono text-lg font-bold">02:34:12</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GuiaMissaoPage() {
  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto pb-16" data-testid="guia-missao-page">
        <div className="text-center mb-10 pt-4">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src={logoSrc} alt="Torres" className="w-12 h-12 object-contain" />
            <Shield className="w-8 h-8 text-foreground" />
          </div>
          <h1 className="text-3xl font-black text-foreground uppercase tracking-wider mb-2" data-testid="text-guia-title">
            Guia Operacional
          </h1>
          <p className="text-lg font-bold text-muted-foreground uppercase tracking-wider">
            Fluxo Digital — Escolta Armada
          </p>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
            Passo a passo completo do sistema de gestão de missões para os vigilantes da Torres Vigilância Patrimonial.
          </p>
        </div>

        <div className="mb-10 bg-card rounded-2xl border border-border p-6">
          <h2 className="text-lg font-black text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5" /> Visão Geral
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-muted rounded-xl p-3 border border-border">
              <p className="text-2xl font-black text-foreground">14</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Etapas</p>
            </div>
            <div className="bg-muted rounded-xl p-3 border border-border">
              <p className="text-2xl font-black text-foreground">18</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Fotos Totais</p>
            </div>
            <div className="bg-muted rounded-xl p-3 border border-border">
              <p className="text-2xl font-black text-foreground">3</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Leituras KM</p>
            </div>
            <div className="bg-muted rounded-xl p-3 border border-border">
              <div className="flex items-center justify-center gap-1">
                <MapPin className="w-4 h-4 text-foreground" />
                <p className="text-2xl font-black text-foreground">GPS</p>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Em Cada Foto</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 bg-muted/50 rounded-xl border border-border p-3">
            <Smartphone className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground">Sincronização:</span> Ambos os agentes veem o mesmo estado da missão em tempo real. Qualquer alteração feita por um agente aparece no celular do outro em até 5 segundos.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.number} data-testid={`guia-step-${step.number}`}>
                {idx > 0 && (
                  <div className="flex justify-center py-2">
                    <ArrowDown className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="bg-card rounded-2xl border border-border overflow-hidden">
                  <div className="bg-foreground text-background px-6 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-background/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-black">{step.number}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-black uppercase tracking-wider">{step.title}</h3>
                      <p className="text-[10px] text-background/60">{step.subtitle}</p>
                    </div>
                    <Icon className="w-5 h-5 text-background/60 shrink-0" />
                  </div>

                  <div className="p-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm text-foreground mb-4">{step.description}</p>

                        <div className="space-y-2">
                          {step.details.map((detail, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <ChevronRight className="w-3 h-3 text-muted-foreground mt-1 shrink-0" />
                              <p className="text-xs text-muted-foreground">{detail}</p>
                            </div>
                          ))}
                        </div>

                        {step.mandatory && (
                          <div className="mt-3 inline-flex items-center gap-1.5 bg-muted rounded-lg border border-border px-3 py-1.5">
                            <Lock className="w-3 h-3 text-foreground" />
                            <span className="text-[10px] font-bold text-foreground uppercase">{step.mandatory}</span>
                          </div>
                        )}

                        {step.action && (
                          <div className="mt-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-foreground" />
                            <span className="text-xs font-bold text-foreground">{step.action}</span>
                          </div>
                        )}
                      </div>

                      <StepMockup step={step} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 bg-card rounded-2xl border border-border p-6 text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <img src={logoSrc} alt="Torres" className="w-8 h-8 object-contain" />
            <Shield className="w-6 h-6 text-foreground" />
          </div>
          <h3 className="text-lg font-black text-foreground uppercase tracking-wider mb-2">
            Torres Vigilância Patrimonial
          </h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
            CNPJ 36.982.392/0001-89
          </p>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Sistema de gestão de missões com documentação fotográfica obrigatória, rastreamento GPS e sincronização em tempo real entre agentes.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
