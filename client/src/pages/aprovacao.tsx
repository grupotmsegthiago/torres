import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, Clock, AlertTriangle, FileText, MapPin, Calendar, Car, Shield, Loader2 } from "lucide-react";

interface BillingDetail {
  id: number;
  service_order_id: number;
  osNumber: string;
  origin: string;
  destination: string;
  scheduledDate: string;
  completedDate: string;
  vehiclePlate: string;
  escortedPlate: string;
  fat_acionamento: number;
  fat_hora_extra: number;
  fat_km: number;
  despesas_pedagio: number;
  fat_adicional_noturno: number;
  receitas_os: number;
  fat_total: number;
  km_total: number;
  horas_trabalhadas: number;
  horario_inicio: string;
  horario_fim: string;
}

interface ApprovalData {
  id: number;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  totalValue: number;
  osCount: number;
  status: string;
  approvedAt: string | null;
  approvedByName: string | null;
  billings: BillingDetail[];
}

function formatCurrency(v: number | null | undefined): string {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("pt-BR");
}

export default function AprovacaoPage() {
  const [, params] = useRoute("/aprovacao/:token");
  const token = params?.token;

  const [data, setData] = useState<ApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [nome, setNome] = useState("");
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/boletim/aprovacao/${token}`)
      .then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error(j.message); });
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token]);

  async function handleApprove() {
    if (!nome.trim()) return;
    setApproving(true);
    try {
      const r = await fetch(`/api/boletim/aprovacao/${token}/aprovar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.message);
      }
      setApproved(true);
      if (data) setData({ ...data, status: "APROVADO", approvedByName: nome.trim() });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="approval-loading" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <Loader2 style={{ width: 48, height: 48, color: "#666", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "#666", marginTop: 16 }}>Carregando...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div data-testid="approval-error" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f8f9fa", fontFamily: "'Segoe UI', Arial, sans-serif", padding: 20 }}>
        <AlertTriangle style={{ width: 64, height: 64, color: "#ef4444", marginBottom: 16 }} />
        <h2 style={{ color: "#1B1B1B", margin: "0 0 8px", fontSize: 20 }}>Link Inválido</h2>
        <p style={{ color: "#666", textAlign: "center", maxWidth: 400 }}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const isApproved = data.status === "APROVADO" || approved;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "#1B1B1B", padding: "20px 0", textAlign: "center" }}>
        <h1 style={{ color: "#fff", margin: 0, fontSize: 18, letterSpacing: 2, fontWeight: 700 }}>
          <Shield style={{ width: 20, height: 20, display: "inline", verticalAlign: "middle", marginRight: 8, color: "#059669" }} />
          TORRES VIGILÂNCIA PATRIMONIAL
        </h1>
        <p style={{ color: "#888", fontSize: 11, margin: "4px 0 0" }}>CNPJ 36.982.392/0001-89</p>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.08)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ background: isApproved ? "#059669" : "#f59e0b", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12 }}>
            {isApproved ? <CheckCircle2 style={{ width: 28, height: 28, color: "#fff" }} /> : <Clock style={{ width: 28, height: 28, color: "#fff" }} />}
            <div>
              <h2 style={{ color: "#fff", margin: 0, fontSize: 16, fontWeight: 700 }} data-testid="approval-status">
                {isApproved ? "Boletim Aprovado" : "Boletim Aguardando Aprovação"}
              </h2>
              <p style={{ color: "rgba(255,255,255,.8)", margin: "2px 0 0", fontSize: 13 }}>
                {isApproved ? `Aprovado por ${data.approvedByName || nome}` : "Revise os dados e confirme a aprovação"}
              </p>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
              <div style={{ flex: "1 1 200px", background: "#f8f9fa", borderRadius: 8, padding: 16 }}>
                <p style={{ color: "#888", fontSize: 12, margin: 0 }}>Cliente</p>
                <p style={{ color: "#1B1B1B", fontSize: 15, fontWeight: 600, margin: "4px 0 0" }} data-testid="text-client-name">{data.clientName}</p>
              </div>
              <div style={{ flex: "1 1 200px", background: "#f8f9fa", borderRadius: 8, padding: 16 }}>
                <p style={{ color: "#888", fontSize: 12, margin: 0 }}>Período</p>
                <p style={{ color: "#1B1B1B", fontSize: 15, fontWeight: 600, margin: "4px 0 0" }} data-testid="text-period">
                  {formatDate(data.periodStart)} a {formatDate(data.periodEnd)}
                </p>
              </div>
              <div style={{ flex: "1 1 120px", background: "#f8f9fa", borderRadius: 8, padding: 16 }}>
                <p style={{ color: "#888", fontSize: 12, margin: 0 }}>Ordens de Serviço</p>
                <p style={{ color: "#1B1B1B", fontSize: 22, fontWeight: 700, margin: "4px 0 0" }} data-testid="text-os-count">{data.osCount}</p>
              </div>
              <div style={{ flex: "1 1 160px", background: "#ecfdf5", borderRadius: 8, padding: 16, border: "1px solid #d1fae5" }}>
                <p style={{ color: "#059669", fontSize: 12, margin: 0 }}>Valor Total</p>
                <p style={{ color: "#059669", fontSize: 22, fontWeight: 700, margin: "4px 0 0" }} data-testid="text-total-value">{formatCurrency(data.totalValue)}</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.08)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
            <h3 style={{ margin: 0, fontSize: 15, color: "#1B1B1B", display: "flex", alignItems: "center", gap: 8 }}>
              <FileText style={{ width: 18, height: 18, color: "#666" }} />
              Detalhamento das Ordens de Serviço
            </h3>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table data-testid="approval-billings-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#2D2D2D" }}>
                  {["OS", "Data", "Origem", "Destino", "Placa Escolta", "Acionamento", "Hr. Extra", "KM Exc.", "Pedágio", "Noturno", "Total"].map(h => (
                    <th key={h} style={{ padding: "10px 8px", color: "#fff", fontWeight: 600, fontSize: 11, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.billings.map((b, i) => (
                  <tr key={b.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "8px", textAlign: "center", fontWeight: 600 }}>{b.osNumber}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{formatDate(b.completedDate || b.scheduledDate)}</td>
                    <td style={{ padding: "8px", textAlign: "left", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <MapPin style={{ width: 12, height: 12, display: "inline", color: "#059669", marginRight: 4 }} />
                      {b.origin}
                    </td>
                    <td style={{ padding: "8px", textAlign: "left", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <MapPin style={{ width: 12, height: 12, display: "inline", color: "#ef4444", marginRight: 4 }} />
                      {b.destination}
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <Car style={{ width: 12, height: 12, display: "inline", color: "#666", marginRight: 4 }} />
                      {b.escortedPlate || "—"}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(b.fat_acionamento)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(b.fat_hora_extra)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(b.fat_km)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(b.despesas_pedagio)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{formatCurrency(b.fat_adicional_noturno)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{formatCurrency(b.fat_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#1B1B1B" }}>
                  <td colSpan={5} style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right" }}>TOTAL GERAL</td>
                  <td style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right" }}>{formatCurrency(data.billings.reduce((s, b) => s + (b.fat_acionamento || 0), 0))}</td>
                  <td style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right" }}>{formatCurrency(data.billings.reduce((s, b) => s + (b.fat_hora_extra || 0), 0))}</td>
                  <td style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right" }}>{formatCurrency(data.billings.reduce((s, b) => s + (b.fat_km || 0), 0))}</td>
                  <td style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right" }}>{formatCurrency(data.billings.reduce((s, b) => s + (b.despesas_pedagio || 0), 0))}</td>
                  <td style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right" }}>{formatCurrency(data.billings.reduce((s, b) => s + (b.fat_adicional_noturno || 0), 0))}</td>
                  <td style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "right", fontSize: 15 }}>{formatCurrency(data.totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {!isApproved && (
          <div data-testid="approval-form" style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.08)", padding: 24, marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, color: "#1B1B1B" }}>Confirmar Aprovação</h3>
            <p style={{ color: "#666", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
              Ao clicar em "Estou de acordo", você confirma que revisou todos os dados acima e autoriza a geração do faturamento correspondente.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4, fontWeight: 500 }}>Seu nome completo *</label>
              <input
                data-testid="input-approval-name"
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Digite seu nome completo"
                style={{
                  width: "100%", padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8,
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <button
              data-testid="button-approve"
              onClick={handleApprove}
              disabled={!nome.trim() || approving}
              style={{
                width: "100%", padding: "14px 0", background: nome.trim() ? "#059669" : "#ccc",
                color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 700,
                cursor: nome.trim() && !approving ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {approving ? <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: 20, height: 20 }} />}
              {approving ? "Processando..." : "Estou de Acordo — Aprovar Medição"}
            </button>
          </div>
        )}

        {isApproved && approved && (
          <div data-testid="approval-success" style={{ background: "#ecfdf5", border: "2px solid #059669", borderRadius: 12, padding: 24, textAlign: "center", marginBottom: 20 }}>
            <CheckCircle2 style={{ width: 48, height: 48, color: "#059669", margin: "0 auto 12px" }} />
            <h3 style={{ color: "#059669", margin: "0 0 8px", fontSize: 18 }}>Aprovação Confirmada!</h3>
            <p style={{ color: "#666", fontSize: 14, margin: 0 }}>
              Obrigado, {nome}. O faturamento será processado em breve.
            </p>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "20px 0", color: "#999", fontSize: 11 }}>
          <Calendar style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} />
          Torres Vigilância Patrimonial LTDA — Serviço de Escolta Armada
        </div>
      </div>
    </div>
  );
}
