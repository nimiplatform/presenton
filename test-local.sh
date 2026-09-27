#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
pnpm install --frozen-lockfile
pnpm setup:backend
pnpm exec nimi-app check
pnpm test
pnpm --dir servers/nextjs run lint
pnpm --dir servers/nextjs exec cypress install
pnpm --dir servers/nextjs exec cypress run --component --browser electron
