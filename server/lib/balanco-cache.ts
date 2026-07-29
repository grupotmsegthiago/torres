import { bustSwrCache } from "./swr-cache";

// Mudança de status/valores de escort_billings muda o que o Balanço Gerencial e o Grid mostram
// ("AGUARDA BOLETIM" vs valor travado do boletim). Sem invalidar, o cache SWR (TTL 3h, com
// snapshot persistido) segue servindo o dado velho até expirar ou alguém clicar "Atualizar"
// (bug TOR-0360, 02/07/2026). Chamar após TODO write que muda status de escort_billings.
export function bustBalancoCaches() {
  bustSwrCache("operational-grid");
  bustSwrCache("financial-dashboard");
  bustSwrCache("rh-summary");
  bustSwrCache("rh-summary-v4");
  bustSwrCache("rh-summary-v5");
  bustSwrCache("rh-summary-v6");
  bustSwrCache("rh-summary-v7");
}

/** Invalida só o cache de RH (salário/custo empresa) — chamar após write em employee_salaries. */
export function bustRhSummaryCache() {
  bustSwrCache("rh-summary");
  bustSwrCache("rh-summary-v4");
  bustSwrCache("rh-summary-v5");
  bustSwrCache("rh-summary-v6");
  bustSwrCache("rh-summary-v7");
}
