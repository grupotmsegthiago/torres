import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneBR, formatCepBR } from "@/lib/format-contact";
import { getContactIssues, validateContactFields } from "@shared/contact-validation";

type ContactRecord = { id: number | string } & Record<string, unknown>;

type RowState = {
  id: number | string;
  name: string;
  phone: string;
  zip: string;
  status: "pending" | "saving" | "ok" | "error";
  error?: string;
};

export interface BulkFixContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: ContactRecord[];
  /** Field name in the record for the phone (digit-only stored). */
  phoneField: string;
  /** Field name in the record for the zip (digit-only stored). */
  zipField: string;
  /** Field name for the human-readable label (e.g. "name"). */
  labelField: string;
  /** PATCH URL prefix — final URL will be `${endpointPrefix}/${id}`. */
  endpointPrefix: string;
  /** Query key(s) to invalidate after saving. */
  invalidateKeys: Array<readonly unknown[]>;
  title: string;
  /** Optional alias label for entity (e.g. "cliente", "funcionário", "lead"). */
  entityLabel?: string;
}

export function BulkFixContactsDialog({
  open,
  onOpenChange,
  records,
  phoneField,
  zipField,
  labelField,
  endpointPrefix,
  invalidateKeys,
  title,
  entityLabel = "registro",
}: BulkFixContactsDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<RowState[]>([]);
  const [savingAll, setSavingAll] = useState(false);

  const incomplete = useMemo(
    () => records.filter(r => getContactIssues(r, { phones: [phoneField], zips: [zipField] }).length > 0),
    [records, phoneField, zipField],
  );

  useEffect(() => {
    if (!open) return;
    setRows(
      incomplete.map(r => ({
        id: r.id,
        name: String(r[labelField] || `#${r.id}`),
        phone: r[phoneField] ? formatPhoneBR(String(r[phoneField])) : "",
        zip: r[zipField] ? formatCepBR(String(r[zipField])) : "",
        status: "pending",
      })),
    );
  }, [open, incomplete, labelField, phoneField, zipField]);

  const validateRow = (row: RowState): string | null => {
    const issues = validateContactFields(
      { [phoneField]: row.phone.replace(/\D/g, ""), [zipField]: row.zip.replace(/\D/g, "") },
      { phones: [phoneField], zips: [zipField] },
    );
    return issues.length ? issues[0].message : null;
  };

  const handleSaveAll = async () => {
    const initialIssues = rows
      .map((r, idx) => ({ idx, err: r.status === "ok" ? null : validateRow(r) }))
      .filter(x => x.err);
    if (initialIssues.length) {
      setRows(prev =>
        prev.map((r, idx) => {
          const issue = initialIssues.find(x => x.idx === idx);
          return issue ? { ...r, status: "error", error: issue.err! } : r;
        }),
      );
      toast({
        title: "Corrija os campos destacados",
        description: `${initialIssues.length} ${entityLabel}(s) ainda inválido(s).`,
        variant: "destructive",
      });
      return;
    }

    setSavingAll(true);
    let ok = 0;
    let fail = 0;
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status === "ok") continue;
      next[i] = { ...next[i], status: "saving", error: undefined };
      setRows([...next]);
      try {
        const phoneDigits = next[i].phone.replace(/\D/g, "");
        const zipDigits = next[i].zip.replace(/\D/g, "");
        const payload: Record<string, string | null> = {
          [phoneField]: phoneDigits || null,
          [zipField]: zipDigits || null,
        };
        await apiRequest("PATCH", `${endpointPrefix}/${next[i].id}`, payload);
        next[i] = { ...next[i], status: "ok" };
        ok++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao salvar";
        next[i] = { ...next[i], status: "error", error: msg };
        fail++;
      }
      setRows([...next]);
    }
    setSavingAll(false);

    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }

    if (fail === 0) {
      toast({ title: `${ok} ${entityLabel}(s) corrigido(s)` });
      onOpenChange(false);
    } else {
      toast({
        title: `${ok} salvo(s), ${fail} com erro`,
        description: "Verifique os destacados em vermelho e tente novamente.",
        variant: "destructive",
      });
    }
  };

  const allDone = rows.length > 0 && rows.every(r => r.status === "ok");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!savingAll) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-bulk-fix-contacts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Edite telefone e CEP em linha e salve tudo de uma vez. Telefone aceita 10 (fixo) ou 11 (celular) dígitos; CEP aceita 8 dígitos. Deixe em branco para limpar o campo.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-sm">
            Nenhum {entityLabel} com telefone ou CEP incompleto.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto border border-neutral-200 rounded-md">
            <table className="w-full text-sm" data-testid="table-bulk-fix-contacts">
              <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider w-44">Telefone</th>
                  <th className="text-left px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider w-36">CEP</th>
                  <th className="text-center px-3 py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-wider w-12">St</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const originalIssues = getContactIssues(
                    { [phoneField]: row.phone.replace(/\D/g, ""), [zipField]: row.zip.replace(/\D/g, "") },
                    { phones: [phoneField], zips: [zipField] },
                  );
                  const phoneBad = originalIssues.some(i => i.kind !== "zip_invalid");
                  const zipBad = originalIssues.some(i => i.kind === "zip_invalid");
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-neutral-100 ${row.status === "error" ? "bg-red-50" : row.status === "ok" ? "bg-emerald-50" : ""}`}
                      data-testid={`row-bulk-fix-${row.id}`}
                    >
                      <td className="px-3 py-2 font-medium text-neutral-800" title={row.error}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[260px]">{row.name}</span>
                        </div>
                        {row.error && (
                          <p className="text-[10px] text-red-700 font-semibold mt-0.5" data-testid={`error-bulk-fix-${row.id}`}>{row.error}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.phone}
                          disabled={savingAll || row.status === "ok"}
                          onChange={e => {
                            const masked = formatPhoneBR(e.target.value);
                            setRows(prev => prev.map((r, i) => i === idx ? { ...r, phone: masked, status: "pending", error: undefined } : r));
                          }}
                          placeholder="(11) 91234-5678"
                          className={`w-full px-2 py-1.5 text-xs font-mono border rounded ${phoneBad ? "border-red-300 bg-red-50/50" : "border-neutral-200"}`}
                          data-testid={`input-bulk-fix-phone-${row.id}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.zip}
                          disabled={savingAll || row.status === "ok"}
                          onChange={e => {
                            const masked = formatCepBR(e.target.value);
                            setRows(prev => prev.map((r, i) => i === idx ? { ...r, zip: masked, status: "pending", error: undefined } : r));
                          }}
                          placeholder="01310-100"
                          className={`w-full px-2 py-1.5 text-xs font-mono border rounded ${zipBad ? "border-red-300 bg-red-50/50" : "border-neutral-200"}`}
                          data-testid={`input-bulk-fix-zip-${row.id}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.status === "saving" && <Loader2 className="w-4 h-4 animate-spin text-neutral-400 mx-auto" />}
                        {row.status === "ok" && <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" data-testid={`status-ok-${row.id}`} />}
                        {row.status === "error" && <XCircle className="w-4 h-4 text-red-600 mx-auto" data-testid={`status-err-${row.id}`} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
          <p className="text-xs text-neutral-500">
            {rows.length} {entityLabel}(s) listado(s)
            {(() => {
              const okCount = rows.filter(r => r.status === "ok").length;
              const errCount = rows.filter(r => r.status === "error").length;
              if (!okCount && !errCount) return null;
              return ` · ${okCount} salvo(s)${errCount ? ` · ${errCount} com erro` : ""}`;
            })()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={savingAll}
              data-testid="button-bulk-fix-cancel"
            >
              {allDone ? "Fechar" : "Cancelar"}
            </Button>
            <Button
              onClick={handleSaveAll}
              disabled={savingAll || rows.length === 0 || allDone}
              data-testid="button-bulk-fix-save"
            >
              {savingAll ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : `Salvar tudo (${rows.filter(r => r.status !== "ok").length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
