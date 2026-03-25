import "./_group.css";
import { TorresLogoSVG } from "./_shared/TorresLogo";
import { SlideFrame } from "./_shared/SlideFrame";
import { Shield, Target, Award, Users } from "lucide-react";

export function Sobre() {
  const values = [
    { icon: Shield, title: "Segurança", desc: "Proteção integral do patrimônio e de cargas de alto valor em todo o território nacional." },
    { icon: Target, title: "Precisão", desc: "Operações planejadas com inteligência tática, rotas otimizadas e monitoramento em tempo real." },
    { icon: Award, title: "Excelência", desc: "Equipe treinada e certificada, com armamento regulamentado e veículos rastreados 24h." },
    { icon: Users, title: "Compromisso", desc: "Atendimento personalizado, relatórios detalhados e transparência total com nossos clientes." },
  ];

  return (
    <SlideFrame pageNum={1}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <TorresLogoSVG size={28} color="#1a1a1a" />
        <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af" }}>
          TORRES VIGILÂNCIA PATRIMONIAL
        </span>
      </div>
      <div style={{ width: "100%", height: 1, background: "linear-gradient(90deg, #1a1a1a, transparent)", marginBottom: 32 }} />

      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 28, fontWeight: 900, color: "#1a1a1a", letterSpacing: "-0.01em", marginBottom: 8 }}>
        Quem Somos
      </h2>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#6b7280", lineHeight: 1.7, maxWidth: 600, marginBottom: 36 }}>
        A Torres Vigilância Patrimonial é especializada em escolta armada e segurança de cargas, operando com rigor técnico, tecnologia de ponta e profissionais altamente qualificados. Atuamos com foco na prevenção de riscos e na excelência operacional.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flex: 1 }}>
        {values.map((v, i) => {
          const Icon = v.icon;
          return (
            <div key={i} style={{
              background: "#fafafa",
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "24px 20px",
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: "#1a1a1a",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={18} color="white" strokeWidth={2} />
              </div>
              <div>
                <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: 13, color: "#1a1a1a", letterSpacing: "0.04em", marginBottom: 4 }}>
                  {v.title.toUpperCase()}
                </p>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
                  {v.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </SlideFrame>
  );
}
