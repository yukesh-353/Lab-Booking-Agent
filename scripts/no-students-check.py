#!/usr/bin/env python3
"""Verify the new permission model: faculty + staff + admin all have full access, no students."""
import requests
import sys

BASE = "http://localhost:3000"
PASS = 0
FAIL = 0
RESULTS = []

def check(name, expected, actual):
    global PASS, FAIL
    if expected in str(actual):
        PASS += 1
        RESULTS.append(f"✓ {name}")
    else:
        FAIL += 1
        RESULTS.append(f"✗ {name}  (expected {expected}, got {actual})")

def login(email, password="demo1234"):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    return s

print("=" * 60)
print(" NEW PERMISSION MODEL VERIFICATION")
print(" (faculty + staff + admin all have full access, no students)")
print("=" * 60)
print()

# Login as each role
bob = login("bob@campus.edu")     # FACULTY
carol = login("carol@campus.edu") # STAFF
admin = login("admin@campus.edu") # ADMIN

# Get a lab ID
labs = bob.get(f"{BASE}/api/labs").json()["labs"]
lab_a_id = next(l["id"] for l in labs if "Lab A" in l["name"])

import datetime
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

print("--- FACULTY (Bob) — should have FULL access ---")
check("Faculty can list labs", "200", bob.get(f"{BASE}/api/labs").status_code)
check("Faculty can view own bookings", "200", bob.get(f"{BASE}/api/bookings?scope=mine").status_code)
check("Faculty can check availability", "200", bob.get(f"{BASE}/api/labs/{lab_a_id}/availability").status_code)
check("Faculty can chat", "200", bob.post(f"{BASE}/api/chat", json={"message":"hi"}).status_code)
check("Faculty can create booking", "200", bob.post(f"{BASE}/api/bookings", json={"labId":lab_a_id,"date":tomorrow,"startTime":"09:00","endTime":"10:00"}).status_code)
# KEY: Faculty can now create labs (was admin-only before)
r = bob.post(f"{BASE}/api/labs", json={"name":"Faculty Lab Test","location":"Bldg","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"})
check("Faculty can create lab (201)", "201", r.status_code)
faculty_lab_id = r.json().get("lab",{}).get("id","")
if faculty_lab_id:
    check("Faculty can edit lab (200)", "200", bob.patch(f"{BASE}/api/labs/{faculty_lab_id}", json={"capacity":15}).status_code)
    check("Faculty can delete lab (200)", "200", bob.delete(f"{BASE}/api/labs/{faculty_lab_id}").status_code)
# KEY: Faculty can now view all bookings (was admin-only before)
check("Faculty can view all bookings", "200", bob.get(f"{BASE}/api/bookings?scope=all").status_code)
# KEY: Faculty can now view admin stats (was admin-only before)
check("Faculty can view admin stats", "200", bob.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- STAFF (Carol) — should have FULL access ---")
check("Staff can list labs", "200", carol.get(f"{BASE}/api/labs").status_code)
check("Staff can chat", "200", carol.post(f"{BASE}/api/chat", json={"message":"hi"}).status_code)
r = carol.post(f"{BASE}/api/labs", json={"name":"Staff Lab Test","location":"Bldg","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"})
check("Staff can create lab (201)", "201", r.status_code)
staff_lab_id = r.json().get("lab",{}).get("id","")
if staff_lab_id:
    check("Staff can delete lab (200)", "200", carol.delete(f"{BASE}/api/labs/{staff_lab_id}").status_code)
check("Staff can view all bookings", "200", carol.get(f"{BASE}/api/bookings?scope=all").status_code)
check("Staff can view admin stats", "200", carol.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- ADMIN — should have FULL access ---")
check("Admin can list labs", "200", admin.get(f"{BASE}/api/labs").status_code)
check("Admin can create lab (201)", "201", admin.post(f"{BASE}/api/labs", json={"name":"Admin Lab Test","location":"Bldg","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"}).status_code)
check("Admin can view all bookings", "200", admin.get(f"{BASE}/api/bookings?scope=all").status_code)
check("Admin can view admin stats", "200", admin.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- REGISTRATION: no STUDENT role allowed ---")
# Get a captcha
cap = requests.get(f"{BASE}/api/auth/captcha").json()
q = cap["question"]
import re
expr = q.replace("= ?","").strip()
ans = eval(expr)
# Try to register as STUDENT — should be downgraded to FACULTY
r = requests.post(f"{BASE}/api/auth/register", json={
    "name":"Hack Student","email":"hackstudent@campus.edu","password":"pass1234",
    "role":"STUDENT","captchaId":cap["id"],"captchaAnswer":str(ans)
})
check("Student role rejected (downgraded to FACULTY)", "FACULTY", r.json().get("user",{}).get("role",""))
# Try to register as ADMIN — should be downgraded
cap2 = requests.get(f"{BASE}/api/auth/captcha").json()
q2 = cap2["question"]
ans2 = eval(q2.replace("= ?","").strip())
r2 = requests.post(f"{BASE}/api/auth/register", json={
    "name":"Hack Admin","email":"hackadmin@campus.edu","password":"pass1234",
    "role":"ADMIN","captchaId":cap2["id"],"captchaAnswer":str(ans2)
})
check("Admin role rejected (downgraded to FACULTY)", "FACULTY", r2.json().get("user",{}).get("role",""))

print()
print("--- AI AGENT: faculty can add labs via chat ---")
r = bob.post(f"{BASE}/api/chat", json={"message":"Add a new lab called Faculty Chat Lab, Building X, 20 seats, open 09:00 close 17:00"})
check("Chat: faculty can add_lab", "lab created", r.json().get("reply","").lower())

print()
print("=" * 60)
for r in RESULTS:
    print(r)
print()
print(f"SUMMARY: {PASS} passed, {FAIL} failed")
print("=" * 60)
sys.exit(1 if FAIL > 0 else 0)
