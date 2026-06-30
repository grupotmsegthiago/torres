// Templates de documentos assináveis de RH.
// Primeiro tipo entregue = Termo Flash (beneficio_flash). Arquitetura pronta
// para registrar novos tipos (LGPD, regulamento, contrato de serviço) só
// adicionando uma entrada no registry abaixo.

export type SignableDocType =
  | "beneficio_flash"
  | "lgpd"
  | "regulamento"
  | "contrato_servico"
  | "outros";

export interface TemplateEmployee {
  name?: string | null;
  cpf?: string | null;
  role?: string | null;
  matricula?: string | null;
}

export interface SignableDocTemplate {
  type: SignableDocType;
  title: string;
  /** Texto de aceite que o funcionário confirma antes de assinar. */
  termo: string;
  /** Corpo do documento em HTML (sem folha de autenticação). */
  buildBodyHtml: (emp: TemplateEmployee) => string;
}

const EMPRESA = "TORRES VIGILÂNCIA PATRIMONIAL LTDA";
const CIDADE = "São Paulo";

export function esc(s: string | null | undefined): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCpfMask(cpf: string | null | undefined): string {
  const d = (cpf || "").replace(/\D/g, "");
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : (cpf || "");
}

const TERMO_ACEITE_PADRAO = `DECLARAÇÃO DE CIÊNCIA E ACEITE

Declaro, para os devidos fins, que LI INTEGRALMENTE o presente documento e estou CIENTE e DE ACORDO com todo o seu conteúdo.

Confirmo a autenticidade desta assinatura digital realizada por mim, mediante reconhecimento facial (selfie) e assinatura manuscrita, conforme a Lei 14.063/2020, MP 2.200-2/2001 e o art. 219 do Código Civil, reconhecendo seu pleno valor jurídico equivalente à assinatura física.`;

const TEMPLATES: Record<SignableDocType, SignableDocTemplate> = {
  beneficio_flash: {
    type: "beneficio_flash",
    title: "Termo de Recebimento de Cartão de Benefícios e Diárias",
    termo: TERMO_ACEITE_PADRAO,
    buildBodyHtml: (e) => {
      const nome = esc(e.name);
      const cpf = esc(formatCpfMask(e.cpf));
      return `
        <h1>Termo de Recebimento de Cartão de Benefícios e Diárias</h1>
        <p>Eu, <b>${nome}</b>, portador(a) do CPF nº <b>${cpf}</b>, colaborador(a) da empresa <b>${EMPRESA}</b>, declaro, para os devidos fins, que nesta data recebi o Cartão Flash, destinado ao pagamento de benefícios e diárias concedidos pela empresa.</p>
        <p><b>Declaro estar ciente de que:</b></p>
        <ul>
          <li>O cartão é de uso pessoal e intransferível;</li>
          <li>Os créditos disponibilizados no cartão serão utilizados exclusivamente para os fins determinados pela empresa, conforme suas políticas internas;</li>
          <li>É de minha responsabilidade realizar o cadastro e ativação do cartão por meio do aplicativo da Flash, bem como zelar pela guarda, conservação e utilização adequada do mesmo;</li>
          <li>Em caso de perda, furto, roubo ou qualquer ocorrência que comprometa a segurança do cartão, comprometo-me a comunicar imediatamente a empresa e a Flash pelos canais oficiais;</li>
          <li>O recebimento do cartão não implica, por si só, na disponibilização imediata de saldo, ficando os créditos condicionados aos lançamentos realizados pela empresa.</li>
        </ul>
        <p>Por ser a expressão da verdade, firmo o presente Termo de Recebimento.</p>
        <p class="data">Local e Data: ${esc(CIDADE)}, ${formatBrtLongDate()}.</p>`;
    },
  },
  lgpd: {
    type: "lgpd",
    title: "Termo de Consentimento para Tratamento de Dados Pessoais (LGPD)",
    termo: TERMO_ACEITE_PADRAO,
    buildBodyHtml: (e) => {
      const nome = esc(e.name);
      const cpf = esc(formatCpfMask(e.cpf));
      return `
        <h1>Termo de Consentimento para Tratamento de Dados Pessoais</h1>
        <p>Eu, <b>${nome}</b>, portador(a) do CPF nº <b>${cpf}</b>, colaborador(a) da empresa <b>${EMPRESA}</b>, declaro estar ciente e CONSINTO, nos termos da Lei nº 13.709/2018 (LGPD), com o tratamento dos meus dados pessoais pela empresa para fins de gestão do contrato de trabalho, folha de pagamento, benefícios, controle de jornada, segurança operacional e obrigações legais e regulatórias.</p>
        <p>Declaro estar ciente de que meus dados serão armazenados de forma segura, utilizados estritamente para as finalidades acima e que posso, a qualquer tempo, solicitar informações sobre o tratamento dos meus dados pelos canais oficiais da empresa.</p>
        <p class="data">Local e Data: ${esc(CIDADE)}, ${formatBrtLongDate()}.</p>`;
    },
  },
  regulamento: {
    type: "regulamento",
    title: "Regulamento Interno",
    termo: TERMO_ACEITE_PADRAO,
    buildBodyHtml: (e) => {
      const nome = esc(e.name);
      return `
        <h1>Ciência do Regulamento Interno</h1>
        <p>Eu, <b>${nome}</b>, colaborador(a) da empresa <b>${EMPRESA}</b>, declaro que recebi, li e estou ciente do Regulamento Interno da empresa, comprometendo-me a cumprir integralmente todas as normas, políticas e procedimentos nele estabelecidos.</p>
        <p class="data">Local e Data: ${esc(CIDADE)}, ${formatBrtLongDate()}.</p>`;
    },
  },
  contrato_servico: {
    type: "contrato_servico",
    title: "Contrato de Prestação de Serviços",
    termo: TERMO_ACEITE_PADRAO,
    buildBodyHtml: (e) => {
      const nome = esc(e.name);
      const cpf = esc(formatCpfMask(e.cpf));
      return `
        <h1>Contrato de Prestação de Serviços</h1>
        <p>Eu, <b>${nome}</b>, portador(a) do CPF nº <b>${cpf}</b>, declaro ciência e concordância com os termos do presente Contrato de Prestação de Serviços firmado com a empresa <b>${EMPRESA}</b>.</p>
        <p class="data">Local e Data: ${esc(CIDADE)}, ${formatBrtLongDate()}.</p>`;
    },
  },
  outros: {
    type: "outros",
    title: "Documento RH",
    termo: TERMO_ACEITE_PADRAO,
    buildBodyHtml: (e) => {
      const nome = esc(e.name);
      return `
        <h1>Documento RH</h1>
        <p>Eu, <b>${nome}</b>, colaborador(a) da empresa <b>${EMPRESA}</b>, declaro ciência e concordância com o conteúdo do presente documento.</p>
        <p class="data">Local e Data: ${esc(CIDADE)}, ${formatBrtLongDate()}.</p>`;
    },
  },
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function formatBrtLongDate(d: Date = new Date()): string {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [y, m, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")} de ${MESES[m - 1]} de ${y}`;
}

export function getTemplate(type: string): SignableDocTemplate {
  return TEMPLATES[(type as SignableDocType)] || TEMPLATES.outros;
}

export function listTemplates(): { type: SignableDocType; title: string }[] {
  return (Object.keys(TEMPLATES) as SignableDocType[]).map((t) => ({ type: t, title: TEMPLATES[t].title }));
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  beneficio_flash: "Cartão Flash",
  lgpd: "LGPD",
  regulamento: "Regulamento Interno",
  contrato_servico: "Contrato de Serviço",
  outros: "Outros",
};
