/**
 * Cálculo do ESPELHO DE PONTO PARA ASSINATURA (documento do colaborador).
 *
 * ATENÇÃO: este módulo é EXCLUSIVO da apresentação do espelho/folha que o
 * colaborador assina. Ele NÃO alimenta custos de folha de pagamento, holerite
 * nem Balanço Gerencial RH — esses continuam em `buildFolhaStats` /
 * `computeWorkedHours` e NÃO devem ser alterados por aqui. (Decisão do dono,
 * 22/06/2026: a nova regra vale só no documento de assinatura.)
 *
 * Regras implementadas (comando do dono):
 *  1) Hora noturna = todo minuto trabalhado entre 22:00 e 05:00 BRT, somado por dia.
 *  2) Virada de meia-noite: um plantão 18:00→05:00 é UM turno só, atribuído ao
 *     dia da ENTRADA, sem zerar nem dividir. As batidas sintéticas 23:59/00:00
 *     (inseridas pra "fechar" o dia) são costuradas de volta num turno contínuo.
 *  3) Por dia: Entrada, Saída intervalo, Retorno intervalo, Saída final,
 *     Total trabalhado, Hora noturna, Horas extras (excedente da jornada).
 *  4) Validação: aponta batidas incompletas / falta de entrada-saída /
 *     horários inconsistentes ANTES da emissão.
 */

import { minuteKeyBRT } from "./control-id-parsers.js";

export interface EspelhoPunchInput {
  punch_at: string | Date;
  source?: string | null;
}

export interface EspelhoJornada {
  ent1: string; sai1: string;
  ent2: string; sai2: string;
  ent3: string; sai3: string;
}

export interface EspelhoTratamento { horario: string; ocorr: string; motivo: string; }

export interface EspelhoDay {
  date: string;        // yyyy-mm-dd (BRT)
  label: string;       // DD/MM/YY
  weekday: string;     // DOM..SAB
  marcacoes: string[]; // horários registrados nesse dia (turnos atribuídos a ele)
  jornada: EspelhoJornada;
  duracao: string;     // HH:MM total trabalhado
  noturno: string;     // HH:MM horas noturnas
  extra: string;       // HH:MM horas extras
  ch: string;
  tratamentos: EspelhoTratamento[];
  issues: string[];    // divergências do dia (validação)
}

export interface EspelhoValidationItem {
  date: string;        // yyyy-mm-dd
  label: string;       // DD/MM/YY
  severity: "erro" | "aviso";
  message: string;
}

export interface EspelhoResult {
  days: EspelhoDay[];
  totalHHMM: string;     // total trabalhado no período
  totalNoturnoHHMM: string;
  totalExtraHHMM: string;
  validation: EspelhoValidationItem[];
  hasBlocking: boolean;  // true se há erro que deveria barrar a emissão
}

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

/** Data BRT (yyyy-mm-dd) de um instante. */
function ymdBRT(d: Date): string {
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

/** "HH:MM" em BRT. */
function fmtBRT(d: Date): string {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo", hour12: false, hour: "2-digit", minute: "2-digit",
  });
}

/** Minutos dentro da faixa noturna (22h–05h BRT) entre dois instantes. */
export function nightMinutesBRT(startMs: number, endMs: number): number {
  if (!(endMs > startMs)) return 0;
  let count = 0;
  for (let t = startMs; t < endMs; t += 60000) {
    const h = Number(new Date(t).toLocaleString("en-US", {
      timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false,
    }));
    if (h >= 22 || h < 5) count++;
  }
  return count;
}

function hhmm(min: number): string {
  if (min <= 0) return "";
  const t = Math.round(min);
  if (t <= 0) return "";
  const h = Math.floor(t / 60), m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True se o instante cai exatamente no minuto 23:59 BRT. */
function isMidnightCloseMarker(d: Date): boolean {
  return fmtBRT(d) === "23:59";
}
/** True se o instante cai em 00:00 ou 00:01 BRT (abertura sintética do dia). */
function isMidnightOpenMarker(d: Date): boolean {
  const t = fmtBRT(d);
  return t === "00:00" || t === "00:01";
}

/**
 * Calcula o espelho para assinatura.
 * @param punches batidas do funcionário cobrindo (no mínimo) [from, to]; pode
 *   conter um pequeno buffer depois de `to` pra capturar o fechamento de turnos
 *   que cruzam a meia-noite do último dia.
 * @param fromYmd / toYmd período BRT (yyyy-mm-dd) a EXIBIR.
 * @param jornadaDiariaMin jornada diária contratual em minutos (p/ horas extras).
 */
export function buildEspelhoPonto(
  punches: EspelhoPunchInput[],
  fromYmd: string,
  toYmd: string,
  jornadaDiariaMin: number,
): EspelhoResult {
  // 1) Ordena + dedup por minuto BRT.
  const sorted = punches
    .filter((p) => p && p.punch_at != null)
    .map((p) => ({ d: typeof p.punch_at === "string" ? new Date(p.punch_at) : p.punch_at, source: p.source ?? null }))
    .filter((p) => p.d.getTime() > 0)
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  const seen = new Set<string>();
  const clean: { d: Date; source: string | null }[] = [];
  for (const p of sorted) {
    const k = minuteKeyBRT(p.d);
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(p);
  }

  // 2) Costura a meia-noite: remove o par sintético [23:59 (saída) , 00:00/00:01
  //    (entrada do dia seguinte)] quando o intervalo entre eles é ínfimo (≤3min).
  //    Isso reconecta um plantão que cruza a meia-noite num turno contínuo.
  const stitched: { d: Date; source: string | null }[] = [];
  for (let i = 0; i < clean.length; i++) {
    const cur = clean[i];
    const next = clean[i + 1];
    if (
      next &&
      isMidnightCloseMarker(cur.d) &&
      isMidnightOpenMarker(next.d) &&
      ymdBRT(next.d) > ymdBRT(cur.d) &&
      (next.d.getTime() - cur.d.getTime()) <= 3 * 60000
    ) {
      i++; // pula AMBAS (cur e next): o turno segue contínuo
      continue;
    }
    stitched.push(cur);
  }

  // 3) Pareamento guloso com TETO de jornada. Uma entrada só forma par com a
  //    próxima batida se o intervalo for ≤ HARD_MAX_GAP (18h). Senão a batida é
  //    uma ENTRADA ÓRFÃ (esqueceu de bater saída) — sinalizada na validação,
  //    nunca emparelhada com uma batida distante (evita "turno" de 168h).
  //    O meal/intervalo vira pares separados naturalmente (a folga entre pares
  //    não é contada). Pares > LONG_SHIFT_WARN (16h) recebem aviso de conferência.
  const HARD_MAX_GAP_MIN = 18 * 60;
  const LONG_SHIFT_WARN_MIN = 16 * 60;
  const SHORT_PAIR_WARN_MIN = 3; // par <=3min: provável batida duplicada
  type Pair = { ent: Date; sai: Date; entSrc: string | null; long: boolean };
  const pairs: Pair[] = [];
  const orphans: Date[] = []; // entradas sem saída
  for (let k = 0; k < stitched.length; ) {
    const ent = stitched[k];
    const nxt = stitched[k + 1];
    if (nxt && (nxt.d.getTime() - ent.d.getTime()) <= HARD_MAX_GAP_MIN * 60000) {
      const durMin = (nxt.d.getTime() - ent.d.getTime()) / 60000;
      pairs.push({ ent: ent.d, sai: nxt.d, entSrc: ent.source, long: durMin > LONG_SHIFT_WARN_MIN });
      k += 2;
    } else {
      orphans.push(ent.d);
      k += 1;
    }
  }

  // 4) Agrupa pares pelo dia BRT da ENTRADA.
  const pairsByDay = new Map<string, Pair[]>();
  for (const p of pairs) {
    const k = ymdBRT(p.ent);
    if (!pairsByDay.has(k)) pairsByDay.set(k, []);
    pairsByDay.get(k)!.push(p);
  }

  const validation: EspelhoValidationItem[] = [];
  const days: EspelhoDay[] = [];
  let totalMin = 0, totalNoturno = 0, totalExtra = 0;

  const labelOf = (cur: Date) =>
    `${String(cur.getDate()).padStart(2, "0")}/${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getFullYear()).slice(-2)}`;

  // 5) Itera dia a dia no período (inclui dias sem batida).
  const cur = new Date(fromYmd + "T12:00:00-03:00");
  const last = new Date(toYmd + "T12:00:00-03:00");
  while (cur.getTime() <= last.getTime()) {
    const ymd = cur.toISOString().slice(0, 10);
    const label = labelOf(cur);
    const weekday = WEEKDAYS[cur.getDay()];
    const dayPairs = (pairsByDay.get(ymd) || []).sort((a, b) => a.ent.getTime() - b.ent.getTime());

    const issues: string[] = [];
    const tratamentos: EspelhoTratamento[] = [];
    let dayMin = 0, dayNoturno = 0;
    const marcacoes: string[] = [];

    for (const p of dayPairs) {
      const entTxt = fmtBRT(p.ent);
      // saída pode cair no dia seguinte (turno noturno): sinaliza com (+1).
      const crossesDay = ymdBRT(p.sai) > ymd;
      const saiTxt = crossesDay ? `${fmtBRT(p.sai)} (+1)` : fmtBRT(p.sai);
      marcacoes.push(entTxt, saiTxt);

      const diffMin = (p.sai.getTime() - p.ent.getTime()) / 60000;
      if (diffMin <= 0) {
        issues.push(`Horário inconsistente: saída ${fmtBRT(p.sai)} não é posterior à entrada ${entTxt}`);
        tratamentos.push({ horario: entTxt, ocorr: "D", motivo: "HORÁRIO INCONSISTENTE" });
        continue;
      }
      if (diffMin <= SHORT_PAIR_WARN_MIN) {
        issues.push(`Par muito curto (${diffMin} min): ${entTxt}→${fmtBRT(p.sai)} — possível batida duplicada`);
        tratamentos.push({ horario: entTxt, ocorr: "P", motivo: "PAR MUITO CURTO — CONFERIR" });
      }
      dayMin += diffMin;
      dayNoturno += nightMinutesBRT(p.ent.getTime(), p.sai.getTime());
      if (p.long) {
        issues.push(`Turno longo (${hhmm(diffMin)}): ${entTxt}→${fmtBRT(p.sai)} — conferir se há batida faltando`);
        tratamentos.push({ horario: entTxt, ocorr: "P", motivo: "TURNO LONGO — CONFERIR" });
      }
      // origem
      const src = (p.entSrc || "").toLowerCase();
      if (src.includes("manual") || src.includes("mobile") || src.includes("web")) {
        tratamentos.push({ horario: entTxt, ocorr: "I", motivo: "MARCAÇÃO MOBILE/WEB" });
      }
    }

    // entradas órfãs (sem saída) que começaram neste dia
    for (const o of orphans) {
      if (ymdBRT(o) !== ymd) continue;
      const t = fmtBRT(o);
      marcacoes.push(t);
      issues.push(`Batida incompleta: entrada ${t} sem saída`);
      tratamentos.push({ horario: t, ocorr: "D", motivo: "ENTRADA SEM SAÍDA" });
    }

    // jornada exibida (até 3 pares)
    const jornada: EspelhoJornada = { ent1: "", sai1: "", ent2: "", sai2: "", ent3: "", sai3: "" };
    const fmtPairSai = (p: Pair) => (ymdBRT(p.sai) > ymd ? `${fmtBRT(p.sai)}` : fmtBRT(p.sai));
    if (dayPairs[0]) { jornada.ent1 = fmtBRT(dayPairs[0].ent); jornada.sai1 = fmtPairSai(dayPairs[0]); }
    if (dayPairs[1]) { jornada.ent2 = fmtBRT(dayPairs[1].ent); jornada.sai2 = fmtPairSai(dayPairs[1]); }
    if (dayPairs[2]) { jornada.ent3 = fmtBRT(dayPairs[2].ent); jornada.sai3 = fmtPairSai(dayPairs[2]); }
    if (dayPairs.length > 3) {
      issues.push(`${dayPairs.length} pares de batida no dia — exibindo os 3 primeiros na jornada`);
    }

    const dayExtra = Math.max(0, dayMin - jornadaDiariaMin);
    totalMin += dayMin;
    totalNoturno += dayNoturno;
    totalExtra += dayExtra;

    for (const iss of issues) {
      validation.push({
        date: ymd, label,
        severity: iss.startsWith("Batida incompleta") || iss.startsWith("Horário inconsistente") ? "erro" : "aviso",
        message: `${label}: ${iss}`,
      });
    }

    days.push({
      date: ymd, label, weekday,
      marcacoes,
      jornada,
      duracao: hhmm(dayMin),
      noturno: hhmm(dayNoturno),
      extra: hhmm(dayExtra),
      ch: "00030",
      tratamentos,
      issues,
    });

    cur.setDate(cur.getDate() + 1);
  }

  const hasBlocking = validation.some((v) => v.severity === "erro");

  return {
    days,
    totalHHMM: hhmm(totalMin),
    totalNoturnoHHMM: hhmm(totalNoturno),
    totalExtraHHMM: hhmm(totalExtra),
    validation,
    hasBlocking,
  };
}
