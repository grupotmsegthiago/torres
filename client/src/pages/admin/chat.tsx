import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Send, Search, Plus, MessageCircle, Users, Image, MapPin,
  Check, CheckCheck, Circle, ChevronLeft, Loader2, Paperclip, X, Shield,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { MissionInviteCard } from "@/components/chat-widget";

interface ChatUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  employee_id: number | null;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: number;
  content: string | null;
  type: string;
  file_url: string | null;
  lat: number | null;
  lng: number | null;
  delivered_at: string | null;
  created_at: string;
}

interface ChatConversation {
  id: string;
  type: string;
  name: string | null;
  mission_id: number | null;
  created_by: number;
  created_at: string;
  participants: { user_id: number; last_read_at: string | null }[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

interface PresenceEntry {
  user_id: number;
  online: boolean;
  last_seen: string;
}

function fmtTime(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  const today = new Date();
  const isToday = dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === today.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (isToday) return fmtTime(d);
  return dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [showSendOS, setShowSendOS] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin" || user?.role === "diretoria";

  const { data: conversations = [], refetch: refetchConvs } = useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 15000,
  });

  const { data: chatUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ["/api/chat/users"],
  });

  const { data: presence = [] } = useQuery<PresenceEntry[]>({
    queryKey: ["/api/chat/presence"],
    refetchInterval: 30000,
  });

  const { data: messages = [], refetch: refetchMsgs } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", activeConvId, "messages"],
    enabled: !!activeConvId,
    refetchInterval: 30000,
  });

  const presenceMap = useMemo(() => {
    const m: Record<number, PresenceEntry> = {};
    presence.forEach(p => { m[p.user_id] = p; });
    return m;
  }, [presence]);

  const userMap = useMemo(() => {
    const m: Record<number, ChatUser> = {};
    chatUsers.forEach(u => { m[u.id] = u; });
    return m;
  }, [chatUsers]);

  const activeConv = conversations.find(c => c.id === activeConvId);

  useNotificationSound(messages as any[]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotification = (senderName: string, content: string) => {
    if (Notification.permission === "granted" && document.hidden) {
      new Notification(`${senderName}`, {
        body: content.length > 50 ? content.slice(0, 50) + "..." : content,
        icon: "/logo-torres.svg",
        badge: "/logo-torres.svg",
        tag: "chat-message",
      });
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    authFetch("/api/chat/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ online: true }) }).catch(() => {});
    const iv = setInterval(() => {
      authFetch("/api/chat/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ online: true }) }).catch(() => {});
    }, 60000);
    const handleOffline = () => {
      const token = localStorage.getItem("auth_token") || "";
      const data = JSON.stringify({ online: false, token });
      navigator.sendBeacon?.("/api/chat/presence-beacon", data);
    };
    window.addEventListener("beforeunload", handleOffline);
    window.addEventListener("pagehide", handleOffline);
    return () => {
      clearInterval(iv);
      window.removeEventListener("beforeunload", handleOffline);
      window.removeEventListener("pagehide", handleOffline);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`admin-chat-rt-${user.id}-${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new as any;
        queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
        if (msg.conversation_id === activeConvId) {
          refetchMsgs();
        }
        refetchConvs();
        if (msg.sender_id !== user?.id) {
          const sender = userMap[msg.sender_id];
          showBrowserNotification(sender?.name || "Mensagem", msg.content || "Nova mensagem");
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConvId, user?.id, userMap]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeConvId) {
      authFetch(`/api/chat/conversations/${activeConvId}/read`, { method: "PATCH" }).catch(() => {});
    }
  }, [activeConvId, messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await authFetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao enviar");
      return res.json();
    },
    onSuccess: () => {
      setMsgText("");
      refetchMsgs();
      refetchConvs();
      inputRef.current?.focus();
    },
  });

  const createConvMutation = useMutation({
    mutationFn: async (params: { participantIds: number[]; type: string; name?: string }) => {
      const res = await authFetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Erro ao criar");
      return res.json();
    },
    onSuccess: (conv) => {
      setShowNewChat(false);
      setGroupMode(false);
      setGroupName("");
      setSelectedUsers([]);
      setActiveConvId(conv.id);
      refetchConvs();
    },
  });

  const { data: availableOS = [] } = useQuery<any[]>({
    queryKey: ["/api/chat/service-orders-available"],
    enabled: showSendOS && isAdmin,
  });

  const sendMissionInviteMutation = useMutation({
    mutationFn: async (serviceOrderId: number) => {
      const res = await authFetch("/api/chat/send-mission-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceOrderId, conversationId: activeConvId }),
      });
      if (!res.ok) throw new Error("Erro ao enviar OS");
      return res.json();
    },
    onSuccess: () => {
      setShowSendOS(false);
      toast({ title: "OS enviada para o chat" });
      refetchMsgs();
      refetchConvs();
    },
    onError: (err: any) => {
      toast({ title: err.message || "Erro ao enviar OS", variant: "destructive" });
    },
  });

  const toggleUserSelection = (uid: number) => {
    setSelectedUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleCreateGroup = () => {
    if (selectedUsers.length < 2) {
      toast({ title: "Selecione pelo menos 2 participantes", variant: "destructive" });
      return;
    }
    if (!groupName.trim()) {
      toast({ title: "Informe o nome do grupo", variant: "destructive" });
      return;
    }
    createConvMutation.mutate({ participantIds: selectedUsers, type: "group", name: groupName.trim() });
  };

  const handleSend = () => {
    if (!msgText.trim() || !activeConvId) return;
    sendMutation.mutate({ content: msgText.trim(), type: "text" });
  };

  const handleSendLocation = () => {
    if (!activeConvId) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendMutation.mutate({ type: "location", lat: pos.coords.latitude, lng: pos.coords.longitude, content: `📍 Localização: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` });
      },
      () => toast({ title: "GPS indisponível", variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  function getConvName(conv: ChatConversation) {
    if (conv.name) return conv.name;
    if (conv.type === "direct") {
      const other = conv.participants.find(p => p.user_id !== user?.id);
      if (other) return userMap[other.user_id]?.name || "Usuário";
    }
    return "Grupo";
  }

  function getConvOtherUserId(conv: ChatConversation) {
    if (conv.type === "direct") {
      const other = conv.participants.find(p => p.user_id !== user?.id);
      return other?.user_id;
    }
    return null;
  }

  const filteredConvs = conversations.filter(c => {
    if (!searchTerm) return true;
    return getConvName(c).toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredNewUsers = chatUsers.filter(u => {
    if (u.id === user?.id) return false;
    if (!newChatSearch) return true;
    return u.name.toLowerCase().includes(newChatSearch.toLowerCase());
  });

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-64px)] bg-white rounded-lg border overflow-hidden" data-testid="page-chat">
        <div className={`w-80 border-r flex flex-col bg-neutral-50 shrink-0 ${activeConvId ? "hidden lg:flex" : "flex w-full lg:w-80"}`}>
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-tight text-neutral-800" data-testid="title-chat">Chat Interno</h2>
              <Button size="sm" variant="ghost" onClick={() => setShowNewChat(true)} data-testid="button-new-chat">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
              <Input placeholder="Buscar conversa..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" data-testid="input-chat-search" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredConvs.length === 0 && (
              <div className="p-6 text-center text-xs text-neutral-400">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma conversa
              </div>
            )}
            {filteredConvs.map(conv => {
              const convName = getConvName(conv);
              const otherUid = getConvOtherUserId(conv);
              const isOnline = otherUid ? presenceMap[otherUid]?.online : false;
              const isActive = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full flex items-center gap-3 p-3 border-b border-neutral-100 transition-colors text-left ${isActive ? "bg-neutral-200" : "hover:bg-neutral-100"}`}
                  data-testid={`conv-item-${conv.id}`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-white text-xs font-bold">
                      {conv.type === "group" || conv.type === "mission" ? <Users className="w-4 h-4" /> : getInitials(convName)}
                    </div>
                    {otherUid && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isOnline ? "bg-green-500" : "bg-neutral-400"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-900 truncate">{convName}</span>
                      <span className="text-[10px] text-neutral-400 shrink-0">{fmtDate(conv.lastMessage?.created_at || conv.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] text-neutral-500 truncate">
                        {conv.lastMessage?.type === "system" ? "📋 " : conv.lastMessage?.type === "mission_invite" ? "🎯 " : ""}
                        {conv.lastMessage?.type === "mission_invite" ? "Convite de Missão" : conv.lastMessage?.type === "image" ? "📷 Foto" : conv.lastMessage?.type === "location" ? "📍 Localização" : (conv.lastMessage?.content || "").substring(0, 40)}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1" data-testid={`badge-unread-${conv.id}`}>
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`flex-1 flex flex-col ${!activeConvId ? "hidden lg:flex" : "flex"}`}>
          {!activeConvId ? (
            <div className="flex-1 flex items-center justify-center text-neutral-300">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Selecione uma conversa</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 border-b bg-white">
                <button className="lg:hidden" onClick={() => setActiveConvId(null)} data-testid="button-back-chat">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {activeConv && (() => {
                  const name = getConvName(activeConv);
                  const otherUid = getConvOtherUserId(activeConv);
                  const pres = otherUid ? presenceMap[otherUid] : null;
                  return (
                    <>
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-white text-xs font-bold">
                          {activeConv.type !== "direct" ? <Users className="w-4 h-4" /> : getInitials(name)}
                        </div>
                        {otherUid && (
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${pres?.online ? "bg-green-500" : "bg-neutral-400"}`} />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">{name}</p>
                        <p className="text-[10px] text-neutral-400">
                          {pres?.online ? "Online" : pres?.last_seen ? `Visto ${fmtDate(pres.last_seen)}` : ""}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f0f0f0]" data-testid="chat-messages-area">
                {messages.map(msg => {
                  const isMine = msg.sender_id === user?.id;
                  const sender = userMap[msg.sender_id];
                  if (msg.type === "system") {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <span className="bg-white/80 text-[10px] text-neutral-500 px-3 py-1 rounded-full">{msg.content}</span>
                      </div>
                    );
                  }
                  if (msg.type === "mission_invite") {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <MissionInviteCard msg={msg} conversationId={activeConvId!} onAccepted={() => { refetchMsgs(); refetchConvs(); }} />
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${isMine ? "bg-[#dcf8c6] rounded-tr-none" : "bg-white rounded-tl-none"}`}>
                        {!isMine && (
                          <p className="text-[10px] font-bold text-blue-600 mb-0.5">{sender?.name || "Usuário"}</p>
                        )}
                        {msg.type === "image" && msg.file_url && (
                          <img src={msg.file_url} alt="Foto" className="rounded max-w-full max-h-48 mb-1" />
                        )}
                        {msg.type === "location" && msg.lat && msg.lng && (
                          <a href={`https://maps.google.com/?q=${msg.lat},${msg.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">
                            📍 Ver no mapa
                          </a>
                        )}
                        {msg.content && msg.type !== "location" && (
                          <p className="text-sm text-neutral-900 whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="text-[10px] text-neutral-500">{fmtTime(msg.created_at)}</span>
                          {isMine && (
                            msg.delivered_at ? <CheckCheck className="w-3 h-3 text-blue-500" /> : <Check className="w-3 h-3 text-neutral-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-2 border-t bg-white flex items-center gap-2">
                <button onClick={handleSendLocation} className="p-2 text-neutral-400 hover:text-red-500 transition-colors" data-testid="button-send-location" title="Enviar localização">
                  <MapPin className="w-5 h-5" />
                </button>
                {isAdmin && (
                  <button onClick={() => setShowSendOS(true)} className="p-2 text-neutral-400 hover:text-amber-500 transition-colors" data-testid="button-send-os-chat" title="Enviar OS para Chat">
                    <Shield className="w-5 h-5" />
                  </button>
                )}
                <Input
                  ref={inputRef}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Mensagem..."
                  className="flex-1 h-9 text-sm"
                  data-testid="input-chat-message"
                />
                <Button size="sm" onClick={handleSend} disabled={!msgText.trim() || sendMutation.isPending} className="bg-green-600 hover:bg-green-700 h-9 w-9 p-0" data-testid="button-send-message">
                  {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </div>

        {showNewChat && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setShowNewChat(false); setGroupMode(false); setSelectedUsers([]); setGroupName(""); }}>
            <div className="bg-white rounded-xl w-full max-w-sm max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="modal-new-chat">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-neutral-900">{groupMode ? "Novo Grupo" : "Nova Conversa"}</h3>
                  <div className="flex items-center gap-1">
                    {!groupMode ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGroupMode(true)} data-testid="button-group-mode">
                        <Users className="w-3 h-3 mr-1" /> Grupo
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setGroupMode(false); setSelectedUsers([]); setGroupName(""); }}>
                        Voltar
                      </Button>
                    )}
                  </div>
                </div>
                {groupMode && (
                  <Input placeholder="Nome do grupo..." value={groupName} onChange={(e) => setGroupName(e.target.value)} className="h-8 text-xs mb-2" data-testid="input-group-name" />
                )}
                <Input placeholder="Buscar usuário..." value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)} className="h-8 text-xs" data-testid="input-new-chat-search" />
                {groupMode && selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedUsers.map(uid => (
                      <span key={uid} className="bg-neutral-100 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        {userMap[uid]?.name?.split(" ")[0] || "?"}
                        <button onClick={() => toggleUserSelection(uid)}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredNewUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (groupMode) {
                        toggleUserSelection(u.id);
                      } else {
                        createConvMutation.mutate({ participantIds: [u.id], type: "direct" });
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-3 text-left border-b border-neutral-50 transition-colors ${groupMode && selectedUsers.includes(u.id) ? "bg-blue-50" : "hover:bg-neutral-50"}`}
                    data-testid={`new-chat-user-${u.id}`}
                  >
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-white text-xs font-bold">
                        {getInitials(u.name)}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${presenceMap[u.id]?.online ? "bg-green-500" : "bg-neutral-400"}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-neutral-900">{u.name}</p>
                      <p className="text-[10px] text-neutral-400">{u.role}</p>
                    </div>
                    {groupMode && selectedUsers.includes(u.id) && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                ))}
              </div>
              {groupMode && (
                <div className="p-3 border-t">
                  <Button size="sm" className="w-full bg-neutral-900 hover:bg-neutral-800 text-xs" onClick={handleCreateGroup} disabled={createConvMutation.isPending} data-testid="button-create-group">
                    {createConvMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                    Criar Grupo ({selectedUsers.length} selecionados)
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {showSendOS && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowSendOS(false)}>
            <div className="bg-white rounded-xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="modal-send-os">
              <div className="p-4 border-b">
                <h3 className="text-sm font-bold text-neutral-900">Enviar OS para Chat</h3>
                <p className="text-[11px] text-neutral-400 mt-1">Selecione a Ordem de Serviço para enviar como convite de missão</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {availableOS.length === 0 && (
                  <p className="p-6 text-center text-xs text-neutral-400">Nenhuma OS disponível</p>
                )}
                {availableOS.map((os: any) => (
                  <button
                    key={os.id}
                    onClick={() => sendMissionInviteMutation.mutate(os.id)}
                    disabled={sendMissionInviteMutation.isPending}
                    className="w-full flex items-center gap-3 p-3 hover:bg-neutral-50 text-left border-b border-neutral-50"
                    data-testid={`send-os-item-${os.id}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-neutral-900">{os.osNumber}</p>
                      <p className="text-[10px] text-neutral-500 truncate">{os.origin} → {os.destination}</p>
                      <p className="text-[10px] text-neutral-400">{os.type} | {os.missionStatus || "aguardando"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
