#!/usr/bin/env bash
# Configuração completa do Railway: vars + deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

RAILWAY="npx --yes @railway/cli"
if command -v railway >/dev/null 2>&1; then
  RAILWAY="railway"
fi

echo "=== Torres — setup Railway ==="

if ! $RAILWAY whoami >/dev/null 2>&1; then
  echo ""
  echo "1. Autentique no Railway:"
  echo "   npx @railway/cli login"
  echo ""
  exit 1
fi

echo "Logado como: $($RAILWAY whoami 2>/dev/null || echo '?')"

if ! $RAILWAY status >/dev/null 2>&1; then
  echo ""
  echo "2. Vincule ao projeto (escolha o serviço Torres no menu):"
  echo "   npx @railway/cli link"
  echo ""
  exit 1
fi

echo ""
echo "3. Enviando variáveis..."
bash scripts/push-env-railway.sh

echo ""
echo "4. Deploy..."
$RAILWAY up --detach

echo ""
echo "5. Domínio público:"
$RAILWAY domain 2>/dev/null || echo "   Gere em: Railway → Settings → Networking → Generate Domain"
echo ""
echo "Teste: curl \$(npx @railway/cli domain)/healthz"
