import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canManageLabs, validateLab, MAX_PURPOSE_LENGTH, computeLiveStatus, todayISO } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

// GET /api/labs — list all labs with their live status (requires login)
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const today = todayISO()
  const labs = await db.lab.findMany({
    orderBy: { name: 'asc' },
    include: {
      bookings: {
        where: { date: today, status: { in: ['CONFIRMED', 'PENDING'] } },
        select: { startTime: true, endTime: true, status: true, purpose: true, userId: true, user: { select: { name: true } } },
      },
    },
  })

  // Compute live status for each lab
  const labsWithStatus = labs.map((l) => {
    const live = computeLiveStatus(l, l.bookings)
    return {
      ...l,
      bookings: undefined, // don't leak all bookings in the list endpoint
      _count: { bookings: l.bookings.length },
      liveStatus: live.status,
      activeBooking: live.activeBooking
        ? {
            startTime: live.activeBooking.startTime,
            endTime: live.activeBooking.endTime,
            bookerName: l.bookings.find(
              (b) => b.startTime === live.activeBooking!.startTime && b.endTime === live.activeBooking!.endTime,
            )?.user?.name,
          }
        : null,
    }
  })

  return NextResponse.json({ labs: labsWithStatus, date: today })
}

// POST /api/labs — create a new lab (ADMIN or STAFF only)
// Body: { name, location, capacity, openTime, closeTime, status, description, software }
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  if (!canManageLabs(user.role)) {
    return NextResponse.json({ error: 'Only admins and staff can create labs' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, location, capacity, openTime, closeTime, status, description, software } = body

  // Validate inputs
  const v = validateLab({ name, location, capacity, openTime, closeTime, status, description, software })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  if (!name || !location || capacity === undefined || !openTime || !closeTime || !status) {
    return NextResponse.json({ error: 'name, location, capacity, openTime, closeTime, status are required' }, { status: 400 })
  }

  // Unique name check
  const existing = await db.lab.findUnique({ where: { name } })
  if (existing) {
    return NextResponse.json({ error: `A lab named "${name}" already exists.` }, { status: 409 })
  }

  const lab = await db.lab.create({
    data: {
      name: name.trim(),
      location: location.trim(),
      capacity: Number(capacity),
      openTime,
      closeTime,
      status,
      description: description?.trim() || null,
      software: software?.trim() || null,
    },
  })
  return NextResponse.json({ lab }, { status: 201 })
}

export { MAX_PURPOSE_LENGTH }
