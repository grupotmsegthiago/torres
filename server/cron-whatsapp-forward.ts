import cron from "node-cron";
import { supabaseAdmin } from "./supabase.js";
import { sendImageWithCaption, isZapiConfigured, getConnectionStatus, type ZapiConnectionStatus } from "./lib/zapi.js";
import { isStoragePath, signMissionPhoto } from "./lib/mission-photos.js";
import { decodeBase64Image, watermarkToDataUrl } from "./lib/photo-watermark.js";
import { haversineDist } from "./routes/_helpers.js";
import { nominatimReverseGeocode } from "./db-init.js";

const TAG = "[whatsapp-forward-cron]";

// Baixa os bytes de uma imagem (signed URL do storage ou URL pública) p/ buffer,
// usado pela marca d'água. Cap de 8MB pra evitar surpresa de memória.
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`fetch foto ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength > 8 * 1024 * 1024) throw new Error(`foto grande demais (${ab.byteLength}b)`);
  return Buffer.from(ab);
}
// Janela de recuperação: encaminha updates pendentes das últimas N min. Serve
// pra resistir a quedas curtas (Z-API fora, cron parado por event loop saturado,
// restart): ao voltar, o robô recupera sozinho o que ficou pendente nesse período.
// O anti-spam é o THROTTLE_PER_GROUP_MIN (1 msg/3min por grupo), não a janela.
// Decisão do dono 23/06/2026: aumentar de 15→120 min p/ resistir a quedas.
// (O backlog histórico anterior a essa mudança foi marcado como ignorado via
// .local/test_skip_forward_backlog.mts, pra não ser reenviado.)
const LOOKBACK_MIN = 120;
const MAX_PER_RUN = 10;
const CLAIM_STALE_MIN = 5;
// Anti-spam: no máximo 1 msg a cada N min por grupo de cliente.
// Se já enviou recente, o claim é liberado pro próximo ciclo do cron.
// Combinado com LOOKBACK_MIN=15: no pior caso 5 msgs/15min por cliente.
const THROTTLE_PER_GROUP_MIN = 3;

let running = false;

// Só esses marcos da missão vão pro grupo do cliente.
// Qualquer outro mission_step (foto de arma, viatura, dados do motorista, etc.)
// fica visível só internamente — não polui o grupo do cliente.
// Decisão 28/05/2026: incluir também atualizações de TRÂNSITO (texto livre + foto
// que o vigilante manda durante a viagem). O throttle de 3min/grupo evita spam.
const FORWARDABLE_STEPS: Record<string, string> = {
  // 5 marcos formais da missão
  checkin_chegada_km: "Chegada na Origem",
  iniciar_missao: "Início de Missão",
  checkout_km_saida: "Em Deslocamento para o Destino",
  chegada_destino: "Chegada no Cliente",
  finalizada: "Fim de Missão",
  // Atualizações de trânsito (texto livre durante a viagem)
  deslocamento_inicio: "Deslocamento ao Início",
  em_transito: "Em Trânsito",
  em_transito_destino: "Em Trânsito ao Destino",
  em_apoio: "Em Apoio",
  pernoite: "Pernoite",
};

// Uma mission_update com FOTO só é encaminhada como card (foto + form + marca
// d'água) por este cron quando seu mission_step está em FORWARDABLE_STEPS. Fora
// dessa lista (ex.: status genérico tipo "aguardando"), o cron NÃO encaminha —
// quem precisa decidir "o cron vai mandar o card?" deve usar este helper pra
// não dropar a resposta silenciosamente (ver fulfillGroupRequests).
export function isForwardableStep(step?: string | null): boolean {
  return Object.prototype.hasOwnProperty.call(FORWARDABLE_STEPS, String(step || ""));
}

const MISSION_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  aceita: "Aceita",
  deslocamento_inicio: "Deslocamento ao Início",
  no_local_origem: "No Local de Origem",
  em_transito: "Em Trânsito",
  em_transito_destino: "Em Trânsito Destino",
  no_local_destino: "No Local de Destino",
  em_apoio: "Em Apoio",
  pernoite: "Pernoite",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
  recusada: "Recusada",
};

// A foto de "KM Final" (hodômetro no destino) marca o fim prático da missão
// para o grupo do cliente. Ela chega com mission_step="chegada_destino" e o
// step "finalizada" não carrega foto (logo nunca é encaminhado). Sem isso, o
// card de KM Final sairia no formato COMPLETO (com progresso/distância/previsão,
// que não fazem mais sentido após o fim). Decisão do dono (29/05/2026): card de
// KM Final deve sair no formato RESUMIDO (buildFinalizedSummary).
export function isFinalKmUpdate(message?: string | null): boolean {
  // Casa só a legenda de foto gerada pelo app: "📷 Foto: KM Final — KM N".
  // Exige o prefixo "foto:" + boundary depois de "final" pra não disparar em
  // texto livre do agente ("km finalizado", "sem km final", etc.).
  return /foto:\s*km\s*final\b/i.test(String(message || ""));
}

// Uma update é "card de finalização" (Fim de Missão) quando é o step formal
// "finalizada" OU a foto de "KM Final" (que chega como chegada_destino e é, na
// prática, o fim da missão pro grupo do cliente).
export function isFinalCardUpdate(step?: string | null, message?: string | null): boolean {
  return String(step || "") === "finalizada" || isFinalKmUpdate(message);
}

// Trava de finalização: decide se a OS JÁ teve um card de "Fim de Missão"
// encaminhado. Recebe SÓ updates já enviadas com sucesso (whatsapp_forwarded_at
// preenchido e SEM erro) e diferentes da update atual. Se qualquer uma delas for
// um card de finalização, a atual é duplicata e não deve reenviar.
// Motivo: o app pode registrar a finalização em duplicata (duplo-toque / refluxo
// offline), gerando várias mission_updates de "KM Final"; o dedup padrão é por
// linha (whatsapp_forwarded_at), não por OS, então cada linha viraria um card.
export function alreadyForwardedFinal(
  priorSentUpdates: Array<{ mission_step?: string | null; message?: string | null }>,
): boolean {
  return (priorSentUpdates || []).some((p) => isFinalCardUpdate(p.mission_step, p.message));
}

function fmtMissionStatus(s?: string | null): string {
  if (!s) return "";
  const key = String(s).toLowerCase().trim();
  if (MISSION_STATUS_LABEL[key]) return MISSION_STATUS_LABEL[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmtBrtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  } catch { return ""; }
}
function fmtBrtTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch { return ""; }
}
function fmtBrtDateTime(iso?: string | null): string {
  const d = fmtBrtDate(iso);
  const t = fmtBrtTime(iso);
  if (d && t) return `${d}, ${t}`;
  return d || t || "—";
}
function fmtKm(km?: number | null): string {
  if (km == null || !isFinite(Number(km)) || Number(km) <= 0) return "—";
  return `${Number(km).toLocaleString("pt-BR")} km`;
}
function fmtEta(km: number): string {
  if (!isFinite(km) || km <= 0) return "Chegando";
  const totalMin = Math.round((km / 60) * 60); // 60 km/h média
  if (totalMin < 60) return `~${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `~${h}h` : `~${h}h${String(m).padStart(2, "0")}`;
}
// Data/hora BRT no formato "DD/MM/AAAA HH:MM" (sem vírgula) — usado no card de
// Fim de Missão conforme layout pedido pelo dono.
function fmtBrtDtSpace(iso?: string | null): string {
  const d = fmtBrtDate(iso);
  const t = fmtBrtTime(iso);
  if (d && t) return `${d} ${t}`;
  return d || t || "—";
}
// KM com sufixo "KM" maiúsculo (ex.: "14.219 KM"); "—" quando ausente/zero.
function fmtKmUpper(km?: number | null): string {
  if (km == null || !isFinite(Number(km)) || Number(km) <= 0) return "—";
  return `${Number(km).toLocaleString("pt-BR")} KM`;
}
// Duração entre dois timestamps no formato "Xh YYmin" (usa o delta puro, então
// é independente de timezone). "—" quando faltar uma ponta ou o delta for <= 0.
function fmtDuracao(aIso?: string | null, bIso?: string | null): string {
  if (!aIso || !bIso) return "—";
  const ms = new Date(bIso).getTime() - new Date(aIso).getTime();
  if (!isFinite(ms) || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}min`;
}
// Extrai a CIDADE de um endereço completo ("..., Campinas - SP, Brasil" → "Campinas").
// Procura o segmento no formato "Cidade - UF"; se não achar, usa o último
// segmento não vazio (ignorando "Brasil"). Retorna "" se não der pra extrair.
export function cidadeFromAddr(addr?: string | null): string {
  if (!addr) return "";
  const parts = String(addr).split(",").map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(.+?)\s*-\s*[A-Z]{2}$/);
    if (m) return m[1].trim();
  }
  const noBrasil = parts.filter(p => !/^brasil$/i.test(p));
  return noBrasil[noBrasil.length - 1] || parts[0] || "";
}
// Rota resumida "Origem → Destino" por cidade; cai pro endereço cru se não der
// pra extrair a cidade; "" se não houver origem nem destino.
export function rotaCidades(origin?: string | null, destination?: string | null): string {
  const co = cidadeFromAddr(origin) || (origin ? String(origin).trim() : "");
  const cd = cidadeFromAddr(destination) || (destination ? String(destination).trim() : "");
  if (co && cd) return `${co} → ${cd}`;
  return co || cd || "";
}

// Converte uma coordenada (number ou string) em number; NaN se inválida/ausente.
export function parseCoord(raw: any): number {
  if (raw == null || raw === "") return NaN;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : NaN;
}

// Monta o link do Google Maps para uma coordenada.
export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(4)},${lng.toFixed(4)}&z=17&hl=pt-BR`;
}

// Escolhe o PRIMEIRO par de coordenadas válido de uma lista de candidatos,
// na ordem em que são passados (ordem = prioridade). Retorna null se nenhum servir.
export function pickCoords(
  ...candidates: Array<{ lat: any; lng: any } | null | undefined>
): { lat: number; lng: number } | null {
  for (const c of candidates) {
    if (!c) continue;
    const lat = parseCoord(c.lat);
    const lng = parseCoord(c.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

// Resolve a MELHOR localização conhecida para uma update da missão, garantindo
// que o card do cliente nunca saia sem o link de localização.
// Prioridade: (1) GPS da própria update → (2) última posição do breadcrumb da OS
// (mission_positions) → (3) última update da OS que tinha coordenadas.
// Decisão do dono (20/06/2026): localização é obrigatória, não pode faltar.
export async function resolveLivePosition(u: any, soId?: number | null): Promise<{ lat: number; lng: number } | null> {
  const fromUpdate = pickCoords({ lat: u?.latitude, lng: u?.longitude });
  if (fromUpdate) return fromUpdate;
  if (!soId) return null;

  // Fallback 1: última posição do rastreamento da OS.
  try {
    const { data } = await supabaseAdmin
      .from("mission_positions")
      .select("latitude, longitude")
      .eq("service_order_id", soId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fromPos = pickCoords({ lat: (data as any)?.latitude, lng: (data as any)?.longitude });
    if (fromPos) return fromPos;
  } catch (e: any) {
    console.warn(`${TAG} resolveLivePosition: falha em mission_positions OS=${soId}:`, e?.message || e);
  }

  // Fallback 2: última mission_update da OS que carregava coordenadas.
  try {
    const { data } = await supabaseAdmin
      .from("mission_updates")
      .select("latitude, longitude")
      .eq("service_order_id", soId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fromPrev = pickCoords({ lat: (data as any)?.latitude, lng: (data as any)?.longitude });
    if (fromPrev) return fromPrev;
  } catch (e: any) {
    console.warn(`${TAG} resolveLivePosition: falha em mission_updates OS=${soId}:`, e?.message || e);
  }

  return null;
}

export async function buildRichCaption(u: any, so: any, client: any, stepLabel?: string | null): Promise<string> {
  // Localização é obrigatória no card do cliente: se a update não trouxe GPS,
  // cai na última posição conhecida da OS (rastreamento / update anterior).
  const pos = await resolveLivePosition(u, u?.service_order_id ?? so?.id);
  const upLat = pos ? pos.lat : NaN;
  const upLng = pos ? pos.lng : NaN;
  const hasGeo = pos != null;

  // Lookups paralelos: viatura + agentes + reverse-geocode
  const vehicleP = so?.vehicle_id
    ? supabaseAdmin.from("vehicles").select("plate").eq("id", so.vehicle_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const ag1P = so?.assigned_employee_id
    ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const ag2P = so?.assigned_employee_2_id
    ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_2_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const addrP = hasGeo ? nominatimReverseGeocode(upLat, upLng).catch(() => null) : Promise.resolve(null);

  const [vehRes, ag1Res, ag2Res, addr] = await Promise.all([vehicleP, ag1P, ag2P, addrP]);
  const viaturaPlate = (vehRes as any)?.data?.plate;
  // Privacidade no grupo do cliente: só primeiro + segundo nome do agente.
  const shortName = (full?: string | null): string => {
    if (!full) return "";
    const parts = String(full).trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };
  const ag1Name = shortName((ag1Res as any)?.data?.name);
  const ag2Name = shortName((ag2Res as any)?.data?.name);

  // Progresso + distância restante (precisa origin/destination lat/lng + posição atual)
  let progressoPct: number | null = null;
  let distRestKm: number | null = null;
  const oLat = so?.origin_lat != null ? Number(so.origin_lat) : NaN;
  const oLng = so?.origin_lng != null ? Number(so.origin_lng) : NaN;
  const dLat = so?.destination_lat != null ? Number(so.destination_lat) : NaN;
  const dLng = so?.destination_lng != null ? Number(so.destination_lng) : NaN;
  if (hasGeo && isFinite(dLat) && isFinite(dLng)) {
    distRestKm = haversineDist(upLat, upLng, dLat, dLng) / 1000;
  }
  if (hasGeo && isFinite(oLat) && isFinite(oLng) && isFinite(dLat) && isFinite(dLng)) {
    const total = haversineDist(oLat, oLng, dLat, dLng);
    const done = haversineDist(oLat, oLng, upLat, upLng);
    if (total > 0) {
      const pct = Math.round((done / total) * 100);
      progressoPct = Math.max(0, Math.min(99, pct));
    }
  }

  const dataStr = fmtBrtDate(u.created_at);
  const horaStr = fmtBrtTime(u.created_at);
  const statusLabel = fmtMissionStatus(so?.mission_status).toUpperCase();
  const opLabel = fmtMissionStatus(so?.mission_status);
  const clienteNome = String(client?.name || "").toUpperCase();
  const msgUpper = String(u.message || "").toUpperCase();

  const L: string[] = [];
  L.push(`🛡️ *TORRES VIGILÂNCIA PATRIMONIAL*`);
  L.push(`🚨 *OS ${u.os_number || ""}* | *STATUS:* ${statusLabel || "—"}`);
  L.push("");
  if (dataStr || horaStr) L.push(`📅 *DATA:* ${dataStr}   🕐 *HORA:* ${horaStr}`);
  if (clienteNome) L.push(`🏢 *CLIENTE:* ${clienteNome}`);
  L.push("");
  if (so?.origin) L.push(`📍 *ORIGEM:* ${so.origin}`);
  if (so?.destination) L.push(`🏁 *DESTINO:* ${so.destination}`);
  L.push("");
  if (so?.escorted_vehicle_plate) L.push(`🚛 *VEÍCULO:* ${so.escorted_vehicle_plate}`);
  if (so?.escorted_driver_name) L.push(`👤 *MOTORISTA:* ${so.escorted_driver_name}`);
  if (so?.escorted_driver_phone) L.push(`📞 *CONTATO:* ${so.escorted_driver_phone}`);
  L.push("");
  if (viaturaPlate) L.push(`🚓 *VIATURA:* ${viaturaPlate}`);
  if (ag1Name) L.push(`👮 *AGENTE 01:* ${ag1Name}`);
  if (ag2Name) L.push(`👮 *AGENTE 02:* ${ag2Name}`);
  L.push("");
  if (progressoPct != null) L.push(`📊 *PROGRESSO DA MISSÃO:* ${progressoPct}%`);
  if (distRestKm != null) L.push(`🚗 *DISTÂNCIA ATÉ DESTINO:* ${Math.round(distRestKm)} km`);
  if (distRestKm != null) L.push(`⏱️ *PREVISÃO DE CHEGADA:* ${fmtEta(distRestKm)}`);
  L.push("");
  if (msgUpper) L.push(`📝 *ATUALIZAÇÃO:* ${msgUpper}`);
  L.push("");
  if (addr) L.push(`📍 *LOCALIZAÇÃO:* ${addr}`);
  if (hasGeo) {
    L.push(`📍 *LINK GOOGLE:*`);
    L.push(mapsLink(upLat, upLng));
  }

  // Compacta múltiplas linhas em branco consecutivas
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Resumo enxuto enviado no grupo do cliente quando a missão é FINALIZADA.
// Substitui o card grande (com distância/previsão, que não fazem sentido após o fim).
// Todos os valores são preenchidos automaticamente a partir dos dados da missão.
export async function buildFinalizedSummary(u: any, so: any, client: any): Promise<string> {
  const soId = u.service_order_id;

  // Linha do tempo: chegada na origem + início de operação + chegada no destino vêm dos mission_updates.
  const updsP = supabaseAdmin
    .from("mission_updates")
    .select("mission_step, created_at")
    .eq("service_order_id", soId)
    .in("mission_step", ["checkin_chegada_km", "iniciar_missao", "chegada_destino"])
    .order("created_at", { ascending: true });
  // KM início/final vêm das fotos de hodômetro.
  const photosP = supabaseAdmin
    .from("mission_photos")
    .select("step, km_value, created_at")
    .eq("service_order_id", soId)
    .in("step", ["km_saida", "km_final"])
    .order("created_at", { ascending: true });
  // STATUS = última MENSAGEM REAL do agente (texto livre, já corrigido por IA).
  // O update que dispara o card é um marcador do sistema ("🔄 Finalizada" ou
  // "📷 Foto: KM Final"), então buscamos a última mensagem genuína à parte.
  const msgsP = supabaseAdmin
    .from("mission_updates")
    .select("message, created_at")
    .eq("service_order_id", soId)
    .not("message", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  // Viatura (placa) + agentes 01/02 p/ identificar a equipe no card do cliente.
  const vehicleP = so?.vehicle_id
    ? supabaseAdmin.from("vehicles").select("plate").eq("id", so.vehicle_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const ag1P = so?.assigned_employee_id
    ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_id).maybeSingle()
    : Promise.resolve({ data: null } as any);
  const ag2P = so?.assigned_employee_2_id
    ? supabaseAdmin.from("employees").select("name").eq("id", so.assigned_employee_2_id).maybeSingle()
    : Promise.resolve({ data: null } as any);

  const [updsRes, photosRes, msgsRes, vehRes, ag1Res, ag2Res] = await Promise.all([updsP, photosP, msgsP, vehicleP, ag1P, ag2P]);
  if ((updsRes as any)?.error) console.warn(`${TAG} resumo: falha ao ler mission_updates OS=${u.os_number}:`, (updsRes as any).error.message);
  if ((photosRes as any)?.error) console.warn(`${TAG} resumo: falha ao ler mission_photos OS=${u.os_number}:`, (photosRes as any).error.message);
  const upds = ((updsRes as any)?.data || []) as Array<{ mission_step: string; created_at: string }>;
  const photos = ((photosRes as any)?.data || []) as Array<{ step: string; km_value: number | null; created_at: string }>;
  const msgs = ((msgsRes as any)?.data || []) as Array<{ message: string; created_at: string }>;

  const inicioOperTs = so?.mission_started_at || upds.find(x => x.mission_step === "iniciar_missao")?.created_at || null;
  const fimOperTs = so?.completed_date || u.created_at || null;
  const agendamentoTs = so?.scheduled_date || null;
  const chegadaDestinoTs = upds.find(x => x.mission_step === "chegada_destino")?.created_at || null;

  const kmInicio = photos.find(p => p.step === "km_saida")?.km_value ?? null;
  const kmFinal = [...photos].reverse().find(p => p.step === "km_final")?.km_value ?? null;

  // Privacidade no grupo do cliente: só primeiro + segundo nome do agente.
  const shortName = (full?: string | null): string => {
    if (!full) return "";
    const parts = String(full).trim().split(/\s+/);
    return parts.slice(0, 2).join(" ");
  };
  const ag1Name = shortName((ag1Res as any)?.data?.name);
  const ag2Name = shortName((ag2Res as any)?.data?.name);
  const viaturaPlate = (vehRes as any)?.data?.plate || null;
  const placaVeiculo = so?.escorted_vehicle_plate || null;
  const clienteNome = String(client?.name || "").toUpperCase();

  const rota = rotaCidades(so?.origin, so?.destination);
  // Localização obrigatória também no resumo final: cai na última posição
  // conhecida da OS se a update de fechamento não trouxe GPS.
  const pos = await resolveLivePosition(u, soId);
  const upLat = pos ? pos.lat : NaN;
  const upLng = pos ? pos.lng : NaN;
  const hasGeo = pos != null;

  // Chegada na origem = check-in de KM na origem (mesmo step usado no km-resumo).
  const chegadaOrigemTs = upds.find(x => x.mission_step === "checkin_chegada_km")?.created_at || null;
  const gtmNumber = so?.gtm_number ? String(so.gtm_number).trim() : "";
  const origem = so?.origin ? String(so.origin).trim() : "";
  const destino = so?.destination ? String(so.destination).trim() : "";
  const motorista = so?.escorted_driver_name ? String(so.escorted_driver_name).trim() : "";
  const fone = so?.escorted_driver_phone ? String(so.escorted_driver_phone).trim() : "";
  const cavalo = placaVeiculo; // escorted_vehicle_plate = placa do cavalo
  // Total de KM = KM final − KM inicial (só se ambos existem e final > inicial).
  const kmRodado = (kmInicio != null && kmFinal != null && Number(kmFinal) > Number(kmInicio))
    ? Number(kmFinal) - Number(kmInicio)
    : null;
  // Texto livre do agente no fechamento (vira o complemento do STATUS).
  // Ignora marcadores do sistema: "🔄 …" (avanço de etapa), "📷 …"/legenda de
  // foto de KM, e auditoria "AJUSTE MANUAL …" — só queremos a fala do agente.
  const isSystemMsg = (m: string): boolean =>
    !m || /^🔄/.test(m) || /^📷/.test(m) || isFinalKmUpdate(m) || /^ajuste manual/i.test(m);
  const agentMsg = msgs
    .map(x => String(x?.message || "").trim())
    .find(m => m && !isSystemMsg(m)) || "";
  const statusMsg = agentMsg.toUpperCase();

  const L: string[] = [];
  L.push(`*TORRES VIGILÂNCIA PATRIMONIAL*`);
  if (u.os_number) L.push(`OS TORRES - ${u.os_number}`);
  if (gtmNumber) L.push(`OS GTM - ${gtmNumber}`);
  L.push("");
  if (rota) L.push(`🛡️ *OPERAÇÃO:* ${rota}`);
  L.push("");
  if (viaturaPlate) L.push(`🚔 *VIATURA:* ${viaturaPlate}`);
  if (ag1Name) L.push(`🥷 *AGT 1:* ${ag1Name}`);
  if (ag2Name) L.push(`🥷 *AGT 2:* ${ag2Name}`);
  L.push("");
  if (clienteNome) L.push(`👔 *CLIENTE:* ${clienteNome}`);
  if (origem) L.push(`🏦 *ORIGEM:* ${origem}`);
  if (destino) L.push(`🏭 *DESTINO:* ${destino}`);
  if (motorista) L.push(`👨‍🦰 *MOTORISTA:* ${motorista}`);
  if (fone) L.push(`📞 *FONE:* ${fone}`);
  if (cavalo) L.push(`🚛 *CAVALO:* ${cavalo}`);
  L.push("");
  L.push(`🕑 *INÍCIO PREVISTO:* ${fmtBrtDateTime(agendamentoTs)}`);
  L.push(`🕑 *CHEGADA NA ORIGEM:* ${fmtBrtDateTime(chegadaOrigemTs)}`);
  L.push(`🧭 *INÍCIO DE OPERAÇÃO:* ${fmtBrtDateTime(inicioOperTs)}`);
  L.push(`🧭 *FIM DE OPERAÇÃO:* ${fmtBrtDateTime(fimOperTs)}`);
  L.push("");
  L.push(`🕑 *TOTAL DE HORAS:* ${fmtDuracao(inicioOperTs, fimOperTs)}`);
  L.push(`🚛 *TOTAL DE KM:* ${fmtKmUpper(kmRodado)}`);
  if (hasGeo) {
    L.push("");
    L.push(`📍 *LOCALIZAÇÃO:*`);
    L.push(mapsLink(upLat, upLng));
  }
  L.push("");
  L.push(statusMsg ? `🖋️ *STATUS:* CONCLUÍDA — ${statusMsg}` : `🖋️ *STATUS:* CONCLUÍDA`);

  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Resumo SOB DEMANDA: quando alguém marca/responde a conversa de uma OS pedindo
// "km final", traz só os horários e os KMs daquela OS (independe do status).
// Retorna null se a OS não for encontrada. Fail-open no chamador.
export async function buildKmResumoByOsId(soId: number): Promise<string | null> {
  const { data: so, error: soErr } = await supabaseAdmin
    .from("service_orders")
    .select("id, os_number, mission_started_at, completed_date, scheduled_date")
    .eq("id", soId)
    .maybeSingle();
  if (soErr) console.warn(`${TAG} km-resumo: falha ao ler OS id=${soId}:`, soErr.message);
  if (!so) return null;

  const updsP = supabaseAdmin
    .from("mission_updates")
    .select("mission_step, created_at")
    .eq("service_order_id", soId)
    .in("mission_step", ["checkin_chegada_km", "iniciar_missao"])
    .order("created_at", { ascending: true });
  const photosP = supabaseAdmin
    .from("mission_photos")
    .select("step, km_value, created_at")
    .eq("service_order_id", soId)
    .in("step", ["km_saida", "km_final"])
    .order("created_at", { ascending: true });

  const [updsRes, photosRes] = await Promise.all([updsP, photosP]);
  const upds = (((updsRes as any)?.data) || []) as Array<{ mission_step: string; created_at: string }>;
  const photos = (((photosRes as any)?.data) || []) as Array<{ step: string; km_value: number | null; created_at: string }>;

  const chegadaOrigemTs = upds.find(x => x.mission_step === "checkin_chegada_km")?.created_at || null;
  const inicioOperTs = (so as any).mission_started_at || upds.find(x => x.mission_step === "iniciar_missao")?.created_at || null;
  const fimOperTs = (so as any).completed_date || null;
  const inicioPrevistoTs = (so as any).scheduled_date || null;

  const kmInicio = photos.find(p => p.step === "km_saida")?.km_value ?? null;
  const kmFinal = [...photos].reverse().find(p => p.step === "km_final")?.km_value ?? null;
  const kmRodado = (kmInicio != null && kmFinal != null && Number(kmFinal) > Number(kmInicio))
    ? Number(kmFinal) - Number(kmInicio)
    : null;

  const L: string[] = [];
  L.push(`🛡️ *CENTRAL TORRES* — OS ${(so as any).os_number || `#${soId}`}`);
  L.push("");
  L.push(`🕑 *INÍCIO PREVISTO:* ${fmtBrtDateTime(inicioPrevistoTs)}`);
  L.push(`🕑 *CHEGADA NA ORIGEM:* ${fmtBrtDateTime(chegadaOrigemTs)}`);
  L.push(`🧭 *INÍCIO DE OPERAÇÃO:* ${fmtBrtDateTime(inicioOperTs)}`);
  L.push(`🧭 *FIM DE OPERAÇÃO:* ${fmtBrtDateTime(fimOperTs)}`);
  L.push("");
  L.push(`🛣️ *KM INÍCIO:* ${fmtKm(kmInicio)}`);
  L.push(`🏁 *KM FINAL:* ${fmtKm(kmFinal)}`);
  L.push(`🚗 *KM RODADO:* ${fmtKm(kmRodado)}`);

  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Busca a FOTO do KM final de uma OS (a mais recente do step "km_final").
// Retorna o data URL/base64 em photo_data + o km_value pra usar na legenda.
// Null se a OS não tiver foto de km_final. Fail-open no chamador.
export async function getKmFinalPhotoByOsId(
  soId: number,
): Promise<{ photoData: string; kmValue: number | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("mission_photos")
    .select("photo_data, km_value, created_at")
    .eq("service_order_id", soId)
    .eq("step", "km_final")
    .not("photo_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn(`${TAG} km-foto: falha ao ler mission_photos OS id=${soId}:`, error.message);
    return null;
  }
  const row = (data || [])[0] as { photo_data: string | null; km_value: number | null } | undefined;
  if (!row?.photo_data) return null;
  return { photoData: row.photo_data, kmValue: row.km_value ?? null };
}

async function claim(id: number): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MIN * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("mission_updates")
    .update({ whatsapp_forward_claimed_at: new Date().toISOString() })
    .eq("id", id)
    .is("whatsapp_forwarded_at", null)
    .or(`whatsapp_forward_claimed_at.is.null,whatsapp_forward_claimed_at.lt.${staleBefore}`)
    .select("id");
  if (error) {
    console.error(`${TAG} claim falhou id=${id}:`, error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}

async function releaseClaim(id: number, errMsg?: string): Promise<void> {
  await supabaseAdmin.from("mission_updates")
    .update({ whatsapp_forward_claimed_at: null, whatsapp_forward_error: errMsg ? errMsg.slice(0, 500) : null })
    .eq("id", id);
}

async function markDone(id: number, errMsg: string | null): Promise<void> {
  await supabaseAdmin.from("mission_updates")
    .update({ whatsapp_forwarded_at: new Date().toISOString(), whatsapp_forward_error: errMsg ? errMsg.slice(0, 500) : null })
    .eq("id", id);
}

// Decisão PURA (testável) do descarte de backlog: só descarta quando a Z-API
// CONFIRMOU (HTTP 200 no /status) que a instância está desconectada. Erro
// transitório de rede/5xx (confirmed:false) NUNCA descarta — re-tenta como antes.
export function shouldDiscardPendingForwards(status: Pick<ZapiConnectionStatus, "confirmed" | "connected">): boolean {
  return status.confirmed && !status.connected;
}

async function processPending(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!isZapiConfigured()) return;

    const cutoff = new Date(Date.now() - LOOKBACK_MIN * 60 * 1000).toISOString();
    const { data: ups, error } = await supabaseAdmin
      .from("mission_updates")
      .select("id, service_order_id, os_number, employee_name, message, photo_url, latitude, longitude, mission_step, created_at")
      .is("whatsapp_forwarded_at", null)
      .not("photo_url", "is", null)
      .not("message", "is", null)
      .in("mission_step", Object.keys(FORWARDABLE_STEPS))
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(MAX_PER_RUN);

    if (error) {
      console.error(`${TAG} query falhou:`, error.message);
      return;
    }
    if (!ups || ups.length === 0) return;

    // DESCARTE DE BACKLOG (ordem do dono 03/07/2026): se o bot está DESCONECTADO
    // (informação POSITIVA da Z-API — confirmed:true + connected:false, não um
    // erro transitório de rede), as updates pendentes são DESCARTADAS na hora
    // (marcadas como processadas com motivo), em vez de ficarem re-tentando.
    // Assim, quando o bot reconectar, nada do backlog acumulado dispara nos
    // grupos — só atualizações novas. Erro transitório do /status (confirmed:
    // false) NÃO descarta: mantém o comportamento de re-tentativa.
    const status = await getConnectionStatus();
    if (shouldDiscardPendingForwards(status)) {
      for (const u of ups as any[]) {
        if (!(await claim(u.id))) continue;
        await markDone(u.id, "descartado: bot desconectado no momento do envio (backlog não é reenviado após reconexão)");
        console.log(`${TAG} ✗ id=${u.id} OS=${u.os_number} descartado (bot desconectado)`);
      }
      return;
    }

    console.log(`${TAG} ${ups.length} candidato(s) pra processar`);

    for (const u of ups as any[]) {
      // claim atômico (anti-race entre workers/instâncias)
      if (!(await claim(u.id))) continue;

      const photoUrl: string = String(u.photo_url || "");
      const msg: string = String(u.message || "").trim();
      // Finalizada usa resumo automático (não depende do texto do agente),
      // então só a foto é obrigatória. Demais marcos ainda exigem mensagem.
      const isFinalizadaStep = String(u.mission_step || "") === "finalizada";
      const isData = photoUrl.startsWith("data:image/");
      const isPath = isStoragePath(photoUrl);
      if ((!isData && !isPath) || (!isFinalizadaStep && !msg)) {
        await markDone(u.id, "skip: foto/msg inválida");
        continue;
      }

      // Trava de finalização: só 1 card de "Fim de Missão" por OS no grupo.
      // Se a OS já teve uma update de finalização ENVIADA com sucesso
      // (whatsapp_forwarded_at preenchido E sem erro), esta é duplicata → skip.
      const isFinalizada = isFinalCardUpdate(u.mission_step, u.message);
      if (isFinalizada) {
        const { data: priorSent, error: pfErr } = await supabaseAdmin
          .from("mission_updates")
          .select("id, mission_step, message")
          .eq("service_order_id", u.service_order_id)
          .not("whatsapp_forwarded_at", "is", null)
          .is("whatsapp_forward_error", null)
          .neq("id", u.id);
        if (pfErr) {
          // erro transitório de DB → libera claim pra retentar no próximo ciclo
          await releaseClaim(u.id, `db dedup-final: ${pfErr.message}`);
          console.error(`${TAG} ⟳ id=${u.id} erro transitório DEDUP-FINAL:`, pfErr.message);
          continue;
        }
        if (alreadyForwardedFinal(priorSent || [])) {
          await markDone(u.id, "skip: fim de missão já enviado pra essa OS");
          console.log(`${TAG} ⊘ id=${u.id} OS=${u.os_number} fim de missão duplicado, pulando`);
          continue;
        }
      }

      const { data: so, error: soErr } = await supabaseAdmin.from("service_orders")
        .select("client_id, status, mission_status, origin, destination, origin_lat, origin_lng, destination_lat, destination_lng, vehicle_id, assigned_employee_id, assigned_employee_2_id, escorted_driver_name, escorted_driver_phone, escorted_vehicle_plate, gtm_number, scheduled_date, mission_started_at, completed_date")
        .eq("id", u.service_order_id).maybeSingle();
      if (soErr) {
        // erro transitório de DB → libera claim pra retentar no próximo ciclo
        await releaseClaim(u.id, `db service_orders: ${soErr.message}`);
        console.error(`${TAG} ⟳ id=${u.id} erro transitório SO:`, soErr.message);
        continue;
      }
      if (!so) {
        await markDone(u.id, "skip: OS não encontrada");
        continue;
      }
      if ((so as any).status === "recusada" || (so as any).status === "cancelada") {
        await markDone(u.id, `skip: OS ${(so as any).status}`);
        continue;
      }

      const { data: client, error: clErr } = await supabaseAdmin.from("clients")
        .select("name, whatsapp_group_id").eq("id", (so as any).client_id).maybeSingle();
      if (clErr) {
        await releaseClaim(u.id, `db clients: ${clErr.message}`);
        console.error(`${TAG} ⟳ id=${u.id} erro transitório CLIENT:`, clErr.message);
        continue;
      }
      const groupId = (client as any)?.whatsapp_group_id;
      if (!groupId) {
        await markDone(u.id, "skip: cliente sem whatsapp_group_id");
        continue;
      }

      // Throttle por grupo: se mandou msg pra esse grupo nos últimos N min,
      // libera o claim e tenta no próximo ciclo (evita spam em backlog)
      const { data: thr, error: thrErr } = await supabaseAdmin
        .from("whatsapp_group_throttle")
        .select("last_sent_at").eq("group_id", String(groupId)).maybeSingle();
      if (thrErr) {
        await releaseClaim(u.id, `db throttle: ${thrErr.message}`);
        console.error(`${TAG} ⟳ id=${u.id} erro transitório THROTTLE:`, thrErr.message);
        continue;
      }
      if (thr?.last_sent_at) {
        const elapsedMs = Date.now() - new Date(thr.last_sent_at).getTime();
        if (elapsedMs < THROTTLE_PER_GROUP_MIN * 60 * 1000) {
          const waitMin = Math.ceil((THROTTLE_PER_GROUP_MIN * 60 * 1000 - elapsedMs) / 60000);
          await releaseClaim(u.id, `throttle: aguardando ${waitMin}min`);
          console.log(`${TAG} ⏸ id=${u.id} OS=${u.os_number} → ${(client as any).name} throttle ${waitMin}min`);
          continue;
        }
      }

      const stepLabel = FORWARDABLE_STEPS[String(u.mission_step || "")] || null;
      // Resumo enxuto tanto no step "finalizada" quanto na foto de KM Final
      // (que vem como "chegada_destino" e é, na prática, o fim da missão).
      // isFinalizada já calculado acima (trava de finalização).
      let caption: string;
      try {
        caption = isFinalizada
          ? await buildFinalizedSummary(u, so, client)
          : await buildRichCaption(u, so, client, stepLabel);
      } catch (capErr: any) {
        // fallback simples se algo der ruim na montagem do caption rico
        console.warn(`${TAG} caption rico falhou id=${u.id}, usando fallback:`, capErr?.message);
        caption = `*Central Torres Vigilancia*\n\n🚨 *${u.os_number || "OS"}* — ${u.employee_name || "Agente"}\n\n${msg}`;
      }
      // Foto no storage → gera signed URL na hora (Z-API busca na hora; TTL 5min
      // é suficiente). base64 legado segue direto.
      let imageToSend = photoUrl;
      if (isPath) {
        const signed = await signMissionPhoto(photoUrl);
        if (!signed) {
          await releaseClaim(u.id, "falha ao assinar foto do storage");
          console.error(`${TAG} ⟳ id=${u.id} OS=${u.os_number}: falha ao assinar foto`);
          continue;
        }
        imageToSend = signed;
      }
      // Marca d'água Torres (logo + contatos) embutida na foto antes do envio.
      // Fail-open: qualquer falha cai na foto original (nunca segura o card).
      try {
        const srcBuf = isData ? decodeBase64Image(photoUrl) : await fetchImageBuffer(imageToSend);
        if (srcBuf && srcBuf.length > 0) {
          const wm = await watermarkToDataUrl(srcBuf);
          if (wm) imageToSend = wm;
          else console.warn(`${TAG} marca d'água payload grande id=${u.id} OS=${u.os_number}, enviando foto original`);
        }
      } catch (wmErr: any) {
        console.warn(`${TAG} marca d'água falhou id=${u.id} OS=${u.os_number}, enviando foto original:`, wmErr?.message);
      }
      try {
        const result = await sendImageWithCaption({
          groupOrPhone: String(groupId),
          imageBase64OrUrl: imageToSend,
          caption,
        });
        if (result.ok) {
          await markDone(u.id, null);
          await supabaseAdmin.from("whatsapp_group_throttle")
            .upsert({ group_id: String(groupId), last_sent_at: new Date().toISOString() }, { onConflict: "group_id" });
          console.log(`${TAG} ✓ id=${u.id} OS=${u.os_number} → ${(client as any).name} msgId=${result.messageId}`);
        } else if (result.blocked) {
          // Trava do bot (desconectado nunca confirmado / número errado):
          // estado determinístico, não transitório → DESCARTA em vez de
          // re-tentar, pra não despejar backlog no grupo quando o bot voltar.
          await markDone(u.id, `descartado: envio bloqueado pela trava do bot (${String(result.error || "").slice(0, 300)})`);
          console.log(`${TAG} ✗ id=${u.id} OS=${u.os_number} descartado (trava do bot: número errado/desconectado)`);
        } else {
          await releaseClaim(u.id, String(result.error || "erro desconhecido"));
          console.error(`${TAG} ⟳ id=${u.id} OS=${u.os_number}: ${result.error}`);
        }
      } catch (e: any) {
        await releaseClaim(u.id, String(e?.message || e));
        console.error(`${TAG} ⟳ id=${u.id} exception:`, e?.message);
      }
    }
  } finally {
    running = false;
  }
}

export function initWhatsappForwardCron(): void {
  cron.schedule("*/30 * * * * *", () => {
    processPending().catch((e) => console.error(`${TAG} crash:`, e?.message));
  });
  console.log(`${TAG} CRON ativo: a cada 30s, lookback ${LOOKBACK_MIN}min, max ${MAX_PER_RUN}/ciclo, claim TTL ${CLAIM_STALE_MIN}min, throttle ${THROTTLE_PER_GROUP_MIN}min/grupo`);
  setTimeout(() => processPending().catch(() => {}), 5000);
}
