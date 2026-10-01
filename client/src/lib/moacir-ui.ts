import { isMoacirRestrito } from "@shared/moacir-escopo";

let hidden = false;

export function syncMoacirUi(user: { id?: number | string | null; email?: string | null; name?: string | null; role?: string | null } | null | undefined) {
  hidden = isMoacirRestrito(user);
}

export function moacirHidesSensitive(): boolean {
  return hidden;
}
