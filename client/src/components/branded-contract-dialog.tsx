import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, Pencil, Printer, Download, Plus, Trash2, Loader2, PenLine, ShieldCheck, RotateCcw, Lock } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type EntityType = "client" | "employee";

export interface BrandedContractRecord {
  id: string;
  entity_type: EntityType;
  entity_id: number;
  title: string;
  fields: Record<string, string>;
  clauses: string;
  witnesses: { name: string; cpf: string }[];
  signature_data?: string | null;
  signed_at?: string | null;
  signed_by_name?: string | null;
  signed_by_doc?: string | null;
  signed_ip?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractDefaults {
  nome?: string;
  documento?: string;
  endereco?: string;
  data?: string;
  valor?: string;
  cargo?: string;
  email?: string;
  telefone?: string;
  contato?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  bairro?: string;
}

const TORRES = {
  razao: "TORRES VIGILÂNCIA PATRIMONIAL LTDA",
  cnpj: "36.982.392/0001-89",
  instagram: "@grupotorres.seguranca",
  site: "www.torresseguranca.com.br",
};

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateBR(iso: string | undefined | null) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtDateTimeBR(iso: string | undefined | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return iso; }
}

interface Props {
  open: boolean;
  onClose: () => void;
  entityType: EntityType;
  entityId: number;
  entityName: string;
  defaults: ContractDefaults;
}

export function BrandedContractDialog({ open, onClose, entityType, entityId, entityName, defaults }: Props) {
  const { toast } = useToast();
  const isEmployee = entityType === "employee";

  const { data: contracts = [], isLoading } = useQuery<BrandedContractRecord[]>({
    queryKey: ["/api/branded-contracts", entityType, entityId],
    queryFn: async () => {
      const r = await fetch(`/api/branded-contracts?entity_type=${entityType}&entity_id=${entityId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "form" | "view" | "sign">("list");
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [clauses, setClauses] = useState("");
  const [witnesses, setWitnesses] = useState<{ name: string; cpf: string }[]>([]);

  useEffect(() => {
    if (!open) { setMode("list"); setEditingId(null); }
  }, [open]);

  const enderecoCompleto = useMemo(() => {
    const parts = [
      defaults.endereco,
      defaults.bairro,
      [defaults.cidade, defaults.estado].filter(Boolean).join("/"),
      defaults.cep ? `CEP ${defaults.cep}` : "",
    ].filter(Boolean);
    return parts.join(", ");
  }, [defaults]);

  const resetForm = () => {
    setTitle(isEmployee ? "CONTRATO INDIVIDUAL DE TRABALHO" : "CONTRATO DE PRESTAÇÃO DE SERVIÇOS");
    setFields({
      nome: defaults.nome || entityName,
      documento: defaults.documento || "",
      endereco: enderecoCompleto || defaults.endereco || "",
      data: defaults.data || todayISO(),
      valor: defaults.valor || "",
      cargo: defaults.cargo || "",
      email: defaults.email || "",
      telefone: defaults.telefone || "",
      contato: defaults.contato || "",
      inscricao_estadual: defaults.inscricao_estadual || "",
      inscricao_municipal: defaults.inscricao_municipal || "",
    });
    setClauses("");
    setWitnesses([{ name: "", cpf: "" }, { name: "", cpf: "" }]);
  };

  const loadContract = (c: BrandedContractRecord) => {
    setEditingId(c.id);
    setTitle(c.title);
    setFields(c.fields || {});
    setClauses(c.clauses || "");
    setWitnesses(c.witnesses && c.witnesses.length > 0 ? c.witnesses : [{ name: "", cpf: "" }, { name: "", cpf: "" }]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { entity_type: entityType, entity_id: entityId, title, fields, clauses, witnesses };
      if (editingId) return apiRequest("PUT", `/api/branded-contracts/${editingId}`, payload);
      return apiRequest("POST", `/api/branded-contracts`, payload);
    },
    onSuccess: async (res: any) => {
      const saved = await res.json();
      toast({ title: "Contrato salvo", description: "As cláusulas ficam congeladas até você editar de novo." });
      queryClient.invalidateQueries({ queryKey: ["/api/branded-contracts", entityType, entityId] });
      setEditingId(saved.id);
      setMode("view");
    },
    onError: (err: any) => toast({ title: "Erro ao salvar", description: err?.message || "", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/branded-contracts/${id}`),
    onSuccess: () => {
      toast({ title: "Contrato excluído" });
      queryClient.invalidateQueries({ queryKey: ["/api/branded-contracts", entityType, entityId] });
      setMode("list"); setEditingId(null);
    },
  });

  const unsignMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/branded-contracts/${id}/unsign`, {}),
    onSuccess: () => {
      toast({ title: "Assinatura removida" });
      queryClient.invalidateQueries({ queryKey: ["/api/branded-contracts", entityType, entityId] });
    },
  });

  const currentRecord = useMemo<BrandedContractRecord | null>(() => {
    if (!editingId) return null;
    return contracts.find(c => c.id === editingId) || null;
  }, [contracts, editingId]);

  const isSigned = !!currentRecord?.signed_at && !!currentRecord?.signature_data;

  const printContract = () => {
    const node = document.getElementById("branded-contract-printable");
    if (!node) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title || "Contrato"}</title>
      <style>${getPrintStyles()}</style></head><body>${node.outerHTML}<script>window.onload=()=>{window.print();}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const downloadPdf = async () => {
    const node = document.getElementById("branded-contract-printable") as HTMLElement | null;
    if (!node) return;
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      const fname = `Contrato_${(currentRecord?.fields?.nome || entityName).replace(/\s+/g, "_")}${isSigned ? "_ASSINADO" : ""}.pdf`;
      pdf.save(fname);
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err?.message || "", variant: "destructive" });
    }
  };

  const setField = (k: string, v: string) => setFields(prev => ({ ...prev, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <span>Contrato Profissional — {entityName}</span>
          </DialogTitle>
        </DialogHeader>

        {mode === "list" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-600">Contratos salvos para este {isEmployee ? "funcionário" : "cliente"}</p>
              <Button onClick={() => { resetForm(); setEditingId(null); setMode("form"); }} className="bg-neutral-900 text-white hover:bg-black" data-testid="button-new-branded-contract">
                <Plus className="w-4 h-4 mr-1" /> Novo contrato
              </Button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
            ) : contracts.length === 0 ? (
              <div className="text-center py-12 text-sm text-neutral-400">Nenhum contrato gerado ainda.</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="text-left p-3">Título</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Criado</th>
                      <th className="text-left p-3">Atualizado</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map(c => {
                      const signed = !!c.signed_at && !!c.signature_data;
                      return (
                        <tr key={c.id} className="border-t hover:bg-neutral-50">
                          <td className="p-3 font-medium">{c.title}</td>
                          <td className="p-3">
                            {signed ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded bg-emerald-100 text-emerald-700"><ShieldCheck className="w-3 h-3" /> Assinado</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded bg-amber-100 text-amber-700">Aguardando assinatura</span>
                            )}
                          </td>
                          <td className="p-3 text-neutral-500">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                          <td className="p-3 text-neutral-500">{new Date(c.updated_at).toLocaleDateString("pt-BR")}</td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="sm" onClick={() => { loadContract(c); setMode("view"); }} data-testid={`button-view-contract-${c.id}`}>Abrir</Button>
                            <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Excluir este contrato?")) deleteMutation.mutate(c.id); }} data-testid={`button-delete-contract-${c.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {mode === "form" && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              Os campos abaixo já vêm preenchidos com os dados do cadastro. Ajuste se necessário.
              As <b>cláusulas ficam congeladas</b> ao salvar — só podem ser alteradas clicando em "Editar".
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do contrato" className="text-base font-bold" data-testid="input-contract-title" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome / Razão Social" value={fields.nome || ""} onChange={(v) => setField("nome", v)} testId="input-field-nome" full />
              <Field label={isEmployee ? "CPF" : "CPF / CNPJ"} value={fields.documento || ""} onChange={(v) => setField("documento", v)} testId="input-field-documento" />
              <Field label="Data do contrato" type="date" value={fields.data || ""} onChange={(v) => setField("data", v)} testId="input-field-data" />
              <Field label="Endereço completo" value={fields.endereco || ""} onChange={(v) => setField("endereco", v)} testId="input-field-endereco" full />
              {!isEmployee && (
                <>
                  <Field label="Inscrição Estadual" value={fields.inscricao_estadual || ""} onChange={(v) => setField("inscricao_estadual", v)} testId="input-field-ie" />
                  <Field label="Inscrição Municipal" value={fields.inscricao_municipal || ""} onChange={(v) => setField("inscricao_municipal", v)} testId="input-field-im" />
                  <Field label="Pessoa de Contato" value={fields.contato || ""} onChange={(v) => setField("contato", v)} testId="input-field-contato" />
                  <Field label="Telefone" value={fields.telefone || ""} onChange={(v) => setField("telefone", v)} testId="input-field-tel" />
                  <Field label="E-mail" value={fields.email || ""} onChange={(v) => setField("email", v)} testId="input-field-email" full />
                </>
              )}
              <Field label={isEmployee ? "Salário (R$)" : "Valor / Tabela (R$)"} value={fields.valor || ""} onChange={(v) => setField("valor", v)} testId="input-field-valor" />
              {isEmployee && <Field label="Cargo / Função" value={fields.cargo || ""} onChange={(v) => setField("cargo", v)} testId="input-field-cargo" />}
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-neutral-600 mb-1 block">Cláusulas (texto livre)</label>
              <Textarea
                value={clauses}
                onChange={(e) => setClauses(e.target.value)}
                placeholder="Digite as cláusulas. Use linhas em branco para separar parágrafos. Comece cada cláusula com 'CLÁUSULA Nº - DO ASSUNTO:' para destacar o título."
                rows={14}
                className="font-mono text-sm leading-relaxed"
                data-testid="textarea-clauses"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-neutral-600 mb-1 block">Testemunhas</label>
              <div className="space-y-2">
                {witnesses.map((w, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <Input value={w.name} onChange={(e) => setWitnesses(witnesses.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder={`Testemunha ${i + 1} — Nome`} data-testid={`input-witness-name-${i}`} />
                    <Input value={w.cpf} onChange={(e) => setWitnesses(witnesses.map((x, j) => j === i ? { ...x, cpf: e.target.value } : x))} placeholder="CPF" data-testid={`input-witness-cpf-${i}`} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setWitnesses([...witnesses, { name: "", cpf: "" }])}>+ Testemunha</Button>
                  {witnesses.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setWitnesses(witnesses.slice(0, -1))} className="text-red-500">Remover última</Button>}
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => { if (editingId && currentRecord) { loadContract(currentRecord); setMode("view"); } else { setMode("list"); } }} data-testid="button-cancel-contract">Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-neutral-900 text-white hover:bg-black" data-testid="button-save-contract">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Salvar contrato
              </Button>
            </div>
          </div>
        )}

        {mode === "view" && currentRecord && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setMode("list")} data-testid="button-back-list">← Voltar</Button>
                {isSigned && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase px-3 py-1.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-4 h-4" /> Assinado em {fmtDateTimeBR(currentRecord.signed_at)}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {!isSigned && (
                  <Button variant="outline" size="sm" onClick={() => { loadContract(currentRecord); setMode("form"); }} data-testid="button-edit-contract"><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                )}
                {!isSigned ? (
                  <Button size="sm" onClick={() => setMode("sign")} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="button-sign-contract"><PenLine className="w-4 h-4 mr-1" /> Assinar digitalmente</Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => { if (window.confirm("Remover a assinatura? Esta ação fica registrada na auditoria.")) unsignMutation.mutate(currentRecord.id); }} data-testid="button-unsign-contract"><RotateCcw className="w-4 h-4 mr-1" /> Remover assinatura</Button>
                )}
                <Button variant="outline" size="sm" onClick={printContract} data-testid="button-print-contract"><Printer className="w-4 h-4 mr-1" /> Imprimir</Button>
                <Button size="sm" onClick={downloadPdf} className="bg-neutral-900 text-white hover:bg-black" data-testid="button-pdf-contract"><Download className="w-4 h-4 mr-1" /> PDF</Button>
              </div>
            </div>
            {isSigned && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div><b>Assinado por:</b> {currentRecord.signed_by_name} {currentRecord.signed_by_doc ? `(${currentRecord.signed_by_doc})` : ""}</div>
                  <div><b>Data/hora:</b> {fmtDateTimeBR(currentRecord.signed_at)} (BRT)</div>
                  <div><b>IP:</b> {currentRecord.signed_ip || "—"}</div>
                  <div className="mt-1 italic">Este contrato está congelado. Para editá-lo, primeiro remova a assinatura.</div>
                </div>
              </div>
            )}
            <ContractPreview record={currentRecord} isEmployee={isEmployee} />
          </div>
        )}

        {mode === "sign" && currentRecord && (
          <SignaturePanel
            record={currentRecord}
            onCancel={() => setMode("view")}
            onSigned={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/branded-contracts", entityType, entityId] });
              toast({ title: "Contrato assinado", description: "Registro salvo com data, hora e IP." });
              setMode("view");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, testId, type = "text", full = false }: { label: string; value: string; onChange: (v: string) => void; testId: string; type?: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="text-xs font-bold uppercase text-neutral-600 mb-1 block">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </div>
  );
}

function SignaturePanel({ record, onCancel, onSigned }: { record: BrandedContractRecord; onCancel: () => void; onSigned: () => void }) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [signerName, setSignerName] = useState(record.fields?.nome || "");
  const [signerDoc, setSignerDoc] = useState(record.fields?.documento || "");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    lastPoint.current = getPos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };
  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    setHasDrawing(true);
  };
  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch {}
  };
  const clear = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    setHasDrawing(false);
  };

  const signMutation = useMutation({
    mutationFn: async () => {
      const c = canvasRef.current!;
      const dataUrl = c.toDataURL("image/png");
      return apiRequest("POST", `/api/branded-contracts/${record.id}/sign`, {
        signature_data: dataUrl,
        signed_by_name: signerName.trim(),
        signed_by_doc: signerDoc.trim(),
      });
    },
    onSuccess: () => onSigned(),
    onError: (err: any) => toast({ title: "Erro ao assinar", description: err?.message || "", variant: "destructive" }),
  });

  const canSubmit = hasDrawing && signerName.trim().length > 2;

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
        <b>Assinatura digital com validade de auditoria.</b> Ao confirmar, o sistema registra data, hora e IP do dispositivo.
        O contrato fica <b>congelado</b> e não pode ser editado até que a assinatura seja removida (ação restrita à Diretoria).
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome de quem está assinando *" value={signerName} onChange={setSignerName} testId="input-signer-name" />
        <Field label="CPF / CNPJ do signatário" value={signerDoc} onChange={setSignerDoc} testId="input-signer-doc" />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-neutral-600 mb-1 block">Desenhe a assinatura abaixo</label>
        <div className="border-2 border-dashed border-neutral-300 rounded-lg bg-white">
          <canvas
            ref={canvasRef}
            width={900}
            height={280}
            className="w-full h-[220px] touch-none cursor-crosshair rounded-lg"
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            data-testid="canvas-signature"
          />
        </div>
        <div className="flex justify-between mt-2">
          <Button variant="ghost" size="sm" onClick={clear} data-testid="button-clear-signature"><RotateCcw className="w-4 h-4 mr-1" /> Limpar</Button>
          <span className="text-[11px] text-neutral-500 self-center">{hasDrawing ? "✓ Assinatura capturada" : "Use o mouse ou o dedo para assinar"}</span>
        </div>
      </div>
      <div className="flex justify-between pt-2 border-t">
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-sign">Cancelar</Button>
        <Button onClick={() => signMutation.mutate()} disabled={!canSubmit || signMutation.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="button-confirm-sign">
          {signMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />} Confirmar assinatura
        </Button>
      </div>
    </div>
  );
}

function getPrintStyles() {
  return `
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background: #fff; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }
    .torres-doc { width: 210mm; min-height: 297mm; padding: 22mm 22mm 32mm; box-sizing: border-box; background: #fff; position: relative; }
    .torres-doc * { box-sizing: border-box; }
    .torres-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #000; padding-bottom: 14px; margin-bottom: 22px; }
    .torres-brand { display: flex; align-items: center; gap: 12px; }
    .torres-mark { width: 56px; height: 56px; background: #000; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 26px; letter-spacing: -1px; }
    .torres-name { font-weight: 900; font-size: 18px; letter-spacing: 1px; line-height: 1; }
    .torres-tag { font-size: 9px; color: #666; letter-spacing: 3px; margin-top: 4px; }
    .torres-meta { text-align: right; font-size: 10px; color: #555; line-height: 1.4; }
    .torres-title { text-align: center; font-weight: 900; font-size: 16px; letter-spacing: 2px; margin: 18px 0 24px; padding: 10px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .torres-parties { font-size: 12px; line-height: 1.7; text-align: justify; margin-bottom: 14px; }
    .torres-table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; font-size: 11px; }
    .torres-table td { border: 1px solid #000; padding: 6px 9px; vertical-align: top; }
    .torres-table td.k { background: #000; color: #fff; font-weight: 700; width: 32%; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }
    .torres-clauses { font-size: 12px; line-height: 1.7; text-align: justify; white-space: pre-wrap; }
    .torres-clauses p { margin: 0 0 10px; }
    .torres-clauses .clause-title { font-weight: 800; }
    .torres-signatures { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .torres-sig { text-align: center; font-size: 11px; }
    .torres-sig .line { border-top: 1px solid #000; padding-top: 5px; margin-top: 50px; }
    .torres-sig img.sigimg { max-height: 70px; max-width: 100%; display: block; margin: 0 auto -2px; }
    .torres-witness { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 11px; }
    .torres-stamp { position: absolute; top: 110mm; right: 24mm; transform: rotate(-12deg); border: 4px solid #059669; color: #059669; padding: 8px 18px; font-weight: 900; letter-spacing: 3px; font-size: 22px; opacity: 0.85; border-radius: 6px; }
    .torres-audit { margin-top: 24px; padding: 10px 12px; border: 1px solid #000; background: #f8f8f8; font-size: 10px; line-height: 1.5; }
    .torres-audit b { text-transform: uppercase; letter-spacing: 0.5px; }
    .torres-footer { position: absolute; bottom: 12mm; left: 22mm; right: 22mm; border-top: 2px solid #000; padding-top: 8px; display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; color: #333; letter-spacing: 0.3px; }
    .torres-footer b { color: #000; }
    .torres-footer .col { display: flex; flex-direction: column; gap: 2px; }
    .torres-footer .col.right { text-align: right; }
    .torres-local { text-align: center; font-size: 12px; margin-top: 26px; }
    @media print { body { background: #fff; } .torres-doc { box-shadow: none; } }
  `;
}

function ContractPreview({ record, isEmployee }: { record: BrandedContractRecord; isEmployee: boolean }) {
  const f = record.fields || {};
  const dateBR = fmtDateBR(f.data) || fmtDateBR(todayISO());
  const valorTxt = f.valor ? (String(f.valor).match(/^R\$/) ? f.valor : `R$ ${f.valor}`) : "—";
  const partyLabel = isEmployee ? "EMPREGADO(A)" : "CONTRATANTE";
  const isSigned = !!record.signed_at && !!record.signature_data;
  const formatClauses = (txt: string) => {
    const paras = (txt || "").split(/\n{2,}/);
    return paras.map((p, i) => {
      const trimmed = p.trim();
      if (!trimmed) return null;
      const m = trimmed.match(/^(CLÁUSULA[^:]+:)\s*([\s\S]*)/i);
      if (m) return <p key={i}><span className="clause-title">{m[1]}</span> {m[2]}</p>;
      return <p key={i}>{trimmed}</p>;
    }).filter(Boolean);
  };
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: getPrintStyles() }} />
      <div className="bg-neutral-100 p-4 max-h-[70vh] overflow-y-auto rounded">
        <div id="branded-contract-printable" className="torres-doc shadow-lg mx-auto">
          {isSigned && <div className="torres-stamp">ASSINADO</div>}
          <div className="torres-header">
            <div className="torres-brand">
              <div className="torres-mark">T</div>
              <div>
                <div className="torres-name">TORRES</div>
                <div className="torres-tag">VIGILÂNCIA · PATRIMONIAL</div>
              </div>
            </div>
            <div className="torres-meta">
              <div><b>{TORRES.razao}</b></div>
              <div>CNPJ: {TORRES.cnpj}</div>
              <div>Documento emitido em {dateBR}</div>
            </div>
          </div>

          <div className="torres-title">{record.title || "CONTRATO"}</div>

          <div className="torres-parties">
            Pelo presente instrumento particular, de um lado <b>{TORRES.razao}</b>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº <b>{TORRES.cnpj}</b>, doravante denominada simplesmente <b>{isEmployee ? "EMPREGADORA" : "CONTRATADA"}</b>, e de outro lado:
          </div>

          <table className="torres-table">
            <tbody>
              <tr><td className="k">{isEmployee ? "Nome" : "Nome / Razão Social"}</td><td>{f.nome || "—"}</td></tr>
              <tr><td className="k">{isEmployee ? "CPF" : "CPF / CNPJ"}</td><td>{f.documento || "—"}</td></tr>
              <tr><td className="k">Endereço</td><td>{f.endereco || "—"}</td></tr>
              {!isEmployee && f.inscricao_estadual && <tr><td className="k">Inscrição Estadual</td><td>{f.inscricao_estadual}</td></tr>}
              {!isEmployee && f.inscricao_municipal && <tr><td className="k">Inscrição Municipal</td><td>{f.inscricao_municipal}</td></tr>}
              {!isEmployee && f.contato && <tr><td className="k">Pessoa de Contato</td><td>{f.contato}</td></tr>}
              {!isEmployee && f.telefone && <tr><td className="k">Telefone</td><td>{f.telefone}</td></tr>}
              {!isEmployee && f.email && <tr><td className="k">E-mail</td><td>{f.email}</td></tr>}
              {isEmployee && <tr><td className="k">Cargo / Função</td><td>{f.cargo || "—"}</td></tr>}
              <tr><td className="k">{isEmployee ? "Salário" : "Valor"}</td><td>{valorTxt}</td></tr>
              <tr><td className="k">Data do contrato</td><td>{dateBR}</td></tr>
            </tbody>
          </table>

          <div className="torres-parties">
            Doravante denominado(a) <b>{partyLabel}</b>, têm entre si, justo e contratado, o que se regerá pelas cláusulas e condições a seguir estipuladas:
          </div>

          <div className="torres-clauses">
            {formatClauses(record.clauses)}
            {(!record.clauses || record.clauses.trim() === "") && (
              <p style={{ color: "#999", fontStyle: "italic" }}>Nenhuma cláusula cadastrada. Clique em "Editar" para adicionar.</p>
            )}
          </div>

          <div className="torres-local">
            E por estarem de pleno acordo, firmam o presente em 2 (duas) vias de igual teor.<br />
            São Paulo, {dateBR}.
          </div>

          <div className="torres-signatures">
            <div className="torres-sig">
              <div className="line"><b>{TORRES.razao}</b><br />CNPJ: {TORRES.cnpj}</div>
            </div>
            <div className="torres-sig">
              {isSigned && record.signature_data && (
                <img src={record.signature_data} alt="Assinatura" className="sigimg" />
              )}
              <div className="line">
                <b>{isSigned ? record.signed_by_name : (f.nome || "—")}</b><br />
                CPF/CNPJ: {isSigned ? (record.signed_by_doc || f.documento || "—") : (f.documento || "—")}
              </div>
            </div>
          </div>

          {record.witnesses && record.witnesses.some(w => w.name) && (
            <div className="torres-witness">
              {record.witnesses.filter(w => w.name).map((w, i) => (
                <div key={i} className="torres-sig"><div className="line"><b>Testemunha {i + 1}: {w.name}</b><br />CPF: {w.cpf || "—"}</div></div>
              ))}
            </div>
          )}

          {isSigned && (
            <div className="torres-audit">
              <b>Comprovante de assinatura digital</b><br />
              Assinado por <b>{record.signed_by_name}</b>{record.signed_by_doc ? ` — Doc.: ${record.signed_by_doc}` : ""}<br />
              Data/hora: <b>{fmtDateTimeBR(record.signed_at)}</b> (Brasília — BRT)<br />
              IP de origem: <b>{record.signed_ip || "—"}</b><br />
              ID do contrato: <b>{record.id}</b>
            </div>
          )}

          <div className="torres-footer">
            <div className="col">
              <span><b>{TORRES.razao}</b></span>
              <span>CNPJ {TORRES.cnpj}</span>
            </div>
            <div className="col right">
              <span>🌐 <b>{TORRES.site}</b></span>
              <span>📷 Instagram: <b>{TORRES.instagram}</b></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
