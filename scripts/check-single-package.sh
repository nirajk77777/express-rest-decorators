#!/usr/bin/env bash
# BUILD-06 lock: single-package repo invariant.
# Fails the build if a packages/ directory or pnpm-workspace.yaml ever appears.
# Per CLAUDE.md Direction Override (2026-05-08) + REQUIREMENTS.md BUILD-06.
set -euo pipefail

fail=0

if [ -d "packages" ]; then
  echo "ERROR: packages/ directory exists — single-package rule (BUILD-06) violated" >&2
  fail=1
fi

if [ -f "pnpm-workspace.yaml" ] || [ -f "pnpm-workspace.yml" ]; then
  echo "ERROR: pnpm-workspace.yaml exists — single-package rule (BUILD-06) violated" >&2
  fail=1
fi

if grep -q '"workspaces"' package.json 2>/dev/null; then
  echo "ERROR: package.json contains a \"workspaces\" field — single-package rule (BUILD-06) violated" >&2
  fail=1
fi

if [ $fail -eq 0 ]; then
  echo "BUILD-06 single-package invariant: OK"
fi

exit $fail
