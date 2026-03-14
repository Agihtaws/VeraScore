BASE="http://localhost:3001"
WALLET_A="0x16fe7e28314162b463dE747F61F7173D8a4c9f73"
WALLET_B="0x63eea403e3075D9e6b5eA18c28021e6FfdD04a67"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

sep() { echo -e "\n${BLUE}══════════════════════════════════════════════${NC}"; }
hdr() { sep; echo -e "${YELLOW}▶  $1${NC}"; sep; }

JQ=$(command -v jq 2>/dev/null && echo "jq ." || echo "cat")

run() {
  local label="$1" method="$2" url="$3"
  echo -e "\n${YELLOW}── $label${NC}"
  echo "    $method $url"
  if [ "$method" = "POST" ]; then
    RESP=$(curl -s -w "\nHTTP_%{http_code}" -X POST "$url")
  else
    RESP=$(curl -s -w "\nHTTP_%{http_code}" "$url")
  fi
  BODY=$(echo "$RESP" | head -n -1)
  CODE=$(echo "$RESP" | tail -n 1 | sed 's/HTTP_//')
  echo "$BODY" | $JQ 2>/dev/null || echo "$BODY"
  if   [ "$CODE" -ge 200 ] && [ "$CODE" -lt 300 ]; then echo -e "    ${GREEN}✔  HTTP $CODE${NC}"
  elif [ "$CODE" -ge 400 ] && [ "$CODE" -lt 500 ]; then echo -e "    ${YELLOW}⚠  HTTP $CODE (expected for invalid input)${NC}"
  else echo -e "    ${RED}✘  HTTP $CODE  ← ERROR${NC}"; fi
}

# ─────────────────────────────────────────────────────────────────
hdr "1. HEALTH"
run "GET /health" GET "$BASE/health"

# ─────────────────────────────────────────────────────────────────
hdr "2. BALANCES"
run "Wallet A — expect usdt>0, source=papi" GET "$BASE/balances/$WALLET_A"
run "Wallet B"                               GET "$BASE/balances/$WALLET_B"
run "Invalid → expect HTTP 400"             GET "$BASE/balances/0xDEAD"

# ─────────────────────────────────────────────────────────────────
hdr "3. VERIFY  (open CORS)"
run "Wallet A" GET "$BASE/verify/$WALLET_A"
run "Wallet B" GET "$BASE/verify/$WALLET_B"
run "Invalid → expect HTTP 400" GET "$BASE/verify/0xDEAD"

# ─────────────────────────────────────────────────────────────────
hdr "4. SCORE GET  (contract read — score + refreshAvailableAt)"
run "Wallet A" GET "$BASE/score/$WALLET_A"
run "Wallet B" GET "$BASE/score/$WALLET_B"

# ─────────────────────────────────────────────────────────────────
hdr "5. LEADERBOARD"
run "Top 10" GET "$BASE/score/leaderboard"

# ─────────────────────────────────────────────────────────────────
hdr "6. HISTORY"
run "Wallet B" GET "$BASE/score/history/$WALLET_B"

# ─────────────────────────────────────────────────────────────────
hdr "7. FEE INFO"
run "Wallet A" GET "$BASE/fee-info/$WALLET_A"

# ─────────────────────────────────────────────────────────────────
hdr "8. LENDING  (route is /lending/pool — not /pool-stats)"
run "Pool stats"             GET "$BASE/lending/pool"
run "Wallet A position"      GET "$BASE/lending/position/$WALLET_A"
run "Simulate \$1000 loan"   GET "$BASE/lending/simulate/$WALLET_A?amount=1000"

# ─────────────────────────────────────────────────────────────────
hdr "9. 404 CHECK"
run "Unknown route → expect 404" GET "$BASE/nonexistent-route"

# ─────────────────────────────────────────────────────────────────
hdr "10. RESPONSE TIMES  (pass = HTTP 2xx AND <5000ms)"
sep

RESULTS=()
check_time() {
  local label="$1" url="$2"
  START=$(date +%s%3N)
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  END=$(date +%s%3N)
  MS=$((END - START))
  if   [ "$CODE" -ge 500 ]; then
    echo -e "  ${RED}✘  ${MS}ms  HTTP $CODE  $label  ← 500 ERROR — check backend logs${NC}"
  elif [ "$MS" -gt 5000 ]; then
    echo -e "  ${RED}✘  ${MS}ms  HTTP $CODE  $label  ← SLOW (>5s)${NC}"
  elif [ "$CODE" -ge 400 ]; then
    echo -e "  ${YELLOW}⚠  ${MS}ms  HTTP $CODE  $label${NC}"
  else
    echo -e "  ${GREEN}✔  ${MS}ms  HTTP $CODE  $label${NC}"
  fi
}

check_time "/health"                      "$BASE/health"
check_time "/balances/$WALLET_A"          "$BASE/balances/$WALLET_A"
check_time "/verify/$WALLET_A"            "$BASE/verify/$WALLET_A"
check_time "/score/$WALLET_A"             "$BASE/score/$WALLET_A"
check_time "/score/leaderboard"           "$BASE/score/leaderboard"
check_time "/fee-info/$WALLET_A"          "$BASE/fee-info/$WALLET_A"
check_time "/lending/pool"                "$BASE/lending/pool"
check_time "/lending/position/$WALLET_A"  "$BASE/lending/position/$WALLET_A"

sep

# ─────────────────────────────────────────────────────────────────
hdr "11. SCORE POST  ⚠  SLOW — run manually when ready"
echo -e "  ${YELLOW}Skipped by default (20-60s, uses Mistral API credits).${NC}"
echo ""
echo "  Run manually:"
echo "    time curl -s -X POST $BASE/score/$WALLET_B | jq ."
echo ""
echo "  Expected: { success:true, data:{ wallet, score, signature, deadline, nonce, breakdown } }"
echo "  Flow: PAPI chain read(3-5s) → Mistral AI(15-40s) → EIP-712 sign(2s)"

sep
echo -e "${GREEN}✔  Done. Any HTTP 500 above = check 'npm run dev' backend terminal for the error.${NC}"
sep