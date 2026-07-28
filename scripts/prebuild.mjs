/** Roda testes no prebuild local; na Vercel pula (fixtures locais podem faltar). */
import { spawnSync } from "child_process";

if (process.env.VERCEL === "1") {
  console.log("[prebuild] Vercel detectada — pulando npm test (já validado no CI/local).");
  process.exit(0);
}

const r = spawnSync("npm", ["test"], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
