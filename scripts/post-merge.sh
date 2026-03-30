#!/bin/bash
set -e
npm install
echo "No, add the constraint without truncating the table" | npx drizzle-kit push --force 2>&1 || true
