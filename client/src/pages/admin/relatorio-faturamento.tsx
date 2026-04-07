import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { authFetch, apiRequest, invalidateRelatedQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Search, Printer, Loader2, FileSpreadsheet, ChevronDown, ChevronRight,
  Calculator, Calendar, Pencil, Save, X, Check, Receipt, Banknote,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import * as XLSX from "xlsx";
import torresLogoPath from "@assets/WhatsApp_Image_2026-03-19_at_18.10.37_1773954659471.jpeg";

const fmt = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number | null | undefined, d = 0) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const _eu = (ts: string) => /[Zz]$/.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z";
const fmtDate = (iso?: string | null) => iso ? new Date(_eu(iso)).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtTime = (iso?: string | null) => iso ? new Date(_eu(iso)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
const fmtHHMM = (h: number) => {
  if (isNaN(h) || h <= 0) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};
const fmtDateDisp = (s: string) => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const extractCity = (addr: string) => {
  if (!addr) return "—";
  const upper = addr.toUpperCase().trim();
  const parts = upper.split(/[,\-\/]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts.find(p => !/^\d/.test(p) && p.length > 2 && !/^(SP|RJ|MG|PR|SC|RS|BA|GO|MT|MS|PA|AM|CE|PE|MA|PI|RN|PB|SE|AL|TO|RO|AC|AP|RR|ES|DF)$/.test(p));
    return city || parts[0];
  }
  return parts[0] || upper;
};

export default function RelatorioFaturamentoPage() {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${(last.getMonth() + 1).toString().padStart(2, "0")}-${last.getDate().toString().padStart(2, "0")}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  });
  const [reportGenerated, setReportGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [billings, setBillings] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [faturaDialog, setFaturaDialog] = useState(false);
  const [faturaBillingType, setFaturaBillingType] = useState("BOLETO");
  const [faturaDueDate, setFaturaDueDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(15);
    return d.toISOString().split("T")[0];
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => { const r = await authFetch("/api/clients"); return r.json(); },
  });

  const { data: contracts = [] } = useQuery<any[]>({
    queryKey: ["/api/escort/contracts"],
    queryFn: async () => { const r = await authFetch("/api/escort/contracts"); return r.json(); },
  });

  const approvedBillings = useMemo(() => billings.filter(b => b.status === "APROVADA"), [billings]);
  const approvedTotal = useMemo(() => approvedBillings.reduce((acc, b) => {
    return acc + Number(b.fat_acionamento || 0) + Number(b.fat_hora_extra || 0) + Number(b.fat_km || 0) + Number(b.despesas_pedagio || 0) + Number(b.receitas_os || 0);
  }, 0), [approvedBillings]);

  const gerarFaturaMutation = useMutation({
    mutationFn: async ({ clientId, billingType, sendToAsaas, dueDate }: { clientId: number; billingType: string; sendToAsaas: boolean; dueDate: string }) => {
      return apiRequest("POST", `/api/boletim-medicao/gerar-fatura/${clientId}`, { billingType, sendToAsaas, dueDate });
    },
    onSuccess: async (response: any) => {
      const data = await response.json?.() || response;
      const count = data?.missionsCount || 0;
      const val = data?.totalValue ? fmt(data.totalValue) : "";
      toast({ title: "Fatura Gerada!", description: `${count} missão(ões) consolidada(s). ${val}` });
      setFaturaDialog(false);
      invalidateRelatedQueries("billing");
      handleGenerate();
    },
    onError: (err: Error) => toast({ title: "Erro ao gerar fatura", description: err.message, variant: "destructive" }),
  });

  const openFaturaDialog = () => {
    const clientData = clients.find((c: any) => c.id.toString() === selectedClient);
    const ptDays = Number(clientData?.payment_terms_days) || 15;
    const suggestedDate = new Date();
    suggestedDate.setDate(suggestedDate.getDate() + ptDays);
    setFaturaDueDate(suggestedDate.toISOString().split("T")[0]);
    setFaturaDialog(true);
  };

  const handleSetMonth = (v: string) => {
    setSelectedMonth(v);
    if (!v) return;
    const [y, m] = v.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    setStartDate(`${y}-${m.toString().padStart(2, "0")}-01`);
    setEndDate(`${y}-${m.toString().padStart(2, "0")}-${last.toString().padStart(2, "0")}`);
  };

  const handleSetFortnight = (p: 1 | 2) => {
    const ref = startDate ? new Date(startDate + "T12:00:00") : new Date();
    const y = ref.getFullYear(), m = ref.getMonth();
    const mm = (m + 1).toString().padStart(2, "0");
    if (p === 1) { setStartDate(`${y}-${mm}-01`); setEndDate(`${y}-${mm}-15`); }
    else { const last = new Date(y, m + 1, 0).getDate(); setStartDate(`${y}-${mm}-16`); setEndDate(`${y}-${mm}-${last}`); }
  };

  const handleGenerate = async () => {
    if (!selectedClient) { alert("Selecione um cliente."); return; }
    setIsLoading(true);
    setReportGenerated(false);
    try {
      const params = new URLSearchParams({ client_id: selectedClient, from: `${startDate}T00:00:00`, to: `${endDate}T23:59:59` });
      const [billingsRes, ordersRes, vehiclesRes] = await Promise.all([
        authFetch(`/api/escort/billings?${params}`),
        authFetch(`/api/service-orders`),
        authFetch(`/api/vehicles`),
      ]);
      const billingsData = await billingsRes.json();
      const ordersData = await ordersRes.json();
      const vehiclesData = await vehiclesRes.json();

      const ordersMap = new Map<number, any>();
      (ordersData || []).forEach((o: any) => ordersMap.set(o.id, o));
      const vehiclesMap = new Map<number, any>();
      (vehiclesData || []).forEach((v: any) => vehiclesMap.set(v.id, v));

      const approved = (billingsData || [])
        .filter((b: any) => b.status === "APROVADA" || b.status === "FATURADO" || b.status === "PAGO")
        .map((b: any) => {
          const so = ordersMap.get(b.service_order_id);
          if (so) {
            if (!b.origem && so.origin) b.origem = so.origin;
            if (!b.destino && so.destination) b.destino = so.destination;
            if (!b.placa_viatura && so.vehicleId) {
              const veh = vehiclesMap.get(so.vehicleId);
              if (veh) b.placa_viatura = veh.plate;
            }
            if (!b.placa_escoltado && so.escortedVehiclePlate) b.placa_escoltado = so.escortedVehiclePlate;
            if (!b.os_number && so.osNumber) b.os_number = so.osNumber;
            if (!b.data_missao && so.scheduledDate) b.data_missao = so.scheduledDate;
          }
          return b;
        });

      setBillings(approved);
      setReportGenerated(true);
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar relatório.");
    } finally {
      setIsLoading(false);
    }
  };

  const clientData = clients.find((c: any) => c.id.toString() === selectedClient);
  const displayClientName = clientData?.name || "";

  const getContractForBilling = (b: any) => {
    return contracts.find((c: any) => c.id === b.contract_id) || null;
  };

  const startEditBilling = (billingId: string) => {
    const b = billings.find((x: any) => x.id === billingId);
    if (!b) return;
    setEditForm({
      km_inicial: b.km_inicial || 0,
      km_final: b.km_final || 0,
      horario_inicio: b.horario_inicio || "",
      horario_fim: b.horario_fim || "",
      placa_viatura: b.placa_viatura || "",
      placa_escoltado: b.placa_escoltado || "",
      despesas_pedagio: b.despesas_pedagio || 0,
    });
    setEditingBillingId(billingId);
  };

  const saveEditBilling = async () => {
    if (!editingBillingId) return;
    setSavingEdit(true);
    try {
      const b = billings.find((x: any) => x.id === editingBillingId);
      const ct = b ? getContractForBilling(b) : null;
      const n = (v: any) => Number(v) || 0;
      const franquiaKm = n(ct?.franquia_km) || n(ct?.franquia_minima_km) || n(b?.km_franquia);
      const franquiaHoras = n(ct?.franquia_horas) || n(b?.franquia_horas);
      const valorKmExtra = n(ct?.valor_km_extra) || n(ct?.valor_km_carregado) || n(b?.valor_km_extra);
      const valorHoraExtra = n(ct?.valor_hora_extra) || n(b?.valor_hora_extra);

      const kmIni = n(editForm.km_inicial);
      const kmFin = n(editForm.km_final);
      const kmTotal = Math.max(0, kmFin - kmIni);
      const kmExcedente = Math.max(0, kmTotal - franquiaKm);
      const fatKm = Math.round(kmExcedente * valorKmExtra * 100) / 100;

      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
      let horasMissao = n(b?.horas_missao);
      if (editForm.horario_inicio && editForm.horario_fim) {
        let diff = toMin(editForm.horario_fim) - toMin(editForm.horario_inicio);
        if (diff < 0) diff += 1440;
        horasMissao = Math.round((diff / 60) * 100) / 100;
      }
      const horasExcedentes = Math.max(0, horasMissao - franquiaHoras);
      const fatHoraExtra = Math.round(horasExcedentes * valorHoraExtra * 100) / 100;

      const fatAcionamento = n(b?.fat_acionamento);
      const fatEstadia = n(b?.fat_estadia);
      const fatPernoite = n(b?.fat_pernoite);
      const fatAdicNoturno = n(b?.fat_adicional_noturno);
      const despPedagio = n(editForm.despesas_pedagio);
      const receitasOs = n(b?.receitas_os);
      const fatTotal = Math.round((fatAcionamento + fatKm + fatHoraExtra + fatEstadia + fatPernoite + fatAdicNoturno + despPedagio + receitasOs) * 100) / 100;

      const payload = {
        km_inicial: kmIni,
        km_final: kmFin,
        km_total: kmTotal,
        km_carregado: kmTotal,
        km_excedente: kmExcedente,
        km_faturado: kmTotal,
        fat_km: fatKm,
        fat_hora_extra: fatHoraExtra,
        horas_missao: horasMissao,
        horas_trabalhadas: horasMissao,
        fat_total: fatTotal,
        horario_inicio: editForm.horario_inicio || null,
        horario_fim: editForm.horario_fim || null,
        placa_viatura: editForm.placa_viatura || null,
        placa_escoltado: editForm.placa_escoltado || null,
        despesas_pedagio: despPedagio,
        valor_km_extra: fatKm,
      };

      const r = await authFetch(`/api/escort/billings/${editingBillingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("Erro ao salvar");

      setBillings(prev => prev.map(bl => bl.id === editingBillingId ? { ...bl, ...payload } : bl));
      setEditingBillingId(null);
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const getPeriodLabel = () => {
    if (!startDate || !endDate) return "";
    const sDate = new Date(startDate + "T12:00:00");
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const month = months[sDate.getMonth()];
    const year = sDate.getFullYear();
    const sDay = sDate.getDate();
    const eDate = new Date(endDate + "T12:00:00");
    const eDay = eDate.getDate();
    const lastDay = new Date(year, sDate.getMonth() + 1, 0).getDate();
    if (sDay === 1 && eDay === lastDay) return `GERAL — ${month}/${year} — MÊS COMPLETO`;
    if (sDay === 1 && eDay === 15) return `GERAL — ${month}/${year} — 1ª QUINZENA`;
    if (sDay === 16) return `GERAL — ${month}/${year} — 2ª QUINZENA`;
    return `GERAL — ${month}/${year} — ${fmtDateDisp(startDate)} A ${fmtDateDisp(endDate)}`;
  };

  const rowsData = useMemo(() => {
    return billings.map((b) => {
      const ct = getContractForBilling(b);
      const n = (v: any) => Number(v) || 0;
      const franquiaHoras = n(ct?.franquia_horas) || n(b.franquia_horas);
      const franquiaKm = n(ct?.franquia_km) || n(ct?.franquia_minima_km) || n(b.km_franquia);
      const valorHoraExtra = n(ct?.valor_hora_extra) || n(b.valor_hora_extra);
      const valorKmExtra = n(ct?.valor_km_extra) || n(ct?.valor_km_carregado) || n(b.valor_km_extra);
      const valorAcionamento = n(b.fat_acionamento) || n(ct?.valor_acionamento);
      const horasMissao = n(b.horas_missao);
      const kmTotal = n(b.km_total);
      const kmFaturado = n(b.km_faturado);
      const kmExcedente = n(b.km_excedente) || Math.max(0, kmTotal - franquiaKm);
      const hrExcedente = Math.max(0, horasMissao - franquiaHoras);

      const fatHoraExtra = n(b.fat_hora_extra) || Math.round(hrExcedente * valorHoraExtra * 100) / 100;
      const fatKmExtra = Math.round(kmExcedente * valorKmExtra * 100) / 100;
      const fatPedagio = n(b.despesas_pedagio);
      const fatTotal = n(b.fat_total);

      const osNum = b.os_number || (b.service_order_id ? `OS-${b.service_order_id}` : "—");
      const origem = b.origem || b.origin || "";
      const destino = b.destino || b.destination || "";
      const routeStr = (origem && destino) ? `${extractCity(origem)} × ${extractCity(destino)}` : (origem || destino || "—");
      const viatura = b.placa_viatura || b.vehicle_plate || "—";
      const escoltado = b.placa_escoltado || b.escorted_vehicle_plate || "—";

      const dataMissao = b.data_missao || b.created_at;

      return {
        id: osNum,
        billingId: b.id,
        route: routeStr,
        activationFee: valorAcionamento,
        franchiseHours: franquiaHoras,
        franchiseKm: franquiaKm,
        unitHr: valorHoraExtra,
        unitKm: valorKmExtra,
        startDate: fmtDate(dataMissao),
        startTime: b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTime(dataMissao),
        viatura,
        cargoPlate: escoltado,
        endDate: fmtDate(dataMissao),
        endTime: b.horario_fim ? b.horario_fim.substring(0, 5) : "—",
        kmStart: n(b.km_inicial),
        kmEnd: n(b.km_final),
        kmTotal,
        timeTotal: fmtHHMM(horasMissao),
        kmExtraQtd: kmExcedente,
        kmExtraUnit: valorKmExtra,
        kmExtraTotal: fatKmExtra,
        hrExtraQtd: hrExcedente,
        hrExtraUnit: valorHoraExtra,
        hrExtraTotal: fatHoraExtra,
        tollVal: fatPedagio,
        totalGeral: fatTotal,
        franchiseHoursFmt: fmtHHMM(franquiaHoras),
        status: b.status,
        clientName: b.client_name,
      };
    });
  }, [billings, contracts]);

  const grandTotal = useMemo(() => rowsData.reduce((s, r) => s + r.totalGeral, 0), [rowsData]);

  const handlePrint = () => {
    const printArea = document.getElementById("print-area");
    if (!printArea) return;
    const pw = window.open("", "_blank", "width=1400,height=900");
    if (!pw) { window.print(); return; }
    const cloned = printArea.cloneNode(true) as HTMLElement;
    cloned.style.cssText = "width:100%;padding:0;margin:0;overflow:visible;";
    const scrollDiv = cloned.querySelector(".report-table-scroll") as HTMLElement;
    if (scrollDiv) scrollDiv.style.cssText = "overflow:visible;max-height:none;width:100%;";
    const table = cloned.querySelector("table") as HTMLElement;
    if (table) table.style.cssText = "table-layout:auto;width:100%;border-collapse:collapse;";
    const colgroup = cloned.querySelector("colgroup");
    if (colgroup) colgroup.remove();

    const printCSS = `
      @page { size: A4 landscape; margin: 4mm 5mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 6.5pt; color: #374151; letter-spacing: 0.15px; }
      table { table-layout: auto; width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
      td, th { padding: 3px 5px; font-size: 6.5pt; border: 0.5px solid #d1d5db; line-height: 1.4; white-space: nowrap; text-align: center; vertical-align: middle; letter-spacing: 0.2px; }
      td.route-cell { white-space: normal; word-wrap: break-word; text-align: left; min-width: 80px; max-width: 160px; font-weight: 700; font-size: 5.5pt; line-height: 1.25; color: #111; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; }
      tbody tr:nth-child(odd) { background-color: #ffffff; }
      tbody tr:nth-child(even) { background-color: #f9fafb; }
      .group-hdr th { font-size: 7pt; padding: 4px 4px; font-weight: 900; letter-spacing: 0.5px; border-bottom: 1.5px solid #111; border-top: 1.5px solid #111; }
      .sub-hdr th { font-size: 5.5pt; padding: 3px 4px; font-weight: 800; border-bottom: 1px solid #374151; text-transform: uppercase; letter-spacing: 0.3px; }
      .boletim-header { margin-bottom: 4mm; text-align: center; padding-bottom: 2mm; border-bottom: 1.5px solid #111; }
      .boletim-header h1 { font-size: 13pt; margin: 0; color: #111; letter-spacing: 1px; }
      .subtitle-line { font-size: 9pt; margin: 1.5mm 0 0.5mm; color: #374151; letter-spacing: 0.3px; }
      .ref-line { font-size: 7pt; margin: 0; color: #6b7280; letter-spacing: 0.2px; }
      .sign-section { margin-top: 10mm; break-inside: avoid; display: flex; justify-content: space-between; padding: 0 10mm; border-top: 1px solid #111; padding-top: 4mm; }
      .sign-box { width: 60mm; text-align: center; }
      .digital-signature { font-size: 13pt; font-family: 'Dancing Script', 'Brush Script MT', cursive; font-weight: 700; color: #111; border-bottom: 1.5px solid #374151; padding-bottom: 1px; display: inline-block; }
      .sign-role { font-size: 7pt; font-weight: 900; text-transform: uppercase; color: #111; letter-spacing: 0.8px; margin-top: 1mm; }
      .sign-cnpj { font-size: 6pt; color: #6b7280; }
      .sign-system { font-size: 6pt; color: #9ca3af; }
      .sign-cliente { font-size: 7pt; font-weight: 900; text-transform: uppercase; color: #111; }
      .sign-data { font-size: 6pt; color: #6b7280; margin-top: 1mm; }
      tfoot tr { break-inside: avoid; border-top: 2.5px solid #111; }
      tfoot td { font-size: 7pt; font-weight: 900; padding: 4px 6px; letter-spacing: 0.3px; }
      .print-watermark { position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: 300px !important; height: auto !important; opacity: 0.06 !important; pointer-events: none !important; z-index: 0 !important; }
    `;

    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boletim de Medição — Torres</title><link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet"><style>${printCSS}</style></head><body></body></html>`);
    const wrapper = pw.document.createElement("div");
    wrapper.appendChild(cloned);
    pw.document.body.appendChild(wrapper);
    pw.document.close();
    setTimeout(() => {
      const pageW = 1045;
      const tbl = pw.document.querySelector("table");
      if (tbl && tbl.scrollWidth > pageW) {
        const scale = Math.max(pageW / tbl.scrollWidth, 0.45);
        wrapper.style.zoom = String(scale);
      }
      setTimeout(() => { pw.focus(); pw.print(); setTimeout(() => pw.close(), 2000); }, 300);
    }, 600);
  };

  const handleExportExcel = useCallback(() => {
    if (rowsData.length === 0) return;
    const wb = XLSX.utils.book_new();
    const headerGroup = ["TABELA ACORDADA", "", "", "", "", "", "", "INFORMAÇÕES DA VIAGEM", "", "", "", "", "", "KILOMETRAGEM", "", "", "HORÁRIOS", "", "", "KM EXCEDENTE", "", "", "HORA EXCEDENTE", "", "", "VALORES", ""];
    const headerSub = ["Nº", "ROTA", "VALOR", "HR FRANQ", "KM FRANQ", "HR EXTRA", "KM EXTRA", "DATA INÍCIO", "HORA INÍCIO", "VIATURA", "VEÍC. ESCOLTADO", "DATA FIM", "HORA FIM", "INICIAL", "FINAL", "TOTAL", "INICIAL", "FINAL", "TOTAL", "KM", "VALOR", "TOTAL", "HORA", "VALOR", "TOTAL", "PEDÁGIO", "TOTAL"];
    const titleRow = ["BOLETIM DE MEDIÇÃO — TORRES VIGILÂNCIA PATRIMONIAL"];
    const periodRow = [getPeriodLabel()];
    const subtitleRow = ["REFERENTE AO SERVIÇO DE ESCOLTA ARMADA"];
    const dataRows = rowsData.map(r => [
      r.id, r.route, fmt(r.activationFee), r.franchiseHoursFmt, r.franchiseKm > 0 ? fmtNum(r.franchiseKm) : "-", fmt(r.unitHr), fmt(r.unitKm),
      r.startDate, r.startTime, r.viatura, r.cargoPlate, r.endDate, r.endTime,
      r.kmStart > 0 ? fmtNum(r.kmStart) : "-", r.kmEnd > 0 ? fmtNum(r.kmEnd) : "-", r.kmTotal > 0 ? fmtNum(r.kmTotal) : "-",
      r.startTime, r.endTime, r.timeTotal,
      r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : "-", r.kmExtraQtd > 0 ? fmt(r.kmExtraUnit) : "-", r.kmExtraTotal > 0 ? fmt(r.kmExtraTotal) : "R$ 0,00",
      r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : "-", r.hrExtraQtd > 0 ? fmt(r.hrExtraUnit) : "-", r.hrExtraTotal > 0 ? fmt(r.hrExtraTotal) : "R$ 0,00",
      r.tollVal > 0 ? fmt(r.tollVal) : "R$ 0,00", fmt(r.totalGeral),
    ]);
    const totalRow = Array(27).fill("");
    totalRow[0] = "TOTAL";
    totalRow[26] = fmt(grandTotal);
    const allRows = [titleRow, periodRow, subtitleRow, [], headerGroup, headerSub, ...dataRows, [], totalRow];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 8 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 7 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const clientLabel = displayClientName || "CLIENTE";
    const periodShort = `${startDate.replace(/-/g, "")}_${endDate.replace(/-/g, "")}`;
    const fileName = `Boletim_${clientLabel.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20)}_${periodShort}.xlsx`;
    XLSX.utils.book_append_sheet(wb, ws, "Boletim");
    XLSX.writeFile(wb, fileName, { compression: true });
  }, [rowsData, grandTotal, displayClientName, startDate, endDate]);

  const fontBase = "'Inter', 'Segoe UI', system-ui, sans-serif";
  const fontMono = "'Roboto Mono', 'SF Mono', 'Consolas', monospace";

  const cellStyle: React.CSSProperties = { border: "1px solid #d1d5db", padding: "5px 7px", fontSize: "10px", fontFamily: fontBase, textAlign: "center", whiteSpace: "nowrap", color: "#374151", lineHeight: "1.45", letterSpacing: "0.2px" };
  const cellBold: React.CSSProperties = { ...cellStyle, fontWeight: 800, color: "#111827" };
  const cellMono: React.CSSProperties = { ...cellStyle, fontFamily: fontMono, fontSize: "9.5px", letterSpacing: "0.3px", color: "#1f2937" };
  const headerStyle: React.CSSProperties = { ...cellStyle, backgroundColor: "#f3f4f6", fontWeight: 800, fontSize: "8.5px", textTransform: "uppercase" as const, color: "#111", padding: "6px 7px", letterSpacing: "0.3px" };
  const groupHeaderStyle: React.CSSProperties = { border: "1px solid #000", backgroundColor: "#111", color: "#fff", fontWeight: 900, fontSize: "9.5px", textTransform: "uppercase" as const, padding: "7px 7px", letterSpacing: "0.6px", fontFamily: fontBase, textAlign: "center", whiteSpace: "nowrap", lineHeight: "1.3" };

  const bgKm = "#f8fafc";
  const bgHr = "#f1f5f9";
  const bgKmExc = "#e2e8f0";
  const bgHrExc = "#cbd5e1";
  const bgVal = "#e2e8f0";

  const hdrKm: React.CSSProperties = { ...headerStyle, backgroundColor: "#e2e8f0" };
  const hdrHr: React.CSSProperties = { ...headerStyle, backgroundColor: "#cbd5e1" };
  const hdrKmExc: React.CSSProperties = { ...headerStyle, backgroundColor: "#94a3b8", color: "#fff" };
  const hdrHrExc: React.CSSProperties = { ...headerStyle, backgroundColor: "#64748b", color: "#fff" };
  const hdrVal: React.CSSProperties = { ...headerStyle, backgroundColor: "#334155", color: "#fff" };

  const grpKm: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#334155" };
  const grpHr: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#1e293b" };
  const grpKmExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#0f172a" };
  const grpHrExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#020617" };
  const grpVal: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#000" };

  return (
    <AdminLayout>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 no-print" data-testid="billing-report-controls">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3" data-testid="heading-billing-report">
              <FileText className="text-gray-700" /> Boletim de Medição — Relatório de Faturamento
            </h2>
            <p className="text-sm text-gray-500 mt-1">Relatório detalhado para conferência e faturamento por cliente.</p>
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Cliente</label>
              <select className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-black bg-white uppercase font-bold" value={selectedClient} onChange={e => setSelectedClient(e.target.value)} data-testid="select-billing-client">
                <option value="">Selecione...</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-gray-500 uppercase block">Período</label>
                <div className="flex gap-2 items-center">
                  <input type="month" className="text-[11px] font-bold uppercase px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 outline-none cursor-pointer" value={selectedMonth} onChange={e => handleSetMonth(e.target.value)} data-testid="input-billing-month" />
                  <button onClick={() => handleSetFortnight(1)} className="text-[10px] font-black uppercase text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded border border-gray-200" data-testid="btn-fortnight-1">1ª Quinzena</button>
                  <button onClick={() => handleSetFortnight(2)} className="text-[10px] font-black uppercase text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded border border-gray-200" data-testid="btn-fortnight-2">2ª Quinzena</button>
                </div>
              </div>
              <div className="flex gap-2">
                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={startDate} onChange={e => setStartDate(e.target.value)} data-testid="input-billing-start" />
                <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white" value={endDate} onChange={e => setEndDate(e.target.value)} data-testid="input-billing-end" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleGenerate} disabled={isLoading} className="flex-1 bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-generate-report">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Gerar
              </button>
              {reportGenerated && (
                <>
                  <button onClick={handleExportExcel} className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-export-excel">
                    <FileSpreadsheet size={18} /> Excel
                  </button>
                  <button onClick={handlePrint} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-print-pdf">
                    <Printer size={18} /> PDF
                  </button>
                  <button onClick={openFaturaDialog} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2" data-testid="btn-gerar-fatura">
                    <Receipt size={18} /> Gerar Fatura {approvedBillings.length > 0 ? `(${approvedBillings.length})` : ""}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {reportGenerated && rowsData.length === 0 && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mt-4 text-center" data-testid="text-no-results">
          <p className="text-gray-400 font-bold">Nenhum boletim aprovado encontrado para o período selecionado.</p>
        </div>
      )}

      {reportGenerated && approvedBillings.length > 0 && (
        <div className="mt-4 no-print bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between" data-testid="banner-fatura-aprovadas">
          <div className="flex items-center gap-3">
            <Receipt size={20} className="text-indigo-600" />
            <div>
              <p className="text-sm font-bold text-indigo-900">
                💰 {approvedBillings.length} mediç{approvedBillings.length > 1 ? "ões" : "ão"} aprovada{approvedBillings.length > 1 ? "s" : ""} — {fmt(approvedTotal)}
              </p>
              <p className="text-xs text-indigo-600">Pronta{approvedBillings.length > 1 ? "s" : ""} para geração de fatura</p>
            </div>
          </div>
          <button
            onClick={openFaturaDialog}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
            data-testid="btn-gerar-fatura-banner"
          >
            <Banknote size={18} />
            Gerar Fatura
          </button>
        </div>
      )}

      {reportGenerated && rowsData.length > 0 && (
        <div className="mt-4 no-print bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <Calculator size={18} className="text-gray-700" />
            <span className="text-sm font-bold text-gray-700">{rowsData.length} OS &middot; Total: <span className="text-black font-black">{fmt(grandTotal)}</span></span>
          </div>
          <div className="space-y-1">
            {rowsData.map((r, i) => {
              const isExpanded = expandedRows.has(r.billingId);
              return (
                <div key={r.billingId} className={`border rounded-lg ${isExpanded ? "border-gray-300 bg-gray-50" : "border-gray-100"}`}>
                  <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedRows(prev => { const n = new Set(prev); n.has(r.billingId) ? n.delete(r.billingId) : n.add(r.billingId); return n; })} data-testid={`row-billing-${i}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown size={14} className="text-gray-600 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                      <span className="text-xs font-black text-black">{r.id}</span>
                      <span className="text-xs font-bold text-gray-500 truncate max-w-[200px]">{r.route}</span>
                      <span className="text-xs text-gray-400">{r.startDate}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-500">{r.timeTotal}h</span>
                      <span className="text-xs font-bold text-gray-500">{fmtNum(r.kmTotal)} km</span>
                      <span className="text-sm font-black text-black">{fmt(r.totalGeral)}</span>
                    </div>
                  </div>
                  {isExpanded && editingBillingId === r.billingId && (
                    <div className="px-3 pb-3 border-t border-gray-200 pt-2" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">KM Inicial</label>
                          <input type="number" value={editForm.km_inicial} onChange={e => setEditForm({...editForm, km_inicial: Number(e.target.value)})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-km-ini" />
                        </div>
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">KM Final</label>
                          <input type="number" value={editForm.km_final} onChange={e => setEditForm({...editForm, km_final: Number(e.target.value)})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-km-fin" />
                        </div>
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">Hora Início</label>
                          <input type="time" value={editForm.horario_inicio?.substring(0,5) || ""} onChange={e => setEditForm({...editForm, horario_inicio: e.target.value})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-hr-ini" />
                        </div>
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">Hora Fim</label>
                          <input type="time" value={editForm.horario_fim?.substring(0,5) || ""} onChange={e => setEditForm({...editForm, horario_fim: e.target.value})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-hr-fim" />
                        </div>
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">Placa Viatura</label>
                          <input type="text" value={editForm.placa_viatura} onChange={e => setEditForm({...editForm, placa_viatura: e.target.value.toUpperCase()})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-viatura" />
                        </div>
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">Placa Escoltado</label>
                          <input type="text" value={editForm.placa_escoltado} onChange={e => setEditForm({...editForm, placa_escoltado: e.target.value.toUpperCase()})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-escoltado" />
                        </div>
                        <div>
                          <label className="text-gray-400 font-bold block mb-0.5">Pedágio (R$)</label>
                          <input type="number" step="0.01" value={editForm.despesas_pedagio} onChange={e => setEditForm({...editForm, despesas_pedagio: Number(e.target.value)})} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" data-testid="input-edit-pedagio" />
                        </div>
                        <div className="flex items-end gap-1">
                          <button onClick={saveEditBilling} disabled={savingEdit} className="flex items-center gap-1 px-3 py-1 bg-black text-white rounded text-xs font-bold hover:bg-gray-800 disabled:opacity-50" data-testid="button-save-edit">
                            {savingEdit ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
                          </button>
                          <button onClick={() => setEditingBillingId(null)} className="flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold hover:bg-gray-300" data-testid="button-cancel-edit">
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      </div>
                      {editForm.km_final > editForm.km_inicial && (
                        <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-3">
                          <span>KM Total: <strong>{editForm.km_final - editForm.km_inicial}</strong></span>
                          <span>Franquia: <strong>{r.franchiseKm}</strong></span>
                          <span>Excedente: <strong>{Math.max(0, (editForm.km_final - editForm.km_inicial) - r.franchiseKm)} km</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                  {isExpanded && editingBillingId !== r.billingId && (
                    <div className="px-3 pb-3 border-t border-gray-200 pt-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div><span className="text-gray-400 font-bold">Acionamento:</span> <span className="font-black">{fmt(r.activationFee)}</span></div>
                        <div><span className="text-gray-400 font-bold">Franquia:</span> <span className="font-black">{r.franchiseHoursFmt}h / {fmtNum(r.franchiseKm)} km</span></div>
                        <div><span className="text-gray-400 font-bold">KM Excedente:</span> <span className="font-black">{fmtNum(r.kmExtraQtd)} km = {fmt(r.kmExtraTotal)}</span></div>
                        <div><span className="text-gray-400 font-bold">Hora Extra:</span> <span className="font-black">{fmtHHMM(r.hrExtraQtd)} = {fmt(r.hrExtraTotal)}</span></div>
                        <div><span className="text-gray-400 font-bold">KM Inicial:</span> <span className="font-black">{fmtNum(r.kmStart)}</span></div>
                        <div><span className="text-gray-400 font-bold">KM Final:</span> <span className="font-black">{fmtNum(r.kmEnd)}</span></div>
                        <div><span className="text-gray-400 font-bold">Pedágio:</span> <span className="font-black">{fmt(r.tollVal)}</span></div>
                        <div><span className="text-gray-400 font-bold">Viatura:</span> <span className="font-black">{r.viatura}</span></div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button onClick={(e) => { e.stopPropagation(); startEditBilling(r.billingId); }} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors" data-testid={`button-edit-billing-${i}`}>
                          <Pencil size={11} /> Editar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reportGenerated && rowsData.length > 0 && (
        <div id="print-area" className="mt-4 bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto" style={{ position: "relative" }}>
          <img src={torresLogoPath} alt="" className="print-watermark" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "400px", height: "auto", opacity: 0.06, pointerEvents: "none", zIndex: 0 }} />
          <div className="boletim-header" style={{ marginBottom: "12px", textAlign: "center", paddingBottom: "8px", borderBottom: "2px solid #111", position: "relative", zIndex: 1 }}>
            <h1 style={{ fontSize: "18px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px", color: "#111", margin: 0 }}>TORRES — SERVIÇOS TÁTICOS</h1>
            <p className="subtitle-line" style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", color: "#374151", margin: "4px 0 2px" }}>BOLETIM DE MEDIÇÃO — {displayClientName}</p>
            <p className="ref-line" style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
              REFERENTE AO SERVIÇO DE ESCOLTA ARMADA — {getPeriodLabel()}
            </p>
          </div>

          <div className="report-table-scroll" style={{ overflow: "auto", maxHeight: "70vh", position: "relative", zIndex: 1 }}>
            <table style={{ borderCollapse: "collapse", border: "1.5px solid #111", tableLayout: "auto", width: "100%", minWidth: "1500px" }}>
              <thead>
                <tr className="group-hdr">
                  <th colSpan={7} style={groupHeaderStyle}>TABELA ACORDADA</th>
                  <th colSpan={6} style={{ ...groupHeaderStyle, backgroundColor: "#1f2937" }}>INFORMAÇÕES DA VIAGEM</th>
                  <th colSpan={3} style={grpKm}>KILOMETRAGEM</th>
                  <th colSpan={3} style={grpHr}>HORÁRIOS</th>
                  <th colSpan={3} style={grpKmExc}>KM EXCEDENTE</th>
                  <th colSpan={3} style={grpHrExc}>HORA EXCEDENTE</th>
                  <th colSpan={2} style={grpVal}>VALORES</th>
                </tr>
                <tr className="sub-hdr">
                  <th style={headerStyle}>Nº</th>
                  <th style={headerStyle}>ROTA</th>
                  <th style={headerStyle}>VALOR</th>
                  <th style={headerStyle}>HR FRANQ</th>
                  <th style={headerStyle}>KM FRANQ</th>
                  <th style={headerStyle}>HR EXTRA</th>
                  <th style={headerStyle}>KM EXTRA</th>
                  <th style={headerStyle}>DATA INÍCIO</th>
                  <th style={headerStyle}>HORA INÍCIO</th>
                  <th style={headerStyle}>VIATURA</th>
                  <th style={headerStyle}>VEÍC. ESCOLT.</th>
                  <th style={headerStyle}>DATA FIM</th>
                  <th style={headerStyle}>HORA FIM</th>
                  <th style={hdrKm}>INICIAL</th>
                  <th style={hdrKm}>FINAL</th>
                  <th style={hdrKm}>TOTAL</th>
                  <th style={hdrHr}>INICIAL</th>
                  <th style={hdrHr}>FINAL</th>
                  <th style={hdrHr}>TOTAL</th>
                  <th style={hdrKmExc}>KM</th>
                  <th style={hdrKmExc}>VALOR</th>
                  <th style={hdrKmExc}>TOTAL</th>
                  <th style={hdrHrExc}>HORA</th>
                  <th style={hdrHrExc}>VALOR</th>
                  <th style={hdrHrExc}>TOTAL</th>
                  <th style={hdrVal}>PEDÁGIO</th>
                  <th style={hdrVal}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rowsData.map((r, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ ...cellBold, fontSize: "10.5px" }}>{r.id}</td>
                    <td className="route-cell" style={{ ...cellStyle, textAlign: "left", whiteSpace: "normal", wordWrap: "break-word", fontWeight: 700, fontSize: "9px", lineHeight: "1.3", color: "#111" }}>{r.route}</td>
                    <td style={{ ...cellMono, fontWeight: 700 }}>{fmt(r.activationFee)}</td>
                    <td style={{ ...cellMono }}>{r.franchiseHoursFmt}</td>
                    <td style={{ ...cellMono }}>{r.franchiseKm > 0 ? fmtNum(r.franchiseKm) : "—"}</td>
                    <td style={{ ...cellMono }}>{fmt(r.unitHr)}</td>
                    <td style={{ ...cellMono }}>{fmt(r.unitKm)}</td>
                    <td style={cellStyle}>{r.startDate}</td>
                    <td style={{ ...cellMono }}>{r.startTime}</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: "#111", letterSpacing: "0.5px" }}>{r.viatura}</td>
                    <td style={{ ...cellStyle, letterSpacing: "0.3px" }}>{r.cargoPlate}</td>
                    <td style={cellStyle}>{r.endDate}</td>
                    <td style={{ ...cellMono }}>{r.endTime}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKm }}>{r.kmStart > 0 ? fmtNum(r.kmStart) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKm }}>{r.kmEnd > 0 ? fmtNum(r.kmEnd) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKm, fontWeight: 700 }}>{r.kmTotal > 0 ? fmtNum(r.kmTotal) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHr }}>{r.startTime}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHr }}>{r.endTime}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHr, fontWeight: 700 }}>{r.timeTotal}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmt(r.kmExtraUnit) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgKmExc, fontWeight: 700 }}>{r.kmExtraTotal > 0 ? fmt(r.kmExtraTotal) : "R$ 0,00"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmt(r.hrExtraUnit) : "—"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgHrExc, fontWeight: 700 }}>{r.hrExtraTotal > 0 ? fmt(r.hrExtraTotal) : "R$ 0,00"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgVal }}>{r.tollVal > 0 ? fmt(r.tollVal) : "R$ 0,00"}</td>
                    <td style={{ ...cellMono, backgroundColor: bgVal, fontWeight: 900, fontSize: "10px", color: "#111" }}>{fmt(r.totalGeral)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2.5px solid #111" }}>
                  <td colSpan={26} style={{ ...cellBold, textAlign: "right", fontSize: "11px", padding: "7px 10px", letterSpacing: "0.5px" }}>TOTAL GERAL</td>
                  <td style={{ ...cellBold, fontSize: "11px", fontFamily: fontMono, backgroundColor: "#111", color: "#fff", padding: "7px 10px", letterSpacing: "0.3px" }}>{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="sign-section" style={{ marginTop: "30px", display: "flex", justifyContent: "space-between", paddingTop: "15px", borderTop: "1px solid #111", alignItems: "flex-end", position: "relative", zIndex: 1 }}>
            <div className="sign-box" style={{ textAlign: "center", width: "250px" }}>
              <p className="digital-signature" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "20px", fontWeight: 700, color: "#111", borderBottom: "1.5px solid #374151", paddingBottom: "2px", display: "inline-block" }}>Torres Vigilância</p>
              <p className="sign-role" style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", color: "#111", letterSpacing: "0.8px", marginTop: "4px" }}>TORRES VIGILÂNCIA PATRIMONIAL</p>
              <p className="sign-cnpj" style={{ fontSize: "9px", color: "#6b7280" }}>CNPJ: 36.982.392/0001-89</p>
              <p className="sign-system" style={{ fontSize: "9px", color: "#9ca3af" }}>Sistema Torres — Gestão Operacional</p>
            </div>
            <div className="sign-box" style={{ textAlign: "center", width: "250px" }}>
              <p style={{ borderBottom: "1.5px solid #374151", height: "30px", marginBottom: "4px" }}>&nbsp;</p>
              <p className="sign-cliente" style={{ fontSize: "11px", fontWeight: 900, textTransform: "uppercase", color: "#111" }}>{displayClientName}</p>
              <p className="sign-data" style={{ fontSize: "9px", color: "#6b7280", marginTop: "4px" }}>Data: ____/____/________</p>
            </div>
          </div>
        </div>
      )}

      <Dialog open={faturaDialog} onOpenChange={setFaturaDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
              <Receipt className="w-5 h-5 text-indigo-600" /> Gerar Fatura — Asaas
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Faturamento consolidado via integração Asaas com emissão fiscal CNAE 7870.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Razão Social / Tomador</p>
                  <p className="text-sm font-black text-indigo-900 uppercase" data-testid="text-fatura-client">{displayClientName}</p>
                  <p className="text-[10px] text-indigo-500 font-mono">{clientData?.cnpj || clientData?.cpf || "CPF/CNPJ não cadastrado"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Valor Total</p>
                  <p className="text-xl font-black font-mono text-indigo-800" data-testid="text-fatura-total">{fmt(grandTotal)}</p>
                  <p className="text-[10px] text-indigo-500">{rowsData.length} missão(ões) no período</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Empresa Emissora</p>
              <p className="text-xs font-bold text-gray-800">TORRES VIGILÂNCIA PATRIMONIAL EIRELI</p>
              <p className="text-[10px] text-gray-500 font-mono">CNPJ 36.982.392/0001-89 &bull; CNAE 7870 — Escolta Armada</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Observações / Descrição Fiscal</p>
              <p className="text-xs text-amber-900 font-medium" data-testid="text-fatura-descricao">
                Referente ao Serviço de Escolta Armada — Ref. ao Mês {getPeriodLabel()}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Vencimento</Label>
                <Input type="date" value={faturaDueDate} onChange={(e) => setFaturaDueDate(e.target.value)} className="mt-1 text-xs font-mono" data-testid="input-fatura-due-date" />
              </div>
              <div>
                <Label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">E-mail Financeiro</Label>
                <Input
                  type="email"
                  value={clientData?.email_financeiro || clientData?.emailFinanceiro || "escolta@torresseguranca.com.br"}
                  readOnly
                  className="mt-1 text-xs font-mono bg-gray-50"
                  data-testid="input-fatura-email"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Tipo de Cobrança</Label>
              <Select value={faturaBillingType} onValueChange={setFaturaBillingType}>
                <SelectTrigger className="mt-1 text-xs" data-testid="select-fatura-billing-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                  <SelectItem value="PIX">PIX (QR Code)</SelectItem>
                  <SelectItem value="UNDEFINED">Boleto + PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
              <Check size={14} className="text-emerald-600 flex-shrink-0" />
              <p className="text-[10px] text-emerald-700 font-medium">Cobrança será gerada automaticamente via Asaas com NFS-e (CNAE 7870)</p>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setFaturaDialog(false)} className="text-xs font-bold uppercase" data-testid="button-cancel-fatura">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                gerarFaturaMutation.mutate({
                  clientId: parseInt(selectedClient),
                  billingType: faturaBillingType,
                  sendToAsaas: true,
                  dueDate: faturaDueDate,
                });
              }}
              disabled={gerarFaturaMutation.isPending || rowsData.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-xs font-black uppercase gap-2 px-6"
              data-testid="button-confirm-fatura"
            >
              {gerarFaturaMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
              GERAR BOLETO + PIX (ASAAS) {fmt(grandTotal)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
