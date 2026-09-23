/**
 * Helpers de data brasileira para inputs (DD/MM/YYYY ↔ YYYY-MM-DD).
 * Reexporta shared/date-key — fonte única, sem segundo motor.
 */
export {
  toDateKey,
  formatDateOnlyBR,
  isValidCalendarYmd,
  ymdToLocalDate,
  localDateToYmd,
  parseBrDateToYmd,
  maskBrDateInput,
  ymdToBrDisplay,
} from "@shared/date-key";
