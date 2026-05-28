import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ZapiGroup {
  id: string;
  name: string;
  participantsCount?: number;
}

interface GroupsResponse {
  ok: boolean;
  groups: ZapiGroup[];
  error?: string | null;
  count: number;
  cached?: boolean;
}

interface Props {
  value: string;
  onChange: (newValue: string) => void;
}

/**
 * Combobox que lista os grupos do WhatsApp via Z-API (rota
 * /api/whatsapp/groups, cache de 60s). Permite buscar pelo nome e
 * selecionar. Salva o ID do grupo (ex.: "5511...-1681...@g.us") no campo.
 *
 * Fallback: se a Z-API não responder (config errada, instância
 * desconectada, etc), mostra o erro e libera input manual.
 */
export function WhatsappGroupPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const { data, isLoading, isFetching, error } = useQuery<GroupsResponse>({
    queryKey: ["/api/whatsapp/groups"],
    staleTime: 60_000,
    retry: false,
  });

  const groups = data?.groups || [];
  const apiError = (!isLoading && data && !data.ok) ? (data.error || "Falha ao listar grupos") : (error ? "Erro de rede ao buscar grupos" : null);

  const selectedGroup = groups.find((g) => g.id === value);
  const displayLabel = selectedGroup
    ? `${selectedGroup.name}`
    : (value ? value : "Selecionar grupo do WhatsApp...");

  // Modo manual (fallback se Z-API offline)
  if (manualMode || (apiError && groups.length === 0)) {
    return (
      <div className="space-y-2">
        {apiError && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Z-API indisponível:</strong> {apiError}
              <br />
              Cole o ID manualmente (termina com <code>@g.us</code>).
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Ex.: 5511999999999-1681234567@g.us"
            className="flex-1 h-9 px-3 rounded-md border border-neutral-300 text-sm"
            data-testid="input-client-whatsapp-group-manual"
          />
          {!apiError && (
            <Button type="button" variant="outline" size="sm" onClick={() => setManualMode(false)} data-testid="button-whatsapp-back-to-list">
              Lista
            </Button>
          )}
          {apiError && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/groups"] })}
              data-testid="button-whatsapp-retry"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Tentar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            data-testid="button-whatsapp-group-picker"
            disabled={isLoading}
          >
            <span className={cn("truncate", !selectedGroup && !value && "text-neutral-400")}>
              {isLoading ? "Carregando grupos..." : displayLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar grupo..." data-testid="input-whatsapp-group-search" />
            <CommandList>
              <CommandEmpty>
                {groups.length === 0
                  ? (isFetching ? "Buscando..." : "Nenhum grupo encontrado na Z-API.")
                  : "Nenhum grupo corresponde à busca."}
              </CommandEmpty>
              {value && (
                <CommandGroup heading="Ações">
                  <CommandItem
                    value="__clear__"
                    onSelect={() => { onChange(""); setOpen(false); }}
                    data-testid="item-whatsapp-clear"
                  >
                    <span className="text-rose-600">✕ Remover grupo selecionado</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {groups.length > 0 && (
                <CommandGroup heading={`${groups.length} grupo(s)`}>
                  {groups.map((g) => (
                    <CommandItem
                      key={g.id}
                      value={`${g.name} ${g.id}`}
                      onSelect={() => { onChange(g.id); setOpen(false); }}
                      data-testid={`item-whatsapp-group-${g.id}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === g.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{g.name}</div>
                        <div className="text-[10px] text-neutral-400 truncate">{g.id}</div>
                      </div>
                      {g.participantsCount ? (
                        <span className="text-[10px] text-neutral-400 ml-2">{g.participantsCount}</span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex gap-2 text-[10px]">
        <button
          type="button"
          className="text-neutral-500 hover:text-neutral-700 underline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/groups"] })}
          data-testid="button-whatsapp-refresh"
        >
          <RefreshCw className="w-3 h-3 inline mr-0.5" /> Recarregar lista
        </button>
        <span className="text-neutral-300">|</span>
        <button
          type="button"
          className="text-neutral-500 hover:text-neutral-700 underline"
          onClick={() => setManualMode(true)}
          data-testid="button-whatsapp-manual"
        >
          Colar ID manualmente
        </button>
        {data?.cached && (
          <span className="text-neutral-300 ml-auto">cache 60s</span>
        )}
      </div>
    </div>
  );
}
