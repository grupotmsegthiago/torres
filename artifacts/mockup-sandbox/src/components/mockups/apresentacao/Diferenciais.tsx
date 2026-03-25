import "./_group.css";
import { TorresLogoSVG } from "./_shared/TorresLogo";
import { SlideFrame } from "./_shared/SlideFrame";
import { CheckCircle2 } from "lucide-react";

export function Diferenciais() {
  const items = [
    "Vigilantes com porte de arma de fogo e treinamento tático especializado",
    "Viaturas identificadas, blindadas e com rastreamento em tempo real 24h",
    "Sistema operacional próprio com aplicativo mobile para agentes em campo",
    "Gestão completa de missões: da designação ao encerramento com auditoria GPS",
    "Boletins de medição automáticos com cálculo de franquias e KM excedente",
    "Contratos digitais com controle de vigência, reajuste e renovação automática",
    "Modo offline para operações em áreas sem cobertura de sinal",
    "OCR com inteligência artificial para leitura de documentos e placas",
    "Central de operações 24/7 com monitoramento em tempo real",
    "Relatórios detalhados por cliente, período e tipo de operação",
  ];

  return (
    <SlideFrame pageNum={4}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <TorresLogoSVG size={28} color="#1a1a1a" />
        <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af" }}>
          TORRES VIGILÂNCIA PATRIMONIAL
        </span>
      </div>
      <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, #1a1a1a, transparent)", marginBottom: 32 }} />

      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 28, fontWeight: 900, color: "#1a1a1a", letterSpacing: "-0.01em", marginBottom: 8 }}>
        Nossos Diferenciais
      </h2>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6b7280", lineHeight: 1.7, maxWidth: 520, marginBottom: 32 }}>
        O que nos torna a escolha certa para proteger seu patrimônio e suas cargas.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", flex: 1 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "10px 0",
            borderBottom: "1px solid #f0f0f0",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4,
              background: "#1a1a1a",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              marginTop: 1,
            }}>
              <CheckCircle2 size={12} color="white" strokeWidth={2.5} />
            </div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "#374151", lineHeight: 1.5 }}>
              {item}
            </p>
          </div>
        ))}
      </div>
    </SlideFrame>
  );
}
