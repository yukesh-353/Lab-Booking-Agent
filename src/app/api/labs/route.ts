import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/labs — list all labs
export async function GET(_req: NextRequest) {
  const labs = await db.lab.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
  })
  return NextResponse.json({ labs })
}
