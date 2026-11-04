import React, { type ReactNode } from "react";
import { SiWhatsapp } from "react-icons/si";
import { titleCase } from "@/lib/utils";

interface AlertaViaturaProps {
  plate: string;
  driver: string;
  message: string;
  time: string;
  imageUrl: string;
  clientName?: string | null;
  origin?: string | null;
  destination?: string | null;
  onClose: () => void;
  onMarkRead: () => void;
  onShare?: () => void;
  map?: ReactNode;
  linkAction?: ReactNode;
}

export function AlertaViaturaMensagem({
  plate,
  driver,
  message,
  time,
  imageUrl,
  clientName,
  origin,
  destination,
  onClose,
  onMarkRead,
  onShare,
  map,
  linkAction,
}: AlertaViaturaProps) {
  const cliente = titleCase(clientName) || "—";
  const origem = origin?.trim() || "—";
  const destino = destination?.trim() || "—";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4" data-testid="alerta-viatura-mensagem">
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-x-hidden overflow-y-auto rounded-3xl bg-gradient-to-b from-[#0f192b] via-[#070b13] to-[#04060a]
        border-2 border-amber-500/50 shadow-[0_0_60px_rgba(245,158,11,0.25),inset_0_1px_3px_rgba(255,255,255,0.15)]
        p-4 md:p-10 flex flex-col md:flex-row items-center gap-4 md:gap-8">
        <div className="pointer-events-none absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />

        <div className="relative w-full md:w-1/2 flex items-center justify-center">
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[85%] h-6 bg-black/60 rounded-full blur-md" />
          <img
            src={imageUrl}
            alt={`Viatura ${plate}`}
            className="relative z-10 w-full max-w-[460px] max-h-[22vh] md:max-h-none h-auto object-contain drop-shadow-[0_20px_25px_rgba(0,0,0,0.85)]"
          />
          <span className="absolute z-20 top-[46%] left-[16%] w-7 h-4 rounded-full bg-amber-100/90 blur-[5px] shadow-[0_0_22px_#fef08a,0_0_42px_#eab308] animate-ping" />
          <span className="absolute z-20 top-[50%] left-[33%] w-6 h-4 rounded-full bg-amber-100/90 blur-[5px] shadow-[0_0_22px_#fef08a,0_0_42px_#eab308] animate-ping" />
        </div>

        <div className="relative z-10 flex-1 w-full space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-400" />
              </span>
              <span className="text-xs font-black tracking-widest text-amber-300 uppercase bg-amber-950/50 px-3 py-1 rounded border border-amber-500/30">
                Atualização do agente
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl bg-slate-900 border border-slate-800 w-8 h-8 rounded-lg"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div>
            <div className="text-3xl font-black font-mono text-slate-100 tracking-wider">{plate}</div>
            <div className="text-sm text-slate-400 mt-1">
              Agente: <span className="text-slate-200 font-bold">{driver}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm" data-testid="alerta-ficha-missao">
              <div data-testid="alerta-cliente">
                <span className="text-slate-500">Cliente </span>
                <span className="font-bold text-slate-100 break-words">{cliente}</span>
              </div>
              <div data-testid="alerta-origem">
                <span className="text-slate-500">Origem </span>
                <span className="font-bold text-slate-100 break-words">{origem}</span>
              </div>
              <div data-testid="alerta-destino">
                <span className="text-slate-500">Destino </span>
                <span className="font-bold text-slate-100 break-words">{destino}</span>
              </div>
            </div>
          </div>

          {map ? <div data-testid="alerta-mapa">{map}</div> : null}

          <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)] relative">
            <div className="absolute top-3 right-4 text-[10px] font-mono text-slate-500">{time}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500/80 mb-2 font-mono">Transmissão</div>
            <p className="text-base font-bold text-slate-100 leading-relaxed italic pr-16">“{message}”</p>
          </div>

          <div className="sticky bottom-0 z-20 flex flex-col sm:flex-row gap-3 bg-[#070b13]/95 py-2">
            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-widest text-white rounded-xl bg-green-600 hover:bg-green-700"
                data-testid="button-alerta-whatsapp"
              >
                <SiWhatsapp className="w-4 h-4" />
                WhatsApp · foto e texto
              </button>
            ) : null}
            <button
              type="button"
              onClick={onMarkRead}
              className="flex-1 py-3.5 text-xs font-black uppercase tracking-widest text-slate-200 rounded-xl
                bg-gradient-to-b from-slate-800 to-slate-950 border-t border-slate-700 border-b-2 border-b-black hover:brightness-125"
              data-testid="button-alerta-marcar-lida"
            >
              Marcar como lida
            </button>
            {linkAction ? <div className="flex-1 [&>button]:w-full [&>button]:h-auto [&>button]:py-3.5">{linkAction}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
