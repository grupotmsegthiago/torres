import "./_group.css";
import { TorresFullLogo } from "./_shared/TorresLogo";
import { SlideFrame } from "./_shared/SlideFrame";
import { Phone, Mail, MapPin, Globe, FileText } from "lucide-react";

export function Contato() {
  const contacts = [
    { icon: Phone, label: "Telefone", value: "(21) 99900-1122" },
    { icon: Mail, label: "E-mail", value: "contato@torresseguranca.com.br" },
    { icon: MapPin, label: "Localização", value: "Rio de Janeiro — RJ" },
    { icon: Globe, label: "Website", value: "www.torresseguranca.com.br" },
    { icon: FileText, label: "CNPJ", value: "36.982.392/0001-89" },
  ];

  return (
    <SlideFrame pageNum={5}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36 }}>
        <TorresFullLogo size={100} color="#1a1a1a" />

        <div style={{ width: 80, height: 2, background: "linear-gradient(90deg, transparent, #1a1a1a, transparent)" }} />

        <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, fontWeight: 900, color: "#1a1a1a", letterSpacing: "0.08em", textAlign: "center" }}>
          ENTRE EM CONTATO
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          {contacts.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: "2px solid #1a1a1a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={15} color="#1a1a1a" strokeWidth={2} />
                </div>
                <div>
                  <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 8, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.15em" }}>
                    {c.label.toUpperCase()}
                  </p>
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                    {c.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 20,
          padding: "14px 32px",
          background: "#1a1a1a",
          borderRadius: 6,
        }}>
          <span style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#ffffff",
          }}>
            SOLICITE UM ORÇAMENTO
          </span>
        </div>
      </div>

      <div style={{
        position: "absolute",
        bottom: 20,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: "'Inter', sans-serif",
        fontSize: 9,
        color: "#d1d5db",
        letterSpacing: "0.08em",
      }}>
        © 2026 Torres Vigilância Patrimonial LTDA — Todos os direitos reservados
      </div>
    </SlideFrame>
  );
}
