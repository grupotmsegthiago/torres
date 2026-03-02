import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Shield, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      setLocation("/admin/dashboard");
    }
  }, [user, setLocation]);

  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
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

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-neutral-900 border-neutral-800 p-8" data-testid="card-login">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-white/60" />
          </div>
          <h1 className="text-xl font-bold text-white" data-testid="text-login-title">Área Interna</h1>
          <p className="text-sm text-white/40 mt-1">Torres Vigilância Patrimonial</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">Usuário</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
              placeholder="admin"
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
      </Card>
    </div>
  );
}
