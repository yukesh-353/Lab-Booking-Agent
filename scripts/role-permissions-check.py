#!/usr/bin/env python3
"""Verify role-based permissions end-to-end."""
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
print(" ROLE PERMISSION VERIFICATION")
print("=" * 60)
print()

# Login as each role
alice = login("alice@campus.edu")   # STUDENT
bob = login("bob@campus.edu")       # FACULTY
carol = login("carol@campus.edu")   # STAFF
admin = login("admin@campus.edu")   # ADMIN

# Get a lab ID for testing
labs = alice.get(f"{BASE}/api/labs").json()["labs"]
lab_a_id = next(l["id"] for l in labs if "Lab A" in l["name"])

print("--- STUDENT (Alice) ---")
# Can: list labs
check("Student can list labs", "200", alice.get(f"{BASE}/api/labs").status_code)
# Can: view own bookings
check("Student can view own bookings", "200", alice.get(f"{BASE}/api/bookings?scope=mine").status_code)
# Can: check availability
check("Student can check availability", "200", alice.get(f"{BASE}/api/labs/{lab_a_id}/availability").status_code)
# Can: chat
r = alice.post(f"{BASE}/api/chat", json={"message": "hi"})
check("Student can chat with bot", "200", r.status_code)
# Can: create a booking
import datetime
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
r = alice.post(f"{BASE}/api/bookings", json={"labId": lab_a_id, "date": tomorrow, "startTime": "09:00", "endTime": "10:00", "purpose": "test"})
check("Student can create booking", "200", r.status_code)
booking_id = r.json().get("booking", {}).get("id", "")
# Can: cancel own booking
if booking_id:
    check("Student can cancel own booking", "200", alice.delete(f"{BASE}/api/bookings/{booking_id}").status_code)
# CANNOT: create lab
r = alice.post(f"{BASE}/api/labs", json={"name":"Hack","location":"x","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"})
check("Student denied lab creation (403)", "403", r.status_code)
# CANNOT: view all bookings
check("Student denied all-bookings (403)", "403", alice.get(f"{BASE}/api/bookings?scope=all").status_code)
# CANNOT: view admin stats
check("Student denied admin stats (403)", "403", alice.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- FACULTY (Bob) ---")
check("Faculty can list labs", "200", bob.get(f"{BASE}/api/labs").status_code)
check("Faculty can chat", "200", bob.post(f"{BASE}/api/chat", json={"message": "hi"}).status_code)
check("Faculty can create booking", "200", bob.post(f"{BASE}/api/bookings", json={"labId": lab_a_id, "date": tomorrow, "startTime": "11:00", "endTime": "12:00"}).status_code)
check("Faculty denied lab creation (403)", "403", bob.post(f"{BASE}/api/labs", json={"name":"Hack2","location":"x","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"}).status_code)
check("Faculty denied admin stats (403)", "403", bob.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- STAFF (Carol) ---")
check("Staff can list labs", "200", carol.get(f"{BASE}/api/labs").status_code)
check("Staff can chat", "200", carol.post(f"{BASE}/api/chat", json={"message": "hi"}).status_code)
check("Staff can create booking", "200", carol.post(f"{BASE}/api/bookings", json={"labId": lab_a_id, "date": tomorrow, "startTime": "13:00", "endTime": "14:00"}).status_code)
check("Staff can view own bookings", "200", carol.get(f"{BASE}/api/bookings?scope=mine").status_code)
# KEY CHANGE: staff CANNOT create labs (admin-only now)
check("Staff denied lab creation (403)", "403", carol.post(f"{BASE}/api/labs", json={"name":"Hack3","location":"x","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"}).status_code)
check("Staff denied all-bookings (403)", "403", carol.get(f"{BASE}/api/bookings?scope=all").status_code)
check("Staff denied admin stats (403)", "403", carol.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- ADMIN ---")
check("Admin can list labs", "200", admin.get(f"{BASE}/api/labs").status_code)
check("Admin can chat", "200", admin.post(f"{BASE}/api/chat", json={"message": "hi"}).status_code)
check("Admin can create booking", "200", admin.post(f"{BASE}/api/bookings", json={"labId": lab_a_id, "date": tomorrow, "startTime": "15:00", "endTime": "16:00"}).status_code)
# Admin CAN create labs
r = admin.post(f"{BASE}/api/labs", json={"name":"Admin Lab Test","location":"Admin Bldg","capacity":10,"openTime":"08:00","closeTime":"17:00","status":"OPEN"})
check("Admin can create lab (201)", "201", r.status_code)
new_lab_id = r.json().get("lab", {}).get("id", "")
# Admin CAN edit labs
if new_lab_id:
    check("Admin can edit lab (200)", "200", admin.patch(f"{BASE}/api/labs/{new_lab_id}", json={"capacity": 20}).status_code)
    # Admin CAN delete labs
    check("Admin can delete lab (200)", "200", admin.delete(f"{BASE}/api/labs/{new_lab_id}").status_code)
# Admin CAN view all bookings
check("Admin can view all bookings", "200", admin.get(f"{BASE}/api/bookings?scope=all").status_code)
# Admin CAN view admin stats
check("Admin can view admin stats", "200", admin.get(f"{BASE}/api/admin/stats").status_code)

print()
print("--- AI AGENT PERMISSIONS ---")
# Student asks to add lab via chat → should be denied
r = alice.post(f"{BASE}/api/chat", json={"message": "Add a new lab called Hack Lab with 50 seats"})
reply = r.json().get("reply", "").lower()
check("Chat: student denied add_lab by AI", "admin", reply)
# Verify no lab was actually created
labs_after = alice.get(f"{BASE}/api/labs").json()["labs"]
check("Chat: no lab actually created", "4", str(len(labs_after)))
# Staff asks to add lab via chat → should be denied
r = carol.post(f"{BASE}/api/chat", json={"message": "Add a new lab called Hack Lab with 50 seats, Building X, open 09:00 close 17:00"})
reply = r.json().get("reply", "").lower()
check("Chat: staff denied add_lab by AI", "admin", reply)
labs_after2 = carol.get(f"{BASE}/api/labs").json()["labs"]
check("Chat: still no lab created by staff", "4", str(len(labs_after2)))
# Admin asks to add lab via chat → should work
r = admin.post(f"{BASE}/api/chat", json={"message": "Add a new lab called Admin Chat Lab, Building X Room 1, 30 seats, open 09:00 close 17:00"})
check("Chat: admin can add_lab", "lab created", r.json().get("reply", "").lower())
# Student asks for all bookings → should be denied
r = alice.post(f"{BASE}/api/chat", json={"message": "Show me all bookings across campus for today"})
reply = r.json().get("reply", "").lower()
check("Chat: student denied list_all_bookings by AI", "admin", reply)

print()
print("=" * 60)
for r in RESULTS:
    print(r)
print()
print(f"SUMMARY: {PASS} passed, {FAIL} failed")
print("=" * 60)
sys.exit(1 if FAIL > 0 else 0)
