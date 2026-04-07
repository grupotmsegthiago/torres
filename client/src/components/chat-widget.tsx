import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { authFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Send, Search, Plus, MessageCircle, Users, MapPin, X,
  Check, CheckCheck, ChevronLeft, Loader2, Shield, CheckCircle, Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ChatUser {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
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

interface MissionInviteData {
  osId: number;
  osNumber: string;
  scheduledDate: string | null;
  origin: string;
  destination: string;
  type: string;
}

function fmtTime(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const dt = new Date(d);
  const today = new Date();
  if (dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === today.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })) return fmtTime(d);
  return dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function MissionInviteCard({ msg, conversationId, onAccepted }: { msg: ChatMessage; conversationId: string; onAccepted: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin" || user?.role === "diretoria";

  let missionData: (MissionInviteData & { team?: string[]; vehicle?: string; requiresAcceptance?: boolean }) | null = null;
  try {
    missionData = JSON.parse(msg.content || "{}");
  } catch { missionData = null; }

  const [showTerms, setShowTerms] = useState(false);
  const [showRefuse, setShowRefuse] = useState(false);
  const [refuseReason, setRefuseReason] = useState("");

  const { data: myAcceptance, refetch: refetchAcceptance } = useQuery<any[]>({
    queryKey: ["/api/missions", missionData?.osId, "acceptances"],
    enabled: !!missionData?.osId,
    refetchInterval: 10000,
  });

  const myStatus = (() => {
    if (!myAcceptance || !user) return null;
    const mine = myAcceptance.find((a: any) => {
      if (user.employeeId && a.employee_id === user.employeeId) return true;
      return false;
    });
    return mine?.status || null;
  })();

  const getGeoLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const geo = await getGeoLocation();
      const deviceInfo = navigator.userAgent;
      const res = await authFetch(`/api/missions/${missionData?.osId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationLat: geo?.lat || null,
          locationLng: geo?.lng || null,
          deviceInfo,
          conversationId,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ message: "Erro" }));
        throw new Error(d.message || "Erro ao aceitar");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowTerms(false);
      toast({ title: "Missão aceita com sucesso!" });
      refetchAcceptance();
      onAccepted();
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", conversationId, "messages"] });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Erro ao aceitar missão", variant: "destructive" });
    },
  });

  const refuseMutation = useMutation({
    mutationFn: async () => {
      const deviceInfo = navigator.userAgent;
      const res = await authFetch(`/api/missions/${missionData?.osId}/refuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: refuseReason, deviceInfo, conversationId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ message: "Erro" }));
        throw new Error(d.message || "Erro ao recusar");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowRefuse(false);
      setRefuseReason("");
      toast({ title: "Missão recusada" });
      refetchAcceptance();
      onAccepted();
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", conversationId, "messages"] });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Erro ao recusar missão", variant: "destructive" });
    },
  });

  if (!missionData) return null;

  const statusBadge = myStatus === "aceito" ? (
    <div className="flex items-center justify-center gap-2 bg-green-600/20 border border-green-500/30 rounded-md py-2 px-3" data-testid={`badge-mission-accepted-${missionData.osId}`}>
      <CheckCircle className="w-4 h-4 text-green-400" />
      <span className="text-xs font-bold text-green-400">Missão aceita</span>
    </div>
  ) : myStatus === "recusado" ? (
    <div className="flex items-center justify-center gap-2 bg-red-600/20 border border-red-500/30 rounded-md py-2 px-3" data-testid={`badge-mission-refused-${missionData.osId}`}>
      <X className="w-4 h-4 text-red-400" />
      <span className="text-xs font-bold text-red-400">Missão recusada</span>
    </div>
  ) : myStatus === "expirado" ? (
    <div className="flex items-center justify-center gap-2 bg-yellow-600/20 border border-yellow-500/30 rounded-md py-2 px-3">
      <Clock className="w-4 h-4 text-yellow-400" />
      <span className="text-xs font-bold text-yellow-400">Prazo expirado</span>
    </div>
  ) : null;

  return (
    <>
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 text-white rounded-lg p-3 max-w-[300px] shadow-lg border border-neutral-700" data-testid={`card-mission-invite-${missionData.osId}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-amber-400">Nova Missão</p>
            <p className="text-sm font-bold">{missionData.osNumber}</p>
          </div>
        </div>
        <div className="space-y-1 text-[11px] mb-3">
          <div className="flex justify-between"><span className="text-neutral-400">Tipo:</span><span className="font-medium">{missionData.type}</span></div>
          {missionData.scheduledDate && <div className="flex justify-between"><span className="text-neutral-400">📅 Data:</span><span className="font-medium">{missionData.scheduledDate}</span></div>}
          <div className="flex justify-between"><span className="text-neutral-400">📍 Origem:</span><span className="font-medium text-right max-w-[160px] truncate">{missionData.origin}</span></div>
          <div className="flex justify-between"><span className="text-neutral-400">🏁 Destino:</span><span className="font-medium text-right max-w-[160px] truncate">{missionData.destination}</span></div>
          {missionData.team && <div className="flex justify-between"><span className="text-neutral-400">👥 Equipe:</span><span className="font-medium text-right max-w-[160px] truncate">{missionData.team.join(" + ")}</span></div>}
          {missionData.vehicle && <div className="flex justify-between"><span className="text-neutral-400">🚗 Viatura:</span><span className="font-medium text-right max-w-[160px] truncate">{missionData.vehicle}</span></div>}
        </div>

        {statusBadge || (!isAdmin && myStatus === "pendente" || (!myStatus && !isAdmin)) ? (
          statusBadge || (
            <div className="space-y-1.5">
              <p className="text-[10px] text-amber-300">⚠️ Esta missão requer seu ACEITE FORMAL. Prazo: 2 horas.</p>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => setShowTerms(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] h-8" data-testid={`button-accept-mission-${missionData.osId}`}>
                  <Shield className="w-3 h-3 mr-1" /> ACEITAR
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowRefuse(true)} className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold text-[11px] h-8" data-testid={`button-refuse-mission-${missionData.osId}`}>
                  <X className="w-3 h-3 mr-1" /> RECUSAR
                </Button>
              </div>
            </div>
          )
        ) : isAdmin && myAcceptance ? (
          <div className="space-y-1 mt-1">
            {myAcceptance.map((a: any) => (
              <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
                {a.status === "aceito" ? <CheckCircle className="w-3 h-3 text-green-400" /> : a.status === "recusado" ? <X className="w-3 h-3 text-red-400" /> : a.status === "expirado" ? <Clock className="w-3 h-3 text-yellow-400" /> : <Clock className="w-3 h-3 text-neutral-400" />}
                <span className="text-neutral-300">{a.employeeName}:</span>
                <span className={a.status === "aceito" ? "text-green-400 font-bold" : a.status === "recusado" ? "text-red-400 font-bold" : a.status === "expirado" ? "text-yellow-400" : "text-neutral-400"}>
                  {a.status === "aceito" ? "Aceito" : a.status === "recusado" ? "Recusado" : a.status === "expirado" ? "Expirado" : "Pendente"}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-end mt-1">
          <span className="text-[10px] text-neutral-500">{fmtTime(msg.created_at)}</span>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="modal-accept-terms">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-6 h-6 text-emerald-600" />
              <h3 className="text-base font-black text-neutral-900 dark:text-white">TERMO DE CIÊNCIA E ACEITE DE MISSÃO</h3>
            </div>
            <div className="text-sm text-neutral-700 dark:text-neutral-300 space-y-3 mb-4">
              <p>Eu, <strong>{user?.name}</strong>, declaro estar ciente e aceitar a missão <strong>{missionData.osNumber}</strong> conforme detalhes abaixo:</p>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3 text-xs space-y-1">
                <p>📅 Data: <strong>{missionData.scheduledDate}</strong></p>
                <p>📍 Origem: <strong>{missionData.origin}</strong></p>
                <p>🏁 Destino: <strong>{missionData.destination}</strong></p>
                {missionData.team && <p>👥 Equipe: <strong>{missionData.team.join(" + ")}</strong></p>}
                {missionData.vehicle && <p>🚗 Viatura: <strong>{missionData.vehicle}</strong></p>}
              </div>
              <p className="font-medium">Declaro ainda que:</p>
              <ul className="space-y-1 text-xs">
                <li>✓ Estou em plenas condições físicas e mentais</li>
                <li>✓ Não estou sob efeito de álcool ou substâncias</li>
                <li>✓ Estou ciente do armamento sob minha responsabilidade</li>
                <li>✓ Conheço os protocolos de segurança Torres</li>
                <li>✓ Aceito as condições e responsabilidades desta missão</li>
              </ul>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-2 text-[10px] text-neutral-500 space-y-0.5">
                <p>Data/Hora: {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                <p>Localização: será capturada automaticamente (GPS)</p>
                <p>IP e Dispositivo: registrados automaticamente</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTerms(false)} className="flex-1 h-10 text-sm">Cancelar</Button>
              <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm" data-testid="button-confirm-accept">
                {acceptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Shield className="w-4 h-4 mr-1" />}
                CONFIRMAR E ASSINAR
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRefuse && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowRefuse(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="modal-refuse-mission">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-3">Recusar Missão {missionData.osNumber}</h3>
            <p className="text-xs text-neutral-500 mb-2">Justificativa obrigatória:</p>
            <textarea
              value={refuseReason}
              onChange={e => setRefuseReason(e.target.value)}
              placeholder="Motivo da recusa..."
              className="w-full border rounded-lg p-2 text-sm h-24 resize-none mb-3 bg-white dark:bg-zinc-800"
              data-testid="textarea-refuse-reason"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowRefuse(false); setRefuseReason(""); }} className="flex-1 h-9 text-sm">Cancelar</Button>
              <Button onClick={() => refuseMutation.mutate()} disabled={!refuseReason.trim() || refuseMutation.isPending} variant="destructive" className="flex-1 h-9 text-sm font-bold" data-testid="button-confirm-refuse">
                {refuseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Confirmar Recusa
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ChatWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "admin" || user?.role === "diretoria";

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/chat/unread-count"],
    refetchInterval: 15000,
  });

  const { data: conversations = [], refetch: refetchConvs } = useQuery<ChatConversation[]>({
    queryKey: ["/api/chat/conversations"],
    refetchInterval: 15000,
    enabled: open,
  });

  const { data: chatUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ["/api/chat/users"],
    enabled: open,
  });

  const { data: presence = [] } = useQuery<PresenceEntry[]>({
    queryKey: ["/api/chat/presence"],
    refetchInterval: 30000,
    enabled: open,
  });

  const { data: messages = [], refetch: refetchMsgs } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/conversations", activeConvId, "messages"],
    enabled: !!activeConvId && open,
    refetchInterval: 5000,
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

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel("widget-chat-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new as any;
        if (msg.conversation_id === activeConvId) refetchMsgs();
        refetchConvs();
        queryClient.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConvId, open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeConvId && open) {
      authFetch(`/api/chat/conversations/${activeConvId}/read`, { method: "PATCH" }).catch(() => {});
    }
  }, [activeConvId, messages.length, open]);

  const sendMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await authFetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro");
      return res.json();
    },
    onSuccess: () => { setMsgText(""); refetchMsgs(); refetchConvs(); inputRef.current?.focus(); },
  });

  const createConvMutation = useMutation({
    mutationFn: async (params: { participantIds: number[]; type: string; name?: string }) => {
      const res = await authFetch("/api/chat/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Erro");
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

  const handleSend = () => {
    if (!msgText.trim() || !activeConvId) return;
    sendMutation.mutate({ content: msgText.trim(), type: "text" });
  };

  function getConvName(conv: ChatConversation) {
    if (conv.name) return conv.name;
    if (conv.type === "direct") {
      const other = conv.participants.find(p => p.user_id !== user?.id);
      return other ? (userMap[other.user_id]?.name || "Usuário") : "Conversa";
    }
    return "Grupo";
  }

  function getConvOtherUserId(conv: ChatConversation) {
    if (conv.type !== "direct") return null;
    return conv.participants.find(p => p.user_id !== user?.id)?.user_id || null;
  }

  const filteredConvs = conversations.filter(c => {
    if (!searchTerm) return true;
    return getConvName(c).toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredNewUsers = chatUsers.filter(u => {
    if (u.id === user?.id) return false;
    if (!isAdmin && u.role !== "admin" && u.role !== "diretoria") return false;
    if (!newChatSearch) return true;
    return u.name.toLowerCase().includes(newChatSearch.toLowerCase());
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

  const totalUnread = unreadData?.unreadCount || 0;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-[4.5rem] right-6 z-[60] w-14 h-14 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 md:bottom-6"
        data-testid="button-chat-widget"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1" data-testid="badge-chat-unread">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-32 right-2 left-2 z-[60] h-[60vh] bg-white rounded-xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden md:bottom-24 md:right-6 md:left-auto md:w-[380px] md:h-[520px]" data-testid="panel-chat-widget">
          {!activeConvId ? (
            <>
              <div className="p-3 border-b bg-neutral-900 text-white">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-tight">Chat Tático</h3>
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 h-7 w-7 p-0" onClick={() => { setShowNewChat(true); setGroupMode(false); setSelectedUsers([]); }} data-testid="button-widget-new-chat">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-neutral-400" />
                  <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-7 text-xs bg-white/10 border-white/20 text-white placeholder:text-neutral-400" data-testid="input-widget-search" />
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
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className="w-full flex items-center gap-3 p-3 border-b border-neutral-50 hover:bg-neutral-50 text-left transition-colors"
                      data-testid={`widget-conv-${conv.id}`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-white text-xs font-bold">
                          {conv.type !== "direct" ? <Users className="w-3.5 h-3.5" /> : getInitials(convName)}
                        </div>
                        {otherUid && <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${isOnline ? "bg-green-500" : "bg-neutral-400"}`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-neutral-900 truncate">{convName}</span>
                          <span className="text-[10px] text-neutral-400 shrink-0">{fmtDate(conv.lastMessage?.created_at || conv.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[11px] text-neutral-500 truncate">
                            {conv.lastMessage?.type === "mission_invite" ? "🎯 Convite de Missão" : conv.lastMessage?.type === "system" ? "📋 " + (conv.lastMessage?.content || "").substring(0, 30) : (conv.lastMessage?.content || "").substring(0, 30)}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">{conv.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 p-2 border-b bg-neutral-900 text-white">
                <button onClick={() => setActiveConvId(null)} data-testid="button-widget-back">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {activeConv && (() => {
                  const name = getConvName(activeConv);
                  const otherUid = getConvOtherUserId(activeConv);
                  const pres = otherUid ? presenceMap[otherUid] : null;
                  return (
                    <>
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-neutral-600 flex items-center justify-center text-white text-[10px] font-bold">
                          {activeConv.type !== "direct" ? <Users className="w-3 h-3" /> : getInitials(name)}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold">{name}</p>
                        <p className="text-[9px] text-neutral-400">{pres?.online ? "Online" : ""}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#f0f0f0]">
                {messages.map(msg => {
                  const isMine = msg.sender_id === user?.id;
                  const sender = userMap[msg.sender_id];
                  if (msg.type === "system") {
                    return <div key={msg.id} className="flex justify-center"><span className="bg-white/80 text-[10px] text-neutral-500 px-3 py-1 rounded-full">{msg.content}</span></div>;
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
                        {!isMine && <p className="text-[10px] font-bold text-blue-600 mb-0.5">{sender?.name || "Usuário"}</p>}
                        {msg.content && msg.type !== "location" && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}
                        {msg.type === "location" && msg.lat && msg.lng && (
                          <a href={`https://maps.google.com/?q=${msg.lat},${msg.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">📍 Ver no mapa</a>
                        )}
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="text-[10px] text-neutral-500">{fmtTime(msg.created_at)}</span>
                          {isMine && (msg.delivered_at ? <CheckCheck className="w-3 h-3 text-blue-500" /> : <Check className="w-3 h-3 text-neutral-400" />)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-2 border-t bg-white flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Mensagem..."
                  className="flex-1 h-8 text-xs"
                  data-testid="input-widget-message"
                />
                <Button size="sm" onClick={handleSend} disabled={!msgText.trim() || sendMutation.isPending} className="bg-green-600 hover:bg-green-700 h-8 w-8 p-0" data-testid="button-widget-send">
                  {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </>
          )}

          {showNewChat && (
            <div className="absolute inset-0 bg-white z-10 flex flex-col" data-testid="modal-widget-new-chat">
              <div className="p-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-neutral-900">{groupMode ? "Novo Grupo" : "Nova Conversa"}</h3>
                  <div className="flex items-center gap-1">
                    {!groupMode && isAdmin && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setGroupMode(true)} data-testid="button-widget-group-mode">
                        <Users className="w-3 h-3 mr-1" /> Grupo
                      </Button>
                    )}
                    <button onClick={() => { setShowNewChat(false); setGroupMode(false); setSelectedUsers([]); setGroupName(""); }} className="text-neutral-400 hover:text-neutral-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {groupMode && (
                  <Input placeholder="Nome do grupo..." value={groupName} onChange={(e) => setGroupName(e.target.value)} className="h-7 text-xs mb-2" data-testid="input-widget-group-name" />
                )}
                <Input placeholder="Buscar usuário..." value={newChatSearch} onChange={(e) => setNewChatSearch(e.target.value)} className="h-7 text-xs" data-testid="input-widget-new-search" />
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
                    className={`w-full flex items-center gap-3 p-2.5 border-b border-neutral-50 text-left transition-colors ${groupMode && selectedUsers.includes(u.id) ? "bg-blue-50" : "hover:bg-neutral-50"}`}
                    data-testid={`widget-new-user-${u.id}`}
                  >
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-white text-[10px] font-bold">{getInitials(u.name)}</div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white ${presenceMap[u.id]?.online ? "bg-green-500" : "bg-neutral-400"}`} />
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
                <div className="p-2 border-t">
                  <Button size="sm" className="w-full h-8 text-xs bg-neutral-900 hover:bg-neutral-800" onClick={handleCreateGroup} disabled={createConvMutation.isPending} data-testid="button-widget-create-group">
                    {createConvMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
                    Criar Grupo ({selectedUsers.length} selecionados)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export { MissionInviteCard };
export type { MissionInviteData };
