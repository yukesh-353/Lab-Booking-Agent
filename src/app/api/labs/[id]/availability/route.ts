import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLabSchedule, todayISO } from '@/lib/booking'

// GET /api/labs/[id]/availability?date=YYYY-MM-DD
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const date = url.searchParams.get('date') || todayISO()

  const lab = await db.lab.findUnique({ where: { id } })
  if (!lab) {
    return NextResponse.json({ error: 'Lab not found' }, { status: 404 })
  }

  try {
    const { slots } = await getLabSchedule(id, date)
    return NextResponse.json({ lab, date, slots })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load schedule' }, { status: 500 })
  }
}
