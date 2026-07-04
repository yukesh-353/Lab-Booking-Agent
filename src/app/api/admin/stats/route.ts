import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { todayISO, addDays, canViewAdminStats } from '@/lib/booking'
import { getUserFromRequest } from '@/lib/auth'

// GET /api/admin/stats — ADMIN only
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canViewAdminStats(user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const today = todayISO()
  const weekEnd = addDays(today, 7)

  const [labs, users, bookingsToday, bookingsWeek, allRecent] = await Promise.all([
    db.lab.findMany({ orderBy: { name: 'asc' } }),
    db.user.count(),
    db.booking.count({ where: { date: today, status: 'CONFIRMED' } }),
    db.booking.count({
      where: { date: { gte: today, lte: weekEnd }, status: 'CONFIRMED' },
    }),
    db.booking.findMany({
      where: {},
      include: { lab: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const labUsage = await Promise.all(
    labs.map(async (lab) => {
      const count = await db.booking.count({
        where: { labId: lab.id, date: { gte: today, lte: weekEnd }, status: 'CONFIRMED' },
      })
      return { lab: lab.name, capacity: lab.capacity, status: lab.status, bookingsNext7Days: count }
    }),
  )

  const statusBreakdown = await db.booking.groupBy({
    by: ['status'],
    _count: true,
  })

  return NextResponse.json({
    totals: { labs: labs.length, users, bookingsToday, bookingsNext7Days: bookingsWeek },
    labUsage,
    statusBreakdown: statusBreakdown.reduce((acc, s) => {
      acc[s.status] = s._count
      return acc
    }, {} as Record<string, number>),
    recentActivity: allRecent,
  })
}
