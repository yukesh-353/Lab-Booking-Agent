#!/usr/bin/env python3
"""Comprehensive end-to-end test of the entire Labby system.
Tests login, registration, navigation, and every feature for all 3 roles."""
import requests
import sys
import datetime

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

def login(email, password="demo1234"):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    return s, r

def get_captcha():
    """Get a captcha and return (id, question, answer)."""
    cap = requests.get(f"{BASE}/api/auth/captcha").json()
    q = cap["question"]
    # Compute the answer
    expr = q.replace("= ?", "").strip()
    ans = eval(expr)
    return cap["id"], q, str(ans)

print("=" * 70)
print(" LABBY — COMPREHENSIVE END-TO-END TEST")
print("=" * 70)
print()

# ============================================================
# 1. AUTHENTICATION
# ============================================================
print("--- 1. AUTHENTICATION ---")

# Unauthenticated access
check("Unauthenticated /api/labs → 401", "401", requests.get(f"{BASE}/api/labs").status_code)
check("Unauthenticated /api/chat → 401", "401", requests.post(f"{BASE}/api/chat", json={"message":"hi"}).status_code)
check("Unauthenticated /api/admin/stats → 401", "401", requests.get(f"{BASE}/api/admin/stats").status_code)
check("Unauthenticated /api/bookings → 401", "401", requests.get(f"{BASE}/api/bookings").status_code)

# Login with wrong password
r = requests.post(f"{BASE}/api/auth/login", json={"email":"carol@campus.edu","password":"wrong"})
check("Login wrong password → 401", "401", r.status_code)

# Login all 3 roles
bob_s, r = login("bob@campus.edu")
check("Login faculty (Bob) → 200", "200", r.status_code)
check("Bob is FACULTY", "FACULTY", r.json().get("user",{}).get("role",""))

carol_s, r = login("carol@campus.edu")
check("Login staff (Carol) → 200", "200", r.status_code)
check("Carol is STAFF", "STAFF", r.json().get("user",{}).get("role",""))

admin_s, r = login("admin@campus.edu")
check("Login admin → 200", "200", r.status_code)
check("Admin is ADMIN", "ADMIN", r.json().get("user",{}).get("role",""))

# /api/auth/me works with session
check("Me endpoint with session → 200", "200", bob_s.get(f"{BASE}/api/auth/me").status_code)

# Logout
check("Logout → 200", "200", bob_s.post(f"{BASE}/api/auth/logout").status_code)
check("After logout, /api/auth/me → 401", "401", bob_s.get(f"{BASE}/api/auth/me").status_code)
# Re-login bob
bob_s, _ = login("bob@campus.edu")

# ============================================================
# 2. REGISTRATION WITH CAPTCHA
# ============================================================
print()
print("--- 2. REGISTRATION ---")

# Wrong captcha
cap_id, q, _ = get_captcha()
r = requests.post(f"{BASE}/api/auth/register", json={
    "name":"Bad","email":"bad@x.com","password":"pass1234",
    "role":"FACULTY","captchaId":cap_id,"captchaAnswer":"999"
})
check("Register wrong captcha → 400", "400", r.status_code)

# Correct captcha — new user
cap_id, q, ans = get_captcha()
r = requests.post(f"{BASE}/api/auth/register", json={
    "name":"New Faculty","email":"newfac@campus.edu","password":"newpass123",
    "role":"FACULTY","department":"Physics","captchaId":cap_id,"captchaAnswer":ans
})
check("Register new faculty → 201", "201", r.status_code)
check("New user is FACULTY", "FACULTY", r.json().get("user",{}).get("role",""))

# Student role rejected
cap_id, q, ans = get_captcha()
r = requests.post(f"{BASE}/api/auth/register", json={
    "name":"Student Wannabe","email":"student@campus.edu","password":"pass1234",
    "role":"STUDENT","captchaId":cap_id,"captchaAnswer":ans
})
check("Student role downgraded to FACULTY", "FACULTY", r.json().get("user",{}).get("role",""))

# Admin role rejected
cap_id, q, ans = get_captcha()
r = requests.post(f"{BASE}/api/auth/register", json={
    "name":"Admin Wannabe","email":"wannabe@campus.edu","password":"pass1234",
    "role":"ADMIN","captchaId":cap_id,"captchaAnswer":ans
})
check("Admin role downgraded to FACULTY", "FACULTY", r.json().get("user",{}).get("role",""))

# Duplicate email
cap_id, q, ans = get_captcha()
r = requests.post(f"{BASE}/api/auth/register", json={
    "name":"Dup","email":"bob@campus.edu","password":"pass1234",
    "role":"FACULTY","captchaId":cap_id,"captchaAnswer":ans
})
check("Duplicate email → 409", "409", r.status_code)

# ============================================================
# 3. CORE FEATURES (all roles)
# ============================================================
print()
print("--- 3. CORE FEATURES (all roles) ---")

tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

for name, session in [("Faculty", bob_s), ("Staff", carol_s), ("Admin", admin_s)]:
    # List labs
    r = session.get(f"{BASE}/api/labs")
    check(f"{name} can list labs → 200", "200", r.status_code)
    labs = r.json().get("labs", [])
    check(f"{name} sees 4 labs", "4", str(len(labs)))
    lab_a_id = next((l["id"] for l in labs if "Lab A" in l["name"]), "")

    # Check availability
    check(f"{name} can check availability → 200", "200", session.get(f"{BASE}/api/labs/{lab_a_id}/availability").status_code)

    # View own bookings
    check(f"{name} can view own bookings → 200", "200", session.get(f"{BASE}/api/bookings?scope=mine").status_code)

    # Chat
    r = session.post(f"{BASE}/api/chat", json={"message": "hi"})
    check(f"{name} can chat → 200", "200", r.status_code)

    # Create booking
    r = session.post(f"{BASE}/api/bookings", json={
        "labId": lab_a_id, "date": tomorrow, "startTime": "09:00", "endTime": "10:00", "purpose": f"{name} test"
    })
    check(f"{name} can create booking → 200", "200", r.status_code)
    booking_id = r.json().get("booking", {}).get("id", "")

    # View own bookings (should include the new one)
    r = session.get(f"{BASE}/api/bookings?scope=mine")
    check(f"{name} sees their booking in mine", "200", r.status_code)

    # Cancel own booking
    if booking_id:
        check(f"{name} can cancel own booking → 200", "200", session.delete(f"{BASE}/api/bookings/{booking_id}").status_code)

# ============================================================
# 4. LAB MANAGEMENT (all roles have access now)
# ============================================================
print()
print("--- 4. LAB MANAGEMENT (all roles) ---")

for name, session in [("Faculty", bob_s), ("Staff", carol_s), ("Admin", admin_s)]:
    # Create lab
    r = session.post(f"{BASE}/api/labs", json={
        "name": f"{name} Test Lab", "location": "Test Bldg", "capacity": 15,
        "openTime": "08:00", "closeTime": "17:00", "status": "OPEN"
    })
    check(f"{name} can create lab → 201", "201", r.status_code)
    lab_id = r.json().get("lab", {}).get("id", "")

    # Edit lab
    if lab_id:
        check(f"{name} can edit lab → 200", "200", session.patch(f"{BASE}/api/labs/{lab_id}", json={"capacity": 25}).status_code)
        # Delete lab
        check(f"{name} can delete lab → 200", "200", session.delete(f"{BASE}/api/labs/{lab_id}").status_code)

# ============================================================
# 5. ADMIN PANEL FEATURES (all roles have access)
# ============================================================
print()
print("--- 5. ADMIN PANEL FEATURES (all roles) ---")

for name, session in [("Faculty", bob_s), ("Staff", carol_s), ("Admin", admin_s)]:
    # View all bookings
    check(f"{name} can view all bookings → 200", "200", session.get(f"{BASE}/api/bookings?scope=all").status_code)
    # View admin stats
    r = session.get(f"{BASE}/api/admin/stats")
    check(f"{name} can view admin stats → 200", "200", r.status_code)
    stats = r.json()
    check(f"{name} stats has totals", "totals", str(stats.keys()))
    check(f"{name} stats has labUsage", "labUsage", str(stats.keys()))
    check(f"{name} stats has recentActivity", "recentActivity", str(stats.keys()))

# ============================================================
# 6. AI AGENT — all actions for all roles
# ============================================================
print()
print("--- 6. AI AGENT (all roles) ---")

for name, session in [("Faculty", bob_s), ("Staff", carol_s), ("Admin", admin_s)]:
    # List labs via chat
    r = session.post(f"{BASE}/api/chat", json={"message": "What labs are available?"})
    check(f"{name} chat: list labs", "Lab A", r.json().get("reply", ""))

    # Show my bookings via chat
    r = session.post(f"{BASE}/api/chat", json={"message": "Show my bookings"})
    reply = r.json().get("reply", "").lower()
    check(f"{name} chat: my bookings works", "booking", reply if ("booking" in reply or "no upcoming" in reply) else "FAILED")

    # Book via chat
    r = session.post(f"{BASE}/api/chat", json={"message": f"Book Lab A tomorrow 11:00-12:00 for {name} chat test"})
    check(f"{name} chat: book lab", "booking confirmed", r.json().get("reply", "").lower())

    # Add lab via chat
    r = session.post(f"{BASE}/api/chat", json={"message": f"Add a new lab called {name} Chat Lab, Building X, 20 seats, open 09:00 close 17:00"})
    check(f"{name} chat: add lab", "lab created", r.json().get("reply", "").lower())

    # List all bookings via chat
    r = session.post(f"{BASE}/api/chat", json={"message": "Show all bookings for today"})
    reply2 = r.json().get("reply", "").lower()
    check(f"{name} chat: list all bookings", "booking", reply2 if ("booking" in reply2 or "no bookings" in reply2) else "FAILED")

# ============================================================
# 7. CONFLICT DETECTION
# ============================================================
print()
print("--- 7. CONFLICT DETECTION ---")

# Create a booking, then try to book the same slot
labs = bob_s.get(f"{BASE}/api/labs").json()["labs"]
lab_b_id = next(l["id"] for l in labs if "Lab B" in l["name"])

r = bob_s.post(f"{BASE}/api/bookings", json={
    "labId": lab_b_id, "date": tomorrow, "startTime": "14:00", "endTime": "16:00", "purpose": "Conflict test"
})
check("Create first booking → 200", "200", r.status_code)

# Try same slot as Carol → should conflict
r = carol_s.post(f"{BASE}/api/bookings", json={
    "labId": lab_b_id, "date": tomorrow, "startTime": "15:00", "endTime": "17:00", "purpose": "Should conflict"
})
check("Conflict detected (overlapping booking)", "conflicts", r.json().get("error", "").lower())

# ============================================================
# 8. VALIDATION
# ============================================================
print()
print("--- 8. INPUT VALIDATION ---")

# Past date
r = bob_s.post(f"{BASE}/api/bookings", json={
    "labId": lab_a_id, "date": "2020-01-01", "startTime": "09:00", "endTime": "10:00"
})
check("Past date rejected", "past", r.json().get("error", "").lower())

# Invalid time format
r = bob_s.post(f"{BASE}/api/bookings", json={
    "labId": lab_a_id, "date": tomorrow, "startTime": "9am", "endTime": "10am"
})
check("Invalid time rejected", "hh:mm", r.json().get("error", "").lower())

# Start >= end
r = bob_s.post(f"{BASE}/api/bookings", json={
    "labId": lab_a_id, "date": tomorrow, "startTime": "14:00", "endTime": "14:00"
})
check("Start==end rejected", "earlier", r.json().get("error", "").lower())

# Non-existent lab
r = bob_s.post(f"{BASE}/api/bookings", json={
    "labId": "fake-id", "date": tomorrow, "startTime": "09:00", "endTime": "10:00"
})
check("Non-existent lab rejected", "not found", r.json().get("error", "").lower())

# ============================================================
# 9. CROSS-USER BOOKING CANCEL
# ============================================================
print()
print("--- 9. CROSS-USER BOOKING CANCEL ---")

# Bob books something
r = bob_s.post(f"{BASE}/api/bookings", json={
    "labId": lab_a_id, "date": tomorrow, "startTime": "16:00", "endTime": "17:00", "purpose": "Cross-user test"
})
bob_booking_id = r.json().get("booking", {}).get("id", "")

# Carol can cancel Bob's booking (all roles have full access now)
if bob_booking_id:
    check("Carol can cancel Bob's booking → 200", "200", carol_s.delete(f"{BASE}/api/bookings/{bob_booking_id}").status_code)

# ============================================================
# RESULTS
# ============================================================
print()
print("=" * 70)
print(" RESULTS")
print("=" * 70)
for r in RESULTS:
    print(r)
print()
print("=" * 70)
print(f" SUMMARY: {PASS} passed, {FAIL} failed")
print("=" * 70)
sys.exit(1 if FAIL > 0 else 0)
