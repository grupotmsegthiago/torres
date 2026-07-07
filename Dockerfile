# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Torres — imagem para deploy em servidor persistente (Railway)
# Roda o servidor HTTP + crons via: node dist/index.cjs
# ─────────────────────────────────────────────────────────────

# ---------- Stage 1: build ----------
FROM node:20-slim AS builder

# Variáveis do frontend (Vite injeta no bundle em tempo de build).
# No Railway: declare cada ARG aqui + Service Variables no painel (sem .env no container).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_MAPS_API_KEY
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY

WORKDIR /app

# Instala TODAS as dependências (inclui devDeps: vite, esbuild, tsx) para o build.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copia o código e gera dist/ (client em dist/public + server em dist/index.cjs).
COPY . .
# Espelha SUPABASE_* → VITE_* se só as do servidor estiverem definidas.
RUN VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-$SUPABASE_URL}" \
    VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-$SUPABASE_ANON_KEY}" \
    VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" \
    SUPABASE_URL="$SUPABASE_URL" \
    SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
    npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-slim AS runner

# sharp precisa de libvips no Debian slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends libvips \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

WORKDIR /app

# Copia node_modules do builder (o bundle externaliza deps como sharp,
# @supabase, etc., então elas precisam existir em runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
