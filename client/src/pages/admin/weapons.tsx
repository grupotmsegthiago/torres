import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn, authFetch } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Link2, Unlink, FileText, History, Search, Upload, AlertTriangle, ScanLine, Loader2, FileUp, CheckCircle2, XCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import type { Weapon, WeaponAssignment, Employee } from "@shared/schema";

const WEAPON_TYPES = ["Revólver", "Pistola", "Espingarda", "Carabina", "Fuzil", "Outro"];
const CALIBERS = [".38", ".380 ACP", "9mm", ".40 S&W", ".45 ACP", "12 GA", "5.56x45mm", ".308 Win", "Outro"];

function isExpiringSoon(dateStr: string | null): "expired" | "warning" | "ok" {
  if (!dateStr) return "ok";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "expired";
  if (diffDays < 30) return "warning";
  return "ok";
}

type ExtractedWeapon = {
  type: string;
  brand: string;
  model: string;
  caliber: string;
  serialNumber: string;
  registrationNumber: string;
  registrationExpiry: string;
  notes: string;
  selected: boolean;
};

function BatchImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "scanning" | "review" | "saving" | "done">("upload");
  const [extracted, setExtracted] = useState<ExtractedWeapon[]>([]);
  const [documentType, setDocumentType] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [results, setResults] = useState<{ success: number; errors: { index: number; error: string }[] } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }

    setStep("scanning");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target!.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await authFetch("/api/weapons/ocr-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro ao processar");
      }

      const data = await res.json();
      if (!data.weapons || data.weapons.length === 0) {
        toast({ title: "Nenhuma arma encontrada", description: "A IA não identificou armas no documento. Tente com outro documento.", variant: "destructive" });
        setStep("upload");
        return;
      }

      setExtracted(data.weapons.map((w: any) => ({ ...w, selected: true })));
      setDocumentType(data.documentType || "Documento");
      setStep("review");
    } catch (err: any) {
      toast({ title: "Erro ao processar", description: err.message, variant: "destructive" });
      setStep("upload");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateWeapon = (idx: number, field: string, value: string) => {
    setExtracted(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  };

  const toggleSelect = (idx: number) => {
    setExtracted(prev => prev.map((w, i) => i === idx ? { ...w, selected: !w.selected } : w));
  };

  const handleSave = async () => {
    const selected = extracted.filter(w => w.selected);
    if (selected.length === 0) {
      toast({ title: "Nenhuma arma selecionada", variant: "destructive" });
      return;
    }

    const incomplete = selected.filter(w => !w.type || !w.brand || !w.model || !w.caliber || !w.serialNumber);
    if (incomplete.length > 0) {
      toast({ title: "Dados incompletos", description: `${incomplete.length} arma(s) sem campos obrigatórios (tipo, marca, modelo, calibre, nº série)`, variant: "destructive" });
      return;
    }

    setStep("saving");
    try {
      const weaponList = selected.map(({ selected: _, ...w }) => ({
        ...w,
        status: "disponível",
      }));

      const res = await authFetch("/api/weapons/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weapons: weaponList }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro ao salvar");
      }

      const data = await res.json();
      setResults({ success: data.success.length, errors: data.errors });
      queryClient.invalidateQueries({ queryKey: ["/api/weapons"] });
      setStep("done");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
      setStep("review");
    }
  };

  const selectedCount = extracted.filter(w => w.selected).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setStep("upload"); setExtracted([]); setResults(null); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-neutral-600" />
            Importação Inteligente de Armas
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="py-6">
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
            <div
              className="border-2 border-dashed border-neutral-300 rounded-xl bg-neutral-50 p-8 text-center cursor-pointer hover:border-neutral-400 transition-colors"
              onClick={() => fileRef.current?.click()}
              data-testid="batch-upload-area"
            >
              <FileUp className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
              <p className="text-base font-medium text-neutral-700">Anexe o documento com as armas</p>
              <p className="text-sm text-neutral-500 mt-2">
                PDF ou foto de lista de armamento, CR, CRAF, planilha, etc.
              </p>
              <p className="text-xs text-neutral-400 mt-3">
                A IA vai identificar e extrair todas as armas automaticamente
              </p>
              <Button variant="outline" className="mt-4" type="button">
                <Upload className="w-4 h-4 mr-2" /> Selecionar Arquivo
              </Button>
            </div>
          </div>
        )}

        {step === "scanning" && (
          <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 text-neutral-500 mx-auto animate-spin mb-4" />
            <p className="text-base font-medium text-neutral-700">Analisando documento...</p>
            <p className="text-sm text-neutral-400 mt-2">A IA está identificando e extraindo os dados das armas</p>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-neutral-50 rounded-lg p-3">
              <div>
                <p className="text-sm font-medium text-neutral-700">
                  {extracted.length} arma(s) encontrada(s)
                </p>
                <p className="text-xs text-neutral-500">Documento: {documentType}</p>
              </div>
              <p className="text-xs text-neutral-500">{selectedCount} selecionada(s)</p>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {extracted.map((w, idx) => (
                <div key={idx} className={`border rounded-lg transition-colors ${w.selected ? "border-neutral-300 bg-white" : "border-neutral-200 bg-neutral-50 opacity-60"}`} data-testid={`batch-weapon-${idx}`}>
                  <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                    <input
                      type="checkbox"
                      checked={w.selected}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(idx); }}
                      className="w-4 h-4 rounded border-neutral-300"
                      data-testid={`checkbox-weapon-${idx}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-neutral-900">{w.brand || "?"} {w.model || "?"}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-600">{w.type || "?"}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-600">{w.caliber || "?"}</span>
                      </div>
                      <p className="text-xs text-neutral-500 truncate">
                        Série: {w.serialNumber || "—"} {w.registrationNumber ? `| Reg: ${w.registrationNumber}` : ""}
                      </p>
                    </div>
                    {(!w.type || !w.brand || !w.model || !w.caliber || !w.serialNumber) && (
                      <span title="Campos obrigatórios faltando"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /></span>
                    )}
                    {expandedIdx === idx ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                  </div>

                  {expandedIdx === idx && (
                    <div className="px-3 pb-3 border-t border-neutral-100 pt-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Tipo *</label>
                          <select value={w.type} onChange={(e) => updateWeapon(idx, "type", e.target.value)} className="w-full border border-neutral-200 rounded px-2 py-1.5 text-xs" data-testid={`batch-type-${idx}`}>
                            <option value="">Selecione...</option>
                            {WEAPON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Marca *</label>
                          <Input value={w.brand} onChange={(e) => updateWeapon(idx, "brand", e.target.value)} className="h-7 text-xs" data-testid={`batch-brand-${idx}`} />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Modelo *</label>
                          <Input value={w.model} onChange={(e) => updateWeapon(idx, "model", e.target.value)} className="h-7 text-xs" data-testid={`batch-model-${idx}`} />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Calibre *</label>
                          <select value={w.caliber} onChange={(e) => updateWeapon(idx, "caliber", e.target.value)} className="w-full border border-neutral-200 rounded px-2 py-1.5 text-xs" data-testid={`batch-caliber-${idx}`}>
                            <option value="">Selecione...</option>
                            {CALIBERS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Nº Série *</label>
                          <Input value={w.serialNumber} onChange={(e) => updateWeapon(idx, "serialNumber", e.target.value)} className="h-7 text-xs font-mono" data-testid={`batch-serial-${idx}`} />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Nº Registro</label>
                          <Input value={w.registrationNumber} onChange={(e) => updateWeapon(idx, "registrationNumber", e.target.value)} className="h-7 text-xs" data-testid={`batch-reg-${idx}`} />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-500 block">Validade Registro</label>
                          <Input type="date" value={w.registrationExpiry} onChange={(e) => updateWeapon(idx, "registrationExpiry", e.target.value)} className="h-7 text-xs" data-testid={`batch-expiry-${idx}`} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-neutral-500 block">Obs</label>
                          <Input value={w.notes} onChange={(e) => updateWeapon(idx, "notes", e.target.value)} className="h-7 text-xs" data-testid={`batch-notes-${idx}`} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => { setStep("upload"); setExtracted([]); }}>
                Voltar
              </Button>
              <Button onClick={handleSave} disabled={selectedCount === 0} data-testid="button-batch-save">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Cadastrar {selectedCount} arma(s)
              </Button>
            </div>
          </div>
        )}

        {step === "saving" && (
          <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 text-neutral-500 mx-auto animate-spin mb-4" />
            <p className="text-base font-medium text-neutral-700">Cadastrando armas...</p>
            <p className="text-sm text-neutral-400 mt-2">Salvando {selectedCount} registro(s)</p>
          </div>
        )}

        {step === "done" && results && (
          <div className="py-6 space-y-4">
            <div className="text-center">
              {results.success > 0 && (
                <div className="flex items-center justify-center gap-2 text-green-700 mb-2">
                  <CheckCircle2 className="w-8 h-8" />
                  <span className="text-lg font-semibold">{results.success} arma(s) cadastrada(s)</span>
                </div>
              )}
              {results.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-red-600 font-medium mb-2">{results.errors.length} erro(s):</p>
                  <div className="space-y-1">
                    {results.errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-600 bg-red-50 rounded px-3 py-1.5 flex items-start gap-1.5">
                        <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>Arma {e.index + 1}: {e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-center pt-2">
              <Button onClick={() => { onClose(); setStep("upload"); setExtracted([]); setResults(null); }} data-testid="button-batch-close">
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WeaponForm({ weapon, onClose }: { weapon?: Weapon; onClose: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({
    type: weapon?.type || "",
    brand: weapon?.brand || "",
    model: weapon?.model || "",
    caliber: weapon?.caliber || "",
    serialNumber: weapon?.serialNumber || "",
    registrationNumber: weapon?.registrationNumber || "",
    registrationExpiry: weapon?.registrationExpiry || "",
    registrationFileData: weapon?.registrationFileData || "",
    status: weapon?.status || "disponível",
    notes: weapon?.notes || "",
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, registrationFileData: ev.target!.result as string }));
      toast({ title: "Arquivo anexado" });
    };
    reader.readAsDataURL(file);
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 10MB", variant: "destructive" });
      return;
    }

    setScanning(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target!.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setForm(prev => ({ ...prev, registrationFileData: dataUrl }));

      const res = await authFetch("/api/weapons/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erro ao processar");
      }

      const extracted = await res.json();

      setForm(prev => ({
        ...prev,
        type: extracted.type && WEAPON_TYPES.includes(extracted.type) ? extracted.type : prev.type,
        brand: extracted.brand || prev.brand,
        model: extracted.model || prev.model,
        caliber: extracted.caliber && CALIBERS.includes(extracted.caliber) ? extracted.caliber : prev.caliber,
        serialNumber: extracted.serialNumber || prev.serialNumber,
        registrationNumber: extracted.registrationNumber || prev.registrationNumber,
        registrationExpiry: extracted.registrationExpiry || prev.registrationExpiry,
        notes: extracted.notes ? (prev.notes ? prev.notes + "\n" + extracted.notes : extracted.notes) : prev.notes,
      }));

      toast({ title: "Documento processado", description: "Campos preenchidos automaticamente. Confira os dados antes de salvar." });
    } catch (err: any) {
      toast({ title: "Erro ao ler documento", description: err.message || "Tente preencher manualmente", variant: "destructive" });
    } finally {
      setScanning(false);
      if (ocrInputRef.current) ocrInputRef.current.value = "";
    }
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (weapon) {
        await apiRequest("PATCH", `/api/weapons/${weapon.id}`, data);
      } else {
        await apiRequest("POST", "/api/weapons", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weapons"] });
      toast({ title: weapon ? "Arma atualizada" : "Arma cadastrada" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <Card className="p-6 bg-white border-neutral-200 mb-6" data-testid="card-weapon-form">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{weapon ? "Editar Arma" : "Nova Arma"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {!weapon && (
        <div className="mb-5 p-4 border-2 border-dashed border-neutral-300 rounded-lg bg-neutral-50 text-center" data-testid="ocr-upload-area">
          <input ref={ocrInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleOcrUpload} disabled={scanning} />
          {scanning ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-8 h-8 text-neutral-500 animate-spin" />
              <p className="text-sm text-neutral-600 font-medium">Lendo documento...</p>
              <p className="text-xs text-neutral-400">A IA está extraindo os dados da arma</p>
            </div>
          ) : (
            <div
              className="flex flex-col items-center gap-2 py-2 cursor-pointer"
              onClick={() => ocrInputRef.current?.click()}
            >
              <ScanLine className="w-8 h-8 text-neutral-400" />
              <p className="text-sm text-neutral-600 font-medium">Cadastro Inteligente</p>
              <p className="text-xs text-neutral-400">Anexe a foto ou PDF do registro e os campos serão preenchidos automaticamente</p>
            </div>
          )}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Tipo *</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-weapon-type">
              <option value="" disabled>Selecione o tipo...</option>
              {WEAPON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Marca *</label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required placeholder="Ex: Taurus" data-testid="input-weapon-brand" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Modelo *</label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required placeholder="Ex: G2C" data-testid="input-weapon-model" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Calibre *</label>
            <select value={form.caliber} onChange={(e) => setForm({ ...form, caliber: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" required data-testid="select-weapon-caliber">
              <option value="" disabled>Selecione o calibre...</option>
              {CALIBERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Nº Série *</label>
            <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} required placeholder="Número de série da arma" data-testid="input-weapon-serial" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Nº Registro</label>
            <Input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} placeholder="Registro junto à PF/EB" data-testid="input-weapon-registration" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Validade do Registro</label>
            <Input type="date" value={form.registrationExpiry} onChange={(e) => setForm({ ...form, registrationExpiry: e.target.value })} data-testid="input-weapon-reg-expiry" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-weapon-status">
              <option value="disponível">Disponível</option>
              <option value="em uso">Em Uso</option>
              <option value="manutenção">Manutenção</option>
              <option value="inativa">Inativa</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="w-full">
              <label className="text-xs text-neutral-500 mb-1 block">PDF do Registro</label>
              <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-registration">
                <Upload className="w-4 h-4 mr-2" />
                {form.registrationFileData ? "Substituir PDF" : "Anexar PDF"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs text-neutral-500 mb-1 block">Observações</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-weapon-notes" />
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-weapon">
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}

function AssignWeaponModal({ weapon, open, onClose }: { weapon: Weapon; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }), enabled: open });
  const { data: history = [], isLoading: histLoading } = useQuery<WeaponAssignment[]>({
    queryKey: ["/api/weapon-assignments", weapon.id],
    queryFn: async () => {
      const { authFetch } = await import("@/lib/queryClient");
      const res = await authFetch(`/api/weapon-assignments/${weapon.id}`);
      return res.json();
    },
    enabled: open,
  });

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [notes, setNotes] = useState("");

  const assignMutation = useMutation({
    mutationFn: async (action: "vincular" | "desvincular") => {
      const empId = action === "vincular" ? parseInt(selectedEmployee) : weapon.assignedEmployeeId!;
      await apiRequest("POST", "/api/weapon-assignments", {
        weaponId: weapon.id,
        employeeId: empId,
        action,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weapons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weapon-assignments", weapon.id] });
      setSelectedEmployee("");
      setNotes("");
      toast({ title: "Operação realizada" });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const activeEmployees = employees.filter(e => e.status === "ativo");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular/Desvincular Agente - {weapon.brand} {weapon.model}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {weapon.assignedEmployeeId ? (
            <div className="bg-neutral-50 rounded-lg p-3 border">
              <p className="text-sm text-neutral-600 mb-2">
                Vinculado a: <strong className="text-neutral-900">{employees.find(e => e.id === weapon.assignedEmployeeId)?.name || `ID ${weapon.assignedEmployeeId}`}</strong>
              </p>
              <div className="flex gap-2">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo da desvinculação (opcional)" className="text-sm" data-testid="input-unlink-notes" />
                <Button variant="destructive" size="sm" onClick={() => assignMutation.mutate("desvincular")} disabled={assignMutation.isPending} data-testid="button-unlink-weapon">
                  <Unlink className="w-4 h-4 mr-1" /> Desvincular
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Selecione o Agente *</label>
                <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="w-full border border-neutral-200 rounded-md px-3 py-2 text-sm" data-testid="select-assign-employee">
                  <option value="">Selecione...</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.matricula} - {e.name}</option>)}
                </select>
              </div>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações (opcional)" className="text-sm" data-testid="input-link-notes" />
              <Button onClick={() => assignMutation.mutate("vincular")} disabled={assignMutation.isPending || !selectedEmployee} data-testid="button-link-weapon">
                <Link2 className="w-4 h-4 mr-1" /> Vincular ao Agente
              </Button>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-1">
              <History className="w-4 h-4" /> Histórico de Vinculações
            </h4>
            {histLoading ? (
              <p className="text-xs text-neutral-400 text-center py-4">Carregando...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4">Nenhum registro</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2" data-testid={`row-weapon-history-${h.id}`}>
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.action === "vincular" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {h.action === "vincular" ? "Vinculado" : "Desvinculado"}
                      </span>
                      <span className="text-xs text-neutral-600 ml-2">
                        {employees.find(e => e.id === h.employeeId)?.name || `ID ${h.employeeId}`}
                      </span>
                      {h.notes && <span className="text-xs text-neutral-400 ml-2">({h.notes})</span>}
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      {h.createdAt ? new Date(h.createdAt).toLocaleDateString("pt-BR") + " " + new Date(h.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WeaponsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Weapon | undefined>();
  const [assignWeapon, setAssignWeapon] = useState<Weapon | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showBatchImport, setShowBatchImport] = useState(false);
  const { toast } = useToast();
  const { data: weapons = [], isLoading } = useQuery<Weapon[]>({ queryKey: ["/api/weapons"], queryFn: getQueryFn({ on401: "throw" }) });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], queryFn: getQueryFn({ on401: "throw" }) });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/weapons/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/weapons"] }); toast({ title: "Arma removida" }); },
  });

  const filtered = weapons.filter(w => {
    const term = searchTerm.toLowerCase();
    return !term || w.brand.toLowerCase().includes(term) || w.model.toLowerCase().includes(term) || w.serialNumber.toLowerCase().includes(term) || w.caliber.toLowerCase().includes(term);
  });

  const expiringWeapons = weapons.filter(w => isExpiringSoon(w.registrationExpiry) !== "ok");

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-weapons-title">Armamento</h1>
          <p className="text-sm text-neutral-500 mt-1">Cadastro e controle de armas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowBatchImport(true)} data-testid="button-batch-import">
            <Sparkles className="w-4 h-4 mr-2" /> Importar com IA
          </Button>
          <Button onClick={() => { setEditItem(undefined); setShowForm(true); }} data-testid="button-new-weapon">
            <Plus className="w-4 h-4 mr-2" /> Nova Arma
          </Button>
        </div>
      </div>

      {expiringWeapons.length > 0 && (
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">
              {expiringWeapons.length} arma(s) com registro vencido ou próximo do vencimento
            </span>
          </div>
        </Card>
      )}

      <BatchImportDialog open={showBatchImport} onClose={() => setShowBatchImport(false)} />

      {showForm && <WeaponForm weapon={editItem} onClose={() => { setShowForm(false); setEditItem(undefined); }} />}

      {assignWeapon && (
        <AssignWeaponModal weapon={assignWeapon} open={!!assignWeapon} onClose={() => setAssignWeapon(null)} />
      )}

      <Card className="bg-white border-neutral-200 overflow-hidden">
        <div className="p-3 border-b border-neutral-200">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar arma..."
              className="pl-9"
              data-testid="input-search-weapons"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-neutral-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-neutral-400">Nenhuma arma cadastrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-weapons">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left p-3 font-medium text-neutral-600">Tipo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Marca / Modelo</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Calibre</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Nº Série</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Registro</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Val. Registro</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Agente</th>
                  <th className="text-left p-3 font-medium text-neutral-600">Status</th>
                  <th className="text-right p-3 font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const regStatus = isExpiringSoon(w.registrationExpiry);
                  const assignedEmp = w.assignedEmployeeId ? employees.find(e => e.id === w.assignedEmployeeId) : null;
                  return (
                    <tr key={w.id} className="border-b border-neutral-100 hover:bg-neutral-50" data-testid={`row-weapon-${w.id}`}>
                      <td className="p-3 text-neutral-700">{w.type}</td>
                      <td className="p-3 font-medium text-neutral-900">{w.brand} {w.model}</td>
                      <td className="p-3 text-neutral-600">{w.caliber}</td>
                      <td className="p-3 font-mono text-xs text-neutral-500">{w.serialNumber}</td>
                      <td className="p-3 text-xs text-neutral-600">{w.registrationNumber || "-"}</td>
                      <td className="p-3">
                        {w.registrationExpiry ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            regStatus === "expired" ? "bg-red-100 text-red-700" :
                            regStatus === "warning" ? "bg-amber-100 text-amber-700" :
                            "bg-green-100 text-green-700"
                          }`}>
                            {new Date(w.registrationExpiry).toLocaleDateString("pt-BR")}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="p-3 text-sm text-neutral-700">
                        {assignedEmp ? assignedEmp.name : <span className="text-neutral-400">-</span>}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          w.status === "disponível" ? "bg-green-100 text-green-700" :
                          w.status === "em uso" ? "bg-blue-100 text-blue-700" :
                          w.status === "manutenção" ? "bg-amber-100 text-amber-700" :
                          "bg-neutral-100 text-neutral-600"
                        }`}>{w.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button variant="ghost" size="icon" onClick={() => setAssignWeapon(w)} title="Vincular/Desvincular" data-testid={`button-assign-weapon-${w.id}`}>
                            <Link2 className="w-4 h-4 text-blue-600" />
                          </Button>
                          {w.registrationFileData && (
                            <Button variant="ghost" size="icon" onClick={() => {
                              const link = document.createElement("a");
                              link.href = w.registrationFileData!;
                              link.download = `registro_${w.serialNumber}.pdf`;
                              link.click();
                            }} title="Baixar Registro" data-testid={`button-download-reg-${w.id}`}>
                              <FileText className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => { setEditItem(w); setShowForm(true); }} data-testid={`button-edit-weapon-${w.id}`}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(w.id)} data-testid={`button-delete-weapon-${w.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}
