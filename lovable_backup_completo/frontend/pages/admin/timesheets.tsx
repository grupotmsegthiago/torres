import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import type { Timesheet, Employee } from "@shared/schema";

function TimesheetForm({ timesheet, employees, onClose }: {
  timesheet?: Timesheet; employees: Employee[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    employeeId: timesheet?.employeeId || 0,
    date: timesheet?.date || new Date().toISOString().slice(0, 10),
    checkIn: timesheet?.checkIn || "",
    checkOutLunch: timesheet?.checkOutLunch || "",
    checkInLunch: timesheet?.checkInLunch || "",
    checkOut: timesheet?.checkOut || "",
    hoursWorked: timesheet?.hoursWorked || "",
    overtime: timesheet?.overtime || "",
    notes: timesheet?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = {
        ...data,
        employeeId: Number(data.employeeId),
        hoursWorked: data.hoursWorked ? String(data.hoursWorked) : null,
        overtime: data.overtime ? String(data.overtime) : null,
      };
      if (timesheet) {
        await apiRequest("PATCH", `/api/timesheets/${timesheet.id}`, payload);
      } else {
        await apiRequest("POST", "/api/timesheets", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      toast({ title: timesheet ? "Ponto atualizado" : "Ponto registrado" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-timesheet-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{timesheet ? "Editar Ponto" : "Novo Registro de Ponto"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Funcionário *</label>
          <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: Number(e.target.value) })} className="w-full h-10 border border-neutral-300 rounded-lg px-3.5 py-2.5 text-sm bg-white shadow-sm focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10 outline-none transition-all duration-200" required data-testid="select-timesheet-employee">
            <option value={0}>Selecione...</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Data *</label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required data-testid="input-timesheet-date" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Entrada</label>
          <Input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} data-testid="input-timesheet-checkin" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Saída Almoço</label>
          <Input type="time" value={form.checkOutLunch} onChange={(e) => setForm({ ...form, checkOutLunch: e.target.value })} data-testid="input-timesheet-checkout-lunch" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Retorno Almoço</label>
          <Input type="time" value={form.checkInLunch} onChange={(e) => setForm({ ...form, checkInLunch: e.target.value })} data-testid="input-timesheet-checkin-lunch" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Saída</label>
          <Input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} data-testid="input-timesheet-checkout" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Horas Trabalhadas</label>
          <Input type="number" step="0.01" value={form.hoursWorked} onChange={(e) => setForm({ ...form, hoursWorked: e.target.value })} data-testid="input-timesheet-hours" />
        </div>
        <div>
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Horas Extras</label>
          <Input type="number" step="0.01" value={form.overtime} onChange={(e) => setForm({ ...form, overtime: e.target.value })} data-testid="input-timesheet-overtime" />
        </div>
        <div className="md:col-span-3">
          <label className="text-sm font-semibold text-neutral-700 mb-1.5 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-timesheet-notes" />
        </div>
        <div className="md:col-span-3 flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-timesheet">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

export default function TimesheetsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Timesheet | undefined>();
  const { toast } = useToast();
  const { user } = useAuth();
  const isDiretoria = user?.role === "diretoria";
  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/timesheets/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] }); toast({ title: "Ponto removido" }); },
  });

  const getEmployeeName = (id: number) => (employees || []).find((e) => e.id === id)?.name || "-";

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-timesheets-title">Folha de Ponto</h1>
          <p className="text-sm text-neutral-500 mt-1">Controle de ponto dos funcionários</p>
        </div>
        <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-timesheet">
          <Plus className="w-4 h-4 mr-2" /> Novo Registro
        </Button>
      </div>

      {showForm && <TimesheetForm timesheet={editItem} employees={employees || []} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : (timesheets || []).length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhum ponto registrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-timesheets">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Funcionário</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Entrada</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Saída Almoço</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ret. Almoço</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Saída</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Horas</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(timesheets || []).map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-timesheet-${t.id}`}>
                    <td className="p-3 text-neutral-900">{t.date}</td>
                    <td className="p-3 font-medium text-neutral-900">{getEmployeeName(t.employeeId)}</td>
                    <td className="p-3 text-neutral-600">{t.checkIn || "-"}</td>
                    <td className="p-3 text-neutral-600">{t.checkOutLunch || "-"}</td>
                    <td className="p-3 text-neutral-600">{t.checkInLunch || "-"}</td>
                    <td className="p-3 text-neutral-600">{t.checkOut || "-"}</td>
                    <td className="p-3 text-neutral-600">{t.hoursWorked || "-"}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditItem(t); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                      {isDiretoria && <Button variant="ghost" size="icon" onClick={() => { if (window.confirm("Excluir este ponto?")) deleteMutation.mutate(t.id); }}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
