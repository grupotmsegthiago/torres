#!/usr/bin/env bash
# Envia variáveis para o Railway (padrão Replit, sem PORT).
# Pré-requisitos: railway login (ou RAILWAY_TOKEN) + railway link
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".railway.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Gerando $ENV_FILE..."
  npm run export-env:railway >/dev/null
fi

RAILWAY="npx --yes @railway/cli"
if command -v railway >/dev/null 2>&1; then
  RAILWAY="railway"
fi

if ! $RAILWAY whoami >/dev/null 2>&1; then
  echo "Não autenticado. Rode: npx @railway/cli login"
  exit 1
fi

echo "Enviando variáveis de $ENV_FILE para o Railway..."
count=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key="$(echo "$key" | sed 's/[[:space:]]*$//')"
  val="$(echo "$val" | sed 's/^[[:space:]]*//')"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  [[ -z "$key" || -z "$val" ]] && continue
  [[ "$key" == "PORT" ]] && continue
  $RAILWAY variables --set "${key}=${val}" >/dev/null
  echo "  + $key"
  count=$((count + 1))
done < "$ENV_FILE"

echo ""
echo "Concluído: $count variáveis enviadas."
echo "Próximo passo: npx @railway/cli up --detach  (ou Redeploy no painel)"
