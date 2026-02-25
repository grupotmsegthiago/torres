import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Truck, Building2, Phone, MapPin, Navigation, Package, Send, Menu, X, ChevronDown, CheckCircle2, Award, Users, Clock } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import logoPath from "@assets/image_1772056652908.png";

const WHATSAPP_NUMBER = "5500000000000";

function Navbar() {
  const [open, setOpen] = useState(false);

  const links = [
    { label: "Inicio", href: "#hero" },
    { label: "Sobre", href: "#sobre" },
    { label: "Serviços", href: "#servicos" },
    { label: "Cotação", href: "#cotacao" },
    { label: "Contato", href: "#contato" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[hsl(220,10%,8%)]/90 backdrop-blur-md border-b border-border/50" data-testid="nav-main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16 sm:h-20">
          <a href="#hero" className="flex items-center gap-2 shrink-0" data-testid="link-home">
            <img src={logoPath} alt="Torres Vigilância Patrimonial" className="h-10 sm:h-14 w-auto" data-testid="img-nav-logo" />
          </a>

          <div className="hidden md:flex items-center gap-6 lg:gap-8 flex-wrap">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-foreground/70 transition-colors duration-200"
                data-testid={`link-nav-${l.label.toLowerCase()}`}
              >
                {l.label}
              </a>
            ))}
            <a href="#cotacao">
              <Button size="sm" data-testid="button-nav-cta">
                Solicitar Cotação
              </Button>
            </a>
          </div>

          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setOpen(!open)}
            data-testid="button-mobile-menu"
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden border-t border-border bg-white dark:bg-[hsl(220,10%,8%)] pb-4"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block px-6 py-3 text-sm font-medium text-foreground/70"
              onClick={() => setOpen(false)}
              data-testid={`link-mobile-${l.label.toLowerCase()}`}
            >
              {l.label}
            </a>
          ))}
          <div className="px-6 pt-2">
            <a href="#cotacao" onClick={() => setOpen(false)}>
              <Button className="w-full" size="sm" data-testid="button-mobile-cta">
                Solicitar Cotação
              </Button>
            </a>
          </div>
        </motion.div>
      )}
    </nav>
  );
}

function HeroSection() {
  return (
    <section
      id="hero"
      className="relative min-h-[100vh] flex items-center overflow-hidden bg-[hsl(220,12%,10%)]"
      data-testid="section-hero"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220,12%,8%)] via-[hsl(220,12%,12%)] to-[hsl(0,40%,15%)]" />

      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[hsl(220,12%,8%)] to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 sm:py-40">
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <div className="h-px w-10 bg-primary" />
              <span className="text-primary text-sm font-semibold tracking-widest uppercase" data-testid="text-hero-badge">
                Autorizada pela Policia Federal
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight" data-testid="text-hero-title">
              Segurança Inteligente.{" "}
              <span className="text-primary">Proteção Inabalável.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-white/60 max-w-2xl leading-relaxed" data-testid="text-hero-subtitle">
              Especialistas em Vigilância Patrimonial, Escolta Armada e Gestão de
              Facilities com autorização da Policia Federal.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 flex-wrap">
              <a href="#cotacao">
                <Button size="lg" data-testid="button-hero-cta">
                  Solicitar Cotação Agora
                </Button>
              </a>
              <a href="#servicos">
                <Button size="lg" variant="outline" className="border-white/20 text-white backdrop-blur-sm bg-white/5" data-testid="button-hero-services">
                  Nossos Serviços
                  <ChevronDown className="ml-2 w-4 h-4" />
                </Button>
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8"
          >
            {[
              { value: "5+", label: "Anos de Experiência", icon: Clock },
              { value: "PF", label: "Autorização Federal", icon: Award },
              { value: "24/7", label: "Operação Contínua", icon: Shield },
              { value: "100%", label: "Cobertura Nacional", icon: Users },
            ].map((stat, idx) => (
              <div key={stat.label} className="text-center sm:text-left" data-testid={`stat-hero-${idx}`}>
                <stat.icon className="w-5 h-5 text-primary mb-2 mx-auto sm:mx-0" />
                <div className="text-2xl sm:text-3xl font-bold text-white" data-testid={`text-stat-value-${idx}`}>{stat.value}</div>
                <div className="text-xs sm:text-sm text-white/40 mt-1" data-testid={`text-stat-label-${idx}`}>{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section id="sobre" className="py-20 sm:py-28 bg-background" data-testid="section-about">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="h-px w-10 bg-primary" />
              <span className="text-primary text-sm font-semibold tracking-widest uppercase">
                Sobre nós
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight" data-testid="text-about-title">
              Sobre a Torres
            </h2>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed" data-testid="text-about-description">
              Fundada em 2020, a Torres Vigilância Patrimonial (CNPJ 36.982.392/0001-89)
              é uma empresa devidamente autorizada pela Policia Federal a operar em todo o
              território nacional. Unimos tecnologia de ponta a um rigoroso treinamento
              operacional para garantir a integridade de ativos e pessoas.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                "Autorizada pela Policia Federal",
                "Cobertura em todo o Brasil",
                "Tecnologia de ponta",
                "Equipes altamente treinadas",
              ].map((item, idx) => (
                <div key={item} className="flex items-center gap-3" data-testid={`text-about-feature-${idx}`}>
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground/80">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative aspect-square max-w-md mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-md" />
              <div className="absolute inset-4 border border-primary/20 rounded-md" />
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src={logoPath}
                  alt="Torres Vigilância Patrimonial"
                  className="w-3/5 h-auto drop-shadow-lg"
                  data-testid="img-about-logo"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-primary/10 rounded-md" />
              <div className="absolute -top-4 -left-4 w-16 h-16 bg-primary/10 rounded-md" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

const services = [
  {
    id: "vigilancia",
    icon: Shield,
    title: "Vigilância Patrimonial",
    description:
      "Segurança ostensiva para empresas, condomínios e indústrias com foco em prevenção de riscos.",
    features: ["Monitoramento 24/7", "Equipes treinadas", "Prevenção de riscos", "Relatórios periódicos"],
  },
  {
    id: "escolta",
    icon: Truck,
    title: "Escolta Armada",
    description:
      "Proteção de cargas e transporte de valores com equipes táticas altamente capacitadas.",
    features: ["Equipes táticas", "Rastreamento em tempo real", "Transporte de valores", "Cobertura nacional"],
  },
  {
    id: "facilities",
    icon: Building2,
    title: "Facilities",
    description:
      "Gestão completa de serviços (limpeza, portaria e manutenção) para que você foque apenas no seu core business.",
    features: ["Limpeza profissional", "Portaria dedicada", "Manutenção predial", "Gestão integrada"],
  },
];

function ServicesSection() {
  return (
    <section id="servicos" className="py-20 sm:py-28 bg-muted/30" data-testid="section-services">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <div className="flex items-center gap-3 justify-center mb-4 flex-wrap">
            <div className="h-px w-10 bg-primary" />
            <span className="text-primary text-sm font-semibold tracking-widest uppercase">
              O que fazemos
            </span>
            <div className="h-px w-10 bg-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground" data-testid="text-services-title">
            Nossos Serviços
          </h2>
          <p className="mt-4 text-muted-foreground" data-testid="text-services-subtitle">
            Soluções completas de segurança e gestão para proteger o que é mais importante para você.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
            >
              <Card className="p-6 sm:p-8 h-full border-border/50 bg-background hover-elevate" data-testid={`card-service-${service.id}`}>
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-5">
                  <service.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3" data-testid={`text-service-title-${service.id}`}>{service.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-5" data-testid={`text-service-desc-${service.id}`}>
                  {service.description}
                </p>
                <ul className="space-y-2">
                  {service.features.map((f, fi) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-foreground/70" data-testid={`text-service-feature-${service.id}-${fi}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EscortCalculator() {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [carga, setCarga] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origem.trim() || !destino.trim() || !carga.trim()) return;

    const msg = encodeURIComponent(
      `Olá, gostaria de uma cotação de Escolta Armada:\n\nOrigem: ${origem}\nDestino: ${destino}\nCarga/Tipo de Serviço: ${carga}\n\nSolicitado via Site Torres`
    );

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");
  };

  const isValid = origem.trim() && destino.trim() && carga.trim();

  return (
    <section id="cotacao" className="py-20 sm:py-28 bg-background" data-testid="section-quote">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="h-px w-10 bg-primary" />
              <span className="text-primary text-sm font-semibold tracking-widest uppercase">
                Cotação rápida
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight" data-testid="text-quote-title">
              Solicite sua Cotação de Escolta Armada
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed" data-testid="text-quote-subtitle">
              Preencha o formulário abaixo e envie diretamente pelo WhatsApp.
              Nossa equipe retornará com a melhor proposta para a sua operação.
            </p>

            <div className="mt-8 space-y-4">
              {[
                { icon: CheckCircle2, text: "Resposta rápida via WhatsApp" },
                { icon: CheckCircle2, text: "Cotação sem compromisso" },
                { icon: CheckCircle2, text: "Atendimento personalizado" },
              ].map((item, idx) => (
                <div key={item.text} className="flex items-center gap-3" data-testid={`text-quote-benefit-${idx}`}>
                  <item.icon className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground/80">{item.text}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="p-6 sm:p-8 border-border/50 bg-card" data-testid="card-escort-form">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="origem" className="text-sm font-medium text-foreground mb-2 block" data-testid="label-origem">
                    Origem
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="origem"
                      value={origem}
                      onChange={(e) => setOrigem(e.target.value)}
                      placeholder="Cidade / Estado de origem"
                      className="pl-10"
                      aria-label="Origem"
                      data-testid="input-origem"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="destino" className="text-sm font-medium text-foreground mb-2 block" data-testid="label-destino">
                    Destino
                  </label>
                  <div className="relative">
                    <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="destino"
                      value={destino}
                      onChange={(e) => setDestino(e.target.value)}
                      placeholder="Cidade / Estado de destino"
                      className="pl-10"
                      aria-label="Destino"
                      data-testid="input-destino"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="carga" className="text-sm font-medium text-foreground mb-2 block" data-testid="label-carga">
                    Carga / Tipo de Serviço
                  </label>
                  <div className="relative">
                    <Package className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Textarea
                      id="carga"
                      value={carga}
                      onChange={(e) => setCarga(e.target.value)}
                      placeholder="Descreva a carga ou tipo de serviço desejado"
                      className="pl-10 min-h-[100px] resize-none"
                      aria-label="Carga ou tipo de serviço"
                      data-testid="input-carga"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2"
                  disabled={!isValid}
                  data-testid="button-submit-quote"
                >
                  <SiWhatsapp className="w-5 h-5" />
                  Enviar via WhatsApp
                </Button>
              </form>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section id="contato" className="py-20 sm:py-28 bg-[hsl(220,12%,10%)]" data-testid="section-contact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <div className="flex items-center gap-3 justify-center mb-4 flex-wrap">
            <div className="h-px w-10 bg-primary" />
            <span className="text-primary text-sm font-semibold tracking-widest uppercase">
              Fale conosco
            </span>
            <div className="h-px w-10 bg-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white" data-testid="text-contact-title">
            Entre em Contato
          </h2>
          <p className="mt-4 text-white/50" data-testid="text-contact-subtitle">
            Estamos prontos para atender sua demanda de segurança. Fale com nossos especialistas.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 lg:gap-8 max-w-4xl mx-auto">
          {[
            {
              icon: Phone,
              title: "Telefone",
              value: "Ligue agora",
              sub: "Atendimento 24h",
            },
            {
              icon: SiWhatsapp,
              title: "WhatsApp",
              value: "Envie uma mensagem",
              sub: "Resposta rápida",
            },
            {
              icon: Send,
              title: "E-mail",
              value: "contato@torresvigilancia.com.br",
              sub: "Retorno em até 24h",
            },
          ].map((contact, i) => (
            <motion.div
              key={contact.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div
                className="text-center p-6 sm:p-8 rounded-md border border-white/10 bg-white/5 backdrop-blur-sm"
                data-testid={`card-contact-${contact.title.toLowerCase()}`}
              >
                <div className="w-12 h-12 rounded-md bg-primary/15 flex items-center justify-center mx-auto mb-4">
                  <contact.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1" data-testid={`text-contact-title-${contact.title.toLowerCase()}`}>{contact.title}</h3>
                <p className="text-sm text-white/70 mb-1" data-testid={`text-contact-value-${contact.title.toLowerCase()}`}>{contact.value}</p>
                <p className="text-xs text-white/40">{contact.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[hsl(220,12%,7%)] border-t border-white/5 py-10" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoPath} alt="Torres" className="h-8 w-auto" data-testid="img-footer-logo" />
          </div>
          <p className="text-xs text-white/30 text-center" data-testid="text-footer-cnpj">
            Torres Vigilância Patrimonial — CNPJ 36.982.392/0001-89 — Todos os direitos reservados
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <AboutSection />
      <ServicesSection />
      <EscortCalculator />
      <ContactSection />
      <Footer />
    </div>
  );
}
