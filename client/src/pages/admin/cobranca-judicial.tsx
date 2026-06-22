import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Gavel, Search, Loader2, AlertCircle, FileText, Download, FileArchive,
  Building2, Calendar, Landmark, UserCog, FileCheck2, Wallet, PlusCircle,
  Activity, Camera, ScrollText, Bell, Send, ExternalLink, ShieldAlert, Link2,
} from "lucide-react";

interface DossieEvent {
  ts: number; at: string | null; kind: string;
  who: string | null; title: string; detail: string | null; value: number | null;
}
interface DossieFile { label: string; kind: string; url: string | null; note?: string | null }
interface Dossie {
  invoice: any; client: any; serviceOrder: any; contract: any;
  counts: { missionUpdates: number; missionPhotos: number; files: number };
  files: DossieFile[]; events: DossieEvent[]; judicial: any;
}
interface Processo {
  id: number; invoice_id: number; client_id: number; status: string;
  motivo: string | null; valor_cobrado: number | null; enviado_por_nome: string | null;
  share_token: string | null; share_expires_at: string | null; created_at: string;
}

const KIND: Record<string, { icon: any; dot: string; ring: string }> = {
  cadastro:    { icon: Building2,   dot: "bg-indigo-500",  ring: "ring-indigo-100" },
  contrato:    { icon: FileCheck2,  dot: "bg-violet-500",  ring: "ring-violet-100" },
  os:          { icon: FileText,    dot: "bg-sky-500",     ring: "ring-sky-100" },
  execucao:    { icon: Activity,    dot: "bg-cyan-500",    ring: "ring-cyan-100" },
  foto:        { icon: Camera,      dot: "bg-teal-500",    ring: "ring-teal-100" },
  fatura:      { icon: PlusCircle,  dot: "bg-amber-500",   ring: "ring-amber-100" },
  auditoria:   { icon: ScrollText,  dot: "bg-slate-400",   ring: "ring-slate-100" },
  notificacao: { icon: Bell,        dot: "bg-orange-500",  ring: "ring-orange-100" },
  baixa:       { icon: UserCog,     dot: "bg-emerald-500", ring: "ring-emerald-100" },
  vencimento:  { icon: Calendar,    dot: "bg-rose-500",    ring: "ring-rose-100" },
  banco:       { icon: Landmark,    dot: "bg-blue-600",    ring: "ring-blue-100" },
  nota:        { icon: Activity,    dot: "bg-neutral-400", ring: "ring-neutral-100" },
};

const JUDICIAL_STATUS: Record<string, { label: string; cls: string }> = {
  EM_COBRANCA_JUDICIAL: { label: "Em cobrança judicial", cls: "bg-red-100 text-red-700" },
  AJUIZADO:             { label: "Ajuizado",             cls: "bg-purple-100 text-purple-700" },
  ACORDO:               { label: "Em acordo",            cls: "bg-amber-100 text-amber-700" },
  ENCERRADO:            { label: "Encerrado",            cls: "bg-neutral-200 text-neutral-600" },
};

function brl(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const ms = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00-03:00` : s).getTime();
  if (!Number.isFinite(ms)) return s;
  return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CobrancaJudicialPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [sending, setSending] = useState(false);

  const { data: processos } = useQuery<Processo[]>({ queryKey: ["/api/cobranca-judicial"] });

  const { data: dossie, isLoading, isError } = useQuery<Dossie>({
    queryKey: ["/api/invoices", invoiceId, "dossie-juridico"],
    enabled: !!invoiceId,
  });

  function handleSearch() {
    const n = parseInt(query.trim().replace(/\D/g, ""), 10);
    if (!n) { toast({ title: "Informe o número da fatura/NF", variant: "destructive" }); return; }
    setInvoiceId(n);
  }

  async function enviarJuridico() {
    if (!invoiceId) return;
    setSending(true);
    try {
      await apiRequest("POST", `/api/invoices/${invoiceId}/cobranca-judicial`, { motivo });
      toast({ title: "Enviado ao Jurídico", description: "Dossiê gerado e cliente bloqueado para novas OS." });
      setConfirmOpen(false); setMotivo("");
      queryClient.invalidateQueries({ queryKey: ["/api/cobranca-judicial"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId, "dossie-juridico"] });
    } catch (e: any) {
      toast({ title: "Falha ao enviar", description: e?.message || "Erro", variant: "destructive" });
    } finally { setSending(false); }
  }

  const inv = dossie?.invoice;
  const shareUrl = dossie?.judicial?.share_token
    ? `${window.location.origin}/api/juridico/dossie/${dossie.judicial.share_token}`
    : null;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
            <Gavel className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900" data-testid="text-page-title">Cobrança Judicial</h1>
            <p className="text-sm text-neutral-500">Monte o dossiê de evidências de uma fatura inadimplente e envie para o jurídico.</p>
          </div>
        </div>

        {/* Busca */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4 text-red-600" /> Insira a Fatura ou NF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Nº da fatura (ex: 47) ou nº da NFS-e"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                data-testid="input-invoice-search"
              />
              <Button onClick={handleSearch} className="bg-red-600 hover:bg-red-700" data-testid="button-search-invoice">
                <Search className="w-4 h-4 mr-1" /> Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dossiê */}
        {invoiceId && (
          <Card>
            <CardContent className="pt-6">
              {isLoading && (
                <div className="flex items-center justify-center py-10 text-neutral-400" data-testid="status-dossie-loading">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Montando dossiê…
                </div>
              )}
              {isError && (
                <div className="flex items-center gap-2 text-red-600 text-sm py-6" data-testid="status-dossie-error">
                  <AlertCircle className="w-4 h-4" /> Fatura não encontrada.
                </div>
              )}
              {!isLoading && !isError && dossie && (
                <div className="space-y-6">
                  {/* Cabeçalho da fatura */}
                  <div className="rounded-xl border bg-neutral-50 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-neutral-900 uppercase" data-testid="text-dossie-client">{inv.client_name}</p>
                      <p className="text-[12px] text-neutral-500">
                        Fatura #{inv.id} · {brl(inv.value)} · venc. {inv.due_date || "—"}
                        {inv.nfse_number ? ` · NFS-e ${inv.nfse_number}` : ""}
                      </p>
                      {inv.client_cpf_cnpj && <p className="text-[11px] text-neutral-400">{inv.client_cpf_cnpj}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {inv.overdue && <Badge className="bg-red-100 text-red-700 font-bold">Vencida</Badge>}
                      {dossie.judicial
                        ? <Badge className={`${JUDICIAL_STATUS[dossie.judicial.status]?.cls || "bg-neutral-200"} font-bold`}>{JUDICIAL_STATUS[dossie.judicial.status]?.label || dossie.judicial.status}</Badge>
                        : <Badge className="bg-neutral-100 text-neutral-500">Não enviada ao jurídico</Badge>}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2">
                    {!dossie.judicial ? (
                      <Button onClick={() => setConfirmOpen(true)} className="bg-red-600 hover:bg-red-700" data-testid="button-enviar-juridico">
                        <Send className="w-4 h-4 mr-1" /> Enviar para o Jurídico
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-[12px] py-1.5 px-3">
                        Enviado por {dossie.judicial.enviado_por_nome || "—"} em {fmtDate(dossie.judicial.created_at)}
                      </Badge>
                    )}
                    <Button variant="outline" asChild data-testid="button-baixar-pdf">
                      <a href={`/api/invoices/${invoiceId}/dossie-juridico/pdf`} target="_blank" rel="noreferrer">
                        <FileText className="w-4 h-4 mr-1" /> PDF do dossiê
                      </a>
                    </Button>
                    <Button variant="outline" asChild data-testid="button-baixar-zip">
                      <a href={`/api/invoices/${invoiceId}/dossie-juridico/zip`} target="_blank" rel="noreferrer">
                        <FileArchive className="w-4 h-4 mr-1" /> Pacote ZIP (evidências)
                      </a>
                    </Button>
                  </div>

                  {shareUrl && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px]">
                      <p className="font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
                        <Link2 className="w-3.5 h-3.5" /> Link seguro para o advogado (expira em {fmtDate(dossie.judicial.share_expires_at)})
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate bg-white border rounded px-2 py-1 text-neutral-600" data-testid="text-share-url">{shareUrl}</code>
                        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: "Link copiado" }); }} data-testid="button-copy-share">
                          Copiar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Resumo de blocos */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <ResumoBox label="Cliente" ok={!!dossie.client} value={dossie.client ? "Cadastrado" : "—"} />
                    <ResumoBox label="Contrato" ok={!!dossie.contract} value={dossie.contract ? (dossie.contract.name || "Tabela") : "Sem OS única"} />
                    <ResumoBox label="Execução" ok={dossie.counts.missionUpdates + dossie.counts.missionPhotos > 0} value={`${dossie.counts.missionUpdates} updates · ${dossie.counts.missionPhotos} fotos`} />
                    <ResumoBox label="Documentos" ok={dossie.counts.files > 0} value={`${dossie.counts.files} arquivos`} />
                  </div>

                  {/* Documentos de evidência */}
                  {dossie.files.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-700 mb-2">Documentos de evidência</h3>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {dossie.files.map((f, i) => (
                          <a key={i} href={f.url || "#"} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg border p-2.5 hover:bg-neutral-50 text-sm"
                            data-testid={`link-file-${i}`}>
                            <Download className="w-4 h-4 text-red-600 shrink-0" />
                            <span className="flex-1 truncate">{f.label}</span>
                            <Badge variant="outline" className="text-[10px] uppercase">{f.kind}</Badge>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linha do tempo */}
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-700 mb-3">Linha do tempo (do cadastro ao pagamento)</h3>
                    <ol className="relative space-y-4" data-testid="list-dossie-events">
                      {dossie.events.map((ev, i) => {
                        const k = KIND[ev.kind] || KIND.nota;
                        const KIcon = k.icon;
                        return (
                          <li key={i} className="relative flex gap-3" data-testid={`dossie-event-${i}`}>
                            <div className="flex flex-col items-center">
                              <span className={`flex items-center justify-center w-8 h-8 rounded-full ${k.dot} text-white ring-4 ${k.ring} shrink-0`}>
                                <KIcon className="w-4 h-4" />
                              </span>
                              {i < dossie.events.length - 1 && <span className="w-px flex-1 bg-neutral-200 mt-1" />}
                            </div>
                            <div className="pb-1 min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-neutral-900 capitalize">{ev.title}</p>
                                {ev.value != null && <span className="text-sm font-bold text-emerald-700 shrink-0">{brl(ev.value)}</span>}
                              </div>
                              <p className="text-[11px] text-neutral-500">{fmtDate(ev.at)}{ev.who ? ` · ${ev.who}` : ""}</p>
                              {ev.detail && <p className="text-xs text-neutral-600 mt-0.5 break-words">{ev.detail}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Lista de processos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-red-600" /> Processos enviados ao jurídico
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!processos || processos.length === 0 ? (
              <p className="text-sm text-neutral-400 py-4 text-center">Nenhuma fatura enviada ao jurídico ainda.</p>
            ) : (
              <div className="divide-y">
                {processos.map((p) => (
                  <button key={p.id} onClick={() => { setInvoiceId(p.invoice_id); setQuery(String(p.invoice_id)); }}
                    className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-neutral-50 px-1 rounded"
                    data-testid={`row-processo-${p.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">Fatura #{p.invoice_id} · {brl(p.valor_cobrado)}</p>
                      <p className="text-[11px] text-neutral-500">Por {p.enviado_por_nome || "—"} em {fmtDate(p.created_at)}{p.motivo ? ` · ${p.motivo}` : ""}</p>
                    </div>
                    <Badge className={`${JUDICIAL_STATUS[p.status]?.cls || "bg-neutral-200"} font-bold shrink-0`}>{JUDICIAL_STATUS[p.status]?.label || p.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmação de envio */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-5 h-5" /> Enviar para o Jurídico
            </DialogTitle>
            <DialogDescription>
              Isto congela o dossiê de evidências, registra quem enviou e <b>bloqueia o cliente para novas Ordens de Serviço</b> até a regularização. Não altera o status financeiro da fatura.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-700">Motivo / observação (opcional)</label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: inadimplência > 30 dias, sem resposta às cobranças." data-testid="input-motivo" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>Cancelar</Button>
            <Button onClick={enviarJuridico} disabled={sending} className="bg-red-600 hover:bg-red-700" data-testid="button-confirm-enviar">
              {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function ResumoBox({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "bg-emerald-50 border-emerald-200" : "bg-neutral-50"}`}>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`text-sm font-semibold ${ok ? "text-emerald-700" : "text-neutral-500"}`}>{value}</p>
    </div>
  );
}
