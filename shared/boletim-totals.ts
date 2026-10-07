// Regra pura compartilhada por backend, telas e documentos do boletim.
export const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export const osCanonicalTotal = (b: any) =>
  round2(
    Number(b.fat_acionamento || 0) +
    Number(b.fat_hora_extra || 0) +
    Number(b.fat_km || 0) +
    Number(b.fat_adicional_noturno || 0) +
    Number(b.fat_estadia || 0) +
    Number(b.fat_pernoite || 0) +
    Number(b.despesas_pedagio || 0) +
    Number(b.despesas_outras || 0) +
    Number(b.receitas_os || 0),
  );

export const billingTotalForBoletim = (b: any, osStatus?: string) => {
  if (osStatus === "recusada") return 0;
  const ft = round2(Number(b.fat_total || 0));
  return ft > 0 ? ft : osCanonicalTotal(b);
};

const STORED_CHARGE_STATUS = new Set([
  "APROVADA",
  "ENVIADA_APROVACAO",
  "FATURADO",
  "FATURADA",
  "PAGO",
]);

export const chargeIsStored = (billingStatus?: string | null) =>
  STORED_CHARGE_STATUS.has(String(billingStatus || "").toUpperCase());

export const boletimOsNumber = (billing: any, serviceOrder?: any) => {
  const official = String(serviceOrder?.os_number || serviceOrder?.osNumber || "").trim();
  if (official) return official;
  const copied = String(billing?.os_number || "").trim();
  if (copied && !/^OS-\d+$/i.test(copied)) return copied;
  const id = billing?.service_order_id ?? serviceOrder?.id;
  return id != null && id !== "" ? `OS-${id}` : "—";
};
