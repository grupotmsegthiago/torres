/**
 * Catálogo oficial dos ícones de viatura (mapa / grid / cadastro).
 * Polo e Kwid já existiam; Mobi reutiliza o mesmo `vehicles.icon_type`.
 */

export type VehicleIconKey = "polo" | "kwid" | "mobi";

export type VehicleWrapPhotos = {
  front: string;
  left: string;
  rear: string;
  right: string;
};

export type VehicleIconOption = {
  key: VehicleIconKey;
  label: string;
  src: string;
  brand: string;
  model: string;
  color?: string;
  wrap?: VehicleWrapPhotos;
};

export const VEHICLE_ICON_OPTIONS: VehicleIconOption[] = [
  { key: "polo", label: "Polo Track", src: "/polo-icon.webp", brand: "VW", model: "POLO TRACK" },
  { key: "kwid", label: "Renault Kwid", src: "/kwid-icon.png", brand: "RENAULT", model: "KWID" },
  {
    key: "mobi",
    label: "Fiat Mobi Preto",
    src: "/mobi-icon.webp",
    brand: "FIAT",
    model: "MOBI",
    color: "Preto",
    wrap: {
      front: "/mobi-front.jpg",
      left: "/mobi-left.jpg",
      rear: "/mobi-rear.jpg",
      right: "/mobi-right.jpg",
    },
  },
];

export const VEHICLE_ICON_SRC: Record<string, string> = Object.fromEntries(
  VEHICLE_ICON_OPTIONS.map((o) => [o.key, o.src]),
);

export function isVehicleIconKey(key: string): key is VehicleIconKey {
  return VEHICLE_ICON_OPTIONS.some((o) => o.key === key);
}

/** Ícone para mapa/grid: tipo gravado, senão inferência por marca/modelo (ex.: Mobi ainda com default polo). */
export function resolveVehicleIcon(
  iconType?: string | null,
  brand?: string | null,
  model?: string | null,
): VehicleIconKey {
  const key = String(iconType || "").trim().toLowerCase();
  const inferred = inferVehicleIcon(brand, model);
  if (key && key !== "polo" && isVehicleIconKey(key)) return key;
  if (inferred) return inferred;
  if (isVehicleIconKey(key)) return key;
  return "polo";
}

/** Miniatura 3D do Painel Operacional. Virtus está gravado como ícone Polo no cadastro, então a foto segue o modelo. */
export function painelEscoltaThumb(model?: string | null): string {
  const m = String(model || "").toUpperCase();
  if (m.includes("VIRTUS")) return "/assets/escolta-virtus.png";
  if (m.includes("MOBI")) return "/assets/escolta-mobi.png";
  if (m.includes("POLO")) return "/assets/escolta-polo.png";
  return "/assets/escolta-mobi.png";
}

/** Rótulo curto embaixo da placa: Mobi, Polo ou Virtus. */
export function rotuloModeloPainel(model?: string | null): string | null {
  const m = String(model || "").toUpperCase();
  if (m.includes("VIRTUS")) return "Virtus";
  if (m.includes("MOBI")) return "Mobi";
  if (m.includes("POLO")) return "Polo";
  return null;
}

/** VTR-01. O campo frota manda; se estiver vazio, usa o número do kit (KIT TORRES - 01). */
export function rotuloVtr(frota?: string | null, nomeKit?: string | null): string | null {
  const bruto = String(frota || "").trim();
  if (bruto) {
    const numerado = bruto.match(/^vtr\s*-?\s*(\d+)$/i);
    if (numerado) return `VTR-${numerado[1].padStart(2, "0")}`;
    if (/^vtr/i.test(bruto)) return bruto.toUpperCase();
    const num = bruto.match(/\d+/);
    if (num) return `VTR-${num[0].padStart(2, "0")}`;
    return bruto.toUpperCase();
  }
  const kit = String(nomeKit || "").match(/kit\s+torres\s*-\s*(\d+)/i);
  if (!kit) return null;
  return `VTR-${kit[1].padStart(2, "0")}`;
}

export function vehicleIconSrc(
  iconType?: string | null,
  brand?: string | null,
  model?: string | null,
): string {
  return VEHICLE_ICON_SRC[resolveVehicleIcon(iconType, brand, model)] || VEHICLE_ICON_SRC.polo;
}

export function inferVehicleIcon(brand?: string | null, model?: string | null): VehicleIconKey | null {
  const b = String(brand || "").toUpperCase();
  const m = String(model || "").toUpperCase();
  if (m.includes("MOBI")) return "mobi";
  if (m.includes("KWID") || (b.includes("RENAULT") && m.includes("KWID"))) return "kwid";
  if (m.includes("POLO")) return "polo";
  return null;
}

/** MOBI precisa de apólice + contrato de seguro; Polo (e Kwid) não. */
export function vehicleRequiresInsuranceDocs(
  iconType?: string | null,
  brand?: string | null,
  model?: string | null,
): boolean {
  return resolveVehicleIcon(iconType, brand, model) === "mobi";
}

export function isInsuranceDocPresent(value?: string | null): boolean {
  const v = String(value || "").trim();
  return v.length > 0 && v !== "null" && v !== "undefined";
}

/** True = MOBI sem apólice ou sem contrato (lista em vermelho). Polo nunca entra. */
export function isMobiInsuranceIncomplete(opts: {
  iconType?: string | null;
  brand?: string | null;
  model?: string | null;
  insurancePolicyFile?: string | null;
  insuranceContractFile?: string | null;
}): boolean {
  if (!vehicleRequiresInsuranceDocs(opts.iconType, opts.brand, opts.model)) return false;
  return !isInsuranceDocPresent(opts.insurancePolicyFile) || !isInsuranceDocPresent(opts.insuranceContractFile);
}
