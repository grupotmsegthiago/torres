import AdminLayout from "@/components/admin/layout";
import { useAuth } from "@/hooks/use-auth";
import logoSrc from "@assets/WhatsApp_Image_2026-03-02_at_14.32.24_(1)_1772473398910.jpeg";
import { useState } from "react";
import {
  Shield, Camera, Car, Truck, User, Siren,
  CheckCircle2, ChevronRight, Crosshair, Users, MapPin,
  Smartphone, Lock, ArrowRight, Gauge, Route,
  Fuel, Receipt, AlertTriangle, Clock, MessageCircle,
  UserCircle, ClipboardCheck, Menu, Home, FileText,
  Droplets, CircleDollarSign, Briefcase, CalendarDays,
  Eye, Bell, Wifi, ChevronDown, ChevronUp, BookOpen,
} from "lucide-react";

type Section = "home" | "missao" | "abastecimento" | "ponto_rh" | "ponto_oper" | "pedagio" | "ocorrencia" | "meu_rh" | "checklist" | "chat" | "perfil";

interface GuideSection {
  id: Section;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  steps: {
    number: number;
    title: string;
    subtitle: string;
    icon: any;
    description: string;
    details: string[];
    mandatory?: string;
    action?: string;
  }[];
}

const sections: GuideSection[] = [
  {
    id: "home",
    title: "TELA INICIAL",
    subtitle: "Navegação do Aplicativo",
    icon: Home,
    color: "bg-neutral-900",
    steps: [
      {
        number: 1,
        title: "LOGIN E SELFIE",
        subtitle: "Acesso ao sistema",
        icon: Lock,
        description: "O vigilante acessa o sistema com seu e-mail e senha pessoal. Após o primeiro login do dia, deve capturar uma selfie obrigatória com câmera frontal antes de acessar qualquer funcionalidade.",
        details: [
          "Login com e-mail e senha cadastrados pelo admin",
          "Selfie obrigatória com câmera frontal (GPS e horário registrados automaticamente)",
          "Selfie fica registrada para auditoria e controle de presença",
          "Após selfie aprovada, a tela inicial é carregada",
        ],
        mandatory: "Selfie obrigatória",
        action: "ENTRAR",
      },
      {
        number: 2,
        title: "TELA PRINCIPAL",
        subtitle: "Menu de funcionalidades",
        icon: Menu,
        description: "A tela principal mostra a missão ativa (se houver) e 8 botões de acesso rápido às funcionalidades do sistema.",
        details: [
          "Card de Missão Ativa — acesso direto à missão em andamento (se houver)",
          "Ponto RH — registro de ponto com geofencing",
          "Ponto Operacional — entrada/saída de serviço operacional",
          "Abastecimento — registro de combustível com fotos e nota fiscal",
          "Pedágio — registro de pedágios com comprovante",
          "Ocorrência — relato de incidentes durante a missão",
          "Meu RH — holerite, dados pessoais e documentos",
          "Checklist — acompanhamento visual das etapas da missão",
          "Perfil — dados do usuário e opção de sair do sistema",
        ],
      },
    ],
  },
  {
    id: "missao",
    title: "FLUXO DA MISSÃO",
    subtitle: "Escolta Armada — 18 Etapas",
    icon: Shield,
    color: "bg-neutral-900",
    steps: [
      {
        number: 1,
        title: "DADOS DA MISSÃO",
        subtitle: "Status: Aguardando",
        icon: Shield,
        description: "O agente visualiza todos os dados da missão antes de iniciar: equipe, viatura e informações da OS.",
        details: [
          "Foto e nome dos 2 agentes (Agente 1 e Agente 2)",
          "Placa e modelo da viatura designada",
          "Número da OS e agendamento",
          "Descrição do serviço a ser executado",
          "Relógio em tempo real",
        ],
        action: "INICIAR CHECK-OUT",
      },
      {
        number: 2,
        title: "ACEITE DA MISSÃO",
        subtitle: "Confirmação obrigatória",
        icon: CheckCircle2,
        description: "Antes de iniciar, o agente precisa aceitar a missão. O sistema registra quem aceitou e quando. Se recusar, a OS é automaticamente encerrada como 'recusada'.",
        details: [
          "Botão 'Aceitar Missão' para confirmar participação",
          "Timestamp de aceite registrado no servidor",
          "Se recusar: OS automaticamente fechada, veículo e armamento liberados",
          "Tempo limite de aceite configurável (expira automaticamente)",
        ],
        mandatory: "Aceite obrigatório",
        action: "ACEITAR MISSÃO",
      },
      {
        number: 3,
        title: "CONFERÊNCIA DE ARMAMENTO",
        subtitle: "Check-out · Etapa 1/15",
        icon: Crosshair,
        description: "O agente fotografa obrigatoriamente todo o armamento antes de sair da base. Sem as 3 fotos, não é possível avançar.",
        details: [
          "Foto 1: Pistola 1 — registro visual da arma",
          "Foto 2: Pistola 2 — registro visual da segunda arma",
          "Foto 3: Espingarda 12 — registro visual da espingarda",
          "GPS capturado automaticamente em cada foto",
          "Cada foto é comprimida antes do envio",
        ],
        mandatory: "3 fotos obrigatórias",
        action: "CONFIRMAR ARMAMENTO",
      },
      {
        number: 4,
        title: "CHECK-OUT DA VIATURA",
        subtitle: "Check-out · Etapa 2/15",
        icon: Car,
        description: "Registro fotográfico completo da viatura em 4 ângulos para documentar o estado do veículo antes da saída. A IA analisa automaticamente cada foto.",
        details: [
          "Foto 1: Dianteira — frente do veículo",
          "Foto 2: Lateral Esquerda",
          "Foto 3: Lateral Direita",
          "Foto 4: Traseira — parte de trás",
          "IA verifica placa, condição e ângulo de cada foto",
          "Serve como prova do estado do veículo na saída",
        ],
        mandatory: "4 fotos obrigatórias + IA",
        action: "CONFIRMAR VIATURA",
      },
      {
        number: 5,
        title: "KM DE SAÍDA",
        subtitle: "Check-out · Etapa 3/15",
        icon: Gauge,
        description: "O agente registra a quilometragem de saída com foto do hodômetro e digitação do valor.",
        details: [
          "Campo numérico para digitar o KM atual",
          "Foto obrigatória do hodômetro do veículo",
          "GPS capturado para registrar local de saída",
          "Ao confirmar → 'OK, Viagem Liberada!'",
        ],
        mandatory: "1 foto + KM obrigatório",
        action: "LIBERAR VIAGEM",
      },
      {
        number: 6,
        title: "EM TRÂNSITO (ORIGEM)",
        subtitle: "Deslocamento · Etapa 4/15",
        icon: Route,
        description: "Tela de deslocamento até o cliente. O veículo animado indica que a viatura está em movimento.",
        details: [
          "Ícone de viatura com animação pulsante",
          "Mensagem: 'Deslocamento até o cliente'",
          "Relógio em tempo real",
          "Nenhuma foto necessária nesta etapa",
        ],
        action: "CONFIRMAR CHEGADA",
      },
      {
        number: 7,
        title: "KM CHEGADA (CLIENTE)",
        subtitle: "Check-in · Etapa 5/15",
        icon: Gauge,
        description: "Registro da quilometragem de chegada ao local do cliente.",
        details: [
          "Campo numérico para digitar o KM de chegada",
          "Foto obrigatória do hodômetro",
          "GPS capturado para validar localização",
          "Diferença de KM calculável (saída vs chegada)",
        ],
        mandatory: "1 foto + KM obrigatório",
        action: "CONFIRMAR KM CHEGADA",
      },
      {
        number: 8,
        title: "VEÍCULO ESCOLTADO",
        subtitle: "Check-in · Etapa 6/15",
        icon: Truck,
        description: "Registro fotográfico do caminhão ou veículo que será escoltado, documentando frente e traseira.",
        details: [
          "Foto 1: Frente do Caminhão — com placa visível",
          "Foto 2: Traseira do Caminhão — com placa visível",
          "Identifica visualmente o veículo escoltado",
          "IA verifica placa automaticamente",
          "GPS capturado em cada foto",
        ],
        mandatory: "2 fotos obrigatórias",
        action: "CONFIRMAR VEÍCULO ESCOLTADO",
      },
      {
        number: 9,
        title: "DADOS DO MOTORISTA",
        subtitle: "Check-in · Etapa 7/15",
        icon: User,
        description: "O agente registra o nome do motorista do veículo escoltado e a placa do veículo. Dados salvos na OS.",
        details: [
          "Campo: Nome completo do motorista",
          "Campo: Placa do veículo escoltado (formato ABC1D23)",
          "Dados ficam vinculados permanentemente à OS",
          "Não é possível avançar sem preencher os dois campos",
        ],
        mandatory: "Nome + Placa obrigatórios",
        action: "SALVAR E AVANÇAR",
      },
      {
        number: 10,
        title: "INICIAR MISSÃO",
        subtitle: "Execução · Etapa 8/15",
        icon: Siren,
        description: "Momento crucial: o agente confirma o início da escolta. O sistema registra o timestamp exato e inicia o cronômetro da missão.",
        details: [
          "Ícone grande de sirene no centro da tela",
          "Resumo dos dados do motorista e placa escoltada",
          "Ao confirmar: timestamp registrado no servidor",
          "Cronômetro de missão inicia a contagem",
          "A partir daqui, o timer mostra tempo decorrido",
        ],
        action: "INICIAR MISSÃO",
      },
      {
        number: 11,
        title: "EM TRÂNSITO (DESTINO)",
        subtitle: "Execução · Etapa 9/15",
        icon: Route,
        description: "Deslocamento ao destino final com a escolta ativa. O cronômetro mostra o tempo de missão decorrido.",
        details: [
          "Viatura animada em deslocamento",
          "Timer mostrando HH:MM:SS desde início da missão",
          "Mensagem: 'Deslocamento ao destino final'",
          "Nenhuma foto necessária",
        ],
        action: "CONFIRMAR CHEGADA",
      },
      {
        number: 12,
        title: "KM FINAL",
        subtitle: "Finalização · Etapa 10/15",
        icon: Gauge,
        description: "Registro da quilometragem final no destino. Última medição de odômetro da missão.",
        details: [
          "Campo numérico para KM final",
          "Foto obrigatória do hodômetro",
          "GPS capturado para validar destino",
          "Permite calcular KM total percorrido na missão",
        ],
        mandatory: "1 foto + KM obrigatório",
        action: "CONFIRMAR KM FINAL",
      },
      {
        number: 13,
        title: "VIATURA RETORNO",
        subtitle: "Finalização · Etapa 11/15",
        icon: Car,
        description: "Registro fotográfico final da viatura para conferência de avarias pós-missão. Compara com as fotos da saída.",
        details: [
          "Foto 1: Dianteira",
          "Foto 2: Lateral Esquerda",
          "Foto 3: Lateral Direita",
          "Foto 4: Traseira",
          "IA compara com fotos de saída para detectar danos",
        ],
        mandatory: "4 fotos obrigatórias + IA",
        action: "CONFIRMAR VIATURA RETORNO",
      },
      {
        number: 14,
        title: "ENTREGAS FINALIZADAS",
        subtitle: "Operação · Etapa 12/15",
        icon: CheckCircle2,
        description: "Todas as entregas foram realizadas. O agente agora pode indicar que está em prontidão para encerramento logístico.",
        details: [
          "Confirmação visual de conclusão das entregas",
          "Timer da missão continua ativo",
          "Botão 'Em Prontidão' para prosseguir",
        ],
        action: "EM PRONTIDÃO",
      },
      {
        number: 15,
        title: "EM PRONTIDÃO",
        subtitle: "Operação · Etapa 13/15",
        icon: Shield,
        description: "A equipe permanece em prontidão aguardando liberação. Quando autorizado, inicia o retorno à base.",
        details: [
          "Status visual verde pulsante indicando disponibilidade",
          "Equipe disponível no local, aguardando liberação",
          "Botão 'Retorno à Base' quando liberados",
        ],
        action: "RETORNO À BASE",
      },
      {
        number: 16,
        title: "RETORNO À BASE",
        subtitle: "Logístico · Etapa 14/15",
        icon: Route,
        description: "A equipe está em deslocamento de volta à base. Ao chegar, registra o encerramento logístico da viatura.",
        details: [
          "Animação de navegação indicando deslocamento",
          "Timer da missão visível",
          "Botão 'Cheguei na Base' ao chegar",
        ],
        action: "CHEGUEI NA BASE",
      },
      {
        number: 17,
        title: "CHEGADA NA BASE",
        subtitle: "Logístico · Etapa 15/15",
        icon: MapPin,
        description: "Encerramento logístico completo: checklist da viatura, fotos, KM de retorno e status de limpeza do veículo.",
        details: [
          "Checklist obrigatório: estepe, chave de roda, macaco, triângulo",
          "5 fotos: 4 ângulos da viatura + hodômetro",
          "Campo numérico para KM de retorno",
          "Status de limpeza: Limpa ou Suja",
          "Se suja: campo obrigatório para descrever o motivo",
          "Dados salvos e validados antes de avançar",
        ],
        mandatory: "Checklist + 5 fotos + KM + Limpeza",
        action: "ENCERRAR OPERAÇÃO",
      },
      {
        number: 18,
        title: "OPERAÇÃO ENCERRADA",
        subtitle: "Status: Concluída",
        icon: CheckCircle2,
        description: "A OS é automaticamente marcada como 'Concluída'. Kit de armamento liberado. Todos os registros ficam salvos para auditoria.",
        details: [
          "OS muda para status 'Concluída' automaticamente",
          "Kit de armamento é liberado automaticamente",
          "Todas as fotos ficam no banco de dados",
          "GPS de cada foto registrado para auditoria",
          "KMs registrados (saída, chegada, final, retorno)",
          "Status de limpeza da viatura registrado",
          "Timestamp de início e fim da missão salvos",
          "Admin pode consultar todos os dados no painel",
        ],
      },
    ],
  },
  {
    id: "abastecimento",
    title: "ABASTECIMENTO",
    subtitle: "Registro de Combustível",
    icon: Fuel,
    color: "bg-amber-600",
    steps: [
      {
        number: 1,
        title: "AVISO CNPJ",
        subtitle: "Nota Fiscal obrigatória",
        icon: AlertTriangle,
        description: "Ao abrir o módulo de abastecimento, um aviso amarelo é exibido permanentemente no topo da tela.",
        details: [
          "⚠️ ATENÇÃO: Solicitar a nota do abastecimento no CNPJ — 36.982.392/0001-89",
          "Este aviso aparece em todas as etapas do abastecimento",
          "A nota fiscal DEVE ser emitida para a Torres Vigilância Patrimonial",
          "Sem nota no CNPJ correto, o abastecimento pode não ser aceito",
        ],
        mandatory: "Nota no CNPJ 36.982.392/0001-89",
      },
      {
        number: 2,
        title: "SELECIONAR VIATURA",
        subtitle: "Etapa 1 — Escolha do veículo",
        icon: Car,
        description: "O agente seleciona a viatura que será abastecida. Pode filtrar pela placa para achar o veículo correto rapidamente.",
        details: [
          "Lista de todas as viaturas disponíveis",
          "Filtro por placa para busca rápida",
          "Exibe placa, modelo e marca do veículo",
          "KM atual do veículo é exibido como referência",
        ],
        action: "SELECIONAR",
      },
      {
        number: 3,
        title: "FOTO DA PLACA",
        subtitle: "Etapa 2 — Confirmação visual",
        icon: Camera,
        description: "O agente fotografa a placa da viatura para confirmar visualmente que está abastecendo o veículo correto.",
        details: [
          "Foto obrigatória da placa traseira do veículo",
          "Sistema confirma se a placa fotografada confere com a selecionada",
          "GPS capturado na foto para registrar local",
          "Foto serve como prova de identidade do veículo",
        ],
        mandatory: "1 foto da placa obrigatória",
        action: "CONFIRMAR PLACA",
      },
      {
        number: 4,
        title: "FORMULÁRIO DE ABASTECIMENTO",
        subtitle: "Etapa 3 — Dados completos",
        icon: Receipt,
        description: "Preenchimento completo dos dados do abastecimento: localização automática por GPS, tipo de combustível (com cálculo automático etanol/gasolina), litros, preço por litro e KM atual.",
        details: [
          "Localização do posto detectada automaticamente via GPS",
          "Preço da Gasolina (R$/L) — informar valor no posto",
          "Preço do Etanol (R$/L) — informar valor no posto",
          "Cálculo automático: se etanol/gasolina ≤ 70%, recomenda etanol",
          "Litros abastecidos — quantidade informada",
          "KM atual do hodômetro (campo numérico)",
          "Alerta de troca de óleo se KM ultrapassar limite",
          "Foto do hodômetro obrigatória",
          "Foto da bomba do posto obrigatória",
          "Foto do comprovante/cupom fiscal obrigatória",
        ],
        mandatory: "3 fotos + todos os campos obrigatórios",
        action: "REGISTRAR ABASTECIMENTO",
      },
      {
        number: 5,
        title: "CONFIRMAÇÃO",
        subtitle: "Registro concluído",
        icon: CheckCircle2,
        description: "Abastecimento registrado com sucesso. Os dados ficam disponíveis para o admin no módulo Frota para auditoria e validação por IA.",
        details: [
          "Tela de confirmação com ícone verde de sucesso",
          "Dados enviados ao servidor automaticamente",
          "IA valida as fotos automaticamente em background",
          "Se detectar divergência (KM incoerente, foto errada), alerta é enviado ao admin",
          "O admin visualiza tudo no módulo Frota > Abastecimento",
        ],
      },
    ],
  },
  {
    id: "ponto_rh",
    title: "PONTO RH",
    subtitle: "Registro de Ponto com Geofencing",
    icon: Clock,
    color: "bg-blue-600",
    steps: [
      {
        number: 1,
        title: "REGISTRO DE ENTRADA",
        subtitle: "Bater ponto",
        icon: Clock,
        description: "O funcionário registra entrada ou saída na folha de ponto. O sistema verifica a localização via GPS e utiliza geofencing para validar se está dentro da área permitida.",
        details: [
          "Botão grande 'Bater Ponto' no centro da tela",
          "GPS capturado automaticamente",
          "Selfie obrigatória com câmera frontal no momento do ponto",
          "GPS e horário registrados junto com a selfie",
          "Se fora da área permitida (geofencing), exibe aviso e bloqueia",
        ],
        mandatory: "Selfie + GPS obrigatórios",
        action: "BATER PONTO",
      },
      {
        number: 2,
        title: "GEOFENCING",
        subtitle: "Validação de localização",
        icon: MapPin,
        description: "Se o funcionário estiver fora da área permitida (empresa/base), o sistema bloqueia o ponto e mostra um aviso. Opção de ligar para o supervisor.",
        details: [
          "Aviso: 'Fora da Empresa — Você está fora da área autorizada'",
          "Distância do ponto permitido é exibida",
          "Botão para ligar para o supervisor em caso de dúvida",
          "Opção de dispensar o aviso (registrado como irregular)",
        ],
      },
      {
        number: 3,
        title: "HISTÓRICO",
        subtitle: "Registros anteriores",
        icon: CalendarDays,
        description: "Visualização do histórico de pontos registrados com data, horário e status (entrada/saída).",
        details: [
          "Lista cronológica de todos os pontos batidos",
          "Data e horário exatos de cada registro",
          "Tipo: Entrada ou Saída",
          "Registros acessíveis para consulta do funcionário",
        ],
      },
    ],
  },
  {
    id: "ponto_oper",
    title: "PONTO OPERACIONAL",
    subtitle: "Entrada/Saída de Serviço",
    icon: Briefcase,
    color: "bg-emerald-600",
    steps: [
      {
        number: 1,
        title: "REGISTRAR ENTRADA",
        subtitle: "Início do serviço",
        icon: Clock,
        description: "O agente registra o início do serviço operacional. Diferente do Ponto RH, este controla o tempo em operação real (em missão, em base, etc).",
        details: [
          "Botão grande verde 'Registrar Entrada'",
          "Campo opcional de observação (ex: 'Início do turno', 'Reforço noturno')",
          "Horário exato registrado no servidor",
          "Status muda para 'Em Serviço' com indicador verde",
        ],
        action: "REGISTRAR ENTRADA",
      },
      {
        number: 2,
        title: "EM SERVIÇO",
        subtitle: "Operação ativa",
        icon: Shield,
        description: "Enquanto em serviço, o painel mostra o tempo corrido e dados do turno atual. O agente encerra quando finalizar o serviço.",
        details: [
          "Indicador verde pulsante 'Em Serviço'",
          "Horário de entrada exibido",
          "Timer contando tempo desde entrada",
          "Botão vermelho 'Registrar Saída' para encerrar",
        ],
        action: "REGISTRAR SAÍDA",
      },
      {
        number: 3,
        title: "ACUMULADO DO MÊS",
        subtitle: "Resumo mensal",
        icon: CalendarDays,
        description: "Na parte inferior, o agente visualiza o acumulado de horas do mês corrente com cada registro de entrada/saída.",
        details: [
          "Total de horas trabalhadas no mês",
          "Lista de cada entrada/saída com horário e duração",
          "Cálculo automático de horas acumuladas",
          "Dados disponíveis para o RH no painel admin",
        ],
      },
    ],
  },
  {
    id: "pedagio",
    title: "PEDÁGIO",
    subtitle: "Registro de Pedágios",
    icon: CircleDollarSign,
    color: "bg-purple-600",
    steps: [
      {
        number: 1,
        title: "VALOR DO PEDÁGIO",
        subtitle: "Informar custo",
        icon: CircleDollarSign,
        description: "O agente informa o valor pago no pedágio. Pode ser informado durante a missão ou após.",
        details: [
          "Campo numérico para valor em reais (R$)",
          "Formato monetário brasileiro (ex: R$ 12,50)",
          "Valor fica vinculado à missão ativa automaticamente",
        ],
      },
      {
        number: 2,
        title: "FOTO DO COMPROVANTE",
        subtitle: "Comprovante obrigatório",
        icon: Camera,
        description: "O agente fotografa o comprovante do pedágio como prova de pagamento.",
        details: [
          "Câmera traseira é ativada automaticamente",
          "Foto do ticket/comprovante/recibo do pedágio",
          "GPS capturado para validar localização da praça de pedágio",
          "Foto comprimida antes do envio",
        ],
        mandatory: "1 foto obrigatória",
        action: "CAPTURAR FOTO",
      },
      {
        number: 3,
        title: "CONFIRMAÇÃO",
        subtitle: "Registro concluído",
        icon: CheckCircle2,
        description: "Pedágio registrado com sucesso. O valor e foto ficam vinculados à OS para auditoria e faturamento.",
        details: [
          "Tela de confirmação com dados do registro",
          "Placa da viatura vinculada automaticamente",
          "Valor contabilizado no custo da missão",
          "Admin visualiza no Relatório de OS e Financeiro",
        ],
      },
    ],
  },
  {
    id: "ocorrencia",
    title: "OCORRÊNCIA",
    subtitle: "Registro de Incidentes",
    icon: AlertTriangle,
    color: "bg-red-600",
    steps: [
      {
        number: 1,
        title: "TIPO DE OCORRÊNCIA",
        subtitle: "Classificação do incidente",
        icon: AlertTriangle,
        description: "O agente seleciona o tipo de ocorrência e descreve o que aconteceu. Pode anexar fotos como evidência.",
        details: [
          "Tipos disponíveis: Acidente, Avaria, Furto/Roubo, Pane Mecânica, Outros",
          "Campo de descrição detalhada obrigatório",
          "Até 3 fotos como evidência (opcional)",
          "GPS capturado automaticamente",
          "Vinculado à missão ativa (se houver)",
        ],
        mandatory: "Tipo + Descrição obrigatórios",
        action: "REGISTRAR OCORRÊNCIA",
      },
      {
        number: 2,
        title: "HISTÓRICO",
        subtitle: "Ocorrências anteriores",
        icon: FileText,
        description: "Aba 'Histórico' mostra todas as ocorrências registradas pelo agente com data, tipo e status.",
        details: [
          "Lista cronológica de todas as ocorrências",
          "Data, tipo e status de cada ocorrência",
          "Fotos anexadas podem ser visualizadas",
          "Admin recebe notificação de cada nova ocorrência",
        ],
      },
    ],
  },
  {
    id: "meu_rh",
    title: "MEU RH",
    subtitle: "Dados Pessoais e Holerite",
    icon: UserCircle,
    color: "bg-indigo-600",
    steps: [
      {
        number: 1,
        title: "DADOS PESSOAIS",
        subtitle: "Informações do funcionário",
        icon: User,
        description: "O funcionário visualiza seus dados pessoais cadastrados no sistema: nome, CPF, função, data de admissão, etc.",
        details: [
          "Nome completo e CPF",
          "Cargo/função e departamento",
          "Data de admissão",
          "Contatos (telefone e e-mail)",
          "CNH e categoria (se aplicável)",
        ],
      },
      {
        number: 2,
        title: "HOLERITE",
        subtitle: "Demonstrativo de pagamento",
        icon: Receipt,
        description: "Acesso aos holerites/contracheques mensais. Demonstrativo detalhado de proventos e descontos.",
        details: [
          "Seleção de mês/ano para consulta",
          "Salário base e adicionais (periculosidade, insalubridade)",
          "Horas extras e adicional noturno",
          "Descontos (INSS, IRRF, VT, VR, faltas)",
          "Valor líquido a receber",
          "Opção de baixar o PDF do holerite",
        ],
      },
      {
        number: 3,
        title: "DOCUMENTOS",
        subtitle: "Documentação digitalizada",
        icon: FileText,
        description: "Visualização de documentos como contratos, termos e comunicados da empresa.",
        details: [
          "Contratos e aditivos",
          "Termos de responsabilidade",
          "Comunicados gerais da empresa",
          "Status de documentos pendentes (se houver)",
        ],
      },
    ],
  },
  {
    id: "checklist",
    title: "CHECKLIST",
    subtitle: "Acompanhamento da Missão",
    icon: ClipboardCheck,
    color: "bg-teal-600",
    steps: [
      {
        number: 1,
        title: "VISÃO GERAL",
        subtitle: "Progresso das etapas",
        icon: ClipboardCheck,
        description: "O checklist mostra visualmente o progresso de todas as etapas da missão ativa. Cada etapa mostra se foi concluída, está em andamento ou pendente.",
        details: [
          "Lista de todas as etapas com status visual (✅ concluída, 🔵 em andamento, ⚪ pendente)",
          "Etapa atual destacada em azul",
          "Barra de progresso geral no topo",
          "Contagem de etapas concluídas/total",
        ],
      },
      {
        number: 2,
        title: "INSPEÇÃO IA",
        subtitle: "Resultado da análise automática",
        icon: Eye,
        description: "O checklist mostra o resultado da inspeção por IA para cada foto de viatura e escoltado. A IA analisa placa, ângulo e condição do veículo automaticamente.",
        details: [
          "Status IA por etapa: ✅ Aprovado, ⚠️ Divergência, 🔄 Analisando",
          "Resumo com contadores: aprovadas / divergentes / analisando",
          "Atualiza automaticamente a cada 15 segundos",
          "Em caso de divergência, alerta por e-mail é enviado ao admin",
        ],
      },
    ],
  },
  {
    id: "chat",
    title: "CHAT",
    subtitle: "Comunicação em Tempo Real",
    icon: MessageCircle,
    color: "bg-sky-600",
    steps: [
      {
        number: 1,
        title: "CONVERSAS",
        subtitle: "Mensagens diretas e grupos",
        icon: MessageCircle,
        description: "Chat em tempo real entre agentes e administração. Permite mensagens diretas e criação de grupos para coordenação de operações.",
        details: [
          "Lista de conversas ordenada por mais recente",
          "Indicador de mensagens não lidas",
          "Conversas diretas (1 para 1) com outros usuários",
          "Grupos de conversa para equipes e operações",
          "Criação de novos grupos com nome e participantes",
        ],
      },
      {
        number: 2,
        title: "ENVIO DE MENSAGENS",
        subtitle: "Texto e localização",
        icon: MapPin,
        description: "Envio de mensagens de texto e compartilhamento de localização em tempo real via GPS.",
        details: [
          "Campo de texto para mensagens",
          "Botão de localização para compartilhar GPS em tempo real",
          "Mensagens entregues em tempo real via WebSocket",
          "Indicador de presença online dos participantes",
          "Histórico de mensagens preservado",
        ],
        action: "ENVIAR",
      },
    ],
  },
  {
    id: "perfil",
    title: "PERFIL",
    subtitle: "Dados do Usuário",
    icon: UserCircle,
    color: "bg-neutral-700",
    steps: [
      {
        number: 1,
        title: "INFORMAÇÕES DO PERFIL",
        subtitle: "Dados pessoais",
        icon: UserCircle,
        description: "Visualização dos dados do usuário logado: nome, e-mail, função e foto do perfil.",
        details: [
          "Nome completo do funcionário",
          "E-mail cadastrado",
          "Função/cargo no sistema",
          "Avatar do usuário (se configurado)",
          "Botão 'Sair' para encerrar a sessão",
        ],
        action: "SAIR DO SISTEMA",
      },
    ],
  },
];

const sectionNav: { id: Section; label: string; icon: any; color: string }[] = [
  { id: "home", label: "Início", icon: Home, color: "bg-neutral-900" },
  { id: "missao", label: "Missão", icon: Shield, color: "bg-neutral-900" },
  { id: "abastecimento", label: "Abastecimento", icon: Fuel, color: "bg-amber-600" },
  { id: "ponto_rh", label: "Ponto RH", icon: Clock, color: "bg-blue-600" },
  { id: "ponto_oper", label: "Ponto Oper.", icon: Briefcase, color: "bg-emerald-600" },
  { id: "pedagio", label: "Pedágio", icon: CircleDollarSign, color: "bg-purple-600" },
  { id: "ocorrencia", label: "Ocorrência", icon: AlertTriangle, color: "bg-red-600" },
  { id: "meu_rh", label: "Meu RH", icon: UserCircle, color: "bg-indigo-600" },
  { id: "checklist", label: "Checklist", icon: ClipboardCheck, color: "bg-teal-600" },
  { id: "chat", label: "Chat", icon: MessageCircle, color: "bg-sky-600" },
  { id: "perfil", label: "Perfil", icon: UserCircle, color: "bg-neutral-700" },
];

function PhoneMockup({ section }: { section: GuideSection }) {
  const { user } = useAuth();
  const isVigilante = user?.role === "funcionario";
  const Icon = section.icon;

  if (section.id === "home") {
    return (
      <div className="w-full max-w-[260px] mx-auto">
        <div className="rounded-[2rem] border-2 border-neutral-300 bg-white overflow-hidden shadow-lg">
          <div className="bg-white pt-2 pb-0 px-6">
            <div className="w-16 h-1 bg-neutral-300 rounded-full mx-auto" />
          </div>
          <div className="bg-neutral-50 mx-1 mt-1.5 rounded-t-2xl overflow-hidden border border-neutral-200">
            <div className="bg-neutral-900 px-3 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img src={logoSrc} alt="" className="w-3.5 h-3.5 object-contain rounded-sm invert" />
                <span className="text-[9px] font-black text-white uppercase tracking-widest">Torres</span>
              </div>
              <span className="text-[8px] font-semibold text-neutral-400">Início</span>
            </div>
            <div className="p-3 min-h-[240px] bg-white">
              <div className="bg-neutral-900 rounded-xl p-2.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-white" />
                  <div>
                    <p className="text-[8px] font-bold text-white uppercase">Missão Ativa</p>
                    <p className="text-[7px] text-neutral-400">TOR-0001 · Aguardando</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { icon: Clock, label: "Ponto RH" },
                  { icon: Briefcase, label: "Ponto Oper." },
                  { icon: Fuel, label: "Abastecimento" },
                  { icon: CircleDollarSign, label: "Pedágio" },
                  { icon: AlertTriangle, label: "Ocorrência" },
                  { icon: UserCircle, label: "Meu RH" },
                  { icon: ClipboardCheck, label: "Checklist" },
                  { icon: UserCircle, label: "Perfil" },
                ].map((btn, i) => (
                  <div key={i} className="bg-neutral-50 border border-neutral-200 rounded-lg py-2 flex flex-col items-center gap-1">
                    <btn.icon className="w-3.5 h-3.5 text-neutral-500" />
                    <span className="text-[7px] font-bold text-neutral-600 uppercase">{btn.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white py-1.5 px-6">
            <div className="w-20 h-1 bg-neutral-300 rounded-full mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (section.id === "abastecimento") {
    return (
      <div className="w-full max-w-[260px] mx-auto">
        <div className="rounded-[2rem] border-2 border-neutral-300 bg-white overflow-hidden shadow-lg">
          <div className="bg-white pt-2 pb-0 px-6">
            <div className="w-16 h-1 bg-neutral-300 rounded-full mx-auto" />
          </div>
          <div className="bg-neutral-50 mx-1 mt-1.5 rounded-t-2xl overflow-hidden border border-neutral-200">
            <div className="bg-neutral-900 px-3 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img src={logoSrc} alt="" className="w-3.5 h-3.5 object-contain rounded-sm invert" />
                <span className="text-[9px] font-black text-white uppercase tracking-widest">Torres</span>
              </div>
              <span className="text-[8px] font-semibold text-neutral-400">Abastecimento</span>
            </div>
            <div className="p-3 min-h-[240px] bg-white space-y-2">
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 flex items-start gap-1.5">
                <span className="text-amber-600 text-[10px]">⚠️</span>
                <p className="text-[7px] font-semibold text-amber-800">ATENÇÃO: Nota no CNPJ 36.982.392/0001-89</p>
              </div>
              <div className="space-y-1.5">
                {["Gasolina R$/L", "Etanol R$/L"].map((f, i) => (
                  <div key={i} className="h-6 bg-neutral-50 border border-neutral-200 rounded flex items-center px-2">
                    <span className="text-[8px] text-neutral-400">{f}</span>
                  </div>
                ))}
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                <p className="text-[7px] font-bold text-emerald-700 uppercase">Recomendado: Gasolina</p>
                <p className="text-[6px] text-emerald-600">Etanol/Gasolina = 75%</p>
              </div>
              <div className="space-y-1.5">
                {["Litros", "KM Atual"].map((f, i) => (
                  <div key={i} className="h-6 bg-neutral-50 border border-neutral-200 rounded flex items-center px-2">
                    <span className="text-[8px] text-neutral-400">{f}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {["Hodômetro", "Bomba", "Cupom"].map((l, i) => (
                  <div key={i} className="border border-neutral-200 rounded py-1.5 flex flex-col items-center gap-0.5">
                    <Camera className="w-3 h-3 text-neutral-400" />
                    <span className="text-[6px] font-bold text-neutral-500 uppercase">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white py-1.5 px-6">
            <div className="w-20 h-1 bg-neutral-300 rounded-full mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (section.id === "ponto_rh") {
    return (
      <div className="w-full max-w-[260px] mx-auto">
        <div className="rounded-[2rem] border-2 border-neutral-300 bg-white overflow-hidden shadow-lg">
          <div className="bg-white pt-2 pb-0 px-6">
            <div className="w-16 h-1 bg-neutral-300 rounded-full mx-auto" />
          </div>
          <div className="bg-neutral-50 mx-1 mt-1.5 rounded-t-2xl overflow-hidden border border-neutral-200">
            <div className="bg-neutral-900 px-3 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <img src={logoSrc} alt="" className="w-3.5 h-3.5 object-contain rounded-sm invert" />
                <span className="text-[9px] font-black text-white uppercase tracking-widest">Torres</span>
              </div>
              <span className="text-[8px] font-semibold text-neutral-400">Ponto RH</span>
            </div>
            <div className="p-3 min-h-[240px] bg-white flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center">
                <Clock className="w-6 h-6 text-neutral-400" />
              </div>
              <div className="text-center">
                <p className="font-mono text-lg font-bold text-neutral-900">14:32:08</p>
                <p className="text-[8px] text-neutral-400 mt-0.5">Horário atual</p>
              </div>
              <div className="w-full bg-neutral-900 rounded-xl py-2.5 flex items-center justify-center gap-1.5">
                <Camera className="w-3 h-3 text-white" />
                <span className="text-[9px] font-bold text-white uppercase">Bater Ponto</span>
              </div>
              <div className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2">
                <p className="text-[7px] text-neutral-400 font-bold uppercase mb-1">Último registro</p>
                <div className="flex justify-between text-[8px]">
                  <span className="text-neutral-600 font-medium">Entrada</span>
                  <span className="text-neutral-900 font-bold">08:00</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white py-1.5 px-6">
            <div className="w-20 h-1 bg-neutral-300 rounded-full mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[260px] mx-auto">
      <div className="rounded-[2rem] border-2 border-neutral-300 bg-white overflow-hidden shadow-lg">
        <div className="bg-white pt-2 pb-0 px-6">
          <div className="w-16 h-1 bg-neutral-300 rounded-full mx-auto" />
        </div>
        <div className="bg-neutral-50 mx-1 mt-1.5 rounded-t-2xl overflow-hidden border border-neutral-200">
          <div className="bg-neutral-900 px-3 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <img src={logoSrc} alt="" className="w-3.5 h-3.5 object-contain rounded-sm invert" />
              <span className="text-[9px] font-black text-white uppercase tracking-widest">Torres</span>
            </div>
            <span className="text-[8px] font-semibold text-neutral-400">{section.title}</span>
          </div>
          <div className="p-3 min-h-[240px] bg-white flex flex-col items-center justify-center space-y-3">
            <div className={`w-12 h-12 rounded-full ${section.color} flex items-center justify-center`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="text-center">
              <p className="text-xs font-black text-neutral-900 uppercase tracking-wider">{section.title}</p>
              <p className="text-[9px] text-neutral-400 mt-0.5">{section.subtitle}</p>
            </div>
            <div className="w-full space-y-1.5">
              {section.steps.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5">
                  <div className="w-5 h-5 rounded bg-neutral-200 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-neutral-600">{s.number}</span>
                  </div>
                  <span className="text-[8px] font-bold text-neutral-700 uppercase">{s.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white py-1.5 px-6">
          <div className="w-20 h-1 bg-neutral-300 rounded-full mx-auto" />
        </div>
      </div>
    </div>
  );
}

export default function GuiaMissaoPage() {
  const { user } = useAuth();
  const isVigilante = user?.role === "funcionario";
  const [activeSection, setActiveSection] = useState<Section | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<Section>>(new Set());

  const toggleSection = (id: Section) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSteps = sections.reduce((acc, s) => acc + s.steps.length, 0);
  const totalPhotos = 23 + 3 + 1 + 1;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto pb-20 px-4" data-testid="guia-missao-page">
        <div className="text-center mb-10 pt-6">
          <div className="flex justify-center mb-4">
            <img src={logoSrc} alt="Torres" className="w-12 h-12 object-contain mx-auto rounded" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 uppercase tracking-[0.15em] mb-1" data-testid="text-guia-title">
            Guia Operacional Completo
          </h1>
          <p className="text-sm font-semibold text-neutral-400 uppercase tracking-[0.1em]">
            Torres Vigilância Patrimonial
          </p>
          <p className="text-xs text-neutral-400 mt-3 max-w-lg mx-auto leading-relaxed">
            Manual completo do aplicativo para novos funcionários. Todas as funcionalidades do sistema explicadas passo a passo.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: String(sections.length), label: "Módulos", icon: BookOpen },
            { value: String(totalSteps), label: "Etapas Totais", icon: Shield },
            { value: String(totalPhotos), label: "Fotos Registro", icon: Camera },
            { value: "GPS", label: "Em Cada Foto", icon: MapPin },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-neutral-200 rounded-xl p-4 text-center shadow-sm" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}>
              <stat.icon className="w-4 h-4 text-neutral-300 mx-auto mb-2" />
              <p className="text-2xl font-black text-neutral-900">{stat.value}</p>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-8 bg-white border border-neutral-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-neutral-500" />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-800 mb-0.5">Sincronização em Tempo Real</p>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              O aplicativo funciona diretamente no celular (PWA). Ambos os agentes veem o mesmo estado da missão em tempo real. Qualquer alteração feita por um agente aparece no celular do outro em até 5 segundos.
            </p>
          </div>
        </div>

        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-amber-900 mb-0.5">Regras Importantes</p>
            <div className="text-[11px] text-amber-800 leading-relaxed space-y-1">
              <p>1. Todas as fotos capturam GPS automaticamente — não desabilitar localização do celular</p>
              <p>2. A selfie diária é obrigatória antes de acessar o sistema</p>
              <p>3. Notas fiscais de abastecimento DEVEM ser no CNPJ 36.982.392/0001-89</p>
              <p>4. Não é possível pular etapas obrigatórias na missão</p>
              <p>5. A IA analisa fotos automaticamente — fotos ilegíveis geram alerta ao supervisor</p>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Navegação Rápida</p>
          <div className="flex flex-wrap gap-2">
            {sectionNav.map(nav => {
              const NavIcon = nav.icon;
              return (
                <button
                  key={nav.id}
                  onClick={() => {
                    setExpandedSections(prev => {
                      const next = new Set(prev);
                      next.add(nav.id);
                      return next;
                    });
                    document.getElementById(`section-${nav.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
                  data-testid={`nav-${nav.id}`}
                >
                  <div className={`w-4 h-4 rounded ${nav.color} flex items-center justify-center`}>
                    <NavIcon className="w-2.5 h-2.5 text-white" />
                  </div>
                  {nav.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section) => {
            const SectionIcon = section.icon;
            const isExpanded = expandedSections.has(section.id);
            return (
              <div key={section.id} id={`section-${section.id}`} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 transition-colors text-left"
                  data-testid={`toggle-section-${section.id}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${section.color} flex items-center justify-center shrink-0`}>
                    <SectionIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-black text-neutral-900 uppercase tracking-wider">{section.title}</h2>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{section.subtitle} — {section.steps.length} etapa{section.steps.length > 1 ? "s" : ""}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-neutral-400 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-neutral-100">
                    <div className="p-5">
                      <div className="grid md:grid-cols-[1fr,260px] gap-6 items-start">
                        <div className="space-y-4">
                          {section.steps.map((step) => {
                            const StepIcon = step.icon;
                            return (
                              <div key={step.number} className="border border-neutral-100 rounded-lg overflow-hidden" data-testid={`guia-${section.id}-step-${step.number}`}>
                                <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
                                  <div className="w-7 h-7 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0">
                                    <span className="text-[10px] font-black text-white">{step.number}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-[11px] font-black text-neutral-900 uppercase tracking-wider">{step.title}</h3>
                                    <p className="text-[10px] text-neutral-400">{step.subtitle}</p>
                                  </div>
                                  <StepIcon className="w-4 h-4 text-neutral-300 shrink-0" />
                                </div>
                                <div className="px-4 py-3">
                                  <p className="text-xs text-neutral-600 leading-relaxed mb-3">{step.description}</p>
                                  <div className="space-y-1.5">
                                    {step.details.map((detail, i) => (
                                      <div key={i} className="flex items-start gap-2">
                                        <ChevronRight className="w-3 h-3 text-neutral-300 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-neutral-500 leading-relaxed">{detail}</p>
                                      </div>
                                    ))}
                                  </div>
                                  {(step.mandatory || step.action) && (
                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                      {step.mandatory && (
                                        <div className="inline-flex items-center gap-1.5 bg-neutral-100 border border-neutral-200 rounded-md px-2.5 py-1">
                                          <Lock className="w-2.5 h-2.5 text-neutral-500" />
                                          <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">{step.mandatory}</span>
                                        </div>
                                      )}
                                      {step.action && (
                                        <div className="inline-flex items-center gap-1.5 bg-neutral-900 rounded-md px-2.5 py-1">
                                          <ArrowRight className="w-2.5 h-2.5 text-white" />
                                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">{step.action}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="hidden md:block sticky top-4">
                          <PhoneMockup section={section} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-14 border border-neutral-200 rounded-xl p-8 text-center bg-white shadow-sm">
          <div className="flex justify-center mb-3">
            <img src={logoSrc} alt="Torres" className="w-10 h-10 object-contain mx-auto rounded" />
          </div>
          <h3 className="text-sm font-black text-neutral-900 uppercase tracking-[0.15em] mb-1">
            Torres Vigilância Patrimonial
          </h3>
          <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-3">
            CNPJ 36.982.392/0001-89
          </p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
            Sistema completo de gestão operacional com documentação fotográfica obrigatória, rastreamento GPS, inspeção por IA, comunicação em tempo real e controle financeiro integrado.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[
              "Escolta Armada",
              "Frota",
              "RH",
              "Ponto",
              "Abastecimento",
              "Pedágio",
              "Chat",
              "IA",
            ].map(tag => (
              <span key={tag} className="bg-neutral-100 border border-neutral-200 rounded-full px-3 py-1 text-[10px] font-bold text-neutral-600 uppercase tracking-wider">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
