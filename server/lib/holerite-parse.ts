/**
 * Parser determinístico de holerites TORRES — sem OpenAI quando o PDF tem texto.
 *
 * Layouts suportados:
 *  1) Folha Mensal (software atual): DIAS NORMAIS / PERICULOSIDADE / HORAS EXTRAS…
 *  2) Layout numerado legado: "1 24,00 2.432,50" + labels "Dias trabalhados"…
 */

export type HoleriteParsed = {
  employeeName: string;
  employeeCpf: string;
  month: number;
  year: number;
  competencia: string;
  salarioBase: number;
  periculosidade: number;
  horasExtras: number;
  adicionalNoturno: number;
  dsr: number;
  valeRefeicao: number;
  ajudaCusto: number;
  beneficios: number;
  descontos: number;
  totalBruto: number;
  totalLiquido: number;
};

const MONTHS_PT: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

const MONEY_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const TIME_RE = /^\d{1,3}:\d{2}$/;

export function toHoleriteNumber(s: string): number {
  return Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
}

function emptyParsed(): HoleriteParsed {
  return {
    employeeName: "",
    employeeCpf: "",
    month: 0,
    year: 0,
    competencia: "",
    salarioBase: 0,
    periculosidade: 0,
    horasExtras: 0,
    adicionalNoturno: 0,
    dsr: 0,
    valeRefeicao: 0,
    ajudaCusto: 0,
    beneficios: 0,
    descontos: 0,
    totalBruto: 0,
    totalLiquido: 0,
  };
}

/** Extrai nome, CPF e competência do texto do holerite. */
export function extractHoleriteIdentity(text: string): Pick<
  HoleriteParsed,
  "employeeName" | "employeeCpf" | "month" | "year" | "competencia" | "descontos"
> {
  let employeeCpf = "";
  const cpfM = text.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
  if (cpfM) {
    const digits = cpfM[1].replace(/\D/g, "");
    if (digits.length === 11) {
      employeeCpf = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }
  }

  let employeeName = "";
  // Folha Mensal: nome na linha ACIMA de "Nome do Funcionário"
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (/^Nome do Funcion[aá]rio/i.test(lines[i]) && i > 0) {
      const prev = lines[i - 1].replace(/\s+/g, " ").trim();
      if (prev && /[A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]{3,}/.test(prev) && !/TORRES|CNPJ|Código|Filial/i.test(prev)) {
        employeeName = prev;
        break;
      }
    }
  }
  if (!employeeName) {
    const namePatterns = [
      /(?:Nome\s*(?:do\s*)?(?:Funcion[aá]rio|Colaborador)?|Funcion[aá]rio|Colaborador)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.'-]{4,80})/i,
      /(?:Empregado)\s*[:\-]?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.'-]{4,80})/i,
    ];
    for (const re of namePatterns) {
      const m = text.match(re);
      if (m?.[1]) {
        employeeName = m[1].replace(/\s+/g, " ").trim();
        employeeName = employeeName.split(/\s{2,}|\t|CPF|PIS|Cargo|Função/i)[0].trim();
        break;
      }
    }
  }

  let month = 0;
  let year = 0;
  let competencia = "";

  // Folha Mensal: "Junho de 2026"
  const mesDe = text.match(
    /\b(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+(\d{4})\b/i,
  );
  if (mesDe) {
    const norm = mesDe[1].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    month = MONTHS_PT[norm] || 0;
    year = Number(mesDe[2]) || 0;
    competencia = `${mesDe[1].slice(0, 3).toUpperCase()}/${year}`;
  }

  if (!month) {
    const labeled =
      text.match(/Compet[eê]ncia\s*[:\-]?\s*([A-Za-zçÇ]{3,9})\s*\/\s*(\d{4})/i) ||
      text.match(/Compet[eê]ncia\s*[:\-]?\s*(\d{1,2})\s*\/\s*(\d{4})/i);
    const bare =
      text.match(/\b((?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*)\s*\/\s*(\d{4})\b/i) ||
      text.match(/\b(\d{1,2})\s*\/\s*(\d{4})\b/);
    const compM = labeled || bare;
    if (compM) {
      const part1 = (compM[1] || "").trim();
      const part2 = Number(compM[2] || 0);
      year = part2 || 0;
      if (/^\d{1,2}$/.test(part1)) {
        month = Number(part1);
        competencia = `${String(month).padStart(2, "0")}/${year}`;
      } else {
        const norm = part1.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
        month = MONTHS_PT[norm] || MONTHS_PT[norm.slice(0, 3)] || 0;
        competencia = `${part1.toUpperCase().slice(0, 3)}/${year}`;
      }
    }
  }

  let descontos = 0;
  const descM =
    text.match(/Total\s+(?:de\s+)?Descontos[^\d]*([\d.]+,\d{2})/i) ||
    text.match(/Descontos\s+Totais[^\d]*([\d.]+,\d{2})/i);
  if (descM) descontos = toHoleriteNumber(descM[1]);

  return { employeeName, employeeCpf, month, year, competencia, descontos };
}

function classifyFolhaDesc(desc: string): keyof HoleriteParsed | "ignore" | "descontoItem" {
  const d = desc.toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/DIAS\s+NORMAIS|SALARIO\s+BASE|SALARIO\s+DO\s+MES/.test(d)) return "salarioBase";
  if (/PERICULOSIDADE/.test(d)) return "periculosidade";
  if (/HORAS?\s+EXTRAS?/.test(d) && !/DSR|REFLEXO/.test(d)) return "horasExtras";
  if (/ADICIONAL\s+NOTURNO/.test(d) && !/DSR|REFLEXO/.test(d)) return "adicionalNoturno";
  if (/\bDSR\b|REFLEXO.*DSR|DESCANSO\s+SEMANAL/.test(d)) return "dsr";
  if (/AJUDA\s+DE\s+CUSTO/.test(d)) return "ajudaCusto";
  if (/SALARIO\s+FAMILIA|GRATIFICACAO|PREMIO|COMISSAO/.test(d)) return "beneficios";
  // DESC VALE REFEICAO / VALE TRANSPORTE / INSS / IR = descontos (VR fica no campo valeRefeicao p/ espelho histórico)
  if (/DESC\s+VALE\s+REFEIC|VALE\s+REFEIC|VALE\s+ALIMENT/.test(d)) return "valeRefeicao";
  if (/I\.?N\.?S\.?S|IMPOSTO\s+DE\s+RENDA|VALE\s+TRANSPORTE|DESC\b/.test(d)) return "descontoItem";
  return "ignore";
}

/**
 * Parser do layout Folha Mensal (PDF atual da TORRES).
 * Texto extraído vem "embaralhado"; usamos bloco descrição→valores + rótulos fixos.
 */
export function parseHoleriteFolhaMensal(text: string): HoleriteParsed | null {
  if (!/Folha\s+Mensal|DIAS\s+NORMAIS|Nome do Funcion[aá]rio/i.test(text)) return null;

  const out = emptyParsed();
  const identity = extractHoleriteIdentity(text);
  Object.assign(out, identity);

  // Salário Base rotulado: "2.565,31\nSalário Base"
  const sbLabel = text.match(/([\d.]+,\d{2})\s*\n\s*Sal[aá]rio Base/i);
  if (sbLabel) out.salarioBase = toHoleriteNumber(sbLabel[1]);

  // Periculosidade: "PERICULOSIDADE 30,00 769,59" ou "PERICULOSIDADE 769,59"
  const periM = text.match(/PERICULOSIDADE[^\n]*?([\d.]+,\d{2})(?:\s+([\d.]+,\d{2}))?/i);
  if (periM) {
    out.periculosidade = toHoleriteNumber(periM[2] || periM[1]);
  }

  // Totais: após "Declaro ter recebido..." costuma vir Vencimentos / Descontos / Líquido
  // Também no topo: Descontos + Líquido antes de "Código Descrição"
  const aposDeclaro = text.match(
    /Declaro ter recebido[\s\S]{0,40}?([\d.]+,\d{2})\s*\n\s*([\d.]+,\d{2})\s*\n\s*([\d.]+,\d{2})/i,
  );
  if (aposDeclaro) {
    out.totalBruto = toHoleriteNumber(aposDeclaro[1]);
    out.descontos = toHoleriteNumber(aposDeclaro[2]);
    out.totalLiquido = toHoleriteNumber(aposDeclaro[3]);
  } else {
    const topo = text.match(
      /Assinatura do Funcion[aá]rio\s*\n\s*([\d.]+,\d{2})\s*\n\s*([\d.]+,\d{2})\s*\n\s*C[oó]digo Descri/i,
    );
    if (topo) {
      out.descontos = toHoleriteNumber(topo[1]);
      out.totalLiquido = toHoleriteNumber(topo[2]);
    }
    const tv = text.match(/Total de Vencimentos/i);
    if (tv) {
      // valor logo após "Declaro..." sozinho
      const only = text.match(/Declaro ter recebido[^\n]*\n\s*([\d.]+,\d{2})/i);
      if (only) out.totalBruto = toHoleriteNumber(only[1]);
    }
  }

  // Bloco descrição + valores (preferir cópia sem códigos 998/999 — mais limpa)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  type Pair = { descs: string[]; values: number[] };
  const candidates: Pair[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^DIAS\s+NORMAIS$/i.test(lines[i])) continue;
    const descs: string[] = [];
    let j = i;
    while (j < lines.length) {
      const ln = lines[j];
      if (MONEY_RE.test(ln) || TIME_RE.test(ln)) break;
      if (/^PERICULOSIDADE|^TORRES|^C[oó]digo Descri|^____/i.test(ln)) break;
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9. %/]+$/i.test(ln) && !/^\d+$/.test(ln) && ln.length > 2) {
        descs.push(ln);
      }
      j++;
      if (descs.length > 20) break;
    }
    // Após descrições vem: referências (dias/horas) + vencimentos/descontos.
    // Coleta moneys até quebrar; se sobrar referência+valor, usa os ÚLTIMOS N valores.
    const moneys: number[] = [];
    while (j < lines.length && moneys.length < descs.length * 3) {
      const ln = lines[j];
      if (MONEY_RE.test(ln)) {
        moneys.push(toHoleriteNumber(ln));
        j++;
        continue;
      }
      if (TIME_RE.test(ln)) {
        j++;
        continue;
      }
      break;
    }
    if (descs.length >= 1 && moneys.length >= 1) {
      const values =
        moneys.length >= descs.length ? moneys.slice(moneys.length - descs.length) : moneys;
      candidates.push({ descs, values });
    }
  }

  // Escolhe o candidato com mais pares descrição↔valor
  candidates.sort((a, b) => Math.min(b.descs.length, b.values.length) - Math.min(a.descs.length, a.values.length));
  const best = candidates[0];
  if (best) {
    const n = Math.min(best.descs.length, best.values.length);
    let dsrSum = 0;
    let descontoSum = 0;
    for (let i = 0; i < n; i++) {
      const key = classifyFolhaDesc(best.descs[i]);
      const val = best.values[i];
      if (key === "ignore") continue;
      if (key === "descontoItem") {
        descontoSum += val;
        continue;
      }
      if (key === "dsr") {
        dsrSum += val;
        continue;
      }
      if (key === "valeRefeicao") {
        out.valeRefeicao = val;
        descontoSum += val; // é desconto no holerite
        continue;
      }
      if (key === "salarioBase" && out.salarioBase > 0) continue; // rótulo tem prioridade
      if (key === "beneficios") {
        out.beneficios = +(out.beneficios + val).toFixed(2);
        continue;
      }
      if ((out as any)[key] === 0) (out as any)[key] = val;
    }
    if (dsrSum > 0) out.dsr = +dsrSum.toFixed(2);
    if (descontoSum > 0 && out.descontos === 0) out.descontos = +descontoSum.toFixed(2);
  }

  // Total bruto fallback: soma proventos se ainda zero
  if (!out.totalBruto) {
    const sum =
      out.salarioBase +
      out.periculosidade +
      out.horasExtras +
      out.adicionalNoturno +
      out.dsr +
      out.ajudaCusto +
      out.beneficios;
    // valeRefeicao neste layout é desconto — não entra no bruto
    if (sum > 0) out.totalBruto = +sum.toFixed(2);
  }

  if (!isUsableHoleriteParse(out)) return null;
  return out;
}

/**
 * Parser determinístico para holerites do layout numerado legado.
 * Estrutura: bloco "N [referência] valor" + bloco de labels separado.
 */
export function parseHoleriteTorres(text: string): HoleriteParsed | null {
  const identity = extractHoleriteIdentity(text);

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itemValues: Record<number, number> = {};
  for (const ln of lines) {
    const m = ln.match(/^(\d{1,2})\s+([\d.,]+)(?:\s+([\d.,]+))?\s*$/);
    if (m) {
      const idx = Number(m[1]);
      if (idx >= 1 && idx <= 20) {
        const valStr = m[3] || m[2];
        itemValues[idx] = toHoleriteNumber(valStr);
      }
    }
  }
  if (Object.keys(itemValues).length === 0) return null;

  const has = {
    diasTrabalhados: /Dias\s+trabalhados|Sal[áa]rio\s+(?:Base|do\s+M[êe]s)/i.test(text),
    periculosidade: /Periculosidade/i.test(text),
    horasExtras: /Horas?\s+extras?/i.test(text),
    adicionalNoturno: /Adicional\s+noturno/i.test(text),
    dsr: /\bDSR\b|Descanso\s+Semanal/i.test(text),
    valeRefeicao: /Vale\s+(refei[çc][ãa]o|alimenta[çc][ãa]o)|^V[RA]\b/im.test(text),
    ajudaCusto: /Ajuda\s+de\s+custo/i.test(text),
  };

  const canonicalOrder: { key: keyof HoleriteParsed; present: boolean }[] = [
    { key: "salarioBase", present: has.diasTrabalhados },
    { key: "periculosidade", present: has.periculosidade },
    { key: "horasExtras", present: has.horasExtras },
    { key: "adicionalNoturno", present: has.adicionalNoturno },
    { key: "dsr", present: has.dsr },
    { key: "valeRefeicao", present: has.valeRefeicao },
    { key: "ajudaCusto", present: has.ajudaCusto },
  ];
  const uniqKeys = canonicalOrder.filter((x) => x.present).map((x) => x.key);
  if (uniqKeys.length === 0) return null;

  const out: Record<string, number> = {
    salarioBase: 0,
    periculosidade: 0,
    horasExtras: 0,
    adicionalNoturno: 0,
    dsr: 0,
    valeRefeicao: 0,
    ajudaCusto: 0,
    beneficios: 0,
  };
  for (let i = 0; i < uniqKeys.length; i++) {
    const v = itemValues[i + 1];
    if (v != null && out[uniqKeys[i]] === 0) out[uniqKeys[i]] = v;
  }

  const totMatch = text.match(/Total\s+dos\s+Vencimentos[\s\S]{0,80}?([\d.]+,\d{2})/i);
  const totalBruto = totMatch ? toHoleriteNumber(totMatch[1]) : 0;
  const liqMatch = text.match(/L[ií]quido\s+a\s+Receber[^\d]*([\d.]+,\d{2})/i);
  const totalLiquido = liqMatch ? toHoleriteNumber(liqMatch[1]) : 0;

  const sum =
    out.salarioBase +
    out.periculosidade +
    out.horasExtras +
    out.adicionalNoturno +
    out.dsr +
    out.valeRefeicao +
    out.ajudaCusto;
  if (totalBruto > 0 && Math.abs(sum - totalBruto) > 0.5) {
    const diff = totalBruto - sum;
    if (diff > 0) out.beneficios = +diff.toFixed(2);
  }

  return {
    employeeName: identity.employeeName,
    employeeCpf: identity.employeeCpf,
    month: identity.month,
    year: identity.year,
    competencia: identity.competencia,
    salarioBase: out.salarioBase,
    periculosidade: out.periculosidade,
    horasExtras: out.horasExtras,
    adicionalNoturno: out.adicionalNoturno,
    dsr: out.dsr,
    valeRefeicao: out.valeRefeicao,
    ajudaCusto: out.ajudaCusto,
    beneficios: out.beneficios,
    descontos: identity.descontos,
    totalBruto,
    totalLiquido,
  };
}

/** Tenta Folha Mensal (atual) e depois layout numerado legado. */
export function parseHoleritePdf(text: string): HoleriteParsed | null {
  return parseHoleriteFolhaMensal(text) || parseHoleriteTorres(text);
}

/** Parser determinístico tem dados úteis o bastante para dispensar a IA. */
export function isUsableHoleriteParse(p: HoleriteParsed | null | undefined): p is HoleriteParsed {
  if (!p) return false;
  return (Number(p.salarioBase) || 0) > 0 || (Number(p.totalBruto) || 0) > 0;
}

export function matchEmployeeFromHolerite(
  parsed: { employeeName?: string; employeeCpf?: string },
  employees: Array<{ id: number; name?: string | null; cpf?: string | null; status?: string | null }>,
): number | null {
  const cpfClean = (parsed.employeeCpf || "").replace(/\D/g, "");
  const nameLower = (parsed.employeeName || "").toLowerCase().trim();

  if (cpfClean) {
    for (const emp of employees) {
      const empCpf = (emp.cpf || "").replace(/\D/g, "");
      if (empCpf && empCpf === cpfClean) return emp.id;
    }
  }

  if (nameLower) {
    for (const emp of employees) {
      const empName = (emp.name || "").toLowerCase().trim();
      if (empName && (empName === nameLower || empName.includes(nameLower) || nameLower.includes(empName))) {
        return emp.id;
      }
    }
    const nameParts = nameLower.split(/\s+/);
    if (nameParts.length >= 2) {
      for (const emp of employees) {
        const empParts = (emp.name || "").toLowerCase().split(/\s+/);
        if (
          empParts.length >= 2 &&
          empParts[0] === nameParts[0] &&
          empParts[empParts.length - 1] === nameParts[nameParts.length - 1]
        ) {
          return emp.id;
        }
      }
    }
  }
  return null;
}

function isUsableOpenAIKey(key: string | undefined): key is string {
  const k = String(key || "").trim();
  if (!k) return false;
  if (k.startsWith("_DUMMY_")) return false;
  if (/^(dummy|changeme|your[-_]?key|xxx+)$/i.test(k)) return false;
  return true;
}

function sanitizeOpenAIBaseURL(url: string | undefined): string | undefined {
  const u = String(url || "").trim();
  if (!u) return undefined;
  // Gateway interno do Replit não existe na Vercel/Cursor.
  if (/localhost:1106|127\.0\.0\.1:1106|modelfarm|replit/i.test(u)) return undefined;
  return u;
}

/** Monta client OpenAI com fallback legado (Vercel usa OPENAI_API_KEY; Replit usa AI_INTEGRATIONS_*). */
export function resolveOpenAIConfig(): { apiKey: string; baseURL?: string } | null {
  const integrationsKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const integrationsBase = sanitizeOpenAIBaseURL(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
  const legacyKey = process.env.OPENAI_API_KEY;

  if (isUsableOpenAIKey(integrationsKey)) {
    return { apiKey: integrationsKey.trim(), baseURL: integrationsBase };
  }
  if (isUsableOpenAIKey(legacyKey)) {
    // Sem baseURL → SDK usa https://api.openai.com/v1
    return { apiKey: legacyKey.trim(), baseURL: undefined };
  }
  return null;
}
