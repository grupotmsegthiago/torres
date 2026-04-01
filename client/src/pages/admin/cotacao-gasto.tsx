import { useState, useCallback } from "react";
import AdminLayout from "@/components/admin/layout";
import { Input } from "@/components/ui/input";
import { Calculator, Fuel, User, FileText, MapPin, Loader2, Navigation } from "lucide-react";
import { PlacesAutocomplete, calculateRouteInfo, type RouteInfo } from "@/components/places-autocomplete";

const DEFAULTS = {
  origem: "",
  destino: "",
  kmPorLitro: 13,
  valorLitro: 5.0,
  kmPercurso: 0,
  pedagios: 0,
  salarioBase: 2432.50,
  periculosidade: 729.75,
  fgts: 8,
  provisao13: 8.33,
  provisaoFerias: 11.11,
  inss: 20,
  vale_transporte: 0,
  vale_refeicao: 30.0,
  diasMes: 31,
  notaFiscalPct: 21,
  lucroPct: 20,
  qtdVigilantes: 1,
  horasMissao: 8,
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

export default function CotacaoGastoPage() {
  const [params, setParams] = useState(DEFAULTS);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);

  const set = (key: keyof typeof DEFAULTS, val: string) => {
    if (key === "origem" || key === "destino") {
      setParams(prev => ({ ...prev, [key]: val }));
    } else {
      setParams(prev => ({ ...prev, [key]: Number(val) || 0 }));
    }
  };

  const tryCalculateRoute = useCallback(async (origin: string, destination: string) => {
    if (!origin || !destination) return;
    setCalculatingRoute(true);
    const info = await calculateRouteInfo(origin, destination);
    setCalculatingRoute(false);
    if (info) {
      setRouteInfo(info);
      const kmRound = Math.round(info.distanceMeters / 1000);
      setParams(prev => ({ ...prev, kmPercurso: kmRound * 2 }));
    }
  }, []);

  const custoCombustivelKm = params.kmPorLitro > 0 ? params.valorLitro / params.kmPorLitro : 0;
  const custoCombustivelMissao = custoCombustivelKm * params.kmPercurso;

  const baseSalarial = params.salarioBase + params.periculosidade;
  const encargoPct = (params.inss + params.fgts + params.provisao13 + params.provisaoFerias) / 100;
  const custoEncargos = baseSalarial * encargoPct;
  const beneficios = params.vale_transporte + params.vale_refeicao;
  const custoMensalVigilante = baseSalarial + custoEncargos + beneficios;
  const custoDiarioVigilante = params.diasMes > 0 ? custoMensalVigilante / params.diasMes : 0;

  const custoOperacional = custoDiarioVigilante * params.qtdVigilantes + custoCombustivelMissao + params.pedagios;

  const baseNF = custoOperacional / (1 - params.notaFiscalPct / 100);
  const valorNF = baseNF - custoOperacional;

  const CUSTO_MINIMO = 530;
  const precoCalculado = baseNF / (1 - params.lucroPct / 100);
  const precoFinal = Math.max(precoCalculado, CUSTO_MINIMO);
  const lucro = precoFinal - baseNF;
  const margemReal = precoFinal > 0 ? (lucro / precoFinal) * 100 : 0;
  const usouMinimo = precoCalculado < CUSTO_MINIMO;

  const custoKmFinal = params.kmPercurso > 0 ? precoFinal / params.kmPercurso : 0;
  const custoHoraFinal = params.horasMissao > 0 ? precoFinal / params.horasMissao : 0;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl" data-testid="admin-cotacao-gasto">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 uppercase tracking-wider" data-testid="text-page-title">
            Cotação de Gasto Mínimo
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Calculadora de custo mínimo por missão de escolta</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MapPin size={14} /> Missão
              </h3>
              <div className="grid grid-cols-1 gap-3 mb-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Origem</label>
                  <PlacesAutocomplete
                    value={params.origem}
                    onChange={val => set("origem", val)}
                    onPlaceSelect={place => {
                      set("origem", place.address);
                      tryCalculateRoute(place.address, params.destino);
                    }}
                    placeholder="Ex: TECON SANTOS - GUARUJÁ/SP"
                    theme="light"
                    data-testid="input-origem"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Destino</label>
                  <PlacesAutocomplete
                    value={params.destino}
                    onChange={val => set("destino", val)}
                    onPlaceSelect={place => {
                      set("destino", place.address);
                      tryCalculateRoute(params.origem, place.address);
                    }}
                    placeholder="Ex: DHL EXTREMA - EXTREMA/MG"
                    theme="light"
                    data-testid="input-destino"
                  />
                </div>
              </div>
              {calculatingRoute && (
                <div className="flex items-center gap-2 text-xs text-neutral-500 mt-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Calculando rota...
                </div>
              )}
              {routeInfo && !calculatingRoute && (
                <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                  <Navigation size={14} className="text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-800">
                    <span className="font-bold">{routeInfo.distanceText}</span> (trecho) · <span className="font-bold">{routeInfo.durationText}</span> estimado
                    <span className="text-emerald-600 ml-2">→ KM ida+volta preenchido automaticamente</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Fuel size={14} /> Combustível & Percurso
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">KM/Litro</label>
                  <Input type="number" step="0.1" value={params.kmPorLitro} onChange={e => set("kmPorLitro", e.target.value)} data-testid="input-km-litro" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">R$/Litro</label>
                  <Input type="number" step="0.01" value={params.valorLitro} onChange={e => set("valorLitro", e.target.value)} data-testid="input-valor-litro" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">KM Percurso (ida+volta)</label>
                  <Input type="number" value={params.kmPercurso} onChange={e => set("kmPercurso", e.target.value)} data-testid="input-km-percurso" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Pedágios (R$)</label>
                  <Input type="number" step="0.01" value={params.pedagios} onChange={e => set("pedagios", e.target.value)} data-testid="input-pedagios" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Horas Missão</label>
                  <Input type="number" step="0.5" value={params.horasMissao} onChange={e => set("horasMissao", e.target.value)} data-testid="input-horas-missao" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Qtd Vigilantes</label>
                  <Input type="number" min={1} value={params.qtdVigilantes} onChange={e => set("qtdVigilantes", e.target.value)} data-testid="input-qtd-vigilantes" />
                </div>
              </div>
              <div className="mt-3 p-3 bg-neutral-50 rounded-lg">
                <p className="text-[11px] text-neutral-500">Custo por KM: <span className="font-bold text-neutral-900">{fmt(custoCombustivelKm)}</span></p>
                <p className="text-[11px] text-neutral-500">Combustível da missão: <span className="font-bold text-neutral-900">{fmt(custoCombustivelMissao)}</span></p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={14} /> Custo Vigilante (Mensal)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Salário Base</label>
                  <Input type="number" step="0.01" value={params.salarioBase} onChange={e => set("salarioBase", e.target.value)} data-testid="input-salario" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Periculosidade (30%)</label>
                  <Input type="number" step="0.01" value={params.periculosidade} onChange={e => set("periculosidade", e.target.value)} data-testid="input-periculosidade" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">INSS (%)</label>
                  <Input type="number" step="0.01" value={params.inss} onChange={e => set("inss", e.target.value)} data-testid="input-inss" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">FGTS (%)</label>
                  <Input type="number" step="0.01" value={params.fgts} onChange={e => set("fgts", e.target.value)} data-testid="input-fgts" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">13° Provisão (%)</label>
                  <Input type="number" step="0.01" value={params.provisao13} onChange={e => set("provisao13", e.target.value)} data-testid="input-prov13" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Férias Provisão (%)</label>
                  <Input type="number" step="0.01" value={params.provisaoFerias} onChange={e => set("provisaoFerias", e.target.value)} data-testid="input-prov-ferias" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Vale Transporte</label>
                  <Input type="number" step="0.01" value={params.vale_transporte} onChange={e => set("vale_transporte", e.target.value)} data-testid="input-vt" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Vale Refeição</label>
                  <Input type="number" step="0.01" value={params.vale_refeicao} onChange={e => set("vale_refeicao", e.target.value)} data-testid="input-vr" />
                </div>
              </div>
              <div className="mt-3 p-3 bg-neutral-50 rounded-lg space-y-1">
                <p className="text-[11px] text-neutral-500">Salário Base: <span className="font-bold text-neutral-900">{fmt(params.salarioBase)}</span></p>
                <p className="text-[11px] text-neutral-500">Periculosidade: <span className="font-bold text-neutral-900">{fmt(params.periculosidade)}</span></p>
                <p className="text-[11px] text-neutral-500">Base Salarial: <span className="font-bold text-neutral-900">{fmt(baseSalarial)}</span></p>
                <p className="text-[11px] text-neutral-500">Encargos ({fmtPct(encargoPct * 100)}): <span className="font-bold text-neutral-900">{fmt(custoEncargos)}</span></p>
                <p className="text-[11px] text-neutral-500">Benefícios (VT + VR): <span className="font-bold text-neutral-900">{fmt(beneficios)}</span></p>
                <div className="border-t border-neutral-200 pt-1 mt-1">
                  <p className="text-[11px] text-neutral-500">Custo Mensal: <span className="font-black text-neutral-900">{fmt(custoMensalVigilante)}</span></p>
                  <p className="text-[11px] text-neutral-500">Custo Diário (÷{params.diasMes}): <span className="font-black text-neutral-900">{fmt(custoDiarioVigilante)}</span></p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 p-5">
              <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileText size={14} /> NF & Margem
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Nota Fiscal (%)</label>
                  <Input type="number" step="0.1" value={params.notaFiscalPct} onChange={e => set("notaFiscalPct", e.target.value)} data-testid="input-nf-pct" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-neutral-500 mb-1 block">Lucro (%)</label>
                  <Input type="number" step="0.1" value={params.lucroPct} onChange={e => set("lucroPct", e.target.value)} data-testid="input-lucro-pct" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {(params.origem || params.destino) && (
              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <h3 className="text-xs font-black text-neutral-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin size={14} /> Rota da Missão
                </h3>
                {params.origem && (
                  <p className="text-sm text-neutral-700"><span className="text-[10px] font-bold text-neutral-400 uppercase">Origem:</span> {params.origem}</p>
                )}
                {params.destino && (
                  <p className="text-sm text-neutral-700 mt-1"><span className="text-[10px] font-bold text-neutral-400 uppercase">Destino:</span> {params.destino}</p>
                )}
              </div>
            )}

            <div className="bg-neutral-900 rounded-xl p-6 text-white">
              <h3 className="text-xs font-black uppercase tracking-wider text-neutral-400 mb-5 flex items-center gap-2">
                <Calculator size={14} /> Resultado da Cotação
              </h3>

              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Custos Operacionais</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-300">Vigilante{params.qtdVigilantes > 1 ? `s (${params.qtdVigilantes}×)` : ""} /dia</span>
                      <span className="font-bold font-mono">{fmt(custoDiarioVigilante * params.qtdVigilantes)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-300">Combustível ({params.kmPercurso} km)</span>
                      <span className="font-bold font-mono">{fmt(custoCombustivelMissao)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-300">Pedágios</span>
                      <span className="font-bold font-mono">{fmt(params.pedagios)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-1.5 flex justify-between text-sm">
                      <span className="text-neutral-200 font-bold">Custo Operacional</span>
                      <span className="font-black font-mono text-amber-400">{fmt(custoOperacional)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Impostos & Margem</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-300">Nota Fiscal ({fmtPct(params.notaFiscalPct)})</span>
                      <span className="font-bold font-mono">{fmt(valorNF)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-300">Lucro ({fmtPct(params.lucroPct)})</span>
                      <span className="font-bold font-mono text-emerald-400">{fmt(lucro)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-emerald-600/20 border border-emerald-500/30 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider mb-1">Preço Mínimo da Missão</p>
                  <p className="text-3xl font-black font-mono text-white" data-testid="text-preco-final">{fmt(precoFinal)}</p>
                  <p className="text-xs text-emerald-300 mt-1">Margem real: {fmtPct(margemReal)}</p>
                  {usouMinimo && (
                    <p className="text-[10px] text-amber-300 mt-1 font-bold">⚠ Piso mínimo aplicado (R$ {CUSTO_MINIMO.toFixed(2).replace(".", ",")})</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase">R$/KM</p>
                    <p className="text-lg font-black font-mono mt-1" data-testid="text-custo-km">
                      {params.kmPercurso > 0 ? fmt(custoKmFinal) : "—"}
                    </p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase">R$/Hora</p>
                    <p className="text-lg font-black font-mono mt-1" data-testid="text-custo-hora">
                      {params.horasMissao > 0 ? fmt(custoHoraFinal) : "—"}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Composição do Preço</p>
                  <div className="space-y-2">
                    {[
                      { label: "Mão de Obra", value: custoDiarioVigilante * params.qtdVigilantes, color: "bg-blue-500" },
                      { label: "Combustível", value: custoCombustivelMissao, color: "bg-amber-500" },
                      { label: "Pedágios", value: params.pedagios, color: "bg-orange-500" },
                      { label: "Nota Fiscal", value: valorNF, color: "bg-red-500" },
                      { label: "Lucro", value: lucro, color: "bg-emerald-500" },
                    ].map(item => {
                      const pct = precoFinal > 0 ? (item.value / precoFinal) * 100 : 0;
                      return (
                        <div key={item.label}>
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="text-neutral-300">{item.label}</span>
                            <span className="text-neutral-400 font-mono">{fmt(item.value)} ({fmtPct(pct)})</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
