import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AdminLayout from "@/components/admin/layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  PATRIMONIAL_SCALES,
  calcPatrimonialPost,
  type PatrimonialPricingParams,
  type PatrimonialScale,
  type RateItem,
} from "@shared/patrimonial-pricing";

type Role = {
  id: string;
  name: string;
  salary: number;
  scale?: PatrimonialScale;
  armed?: boolean;
  night?: boolean;
  intervalIndenizado?: boolean;
  gratificationPercent?: number;
  he60Hours?: number;
  he100Hours?: number;
  holidayHours?: number;
  holidayDsr?: boolean;
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
  chargePercent: number;
  provisionPercent: number;
};

const fieldCls = "w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1";

function brl(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function n(value: string | number): number {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toParams(matrix: Matrix): PatrimonialPricingParams {
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
    issRate: pct(matrix.issPercent),
    pisRate: pct(matrix.pisPercent),
    cofinsRate: pct(matrix.cofinsPercent),
    taxaAdmRate: pct(matrix.taxaAdmPercent),
    lucroRate: pct(matrix.lucroPercent),
    chargeItems: matrix.chargeItems,
    provisionItems: matrix.provisionItems,
  };
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input className={fieldCls} type="number" step="0.01" value={value} onChange={(e) => onChange(n(e.target.value))} />
    </label>
  );
}

export default function PatrimonialPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const hydrated = useRef(false);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

  const pricingQuery = useQuery<{ matrix: Matrix; roles: Role[] }>({
    queryKey: ["/api/patrimonial/precificacao"],
  });

  useEffect(() => {
    if (!pricingQuery.data || hydrated.current) return;
    hydrated.current = true;
    setMatrix(pricingQuery.data.matrix);
    setRoles(pricingQuery.data.roles);
  }, [pricingQuery.data]);

  const params = matrix ? toParams(matrix) : null;

  const saveMatrix = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/patrimonial/precificacao/matriz", matrix);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonial/precificacao"] });
      toast({ title: "Matriz salva" });
    },
    onError: (err: Error) => toast({ title: "Não foi possível salvar a matriz", description: err.message, variant: "destructive" }),
  });

  const saveRoles = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/patrimonial/precificacao/cargos", { roles });
      return res.json() as Promise<Role[]>;
    },
    onSuccess: (saved) => {
      setRoles(saved);
      queryClient.invalidateQueries({ queryKey: ["/api/patrimonial/precificacao"] });
      toast({ title: "Cargos salvos" });
    },
    onError: (err: Error) => toast({ title: "Não foi possível salvar os cargos", description: err.message, variant: "destructive" }),
  });

  function patchMatrix(partial: Partial<Matrix>) {
    setMatrix((current) => current ? { ...current, ...partial } : current);
  }

  if (pricingQuery.isLoading || (!matrix && !pricingQuery.isError)) {
    return <AdminLayout><p className="p-6 text-sm text-slate-500">Carregando a matriz patrimonial…</p></AdminLayout>;
  }
  if (pricingQuery.isError || !matrix || !params) {
    return <AdminLayout><p className="p-6 text-sm text-red-600">Não foi possível abrir a precificação patrimonial.</p></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 md:p-6 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-blue-500">Precificação</h1>
            <p className="text-sm text-slate-400">Tabela matriz e o custo de cada cargo. A proposta comercial fica em outra tela e usa estes valores.</p>
          </div>
          <button type="button" onClick={() => setLocation("/admin/patrimonial/proposta")} className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800">Abrir proposta comercial</button>
        </header>

        <section className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Cargos e salários</h2>
            <button type="button" onClick={() => saveRoles.mutate()} className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg text-sm font-semibold">Salvar cargos</button>
          </div>
          {roles.map((role, index) => {
            const previewRole = calcPatrimonialPost({
              salary: n(role.salary),
              gratificationRate: n(role.gratificationPercent || 0) / 100,
              armed: Boolean(role.armed),
              night: Boolean(role.night),
              scale: role.scale || "6 x 1",
              posts: 1,
              intervalIndenizado: Boolean(role.intervalIndenizado),
              he60Hours: n(role.he60Hours || 0),
              he100Hours: n(role.he100Hours || 0),
              holidayHours: n(role.holidayHours || 0),
              holidayDsr: Boolean(role.holidayDsr),
            }, params);
            const patch = (change: Partial<Role>) => setRoles(roles.map((item, i) => i === index ? { ...item, ...change } : item));
            return (
              <article key={role.id || index} className="border border-slate-700 rounded-xl p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2 items-end">
                  <input className={fieldCls} value={role.name} onChange={(e) => patch({ name: e.target.value })} />
                  <label><span className={labelCls}>Salário</span><input className={fieldCls} type="number" step="0.01" value={role.salary} onChange={(e) => patch({ salary: n(e.target.value) })} /></label>
                  <button type="button" className="text-sm text-red-300" onClick={() => setRoles(roles.filter((_, i) => i !== index))}>Remover</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <label><span className={labelCls}>Escala</span>
                    <select className={fieldCls} value={role.scale || "6 x 1"} onChange={(e) => patch({ scale: e.target.value as PatrimonialScale })}>
                      {Object.keys(PATRIMONIAL_SCALES).map((scale) => <option key={scale}>{scale}</option>)}
                    </select>
                  </label>
                  <label><span className={labelCls}>Gratificação %</span><input className={fieldCls} type="number" value={role.gratificationPercent || 0} onChange={(e) => patch({ gratificationPercent: n(e.target.value) })} /></label>
                  <label><span className={labelCls}>HE 100%</span><input className={fieldCls} type="number" value={role.he100Hours || 0} onChange={(e) => patch({ he100Hours: n(e.target.value) })} /></label>
                  <label><span className={labelCls}>Horas feriado</span><input className={fieldCls} type="number" value={role.holidayHours || 0} onChange={(e) => patch({ holidayHours: n(e.target.value) })} /></label>
                  <label><span className={labelCls}>Noturno</span>
                    <select className={fieldCls} value={role.night ? "sim" : "nao"} onChange={(e) => patch({ night: e.target.value === "sim" })}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </label>
                  <label><span className={labelCls}>Intervalo indenizado</span>
                    <select className={fieldCls} value={role.intervalIndenizado ? "sim" : "nao"} onChange={(e) => patch({ intervalIndenizado: e.target.value === "sim" })}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </label>
                </div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(role.armed)} onChange={(e) => patch({ armed: e.target.checked })} /> Armado</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(role.holidayDsr)} onChange={(e) => patch({ holidayDsr: e.target.checked })} /> DSR do feriado</label>
                </div>
                {n(role.salary) <= 0 && <p className="text-xs text-amber-300">Sem salário, periculosidade, encargos, provisão e o desconto de 6% do VT ficam zerados.</p>}
                <CostBreakdown result={previewRole} lucroPercent={matrix.lucroPercent} />
              </article>
            );
          })}
          <button type="button" className="text-sm text-blue-300" onClick={() => setRoles([...roles, { id: "", name: "Novo cargo", salary: 0, scale: "6 x 1" }])}>Adicionar cargo</button>
        </section>

        <section className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-bold">Benefícios e custos indiretos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField label="VR por dia" value={matrix.vrDaily} onChange={(vrDaily) => patchMatrix({ vrDaily })} />
            <NumField label="Desconto VR %" value={matrix.vrDiscountPercent} onChange={(vrDiscountPercent) => patchMatrix({ vrDiscountPercent })} />
            <NumField label="Convênio" value={matrix.convenio} onChange={(convenio) => patchMatrix({ convenio })} />
            <NumField label="VA complementar" value={matrix.vaComplement} onChange={(vaComplement) => patchMatrix({ vaComplement })} />
            <NumField label="Seguro de vida + RC" value={matrix.lifeInsurance} onChange={(lifeInsurance) => patchMatrix({ lifeInsurance })} />
            <NumField label="VT por dia" value={matrix.vtDaily} onChange={(vtDaily) => patchMatrix({ vtDaily })} />
            <NumField label="Desconto VT %" value={matrix.vtDiscountPercent} onChange={(vtDiscountPercent) => patchMatrix({ vtDiscountPercent })} />
            <NumField label="Ajuda de custo" value={matrix.ajudaCusto} onChange={(ajudaCusto) => patchMatrix({ ajudaCusto })} />
            <NumField label="PPR" value={matrix.ppr} onChange={(ppr) => patchMatrix({ ppr })} />
            <NumField label="Uniforme" value={matrix.uniformUnarmed} onChange={(uniformUnarmed) => patchMatrix({ uniformUnarmed })} />
            <NumField label="Uniforme armado" value={matrix.uniformArmed} onChange={(uniformArmed) => patchMatrix({ uniformArmed })} />
            <NumField label="Análise de risco" value={matrix.analiseRisco} onChange={(analiseRisco) => patchMatrix({ analiseRisco })} />
            <NumField label="Reciclagem" value={matrix.reciclagem} onChange={(reciclagem) => patchMatrix({ reciclagem })} />
            <NumField label="RH" value={matrix.rh} onChange={(rh) => patchMatrix({ rh })} />
            <NumField label="PPRA/PCMSO" value={matrix.ppra} onChange={(ppra) => patchMatrix({ ppra })} />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RateList title={`Encargos do mês (${matrix.chargeItems.reduce((acc, item) => acc + n(item.percent), 0).toLocaleString("pt-BR")}%)`} items={matrix.chargeItems} onChange={(chargeItems) => patchMatrix({ chargeItems })} />
          <RateList title={`Provisão (${matrix.provisionItems.reduce((acc, item) => acc + n(item.percent), 0).toLocaleString("pt-BR")}%)`} items={matrix.provisionItems} onChange={(provisionItems) => patchMatrix({ provisionItems })} />
        </section>

        <section className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <h2 className="font-bold">Impostos, taxa e parâmetros da folha</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField label="ISS %" value={matrix.issPercent} onChange={(issPercent) => patchMatrix({ issPercent })} />
            <NumField label="PIS %" value={matrix.pisPercent} onChange={(pisPercent) => patchMatrix({ pisPercent })} />
            <NumField label="COFINS %" value={matrix.cofinsPercent} onChange={(cofinsPercent) => patchMatrix({ cofinsPercent })} />
            <NumField label="Taxa administrativa %" value={matrix.taxaAdmPercent} onChange={(taxaAdmPercent) => patchMatrix({ taxaAdmPercent })} />
            <NumField label="Lucro %" value={matrix.lucroPercent} onChange={(lucroPercent) => patchMatrix({ lucroPercent })} />
            <NumField label="Periculosidade %" value={matrix.periculosidadePercent} onChange={(periculosidadePercent) => patchMatrix({ periculosidadePercent })} />
            <NumField label="Adicional noturno %" value={matrix.nightPercent} onChange={(nightPercent) => patchMatrix({ nightPercent })} />
            <NumField label="Horas noturnas" value={matrix.nightHours} onChange={(nightHours) => patchMatrix({ nightHours })} />
            <NumField label="DSR %" value={matrix.dsrPercent} onChange={(dsrPercent) => patchMatrix({ dsrPercent })} />
            <NumField label="HE 60% adicional" value={matrix.he60Percent} onChange={(he60Percent) => patchMatrix({ he60Percent })} />
            <NumField label="HE 100%" value={matrix.he100Percent} onChange={(he100Percent) => patchMatrix({ he100Percent })} />
            <NumField label="Feriado %" value={matrix.holidayPercent} onChange={(holidayPercent) => patchMatrix({ holidayPercent })} />
            <NumField label="Divisor de horas" value={matrix.hourDivisor} onChange={(hourDivisor) => patchMatrix({ hourDivisor })} />
          </div>
          <button type="button" onClick={() => saveMatrix.mutate()} disabled={saveMatrix.isPending} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-2 rounded-lg font-semibold">
            {saveMatrix.isPending ? "Salvando…" : "Salvar matriz"}
          </button>
        </section>
      </div>
    </AdminLayout>
  );
}

function RateList({ title, items, onChange }: { title: string; items: RateItem[]; onChange: (items: RateItem[]) => void }) {
  return (
    <section className="bg-slate-800 rounded-2xl p-4 space-y-2">
      <h2 className="font-bold">{title}</h2>
      {items.map((item, index) => (
        <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_120px_auto] gap-2">
          <input className={fieldCls} value={item.name} onChange={(e) => onChange(items.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
          <input className={fieldCls} type="number" step="0.01" value={item.percent} onChange={(e) => onChange(items.map((row, i) => i === index ? { ...row, percent: n(e.target.value) } : row))} />
          <button type="button" className="text-sm text-red-300" onClick={() => onChange(items.filter((_, i) => i !== index))}>Remover</button>
        </div>
      ))}
      <button type="button" className="text-sm text-blue-300" onClick={() => onChange([...items, { name: "Novo item", percent: 0 }])}>Adicionar</button>
    </section>
  );
}

function CostBreakdown({ result, lucroPercent }: { result: ReturnType<typeof calcPatrimonialPost>; lucroPercent: number }) {
  const lucro = result.pricePerEmployee * (n(lucroPercent) / 100);
  const rows = [
    ["Salário", result.salary],
    ["Gratificação", result.gratification],
    ["Periculosidade", result.periculosidade],
    ["Ad. noturno", result.nightAdditional],
    ["DSR adicional", result.dsrNight],
    ["HE", result.heValue],
    ["DSR HE", result.dsrHe],
    ["Prov. feriado", result.holidayProvision],
    ["DSR feriado", result.dsrHoliday],
    ["Intervalo", result.interval],
    ["VR c/ desc. 18%", result.vr],
    ["Convênio", result.convenio],
    ["VA", result.va],
    ["Seguro de vida", result.lifeInsurance],
    ["VT c/ desc. 6%", result.transport],
    ["Custos indiretos", result.indirect],
    ["Encargos do mês (INSS + FGTS)", result.charges],
    ["Provisão", result.provision],
    ["PPR", result.ppr],
    ["Ajuda de custo", result.ajudaCusto],
  ] as const;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-xs text-slate-300">
        {rows.map(([label, value]) => (
          <p key={label}><span className="text-slate-500">{label}</span> {brl(value)}</p>
        ))}
      </div>
      <p className="text-xs text-slate-400">VT + VA + seguro de vida {brl(result.transport + result.va + result.lifeInsurance)} entra uma vez no custo, junto com o VR já descontado.</p>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <p>Custo por funcionário <span className="font-black">{brl(result.costPerEmployee)}</span></p>
        <p className="text-amber-300">Lucro {brl(lucro)}</p>
        <p className="text-emerald-400 font-black">Preço {brl(result.pricePerEmployee)}</p>
      </div>
    </div>
  );
}
