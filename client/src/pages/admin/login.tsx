import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff, UserPlus, Lock, FileCheck, User, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { queryClient, apiRequest } from "@/lib/queryClient";

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isCpfInput(value: string) {
  return /^\d/.test(value.trim()) || value.includes(".");
}

const TERMS_TEXT = `TERMO DE USO E CONFIDENCIALIDADE DO SISTEMA OPERACIONAL
TORRES VIGILÂNCIA PATRIMONIAL LTDA
CNPJ: 36.982.392/0001-89

1. OBJETO
O presente Termo regula o uso do Sistema Operacional de Gestão de Escoltas ("Sistema") disponibilizado pela TORRES VIGILÂNCIA PATRIMONIAL LTDA ("Empresa") aos seus colaboradores ("Usuário").

2. ACEITE E VINCULAÇÃO
Ao acessar o Sistema, o Usuário declara ter lido, compreendido e aceito integralmente os termos aqui estabelecidos. O aceite digital possui validade jurídica nos termos da Lei nº 14.063/2020 e do Marco Civil da Internet (Lei nº 12.965/2014).

3. CONFIDENCIALIDADE
3.1. O Usuário compromete-se a manter sigilo absoluto sobre todas as informações acessadas através do Sistema, incluindo, mas não se limitando a: dados de clientes, rotas de escolta, informações operacionais, dados de veículos, dados pessoais de terceiros e quaisquer informações de caráter estratégico ou comercial.
3.2. O Usuário reconhece que as informações contidas no Sistema constituem segredo empresarial nos termos da Lei nº 9.279/1996 (Lei de Propriedade Industrial).
3.3. A obrigação de sigilo permanece vigente mesmo após o encerramento do vínculo empregatício, pelo prazo mínimo de 5 (cinco) anos.

4. USO ADEQUADO DO SISTEMA
4.1. O acesso ao Sistema é pessoal e intransferível. O Usuário é o único responsável por todas as ações realizadas com suas credenciais.
4.2. É expressamente proibido: compartilhar credenciais de acesso; capturar, copiar ou reproduzir telas ou dados do Sistema; transferir informações do Sistema para terceiros ou dispositivos pessoais não autorizados; utilizar as informações para finalidades distintas das atividades profissionais.
4.3. O Sistema registra automaticamente todas as ações do Usuário, incluindo: páginas acessadas, horários de acesso, endereço IP, dispositivo utilizado e localização geográfica.

5. MONITORAMENTO E AUDITORIA
5.1. O Usuário está ciente e concorda que toda a utilização do Sistema é monitorada e registrada em log de auditoria permanente.
5.2. O Sistema aplica marca d'água digital com identificação do Usuário em todas as telas, servindo como prova de autoria em caso de captura de tela ou fotografia.
5.3. A Empresa reserva-se o direito de auditar o uso do Sistema a qualquer momento, sem necessidade de aviso prévio.

6. PROTEÇÃO DE DADOS (LGPD)
6.1. O Usuário compromete-se a tratar os dados pessoais acessados no Sistema em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
6.2. Qualquer incidente de segurança envolvendo dados pessoais deve ser comunicado imediatamente à Empresa.

7. RESPONSABILIDADE E PENALIDADES
7.1. O descumprimento de qualquer cláusula deste Termo poderá resultar em: advertência formal; suspensão do acesso ao Sistema; rescisão do contrato de trabalho por justa causa, nos termos do Art. 482 da CLT; responsabilização civil por perdas e danos; responsabilização criminal, quando aplicável.
7.2. O Usuário responderá por todos os danos causados à Empresa ou a terceiros em decorrência do uso indevido das informações.

8. DISPOSIÇÕES GERAIS
8.1. Este Termo é regido pela legislação brasileira.
8.2. Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer questões.
8.3. O aceite digital deste Termo, com registro de data, hora, IP e identificação do dispositivo, constitui prova válida e eficaz da manifestação de vontade do Usuário.`;

export default function LoginPage() {
  const [loginMode, setLoginMode] = useState<"funcionario" | "interno">("funcionario");
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: setupCheck, isLoading: checkingSetup } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/auth/setup-check"],
  });

  const needsSetup = setupCheck?.needsSetup ?? false;

  useEffect(() => {
    if (user && !user.mustChangePassword && !showTerms) {
      if (user.role === "funcionario" && !user.termsAcceptedAt) {
        setShowTerms(true);
        return;
      }
      if (user.role === "funcionario") {
        apiRequest("GET", "/api/auth/login-selfie-today")
          .then(r => r.ok ? r.json() : { hasSelfieToday: false })
          .then(data => {
            if (!data.hasSelfieToday) {
              setLocation("/mobile/selfie");
            } else {
              setLocation("/mobile");
            }
          })
          .catch(() => setLocation("/mobile"));
      } else {
        setLocation("/admin/dashboard");
      }
    }
    if (user && user.mustChangePassword) {
      setChangingPassword(true);
    }
  }, [user, setLocation, showTerms]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let emailToUse = credential.trim();

      if (loginMode === "funcionario") {
        const cleanCpf = credential.replace(/\D/g, "");
        if (cleanCpf.length !== 11) {
          toast({ title: "CPF inválido", description: "Digite os 11 dígitos do CPF.", variant: "destructive" });
          setLoading(false);
          return;
        }
        const lookupRes = await fetch("/api/auth/cpf-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cpf: cleanCpf }),
        });
        if (!lookupRes.ok) {
          const err = await lookupRes.json().catch(() => ({}));
          throw new Error(err.message || "CPF não encontrado no sistema");
        }
        const { email } = await lookupRes.json();
        emailToUse = email;
      }

      const loggedUser = await login(emailToUse, password);
      if (loggedUser.mustChangePassword) {
        setChangingPassword(true);
      }
    } catch (err: any) {
      const msg = err.message || "Credenciais inválidas";
      toast({
        title: "Erro ao entrar",
        description: msg.includes("Invalid login") ? "Credenciais incorretas" : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: "funcionario" | "interno") => {
    setLoginMode(mode);
    setCredential("");
    setPassword("");
  };

  const handleAcceptTerms = async () => {
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/accept-terms", {});
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Termo aceito com sucesso!" });
      setShowTerms(false);
      setLocation("/mobile/selfie");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { newPassword });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Senha alterada com sucesso!" });
      setChangingPassword(false);
      if (user?.role === "funcionario") {
        if (!user.termsAcceptedAt) {
          setShowTerms(true);
        } else {
          setLocation("/mobile/selfie");
        }
      } else {
        setLocation("/admin/dashboard");
      }
    } catch (err: any) {
      toast({
        title: "Erro ao alterar senha",
        description: err.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/setup", {
        email: credential.trim(),
        password,
        name,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/setup-check"] });
      await login(credential.trim(), password);
      toast({ title: "Conta criada com sucesso!", description: `Bem-vindo, ${name}!` });
    } catch (err: any) {
      toast({
        title: "Erro ao criar conta",
        description: err.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
      setTermsScrolled(true);
    }
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (showTerms && user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg bg-neutral-900 border-neutral-800 p-6 max-h-[90vh] flex flex-col" data-testid="card-terms">
          <div className="flex flex-col items-center mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
              <FileCheck className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-lg font-bold text-white text-center" data-testid="text-terms-title">
              Termo de Uso e Confidencialidade
            </h1>
            <p className="text-xs text-white/40 mt-1 text-center">
              Leia atentamente e role até o final para aceitar
            </p>
          </div>

          <div
            className="flex-1 overflow-y-auto bg-white/5 rounded-xl p-4 mb-4 text-xs text-white/70 leading-relaxed whitespace-pre-wrap"
            onScroll={handleTermsScroll}
            data-testid="terms-content"
            style={{ maxHeight: "50vh" }}
          >
            {TERMS_TEXT}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] text-white/30 text-center">
              Ao clicar em "Li e Aceito", você confirma que leu e concorda com todos os termos acima.
              Este aceite será registrado com data, hora, IP e dispositivo.
            </p>
            <div className="flex items-center gap-2 bg-white/5 rounded-lg p-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-[10px] text-white/50">
                <strong className="text-white/70">{user.name}</strong> · CPF vinculado · {new Date().toLocaleDateString("pt-BR")} {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <Button
              onClick={handleAcceptTerms}
              className="w-full bg-green-600 text-white hover:bg-green-500 font-bold uppercase tracking-wider"
              disabled={loading || !termsScrolled}
              data-testid="button-accept-terms"
            >
              {loading ? "Registrando..." : !termsScrolled ? "Role até o final para aceitar" : "Li e Aceito os Termos"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (changingPassword && user) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-neutral-900 border-neutral-800 p-8" data-testid="card-change-password">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-amber-500" />
            </div>
            <h1 className="text-xl font-bold text-white" data-testid="text-change-password-title">
              Alterar Senha
            </h1>
            <p className="text-sm text-white/40 mt-1 text-center">
              Por segurança, altere sua senha temporária antes de continuar.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Nova Senha</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 pr-10"
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  data-testid="input-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Confirmar Nova Senha</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                placeholder="Repita a nova senha"
                required
                minLength={6}
                data-testid="input-confirm-new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-500 text-black hover:bg-amber-400 font-semibold"
              disabled={loading}
              data-testid="button-change-password"
            >
              {loading ? "Alterando..." : "Alterar Senha e Continuar"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-neutral-900 border-neutral-800 p-8" data-testid="card-login">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4">
            {needsSetup ? (
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-white/60" />
              </div>
            ) : (
              <img src="/logo-torres-dark.jpeg" alt="Torres Vigilância Patrimonial" className="w-28 h-28 object-contain rounded-xl" data-testid="img-login-logo" />
            )}
          </div>
          <h1 className="text-xl font-bold text-white" data-testid="text-login-title">
            {needsSetup ? "Configuração Inicial" : "Torres Vigilância"}
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {needsSetup ? "Torres Vigilância Patrimonial" : "Sistema Operacional"}
          </p>
          {needsSetup && (
            <p className="text-xs text-white/30 mt-2 text-center max-w-[280px]">
              Crie a conta do administrador principal para começar a usar o sistema.
            </p>
          )}
        </div>

        {needsSetup ? (
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Nome Completo</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                placeholder="Seu nome completo"
                required
                data-testid="input-name"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">E-mail</label>
              <Input
                type="email"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                placeholder="seu@email.com"
                required
                data-testid="input-email"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Senha</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 pr-10"
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Confirmar Senha</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                placeholder="Repita a senha"
                required
                minLength={6}
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-white text-black hover:bg-white/90"
              disabled={loading}
              data-testid="button-setup"
            >
              {loading ? "Criando conta..." : "Criar Conta de Administrador"}
            </Button>
          </form>
        ) : (
          <>
            <div className="flex rounded-lg bg-white/5 p-1 mb-6" data-testid="login-mode-tabs">
              <button
                type="button"
                onClick={() => switchMode("funcionario")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition-all ${
                  loginMode === "funcionario"
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white/80"
                }`}
                data-testid="tab-funcionario"
              >
                <User className="w-4 h-4" />
                Funcionário
              </button>
              <button
                type="button"
                onClick={() => switchMode("interno")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold transition-all ${
                  loginMode === "interno"
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white/80"
                }`}
                data-testid="tab-interno"
              >
                <Briefcase className="w-4 h-4" />
                Gestão
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">
                  {loginMode === "funcionario" ? "CPF" : "E-mail"}
                </label>
                {loginMode === "funcionario" ? (
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatCpf(credential)}
                    onChange={(e) => setCredential(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-lg tracking-wider"
                    placeholder="000.000.000-00"
                    required
                    data-testid="input-cpf"
                  />
                ) : (
                  <Input
                    type="email"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                    placeholder="seu@email.com"
                    required
                    data-testid="input-email"
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Senha</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 pr-10"
                    placeholder="••••••"
                    required
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-white text-black hover:bg-white/90 font-semibold"
                disabled={loading}
                data-testid="button-login"
              >
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
