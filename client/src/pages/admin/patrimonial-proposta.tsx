import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { downloadPatrimonialProposalPdf } from "@/lib/patrimonial-proposal-pdf";
import { useAuth } from "@/hooks/use-auth";
import {
  calcPatrimonialPost,
  patrimonialMarginLevel,
  patrimonialNegotiatedMargin,
  patrimonialReleaseMode,
  scaleProposalLineTotals,
  sumPatrimonialLines,
  type PatrimonialPostInput,
  type PatrimonialPricingParams,
  type PatrimonialScale,
  type RateItem,
} from "@shared/patrimonial-pricing";

type Role = {
  id: string;
  name: string;
  salary: number;
  scale: PatrimonialScale;
  armed: boolean;
  night: boolean;
  intervalIndenizado: boolean;
  gratificationPercent: number;
  he60Hours: number;
  he100Hours: number;
  holidayHours: number;
  holidayDsr: boolean;
};

type Matrix = {
  city: string;
  uf: string;
  issPercent: number;
  pisPercent: number;
  cofinsPercent: number;
  taxaAdmPercent: number;
  lucroPercent: number;
  periculosidadePercent: number;
  nightHours: number;
  nightPercent: number;
  dsrPercent: number;
  he60Percent: number;
  he100Percent: number;
  holidayPercent: number;
  hourDivisor: number;
  vrDaily: number;
  vrDiscountPercent: number;
  convenio: number;
  vaComplement: number;
  lifeInsurance: number;
  vtDaily: number;
  vtDiscountPercent: number;
  uniformUnarmed: number;
  uniformArmed: number;
  analiseRisco: number;
  reciclagem: number;
  rh: number;
  ppra: number;
  ajudaCusto: number;
  ppr: number;
  chargeItems: RateItem[];
  provisionItems: RateItem[];
};

type CadastroClient = {
  id: number;
  name: string;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
};

type ProposalEvent = {
  id: string;
  kind: string;
  negotiatedPrice: number | null;
  marginPercent: number | null;
  note: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
};

type SavedSummary = {
  id: string;
  clientId?: number | null;
  clientName: string;
  city: string;
  uf: string;
  totalPrice: number;
  negotiatedPrice?: number;
  marginPercent?: number | null;
  status?: string;
  createdAt: string;
};

type SavedProposal = SavedSummary & {
  issPercent: number;
  listPrice?: number;
  lines: Array<{ functionLabel?: string; roleName?: string; scale?: string; posts?: number; lineTotal?: number }>;
  totalCost: number;
  events?: ProposalEvent[];
};

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const fieldCls = "w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1";
const EVENT_LABEL: Record<string, string> = {
  criada: "Proposta criada",
  preco_negociado: "Preço negociado",
  liberada_automatica: "Liberada automaticamente",
  liberada_diretoria: "Liberada pela diretoria",
  reaberta_diretoria: "Voltou para a diretoria",
};

function brl(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(value: string | number): number {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
function clientLabel(client: CadastroClient): string {
  return String(client.nomeFantasia || client.name || client.razaoSocial || "").trim();
}
function foldName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}
function statusLabel(status?: string): string {
  return status === "liberada" ? "Liberada" : "Aguardando diretoria";
}

function toParams(matrix: Matrix, issPercent: number): PatrimonialPricingParams {
  const pct = (value: number) => value / 100;
  return {
    periculosidadeRate: pct(matrix.periculosidadePercent),
    nightHours: matrix.nightHours,
    nightRate: pct(matrix.nightPercent),
    dsrRate: pct(matrix.dsrPercent),
    he60Rate: pct(matrix.he60Percent),
    he100Rate: pct(matrix.he100Percent),
    holidayRate: pct(matrix.holidayPercent),
    hourDivisor: matrix.hourDivisor || 220,
    vrDaily: matrix.vrDaily,
    vrDiscountRate: pct(matrix.vrDiscountPercent),
    convenio: matrix.convenio,
    vaComplement: matrix.vaComplement,
    lifeInsurance: matrix.lifeInsurance,
    vtDaily: matrix.vtDaily,
    vtDiscountRate: pct(matrix.vtDiscountPercent),
    uniformUnarmed: matrix.uniformUnarmed,
    uniformArmed: matrix.uniformArmed,
    analiseRisco: matrix.analiseRisco,
    reciclagem: matrix.reciclagem,
    rh: matrix.rh,
    ppra: matrix.ppra,
    ajudaCusto: matrix.ajudaCusto,
    ppr: matrix.ppr,
    issRate: pct(issPercent),
    pisRate: pct(matrix.pisPercent),
    cofinsRate: pct(matrix.cofinsPercent),
    taxaAdmRate: pct(matrix.taxaAdmPercent),
    lucroRate: pct(matrix.lucroPercent),
    chargeItems: matrix.chargeItems,
    provisionItems: matrix.provisionItems,
  };
}

export default function PatrimonialPropostaPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const hydrated = useRef(false);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [city, setCity] = useState("São Paulo");
  const [uf, setUf] = useState("SP");
  const [issPercent, setIssPercent] = useState("5");
  const [issNote, setIssNote] = useState("");
  const [lines, setLines] = useState<Array<{ key: string; roleId: string; posts: string }>>([]);
  const [priceTouched, setPriceTouched] = useState(false);
  const [negotiatedInput, setNegotiatedInput] = useState("");
  const [filterClientId, setFilterClientId] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [openProposal, setOpenProposal] = useState<SavedProposal | null>(null);
  const [nextPrice, setNextPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");

  const pricingQuery = useQuery<{ matrix: Matrix; roles: Role[] }>({ queryKey: ["/api/patrimonial/precificacao"] });
  const savedQuery = useQuery<SavedSummary[]>({ queryKey: ["/api/patrimonial/precificacao/propostas"] });
  const clientsQuery = useQuery<CadastroClient[]>({ queryKey: ["/api/clients"] });

  useEffect(() => {
    if (!pricingQuery.data || hydrated.current) return;
    hydrated.current = true;
    setMatrix(pricingQuery.data.matrix);
    setRoles(pricingQuery.data.roles);
    setCity(pricingQuery.data.matrix.city);
    setUf(pricingQuery.data.matrix.uf);
    setIssPercent(String(pricingQuery.data.matrix.issPercent));
  }, [pricingQuery.data]);

  const params = matrix ? toParams(matrix, n(issPercent)) : null;
  const preview = useMemo(() => {
    if (!params) return [];
    return lines.map((line) => {
      const role = roles.find((item) => item.id === line.roleId);
      const input: PatrimonialPostInput = {
        salary: role?.salary || 0,
        gratificationRate: (role?.gratificationPercent || 0) / 100,
        armed: Boolean(role?.armed),
        night: Boolean(role?.night),
        scale: role?.scale || "6 x 1",
        posts: n(line.posts),
        intervalIndenizado: Boolean(role?.intervalIndenizado),
        he60Hours: role?.he60Hours || 0,
        he100Hours: role?.he100Hours || 0,
        holidayHours: role?.holidayHours || 0,
        holidayDsr: Boolean(role?.holidayDsr),
      };
      return { line, role, result: calcPatrimonialPost(input, params) };
    });
  }, [lines, params, roles]);
  const totals = sumPatrimonialLines(preview.map((item) => item.result));
  const listPrice = totals.totalPrice;
  const negotiatedPrice = priceTouched ? n(negotiatedInput) : listPrice;
  const deal = params ? patrimonialNegotiatedMargin({
    totalCost: totals.totalCost,
    negotiatedPrice,
    taxRate: params.issRate + params.pisRate + params.cofinsRate,
    taxaAdmRate: params.taxaAdmRate,
  }) : null;
  const marginPercent = deal?.lucroPercent ?? 0;
  const level = patrimonialMarginLevel(marginPercent);
  const releaseMode = patrimonialReleaseMode(marginPercent);
  const shown = scaleProposalLineTotals(preview.map((item) => item.result.lineTotal), negotiatedPrice);
  const activeClients = (clientsQuery.data || []).filter((client) => client.status !== "inativo");

  const saveProposal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/patrimonial/precificacao/propostas", {
        clientId,
        city,
        uf,
        issPercent: n(issPercent),
        negotiatedPrice,
        lines: lines.map((line) => ({ roleId: line.roleId, posts: n(line.posts) })),
      });
      return res.json();
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonial/precificacao/propostas"] });
      toast({
        title: saved.status === "liberada" ? "Proposta liberada" : "Proposta enviada à diretoria",
        description: saved.status === "liberada" ? "Margem acima de 10%. Liberação automática." : "Margem de 5% a 10%. Aguarda autorização da diretoria.",
      });
    },
    onError: (err: Error) => toast({ title: "Não foi possível salvar", description: err.message, variant: "destructive" }),
  });

  async function lookupIss() {
    try {
      const res = await apiRequest("GET", `/api/patrimonial/iss?cidade=${encodeURIComponent(city)}&uf=${encodeURIComponent(uf)}`);
      const data = await res.json();
      if (data.city) setCity(data.city);
      setIssNote(data.message || "");
      if (data.issPercent != null) setIssPercent(String(data.issPercent));
    } catch (err: any) {
      toast({ title: "Não foi possível consultar a cidade", description: err.message, variant: "destructive" });
    }
  }

  async function openSaved(id: string) {
    const res = await apiRequest("GET", `/api/patrimonial/precificacao/propostas/${id}`);
    const data = await res.json();
    setOpenProposal(data);
    setNextPrice(String(data.negotiatedPrice ?? data.totalPrice ?? ""));
    setPriceNote("");
  }

  const changePrice = useMutation({
    mutationFn: async () => {
      if (!openProposal) throw new Error("Abra uma proposta");
      const res = await apiRequest("POST", `/api/patrimonial/precificacao/propostas/${openProposal.id}/preco`, {
        negotiatedPrice: n(nextPrice),
        note: priceNote,
      });
      return res.json();
    },
    onSuccess: async () => {
      if (openProposal) await openSaved(openProposal.id);
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonial/precificacao/propostas"] });
      toast({ title: "Preço registrado na linha do tempo" });
    },
    onError: (err: Error) => toast({ title: "Não foi possível negociar", description: err.message, variant: "destructive" }),
  });

  const releaseProposal = useMutation({
    mutationFn: async () => {
      if (!openProposal) throw new Error("Abra uma proposta");
      const res = await apiRequest("POST", `/api/patrimonial/precificacao/propostas/${openProposal.id}/liberar`, {});
      return res.json();
    },
    onSuccess: async () => {
      if (openProposal) await openSaved(openProposal.id);
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonial/precificacao/propostas"] });
      toast({ title: "Proposta liberada pela diretoria" });
    },
    onError: (err: Error) => toast({ title: "Não foi possível liberar", description: err.message, variant: "destructive" }),
  });

  const groups = useMemo(() => {
    const rows = savedQuery.data || [];
    const used = new Set<string>();
    const list: Array<{ key: string; label: string; clientId: number | null; items: SavedSummary[] }> = [];
    for (const client of activeClients) {
      const names = [client.nomeFantasia, client.name, client.razaoSocial].map((value) => foldName(String(value || ""))).filter(Boolean);
      const items = rows.filter((row) => row.clientId === client.id || names.includes(foldName(row.clientName)));
      if (items.length === 0) continue;
      items.forEach((item) => used.add(item.id));
      list.push({ key: `client-${client.id}`, label: clientLabel(client), clientId: client.id, items });
    }
    for (const row of rows) {
      if (used.has(row.id)) continue;
      const key = `name-${foldName(row.clientName) || "sem"}`;
      const current = list.find((group) => group.key === key);
      if (current) current.items.push(row);
      else list.push({ key, label: row.clientName || "Sem cliente", clientId: row.clientId ?? null, items: [row] });
    }
    return filterClientId == null ? list : list.filter((group) => group.clientId === filterClientId);
  }, [savedQuery.data, activeClients, filterClientId]);

  if (pricingQuery.isLoading || (!matrix && !pricingQuery.isError)) {
    return <AdminLayout><p className="p-6 text-sm text-slate-500">Carregando a proposta…</p></AdminLayout>;
  }
  if (!matrix) {
    return <AdminLayout><p className="p-6 text-sm text-red-600">Salve a precificação antes de montar a proposta.</p></AdminLayout>;
  }

  const openQuoted = openProposal ? patrimonialNegotiatedMargin({
    totalCost: openProposal.totalCost,
    negotiatedPrice: n(nextPrice),
    taxRate: (openProposal.issPercent + matrix.pisPercent + matrix.cofinsPercent) / 100,
    taxaAdmRate: matrix.taxaAdmPercent / 100,
  }) : null;
  const openMode = openQuoted ? patrimonialReleaseMode(openQuoted.lucroPercent) : "bloqueado";
  const savedPrice = Number(openProposal?.negotiatedPrice ?? openProposal?.totalPrice ?? 0);

  return (
    <AdminLayout>
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 md:p-6 space-y-6">
        <header className="print:hidden border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-extrabold text-blue-500">Proposta comercial</h1>
          <p className="text-sm text-slate-400">O preço pode ser negociado. De 5% a 10% a diretoria libera. Acima de 10% libera sozinha. A linha do tempo fica só aqui dentro.</p>
        </header>

        <section className="print:hidden bg-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <span className={labelCls}>Cliente do cadastro</span>
            <ClientSearch clients={activeClients} selectedId={clientId} placeholder="Buscar no cadastro de clientes" onSelect={(client) => {
              setClientId(client.id);
              setClientName(clientLabel(client));
              if (client.city) setCity(client.city);
              const nextUf = String(client.state || "").toUpperCase();
              if (UFS.includes(nextUf)) setUf(nextUf);
            }} />
          </div>
          <label><span className={labelCls}>Cidade</span><input className={fieldCls} value={city} onChange={(e) => setCity(e.target.value)} /></label>
          <label><span className={labelCls}>UF</span>
            <select className={fieldCls} value={uf} onChange={(e) => setUf(e.target.value)}>{UFS.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label><span className={labelCls}>ISS %</span><input className={fieldCls} type="number" min="0" max="5" step="0.01" value={issPercent} onChange={(e) => setIssPercent(e.target.value)} /></label>
          <div className="md:col-span-5 flex flex-col md:flex-row md:items-center gap-3">
            <button type="button" onClick={lookupIss} className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm font-semibold">Buscar cidade e ISS</button>
            <p className="text-xs text-slate-400">{issNote || "O ISS entra no preço. O custo da folha continua o da precificação."}</p>
          </div>
        </section>

        <section className="print:hidden flex flex-wrap gap-2">
          {roles.map((role) => (
            <button key={role.id} type="button" className="text-xs bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5" onClick={() => setLines((current) => [...current, { key: `${Date.now()}-${role.id}`, roleId: role.id, posts: "1" }])}>
              + {role.name}
            </button>
          ))}
        </section>

        <div className="print:hidden space-y-3">
          {preview.map(({ line, role, result }) => (
            <article key={line.key} className="bg-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <p className="font-semibold">{role?.name}</p>
                  <p className="text-xs text-slate-400">
                    Dados da precificação · escala {role?.scale || "6 x 1"} · noturno {role?.night ? "sim" : "não"} · intervalo {role?.intervalIndenizado ? "sim" : "não"} · HE {role?.he100Hours || 0}h · feriado {role?.holidayHours || 0}h
                  </p>
                </div>
                <label className="w-28"><span className={labelCls}>Postos</span>
                  <input className={fieldCls} type="number" min="0" value={line.posts} onChange={(e) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, posts: e.target.value } : item))} />
                </label>
                <button type="button" className="text-sm text-red-300" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Remover</button>
              </div>
              <p className="text-xs text-slate-300">
                Salário {brl(result.salary)} · periculosidade {brl(result.periculosidade)} · VR {brl(result.vr)} · VT {brl(result.transport)} · VA + seguro {brl(result.va + result.lifeInsurance)} · indiretos {brl(result.indirect)} · encargos {brl(result.charges)} · provisão {brl(result.provision)}
              </p>
              <p className="text-sm">Custo da linha <span className="font-black">{brl(result.lineCost)}</span> · preço de tabela <span className="font-black text-emerald-400">{brl(result.lineTotal)}</span></p>
            </article>
          ))}
        </div>

        <section className="print:hidden bg-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><span className={labelCls}>Preço de tabela</span><p className="text-lg font-black">{brl(listPrice)}</p></div>
          <label>
            <span className={labelCls}>Preço negociado</span>
            <input className={fieldCls} type="number" min="0" step="0.01" value={priceTouched ? negotiatedInput : (listPrice ? String(listPrice) : "")} onChange={(e) => { setPriceTouched(true); setNegotiatedInput(e.target.value); }} />
          </label>
          <div><span className={labelCls}>Lucro desta negociação</span><p className="text-lg font-black">{deal ? brl(deal.lucroValue) : "—"}</p></div>
        </section>

        <MarginThermometer percent={marginPercent} level={level} />

        <section className="bg-white text-slate-900 rounded-3xl p-6 border-t-8 border-blue-600 space-y-4">
          <div className="flex justify-between">
            <div>
              <h2 className="text-xl font-black">Proposta patrimonial</h2>
              <p className="text-sm text-slate-500">{clientName || "Cliente"} · {city}/{uf}</p>
            </div>
            <button type="button" className="text-sm font-semibold text-blue-700 print:hidden" onClick={() => window.print()}>Imprimir</button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="text-left py-2">Função</th><th className="text-left">Escala</th><th className="text-right">Postos</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {preview.map(({ line, role }, index) => (
                <tr key={line.key} className="border-t border-slate-200">
                  <td className="py-2">{role?.name}</td>
                  <td>{role?.scale}</td>
                  <td className="text-right">{n(line.posts)}</td>
                  <td className="text-right font-semibold">{brl(shown[index] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right font-black text-blue-700">Total da proposta {brl(negotiatedPrice)}</p>
          <div className="print:hidden flex flex-wrap gap-2">
            <button type="button" className="bg-blue-600 disabled:opacity-60 text-white font-bold px-4 py-3 rounded-xl" disabled={saveProposal.isPending || releaseMode === "bloqueado" || clientId == null || lines.length === 0} onClick={() => saveProposal.mutate()}>
              {saveProposal.isPending ? "Salvando…" : releaseMode === "bloqueado" ? "Margem abaixo de 5%" : releaseMode === "automatica" ? "Salvar e liberar" : "Salvar e enviar à diretoria"}
            </button>
            <button
              type="button"
              className="border border-blue-600 text-blue-700 disabled:opacity-60 font-bold px-4 py-3 rounded-xl"
              disabled={releaseMode === "bloqueado" || clientId == null || lines.length === 0}
              onClick={() => downloadPatrimonialProposalPdf({
                clientName,
                city,
                uf,
                total: negotiatedPrice,
                lines: preview.map(({ line, role }, index) => ({
                  funcao: role?.name || "Função",
                  escala: role?.scale || "",
                  postos: n(line.posts),
                  total: shown[index] || 0,
                })),
              })}
            >
              Gerar proposta em PDF
            </button>
          </div>
        </section>

        <section className="print:hidden bg-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h2 className="font-bold">Propostas por cliente</h2>
              <p className="text-xs text-slate-400">Uma linha por cliente. Clique para abrir. O histórico continua depois da liberação.</p>
            </div>
            <div className="md:w-80">
              <ClientSearch clients={activeClients} selectedId={filterClientId} placeholder="Filtrar pelo cadastro" onSelect={(client) => { setFilterClientId(client.id); setExpandedKey(`client-${client.id}`); }} />
            </div>
          </div>
          {groups.map((group) => {
            const open = expandedKey === group.key;
            return (
              <div key={group.key} className="border border-slate-700 rounded-xl overflow-hidden">
                <button type="button" className="w-full text-left px-4 py-3 bg-slate-900 flex justify-between text-sm font-semibold" onClick={() => { setExpandedKey(open ? null : group.key); if (open) setOpenProposal(null); }}>
                  <span>{open ? "▾" : "▸"} {group.label}</span>
                  <span className="text-slate-400 font-normal">{group.items.length} proposta{group.items.length === 1 ? "" : "s"}</span>
                </button>
                {open && group.items.map((item) => (
                  <button key={item.id} type="button" className="w-full text-left px-4 py-3 border-t border-slate-700 text-sm flex justify-between" onClick={() => openSaved(item.id).catch((err) => toast({ title: "Não foi possível abrir", description: err.message, variant: "destructive" }))}>
                    <span>{new Date(item.createdAt).toLocaleString("pt-BR")} · {statusLabel(item.status)} · {Number(item.marginPercent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                    <span className="font-semibold text-emerald-400">{brl(item.negotiatedPrice ?? item.totalPrice)}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {openProposal && (
            <div className="bg-white text-slate-900 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-black">{openProposal.clientName}</h3>
                  <p className="text-xs text-slate-500">{statusLabel(openProposal.status)} · tabela {brl(openProposal.listPrice || 0)} · negociado {brl(openProposal.negotiatedPrice || openProposal.totalPrice)}</p>
                </div>
                <button type="button" className="text-sm text-slate-500" onClick={() => setOpenProposal(null)}>Fechar</button>
              </div>
              <h4 className="font-bold text-sm">Linha do tempo interna</h4>
              <ol className="space-y-2">
                {(openProposal.events || []).map((event) => (
                  <li key={event.id} className="text-xs border-l-2 border-blue-600 pl-3">
                    <p className="font-semibold">{EVENT_LABEL[event.kind] || event.kind}</p>
                    <p className="text-slate-500">{new Date(event.createdAt).toLocaleString("pt-BR")} · {event.actorName || "Sistema"}{event.actorRole ? ` · ${event.actorRole}` : ""}</p>
                    <p>{event.negotiatedPrice != null ? brl(event.negotiatedPrice) : "—"} · margem {event.marginPercent ?? "—"}%</p>
                    {event.note ? <p>{event.note}</p> : null}
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label><span className="text-[10px] uppercase text-slate-500">Novo preço</span>
                  <input className="w-full border rounded-lg p-2" type="number" value={nextPrice} onChange={(e) => setNextPrice(e.target.value)} />
                </label>
                <label className="md:col-span-2"><span className="text-[10px] uppercase text-slate-500">Nota interna</span>
                  <input className="w-full border rounded-lg p-2" value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="O que mudou nesta negociação" />
                </label>
              </div>
              {openQuoted && <p className="text-xs">Margem deste preço: {openQuoted.lucroPercent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · {openMode === "bloqueado" ? "abaixo de 5%, não pode" : openMode === "automatica" ? "acima de 10%, libera sozinha" : "de 5% a 10%, pede diretoria"}</p>}
              <div className="flex gap-2">
                <button type="button" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-lg disabled:opacity-50" disabled={changePrice.isPending || openMode === "bloqueado"} onClick={() => changePrice.mutate()}>Registrar preço</button>
                {user?.role === "diretoria" && openProposal.status !== "liberada" && (
                  <button type="button" className="bg-blue-700 text-white text-sm px-3 py-2 rounded-lg disabled:opacity-50" disabled={releaseProposal.isPending || Math.abs(n(nextPrice) - savedPrice) >= 0.01} onClick={() => releaseProposal.mutate()}>Liberar (diretoria)</button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

function MarginThermometer({ percent, level }: { percent: number; level: "bloqueado" | "atencao" | "ok" | "otimo" }) {
  const marker = Math.min(Math.max(percent, 0), 20) / 20 * 100;
  const copy = {
    bloqueado: "Abaixo de 5%. Esta proposta não pode seguir.",
    atencao: "Entre 5% e 10%. A diretoria precisa autorizar.",
    ok: "10%. A diretoria precisa autorizar.",
    otimo: "Acima de 10%. Liberação automática.",
  }[level];
  return (
    <section className="print:hidden bg-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex justify-between">
        <div>
          <h2 className="font-bold">Termômetro da margem</h2>
          <p className="text-xs text-slate-400">Uso interno. Não entra na apresentação.</p>
        </div>
        <p className="font-black">{percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden flex">
        <div className="h-full bg-red-500" style={{ width: "25%" }} />
        <div className="h-full bg-amber-400" style={{ width: "25%" }} />
        <div className="h-full bg-emerald-500" style={{ width: "50%" }} />
        <span className="absolute top-0 h-full w-0.5 bg-white" style={{ left: `${marker}%` }} />
      </div>
      <p className="text-sm">{copy}</p>
    </section>
  );
}

function ClientSearch({ clients, selectedId, onSelect, placeholder }: { clients: CadastroClient[]; selectedId: number | null; onSelect: (client: CadastroClient) => void; placeholder: string }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const selected = clients.find((client) => client.id === selectedId) || null;
  const needle = text.trim().toLocaleLowerCase("pt-BR");
  const options = clients.filter((client) => {
    if (!needle) return true;
    return `${client.nomeFantasia || ""} ${client.name || ""} ${client.razaoSocial || ""}`.toLocaleLowerCase("pt-BR").includes(needle);
  }).slice(0, 8);
  return (
    <div className="relative">
      <input className={fieldCls} value={open ? text : (selected ? clientLabel(selected) : "")} placeholder={placeholder} onFocus={() => { setOpen(true); setText(""); }} onChange={(e) => { setText(e.target.value); setOpen(true); }} />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-lg">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Nenhum cliente no cadastro.</li>}
          {options.map((client) => (
            <li key={client.id}>
              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800" onClick={() => { onSelect(client); setOpen(false); setText(""); }}>
                {clientLabel(client)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
