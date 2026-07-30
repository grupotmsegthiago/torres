/**
 * Espelho de ponto para assinatura — usa o motor canônico `jornada-calc`
 * (mesma regra da Folha/Painel): pares diários + cluster ≤2min + cap 19:59.
 */

import {
  computePeriodJornada,
  nightMinutesFromPairs,
  type JornadaPunchInput,
} from "./jornada-calc.js";

export interface EspelhoPunchInput {
  punch_at: string | Date;
  source?: string | null;
  id?: number | null;
}

export interface EspelhoJornada {
  ent1: string; sai1: string;
  ent2: string; sai2: string;
  ent3: string; sai3: string;
}

export interface EspelhoTratamento { horario: string; ocorr: string; motivo: string; }

export interface EspelhoDay {
  date: string;
  label: string;
  weekday: string;
  marcacoes: string[];
  jornada: EspelhoJornada;
  duracao: string;
  noturno: string;
  extra: string;
  ch: string;
  tratamentos: EspelhoTratamento[];
  issues: string[];
}

export interface EspelhoValidationItem {
  date: string;
  label: string;
  severity: "erro" | "aviso";
  message: string;
}

export interface EspelhoResult {
  days: EspelhoDay[];
  totalHHMM: string;
  totalNoturnoHHMM: string;
  totalExtraHHMM: string;
  validation: EspelhoValidationItem[];
  hasBlocking: boolean;
}

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

function ymdBRT(d: Date): string {
  return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
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

export function buildEspelhoPonto(
  punches: EspelhoPunchInput[],
  fromYmd: string,
  toYmd: string,
  jornadaDiariaMin: number,
): EspelhoResult {
  const input: JornadaPunchInput[] = punches
    .filter((p) => p && p.punch_at != null)
    .map((p) => ({
      punch_at: p.punch_at,
      id: p.id ?? null,
      source: p.source ?? null,
    }));

  const period = computePeriodJornada(input);
  const byDay = new Map(period.days.map((d) => [d.day, d]));

  const validation: EspelhoValidationItem[] = [];
  const days: EspelhoDay[] = [];
  let totalMin = 0, totalNoturno = 0, totalExtra = 0;

  const labelOf = (cur: Date) =>
    `${String(cur.getDate()).padStart(2, "0")}/${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getFullYear()).slice(-2)}`;

  const cur = new Date(fromYmd + "T12:00:00-03:00");
  const last = new Date(toYmd + "T12:00:00-03:00");
  while (cur.getTime() <= last.getTime()) {
    const ymd = cur.toISOString().slice(0, 10);
    const label = labelOf(cur);
    const weekday = WEEKDAYS[cur.getDay()];
    const dayJ = byDay.get(ymd);
    const issues: string[] = [];
    const tratamentos: EspelhoTratamento[] = [];
    const marcacoes: string[] = [];

    let dayMin = 0;
    let dayNoturno = 0;
    const jornada: EspelhoJornada = { ent1: "", sai1: "", ent2: "", sai2: "", ent3: "", sai3: "" };

    if (dayJ) {
      for (const pr of dayJ.pairs) {
        const entTxt = pr.entrada.hhmm;
        const crossesDay = ymdBRT(pr.saida.at) > ymd;
        const saiTxt = crossesDay ? `${pr.saida.hhmm} (+1)` : pr.saida.hhmm;
        marcacoes.push(entTxt, saiTxt);
        if (pr.durationMin <= 3) {
          issues.push(`Par muito curto (${pr.durationMin} min): ${entTxt}→${pr.saida.hhmm} — possível batida duplicada`);
          tratamentos.push({ horario: entTxt, ocorr: "P", motivo: "PAR MUITO CURTO — CONFERIR" });
        }
        if (pr.durationMin > 16 * 60) {
          issues.push(`Turno longo (${hhmm(pr.durationMin)}): ${entTxt}→${pr.saida.hhmm} — conferir`);
          tratamentos.push({ horario: entTxt, ocorr: "P", motivo: "TURNO LONGO — CONFERIR" });
        }
        const src = (pr.entrada.source || "").toLowerCase();
        if (src.includes("manual") || src.includes("mobile") || src.includes("web")) {
          tratamentos.push({ horario: entTxt, ocorr: "I", motivo: "MARCAÇÃO MOBILE/WEB" });
        }
      }
      for (const o of dayJ.orphans) {
        marcacoes.push(o.hhmm);
        issues.push(`Batida incompleta: entrada ${o.hhmm} sem saída`);
        tratamentos.push({ horario: o.hhmm, ocorr: "D", motivo: "ENTRADA SEM SAÍDA" });
      }
      for (const c of dayJ.clusters) {
        if (c.ambiguous) {
          issues.push(`Cluster ambíguo (${c.punches.map((x) => x.hhmm).join("/")}): revisar proximidade ≤2min`);
          tratamentos.push({
            horario: c.representative.hhmm,
            ocorr: "P",
            motivo: "CLUSTER AMBÍGUO — REVISAR",
          });
        }
      }

      if (dayJ.pairs[0]) {
        jornada.ent1 = dayJ.pairs[0].entrada.hhmm;
        jornada.sai1 = dayJ.pairs[0].saida.hhmm;
      }
      if (dayJ.pairs[1]) {
        jornada.ent2 = dayJ.pairs[1].entrada.hhmm;
        jornada.sai2 = dayJ.pairs[1].saida.hhmm;
      }
      if (dayJ.pairs[2]) {
        jornada.ent3 = dayJ.pairs[2].entrada.hhmm;
        jornada.sai3 = dayJ.pairs[2].saida.hhmm;
      }
      if (dayJ.pairs.length > 3) {
        issues.push(`${dayJ.pairs.length} pares de batida no dia — exibindo os 3 primeiros na jornada`);
      }

      dayMin = dayJ.workedMin;
      dayNoturno = nightMinutesFromPairs(dayJ.pairs);
      for (const iss of dayJ.issues) {
        if (!issues.some((x) => x.includes(iss.slice(0, 20)))) issues.push(iss);
      }
    }

    const dayExtra = Math.max(0, dayMin - jornadaDiariaMin);
    totalMin += dayMin;
    totalNoturno += dayNoturno;
    totalExtra += dayExtra;

    for (const iss of issues) {
      validation.push({
        date: ymd,
        label,
        severity: iss.startsWith("Batida incompleta") || iss.startsWith("Horário inconsistente") ? "erro" : "aviso",
        message: `${label}: ${iss}`,
      });
    }

    days.push({
      date: ymd,
      label,
      weekday,
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

  return {
    days,
    totalHHMM: hhmm(totalMin),
    totalNoturnoHHMM: hhmm(totalNoturno),
    totalExtraHHMM: hhmm(totalExtra),
    validation,
    hasBlocking: validation.some((v) => v.severity === "erro"),
  };
}
