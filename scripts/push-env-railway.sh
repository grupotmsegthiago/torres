#!/usr/bin/env bash
# Envia variáveis do .env para o Railway — apenas padrão Replit (use npm run import-env:replit antes).
# Pré-requisitos:
#   npm install -g @railway/cli
#   railway login
#   railway link
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Arquivo .env não encontrado."
  echo "Rode primeiro: npm run import-env:replit"
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "CLI do Railway não encontrado. Instale com:"
  echo "  npm install -g @railway/cli"
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Execute primeiro: railway login"
  exit 1
fi

echo "Enviando variáveis do .env para o Railway..."
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
  railway variables --set "${key}=${val}" >/dev/null
  echo "  + $key"
  count=$((count + 1))
done < .env

echo ""
echo "Concluído: $count variáveis enviadas."
echo "Próximo passo: redeploy no painel Railway ou 'railway up'"
