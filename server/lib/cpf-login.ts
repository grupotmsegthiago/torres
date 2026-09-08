export const SYNTHETIC_CPF_EMAIL_RE = /^cpf_(\d+)@torresseguranca\.local$/i;

export function cleanCpfDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function isValidCpfDigits(cpf: string | null | undefined): boolean {
  return cleanCpfDigits(cpf).length === 11;
}

export function formatCpfMasked(cpf: string | null | undefined): string {
  const d = cleanCpfDigits(cpf);
  if (d.length !== 11) return String(cpf || "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function syntheticCpfEmail(cpf: string): string {
  return `cpf_${cleanCpfDigits(cpf)}@torresseguranca.local`;
}

export function parseCpfFromSyntheticEmail(email: string | null | undefined): string | null {
  const m = String(email || "").trim().match(SYNTHETIC_CPF_EMAIL_RE);
  return m ? m[1] : null;
}

export function isSyntheticCpfEmail(email: string | null | undefined): boolean {
  return parseCpfFromSyntheticEmail(email) !== null;
}

export type CpfLoginChangeOk = {
  ok: true;
  email: string;
  cpfMasked: string;
  changed: boolean;
  supabaseUid: string | null;
};

export type CpfLoginChangeErr = {
  ok: false;
  status: number;
  message: string;
};

export type CpfLoginChangeResult = CpfLoginChangeOk | CpfLoginChangeErr;

async function anotherUserHasEmail(email: string, exceptUserId: number): Promise<boolean> {
  const { storage } = await import("../storage");
  const existing = await storage.getUserByEmail(email);
  return !!existing && existing.id !== exceptUserId;
}

async function anotherEmployeeHasCpf(cpf: string, exceptEmployeeId: number | null): Promise<boolean> {
  const { supabaseAdmin } = await import("../supabase");
  const digits = cleanCpfDigits(cpf);
  const masked = formatCpfMasked(digits);
  let q = supabaseAdmin
    .from("employees")
    .select("id")
    .or(`cpf.eq.${digits},cpf.eq.${masked}`)
    .limit(1);
  if (exceptEmployeeId) q = q.neq("id", exceptEmployeeId);
  const { data } = await q.maybeSingle();
  return !!data;
}

/**
 * Atualiza o e-mail sintético de login (users + Auth) e, se pedido, o CPF do funcionário.
 * employees.cpf permanece o FATO; users.email é espelho de login.
 */
export async function applySyntheticCpfEmailChange(params: {
  userId: number;
  currentEmail: string | null;
  supabaseUid: string | null;
  employeeId: number | null;
  newCpf: string;
  syncEmployeeCpf: boolean;
}): Promise<CpfLoginChangeResult> {
  const { storage } = await import("../storage");
  const { supabaseAdmin } = await import("../supabase");
  const cleanCpf = cleanCpfDigits(params.newCpf);
  if (cleanCpf.length !== 11) {
    return { ok: false, status: 400, message: "CPF inválido" };
  }
  if (!isSyntheticCpfEmail(params.currentEmail)) {
    return { ok: false, status: 400, message: "Somente logins de CPF podem ser alterados neste campo" };
  }

  const newEmail = syntheticCpfEmail(cleanCpf);
  const cpfMasked = formatCpfMasked(cleanCpf);
  const currentEmail = String(params.currentEmail || "").toLowerCase();
  if (newEmail === currentEmail) {
    return { ok: true, email: newEmail, cpfMasked, changed: false, supabaseUid: params.supabaseUid };
  }

  if (await anotherUserHasEmail(newEmail, params.userId)) {
    return { ok: false, status: 409, message: "Já existe um acesso para este CPF" };
  }
  if (params.syncEmployeeCpf && (await anotherEmployeeHasCpf(cleanCpf, params.employeeId))) {
    return { ok: false, status: 409, message: "Já existe um funcionário com este CPF" };
  }

  const previousEmail = params.currentEmail!;
  if (params.supabaseUid) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(params.supabaseUid, {
      email: newEmail,
      email_confirm: true,
    });
    if (error) {
      return { ok: false, status: 500, message: "Erro ao atualizar login: " + error.message };
    }
  }

  try {
    const updated = await storage.updateUser(params.userId, { email: newEmail });
    if (!updated) {
      throw new Error("Usuário não encontrado");
    }
    if (params.syncEmployeeCpf && params.employeeId) {
      await storage.updateEmployee(params.employeeId, { cpf: cpfMasked });
    }
  } catch (err: any) {
    if (params.supabaseUid) {
      await supabaseAdmin.auth.admin.updateUserById(params.supabaseUid, {
        email: previousEmail,
        email_confirm: true,
      }).catch(() => {});
    }
    return { ok: false, status: 500, message: "Erro ao atualizar login: " + (err?.message || "falha local") };
  }

  return { ok: true, email: newEmail, cpfMasked, changed: true, supabaseUid: params.supabaseUid };
}

export async function syncLinkedUserSyntheticEmail(
  employeeId: number,
  newCpf: string,
): Promise<CpfLoginChangeResult | { ok: true; skipped: true }> {
  const { supabaseAdmin } = await import("../supabase");
  const { USER_SAFE_SELECT } = await import("./safe-user");
  const { data: user } = await supabaseAdmin
    .from("users")
    .select(USER_SAFE_SELECT)
    .eq("employee_id", employeeId)
    .limit(1)
    .maybeSingle();
  if (!user) return { ok: true, skipped: true };
  if (!isSyntheticCpfEmail(user.email)) return { ok: true, skipped: true };

  return applySyntheticCpfEmailChange({
    userId: user.id,
    currentEmail: user.email,
    supabaseUid: user.supabase_uid,
    employeeId,
    newCpf,
    syncEmployeeCpf: false,
  });
}
