import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateBooking } from '@/lib/booking'

// GET /api/bookings?scope=all|mine&date=YYYY-MM-DD
// Uses session for authentication (no userId in query)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') || 'mine'
  const date = url.searchParams.get('date')

  const where: any = { status: { in: ['CONFIRMED', 'PENDING'] } }
  if (scope === 'all') {
    if (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF') {
      return NextResponse.json({ error: 'Insufficient permissions to view all bookings' }, { status: 403 })
    }
    if (date) where.date = date
  } else {
    where.userId = session.user.id
  }

  const bookings = await db.booking.findMany({
    where,
    include: { lab: true, user: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json({ bookings })
}

// POST /api/bookings — create a new booking (uses session user)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { labId, date, startTime, endTime, purpose } = body

  const validation = await validateBooking({
    labId,
    date,
    startTime,
    endTime,
    userId: session.user.id,
  })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const booking = await db.booking.create({
    data: {
      userId: session.user.id,
      labId,
      date,
      startTime,
      endTime,
      purpose: purpose || 'General use',
      status: 'CONFIRMED',
    },
    include: { lab: true },
  })
  return NextResponse.json({ booking })
}
