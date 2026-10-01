import { Phone, Truck } from "lucide-react";
import { formatPhoneBR } from "@/lib/format-contact";
import { titleCase } from "@/lib/utils";
import { whatsAppMotoristaUrl } from "@shared/driver-whatsapp";

export function DriverContactCard({
  name, phone, plate, agentName, testId,
}: {
  name?: string | null;
  phone?: string | null;
  plate?: string | null;
  agentName?: string | null;
  testId: string;
}) {
  const url = whatsAppMotoristaUrl(phone, agentName);
  if (!name && !phone) return null;
  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-300 p-4 space-y-3" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-emerald-700" />
        <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Motorista escoltado</span>
      </div>
      {name && <p className="text-base font-black text-neutral-900 leading-tight">{titleCase(name)}</p>}
      {plate && <p className="text-xs text-neutral-500">Placa: <span className="font-mono font-bold text-neutral-800">{plate}</span></p>}
      {phone ? (
        <p className="text-lg font-mono font-black text-neutral-900 tracking-wide" data-testid={`${testId}-phone`}>{formatPhoneBR(phone)}</p>
      ) : (
        <p className="text-xs text-amber-700">Telefone ainda não informado na OS.</p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full min-h-12 bg-green-500 text-white rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 px-3 text-center active:scale-[0.98]"
          data-testid={`${testId}-whatsapp`}
        >
          <Phone className="w-4 h-4 shrink-0" />
          Chamar no WhatsApp
        </a>
      )}
    </div>
  );
}
