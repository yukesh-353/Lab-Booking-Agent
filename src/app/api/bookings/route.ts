import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateBooking, MAX_PURPOSE_LENGTH } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') || 'mine'
  const date = url.searchParams.get('date')
  const where: any = { status: { in: ['CONFIRMED', 'PENDING'] } }
  if (scope === 'all') {
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    if (date) where.date = date
  } else {
    where.userId = user.id
    if (date) where.date = date
  }
  const bookings = await db.booking.findMany({ where, include: { lab: true, user: true }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] })
  return NextResponse.json({ bookings })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { labId, date, startTime, endTime, purpose } = body
  const cleanPurpose = typeof purpose === 'string' ? purpose.slice(0, MAX_PURPOSE_LENGTH) : 'General use'
  const validation = await validateBooking({ labId, date, startTime, endTime, userId: user.id })
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })
  const booking = await db.booking.create({ data: { userId: user.id, labId, date, startTime, endTime, purpose: cleanPurpose, status: 'CONFIRMED' }, include: { lab: true } })
  return NextResponse.json({ booking })
}
