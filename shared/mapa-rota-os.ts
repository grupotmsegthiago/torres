export type PapelPonto = "origem" | "destino" | "viatura";

export type PontoRota = {
  lat: number;
  lng: number;
  papel: PapelPonto;
};

export function coordNoBrasil(lat: unknown, lng: unknown): lat is number {
  const la = typeof lat === "number" ? lat : Number(lat);
  const ln = typeof lng === "number" ? lng : Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln)
    && la !== 0 && ln !== 0
    && la >= -35 && la <= 6
    && ln >= -75 && ln <= -30;
}

export function pontosDaRota(origem: {
  origemLat?: unknown;
  origemLng?: unknown;
  destinoLat?: unknown;
  destinoLng?: unknown;
  posLat?: unknown;
  posLng?: unknown;
}): PontoRota[] {
  const pontos: PontoRota[] = [];
  const por = (lat: unknown, lng: unknown, papel: PapelPonto) => {
    const la = typeof lat === "number" ? lat : Number(lat);
    const ln = typeof lng === "number" ? lng : Number(lng);
    if (!coordNoBrasil(la, ln)) return;
    pontos.push({ lat: la, lng: ln, papel });
  };
  por(origem.origemLat, origem.origemLng, "origem");
  por(origem.destinoLat, origem.destinoLng, "destino");
  por(origem.posLat, origem.posLng, "viatura");
  return pontos;
}
