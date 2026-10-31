import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { authFetch } from "@/lib/queryClient";
import { classeDaArma } from "@shared/kit-visual";
import { AgenteRelevo } from "./AgenteRelevo";
import { KitRelevo } from "./KitRelevo";
import { MapaRotaOs } from "./MapaRotaOs";
import { StatusBadge3D, type ViaturaStatusType } from "./StatusBadge3D";

export interface OsMensagemPainel {
  texto: string;
  quando: string;
  agente: string;
}

export interface AgentePainel {
  id: number | null;
  nome: string;
}

export interface OsDetalhePainel {
  vehicleId: number;
  plate: string;
  badge: ViaturaStatusType;
  badgeText: string;
  osId: number | null;
  osNumber: string | null;
  cliente: string | null;
  origem: string | null;
  destino: string | null;
  inicio: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
  equipe: string[];
  agentes: AgentePainel[];
  equipeLinha: string | null;
  kit: string | null;
  kitId: number | null;
  viatura: string | null;
  origemLat: number | null;
  origemLng: number | null;
  destinoLat: number | null;
  destinoLng: number | null;
  posLat: number | null;
  posLng: number | null;
  mensagens: OsMensagemPainel[];
  gps: string;
  endereco: string | null;
}

interface OSDetailModalProps {
  detalhe: OsDetalhePainel | null;
  onClose: () => void;
  onFocusMap?: (vehicleId: number) => void;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p className="text-[13px] leading-snug">
      <span className="text-slate-400">{rotulo}: </span>
      <span className="text-slate-100 font-medium">{valor || "—"}</span>
    </p>
  );
}

type ArmaKit = { type: string; model: string; caliber: string; photoData?: string | null };
type KitApi = { id: number; name: string; items?: { weapon: ArmaKit | null }[] };

function fotoArma(photo?: string | null): string | null {
  if (!photo) return null;
  if ((photo.startsWith("data:") || photo.startsWith("http")) && photo.length < 1_500_000) return photo;
  return null;
}

export function OSDetailModal({ detalhe, onClose, onFocusMap }: OSDetailModalProps) {
  const { data: kit } = useQuery<KitApi>({
    queryKey: ["/api/weapon-kits", detalhe?.kitId],
    queryFn: async () => {
      const res = await authFetch(`/api/weapon-kits/${detalhe!.kitId}`);
      if (!res.ok) throw new Error("kit");
      return res.json();
    },
    enabled: !!detalhe?.kitId,
    staleTime: 60_000,
  });
  const armas = (kit?.items || []).map((item) => item.weapon).filter((arma): arma is ArmaKit => !!arma);
  const agentes = detalhe?.agentes?.length
    ? detalhe.agentes
    : (detalhe?.equipe || []).map((nome) => ({ id: null, nome }));
  const idsFoto = agentes.map((agente) => agente.id).filter((id): id is number => !!id);
  const { data: fotos = [] } = useQuery<{ id: number; photoUrl: string | null }[]>({
    queryKey: ["/api/employees", "foto-painel", idsFoto.join(",")],
    enabled: idsFoto.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const linhas = await Promise.all(idsFoto.map(async (id) => {
        const res = await authFetch(`/api/employees/${id}`);
        if (!res.ok) return { id, photoUrl: null as string | null };
        const body = await res.json();
        const bruto = body?.photoUrl ?? body?.photo_url;
        const photo = typeof bruto === "string" && /^(data:image\/|https?:\/\/)/.test(bruto) ? bruto : null;
        return { id, photoUrl: photo };
      }));
      return linhas;
    },
  });
  const tituloOs = detalhe?.osNumber
    ? `OS ${detalhe.osNumber} — ${detalhe.badgeText}`
    : detalhe?.plate || "";

  return (
    <Dialog open={!!detalhe} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden border border-cyan-400/40 bg-[#0c1626]/95 p-0 text-slate-100 gap-0 shadow-[0_0_40px_rgba(34,211,238,0.18)]">
        {detalhe ? (
          <>
            <div className="px-5 py-3 border-b border-cyan-500/20 bg-[#0b1422] pr-12">
              <DialogTitle className="text-sm font-black tracking-[0.14em] text-cyan-200 uppercase">
                Detalhes da ordem de serviço (OS)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-300 mt-1 font-semibold uppercase tracking-wide">
                {tituloOs}
              </DialogDescription>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr_0.9fr] gap-4 p-4 max-h-[72vh] overflow-y-auto">
              <div className="space-y-1.5">
                <Linha rotulo="Cliente" valor={detalhe.cliente} />
                <Linha rotulo="Status" valor={detalhe.badgeText} />
                <Linha rotulo="Origem" valor={detalhe.origem} />
                <Linha rotulo="Destino" valor={detalhe.destino} />
                <Linha rotulo="Horário" valor={detalhe.inicio} />
                <Linha rotulo="Equipe" valor={detalhe.equipeLinha || detalhe.equipe.join(" & ") || null} />
                <Linha rotulo="KM inicial" valor={detalhe.kmInicial} />
                <Linha rotulo="KM final" valor={detalhe.kmFinal} />
                <Linha rotulo="GPS" valor={detalhe.gps} />
                {!detalhe.osNumber ? (
                  <p className="text-xs text-slate-500 pt-2">Nenhuma OS vinculada. Use Vincular OS no card.</p>
                ) : null}
                {detalhe.mensagens[0] ? (
                  <p className="text-[12px] text-amber-100/90 bg-amber-950/30 border border-amber-500/20 rounded-md px-2 py-1.5 mt-2">
                    {detalhe.mensagens[0].texto}
                    <span className="block text-[10px] text-amber-200/60 mt-0.5">{detalhe.mensagens[0].agente} · {detalhe.mensagens[0].quando}</span>
                  </p>
                ) : null}
              </div>

              <MapaRotaOs detalhe={detalhe} />

              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  {agentes.length > 0 ? agentes.slice(0, 3).map((agente) => (
                    <AgenteRelevo
                      key={`${agente.id ?? "sem"}-${agente.nome}`}
                      nome={agente.nome}
                      foto={fotos.find((foto) => foto.id === agente.id)?.photoUrl}
                    />
                  )) : (
                    <span className="text-xs text-slate-500">Sem equipe</span>
                  )}
                </div>
                <p className="text-[13px] text-slate-200">
                  <span className="text-slate-400">Viatura: </span>
                  {detalhe.viatura ? `${detalhe.viatura} — ` : ""}{detalhe.plate}
                </p>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">{detalhe.kit || "Nenhum kit vinculado"}</p>
                  <div className="flex flex-wrap gap-2">
                    {armas.length > 0 ? armas.map((arma, i) => {
                      const classe = classeDaArma(arma.type, arma.caliber);
                      const foto = fotoArma(arma.photoData);
                      return (
                        <div key={`${arma.type}-${arma.caliber}-${i}`} className="w-[88px] rounded-lg border border-slate-700 bg-slate-900/70 p-1.5 text-center">
                          {classe ? <KitRelevo armas={[classe]} altura="h-12" /> : foto ? <img src={foto} alt="" className="w-full h-12 object-contain mb-1" /> : <div className="h-12" />}
                          <p className="text-[10px] text-slate-200 leading-tight">{arma.type}</p>
                          <p className="text-[10px] text-cyan-300 leading-tight">{arma.caliber}</p>
                        </div>
                      );
                    }) : (
                      <p className="text-[11px] text-slate-500">{detalhe.kit ? "Itens do kit não carregados." : "Sem armamento vinculado."}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge3D status={detalhe.badge} customText={detalhe.badgeText} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-800 bg-[#0b1422]">
              {onFocusMap ? (
                <button type="button" onClick={() => onFocusMap(detalhe.vehicleId)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-cyan-400/40 text-cyan-200">
                  Ver no mapa
                </button>
              ) : null}
              {detalhe.osId ? (
                <a href={`/admin/service-orders?os=${detalhe.osId}`} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-900/50 text-cyan-100 border border-cyan-400/30">
                  Abrir OS
                </a>
              ) : null}
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300">
                Fechar
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
