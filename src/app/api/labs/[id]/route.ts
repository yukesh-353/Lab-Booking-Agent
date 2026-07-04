import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canManageLabs, validateLab } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

// PATCH /api/labs/[id] — update a lab (ADMIN or STAFF only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canManageLabs(user.role)) {
    return NextResponse.json({ error: 'Only admins and staff can update labs' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { userId: _drop, ...updates } = body // userId no longer used; auth comes from session

  const lab = await db.lab.findUnique({ where: { id } })
  if (!lab) return NextResponse.json({ error: 'Lab not found' }, { status: 404 })

  const v = validateLab(updates)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  // If renaming, check uniqueness
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

// DELETE /api/labs/[id] — delete a lab (ADMIN or STAFF only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canManageLabs(user.role)) {
    return NextResponse.json({ error: 'Only admins and staff can delete labs' }, { status: 403 })
  }

  const lab = await db.lab.findUnique({ where: { id } })
  if (!lab) return NextResponse.json({ error: 'Lab not found' }, { status: 404 })

  // Block deletion if there are active bookings
  const activeBookings = await db.booking.count({
    where: { labId: id, status: { in: ['CONFIRMED', 'PENDING'] } },
  })
  if (activeBookings > 0) {
    return NextResponse.json({
      error: `Cannot delete: ${activeBookings} active booking(s) still reference this lab. Cancel them or set lab status to CLOSED instead.`,
    }, { status: 409 })
  }

  await db.lab.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
