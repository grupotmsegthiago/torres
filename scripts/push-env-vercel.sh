#!/usr/bin/env bash
# Envia variáveis não vazias do .env para a Vercel (production, preview, development).
# Pré-requisito: npx vercel login && npx vercel link
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Arquivo .env não encontrado."
  exit 1
fi

if ! npx vercel whoami &>/dev/null; then
  echo "Execute primeiro: npx vercel login"
  exit 1
fi

echo "Enviando variáveis do .env para a Vercel..."
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
  printf '%s' "$val" | npx vercel env add "$key" production preview development --force >/dev/null
  echo "  + $key"
  count=$((count + 1))
done < .env

echo "Concluído: $count variáveis enviadas."
echo "Rode um redeploy na Vercel ou execute: ./publicar.ps1"
