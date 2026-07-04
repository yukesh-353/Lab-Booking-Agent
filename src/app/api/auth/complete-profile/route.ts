import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/auth/complete-profile
// First-time magic-link users set their name + role + department here.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { name, role, department } = body as { name: string; role: string; department?: string }
  if (!name?.trim() || !role) {
    return NextResponse.json({ error: 'name and role are required' }, { status: 400 })
  }
  const validRoles = ['STUDENT', 'FACULTY', 'STAFF', 'ADMIN']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { email: session.user.email },
    data: {
      name: name.trim(),
      role,
      department: department?.trim() || null,
    },
  })

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      department: updated.department,
    },
  })
}
