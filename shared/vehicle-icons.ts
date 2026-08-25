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

export function vehicleIconSrc(iconType?: string | null): string {
  const key = String(iconType || "").trim().toLowerCase();
  return VEHICLE_ICON_SRC[key] || VEHICLE_ICON_SRC.polo;
}

export function inferVehicleIcon(brand?: string | null, model?: string | null): VehicleIconKey | null {
  const b = String(brand || "").toUpperCase();
  const m = String(model || "").toUpperCase();
  if ((b.includes("FIAT") || m.includes("FIAT")) && m.includes("MOBI")) return "mobi";
  if (m.includes("KWID") || (b.includes("RENAULT") && m.includes("KWID"))) return "kwid";
  if (m.includes("POLO")) return "polo";
  return null;
}
