import { randomBytes } from "crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "@#$%&*!";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function pick(chars: string): string {
  return chars[randomBytes(1)[0] % chars.length]!;
}

/**
 * Senha temporária one-shot — apenas em memória.
 * Não logar, não persistir em public.users.
 */
export function generateTempPassword(length = 14): string {
  const len = Math.max(10, Math.min(64, Math.floor(length)));
  const chars: string[] = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < len) {
    chars.push(pick(ALL));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}
