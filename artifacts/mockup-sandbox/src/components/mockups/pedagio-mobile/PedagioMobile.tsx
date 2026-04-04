import { Camera, CircleDollarSign, DollarSign, Receipt, MapPin, Car, Route, CheckCircle, MessageSquare } from "lucide-react";

function PhoneFrame({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">{title}</p>
      <div className="w-[375px] bg-white rounded-[2.5rem] border-[3px] border-neutral-800 overflow-hidden shadow-2xl">
        <div className="bg-neutral-900 px-6 py-2 flex items-center justify-between">
          <span className="text-white text-xs font-semibold">01:10</span>
          <div className="w-24 h-5 bg-neutral-800 rounded-full" />
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 border border-white rounded-sm relative"><div className="absolute right-0.5 top-0.5 bottom-0.5 left-1.5 bg-green-400 rounded-sm" /></div>
          </div>
        </div>
        <div className="bg-neutral-900 px-4 pb-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
            <Route className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">Em Trânsito ao Destino</p>
            <p className="text-neutral-400 text-[10px]">Execução · 9/15</p>
          </div>
        </div>
        <div className="p-4 space-y-3 bg-neutral-50 min-h-[560px]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function PedagioMobile() {
  return (
    <div className="min-h-screen bg-neutral-100 p-8 flex items-start justify-center gap-10 flex-wrap">
      <PhoneFrame title="Estado 1 — Botão Visível">
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <Car className="w-8 h-8 text-neutral-600" />
          </div>
          <p className="text-sm font-bold text-neutral-800 uppercase tracking-wider">Em deslocamento para destino</p>
          <p className="text-xs text-neutral-400 mt-1">Distância até destino: <span className="font-bold text-neutral-700">42.3km</span></p>
        </div>

        <button className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2">
          <Camera className="w-5 h-5" />
          Enviar Atualização
        </button>

        <button className="w-full h-12 bg-amber-500 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-amber-200">
          <CircleDollarSign className="w-5 h-5" />
          + Lançar Pedágio
        </button>

        <div className="border-t border-neutral-200 pt-3">
          <button className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2">
            <MapPin className="w-5 h-5" />
            Confirmar Chegada
          </button>
        </div>
      </PhoneFrame>

      <PhoneFrame title="Estado 2 — Modal Aberto">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2 animate-pulse">
            <Car className="w-6 h-6 text-neutral-600" />
          </div>
          <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Em deslocamento para destino</p>
        </div>

        <div className="bg-amber-50 rounded-2xl border-2 border-amber-300 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-black text-amber-900 uppercase tracking-wider">Pedágio</span>
            </div>
            <button className="text-xs text-neutral-500 font-bold">Fechar</button>
          </div>
          <div className="bg-white/70 rounded-xl px-3 py-2">
            <p className="text-[11px] text-amber-800">O valor será lançado como <span className="font-bold">Custo + Reembolso</span> nesta missão (impacto zero no lucro).</p>
          </div>
          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">Valor (R$)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <div className="w-full h-12 pl-9 pr-4 border border-amber-200 rounded-xl text-lg font-bold text-neutral-900 bg-white flex items-center">
                15,00
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">Comprovante</label>
            <button className="w-full h-20 border-2 border-dashed border-amber-300 rounded-xl flex flex-col items-center justify-center gap-1">
              <Camera className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-bold text-amber-600 uppercase">Tirar Foto</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span className="text-emerald-600 font-semibold">GPS ativo (-23.5505, -46.6333)</span>
          </div>
          <button className="w-full h-12 bg-amber-600 text-white rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2">
            <Receipt className="w-4 h-4" /> Confirmar Pedágio
          </button>
        </div>
      </PhoneFrame>

      <PhoneFrame title="Estado 3 — Sucesso">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-2">
            <Car className="w-6 h-6 text-neutral-600" />
          </div>
          <p className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Em deslocamento para destino</p>
        </div>

        <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-300 p-4 text-center space-y-3">
          <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
          <p className="text-sm font-black text-emerald-900 uppercase tracking-wider">Pedágio Registrado!</p>
          <p className="text-xs text-emerald-700">R$ 15,00 · Custo + Reembolso na OS</p>
          <button className="h-10 px-6 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider">OK</button>
        </div>

        <button className="w-full h-12 bg-amber-500 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-amber-200">
          <CircleDollarSign className="w-5 h-5" />
          + Lançar Pedágio
        </button>

        <div className="border-t border-neutral-200 pt-3">
          <button className="w-full h-14 bg-neutral-900 text-white rounded-2xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2">
            <MapPin className="w-5 h-5" />
            Confirmar Chegada
          </button>
        </div>
      </PhoneFrame>
    </div>
  );
}
