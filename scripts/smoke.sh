#!/usr/bin/env bash
# Quick public-surface sanity check. Exits 0 if all routes return 2xx.
# Usage: ./scripts/smoke.sh [BASE_URL]   (default: http://localhost:3000)

set -euo pipefail

BASE="${1:-${BASE:-http://localhost:3000}}"
FAILS=0

check() {
  local path="$1"
  local expected="${2:-2}"
  local got
  got=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE$path")
  if [[ "$got" =~ ^$expected ]]; then
    printf "  \xE2\x9C\x94 %-50s %s\n" "$path" "$got"
  else
    printf "  \xE2\x9C\x97 %-50s %s (expected %sxx)\n" "$path" "$got" "$expected"
    FAILS=$((FAILS + 1))
  fi
}

echo "=== Public surface smoke (no auth) ==="
echo "Base: $BASE"
echo
check "/api/health"
check "/api/mock-anchor/stellar.toml"
check "/api/mock-anchor/sep24/info"
check "/api/mock-anchor/sep38/info"
echo
if [[ "$FAILS" -eq 0 ]]; then
  echo "All public routes OK."
  exit 0
else
  echo "Failed: $FAILS"
  exit 1
fi
