import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canManageLabs, validateLab } from '@/lib/booking'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { userId, ...updates } = body
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!canManageLabs(user.role)) return NextResponse.json({ error: 'Only faculty, staff, and admins can update labs' }, { status: 403 })
  const lab = await db.lab.findUnique({ where: { id } })
  if (!lab) return NextResponse.json({ error: 'Lab not found' }, { status: 404 })
  const v = validateLab(updates)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (updates.name && updates.name !== lab.name) {
    const clash = await db.lab.findUnique({ where: { name: updates.name } })
    if (clash) return NextResponse.json({ error: `A lab named "${updates.name}" already exists.` }, { status: 409 })
  }
  const data: any = {}
  if (updates.name !== undefined) data.name = updates.name.trim()
  if (updates.location !== undefined) data.location = updates.location.trim()
  if (updates.capacity !== undefined) data.capacity = Number(updates.capacity)
  if (updates.openTime !== undefined) data.openTime = updates.openTime
  if (updates.closeTime !== undefined) data.closeTime = updates.closeTime
  if (updates.status !== undefined) data.status = updates.status
  if (updates.description !== undefined) data.description = updates.description?.trim() || null
  if (updates.software !== undefined) data.software = updates.software?.trim() || null
  const updated = await db.lab.update({ where: { id }, data })
  return NextResponse.json({ lab: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!canManageLabs(user.role)) return NextResponse.json({ error: 'Only faculty, staff, and admins can delete labs' }, { status: 403 })
  const lab = await db.lab.findUnique({ where: { id } })
  if (!lab) return NextResponse.json({ error: 'Lab not found' }, { status: 404 })
  const activeBookings = await db.booking.count({ where: { labId: id, status: { in: ['CONFIRMED', 'PENDING'] } } })
  if (activeBookings > 0) return NextResponse.json({ error: `Cannot delete: ${activeBookings} active booking(s).` }, { status: 409 })
  await db.lab.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
