export type ItemCategoria = {
  name?: string | null;
  parent_name?: string | null;
  sort_order?: number | null;
};

export function porOrdemCategoria<T extends ItemCategoria>(lista: T[]): T[] {
  return [...lista].sort((a, b) => (a.sort_order ?? 1_000_000) - (b.sort_order ?? 1_000_000));
}

export function gruposNaOrdem<T extends ItemCategoria>(lista: T[]): string[] {
  const nomes: string[] = [];
  for (const item of porOrdemCategoria(lista)) {
    const nome = String(item.parent_name || "").trim();
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}
