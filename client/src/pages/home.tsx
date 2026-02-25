import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Shield, Truck, Building2, Phone, MapPin, Navigation,
  Package, Send, Menu, X, ArrowRight, Eye, Radio,
  Users, Lock, ChevronLeft, ChevronRight
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import logoBW from "@assets/WhatsApp_Image_2026-02-25_at_20.09.04_1772061256501.jpeg";

const WHATSAPP_NUMBER = "5500000000000";

function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const links = [
    { label: "Inicio", href: "#hero" },
    { label: "Serviços", href: "#servicos" },
    { label: "Diferenciais", href: "#diferenciais" },
    { label: "Quem Somos", href: "#sobre" },
    { label: "Cotação", href: "#cotacao" },
    { label: "Contato", href: "#contato" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-black/95 backdrop-blur-md shadow-lg shadow-black/10"
          : "bg-transparent"
      }`}
      data-testid="nav-main"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-20">
          <a href="#hero" className="flex items-center gap-2 shrink-0" data-testid="link-home">
            <img
              src={logoBW}
              alt="Torres Vigilância Patrimonial"
              className="h-12 w-auto"
              data-testid="img-nav-logo"
            />
          </a>

          <div className="hidden lg:flex items-center gap-8 flex-wrap">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-[13px] font-medium text-white/60 tracking-wide uppercase transition-colors duration-200"
                data-testid={`link-nav-${l.label.toLowerCase()}`}
              >
                {l.label}
              </a>
            ))}
            <a href="#cotacao">
              <Button
                size="sm"
                className="bg-white text-black font-semibold uppercase text-xs tracking-wider"
                data-testid="button-nav-cta"
              >
                Solicitar Cotação
              </Button>
            </a>
          </div>

          <button
            className="lg:hidden p-2 text-white"
            onClick={() => setOpen(!open)}
            data-testid="button-mobile-menu"
            aria-label="Menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:hidden bg-black/95 backdrop-blur-md border-t border-white/5 pb-6"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="block px-6 py-3 text-sm font-medium text-white/60 uppercase tracking-wide"
              onClick={() => setOpen(false)}
              data-testid={`link-mobile-${l.label.toLowerCase()}`}
            >
              {l.label}
            </a>
          ))}
          <div className="px-6 pt-3">
            <a href="#cotacao" onClick={() => setOpen(false)}>
              <Button className="w-full bg-white text-black" size="sm" data-testid="button-mobile-cta">
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
      className="relative min-h-screen flex items-center overflow-hidden"
      data-testid="section-hero"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black via-neutral-950 to-black" />

      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
        backgroundSize: '40px 40px',
      }} />

      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-white/[0.02] to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-32 sm:py-40">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-white/50 text-xs font-medium tracking-wider uppercase" data-testid="text-hero-badge">
                Autorizada pela Policia Federal
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white leading-[1.05] tracking-tight" data-testid="text-hero-title">
              Garanta a segurança dos seus ativos
              <span className="block text-white/40 mt-2">com nossa equipe de especialistas</span>
            </h1>

            <p className="mt-8 text-base sm:text-lg text-white/35 max-w-lg leading-relaxed" data-testid="text-hero-subtitle">
              Especialistas em Vigilância Patrimonial, Escolta Armada e Gestão de
              Facilities com cobertura em todo o território nacional.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 flex-wrap">
              <a href="#cotacao">
                <Button size="lg" className="bg-white text-black font-semibold gap-2" data-testid="button-hero-cta">
                  Solicitar Cotação
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <a href="#servicos">
                <Button size="lg" variant="outline" className="border-white/15 text-white bg-white/5" data-testid="button-hero-services">
                  Nossos Serviços
                </Button>
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:flex items-center justify-center"
          >
            <Shield className="w-48 xl:w-56 h-48 xl:h-56 text-white/[0.06]" strokeWidth={0.8} data-testid="icon-hero-shield" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-20 pt-10 border-t border-white/5"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[
              { value: "5+", label: "Anos no mercado" },
              { value: "PF", label: "Autorização Federal" },
              { value: "24/7", label: "Operação contínua" },
              { value: "BR", label: "Cobertura nacional" },
            ].map((stat, idx) => (
              <div key={stat.label} className="text-center" data-testid={`stat-hero-${idx}`}>
                <div className="text-3xl sm:text-4xl font-bold text-white" data-testid={`text-stat-value-${idx}`}>{stat.value}</div>
                <div className="text-xs text-white/25 mt-2 uppercase tracking-wider" data-testid={`text-stat-label-${idx}`}>{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
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
      "Segurança ostensiva para empresas, condomínios e indústrias com foco em prevenção de riscos. Equipes treinadas e monitoramento contínuo.",
  },
  {
    id: "escolta",
    icon: Truck,
    title: "Escolta Armada",
    description:
      "Proteção de cargas e transporte de valores com equipes táticas altamente capacitadas, planejamento estratégico e rastreamento em tempo real.",
  },
  {
    id: "facilities",
    icon: Building2,
    title: "Facilities",
    description:
      "Gestão completa de serviços — limpeza, portaria e manutenção — para que você foque apenas no seu core business.",
  },
];

function ServicesSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.offsetWidth * 0.8;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section id="servicos" className="py-24 sm:py-32 bg-neutral-950" data-testid="section-services">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-14"
        >
          <div>
            <span className="text-white/25 text-xs font-semibold tracking-[0.2em] uppercase">
              O que fazemos
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mt-3" data-testid="text-services-title">
              Nossos Serviços
            </h2>
            <p className="mt-4 text-white/30 max-w-xl leading-relaxed" data-testid="text-services-subtitle">
              Em nossa jornada, mantemos o compromisso inabalável com a segurança.
              Nossa equipe é certificada e qualificada para oferecer serviços de alta qualidade.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="icon"
              variant="outline"
              className="border-white/10 text-white bg-white/5"
              onClick={() => scroll("left")}
              data-testid="button-services-prev"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="border-white/10 text-white bg-white/5"
              onClick={() => scroll("right")}
              data-testid="button-services-next"
              aria-label="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>

        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="min-w-[320px] sm:min-w-[380px] flex-1 snap-start"
            >
              <div
                className="group relative h-full p-8 sm:p-10 rounded-md border border-white/5 bg-white/[0.02] transition-all duration-300"
                data-testid={`card-service-${service.id}`}
              >
                <div className="w-14 h-14 rounded-md bg-white/5 flex items-center justify-center mb-6">
                  <service.icon className="w-7 h-7 text-white/60" />
                </div>
                <h3 className="text-xl font-bold text-white mb-4" data-testid={`text-service-title-${service.id}`}>
                  {service.title}
                </h3>
                <p className="text-white/30 text-sm leading-relaxed mb-8" data-testid={`text-service-desc-${service.id}`}>
                  {service.description}
                </p>
                <a
                  href="#cotacao"
                  className="inline-flex items-center gap-2 text-sm font-medium text-white/50 transition-colors duration-200"
                  data-testid={`link-service-more-${service.id}`}
                >
                  Saiba mais
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const diferenciais = [
  {
    icon: Lock,
    title: "Compromisso com a Segurança Total",
    description: "Oferecemos soluções abrangentes e personalizadas que garantem a proteção de seus ativos e a tranquilidade de sua operação.",
  },
  {
    icon: Radio,
    title: "Pronta Resposta Personalizada",
    description: "Equipe especializada com resposta ágil em situações de emergência, realizando averiguações e preservação com profissionalismo.",
  },
  {
    icon: Eye,
    title: "Monitoramento e Rastreamento",
    description: "Tecnologia de ponta com rastreamento de última geração, assegurando máxima segurança e monitoramento eficaz em tempo real.",
  },
  {
    icon: Users,
    title: "Equipes Altamente Capacitadas",
    description: "Profissionais treinados e certificados para atividades especializadas, priorizando segurança e eficiência em todas as operações.",
  },
];

function DiferenciaisSection() {
  return (
    <section id="diferenciais" className="py-24 sm:py-32 bg-white" data-testid="section-diferenciais">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-black/25 text-xs font-semibold tracking-[0.2em] uppercase">
            Por que nos escolher
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-black mt-3" data-testid="text-diferenciais-title">
            Nossos Diferenciais
          </h2>
          <p className="mt-4 text-black/35 leading-relaxed">
            Confie em nossa experiência e dedicação para manter seu negócio seguro e protegido em todos os momentos.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {diferenciais.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="text-center p-6 sm:p-8" data-testid={`card-diferencial-${i}`}>
                <div className="w-16 h-16 rounded-full bg-black/[0.04] flex items-center justify-center mx-auto mb-6">
                  <item.icon className="w-7 h-7 text-black/60" />
                </div>
                <h3 className="text-base font-bold text-black mb-3" data-testid={`text-diferencial-title-${i}`}>
                  {item.title}
                </h3>
                <p className="text-sm text-black/35 leading-relaxed" data-testid={`text-diferencial-desc-${i}`}>
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section id="sobre" className="py-24 sm:py-32 bg-white" data-testid="section-about">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="flex items-center justify-center">
              <img
                src={logoBW}
                alt="Torres Vigilância Patrimonial"
                className="max-w-[320px] w-full h-auto object-contain"
                style={{ imageRendering: "auto" }}
                data-testid="img-about-logo"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-black/25 text-xs font-semibold tracking-[0.2em] uppercase">
              Quem somos
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-black mt-3 leading-tight" data-testid="text-about-title">
              Quem Somos
            </h2>
            <p className="mt-6 text-base sm:text-lg text-black/40 leading-relaxed" data-testid="text-about-description">
              A Torres Vigilância Patrimonial se posiciona como um parceiro estratégico,
              dedicada a oferecer soluções de excelência em Vigilância Patrimonial,
              Escolta Armada e Gestão de Facilities em todo o território nacional.
            </p>
            <p className="mt-4 text-base text-black/35 leading-relaxed">
              Devidamente autorizada pela Policia Federal, nossa missão é garantir
              que cada projeto seja executado com máxima eficiência, confiabilidade
              e dentro dos mais altos padrões de segurança e qualidade.
            </p>
            <a href="#cotacao" className="mt-8 inline-block">
              <Button className="gap-2" data-testid="button-about-cta">
                Fale Conosco
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </motion.div>
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
    <section id="cotacao" className="py-24 sm:py-32 bg-black" data-testid="section-quote">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-white/25 text-xs font-semibold tracking-[0.2em] uppercase">
              Cotação rápida
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mt-3 leading-tight" data-testid="text-quote-title">
              Solicite sua Cotação de Escolta Armada
            </h2>
            <p className="mt-6 text-white/30 leading-relaxed" data-testid="text-quote-subtitle">
              Preencha o formulário ao lado e envie diretamente pelo WhatsApp.
              Nossa equipe retornará com a melhor proposta para a sua operação.
            </p>

            <div className="mt-10 space-y-5">
              {[
                "Resposta rápida via WhatsApp",
                "Cotação sem compromisso",
                "Atendimento personalizado 24/7",
              ].map((item, idx) => (
                <div key={item} className="flex items-center gap-4" data-testid={`text-quote-benefit-${idx}`}>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  </div>
                  <span className="text-sm text-white/40">{item}</span>
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
            <div className="p-8 sm:p-10 rounded-md border border-white/5 bg-white/[0.02]" data-testid="card-escort-form">
              <h3 className="text-lg font-semibold text-white mb-6">Preencha os dados</h3>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="origem" className="text-xs font-medium text-white/40 mb-2 block uppercase tracking-wider" data-testid="label-origem">
                    Origem
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <Input
                      id="origem"
                      value={origem}
                      onChange={(e) => setOrigem(e.target.value)}
                      placeholder="Cidade / Estado de origem"
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20"
                      aria-label="Origem"
                      data-testid="input-origem"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="destino" className="text-xs font-medium text-white/40 mb-2 block uppercase tracking-wider" data-testid="label-destino">
                    Destino
                  </label>
                  <div className="relative">
                    <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <Input
                      id="destino"
                      value={destino}
                      onChange={(e) => setDestino(e.target.value)}
                      placeholder="Cidade / Estado de destino"
                      className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20"
                      aria-label="Destino"
                      data-testid="input-destino"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="carga" className="text-xs font-medium text-white/40 mb-2 block uppercase tracking-wider" data-testid="label-carga">
                    Carga / Tipo de Serviço
                  </label>
                  <div className="relative">
                    <Package className="absolute left-3 top-3 w-4 h-4 text-white/20" />
                    <Textarea
                      id="carga"
                      value={carga}
                      onChange={(e) => setCarga(e.target.value)}
                      placeholder="Descreva a carga ou tipo de serviço"
                      className="pl-10 min-h-[100px] resize-none bg-white/5 border-white/10 text-white placeholder:text-white/20"
                      aria-label="Carga ou tipo de serviço"
                      data-testid="input-carga"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2 bg-white text-black font-semibold"
                  disabled={!isValid}
                  data-testid="button-submit-quote"
                >
                  <SiWhatsapp className="w-5 h-5" />
                  Enviar via WhatsApp
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section id="contato" className="py-24 sm:py-32 bg-neutral-950" data-testid="section-contact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="text-white/25 text-xs font-semibold tracking-[0.2em] uppercase">
            Fale conosco
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mt-3" data-testid="text-contact-title">
            Entre em Contato
          </h2>
          <p className="mt-4 text-white/25 leading-relaxed" data-testid="text-contact-subtitle">
            Estamos prontos para atender sua demanda de segurança.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
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
                className="text-center p-8 rounded-md border border-white/5 bg-white/[0.02]"
                data-testid={`card-contact-${contact.title.toLowerCase()}`}
              >
                <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-5">
                  <contact.icon className="w-6 h-6 text-white/40" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1" data-testid={`text-contact-title-${contact.title.toLowerCase()}`}>{contact.title}</h3>
                <p className="text-sm text-white/40 mb-1" data-testid={`text-contact-value-${contact.title.toLowerCase()}`}>{contact.value}</p>
                <p className="text-xs text-white/20">{contact.sub}</p>
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
    <footer className="bg-black border-t border-white/5" data-testid="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-12 grid sm:grid-cols-3 gap-8 items-center">
          <div>
            <img src={logoBW} alt="Torres" className="h-10 w-auto opacity-40" data-testid="img-footer-logo" />
          </div>
          <div className="text-center">
            <p className="text-xs text-white/20" data-testid="text-footer-cnpj">
              CNPJ 36.982.392/0001-89
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-white/15">
              Torres Vigilância Patrimonial — Todos os direitos reservados
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <HeroSection />
      <ServicesSection />
      <DiferenciaisSection />
      <AboutSection />
      <EscortCalculator />
      <ContactSection />
      <Footer />
    </div>
  );
}
