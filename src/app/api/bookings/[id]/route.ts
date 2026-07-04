import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canApproveBookings } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

// DELETE /api/bookings/[id] — cancel a booking
// A user can cancel their own booking. Only ADMIN can cancel other users' bookings.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Owner can cancel their own; admin can cancel anyone's
  if (booking.userId !== user.id && !canApproveBookings(user.role)) {
    return NextResponse.json({ error: 'You can only cancel your own bookings' }, { status: 403 })
  }

  const updated = await db.booking.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { lab: true },
  })
  return NextResponse.json({ booking: updated })
}
