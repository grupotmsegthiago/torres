import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import {
  Search, Paperclip, Smile, Mic, Send, Phone, Video, MoreVertical,
  MessageCircle, Users, Pin, Check, CheckCheck, User as UserIcon,
  Image as ImageIcon, FileText, AlertTriangle, Info, RefreshCw, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabaseWa } from "@/lib/supabase";

interface ChatItem {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastMessageFromMe: boolean | null;
  unread: number;
  pinned: boolean;
  source: "db" | "zapi";
}

interface MessageItem {
  id: number;
  chat_id: string;
  zapi_message_id: string | null;
  from_me: boolean;
  sender_phone: string | null;
  sender_name: string | null;
  type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  status: string | null;
  ts: string;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function fmtTimeFull(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function fmtDateHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "HOJE";
  if (d.toDateString() === yest.toDateString()) return "ONTEM";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

function avatarColor(name: string): string {
  const colors = ["bg-emerald-600", "bg-blue-600", "bg-amber-600", "bg-violet-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function MessageBubble({ msg, isGroup }: { msg: MessageItem; isGroup: boolean }) {
  const mine = msg.from_me;
  return (
    <div className={cn("flex mb-1", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-lg px-3 py-1.5 shadow-sm relative",
          mine ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900"
        )}
      >
        {!mine && isGroup && msg.sender_name && (
          <div className="text-xs font-semibold text-emerald-700 mb-0.5">{msg.sender_name}</div>
        )}
        {msg.type === "image" && msg.media_url && (
          <img src={msg.media_url} alt="" className="rounded mb-1 max-h-72 object-cover" />
        )}
        {msg.type === "audio" && (
          <div className="flex items-center gap-2 text-xs text-slate-600 py-1">
            <Mic className="w-4 h-4" /> Áudio
            {msg.media_url && <audio controls src={msg.media_url} className="h-8" />}
          </div>
        )}
        {msg.type === "video" && msg.media_url && (
          <video src={msg.media_url} controls className="rounded mb-1 max-h-72 max-w-full" />
        )}
        {msg.type === "document" && msg.media_url && (
          <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-600 underline py-1">
            <FileText className="w-4 h-4" /> {msg.body || "Documento"}
          </a>
        )}
        {msg.type === "location" && msg.body && (
          <a href={`https://maps.google.com/?q=${msg.body}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
            📍 Ver localização
          </a>
        )}
        {msg.body && (msg.type === "text" || msg.type === "image" || msg.type === "video" || msg.type === "document") && (
          <div className="text-sm whitespace-pre-wrap break-words">{msg.body}</div>
        )}
        {!msg.body && msg.type === "other" && <div className="text-xs italic text-slate-500">Mensagem não suportada</div>}
        <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-0.5">
          <span>{fmtTimeFull(msg.ts)}</span>
          {mine && (
            msg.status === "read" ? <CheckCheck className="w-3 h-3 text-blue-500" /> :
            msg.status === "delivered" ? <CheckCheck className="w-3 h-3" /> :
            <Check className="w-3 h-3" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function WhatsappPage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [rtStatus, setRtStatus] = useState<"online" | "offline">("offline");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Polling via refetchInterval do próprio React Query (mecanismo ÚNICO).
  // refetchIntervalInBackground:true mantém a busca rodando mesmo com a aba em
  // segundo plano (sem isso o React Query PAUSA o interval quando a janela perde
  // foco — era a causa de "voltei pra aba e não tinha atualizado / precisei F5").
  const { data: chatsData, isLoading: loadingChats, refetch: refetchChats, isFetching: fetchingChats } = useQuery<{ ok: boolean; chats: ChatItem[] }>({
    queryKey: ["/api/whatsapp/chats"],
    refetchOnWindowFocus: true,
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const { data: waStatus } = useQuery<{ configured: boolean; connected: boolean; smartphoneConnected: boolean; error?: string }>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const chats = chatsData?.chats || [];

  const filteredChats = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return chats;
    return chats.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.id.toLowerCase().includes(s) ||
      (c.lastMessageText || "").toLowerCase().includes(s)
    );
  }, [chats, search]);

  const selectedChat = chats.find(c => c.id === selectedChatId) || null;

  const { data: msgsData, refetch: refetchMsgs, dataUpdatedAt: msgsUpdatedAt } = useQuery<{ ok: boolean; messages: MessageItem[] }>({
    queryKey: ["/api/whatsapp/chats", selectedChatId, "messages"],
    enabled: !!selectedChatId,
    refetchOnWindowFocus: true,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const messages = msgsData?.messages || [];

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, selectedChatId]);

  // Realtime: quando o WS entrega (aba ativa e rede liberada), a mudança aparece
  // NA HORA via conexão dedicada (supabaseWa, sem disputar orçamento com GPS).
  // Em vez de mexer no cache na mão (que corria risco de um poll antigo em voo
  // sobrescrever a mensagem recém-anexada), o realtime apenas INVALIDA a query —
  // o refetch resultante passa pela API e sempre devolve a lista correta. O
  // polling de 3-5s (refetchInterval acima) é a rede de segurança quando o WS
  // está bloqueado/instável.
  useEffect(() => {
    const bump = (chatId?: string) => {
      if (chatId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/whatsapp/chats", chatId, "messages"],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chats"] });
    };
    const channel = supabaseWa
      .channel(`whatsapp-page-rt-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        (payload: any) => {
          const row = (payload.new || payload.old) as MessageItem;
          console.log("[Realtime:wa] msg event", payload.eventType, row?.chat_id);
          bump(row?.chat_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_chats" },
        (payload: any) => {
          console.log("[Realtime:wa] chat event", payload.eventType);
          queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chats"] });
        },
      )
      .subscribe((status) => {
        console.log("[Realtime:wa] subscription status:", status);
        setRtStatus(status === "SUBSCRIBED" ? "online" : "offline");
      });
    return () => {
      supabaseWa.removeChannel(channel);
    };
  }, []);

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedChatId) throw new Error("Nenhuma conversa selecionada");
      return apiRequest("POST", "/api/whatsapp/send", { chatId: selectedChatId, text });
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chats", selectedChatId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/chats"] });
    },
  });

  function handleSend() {
    const text = draft.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  }

  // Agrupa mensagens por dia
  const groupedMessages = useMemo(() => {
    const groups: Array<{ date: string; items: MessageItem[] }> = [];
    let currentDate = "";
    for (const m of messages) {
      const dateKey = new Date(m.ts).toDateString();
      if (dateKey !== currentDate) {
        groups.push({ date: m.ts, items: [m] });
        currentDate = dateKey;
      } else {
        groups[groups.length - 1].items.push(m);
      }
    }
    return groups;
  }, [messages]);

  return (
    <AdminLayout>
      {waStatus && (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg shadow-lg border px-3 py-2 max-w-xs",
            waStatus.connected
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-300 text-red-800"
          )}
          data-testid="status-zapi-connection"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span
              className={cn(
                "w-2.5 h-2.5 rounded-full",
                waStatus.connected ? "bg-emerald-500" : "bg-red-500 animate-pulse"
              )}
            />
            {waStatus.connected ? "WhatsApp conectado" : "WhatsApp DESCONECTADO"}
          </div>
          {!waStatus.connected && (
            <div className="mt-1 text-xs leading-snug">
              {!waStatus.configured
                ? "Z-API não configurada (faltam as chaves de acesso)."
                : 'O celular não está pareado na Z-API. Enquanto estiver assim, o Agente Central não envia cobranças nem responde "resumo". Reconecte lendo o QR Code no painel da Z-API.'}
            </div>
          )}
        </div>
      )}
      <div className="h-[calc(100vh-4rem)] flex bg-slate-100 -m-6">
        {/* COLUNA 1 — Lista de Conversas */}
        <div className={cn(
          "w-full md:w-[360px] flex-col bg-white border-r border-slate-200 shrink-0",
          selectedChat ? "hidden md:flex" : "flex"
        )}>
          <div className="h-14 bg-[#f0f2f5] flex items-center justify-between px-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm">CT</div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Central Torres</div>
                <div className="text-[10px] text-slate-500">{chats.length} conversa(s)</div>
              </div>
            </div>
            <button
              onClick={() => refetchChats()}
              className="text-slate-500 hover:text-slate-800 p-1"
              title="Recarregar lista"
              data-testid="button-whatsapp-refresh-chats"
            >
              <RefreshCw className={cn("w-4 h-4", fetchingChats && "animate-spin")} />
            </button>
          </div>

          <div className="px-3 py-2 bg-white border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conversa..."
                className="w-full pl-9 pr-3 py-2 bg-[#f0f2f5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                data-testid="input-whatsapp-search"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingChats && (
              <div className="text-center text-xs text-slate-500 py-8">Carregando conversas...</div>
            )}
            {!loadingChats && filteredChats.length === 0 && (
              <div className="text-center text-xs text-slate-500 py-8 px-4">
                {search ? "Nenhuma conversa bate com a busca." : "Nenhuma conversa ainda."}
              </div>
            )}
            {filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 hover:bg-slate-50 border-b border-slate-100 text-left transition-colors",
                  selectedChatId === chat.id && "bg-slate-100 hover:bg-slate-100"
                )}
                data-testid={`item-whatsapp-chat-${chat.id}`}
              >
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0", avatarColor(chat.name))}>
                  {chat.isGroup ? <Users className="w-5 h-5" /> : initials(chat.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1">
                      {chat.pinned && <Pin className="w-3 h-3 text-slate-400 shrink-0" />}
                      <span className="truncate">{chat.name}</span>
                    </div>
                    <span className={cn("text-[10px] shrink-0", chat.unread > 0 ? "text-emerald-600 font-semibold" : "text-slate-400")}>
                      {fmtTime(chat.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                      {chat.lastMessageFromMe && <CheckCheck className="w-3 h-3 text-slate-400 shrink-0" />}
                      <span className="truncate">{chat.lastMessageText || (chat.source === "zapi" ? "Conversa nova — clique pra começar" : "Sem mensagens ainda")}</span>
                    </div>
                    {chat.unread > 0 && (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shrink-0">
                        {chat.unread > 99 ? "99+" : chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* COLUNA 2 — Chat Ativo */}
        <div className={cn(
          "flex-1 flex-col min-w-0 bg-[#efeae2] relative",
          selectedChat ? "flex" : "hidden md:flex"
        )}>
          {!selectedChat ? (
            <div className="flex-1 flex items-center justify-center text-center px-8">
              <div>
                <MessageCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-700 mb-2">WhatsApp — Central Torres</h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Selecione uma conversa à esquerda pra começar a enviar e receber mensagens.<br />
                  As mensagens são sincronizadas em tempo real com seu WhatsApp via Z-API.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="h-14 bg-[#f0f2f5] flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setSelectedChatId(null)}
                    className="md:hidden text-slate-600 hover:text-slate-900 -ml-2 p-1 shrink-0"
                    title="Voltar para a lista"
                    data-testid="button-whatsapp-back"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0", avatarColor(selectedChat.name))}>
                    {selectedChat.isGroup ? <Users className="w-5 h-5" /> : initials(selectedChat.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{selectedChat.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {selectedChat.isGroup ? "grupo" : selectedChat.id}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-slate-500">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-[10px]",
                      rtStatus === "online" ? "text-emerald-700" : "text-amber-600"
                    )}
                    title={
                      rtStatus === "online"
                        ? "Conexão ao vivo ativa — mensagens chegam na hora"
                        : "Sem conexão ao vivo no momento — atualizando a cada 2s automaticamente"
                    }
                    data-testid="status-whatsapp-live"
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full animate-pulse",
                        rtStatus === "online" ? "bg-emerald-500" : "bg-amber-500"
                      )}
                    />
                    {rtStatus === "online" ? "ao vivo" : "atualizando"}
                    {msgsUpdatedAt > 0 && (
                      <span className="text-slate-400 font-mono">
                        {new Date(msgsUpdatedAt).toLocaleTimeString("pt-BR", { hour12: false })}
                      </span>
                    )}
                  </span>
                  <Search className="w-5 h-5 cursor-pointer hover:text-slate-800" />
                  <MoreVertical className="w-5 h-5 cursor-pointer hover:text-slate-800" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {messages.length === 0 && (
                  <div className="text-center text-xs text-slate-500 mt-12 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 max-w-md mx-auto">
                    <Info className="w-4 h-4 inline mr-1 text-yellow-700" />
                    Nenhuma mensagem registrada nessa conversa ainda.
                    <br />
                    <span className="text-slate-400">
                      A Z-API multi-device não permite carregar histórico antigo. As mensagens aparecerão a partir do momento em que forem enviadas ou recebidas.
                    </span>
                  </div>
                )}
                {groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    <div className="flex justify-center my-3">
                      <span className="bg-white/80 text-[10px] font-medium text-slate-600 px-3 py-1 rounded-md shadow-sm">
                        {fmtDateHeader(group.date)}
                      </span>
                    </div>
                    {group.items.map((m) => (
                      <MessageBubble key={m.id} msg={m} isGroup={selectedChat.isGroup} />
                    ))}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="bg-[#f0f2f5] px-4 py-3 flex items-end gap-3 shrink-0">
                <Smile className="w-6 h-6 text-slate-500 cursor-pointer shrink-0" />
                <Paperclip className="w-6 h-6 text-slate-500 cursor-pointer shrink-0" />
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite uma mensagem"
                  rows={1}
                  className="flex-1 bg-white rounded-lg px-4 py-2 text-sm resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  data-testid="textarea-whatsapp-input"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sendMutation.isPending}
                  className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center text-white shrink-0 transition-colors"
                  data-testid="button-whatsapp-send"
                >
                  {sendMutation.isPending ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                   draft.trim() ? <Send className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>
              {sendMutation.isError && (
                <div className="bg-red-50 border-t border-red-200 px-4 py-2 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Falha ao enviar: {(sendMutation.error as any)?.message || "erro desconhecido"}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
