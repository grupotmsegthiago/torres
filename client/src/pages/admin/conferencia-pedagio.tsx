import { useState } from "react";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calculator, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBRLInput(s: string): number {
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

function todayBRT(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

interface CalcResult {
  inicio: string;
  fim: string;
  totalCobrado: number;
  qtdOs: number;
}

export default function ConferenciaPedagioPage() {
  const { toast } = useToast();
  const [valorPagoStr, setValorPagoStr] = useState<string>("");
  const [inicio, setInicio] = useState<string>(todayBRT());
  const [fim, setFim] = useState<string>(todayBRT());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);

  const valorPago = parseBRLInput(valorPagoStr);

  async function calcular() {
    if (!inicio || !fim) {
      toast({ title: "Datas obrigatórias", description: "Informe início e fim", variant: "destructive" });
      return;
    }
    if (inicio > fim) {
      toast({ title: "Período inválido", description: "Início deve ser <= fim", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ inicio, fim });
      const res = await authFetch(`/api/controladoria/pedagio-cobrado?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CalcResult;
      setResult(data);
    } catch (e: any) {
      toast({ title: "Erro ao calcular", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const diferenca = result ? result.totalCobrado - valorPago : 0;
  const diferencaPositiva = diferenca >= 0;

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">
            Pedágio: Pago × Cobrado
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Calculadora rápida — informe o valor pago no período (fatura Sem Parar /
            ConectCar / etc) e compare com o que foi cobrado dos clientes via
            mission_costs. Nada é gravado; recarregar perde os valores.
          </p>
        </div>

        <Card className="p-6 bg-zinc-900 border-zinc-800">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="valor-pago" className="text-zinc-300">
                Valor pago (R$)
              </Label>
              <Input
                id="valor-pago"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valorPagoStr}
                onChange={(e) => setValorPagoStr(e.target.value)}
                className="mt-1 bg-zinc-950 border-zinc-700 text-white"
                data-testid="input-valor-pago"
              />
            </div>
            <div>
              <Label htmlFor="data-inicio" className="text-zinc-300">
                Data início
              </Label>
              <Input
                id="data-inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="mt-1 bg-zinc-950 border-zinc-700 text-white"
                data-testid="input-data-inicio"
              />
            </div>
            <div>
              <Label htmlFor="data-fim" className="text-zinc-300">
                Data fim
              </Label>
              <Input
                id="data-fim"
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="mt-1 bg-zinc-950 border-zinc-700 text-white"
                data-testid="input-data-fim"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={calcular}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="button-calcular"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculando...
                </>
              ) : (
                <>
                  <Calculator className="w-4 h-4 mr-2" />
                  Calcular
                </>
              )}
            </Button>
          </div>
        </Card>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 bg-zinc-900 border-zinc-800" data-testid="card-pago">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Pago</div>
              <div className="text-3xl font-bold text-white mt-2" data-testid="text-valor-pago">
                {formatBRL(valorPago)}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                Informado para o período {result.inicio} até {result.fim}
              </div>
            </Card>

            <Card className="p-5 bg-zinc-900 border-zinc-800" data-testid="card-cobrado">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Cobrado</div>
              <div className="text-3xl font-bold text-white mt-2" data-testid="text-valor-cobrado">
                {formatBRL(result.totalCobrado)}
              </div>
              <div className="text-xs text-zinc-500 mt-2" data-testid="text-qtd-os">
                {result.qtdOs} OS com pedágio cobrado
              </div>
            </Card>

            <Card
              className={`p-5 border ${
                diferencaPositiva
                  ? "bg-emerald-950/40 border-emerald-800"
                  : "bg-rose-950/40 border-rose-800"
              }`}
              data-testid="card-diferenca"
            >
              <div className="text-xs uppercase tracking-wide text-zinc-400">
                Diferença (cobrado − pago)
              </div>
              <div
                className={`text-3xl font-bold mt-2 ${
                  diferencaPositiva ? "text-emerald-300" : "text-rose-300"
                }`}
                data-testid="text-diferenca"
              >
                {formatBRL(diferenca)}
              </div>
              <div className="text-xs text-zinc-300 mt-2 flex items-start gap-1">
                {!diferencaPositiva && <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>
                  Você cobrou {formatBRL(Math.abs(diferenca))}{" "}
                  {diferencaPositiva ? "a mais" : "a menos"} do que pagou.
                </span>
              </div>
            </Card>
          </div>
        )}

        {result && result.totalCobrado === 0 && (
          <Card className="p-4 bg-amber-950/40 border-amber-800 text-amber-200 text-sm">
            Nenhum lançamento de receita de pedágio encontrado no período. Verifique
            se as OS foram fechadas e se a categoria contém "Pedágio".
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
