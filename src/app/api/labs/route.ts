import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/labs — list all labs (public-ish: requires login)
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const labs = await db.lab.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
  })
  return NextResponse.json({ labs })
}
