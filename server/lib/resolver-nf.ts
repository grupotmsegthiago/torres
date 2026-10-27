import { z } from "zod";
import { isValidCnpj, sanitizeComplement } from "./focus-nfe-helpers";

const tomadorSchema = z.object({
  cnpj: z.string().transform((v) => v.replace(/\D/g, "")).refine(isValidCnpj, "CNPJ inválido"),
  razaoSocial: z.string().trim().min(3, "Razão social obrigatória").max(115),
  inscricaoMunicipal: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email("E-mail do tomador inválido"),
  logradouro: z.string().trim().min(2, "Logradouro obrigatório").max(50, "Logradouro deve ter no máximo 50 caracteres"),
  numero: z.string().trim().min(1, "Número obrigatório").max(10, "Número deve ter no máximo 10 caracteres"),
  complemento: z.string().trim().max(30, "Complemento deve ter no máximo 30 caracteres").optional().or(z.literal("")),
  bairro: z.string().trim().min(2, "Bairro obrigatório").max(30, "Bairro deve ter no máximo 30 caracteres"),
  cep: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 8, "CEP deve ter 8 dígitos"),
  codigoIbge: z.string().regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos"),
  uf: z.string().trim().toUpperCase().length(2, "UF inválida"),
});

export const resolverNfSchema = z.object({
  email: z.string().optional(),
  complemento: z.string().optional(),
  outroCnpj: z.boolean().optional().default(false),
  tomador: tomadorSchema.optional(),
}).superRefine((val, ctx) => {
  if (val.outroCnpj && !val.tomador) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe os dados do outro CNPJ", path: ["tomador"] });
  }
});

export type ResolverNfInput = z.infer<typeof resolverNfSchema>;

export function parseResolverNfBody(body: unknown): { ok: true; data: ResolverNfInput } | { ok: false; message: string } {
  const parsed = resolverNfSchema.safeParse(body || {});
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Dados do tomador inválidos";
    return { ok: false, message };
  }
  if (!parsed.data.outroCnpj) {
    const emails = String(parsed.data.email || "").split(/[;,]\s*/).map((e) => e.trim()).filter(Boolean);
    const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    if (emails.length === 0 || !emails.every(emailValido)) {
      return { ok: false, message: "Informe um e-mail válido (separe vários por vírgula)." };
    }
  }
  return { ok: true, data: parsed.data };
}

export function billingOverrideFromTomador(tomador: NonNullable<ResolverNfInput["tomador"]>) {
  return {
    billing_cnpj: tomador.cnpj,
    billing_razao_social: tomador.razaoSocial.replace(/\s+/g, " ").trim().slice(0, 255),
    billing_inscricao_municipal: String(tomador.inscricaoMunicipal || "").replace(/\D/g, "").slice(0, 20) || null,
    billing_email: tomador.email,
    billing_logradouro: tomador.logradouro.replace(/\s+/g, " ").trim().slice(0, 50),
    billing_numero: tomador.numero.trim().slice(0, 10),
    billing_complemento: sanitizeComplement(tomador.complemento) || null,
    billing_bairro: tomador.bairro.replace(/\s+/g, " ").trim().slice(0, 30),
    billing_cep: tomador.cep,
    billing_codigo_ibge: tomador.codigoIbge,
    billing_uf: tomador.uf.toUpperCase(),
    updated_at: new Date().toISOString(),
  };
}

export const BILLING_OVERRIDE_CLEAR = {
  billing_cnpj: null,
  billing_razao_social: null,
  billing_inscricao_municipal: null,
  billing_email: null,
  billing_logradouro: null,
  billing_numero: null,
  billing_complemento: null,
  billing_bairro: null,
  billing_cep: null,
  billing_codigo_ibge: null,
  billing_uf: null,
};
