import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateBooking, MAX_PURPOSE_LENGTH } from '@/lib/booking'

// GET /api/bookings?userId=...&scope=all|mine&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  const scope = url.searchParams.get('scope') || 'mine'
  const date = url.searchParams.get('date')

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const where: any = { status: { in: ['CONFIRMED', 'PENDING'] } }
  if (scope === 'all') {
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
      return NextResponse.json({ error: 'Insufficient permissions to view all bookings' }, { status: 403 })
    }
    if (date) where.date = date
  } else {
    where.userId = userId
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
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { userId, labId, date, startTime, endTime, purpose } = body

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Truncate purpose to max length
  const cleanPurpose = (typeof purpose === 'string' ? purpose.slice(0, MAX_PURPOSE_LENGTH) : 'General use')

  const validation = await validateBooking({ labId, date, startTime, endTime, userId })
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const booking = await db.booking.create({
    data: {
      userId,
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
