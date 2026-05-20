import { useState } from "react";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calculator, Receipt, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CobradoResult {
  inicio: string;
  fim: string;
  totalCobrado: number;
  qtdOs: number;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function parseBR(v: string): number {
  if (!v) return 0;
  const cleaned = v.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export default function ConferenciaPedagioPage() {
  const { toast } = useToast();
  const [valorPagoStr, setValorPagoStr] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CobradoResult | null>(null);

  const valorPago = parseBR(valorPagoStr);

  const handleCalcular = async () => {
    if (!inicio || !fim) {
      toast({ title: "Período obrigatório", description: "Selecione data início e data fim.", variant: "destructive" });
      return;
    }
    if (inicio > fim) {
      toast({ title: "Período inválido", description: "A data início deve ser <= data fim.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`/api/controladoria/pedagio-cobrado?inicio=${inicio}&fim=${fim}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Falha ao calcular");
      }
      const data = (await res.json()) as CobradoResult;
      setResult(data);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const diferenca = result ? result.totalCobrado - valorPago : 0;
  const cobrouMais = diferenca >= 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-5 w-5 text-violet-500" />
            <h2 className="text-lg font-semibold" data-testid="text-page-title">
              Conferência Pedágio: Pago × Cobrado
            </h2>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Calculadora rápida pra conferir quanto foi pago de pedágio (fatura Sem Parar, ConectCar, etc) contra
            quanto o sistema cobrou dos clientes no mesmo período. Nada é gravado — recarregar a página perde os
            valores.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                Valor pago (R$)
              </label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={valorPagoStr}
                onChange={(e) => setValorPagoStr(e.target.value)}
                data-testid="input-valor-pago"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                Data início
              </label>
              <Input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                data-testid="input-inicio"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1 block">
                Data fim
              </label>
              <Input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                data-testid="input-fim"
              />
            </div>
            <Button
              onClick={handleCalcular}
              disabled={loading}
              className="bg-violet-500 hover:bg-violet-600 text-white"
              data-testid="button-calcular"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Calculando…</>
              ) : (
                <><Calculator className="h-4 w-4 mr-2" /> Calcular</>
              )}
            </Button>
          </div>
        </Card>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4 bg-neutral-50 dark:bg-neutral-900/50">
              <div className="flex items-center gap-3">
                <Receipt className="h-6 w-6 text-neutral-500" />
                <div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">Pago no período</div>
                  <div className="text-2xl font-bold" data-testid="text-pago">
                    {brl(valorPago)}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-blue-50 dark:bg-blue-950/30">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-blue-600" />
                <div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">
                    Cobrado dos clientes ({result.qtdOs} OS)
                  </div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-400" data-testid="text-cobrado">
                    {brl(result.totalCobrado)}
                  </div>
                </div>
              </div>
            </Card>

            <Card className={`p-4 ${cobrouMais ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30"}`}>
              <div className="flex items-center gap-3">
                {cobrouMais ? (
                  <Scale className="h-6 w-6 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-rose-600" />
                )}
                <div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400">Diferença (cobrado − pago)</div>
                  <div
                    className={`text-2xl font-bold ${cobrouMais ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                    data-testid="text-diferenca"
                  >
                    {cobrouMais ? "+" : ""}{brl(diferenca)}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1" data-testid="text-diferenca-legenda">
                    {valorPago === 0
                      ? "Digite o valor pago para comparar"
                      : cobrouMais
                        ? `Você cobrou ${brl(Math.abs(diferenca))} a mais do que pagou`
                        : `Você cobrou ${brl(Math.abs(diferenca))} a menos do que pagou`}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {result && (
          <Card className="p-4 text-xs text-neutral-500">
            Período: {result.inicio.split("-").reverse().join("/")} → {result.fim.split("-").reverse().join("/")}.
            Cobrado = soma de mission_costs (categoria "Pedágio", cost_type=revenue) das OS com
            scheduled_date no intervalo. Não inclui boletins/escort_billings.
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
