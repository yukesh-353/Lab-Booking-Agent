#!/usr/bin/env python3
"""
Connection check v2 — uses NextAuth session cookies instead of userId query param.
Tests every API endpoint, DB read/write, and AI agent integration.
"""
import requests
import json
import sys
import time
from urllib.parse import urlparse, parse_qs

BASE = "http://localhost:3000"
PASS = 0
FAIL = 0
RESULTS = []

def check(name, expected, actual):
    global PASS, FAIL
    actual_str = str(actual) if not isinstance(actual, str) else actual
    if expected in actual_str:
        PASS += 1
        RESULTS.append(f"✓ {name}")
    else:
        FAIL += 1
        RESULTS.append(f"✗ {name}")
        RESULTS.append(f"    expected: {expected}")
        RESULTS.append(f"    got:      {actual_str[:200]}")

def get_session(s):
    r = s.get(f"{BASE}/api/auth/session")
    return r.json()

def get_csrf(s):
    r = s.get(f"{BASE}/api/auth/csrf")
    return r.json().get("csrfToken")

def magic_link_login(s, email):
    """Sign in via email magic link using the dev mailbox."""
    csrf = get_csrf(s)
    # Step 1: request magic link
    r = s.post(f"{BASE}/api/auth/signin/email",
               data={"email": email, "csrfToken": csrf, "callbackUrl": "/"},
               allow_redirects=False)
    if r.status_code not in (200, 302):
        return False
    # Step 2: poll dev mailbox for the link
    for _ in range(10):
        time.sleep(1)
        r = s.get(f"{BASE}/api/auth/dev-mailbox", params={"email": email.lower()})
        data = r.json()
        if data.get("found") and data.get("url"):
            magic_url = data["url"]
            # Step 3: follow the magic link to verify
            r = s.get(magic_url, allow_redirects=True)
            return r.status_code == 200
    return False

print("=" * 50)
print(" LABBY CONNECTION CHECK v2 (NextAuth session-based)")
print("=" * 50)
print()

# ---- 1. Frontend page loads ----
r = requests.get(f"{BASE}/")
check("1. Frontend page renders (GET /)", "200", str(r.status_code))

# ---- 2. Unauthenticated API calls return 401 ----
r = requests.get(f"{BASE}/api/labs")
check("2a. Unauthenticated /api/labs returns 401", "401", str(r.status_code))
r = requests.get(f"{BASE}/api/bookings")
check("2b. Unauthenticated /api/bookings returns 401", "401", str(r.status_code))
r = requests.get(f"{BASE}/api/admin/stats")
check("2c. Unauthenticated /api/admin/stats returns 401", "401", str(r.status_code))
r = requests.post(f"{BASE}/api/chat", json={"message": "hi"})
check("2d. Unauthenticated /api/chat returns 401", "401", str(r.status_code))

# ---- 3. Login as Alice via magic link ----
alice_session = requests.Session()
ok = magic_link_login(alice_session, "alice@campus.edu")
check("3. Magic-link login as Alice", "True", str(ok))
sess = get_session(alice_session)
check("3b. Alice session has correct name", "Alice Chen", sess.get("user", {}).get("name", ""))
check("3c. Alice session has STUDENT role", "STUDENT", sess.get("user", {}).get("role", ""))
ALICE_ID = sess.get("user", {}).get("id", "")
print(f"  → Alice session user id: {ALICE_ID}")

# ---- 4. Authenticated /api/labs works ----
r = alice_session.get(f"{BASE}/api/labs")
check("4a. Authenticated /api/labs returns 200", "200", str(r.status_code))
labs_data = r.json()
check("4b. Labs list returns 4 labs", "4", str(len(labs_data.get("labs", []))))
LAB_A_ID = next((l["id"] for l in labs_data.get("labs", []) if "Lab A" in l["name"]), "")
check("4c. Lab A ID extracted", "cmr", LAB_A_ID[:3])

# ---- 5. Availability (DB read bookings + users) ----
r = alice_session.get(f"{BASE}/api/labs/{LAB_A_ID}/availability", params={"date": "2026-07-04"})
check("5. Availability returns slots", "slots", r.text)

# ---- 6. My bookings (DB read with session userId) ----
r = alice_session.get(f"{BASE}/api/bookings", params={"scope": "mine"})
check("6. My bookings (session-based)", "bookings", r.text)

# ---- 7. Student cannot view all bookings (permission) ----
r = alice_session.get(f"{BASE}/api/bookings", params={"scope": "all", "date": "2026-07-04"})
check("7. Student denied all-bookings (403)", "403", str(r.status_code))

# ---- 8. Student denied admin stats ----
r = alice_session.get(f"{BASE}/api/admin/stats")
check("8. Student denied admin stats (403)", "403", str(r.status_code))

# ---- 9. Create booking via API (DB write) ----
import datetime
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
r = alice_session.post(f"{BASE}/api/bookings", json={
    "labId": LAB_A_ID, "date": tomorrow, "startTime": "14:00", "endTime": "16:00", "purpose": "API test"
})
check("9. Create booking (DB write)", tomorrow, r.text)
NEW_BOOKING_ID = r.json().get("booking", {}).get("id", "")
print(f"  → New booking ID: {NEW_BOOKING_ID}")

# ---- 10. Self-overlap conflict detection ----
r = alice_session.post(f"{BASE}/api/bookings", json={
    "labId": LAB_A_ID, "date": tomorrow, "startTime": "15:00", "endTime": "17:00", "purpose": "Self overlap"
})
check("10a. Self-overlap conflict", "your existing booking", r.text)

# ---- 11. Cancel booking (DB update) ----
r = alice_session.delete(f"{BASE}/api/bookings/{NEW_BOOKING_ID}")
check("11. Cancel booking (DB update)", "CANCELLED", r.text)

# ---- 12. Chat → AI agent → DB write ----
r = alice_session.post(f"{BASE}/api/chat", json={
    "message": "Book Lab C tomorrow 14:00-16:00 for AI agent test", "history": []
})
check("12. Chat → AI agent creates booking", "Booking confirmed", r.text)

# ---- 13. Chat → AI agent lists labs ----
r = alice_session.post(f"{BASE}/api/chat", json={"message": "What labs are available?", "history": []})
check("13. Chat → AI agent lists labs", "Lab A", r.text)

# ---- 14. Chat → AI agent enforces role ----
r = alice_session.post(f"{BASE}/api/chat", json={
    "message": "Show me all bookings across campus for today", "history": []
})
check("14. Chat → AI agent denies student (role)", "only staff", r.text)

# ---- 15. Login as Admin ----
admin_session = requests.Session()
ok = magic_link_login(admin_session, "admin@campus.edu")
check("15. Magic-link login as Admin", "True", str(ok))
sess = get_session(admin_session)
check("15b. Admin session has ADMIN role", "ADMIN", sess.get("user", {}).get("role", ""))

# ---- 16. Admin can view all bookings ----
r = admin_session.get(f"{BASE}/api/bookings", params={"scope": "all", "date": "2026-07-04"})
check("16. Admin all-bookings (200)", "200", str(r.status_code))

# ---- 17. Admin stats ----
r = admin_session.get(f"{BASE}/api/admin/stats")
check("17a. Admin stats (200)", "200", str(r.status_code))
check("17b. Admin stats has totals", "totals", r.text)
check("17c. Admin stats has labUsage", "labUsage", r.text)
check("17d. Admin stats has recentActivity", "recentActivity", r.text)

# ---- 18. Cross-user cancel: admin can cancel student booking ----
# Alice makes a booking, admin cancels it
r = alice_session.post(f"{BASE}/api/bookings", json={
    "labId": LAB_A_ID, "date": tomorrow, "startTime": "09:00", "endTime": "10:00", "purpose": "For admin-cancel test"
})
test_booking_id = r.json().get("booking", {}).get("id", "")
if test_booking_id:
    r = admin_session.delete(f"{BASE}/api/bookings/{test_booking_id}")
    check("18. Admin cancels student booking", "CANCELLED", r.text)
else:
    check("18. Admin cancels student booking", "CANCELLED", "no booking created")

# ---- 19. Sign out ----
csrf = get_csrf(alice_session)
r = alice_session.post(f"{BASE}/api/auth/signout", data={"csrfToken": csrf, "callbackUrl": "/"}, allow_redirects=False)
check("19. Sign out (302 redirect)", "302", str(r.status_code))
sess = get_session(alice_session)
check("19b. Session cleared after signout", "True", str(not sess.get("user")))

# ---- 20. DB file healthy ----
import os
db_path = "/home/z/my-project/db/custom.db"
if os.path.exists(db_path):
    size = os.path.getsize(db_path)
    if size > 1000:
        PASS += 1
        RESULTS.append(f"✓ 20. Database file healthy ({size} bytes)")
    else:
        FAIL += 1
        RESULTS.append(f"✗ 20. Database file too small ({size} bytes)")
else:
    FAIL += 1
    RESULTS.append("✗ 20. Database file not found")

print()
print("=" * 50)
print(" RESULTS")
print("=" * 50)
for r in RESULTS:
    print(r)
print()
print("=" * 50)
print(f" SUMMARY: {PASS} passed, {FAIL} failed")
print("=" * 50)

sys.exit(1 if FAIL > 0 else 0)
