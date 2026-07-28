#!/usr/bin/env bash
# Preferível no Windows/macOS/Linux: npm run env:push-vercel
# Este wrapper só delega ao script Node seguro (não imprime valores).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/push-env-vercel-safe.mjs "$@"
