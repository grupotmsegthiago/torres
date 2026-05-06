#!/bin/bash
set -e

# Skip npm install when node_modules already matches package-lock.json.
if [ -f package-lock.json ] && [ -f node_modules/.package-lock.json ] && \
   cmp -s package-lock.json node_modules/.package-lock.json; then
  echo "[post-merge] node_modules in sync — skipping npm install"
else
  echo "[post-merge] package-lock.json changed — running npm install"
  npm install --prefer-offline --no-audit --no-fund
fi

# drizzle-kit push is interactive whenever it detects a possible rename.
# Always pick the highlighted default ("create column" / first option) by
# sending blank lines, so the script never hangs waiting for input.
yes "" | timeout 240 npx drizzle-kit push --force 2>&1 || true
