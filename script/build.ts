import "dotenv/config";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

const REQUIRED_CLIENT_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

/** Na Vercel muitos projetos só definem SUPABASE_* — espelha para VITE_* no build. */
function mirrorSupabaseEnvForVite() {
  if (!process.env.VITE_SUPABASE_URL?.trim() && process.env.SUPABASE_URL?.trim()) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL.trim();
  }
  if (!process.env.VITE_SUPABASE_ANON_KEY?.trim() && process.env.SUPABASE_ANON_KEY?.trim()) {
    process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY.trim();
  }
}

function assertClientEnv() {
  mirrorSupabaseEnvForVite();
  const missing = REQUIRED_CLIENT_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    console.error(
      "\n[build] ERRO: variáveis de ambiente obrigatórias ausentes para o frontend:\n" +
        missing.map((k) => `  - ${k}`).join("\n") +
        "\n\nConfigure-as na Vercel (Settings → Environment Variables) antes do deploy.\n",
    );
    process.exit(1);
  }
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  assertClientEnv();

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Cron: bundle ESM (imports ../server/*.ts não resolvem em runtime na Vercel).
  console.log("building Vercel cron handler...");
  await esbuild({
    entryPoints: ["api/_cron.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "api/cron.handler.js",
    packages: "external",
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
