import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Shield, Eye, EyeOff, UserPlus, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [changePasswordMode, setChangePasswordMode] = useState(false);
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: setupCheck, isLoading: checkingSetup } = useQuery<{ needsSetup: boolean }>({
    queryKey: ["/api/auth/setup-check"],
  });

  const needsSetup = setupCheck?.needsSetup ?? false;

  useEffect(() => {
    if (user && !changePasswordMode) {
      if (user.mustChangePassword === 1) {
        setChangePasswordMode(true);
      } else {
        setLocation("/admin/dashboard");
      }
    }
  }, [user, setLocation, changePasswordMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedUser = await login(username, password);
      if (loggedUser?.mustChangePassword === 1) {
        setChangePasswordMode(true);
      }
    } catch (err: any) {
      toast({
        title: "Erro ao entrar",
        description: err.message || "Credenciais inválidas",
        variant: "destructive",
      });
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
      setChangePasswordMode(false);
      window.location.href = "/admin/dashboard";
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
      const res = await apiRequest("POST", "/api/auth/setup", { username, password, name });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/setup-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Conta criada com sucesso!", description: `Bem-vindo, ${data.name}!` });
      window.location.href = "/admin/dashboard";
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

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (changePasswordMode) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-neutral-900 border-neutral-800 p-8" data-testid="card-change-password">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-white" data-testid="text-change-password-title">
              Alterar Senha
            </h1>
            <p className="text-sm text-white/40 mt-1">Torres Vigilância Patrimonial</p>
            <p className="text-xs text-white/30 mt-2 text-center max-w-[280px]">
              No primeiro acesso, é obrigatório criar uma nova senha por segurança.
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
              className="w-full bg-white text-black hover:bg-white/90"
              disabled={loading}
              data-testid="button-change-password"
            >
              {loading ? "Salvando..." : "Definir Nova Senha"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-neutral-900 border-neutral-800 p-8" data-testid="card-login">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
            {needsSetup ? (
              <UserPlus className="w-6 h-6 text-white/60" />
            ) : (
              <Shield className="w-6 h-6 text-white/60" />
            )}
          </div>
          <h1 className="text-xl font-bold text-white" data-testid="text-login-title">
            {needsSetup ? "Configuração Inicial" : "Área Interna"}
          </h1>
          <p className="text-sm text-white/40 mt-1">Torres Vigilância Patrimonial</p>
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
              <label className="text-xs text-white/40 mb-1.5 block">Usuário</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                placeholder="Escolha um nome de usuário"
                required
                data-testid="input-username"
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
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Usuário</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                placeholder="Seu usuário"
                required
                data-testid="input-username"
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
              className="w-full bg-white text-black hover:bg-white/90"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
