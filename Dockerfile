# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Torres — imagem para deploy em servidor persistente (Railway)
# Roda o servidor HTTP + crons via: node dist/index.cjs
# ─────────────────────────────────────────────────────────────

# ---------- Stage 1: build ----------
FROM node:20-slim AS builder

# Variáveis do frontend (Vite as injeta no bundle em tempo de build).
# No Railway, defina-as como Service Variables — o build as recebe automaticamente.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

WORKDIR /app

# Instala TODAS as dependências (inclui devDeps: vite, esbuild, tsx) para o build.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copia o código e gera dist/ (client em dist/public + server em dist/index.cjs).
COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-slim AS runner

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
# PORT é injetado pelo Railway; 5000 é só fallback local.
ENV PORT=5000

WORKDIR /app

# Copia node_modules do builder (o bundle externaliza deps como sharp,
# @supabase, etc., então elas precisam existir em runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 5000

CMD ["node", "dist/index.cjs"]
