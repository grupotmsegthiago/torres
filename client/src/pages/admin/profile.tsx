import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Crown, Shield, UserCircle, Eye, EyeOff, Lock, Mail, User, KeyRound } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: perfilData } = useQuery<{ permissions: string[]; role: string }>({
    queryKey: ["/api/auth/perfil"],
    enabled: !!user,
  });

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { apiRequest } = await import("@/lib/queryClient");
      await apiRequest("POST", "/api/auth/change-password", { newPassword });
      toast({ title: "Senha alterada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
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

  if (!user) return null;

  const RoleIcon = user.role === "diretoria" ? Crown : user.role === "admin" ? Shield : UserCircle;
  const roleLabel = perfilData?.role || user.role;
  const permissions = perfilData?.permissions || [];

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-page-title">Meu Perfil</h1>
          <p className="text-sm text-neutral-500 mt-1">Informações da sua conta e permissões</p>
        </div>

        <Card className="p-6" data-testid="card-profile-info">
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
              user.role === "diretoria" ? "bg-amber-50 text-amber-600" :
              user.role === "admin" ? "bg-blue-50 text-blue-600" :
              "bg-neutral-100 text-neutral-500"
            }`}>
              <RoleIcon className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900" data-testid="text-profile-name">
                {user.name}
              </h2>
              <span className={`text-sm font-medium ${
                user.role === "diretoria" ? "text-amber-600" :
                user.role === "admin" ? "text-blue-600" :
                "text-neutral-500"
              }`} data-testid="text-profile-role">
                {roleLabel}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-neutral-400" />
              <span className="text-neutral-600" data-testid="text-profile-email">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-neutral-400" />
              <span className="text-neutral-600" data-testid="text-profile-id">ID: {user.id}</span>
            </div>
          </div>
        </Card>

        {permissions.length > 0 && (
          <Card className="p-6" data-testid="card-permissions">
            <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Permissões
            </h3>
            <div className="flex flex-wrap gap-2">
              {user.role === "diretoria" ? (
                <span className="text-sm px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 font-medium" data-testid="text-permission-all">
                  Acesso Total ao Sistema
                </span>
              ) : (
                permissions.map((perm: string) => (
                  <span
                    key={perm}
                    className="text-sm px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-700"
                    data-testid={`text-permission-${perm}`}
                  >
                    {perm}
                  </span>
                ))
              )}
            </div>
          </Card>
        )}

        <Card className="p-6" data-testid="card-change-password">
          <h3 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Alterar Senha
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Nova Senha</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="pr-10"
                  data-testid="input-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Confirmar Nova Senha</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                required
                minLength={6}
                data-testid="input-confirm-new-password"
              />
            </div>
            <Button type="submit" disabled={loading} data-testid="button-change-password">
              {loading ? "Salvando..." : "Alterar Senha"}
            </Button>
          </form>
        </Card>
      </div>
    </AdminLayout>
  );
}
