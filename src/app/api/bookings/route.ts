import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateBooking, MAX_PURPOSE_LENGTH, canViewAllBookings } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

// GET /api/bookings?scope=all|mine&date=YYYY-MM-DD
// - scope=mine: any authenticated user can see their own bookings
// - scope=all: ADMIN only — campus-wide booking view
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') || 'mine'
  const date = url.searchParams.get('date')

  const where: any = { status: { in: ['CONFIRMED', 'PENDING'] } }
  if (scope === 'all') {
    if (!canViewAllBookings(user.role)) {
      return NextResponse.json({ error: 'Only admins can view all bookings' }, { status: 403 })
    }
    if (date) where.date = date
  } else {
    where.userId = user.id
    if (date) where.date = date
  }

  const bookings = await db.booking.findMany({
    where,
    include: { lab: true, user: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json({ bookings })
}

// POST /api/bookings — create a new booking
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { labId, date, startTime, endTime, purpose } = body

  // Truncate purpose to max length
  const cleanPurpose = (typeof purpose === 'string' ? purpose.slice(0, MAX_PURPOSE_LENGTH) : 'General use')

  const validation = await validateBooking({ labId, date, startTime, endTime, userId: user.id })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const booking = await db.booking.create({
    data: {
      userId: user.id,
      labId,
      date,
      startTime,
      endTime,
      purpose: cleanPurpose,
      status: 'CONFIRMED',
    },
    include: { lab: true },
  })
  return NextResponse.json({ booking })
}
