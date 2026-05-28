import React from "react";
import { 
  Search, MoreVertical, Paperclip, Smile, Mic, Send, 
  Phone, Video, Bell, Filter, MessageCircle, Users, 
  Pin, Check, CheckCheck, ArrowLeft, Truck, MapPin, 
  Clock, AlertTriangle, Camera, User, Image as ImageIcon,
  Building2, Briefcase, FileText, ChevronRight, CheckCircle2,
  XCircle, ShieldAlert, Crosshair, Navigation
} from "lucide-react";

export function Hybrid() {
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 font-sans text-slate-800 overflow-hidden">
      {/* Topbar ERP */}
      <div className="h-10 bg-slate-900 text-slate-200 flex items-center justify-between px-4 text-xs font-medium shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-400" />
          <span>Torres Vigilância</span>
          <span className="text-slate-600">/</span>
          <span>Painel Operacional</span>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> 16:05 BRT</span>
          <div className="relative cursor-pointer">
            <Bell className="w-4 h-4 hover:text-white" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </div>
          <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
            OP
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* COL 1: Chat List */}
        <div className="w-[340px] flex flex-col bg-white border-r border-slate-200 shrink-0">
          {/* Header */}
          <div className="h-[59px] bg-[#f0f2f5] flex items-center justify-between px-4 shrink-0 border-b border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-slate-600">
              <User className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-3 text-slate-500">
              <Users className="w-5 h-5 cursor-pointer" />
              <MessageCircle className="w-5 h-5 cursor-pointer" />
              <MoreVertical className="w-5 h-5 cursor-pointer" />
            </div>
          </div>

          {/* Search */}
          <div className="p-2 border-b border-slate-200 bg-white shrink-0">
            <div className="bg-[#f0f2f5] rounded-lg flex items-center px-3 py-1.5 gap-3">
              <Search className="w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Pesquisar ou começar uma nova conversa" 
                className="bg-transparent border-none outline-none flex-1 text-sm text-slate-700 placeholder:text-slate-500"
              />
              <Filter className="w-4 h-4 text-slate-500 cursor-pointer" />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
            {/* Pinned */}
            <ChatItem 
              avatar="C" avatarColor="bg-slate-700" 
              name="Central Torres - Coordenação" 
              time="15:30" 
              lastMessage="Atenção todas as equipes de SP" 
              isGroup isPinned
            />
            {/* Active */}
            <ChatItem 
              avatar="TM" avatarColor="bg-blue-600" 
              name="TM SEGURANCA — Operação Pernambuco" 
              time="15:59" 
              lastMessage="📷 PERNOITE" 
              isGroup unread={3} isActive
            />
            {/* Others */}
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="ANDRE WILSON" 
              time="16:01" 
              lastMessage="Recebido, chefe. Indo agora."
              status="read"
            />
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="CARLOS BOLDRINI JUNIOR" 
              time="15:59" 
              lastMessage="📷 Foto"
              unread={1}
            />
            <ChatItem 
              avatar="ML" avatarColor="bg-yellow-500" 
              name="Mercado Livre — Operações" 
              time="11:14" 
              lastMessage="Chegada no Cliente — TOR-0231"
              isGroup status="read"
            />
            <ChatItem 
              avatar="ML" avatarColor="bg-blue-500" 
              name="Magazine Luiza — TOR-0234" 
              time="15:28" 
              lastMessage="PERDA DE SINAL"
              isGroup unread={2} alert
            />
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="EDIVANDO MEDEIROS" 
              time="15:28" 
              lastMessage="Sem sinal aqui no túnel"
              status="read"
            />
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="VITOR DE MACEDO" 
              time="14:50" 
              lastMessage="Confirmo recebimento da OS"
              status="read"
            />
            <ChatItem 
              avatar="DH" avatarColor="bg-red-600" 
              name="DHL Medicamentos — Escolta SP/RJ" 
              time="14:22" 
              lastMessage="Início de Missão"
              isGroup status="read"
            />
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="VICTOR LAIATTI" 
              time="13:30" 
              lastMessage="Pode passar"
              status="read"
            />
            <ChatItem 
              avatar="AT" avatarColor="bg-orange-500" 
              name="Atacadão — Rota Campinas" 
              time="10:02" 
              lastMessage="Em Trânsito ao Destino"
              isGroup status="read"
            />
            <ChatItem 
              avatar="B2" avatarColor="bg-purple-600" 
              name="B2W — Escolta Diária" 
              time="Ontem" 
              lastMessage="Finalizado com sucesso"
              isGroup status="read"
            />
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="RAIMUNDO FERREIRA" 
              time="Ontem" 
              lastMessage="Boa noite"
              status="read"
            />
            <ChatItem 
              avatar={<User className="w-5 h-5" />} avatarColor="bg-slate-200 text-slate-500"
              name="LUCAS PEREIRA" 
              time="Ontem" 
              lastMessage="Ok"
              status="read"
            />
          </div>
        </div>

        {/* COL 2: Active Chat */}
        <div className="flex-1 flex flex-col relative bg-[#efeae2] border-r border-slate-200 shrink-0 min-w-[400px]">
          {/* Chat Pattern Overlay */}
          <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: "url('https://static.whatsapp.net/rsrc.php/v3/yl/r/r_QZ3oOW8AW.png')" }}></div>

          {/* Header */}
          <div className="h-[59px] bg-[#f0f2f5] flex items-center justify-between px-4 shrink-0 relative z-10 shadow-sm border-b border-slate-200">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                TM
              </div>
              <div>
                <div className="font-semibold text-[15px] leading-tight text-slate-900">TM SEGURANCA — Operação Pernambuco</div>
                <div className="text-xs text-slate-500">12 participantes incluindo você</div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <Search className="w-5 h-5 cursor-pointer hover:text-slate-700" />
              <MoreVertical className="w-5 h-5 cursor-pointer hover:text-slate-700" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-10 custom-scrollbar">
            
            <div className="flex justify-center my-2">
              <span className="bg-white text-slate-600 text-[11px] px-3 py-1 rounded-lg shadow-sm font-medium border border-slate-200">HOJE</span>
            </div>

            <div className="flex justify-center my-2">
              <span className="bg-[#f0f2f5]/90 text-slate-600 text-[11.5px] px-4 py-1.5 rounded-lg shadow-sm border border-slate-200">
                Início de Missão — TOR-0236
              </span>
            </div>

            <Message 
              sender="ANDRE WILSON" color="text-orange-500"
              time="14:25" 
              text="Boa tarde a todos. Iniciando a escolta agora."
            />
            
            <Message 
              sender="Marcos / TM Seg." color="text-purple-600"
              time="14:28" 
              text="Boa tarde André, equipe completa?"
            />
            
            <Message 
              sender="ANDRE WILSON" color="text-orange-500"
              time="14:29" 
              text="Sim, eu e Carlos. Viatura UGU6E48."
            />

            {/* Rich Message 1 */}
            <div className="flex justify-end">
              <div className="bg-[#d9fdd3] rounded-lg p-1.5 max-w-[85%] sm:max-w-[420px] shadow-sm relative text-[13px]">
                {/* Thumb */}
                <div className="w-full h-36 bg-slate-300 rounded mb-2 flex items-center justify-center text-slate-500 overflow-hidden relative">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1 backdrop-blur-sm">
                    <Camera className="w-3 h-3" /> Câmera Viatura
                  </div>
                </div>
                {/* Caption */}
                <div className="px-1 pb-4 leading-relaxed text-slate-800">
                  🛡️ <strong>TORRES VIGILÂNCIA PATRIMONIAL</strong><br/>
                  🚨 <strong>OS TOR-0236</strong> | <strong>STATUS:</strong> EM TRÂNSITO DESTINO<br/>
                  <br/>
                  📅 <strong>DATA:</strong> 28/05/2026   🕐 <strong>HORA:</strong> 15:46<br/>
                  🏢 <strong>OPERAÇÃO:</strong> Em Trânsito ao Destino<br/>
                  🏢 <strong>CLIENTE:</strong> TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA<br/>
                  <br/>
                  📍 <strong>ORIGEM:</strong> DHL MEDICAMENTO - Av. Júlia Gaioli, Guarulhos - SP<br/>
                  🏁 <strong>DESTINO:</strong> Jaboatão dos Guararapes, PE<br/>
                  <br/>
                  🚛 <strong>VEÍCULO:</strong> SEG5H54<br/>
                  👤 <strong>MOTORISTA:</strong> Victor Laiatti<br/>
                  <br/>
                  🚓 <strong>VIATURA:</strong> UGU6E48<br/>
                  👮 <strong>AGENTE 01:</strong> ANDRE WILSON<br/>
                  👮 <strong>AGENTE 02:</strong> CARLOS BOLDRINI<br/>
                  <br/>
                  📊 <strong>PROGRESSO DA MISSÃO:</strong> 18%<br/>
                  ✅ <strong>MARCO:</strong> EM TRÂNSITO AO DESTINO<br/>
                  📝 <strong>ATUALIZAÇÃO:</strong> RODOVIA FERNÃO DIAS<br/>
                  📍 <strong>LOCALIZAÇÃO:</strong> Rodovia Fernão Dias, km 482<br/>
                  <br/>
                  🚗 <strong>DISTÂNCIA ATÉ DESTINO:</strong> 1688 km<br/>
                  ⏱️ <strong>PREVISÃO DE CHEGADA:</strong> ~28h08
                </div>
                <div className="absolute bottom-1 right-2 text-[10px] text-green-700 flex items-center gap-1">
                  15:46 <CheckCheck className="w-3 h-3 text-blue-500" />
                </div>
              </div>
            </div>

            <Message 
              sender="Marcos / TM Seg." color="text-purple-600"
              time="15:48" 
              text="Recebido. Mantenham atualizações."
            />

            {/* Rich Message 2 */}
            <div className="flex justify-end">
              <div className="bg-[#d9fdd3] rounded-lg p-1.5 max-w-[85%] sm:max-w-[420px] shadow-sm relative text-[13px]">
                {/* Thumb */}
                <div className="w-full h-36 bg-slate-300 rounded mb-2 flex items-center justify-center text-slate-500 overflow-hidden relative">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded flex items-center gap-1 backdrop-blur-sm">
                    <Camera className="w-3 h-3" /> Câmera Viatura
                  </div>
                </div>
                {/* Caption */}
                <div className="px-1 pb-4 leading-relaxed text-slate-800">
                  🛡️ <strong>TORRES VIGILÂNCIA PATRIMONIAL</strong><br/>
                  🚨 <strong>OS TOR-0236</strong> | <strong>STATUS:</strong> PERNOITE<br/>
                  <br/>
                  📅 <strong>DATA:</strong> 28/05/2026   🕐 <strong>HORA:</strong> 15:59<br/>
                  🏢 <strong>OPERAÇÃO:</strong> Parada para Pernoite<br/>
                  <br/>
                  📊 <strong>PROGRESSO DA MISSÃO:</strong> 20%<br/>
                  📍 <strong>LOCALIZAÇÃO:</strong> Posto Graal Fernão Dias, km 485<br/>
                  <br/>
                  ⏱️ <strong>PREVISÃO RETOMADA:</strong> 06:00
                </div>
                <div className="absolute bottom-1 right-2 text-[10px] text-green-700 flex items-center gap-1">
                  15:59 <CheckCheck className="w-3 h-3 text-blue-500" />
                </div>
              </div>
            </div>

            <Message 
              sender="Marcos / TM Seg." color="text-purple-600"
              time="16:00" 
              text="Ok, podem pernoitar. Reportem ao acordar."
            />
            
            <div className="h-2"></div> {/* spacer */}
          </div>

          {/* Input Area */}
          <div className="bg-[#f0f2f5] min-h-[62px] px-4 py-3 flex items-end gap-3 shrink-0 relative z-10 border-t border-slate-200">
            <div className="flex gap-3 text-slate-500 pb-1.5">
              <Smile className="w-6 h-6 cursor-pointer hover:text-slate-600" />
              <Paperclip className="w-6 h-6 cursor-pointer hover:text-slate-600" />
            </div>
            <div className="flex-1 bg-white rounded-lg px-4 py-2 border border-white shadow-sm flex items-center">
              <input 
                type="text" 
                placeholder="Digite uma mensagem" 
                className="w-full bg-transparent outline-none text-[15px] placeholder:text-slate-400"
              />
            </div>
            <div className="text-slate-500 pb-1.5">
              <Mic className="w-6 h-6 cursor-pointer hover:text-slate-600" />
            </div>
          </div>
        </div>

        {/* COL 3: ERP Panel Contextual */}
        <div className="w-[420px] bg-slate-50 flex flex-col border-l border-slate-200 shrink-0 z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          {/* Header */}
          <div className="h-[59px] bg-white flex items-center px-5 border-b border-slate-200 shrink-0 shadow-sm">
            <Crosshair className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="font-semibold text-slate-800 text-sm">Contexto Operacional</h2>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
            
            {/* Card Cliente */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                    TM
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">TM SEGURANCA</h3>
                    <p className="text-[11px] text-slate-500">CNPJ: 45.928.112/0001-88</p>
                  </div>
                </div>
                <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded font-medium border border-slate-200">CLIENTE</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" /> Contato: Marcos</div>
                <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> (11) 98765-4321</div>
              </div>
              <button className="text-blue-600 text-xs font-medium mt-3 flex items-center gap-1 hover:underline">
                Ver ficha completa <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {/* Card OS Ativa */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 border-l-emerald-500">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">OS ATIVA</div>
                  <h3 className="font-bold text-slate-900 text-[15px]">TOR-0236</h3>
                </div>
                <div className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded font-bold tracking-wide border border-emerald-200">
                  EM TRÂNSITO DESTINO
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>Progresso (20%)</span>
                    <span>Restam 1688 km</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '20%' }}></div>
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-2 relative">
                  <div className="flex items-start gap-2 relative z-10">
                    <div className="mt-0.5"><div className="w-2 h-2 rounded-full border-2 border-slate-400 bg-white"></div></div>
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-500 font-medium">ORIGEM</div>
                      <div className="text-xs font-medium text-slate-800 line-clamp-1">Guarulhos, SP</div>
                    </div>
                  </div>
                  <div className="absolute left-[13px] top-4 bottom-4 w-px bg-slate-300"></div>
                  <div className="flex items-start gap-2 relative z-10">
                    <div className="mt-0.5"><MapPin className="w-3 h-3 text-red-500 -ml-0.5 bg-slate-50 rounded-full" /></div>
                    <div className="flex-1">
                      <div className="text-[10px] text-slate-500 font-medium">DESTINO (ETA ~28h)</div>
                      <div className="text-xs font-medium text-slate-800 line-clamp-1">Jaboatão dos Guararapes, PE</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button className="flex-1 bg-white border border-slate-300 text-slate-700 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50 flex items-center justify-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" /> Ver no mapa
                  </button>
                  <button className="flex-1 bg-slate-900 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 flex items-center justify-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Abrir OS
                  </button>
                </div>
              </div>
            </div>

            {/* Card Equipe */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Equipe em campo
              </h3>
              
              <div className="flex items-center gap-3 mb-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-slate-500">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">UGU6E48</div>
                  <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Em movimento
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500"><User className="w-4 h-4" /></div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-800">ANDRE WILSON</div>
                    <div className="text-[10px] text-slate-500">Agente 01 (Líder)</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500"><User className="w-4 h-4" /></div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-slate-800">CARLOS BOLDRINI</div>
                    <div className="text-[10px] text-slate-500">Agente 02</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Convites */}
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-bl-full opacity-50"></div>
              <h3 className="font-bold text-amber-900 text-sm mb-1 flex items-center gap-2 relative z-10">
                <AlertTriangle className="w-4 h-4" /> Convite Tático Pendente
              </h3>
              <p className="text-xs text-amber-700 mb-3 relative z-10">
                Aguardando resposta da equipe para próxima missão.
              </p>
              
              <div className="bg-white/60 p-3 rounded-lg border border-amber-200 mb-3 relative z-10">
                <div className="font-semibold text-slate-800 text-xs">TOR-0238</div>
                <div className="text-[11px] text-slate-600 mb-1">Escolta Mercado Livre</div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3" /> Saída programada: 18:00
                </div>
              </div>

              <div className="flex gap-2 relative z-10">
                <button className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold shadow-sm transition-colors flex justify-center items-center gap-1">
                  <Check className="w-4 h-4" /> Aceitar
                </button>
                <button className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2 rounded-lg text-xs font-bold shadow-sm transition-colors flex justify-center items-center gap-1">
                  <XCircle className="w-4 h-4" /> Recusar
                </button>
              </div>
            </div>

            {/* Card Ações */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2">
              <div className="grid grid-cols-2 gap-1">
                <button className="p-2.5 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-blue-600 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><FileText className="w-4 h-4" /></div>
                  <span className="text-[10px] font-semibold">Nova OS</span>
                </button>
                <button className="p-2.5 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-rose-600 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-500"><ShieldAlert className="w-4 h-4" /></div>
                  <span className="text-[10px] font-semibold text-center leading-tight">Reportar<br/>Incidente</span>
                </button>
                <button className="p-2.5 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-amber-600 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500"><Users className="w-4 h-4" /></div>
                  <span className="text-[10px] font-semibold text-center leading-tight">Solicitar<br/>Reforço</span>
                </button>
                <button className="p-2.5 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-purple-600 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-500"><Building2 className="w-4 h-4" /></div>
                  <span className="text-[10px] font-semibold text-center leading-tight">Acionar<br/>Gerenciadora</span>
                </button>
              </div>
            </div>

            {/* Últimas OSs */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">Últimas OSs deste cliente</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">TOR-0231</span>
                  <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Concluída</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">TOR-0225</span>
                  <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Concluída</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">TOR-0220</span>
                  <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> Cancelada</span>
                </div>
              </div>
            </div>

            {/* Footer sync */}
            <div className="text-center text-[10px] text-slate-400 mt-2 mb-4 flex items-center justify-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              Sincronizado com o ERP · há 2s
            </div>

          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}} />
    </div>
  );
}

// Subcomponents

function ChatItem({ avatar, avatarColor, name, time, lastMessage, isGroup, unread, alert, isActive, isPinned, status }: any) {
  return (
    <div className={`flex items-center px-3 py-3 cursor-pointer border-b border-slate-100 transition-colors relative
      ${isActive ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}
    `}>
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>}
      
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-lg shrink-0 ${avatarColor}`}>
        {avatar}
      </div>
      
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex justify-between items-center mb-0.5">
          <div className="font-medium text-[15px] text-slate-900 truncate pr-2 flex items-center gap-1">
            {isPinned && <Pin className="w-3.5 h-3.5 text-slate-400 rotate-45" />}
            {isGroup && <Users className="w-3.5 h-3.5 text-slate-400" />}
            <span className="truncate">{name}</span>
          </div>
          <div className={`text-xs shrink-0 ${unread || alert ? 'text-emerald-500 font-medium' : 'text-slate-500'}`}>
            {time}
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-500 truncate flex items-center gap-1">
            {status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
            {status === 'delivered' && <CheckCheck className="w-3.5 h-3.5 text-slate-400" />}
            {status === 'sent' && <Check className="w-3.5 h-3.5 text-slate-400" />}
            <span className={`truncate ${alert ? 'text-rose-500 font-medium' : ''}`}>{lastMessage}</span>
          </div>
          {unread && (
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 ml-2">
              {unread}
            </div>
          )}
          {alert && !unread && (
            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white shrink-0 ml-2">
              <AlertTriangle className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ sender, color, time, text }: any) {
  return (
    <div className="flex justify-start">
      <div className="bg-white rounded-lg p-2 max-w-[85%] sm:max-w-[70%] shadow-sm relative pr-16 text-[13px]">
        <div className={`font-medium text-xs mb-0.5 ${color}`}>
          {sender}
        </div>
        <div className="text-slate-800 leading-relaxed break-words">
          {text}
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] text-slate-400">
          {time}
        </div>
      </div>
    </div>
  );
}
