import "./_group.css";
import { TorresLogoSVG } from "./_shared/TorresLogo";
import { SlideFrame } from "./_shared/SlideFrame";
import { Smartphone, Globe, BarChart3, Lock, Wifi, Camera } from "lucide-react";

export function Tecnologia() {
  const features = [
    { icon: Smartphone, label: "APP Operacional", desc: "Agentes avançam etapas da missão em tempo real pelo celular, com captura de fotos e GPS." },
    { icon: Globe, label: "Rastreamento ao Vivo", desc: "Posição dos veículos integrada via telemetria com alertas de velocidade e ociosidade." },
    { icon: BarChart3, label: "Painéis Gerenciais", desc: "Dashboards para acompanhamento de missões, frota, RH, financeiro e contratos." },
    { icon: Lock, label: "Auditoria Total", desc: "Cada ação do sistema é registrada com data, hora, agente e coordenadas GPS." },
    { icon: Wifi, label: "Modo Offline", desc: "Agentes em campo operam sem sinal. As ações são salvas e sincronizadas automaticamente." },
    { icon: Camera, label: "OCR Inteligente", desc: "Leitura automática de documentos (CNH, CRLV, registro de arma) com IA." },
  ];

  return (
    <SlideFrame pageNum={3}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <TorresLogoSVG size={28} color="#1a1a1a" />
        <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af" }}>
          TORRES VIGILÂNCIA PATRIMONIAL
        </span>
      </div>
      <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, #1a1a1a, transparent)", marginBottom: 32 }} />

      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 28, fontWeight: 900, color: "#1a1a1a", letterSpacing: "-0.01em", marginBottom: 8 }}>
        Tecnologia & Inovação
      </h2>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6b7280", lineHeight: 1.7, maxWidth: 560, marginBottom: 32 }}>
        Plataforma proprietária de gestão operacional com inteligência embarcada, desenvolvida para maximizar a eficiência e a segurança das operações.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: "16px 14px",
              borderLeft: "3px solid #1a1a1a",
              background: "linear-gradient(90deg, #f9f9f9, transparent)",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6,
                background: "#1a1a1a",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={14} color="white" strokeWidth={2} />
              </div>
              <div>
                <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 11, color: "#1a1a1a", letterSpacing: "0.04em", marginBottom: 3 }}>
                  {f.label.toUpperCase()}
                </p>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "#6b7280", lineHeight: 1.55 }}>
                  {f.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 24,
        padding: "14px 20px",
        background: "#1a1a1a",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
      }}>
        {[
          { num: "24/7", label: "Operação" },
          { num: "GPS", label: "Rastreio Total" },
          { num: "100%", label: "Digital" },
          { num: "IA", label: "Integrada" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 18, color: "#ffffff" }}>{s.num}</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em" }}>{s.label.toUpperCase()}</p>
          </div>
        ))}
      </div>
    </SlideFrame>
  );
}
