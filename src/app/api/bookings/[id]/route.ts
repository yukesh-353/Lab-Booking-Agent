import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const booking = await db.booking.findUnique({ where: { id } })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.userId !== userId && user.role !== 'ADMIN' && user.role !== 'STAFF') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const updated = await db.booking.update({ where: { id }, data: { status: 'CANCELLED' }, include: { lab: true } })
  return NextResponse.json({ booking: updated })
}
