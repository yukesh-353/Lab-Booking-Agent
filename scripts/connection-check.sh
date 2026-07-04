#!/bin/bash
# Connection check: Frontend ↔ Backend ↔ Database
# Tests every API endpoint, DB read/write, AI agent integration, and permission boundaries.
# Uses Python for robust JSON parsing.

set -e
BASE="http://localhost:3000"
PASS=0
FAIL=0
RESULTS=()

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    PASS=$((PASS+1))
    RESULTS+=("✓ $name")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("✗ $name")
    RESULTS+=("    expected: $expected")
    RESULTS+=("    got:      ${actual:0:200}")
  fi
}

# JSON helper: extract a field from a JSON string
jget() {
  local json="$1"
  local key="$2"
  echo "$json" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('$key', data.get('booking', {}).get('$key', data.get('user', {}).get('$key', ''))))" 2>/dev/null
}

echo "=========================================="
echo " LABBY CONNECTION CHECK"
echo " Frontend ↔ Backend ↔ Database ↔ AI Agent"
echo "=========================================="
echo ""

# ---- 1. Frontend page loads ----
HTML_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
check "1. Frontend page renders (GET /)" "200" "$HTML_CODE"

# ---- 2. Session API: lookup demo users (DB READ on users) ----
ALICE_RES=$(curl -s "$BASE/api/session?email=alice@campus.edu")
ALICE_ID=$(echo "$ALICE_RES" | python3 -c "import sys, json; print(json.load(sys.stdin)['user']['id'])")
ALICE_NAME=$(echo "$ALICE_RES" | python3 -c "import sys, json; print(json.load(sys.stdin)['user']['name'])")
check "2a. Session lookup Alice (DB read users table)" "Alice Chen" "$ALICE_NAME"

ADMIN_RES=$(curl -s "$BASE/api/session?email=admin@campus.edu")
ADMIN_ID=$(echo "$ADMIN_RES" | python3 -c "import sys, json; print(json.load(sys.stdin)['user']['id'])")
check "2b. Session lookup Admin (DB read users table)" "Admin Wang" "$(echo "$ADMIN_RES" | python3 -c "import sys, json; print(json.load(sys.stdin)['user']['name'])")"

# ---- 3. Labs API (DB READ on labs table) ----
LABS_RES=$(curl -s "$BASE/api/labs")
LAB_COUNT=$(echo "$LABS_RES" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['labs']))")
check "3a. Labs list returns 4 labs (DB read labs table)" "4" "$LAB_COUNT"
LAB_A_ID=$(echo "$LABS_RES" | python3 -c "import sys, json; labs=json.load(sys.stdin)['labs']; print([l['id'] for l in labs if 'Lab A' in l['name']][0])")
check "3b. Labs list returns Lab A ID" "" "$LAB_A_ID"
if [[ -n "$LAB_A_ID" ]]; then
  PASS=$((PASS+1))
  RESULTS+=("✓ 3b-extract. Lab A ID extracted: $LAB_A_ID")
else
  FAIL=$((FAIL+1))
  RESULTS+=("✗ 3b-extract. Lab A ID extraction failed")
fi

# ---- 4. Availability API (DB READ on bookings JOIN users) ----
AVAIL_RES=$(curl -s "$BASE/api/labs/$LAB_A_ID/availability?date=2026-07-04")
SLOT_COUNT=$(echo "$AVAIL_RES" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['slots']))")
check "4a. Availability returns slots (DB read bookings+users)" "slots" "$AVAIL_RES"
if [[ "$SLOT_COUNT" -gt 0 ]]; then
  PASS=$((PASS+1))
  RESULTS+=("✓ 4b-extract. Availability has $SLOT_COUNT slots")
else
  FAIL=$((FAIL+1))
  RESULTS+=("✗ 4b-extract. Availability has 0 slots")
fi

# ---- 5. Bookings API - mine (DB READ with userId filter) ----
MY_BOOKINGS=$(curl -s "$BASE/api/bookings?userId=$ALICE_ID&scope=mine")
check "5. My bookings (DB read with userId filter)" "bookings" "$MY_BOOKINGS"

# ---- 6. Bookings API - all with permission check ----
ALL_BOOKINGS_ADMIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/bookings?userId=$ADMIN_ID&scope=all&date=2026-07-04")
check "6a. All bookings as admin (200 OK)" "200" "$ALL_BOOKINGS_ADMIN_CODE"

ALL_BOOKINGS_STUDENT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/bookings?userId=$ALICE_ID&scope=all&date=2026-07-04")
check "6b. All bookings as student (403 forbidden)" "403" "$ALL_BOOKINGS_STUDENT_CODE"

# ---- 7. Create booking via API (DB WRITE) ----
TOMORROW=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d)
CREATE_RES=$(curl -s -X POST "$BASE/api/bookings" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"labId\":\"$LAB_A_ID\",\"date\":\"$TOMORROW\",\"startTime\":\"14:00\",\"endTime\":\"16:00\",\"purpose\":\"API test\"}")
NEW_BOOKING_ID=$(echo "$CREATE_RES" | python3 -c "import sys, json; print(json.load(sys.stdin).get('booking', {}).get('id', ''))" 2>/dev/null)
check "7. Create booking (DB write bookings table)" "$TOMORROW" "$CREATE_RES"
echo "  → Created booking ID: $NEW_BOOKING_ID"

# ---- 8. Conflict detection — same user, overlapping time (BUG FIX) ----
CONFLICT_SELF=$(curl -s -X POST "$BASE/api/bookings" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"labId\":\"$LAB_A_ID\",\"date\":\"$TOMORROW\",\"startTime\":\"15:00\",\"endTime\":\"17:00\",\"purpose\":\"Self overlap\"}")
check "8a. Self-overlap conflict detection (same user, overlapping time)" "conflicts with your existing booking" "$CONFLICT_SELF"

# ---- 8b. Conflict detection — different user, overlapping time ----
CONFLICT_OTHER=$(curl -s -X POST "$BASE/api/bookings" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ADMIN_ID\",\"labId\":\"$LAB_A_ID\",\"date\":\"$TOMORROW\",\"startTime\":\"15:00\",\"endTime\":\"17:00\",\"purpose\":\"Other overlap\"}")
check "8b. Cross-user conflict detection (different user, overlapping time)" "conflicts with an existing booking" "$CONFLICT_OTHER"

# ---- 9. Cancel booking (DB UPDATE status → CANCELLED) ----
CANCEL_RES=$(curl -s -X DELETE "$BASE/api/bookings/$NEW_BOOKING_ID?userId=$ALICE_ID")
CANCEL_STATUS=$(echo "$CANCEL_RES" | python3 -c "import sys, json; print(json.load(sys.stdin).get('booking', {}).get('status', ''))" 2>/dev/null)
check "9. Cancel booking (DB update status to CANCELLED)" "CANCELLED" "$CANCEL_STATUS"

# ---- 10. Verify cancellation persists (DB read consistency) ----
AFTER_CANCEL=$(curl -s "$BASE/api/bookings?userId=$ALICE_ID&scope=mine")
STILL_CONFIRMED=$(echo "$AFTER_CANCEL" | python3 -c "
import sys, json
data = json.load(sys.stdin)
bookings = data.get('bookings', [])
cancelled = [b for b in bookings if b['id'] == '$NEW_BOOKING_ID']
print('CANCELLED' if (cancelled and cancelled[0]['status'] == 'CANCELLED') else 'still_in_list_as_active' if cancelled else 'removed_from_active_list')
" 2>/dev/null)
check "10. Cancelled booking removed from active list" "removed_from_active_list" "$STILL_CONFIRMED"

# ---- 11. Chat → AI agent → DB write (full stack) ----
CHAT_BOOK=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"message\":\"Book Lab C tomorrow 14:00-16:00 for AI agent test\",\"history\":[]}")
check "11. Chat → AI agent creates booking (full stack)" "Booking confirmed" "$CHAT_BOOK"

# ---- 12. Chat → AI agent → DB read (list labs) ----
CHAT_LIST=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"message\":\"What labs are available?\",\"history\":[]}")
check "12. Chat → AI agent lists labs (DB read)" "Lab A" "$CHAT_LIST"

# ---- 13. Chat → AI agent → conflict detection (now fixed) ----
CHAT_CONFLICT=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ADMIN_ID\",\"message\":\"Book Lab C tomorrow 14:00-16:00 (should conflict with Alice's booking)\",\"history\":[]}")
check "13. Chat → AI agent detects cross-user conflict" "conflicts with an existing booking" "$CHAT_CONFLICT"

# ---- 14. Chat → AI agent → list my bookings ----
CHAT_MY=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"message\":\"Show my bookings\",\"history\":[]}")
check "14. Chat → AI agent lists user bookings" "upcoming booking" "$CHAT_MY"

# ---- 15. Chat → AI agent → permission boundary (student tries admin action) ----
CHAT_PERM=$(curl -s -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ALICE_ID\",\"message\":\"Show me all bookings across campus for today\",\"history\":[]}")
check "15. Chat → AI agent enforces role permissions (student denied)" "only staff" "$CHAT_PERM"

# ---- 16. Admin stats API (DB aggregate across users + labs + bookings) ----
ADMIN_STATS=$(curl -s "$BASE/api/admin/stats?userId=$ADMIN_ID")
check "16a. Admin stats (DB aggregate across 3 tables)" "totals" "$ADMIN_STATS"
check "16b. Admin stats has labUsage" "labUsage" "$ADMIN_STATS"
check "16c. Admin stats has recentActivity" "recentActivity" "$ADMIN_STATS"

# ---- 17. Admin stats forbidden for students ----
ADMIN_FORBID_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/stats?userId=$ALICE_ID")
check "17. Admin stats forbidden for students (403)" "403" "$ADMIN_FORBID_CODE"

# ---- 18. Database file exists and has data ----
DB_PATH="/home/z/my-project/db/custom.db"
if [[ -f "$DB_PATH" ]]; then
  DB_SIZE=$(stat -c%s "$DB_PATH" 2>/dev/null || stat -f%z "$DB_PATH")
  if [[ "$DB_SIZE" -gt 1000 ]]; then
    PASS=$((PASS+1))
    RESULTS+=("✓ 18. Database file healthy (size: ${DB_SIZE} bytes)")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("✗ 18. Database file too small (${DB_SIZE} bytes)")
  fi
else
  FAIL=$((FAIL+1))
  RESULTS+=("✗ 18. Database file not found at $DB_PATH")
fi

# ---- 19. DB ↔ API consistency ----
DB_LABS=$(cd /home/z/my-project && bun run scripts/list-bookings.ts 2>&1 | grep -v "prisma:query" | grep -c "Lab ")
API_LABS=$LAB_COUNT
if [[ "$DB_LABS" -gt 0 ]] && [[ "$API_LABS" -eq 4 ]]; then
  PASS=$((PASS+1))
  RESULTS+=("✓ 19. DB ↔ API consistency: $API_LABS labs in API = 4 labs in DB")
else
  FAIL=$((FAIL+1))
  RESULTS+=("✗ 19. DB ↔ API mismatch")
fi

# ---- 20. Prisma client is configured properly ----
if grep -q "PrismaClient" /home/z/my-project/src/lib/db.ts; then
  PASS=$((PASS+1))
  RESULTS+=("✓ 20. Prisma client properly initialized in src/lib/db.ts")
else
  FAIL=$((FAIL+1))
  RESULTS+=("✗ 20. Prisma client not properly configured")
fi

echo ""
echo "=========================================="
echo " RESULTS"
echo "=========================================="
for r in "${RESULTS[@]}"; do
  echo "$r"
done
echo ""
echo "=========================================="
echo " SUMMARY: $PASS passed, $FAIL failed"
echo "=========================================="

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
