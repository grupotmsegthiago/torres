import React from "react";
import { 
  Search, MoreVertical, Paperclip, Smile, Mic, Send, Phone, Video, Bell, 
  Filter, MessageCircle, Users, Pin, Check, CheckCheck, ArrowLeft, Truck, 
  MapPin, Clock, AlertTriangle, ChevronDown, Camera, User, Image as ImageIcon,
  ChevronRight
} from "lucide-react";

export function Classic() {
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 font-sans text-slate-800 overflow-hidden">
      {/* Topbar ERP */}
      <div className="h-8 bg-slate-900 text-slate-300 flex items-center px-4 justify-between text-xs font-medium z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">Torres Vigilância</span>
          <span className="text-slate-500">·</span>
          <span>Painel Operacional</span>
          <span className="text-slate-500">·</span>
          <span className="text-blue-400">WhatsApp Embarcado</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Conectado</span>
          </div>
          <Bell className="w-4 h-4 cursor-pointer hover:text-white" />
        </div>
      </div>

      {/* Main WhatsApp App Area */}
      <div className="flex-1 flex overflow-hidden bg-white relative">
        
        {/* COLUNA 1 - Lista de Conversas (380px) */}
        <div className="w-[380px] flex flex-col border-r border-slate-200 shrink-0 bg-white">
          {/* Header */}
          <div className="h-[59px] bg-slate-50 px-4 flex items-center justify-between border-b border-slate-200 shrink-0">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
              <User className="w-6 h-6 text-slate-400" />
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <Users className="w-5 h-5 cursor-pointer" />
              <MessageCircle className="w-5 h-5 cursor-pointer" />
              <MoreVertical className="w-5 h-5 cursor-pointer" />
            </div>
          </div>
          
          {/* Busca e Filtros */}
          <div className="p-2 border-b border-slate-200 flex flex-col gap-2 shrink-0">
            <div className="bg-slate-100 rounded-lg flex items-center px-3 h-[35px]">
              <Search className="w-4 h-4 text-slate-500 mr-3" />
              <input 
                type="text" 
                placeholder="Pesquisar ou começar uma nova conversa" 
                className="bg-transparent border-none outline-none text-sm w-full placeholder-slate-500"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto px-1 no-scrollbar pb-1">
              <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium cursor-pointer shrink-0">Tudo</span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer shrink-0">Não lidas</span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer shrink-0">Favoritos</span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-medium cursor-pointer shrink-0">Grupos</span>
            </div>
          </div>

          {/* Lista de Conversas */}
          <div className="flex-1 overflow-y-auto">
            {/* PINNED */}
            <div className="flex items-center px-3 py-3 hover:bg-slate-50 cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white font-medium text-lg shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="ml-3 flex-1 border-b border-slate-100 pb-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-semibold text-slate-900 text-base">Central Torres - Coordenação</span>
                  <span className="text-xs text-slate-500">Ontem</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 truncate w-[220px]">Você: Atualização do relatório semanal...</span>
                  <Pin className="w-4 h-4 text-slate-400 rotate-45" />
                </div>
              </div>
            </div>

            {/* ATIVO */}
            <div className="flex items-center px-3 py-3 bg-slate-100 cursor-pointer">
              <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                TM
              </div>
              <div className="ml-3 flex-1 pb-1">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="font-semibold text-slate-900 text-base">TM SEGURANCA — Operação...</span>
                  <span className="text-xs text-emerald-600 font-medium">15:59</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center text-sm text-slate-600 w-[230px]">
                    <Camera className="w-4 h-4 mr-1 shrink-0" />
                    <span className="truncate">PERNOITE</span>
                  </div>
                  <span className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">3</span>
                </div>
              </div>
            </div>

            <ChatListItem 
              avatar="DH" avatarColor="bg-blue-600"
              name="DHL Medicamentos — Escolta SP/RJ"
              time="14:22"
              lastMsg="Início de Missão"
              read
            />

            <ChatListItem 
              avatar="ML" avatarColor="bg-red-500"
              name="Magazine Luiza — TOR-0234"
              time="15:28"
              lastMsg="PERDA DE SINAL"
              lastMsgColor="text-red-600 font-medium"
              unread={2}
              alert
            />

            <ChatListItem 
              avatar="" isUser
              name="ANDRE WILSON"
              time="16:01"
              lastMsg="Recebido, chefe. Indo agora."
              read
            />

            <ChatListItem 
              avatar="" isUser
              name="CARLOS BOLDRINI JUNIOR"
              time="15:59"
              lastMsg="Foto"
              hasIcon={<Camera className="w-4 h-4 mr-1" />}
              unread={1}
            />

            <ChatListItem 
              avatar="" isUser
              name="EDIVANDO MEDEIROS"
              time="15:28"
              lastMsg="Sem sinal aqui no túnel"
              read
            />

            <ChatListItem 
              avatar="ME" avatarColor="bg-yellow-500"
              name="Mercado Livre — Operações"
              time="11:14"
              lastMsg="Chegada no Cliente — TOR-0231"
              read
            />

            <ChatListItem 
              avatar="" isUser
              name="VITOR DE MACEDO"
              time="14:50"
              lastMsg="Confirmo recebimento da OS"
              read
            />

            <ChatListItem 
              avatar="AT" avatarColor="bg-orange-500"
              name="Atacadão — Rota Campinas"
              time="10:02"
              lastMsg="Em Trânsito ao Destino"
              read
            />

            <ChatListItem 
              avatar="" isUser
              name="VICTOR LAIATTI"
              time="13:30"
              lastMsg="Pode passar"
              read
            />

            <ChatListItem 
              avatar="B2" avatarColor="bg-purple-600"
              name="B2W — Escolta Diária"
              time="Ontem"
              lastMsg="Relatório enviado"
              read
            />

            <ChatListItem 
              avatar="" isUser
              name="RAIMUNDO FERREIRA"
              time="Ontem"
              lastMsg="Tudo certo na base"
              read
            />

            <ChatListItem 
              avatar="" isUser
              name="LUCAS PEREIRA"
              time="Ontem"
              lastMsg="Até amanhã."
              read
            />

          </div>
        </div>

        {/* COLUNA 2 - Conversa Ativa */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#efeae2] relative">
          {/* Header */}
          <div className="h-[59px] bg-slate-50 px-4 flex items-center justify-between border-b border-slate-200 shrink-0 z-10">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                TM
              </div>
              <div>
                <div className="font-semibold text-slate-900 text-base leading-tight">TM SEGURANCA — Operação Pernambuco</div>
                <div className="text-xs text-slate-500">12 participantes incluindo você</div>
              </div>
            </div>
            <div className="flex items-center gap-5 text-slate-500">
              <Video className="w-5 h-5 cursor-pointer" />
              <Phone className="w-5 h-5 cursor-pointer" />
              <div className="w-[1px] h-6 bg-slate-300"></div>
              <Search className="w-5 h-5 cursor-pointer" />
              <MoreVertical className="w-5 h-5 cursor-pointer" />
            </div>
          </div>

          {/* Background pattern */}
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none z-0" 
               style={{backgroundImage: 'url("https://static.whatsapp.net/rsrc.php/v3/yO/r/FsWUvqSoWTB.png")', backgroundRepeat: 'repeat'}}>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 z-10">
            {/* System message */}
            <div className="flex justify-center my-2">
              <div className="bg-white px-3 py-1 rounded-lg shadow-sm text-xs text-slate-600 border border-slate-100 flex items-center gap-2">
                <Check className="w-3 h-3" />
                <span className="font-medium text-slate-700">14:22</span> Início de Missão — TOR-0236
              </div>
            </div>

            {/* Other msg */}
            <div className="flex mb-1">
              <div className="bg-white rounded-lg rounded-tl-none px-2 py-1.5 shadow-sm max-w-xl pb-6 relative">
                <div className="text-[13px] font-medium text-purple-600 mb-0.5">ANDRE WILSON</div>
                <div className="text-[14.5px] leading-snug text-[#111b21]">Boa tarde a todos. Iniciando a escolta agora.</div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2">14:25</div>
              </div>
            </div>

            <div className="flex mb-1">
              <div className="bg-white rounded-lg rounded-tl-none px-2 py-1.5 shadow-sm max-w-xl pb-6 relative">
                <div className="text-[13px] font-medium text-blue-600 mb-0.5">Marcos / TM Seg.</div>
                <div className="text-[14.5px] leading-snug text-[#111b21]">Boa tarde André, equipe completa?</div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2">14:28</div>
              </div>
            </div>

            <div className="flex mb-1">
              <div className="bg-white rounded-lg rounded-tl-none px-2 py-1.5 shadow-sm max-w-xl pb-6 relative">
                <div className="text-[13px] font-medium text-purple-600 mb-0.5">ANDRE WILSON</div>
                <div className="text-[14.5px] leading-snug text-[#111b21]">Sim, eu e Carlos. Viatura UGU6E48.</div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2">14:29</div>
              </div>
            </div>

            {/* Own rich message 1 */}
            <div className="flex justify-end mb-1 mt-3">
              <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none p-1 shadow-sm w-[380px] pb-6 relative">
                <div className="w-full h-40 bg-slate-300 flex items-center justify-center rounded mb-2 overflow-hidden border border-black/5 relative">
                  <div className="absolute inset-0 bg-slate-400"></div>
                  <Camera className="w-10 h-10 text-slate-500 z-10" />
                </div>
                <div className="px-1">
                  <div className="text-[14.5px] leading-snug text-[#111b21] whitespace-pre-wrap font-mono text-xs">
                    🛡️ <span className="font-bold">TORRES VIGILÂNCIA PATRIMONIAL</span><br/>
                    🚨 <span className="font-bold">OS TOR-0236</span> | <span className="font-bold">STATUS:</span> EM TRÂNSITO DESTINO<br/><br/>
                    
                    📅 <span className="font-bold">DATA:</span> 28/05/2026   🕐 <span className="font-bold">HORA:</span> 15:46<br/>
                    🏢 <span className="font-bold">OPERAÇÃO:</span> Em Trânsito ao Destino<br/>
                    🏢 <span className="font-bold">CLIENTE:</span> TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA<br/><br/>

                    📍 <span className="font-bold">ORIGEM:</span> DHL MEDICAMENTO - Av. Júlia Gaioli, Guarulhos - SP<br/>
                    🏁 <span className="font-bold">DESTINO:</span> Jaboatão dos Guararapes, PE<br/><br/>

                    🚛 <span className="font-bold">VEÍCULO:</span> SEG5H54<br/>
                    👤 <span className="font-bold">MOTORISTA:</span> Victor Laiatti<br/><br/>

                    🚓 <span className="font-bold">VIATURA:</span> UGU6E48<br/>
                    👮 <span className="font-bold">AGENTE 01:</span> ANDRE WILSON<br/>
                    👮 <span className="font-bold">AGENTE 02:</span> CARLOS BOLDRINI<br/><br/>

                    📊 <span className="font-bold">PROGRESSO DA MISSÃO:</span> 18%<br/>
                    ✅ <span className="font-bold">MARCO:</span> EM TRÂNSITO AO DESTINO<br/>
                    📝 <span className="font-bold">ATUALIZAÇÃO:</span> RODOVIA FERNÃO DIAS<br/>
                    📍 <span className="font-bold">LOCALIZAÇÃO:</span> Rodovia Fernão Dias, km 482<br/><br/>

                    🚗 <span className="font-bold">DISTÂNCIA ATÉ DESTINO:</span> 1688 km<br/>
                    ⏱️ <span className="font-bold">PREVISÃO DE CHEGADA:</span> ~28h08
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2 flex items-center gap-1">
                  15:46 <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                </div>
              </div>
            </div>

            <div className="flex mb-1 mt-2">
              <div className="bg-white rounded-lg rounded-tl-none px-2 py-1.5 shadow-sm max-w-xl pb-6 relative">
                <div className="text-[13px] font-medium text-blue-600 mb-0.5">Marcos / TM Seg.</div>
                <div className="text-[14.5px] leading-snug text-[#111b21]">Recebido. Mantenham atualizações.</div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2">15:48</div>
              </div>
            </div>

            {/* Own rich message 2 */}
            <div className="flex justify-end mb-1 mt-3">
              <div className="bg-[#d9fdd3] rounded-lg rounded-tr-none p-1 shadow-sm w-[380px] pb-6 relative">
                <div className="w-full h-40 bg-slate-300 flex items-center justify-center rounded mb-2 overflow-hidden border border-black/5 relative">
                  <div className="absolute inset-0 bg-slate-400"></div>
                  <Camera className="w-10 h-10 text-slate-500 z-10" />
                </div>
                <div className="px-1">
                  <div className="text-[14.5px] leading-snug text-[#111b21] whitespace-pre-wrap font-mono text-xs">
                    🛡️ <span className="font-bold">TORRES VIGILÂNCIA PATRIMONIAL</span><br/>
                    🚨 <span className="font-bold">OS TOR-0236</span> | <span className="font-bold">STATUS:</span> PERNOITE<br/><br/>
                    
                    📅 <span className="font-bold">DATA:</span> 28/05/2026   🕐 <span className="font-bold">HORA:</span> 15:59<br/>
                    🏢 <span className="font-bold">OPERAÇÃO:</span> Pernoite<br/>
                    🏢 <span className="font-bold">CLIENTE:</span> TM SEGURANCA CONSULTORIA & TECNOLOGIA INTEGRADA<br/><br/>

                    📊 <span className="font-bold">PROGRESSO DA MISSÃO:</span> 20%<br/>
                    ✅ <span className="font-bold">MARCO:</span> PERNOITE<br/>
                    📝 <span className="font-bold">ATUALIZAÇÃO:</span> POSTO GRAAL<br/>
                    📍 <span className="font-bold">LOCALIZAÇÃO:</span> Rodovia Fernão Dias, km 410<br/><br/>

                    🚗 <span className="font-bold">DISTÂNCIA ATÉ DESTINO:</span> 1616 km<br/>
                    ⏱️ <span className="font-bold">PREVISÃO DE CHEGADA:</span> ~27h00
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2 flex items-center gap-1">
                  15:59 <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                </div>
              </div>
            </div>

            <div className="flex mb-1 mt-2 pb-6">
              <div className="bg-white rounded-lg rounded-tl-none px-2 py-1.5 shadow-sm max-w-xl pb-6 relative">
                <div className="text-[13px] font-medium text-blue-600 mb-0.5">Marcos / TM Seg.</div>
                <div className="text-[14.5px] leading-snug text-[#111b21]">Ok, podem pernoitar. Reportem ao acordar.</div>
                <div className="text-[11px] text-slate-500 absolute bottom-1 right-2">16:00</div>
              </div>
            </div>
            
          </div>

          {/* Footer Input */}
          <div className="min-h-[62px] bg-slate-50 px-4 py-2 flex items-center gap-3 border-t border-slate-200 shrink-0 z-10">
            <Smile className="w-6 h-6 text-slate-500 cursor-pointer" />
            <Paperclip className="w-6 h-6 text-slate-500 cursor-pointer" />
            <div className="flex-1 bg-white rounded-lg flex items-center px-3 py-2 border border-slate-200 shadow-sm">
              <input 
                type="text" 
                placeholder="Digite uma mensagem" 
                className="w-full bg-transparent border-none outline-none text-[15px]"
              />
            </div>
            <Mic className="w-6 h-6 text-slate-500 cursor-pointer" />
          </div>
        </div>

        {/* COLUNA 3 - Painel Info (360px) */}
        <div className="w-[360px] flex flex-col border-l border-slate-200 bg-slate-50 shrink-0 overflow-y-auto">
          {/* Header Right */}
          <div className="h-[59px] bg-white px-4 flex items-center gap-4 border-b border-slate-200 shrink-0">
            <ArrowLeft className="w-5 h-5 text-slate-500 cursor-pointer" />
            <div className="font-semibold text-slate-900">Dados do grupo</div>
          </div>

          <div className="flex flex-col items-center bg-white pt-8 pb-5 px-4 mb-2 shadow-sm">
            <div className="w-48 h-48 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-6xl mb-4 shadow-md">
              TM
            </div>
            <h2 className="text-xl font-medium text-slate-900 text-center leading-tight mb-1">TM SEGURANCA — Operação Pernambuco</h2>
            <div className="text-sm text-slate-500 mb-4">Grupo · 12 participantes</div>
            <div className="flex gap-6 text-slate-600">
              <div className="flex flex-col items-center cursor-pointer hover:text-emerald-600 transition-colors">
                <Video className="w-6 h-6 mb-2" />
                <span className="text-xs">Vídeo</span>
              </div>
              <div className="flex flex-col items-center cursor-pointer hover:text-emerald-600 transition-colors">
                <Phone className="w-6 h-6 mb-2" />
                <span className="text-xs">Áudio</span>
              </div>
              <div className="flex flex-col items-center cursor-pointer hover:text-emerald-600 transition-colors">
                <Search className="w-6 h-6 mb-2" />
                <span className="text-xs">Buscar</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 mb-2 shadow-sm">
            <div className="text-sm text-emerald-600 font-medium mb-1 cursor-pointer">Adicionar descrição do grupo</div>
            <div className="text-xs text-slate-500">Criado por Central Torres, 25/05/2026</div>
          </div>

          <div className="bg-white p-4 mb-2 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm text-slate-500 font-medium">Mídia, links e docs</div>
              <div className="text-xs text-slate-400 flex items-center gap-1 cursor-pointer">
                8 <ChevronRight className="w-3 h-3" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="w-[100px] h-[100px] bg-slate-200 rounded flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div className="w-[100px] h-[100px] bg-slate-200 rounded flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-slate-400" />
              </div>
              <div className="w-[100px] h-[100px] bg-slate-200 rounded flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="bg-white px-4 py-3 mb-2 shadow-sm flex justify-between items-center cursor-pointer hover:bg-slate-50">
            <span className="text-[15px] text-slate-800">Silenciar notificações</span>
            <div className="w-10 h-5 bg-slate-300 rounded-full relative">
              <div className="w-4 h-4 bg-white rounded-full absolute left-0.5 top-0.5 shadow"></div>
            </div>
          </div>

          <div className="bg-white mb-2 shadow-sm py-2">
            <div className="px-4 py-2 flex justify-between items-center">
              <span className="text-sm text-slate-500 font-medium">12 participantes</span>
              <Search className="w-4 h-4 text-slate-500 cursor-pointer" />
            </div>
            
            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1 border-b border-slate-100 pb-3 -mb-3">
                <div className="font-normal text-slate-900">Adicionar participante</div>
              </div>
            </div>

            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 border-b border-slate-100 pb-3 -mb-3 flex justify-between items-center">
                <div className="font-normal text-slate-900">Você</div>
                <div className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Admin do grupo</div>
              </div>
            </div>

            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 border-b border-slate-100 pb-3 -mb-3">
                <div className="font-normal text-slate-900">Marcos / TM Seg.</div>
                <div className="text-xs text-slate-500 truncate w-48">Cliente Contratante</div>
              </div>
            </div>

            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 border-b border-slate-100 pb-3 -mb-3 flex justify-between items-center">
                <div>
                  <div className="font-normal text-slate-900">Central Torres - Coordenação</div>
                  <div className="text-xs text-slate-500 truncate w-48">Monitoramento</div>
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Admin</div>
              </div>
            </div>

            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 border-b border-slate-100 pb-3 -mb-3">
                <div className="font-normal text-slate-900">ANDRE WILSON</div>
                <div className="text-xs text-slate-500 truncate w-48">Agente 01</div>
              </div>
            </div>

            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 border-b border-slate-100 pb-3 -mb-3">
                <div className="font-normal text-slate-900">CARLOS BOLDRINI</div>
                <div className="text-xs text-slate-500 truncate w-48">Agente 02</div>
              </div>
            </div>

            <div className="flex items-center px-4 py-3 hover:bg-slate-50 cursor-pointer gap-3 mt-1">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1 pb-1">
                <div className="font-normal text-slate-900">Victor Laiatti</div>
                <div className="text-xs text-slate-500 truncate w-48">Motorista do caminhão</div>
              </div>
            </div>
            
            <div className="px-4 py-3 text-emerald-600 text-[15px] cursor-pointer hover:bg-slate-50">
              Ver todos (12)
            </div>
          </div>

          <div className="bg-white mb-2 shadow-sm py-2">
            <div className="px-4 py-3 text-red-500 text-[15px] cursor-pointer hover:bg-slate-50 flex items-center gap-4 font-medium">
              <ArrowLeft className="w-5 h-5 rotate-180" />
              Sair do grupo
            </div>
            <div className="px-4 py-3 text-red-500 text-[15px] cursor-pointer hover:bg-slate-50 flex items-center gap-4 font-medium">
              <AlertTriangle className="w-5 h-5" />
              Denunciar grupo
            </div>
          </div>

          <div className="h-10 shrink-0"></div>
        </div>

      </div>
    </div>
  );
}

function ChatListItem({ avatar, avatarColor, name, time, lastMsg, unread, read, hasIcon, isUser, lastMsgColor, alert }: any) {
  return (
    <div className="flex items-center px-3 py-3 hover:bg-slate-50 cursor-pointer border-b border-transparent">
      {isUser ? (
        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
          <User className="w-6 h-6 text-slate-400" />
        </div>
      ) : (
        <div className={`w-12 h-12 rounded-full ${avatarColor || 'bg-slate-400'} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
          {avatar}
        </div>
      )}
      
      <div className="ml-3 flex-1 border-b border-slate-100 pb-3 -mb-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className={`font-medium text-[15px] ${alert ? 'text-slate-900' : 'text-slate-900'} truncate w-[210px]`}>{name}</span>
          <span className={`text-xs ${unread ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>{time}</span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center text-sm text-slate-600 w-[230px]">
            {read && <CheckCheck className="w-4 h-4 text-blue-500 mr-1 shrink-0" />}
            {hasIcon}
            {alert && <AlertTriangle className="w-3.5 h-3.5 text-red-500 mr-1 shrink-0" />}
            <span className={`truncate ${lastMsgColor || ''}`}>{lastMsg}</span>
          </div>
          {unread && (
            <span className="bg-emerald-500 text-white rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[10px] font-bold">
              {unread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
