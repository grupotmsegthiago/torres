// =============================================================================
// LEAD ENGINE — Configuração
// =============================================================================
// Edite este arquivo para adaptar o motor ao seu negócio.
// Renomeie para config.ts ao usar no projeto.
// =============================================================================

// ---------------------------------------------------------------------------
// DADOS DA SUA EMPRESA (usados nos e-mails)
// ---------------------------------------------------------------------------
export const EMPRESA = {
  nome: "SUA EMPRESA LTDA",
  cnpj: "00.000.000/0001-00",
  email: "contato@suaempresa.com.br",
  emailComercial: "comercial@suaempresa.com.br",
  telefone: "(11) 99999-9999",
  site: "www.suaempresa.com.br",
  whatsapp: "5511999999999",
};

// ---------------------------------------------------------------------------
// SMTP (servidor de e-mail)
// ---------------------------------------------------------------------------
// Configure via variáveis de ambiente:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
export const SMTP = {
  host: process.env.SMTP_HOST || "smtp.office365.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: `"${EMPRESA.nome}" <${process.env.SMTP_FROM || EMPRESA.email}>`,
  replyTo: `${EMPRESA.email}, ${EMPRESA.emailComercial}`,
};

// ---------------------------------------------------------------------------
// E-MAIL DO RELATÓRIO DIÁRIO
// ---------------------------------------------------------------------------
export const REPORT_EMAIL = {
  to: "diretor@suaempresa.com.br",
  cc: "gerente@suaempresa.com.br",
};

// ---------------------------------------------------------------------------
// CADÊNCIA DE E-MAILS
// ---------------------------------------------------------------------------
export const EMAIL_CADENCE = {
  batchSize: 10,
  batchIntervalMinutes: 5,
  maxEmailsPerLead: 5,
  daysBetweenEmails: 3,
  autoEnqueueHourStart: 7,
  autoEnqueueHourEnd: 21,
};

// ---------------------------------------------------------------------------
// PROSPECÇÃO AUTOMÁTICA
// ---------------------------------------------------------------------------
export const PROSPECT = {
  queriesPerCycle: 3,
  cronInterval: "*/10 * * * *",
  timezone: "America/Sao_Paulo",
};

// ---------------------------------------------------------------------------
// QUERIES DE BUSCA
// ---------------------------------------------------------------------------
// Adapte para o seu segmento-alvo. Cada query é buscada no DuckDuckGo/Bing.
// Quanto mais específica, melhores os leads.
export const SEARCH_QUERIES = [
  "transportadora de cargas São Paulo SP",
  "empresa de logística São Paulo SP",
  "transportadora São Paulo SP",
  "logística e distribuição São Paulo SP",
  "transporte de cargas Guarulhos SP",
  "transportadora Campinas SP",
  "logística Osasco SP",
  "transportadora cargas Barueri SP",
  "logística transporte Santos SP",
  "transportadora São Bernardo SP",
  "empresa transporte de cargas ABC paulista",
  "logística armazenagem São Paulo SP",
  "centro de distribuição São Paulo SP",
  "atacadista distribuidor São Paulo SP",
  "transportadora refrigerada São Paulo SP",
  "transporte e-commerce São Paulo SP",
  "operador logístico São Paulo SP",
  "transportadora cargas Jundiaí SP",
  "logística Ribeirão Preto SP",
  "transportadora Sorocaba SP",
  "transportadora cargas Mogi das Cruzes SP",
  "logística São José dos Campos SP",
  "transportadora de mudanças São Paulo SP",
  "frete cargas São Paulo SP",
  "transportadora expressa São Paulo SP",
  "transporte cargas especiais São Paulo SP",
  "transportadora de alimentos São Paulo SP",
  "logística terceirizada São Paulo SP",
  "transportadora regional interior SP",
  "transporte industrial Diadema SP",
  "indústria farmacêutica São Paulo SP",
  "distribuidora de medicamentos São Paulo SP",
  "e-commerce logística São Paulo SP",
  "armazém geral São Paulo SP",
  "transporte de valores São Paulo SP",
  "transportadora carga pesada São Paulo SP",
  "operador portuário Santos SP",
  "agente de cargas São Paulo SP",
  "despachante aduaneiro São Paulo SP",
  "distribuidora cosméticos São Paulo SP",
  "transporte carga fracionada São Paulo SP",
  "logística reversa São Paulo SP",
  "transportadora de bebidas São Paulo SP",
  "armazém logístico Cajamar SP",
  "transporte de autopeças São Paulo SP",
  "distribuidora de alimentos atacado SP",
  "logística integrada Guarulhos SP",
  "transportadora de encomendas SP",
  "transportadora cross docking SP",
  "logística last mile São Paulo SP",
  "distribuidora farmacêutica Campinas SP",
  "transporte de carga seca interior SP",
  "transportadora de cosméticos perfumaria SP",
  "distribuidora de materiais elétricos SP",
  "logística fullfilment e-commerce SP",
  "transportadora carga lotação São Paulo SP",
  "empresa de transporte dedicado SP",
  "logística de perecíveis São Paulo SP",
  "transporte de máquinas equipamentos SP",
  "distribuidora de embalagens São Paulo SP",
  "transportadora de papel celulose SP",
  "transportadora de cargas Rio de Janeiro RJ",
  "logística Belo Horizonte MG",
  "transportadora Curitiba PR",
  "transportadora Porto Alegre RS",
  "logística Goiânia GO",
  "distribuidora atacado Goiânia GO",
];

// ---------------------------------------------------------------------------
// SETORES-ALVO (para classificação dos leads)
// ---------------------------------------------------------------------------
export const SETORES_ALVO = [
  "Transportadora", "Logística", "Atacadista", "Centro de Distribuição",
  "Indústria Farmacêutica", "Transporte de Valores", "E-commerce", "Varejo",
  "Agronegócio", "Indústria Alimentícia", "Distribuidora", "Armazém Geral",
];

// ---------------------------------------------------------------------------
// SCORING (pontuação por setor para priorização)
// ---------------------------------------------------------------------------
export const SCORING_SETOR: Record<string, number> = {
  "Transporte de Valores": 10,
  "Indústria Farmacêutica": 10,
  "Transportadora": 9,
  "Logística": 8,
  "Centro de Distribuição": 8,
  "E-commerce": 7,
  "Distribuidora": 7,
  "Atacadista": 7,
  "Armazém Geral": 6,
  "Indústria Alimentícia": 6,
  "Agronegócio": 5,
  "Varejo": 4,
};

// ---------------------------------------------------------------------------
// ZONAS DE RISCO (aumentam o score do lead)
// ---------------------------------------------------------------------------
export const ZONAS_RISCO = [
  "Cajamar", "Guarulhos", "Campinas", "Santos", "Dutra",
  "Raposo", "Castelo Branco", "Anhanguera", "Bandeirantes",
  "Fernão Dias", "Régis Bittencourt", "Anchieta", "Imigrantes",
  "Barueri", "Osasco", "Jundiaí", "Embu",
];

// ---------------------------------------------------------------------------
// FILTRO ANTI-CONCORRENTE
// ---------------------------------------------------------------------------
// Termos que excluem o site da busca (evita trazer concorrentes)
export const EXCLUSION_TERMS = " -vigilância -escolta -segurança -monitoramento -portaria -vigilante";

// Termos de conteúdo que identificam concorrentes
export const BLACKLIST_COMPETITOR = [
  "escolta armada", "vigilância patrimonial", "segurança patrimonial",
  "seguranca privada", "segurança privada", "monitoramento eletrônico",
  "portaria remota", "segurança eletrônica", "empresa de vigilância",
  "serviço de escolta", "escolta de cargas", "rastreamento veicular",
  "central de monitoramento", "cftv", "alarme monitorado",
  "pronta resposta", "ronda motorizada", "vigilância orgânica",
];

// Marcas de concorrentes conhecidos (descarta imediatamente)
export const BLACKLIST_BRANDS = [
  "prosegur", "gruber", "ictsi", "verzani", "sandrini", "g4s",
  "protege", "emmo", "aster", "grupofort", "grupo fort", "tps segurança",
  "gocil", "segurpro", "servnac", "brinks", "securitas", "magnus",
  "transvip", "nordeste segurança", "prosseguir", "forteseg",
];

// Termos positivos que confirmam que o site é um alvo real
export const POSITIVE_TERMS = [
  "transporte", "logística", "logistica", "distribuição", "distribuicao",
  "frota", "carga", "armazém", "armazenagem", "frete", "entrega",
  "atacado", "atacadista", "importação", "exportação", "e-commerce",
  "farmacêutica", "medicamento", "alimento", "bebida", "cosmético",
  "indústria", "manufatura", "fabricante", "produtor", "operador logístico",
];

// ---------------------------------------------------------------------------
// DOMÍNIOS IGNORADOS NA BUSCA
// ---------------------------------------------------------------------------
export const SKIP_DOMAINS = new Set([
  "google.com", "youtube.com", "facebook.com", "instagram.com", "linkedin.com",
  "twitter.com", "wikipedia.org", "blogspot.com", "wordpress.com", "wix.com",
  "squarespace.com", "reclameaqui.com.br", "jusbrasil.com.br", "gov.br",
  "guiamais.com.br", "yelp.com", "tripadvisor.com", "infojobs.com.br",
  "indeed.com", "glassdoor.com", "olx.com.br", "mercadolivre.com.br",
  "telelistas.net", "maps.google.com", "pinterest.com", "tiktok.com",
  "bing.com", "msn.com", "yahoo.com",
]);

// ---------------------------------------------------------------------------
// PREFIXOS PARA DERIVAR E-MAILS QUANDO NÃO ENCONTRADOS
// ---------------------------------------------------------------------------
export const EMAIL_PREFIXES = [
  "contato", "comercial", "logistica", "operacoes", "vendas",
  "financeiro", "sac", "atendimento", "info", "faleconosco",
];

// ---------------------------------------------------------------------------
// CARGOS SUGERIDOS PARA O CONTATO
// ---------------------------------------------------------------------------
export const CONTATO_CARGOS = [
  "Gerente de Logística", "Gerente de Operações", "Supervisor de Transportes",
  "Coordenador de GR", "Gerente de Riscos", "Analista de Seguros",
  "Diretor de Operações", "Gerente de Segurança", "Coordenador de Frota",
  "Gerente Comercial", "Supervisor de Expedição", "Contato Geral",
];

// ---------------------------------------------------------------------------
// USER AGENTS PARA ROTAÇÃO NAS BUSCAS
// ---------------------------------------------------------------------------
export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
];
