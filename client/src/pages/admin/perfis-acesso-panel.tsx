import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  PERMISSION_CATALOG,
  DEFAULT_PROFILE_PERMISSIONS,
  PROFILE_LABELS,
  parsePermissions,
  type PermissionGroup,
} from "@shared/perfis-acesso";

type PerfilRow = { id: number; role: string; label: string; permissions: string };

const GROUPS: PermissionGroup[] = ["Geral", "Comercial", "Operações", "Pessoas", "Controladoria", "Sistema", "Fatura"];

export function PerfisAcessoPanel({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const { data: perfis = [] } = useQuery<PerfilRow[]>({ queryKey: ["/api/auth/perfis"] });
  const [selectedRole, setSelectedRole] = useState("financeiro");
  const stored = perfis.find((p) => p.role === selectedRole);
  const initial = useMemo(() => {
    const fromDb = stored ? parsePermissions(stored.permissions) : DEFAULT_PROFILE_PERMISSIONS[selectedRole] || [];
    return fromDb.includes("*") ? PERMISSION_CATALOG.map((p) => p.key) : [...fromDb];
  }, [stored, selectedRole]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const current = draft ?? initial;

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/auth/perfis/${selectedRole}`, { permissions: current });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/perfis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/perfil"] });
      setDraft(null);
      toast({ title: "Perfil atualizado", description: `Menus e ações do perfil ${PROFILE_LABELS[selectedRole] || selectedRole} foram gravados.` });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar perfil", description: e?.message, variant: "destructive" }),
  });

  const toggle = (key: string, on: boolean) => {
    const next = on ? Array.from(new Set([...current, key])) : current.filter((k) => k !== key);
    setDraft(next);
  };

  return (
    <Card className="p-5 space-y-4" data-testid="panel-perfis-acesso">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">O que cada perfil pode ver e fazer</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Diretoria permanece com acesso total. O perfil Financeiro já nasce com Relatório de NFs, baixa, comprovante e ocorrência.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.keys(PROFILE_LABELS).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => { setSelectedRole(role); setDraft(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
              selectedRole === role ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-600 border-neutral-200"
            }`}
            data-testid={`tab-perfil-${role}`}
          >
            {PROFILE_LABELS[role]}
          </button>
        ))}
      </div>
      {selectedRole === "diretoria" ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">Acesso total — não é editável.</p>
      ) : (
        <>
          {GROUPS.map((group) => {
            const items = PERMISSION_CATALOG.filter((p) => p.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 mb-2">{group}</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {items.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm text-neutral-700 py-1">
                      <Checkbox
                        checked={current.includes(p.key)}
                        disabled={!canEdit}
                        onCheckedChange={(v) => toggle(p.key, v === true)}
                        data-testid={`perm-${selectedRole}-${p.key}`}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {canEdit && (
            <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-perfil">
              {save.isPending ? "Salvando…" : "Salvar perfil"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
