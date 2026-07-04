import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// DELETE /api/bookings/[id] — cancel a booking
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Only owner or admin/staff can cancel
  if (booking.userId !== session.user.id && session.user.role !== 'ADMIN' && session.user.role !== 'STAFF') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await db.booking.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { lab: true },
  })
  return NextResponse.json({ booking: updated })
}
