import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authFetch } from "./queryClient";

export type BalancoMetaFaturamento = {
  mensal: number;
  fonte: "diretoria" | "automatica";
  updatedBy: string | null;
  updatedAt: string | null;
  automatica: {
    diariaViatura: number;
    viaturas: number;
    mensal: number;
  };
};

const QUERY_KEY = ["/api/balanco/meta-faturamento"] as const;

export { metaPeriodoFromMensal } from "@shared/balanco-meta";
export function useBalancoMetaFaturamento() {
  const qc = useQueryClient();
  const query = useQuery<BalancoMetaFaturamento>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch("/api/balanco/meta-faturamento");
      if (!res.ok) throw new Error("Falha ao carregar meta de faturamento");
      return res.json();
    },
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (mensal: number) => {
      const res = await apiRequest("PUT", "/api/balanco/meta-faturamento", { mensal });
      return res.json() as Promise<BalancoMetaFaturamento>;
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/balanco/meta-faturamento");
      return res.json() as Promise<BalancoMetaFaturamento>;
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
    },
  });

  return {
    meta: query.data,
    isLoading: query.isLoading,
    saveMeta: saveMutation.mutateAsync,
    saving: saveMutation.isPending,
    resetMeta: resetMutation.mutateAsync,
    resetting: resetMutation.isPending,
  };
}
