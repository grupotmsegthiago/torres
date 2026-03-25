import "./_group.css";
import { TorresLogoSVG } from "./_shared/TorresLogo";
import { SlideFrame } from "./_shared/SlideFrame";
import { Truck, Shield, MapPin, Clock, Radio, FileCheck } from "lucide-react";

export function Servicos() {
  const services = [
    { icon: Truck, title: "Escolta Armada", desc: "Proteção de cargas com vigilantes armados, veículo operacional identificado e rastreamento em tempo real.", highlight: true },
    { icon: Shield, title: "Vigilância Patrimonial", desc: "Segurança fixa e móvel para empresas, condomínios e eventos com profissionais treinados." },
    { icon: MapPin, title: "Rastreamento Veicular", desc: "Monitoramento 24h de frotas e veículos escoltados com telemetria avançada e alertas." },
    { icon: Clock, title: "Operação 24/7", desc: "Central de operações funcionando ininterruptamente para coordenação e resposta imediata." },
    { icon: Radio, title: "Comunicação Tática", desc: "Sistemas de comunicação criptografados entre equipes de campo e central de operações." },
    { icon: FileCheck, title: "Gestão Documental", desc: "Boletins de missão, relatórios de ocorrência e controle de contratos digitalizados." },
  ];

  return (
    <SlideFrame pageNum={2}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <TorresLogoSVG size={28} color="#1a1a1a" />
        <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af" }}>
          TORRES VIGILÂNCIA PATRIMONIAL
        </span>
      </div>
      <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, #1a1a1a, transparent)", marginBottom: 32 }} />

      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 28, fontWeight: 900, color: "#1a1a1a", letterSpacing: "-0.01em", marginBottom: 8 }}>
        Nossos Serviços
      </h2>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6b7280", lineHeight: 1.7, maxWidth: 520, marginBottom: 32 }}>
        Soluções completas em segurança privada com foco em escolta armada de cargas e valores.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, flex: 1 }}>
        {services.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} style={{
              background: s.highlight ? "#1a1a1a" : "#fafafa",
              border: s.highlight ? "none" : "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "24px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: s.highlight ? "rgba(255,255,255,0.15)" : "#1a1a1a",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={16} color="white" strokeWidth={2} />
              </div>
              <p style={{
                fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 11,
                color: s.highlight ? "#ffffff" : "#1a1a1a",
                letterSpacing: "0.06em",
              }}>
                {s.title.toUpperCase()}
              </p>
              <p style={{
                fontFamily: "'Inter', sans-serif", fontSize: 10.5,
                color: s.highlight ? "rgba(255,255,255,0.7)" : "#6b7280",
                lineHeight: 1.6,
              }}>
                {s.desc}
              </p>
            </div>
          );
        })}
      </div>
    </SlideFrame>
  );
}
