#!/bin/bash
set -e
npm install --prefer-offline --no-audit --no-fund
yes "No, add the constraint without truncating the table" | npx drizzle-kit push --force 2>&1 || true
