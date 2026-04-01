import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { authFetch } from "@/lib/queryClient";
import {
  FileText, Search, Printer, Loader2, FileSpreadsheet, ChevronDown, ChevronRight,
  Calculator, Calendar,
} from "lucide-react";
import * as XLSX from "xlsx";

const fmt = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number | null | undefined, d = 0) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
const fmtHHMM = (h: number) => {
  if (isNaN(h) || h <= 0) return "00:00";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};
const fmtDateDisp = (s: string) => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };

export default function RelatorioFaturamentoPage() {
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

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => { const r = await authFetch("/api/clients"); return r.json(); },
  });

  const { data: contracts = [] } = useQuery<any[]>({
    queryKey: ["/api/escort/contracts"],
    queryFn: async () => { const r = await authFetch("/api/escort/contracts"); return r.json(); },
  });

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
      const r = await authFetch(`/api/escort/billings?${params}`);
      const data = await r.json();
      const approved = (data || []).filter((b: any) => b.status === "APROVADA" || b.status === "FATURADO" || b.status === "PAGO");
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

      const fatHoraExtra = n(b.fat_hora_extra);
      const fatKmExtra = kmExcedente * valorKmExtra;
      const fatPedagio = n(b.despesas_pedagio);
      const fatTotal = n(b.fat_total);

      return {
        id: b.os_number || `OS-${b.service_order_id}`,
        billingId: b.id,
        route: `${b.origin || "—"} → ${b.destination || "—"}`,
        activationFee: valorAcionamento,
        franchiseHours: franquiaHoras,
        franchiseKm: franquiaKm,
        unitHr: valorHoraExtra,
        unitKm: valorKmExtra,
        startDate: fmtDate(b.horario_inicio ? `2026-01-01T${b.horario_inicio}` : b.created_at),
        startTime: b.horario_inicio ? b.horario_inicio.substring(0, 5) : fmtTime(b.created_at),
        viatura: b.vehicle_plate || "—",
        cargoPlate: b.escorted_vehicle_plate || "—",
        endDate: fmtDate(b.horario_fim ? `2026-01-01T${b.horario_fim}` : b.created_at),
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
      html, body { margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 7pt; color: #1f2937; }
      table { table-layout: auto; width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
      td, th { padding: 2px 4px; font-size: 7pt; border: 0.5px solid #d1d5db; line-height: 1.3; white-space: nowrap; text-align: center; vertical-align: middle; }
      td.route-cell { white-space: normal; word-wrap: break-word; text-align: left; min-width: 110px; max-width: 200px; font-weight: 600; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { page-break-inside: avoid; }
      tbody tr:nth-child(odd) { background-color: #ffffff; }
      tbody tr:nth-child(even) { background-color: #f9fafb; }
      .group-hdr th { font-size: 7.5pt; padding: 3px 4px; font-weight: 900; letter-spacing: 0.5px; border-bottom: 1.5px solid #111; border-top: 1.5px solid #111; }
      .sub-hdr th { font-size: 6.5pt; padding: 2.5px 3px; font-weight: 800; border-bottom: 1px solid #374151; text-transform: uppercase; }
      .boletim-header { margin-bottom: 4mm; text-align: center; padding-bottom: 2mm; border-bottom: 1px solid #111; }
      .boletim-header h1 { font-size: 14pt; margin: 0; color: #111; }
      .subtitle-line { font-size: 9.5pt; margin: 1.5mm 0 0.5mm; color: #374151; }
      .ref-line { font-size: 7.5pt; margin: 0; color: #6b7280; }
      .sign-section { margin-top: 10mm; break-inside: avoid; display: flex; justify-content: space-between; padding: 0 10mm; border-top: 1px solid #111; padding-top: 4mm; }
      .sign-box { width: 65mm; text-align: center; }
      .digital-signature { font-size: 14pt; font-family: 'Brush Script MT', cursive; font-weight: 700; color: #111; border-bottom: 1.5px solid #374151; padding-bottom: 1px; display: inline-block; }
      .sign-role { font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #111; letter-spacing: 0.8px; margin-top: 1mm; }
      .sign-cnpj { font-size: 6.5pt; color: #6b7280; }
      .sign-system { font-size: 6.5pt; color: #9ca3af; }
      .sign-cliente { font-size: 8pt; font-weight: 900; text-transform: uppercase; color: #111; }
      .sign-data { font-size: 7pt; color: #6b7280; margin-top: 1mm; }
      tfoot tr { break-inside: avoid; border-top: 2px solid #111; }
      tfoot td { font-size: 8pt; font-weight: 900; padding: 3px 5px; }
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
    const subtitleRow = ["REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS"];
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

  const cellStyle: React.CSSProperties = { border: "1px solid #d1d5db", padding: "5px 7px", fontSize: "13px", fontFamily: "'Inter', sans-serif", textAlign: "center", whiteSpace: "nowrap", color: "#1f2937", lineHeight: "1.35" };
  const cellBold: React.CSSProperties = { ...cellStyle, fontWeight: 800, color: "#111827" };
  const headerStyle: React.CSSProperties = { ...cellStyle, backgroundColor: "#f3f4f6", fontWeight: 900, fontSize: "11px", textTransform: "uppercase" as const, color: "#111", padding: "5px 5px" };
  const groupHeaderStyle: React.CSSProperties = { ...headerStyle, backgroundColor: "#111", color: "#fff", fontSize: "12px", letterSpacing: "0.3px", padding: "6px 5px" };

  const bgKm = "#f9fafb";
  const bgHr = "#f3f4f6";
  const bgKmExc = "#e5e7eb";
  const bgHrExc = "#d1d5db";
  const bgVal = "#e5e7eb";

  const hdrKm: React.CSSProperties = { ...headerStyle, backgroundColor: "#e5e7eb" };
  const hdrHr: React.CSSProperties = { ...headerStyle, backgroundColor: "#d1d5db" };
  const hdrKmExc: React.CSSProperties = { ...headerStyle, backgroundColor: "#9ca3af", color: "#fff" };
  const hdrHrExc: React.CSSProperties = { ...headerStyle, backgroundColor: "#6b7280", color: "#fff" };
  const hdrVal: React.CSSProperties = { ...headerStyle, backgroundColor: "#374151", color: "#fff" };

  const grpKm: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#374151" };
  const grpHr: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#1f2937" };
  const grpKmExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#111827" };
  const grpHrExc: React.CSSProperties = { ...groupHeaderStyle, backgroundColor: "#030712" };
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
                  {isExpanded && (
                    <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border-t border-gray-200 pt-2">
                      <div><span className="text-gray-400 font-bold">Acionamento:</span> <span className="font-black">{fmt(r.activationFee)}</span></div>
                      <div><span className="text-gray-400 font-bold">Franquia:</span> <span className="font-black">{r.franchiseHoursFmt}h / {fmtNum(r.franchiseKm)} km</span></div>
                      <div><span className="text-gray-400 font-bold">KM Excedente:</span> <span className="font-black">{fmtNum(r.kmExtraQtd)} km = {fmt(r.kmExtraTotal)}</span></div>
                      <div><span className="text-gray-400 font-bold">Hora Extra:</span> <span className="font-black">{fmtHHMM(r.hrExtraQtd)} = {fmt(r.hrExtraTotal)}</span></div>
                      <div><span className="text-gray-400 font-bold">KM Inicial:</span> <span className="font-black">{fmtNum(r.kmStart)}</span></div>
                      <div><span className="text-gray-400 font-bold">KM Final:</span> <span className="font-black">{fmtNum(r.kmEnd)}</span></div>
                      <div><span className="text-gray-400 font-bold">Pedágio:</span> <span className="font-black">{fmt(r.tollVal)}</span></div>
                      <div><span className="text-gray-400 font-bold">Viatura:</span> <span className="font-black">{r.viatura}</span></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reportGenerated && rowsData.length > 0 && (
        <div id="print-area" className="mt-4 bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-x-auto">
          <div className="boletim-header" style={{ marginBottom: "12px", textAlign: "center", paddingBottom: "8px", borderBottom: "2px solid #111" }}>
            <h1 style={{ fontSize: "18px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px", color: "#111", margin: 0 }}>TORRES — SERVIÇOS TÁTICOS</h1>
            <p className="subtitle-line" style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", color: "#374151", margin: "4px 0 2px" }}>BOLETIM DE MEDIÇÃO — {displayClientName}</p>
            <p className="ref-line" style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", color: "#6b7280", margin: 0 }}>
              REFERENTE A INTERMEDIAÇÃO DE SEGURANÇA E MONITORAMENTO DE CARGAS — {getPeriodLabel()}
            </p>
          </div>

          <div className="report-table-scroll" style={{ overflow: "auto", maxHeight: "70vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1.5px solid #111", tableLayout: "fixed", minWidth: "1200px" }}>
              <colgroup>
                <col style={{ width: "60px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "80px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "75px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "75px" }} />
                <col style={{ width: "75px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "55px" }} />
                <col style={{ width: "50px" }} />
                <col style={{ width: "50px" }} />
                <col style={{ width: "50px" }} />
                <col style={{ width: "50px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "50px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "65px" }} />
                <col style={{ width: "70px" }} />
                <col style={{ width: "80px" }} />
              </colgroup>
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
                    <td style={cellBold}>{r.id}</td>
                    <td className="route-cell" style={{ ...cellStyle, textAlign: "left", whiteSpace: "normal", wordWrap: "break-word", fontWeight: 600 }}>{r.route}</td>
                    <td style={{ ...cellStyle, fontWeight: 700, fontFamily: "monospace" }}>{fmt(r.activationFee)}</td>
                    <td style={cellStyle}>{r.franchiseHoursFmt}</td>
                    <td style={cellStyle}>{r.franchiseKm > 0 ? fmtNum(r.franchiseKm) : "—"}</td>
                    <td style={{ ...cellStyle, fontFamily: "monospace" }}>{fmt(r.unitHr)}</td>
                    <td style={{ ...cellStyle, fontFamily: "monospace" }}>{fmt(r.unitKm)}</td>
                    <td style={cellStyle}>{r.startDate}</td>
                    <td style={cellStyle}>{r.startTime}</td>
                    <td style={{ ...cellStyle, fontWeight: 700 }}>{r.viatura}</td>
                    <td style={cellStyle}>{r.cargoPlate}</td>
                    <td style={cellStyle}>{r.endDate}</td>
                    <td style={cellStyle}>{r.endTime}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgKm }}>{r.kmStart > 0 ? fmtNum(r.kmStart) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgKm }}>{r.kmEnd > 0 ? fmtNum(r.kmEnd) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgKm, fontWeight: 700 }}>{r.kmTotal > 0 ? fmtNum(r.kmTotal) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgHr }}>{r.startTime}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgHr }}>{r.endTime}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgHr, fontWeight: 700 }}>{r.timeTotal}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgKmExc }}>{r.kmExtraQtd > 0 ? fmtNum(r.kmExtraQtd) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgKmExc, fontFamily: "monospace" }}>{r.kmExtraQtd > 0 ? fmt(r.kmExtraUnit) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgKmExc, fontWeight: 700, fontFamily: "monospace" }}>{r.kmExtraTotal > 0 ? fmt(r.kmExtraTotal) : "R$ 0,00"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgHrExc }}>{r.hrExtraQtd > 0 ? fmtHHMM(r.hrExtraQtd) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgHrExc, fontFamily: "monospace" }}>{r.hrExtraQtd > 0 ? fmt(r.hrExtraUnit) : "—"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgHrExc, fontWeight: 700, fontFamily: "monospace" }}>{r.hrExtraTotal > 0 ? fmt(r.hrExtraTotal) : "R$ 0,00"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgVal, fontFamily: "monospace" }}>{r.tollVal > 0 ? fmt(r.tollVal) : "R$ 0,00"}</td>
                    <td style={{ ...cellStyle, backgroundColor: bgVal, fontWeight: 900, fontFamily: "monospace", color: "#111" }}>{fmt(r.totalGeral)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #111" }}>
                  <td colSpan={26} style={{ ...cellBold, textAlign: "right", fontSize: "14px", padding: "8px" }}>TOTAL GERAL</td>
                  <td style={{ ...cellBold, fontSize: "14px", fontFamily: "monospace", backgroundColor: "#111", color: "#fff", padding: "8px" }}>{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="sign-section" style={{ marginTop: "30px", display: "flex", justifyContent: "space-between", paddingTop: "15px", borderTop: "1px solid #111", alignItems: "flex-end" }}>
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
    </AdminLayout>
  );
}
