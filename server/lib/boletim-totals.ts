// Helpers PUROS (sem dependência de banco) para o total de uma OS no Boletim de
// Medição. Centralizados aqui para serem testáveis e usados de forma IDÊNTICA
// no e-mail, no anexo Excel, no snapshot congelado e na tela do sistema.

export const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

// Soma dos 9 componentes financeiros do escort_billing.
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

// Total da OS NO BOLETIM, espelhando exatamente o getBillingTotal da tela do
// sistema (a fonte da verdade que o dono confere): OS recusada = R$0 SEMPRE
// (§8.1 INTOCÁVEL); caso contrário usa o fat_total persistido quando > 0, com
// fallback para a soma dos 9 componentes. Garante tela == e-mail == anexo Excel
// == snapshot. NUNCA somar recusada a valor cheio aqui (era o bug dos R$ a mais).
export const billingTotalForBoletim = (b: any, osStatus?: string) => {
  if (osStatus === "recusada") return 0;
  const ft = round2(Number(b.fat_total || 0));
  return ft > 0 ? ft : osCanonicalTotal(b);
};
