import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Pencil, Trash2, Eye, EyeOff, Shield, Crown, UserCircle, Copy, Check, KeyRound } from "lucide-react";

type SafeUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  employeeId: number | null;
  mustChangePassword: number;
};

type CreatedUser = SafeUser & { tempPassword: string };

const ROLES = [
  { value: "admin", label: "Administrador", icon: Shield },
  { value: "diretoria", label: "Diretoria", icon: Crown },
  { value: "funcionario", label: "Funcionário", icon: UserCircle },
];

function getRoleInfo(role: string) {
  return ROLES.find((r) => r.value === role) || ROLES[2];
}

function CredentialCard({ user, onClose }: { user: CreatedUser; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const message = `🔐 Torres Vigilância Patrimonial — Acesso ao Sistema

Olá ${user.name},

Seu acesso ao sistema foi criado com sucesso.

📧 Login: ${user.username}
🔑 Senha: ${user.tempPassword}
🌐 Link: www.torresseguranca.com.br na Área Restrita

⚠️ No primeiro acesso, você deverá trocar sua senha por segurança.

Em caso de dúvidas, entre em contato com o suporte.

Torres Vigilância Patrimonial — Gestão Operacional`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast({ title: "Mensagem copiada!" });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="dialog-credentials">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-green-600" />
            Acesso Criado com Sucesso
          </DialogTitle>
        </DialogHeader>

        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed" data-testid="text-credential-message">
          {message}
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleCopy}
            data-testid="button-copy-credentials"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copiado!" : "Copiar Mensagem"}
          </Button>
          <Button onClick={onClose} className="flex-1" data-testid="button-close-credentials">
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SafeUser | null>(null);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);

  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("funcionario");
  const [showPassword, setShowPassword] = useState(false);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "diretoria";

  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; name: string; role: string }) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json() as Promise<CreatedUser>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCreatedUser(data);
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      await apiRequest("PATCH", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário atualizado" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário excluído" });
      setDeleteConfirm(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/users/${id}/reset-password`);
      return res.json() as Promise<{ tempPassword: string; name: string; username: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setCreatedUser({ ...data, id: 0, role: "", employeeId: null, mustChangePassword: 1 } as CreatedUser);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao resetar senha", description: err.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setEditingUser(null);
    setFormName("");
    setFormUsername("");
    setFormPassword("");
    setFormRole("funcionario");
    setShowPassword(false);
    setDialogOpen(true);
  }

  function openEdit(u: SafeUser) {
    setEditingUser(u);
    setFormName(u.name);
    setFormUsername(u.username);
    setFormPassword("");
    setFormRole(u.role);
    setShowPassword(false);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingUser(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUser) {
      const data: any = { name: formName, role: formRole };
      if (formPassword) data.password = formPassword;
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate({
        username: formUsername,
        name: formName,
        role: formRole,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="w-12 h-12 text-neutral-300 mb-3" />
          <p className="text-neutral-500">Acesso restrito a administradores</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900" data-testid="text-page-title">Usuários do Sistema</h1>
            <p className="text-sm text-neutral-500 mt-1">Gerencie os acessos ao sistema interno</p>
          </div>
          <Button onClick={openCreate} className="gap-2" data-testid="button-add-user">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-3 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <Card className="p-12 text-center">
            <UserCircle className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500">Nenhum usuário cadastrado</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {users.map((u) => {
              const roleInfo = getRoleInfo(u.role);
              const RoleIcon = roleInfo.icon;
              const isCurrentUser = currentUser?.id === u.id;

              return (
                <Card
                  key={u.id}
                  className="p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
                  data-testid={`card-user-${u.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      u.role === "diretoria" ? "bg-amber-50 text-amber-600" :
                      u.role === "admin" ? "bg-blue-50 text-blue-600" :
                      "bg-neutral-100 text-neutral-500"
                    }`}>
                      <RoleIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-900" data-testid={`text-user-name-${u.id}`}>
                          {u.name}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 font-medium">
                            VOCÊ
                          </span>
                        )}
                        {u.mustChangePassword === 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
                            PRIMEIRO ACESSO
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-neutral-500">
                        <span data-testid={`text-user-username-${u.id}`}>@{u.username}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === "diretoria" ? "bg-amber-50 text-amber-700" :
                          u.role === "admin" ? "bg-blue-50 text-blue-700" :
                          "bg-neutral-100 text-neutral-600"
                        }`} data-testid={`text-user-role-${u.id}`}>
                          {roleInfo.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isCurrentUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => resetPasswordMutation.mutate(u.id)}
                        className="text-neutral-400 hover:text-amber-600"
                        title="Resetar senha"
                        data-testid={`button-reset-password-${u.id}`}
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(u)}
                      className="text-neutral-400 hover:text-neutral-900"
                      data-testid={`button-edit-user-${u.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {!isCurrentUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirm(u)}
                        className="text-neutral-400 hover:text-red-600"
                        data-testid={`button-delete-user-${u.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {createdUser && (
        <CredentialCard user={createdUser} onClose={() => setCreatedUser(null)} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-user-form">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Nome Completo</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome do usuário"
                required
                data-testid="input-user-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-1.5 block">
                {editingUser ? "Nome de Usuário" : "Login de Acesso"}
              </label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder={editingUser ? "" : "ex: nome.sobrenome"}
                required
                disabled={!!editingUser}
                data-testid="input-user-username"
              />
              {editingUser ? (
                <p className="text-xs text-neutral-400 mt-1">O nome de usuário não pode ser alterado</p>
              ) : (
                <p className="text-xs text-neutral-400 mt-1">Uma senha aleatória será gerada automaticamente</p>
              )}
            </div>
            {editingUser && (
              <div>
                <label className="text-sm font-medium text-neutral-700 mb-1.5 block">
                  Nova Senha (deixe em branco para manter)
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••"
                    minLength={formPassword ? 6 : undefined}
                    className="pr-10"
                    data-testid="input-user-password"
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
            )}
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-1.5 block">Perfil</label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} data-testid={`option-role-${r.value}`}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-user">
                {isPending ? "Salvando..." : editingUser ? "Salvar Alterações" : "Criar Usuário"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm" data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Excluir Usuário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600">
            Tem certeza que deseja excluir o usuário <strong>{deleteConfirm?.name}</strong> (@{deleteConfirm?.username})?
            Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
