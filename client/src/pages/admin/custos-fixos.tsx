import AdminLayout from "@/components/admin/layout";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Edit, Trash2, Calendar, DollarSign, Loader2,
  AlertCircle, Calculator, TrendingDown,
} from "lucide-react";
import type { FixedCost } from "@shared/schema";

const CATEGORIES = [
  "Aluguel",
  "Utilidades",
  "Softwares",
  "Veiculos",
  "Telecom",
  "Marketing",
  "Servicos",
  "Outros",
];

const CATEGORY_COLORS: Record<string, string> = {
  Aluguel: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Utilidades: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Softwares: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Veiculos: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Telecom: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  Marketing: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  Servicos: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Outros: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Summary {
  monthly: number;
  daily: number;
  weekly: number;
  yearly: number;
  porCategoria: Record<string, number>;
}

export default function CustosFixosPage() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<FixedCost | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: list = [], isLoading } = useQuery<FixedCost[]>({
    queryKey: ["/api/fixed-costs"],
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/fixed-costs/summary"],
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/fixed-costs/${id}`),
    onSuccess: () => {
      toast({ title: "Custo fixo excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/summary"] });
    },
    onError: (err: any) => toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/fixed-costs/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/summary"] });
    },
  });

  const handleEdit = (fc: FixedCost) => {
    setEditing(fc);
    setShowForm(true);
  };
  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Building2 className="h-6 w-6" />
              Custos Fixos da Operação
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aluguel, utilidades, softwares e demais despesas mensais recorrentes — base do "Custo de Estar Aberto".
            </p>
          </div>
          <Button onClick={handleNew} data-testid="button-new-fixed-cost">
            <Plus className="h-4 w-4 mr-2" /> Novo Custo Fixo
          </Button>
        </div>

        {/* Cards de rateio */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="p-4 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> Mensal
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-monthly-total">
              {fmtBRL(summary?.monthly ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Soma de todos os custos ativos</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-orange-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calculator className="h-4 w-4" /> Diário (÷30)
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-daily-total">
              {fmtBRL(summary?.daily ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Custo de estar aberto por dia</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-purple-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> Semanal (×7)
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-weekly-total">
              {fmtBRL(summary?.weekly ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Projeção semanal</div>
          </Card>

          <Card className="p-4 border-l-4 border-l-red-500">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4" /> Anual (×12)
            </div>
            <div className="text-2xl font-bold mt-1" data-testid="text-yearly-total">
              {fmtBRL(summary?.yearly ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Compromisso anual</div>
          </Card>
        </div>

        {/* Por Categoria */}
        {summary && Object.keys(summary.porCategoria).length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Distribuição por Categoria
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(summary.porCategoria).map(([cat, val]) => (
                <div
                  key={cat}
                  className="flex items-center justify-between p-2 rounded border"
                  data-testid={`category-summary-${cat}`}
                >
                  <Badge className={CATEGORY_COLORS[cat] || ""}>{cat}</Badge>
                  <span className="text-sm font-semibold">{fmtBRL(val)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Lista */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Custos Cadastrados</h3>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum custo fixo cadastrado.</p>
              <p className="text-xs mt-1">Clique em "Novo Custo Fixo" para começar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 px-2">Descrição</th>
                    <th className="py-2 px-2">Categoria</th>
                    <th className="py-2 px-2 text-right">Valor Mensal</th>
                    <th className="py-2 px-2 text-right">Diário (÷30)</th>
                    <th className="py-2 px-2 text-center">Vencimento</th>
                    <th className="py-2 px-2 text-center">Ativo</th>
                    <th className="py-2 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((fc) => {
                    const monthly = Number(fc.monthlyValue || 0);
                    return (
                      <tr key={fc.id} className="border-b hover:bg-muted/30" data-testid={`row-fixed-cost-${fc.id}`}>
                        <td className="py-2 px-2 font-medium" data-testid={`text-desc-${fc.id}`}>
                          {fc.description}
                          {fc.notes && (
                            <div className="text-xs text-muted-foreground mt-0.5">{fc.notes}</div>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <Badge className={CATEGORY_COLORS[fc.category] || ""}>{fc.category}</Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-semibold" data-testid={`text-monthly-${fc.id}`}>
                          {fmtBRL(monthly)}
                        </td>
                        <td className="py-2 px-2 text-right text-orange-700 dark:text-orange-400">
                          {fmtBRL(monthly / 30)}
                        </td>
                        <td className="py-2 px-2 text-center text-xs">
                          {fc.dueDay ? `Dia ${fc.dueDay}` : "—"}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Switch
                            checked={fc.active}
                            onCheckedChange={(v) => toggleMut.mutate({ id: fc.id, active: v })}
                            data-testid={`switch-active-${fc.id}`}
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(fc)} data-testid={`button-edit-${fc.id}`}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Excluir "${fc.description}"?`)) deleteMut.mutate(fc.id);
                            }}
                            data-testid={`button-delete-${fc.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {showForm && (
        <FixedCostForm
          editing={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </AdminLayout>
  );
}

function FixedCostForm({ editing, onClose }: { editing: FixedCost | null; onClose: () => void }) {
  const { toast } = useToast();
  const isEdit = !!editing;

  const [description, setDescription] = useState(editing?.description || "");
  const [category, setCategory] = useState(editing?.category || "Outros");
  const [monthlyValue, setMonthlyValue] = useState(editing?.monthlyValue?.toString() || "");
  const [dueDay, setDueDay] = useState(editing?.dueDay?.toString() || "");
  const [active, setActive] = useState(editing?.active ?? true);
  const [notes, setNotes] = useState(editing?.notes || "");

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        description: description.trim(),
        category,
        monthlyValue: Number(monthlyValue.replace(",", ".")) || 0,
        dueDay: dueDay ? Number(dueDay) : null,
        active,
        notes: notes.trim() || null,
      };
      if (isEdit) {
        return apiRequest("PATCH", `/api/fixed-costs/${editing.id}`, payload);
      }
      return apiRequest("POST", "/api/fixed-costs", payload);
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Custo atualizado" : "Custo cadastrado" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-costs/summary"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !monthlyValue) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    saveMut.mutate();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Custo Fixo" : "Novo Custo Fixo"}</DialogTitle>
          <DialogDescription>
            Despesas mensais recorrentes da operação (aluguel, internet, software etc.)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="desc">Descrição *</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel da sede, Internet fibra..."
              data-testid="input-description"
              required
            />
          </div>

          <div>
            <Label htmlFor="cat">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="cat" data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="val">Valor Mensal *</Label>
              <Input
                id="val"
                type="number"
                step="0.01"
                min="0"
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(e.target.value)}
                placeholder="0,00"
                data-testid="input-monthly-value"
                required
              />
              {monthlyValue && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {fmtBRL((Number(monthlyValue.replace(",", ".")) || 0) / 30)}/dia
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="due">Dia Vencimento</Label>
              <Input
                id="due"
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="Ex: 10"
                data-testid="input-due-day"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <div className="flex items-center justify-between border rounded p-2">
            <Label htmlFor="active" className="cursor-pointer">Custo ativo (entra no rateio)</Label>
            <Switch id="active" checked={active} onCheckedChange={setActive} data-testid="switch-active" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMut.isPending} data-testid="button-save">
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
