export type ClasseKit = "38" | "12" | "pistola";

const ORDEM: ClasseKit[] = ["38", "12", "pistola"];

function texto(valor?: string | null): string {
  return (valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Revólver .38, espingarda 12 ou pistola. O .380 não cai no .38. */
export function classeDaArma(type?: string | null, caliber?: string | null): ClasseKit | null {
  const tipo = texto(type);
  const calibre = texto(caliber).replace(/\s/g, "");
  if (tipo.includes("pistola") || calibre.includes("380")) return "pistola";
  if (tipo.includes("espingarda") || calibre.includes("12ga") || calibre === "12") return "12";
  if (tipo.includes("revolver") || calibre === ".38" || calibre === "38") return "38";
  return null;
}

export function classesDoKit(armas: { type?: string | null; caliber?: string | null }[]): ClasseKit[] {
  const presentes = new Set<ClasseKit>();
  for (const arma of armas) {
    const classe = classeDaArma(arma?.type, arma?.caliber);
    if (classe) presentes.add(classe);
  }
  return ORDEM.filter((classe) => presentes.has(classe));
}

/** O nome do kit traz a placa. TMGOE12 e TMG0E12 são a mesma viatura. */
export function kitCompativelComPlaca(nomeKit: string, plate: string): boolean {
  const chave = (valor: string) => valor.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
  const placa = chave(plate);
  if (placa.length < 7) return false;
  return chave(nomeKit).includes(placa);
}
