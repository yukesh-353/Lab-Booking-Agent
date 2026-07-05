import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canManageLabs, validateLab } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const labs = await db.lab.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } } })
  return NextResponse.json({ labs })
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canManageLabs(user.role)) return NextResponse.json({ error: 'Only faculty, staff, and admins can create labs' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { name, location, capacity, openTime, closeTime, status, description, software } = body
  const v = validateLab({ name, location, capacity, openTime, closeTime, status, description, software })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (!name || !location || capacity === undefined || !openTime || !closeTime || !status) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  const existing = await db.lab.findUnique({ where: { name } })
  if (existing) return NextResponse.json({ error: `A lab named "${name}" already exists.` }, { status: 409 })
  const lab = await db.lab.create({ data: { name: name.trim(), location: location.trim(), capacity: Number(capacity), openTime, closeTime, status, description: description?.trim() || null, software: software?.trim() || null } })
  return NextResponse.json({ lab }, { status: 201 })
}
