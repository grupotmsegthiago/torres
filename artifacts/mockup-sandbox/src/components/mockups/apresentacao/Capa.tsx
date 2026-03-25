import "./_group.css";
import { TorresFullLogo } from "./_shared/TorresLogo";
import { SlideFrame } from "./_shared/SlideFrame";

export function Capa() {
  return (
    <SlideFrame>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
        <TorresFullLogo size={140} color="#1a1a1a" />

        <div style={{ width: 120, height: 2, background: "linear-gradient(90deg, transparent, #1a1a1a, transparent)" }} />

        <div style={{ textAlign: "center" }}>
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.25em",
            color: "#6b7280",
            textTransform: "uppercase",
          }}>
            Apresentação Institucional
          </p>
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.15em",
            color: "#9ca3af",
            marginTop: 8,
          }}>
            Soluções em Escolta Armada & Segurança Patrimonial
          </p>
        </div>

        <div style={{
          marginTop: 40,
          padding: "12px 28px",
          border: "2px solid #1a1a1a",
          borderRadius: 2,
        }}>
          <span style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "#1a1a1a",
          }}>
            CNPJ 36.982.392/0001-89
          </span>
        </div>
      </div>

      <div style={{
        position: "absolute",
        bottom: 24,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: "'Inter', sans-serif",
        fontSize: 9,
        color: "#d1d5db",
        letterSpacing: "0.1em",
      }}>
        DOCUMENTO CONFIDENCIAL
      </div>
    </SlideFrame>
  );
}
