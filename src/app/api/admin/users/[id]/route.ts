import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { userId, ...updates } = body
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const admin = await db.user.findUnique({ where: { id: userId } })
  if (!admin || admin.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.id === admin.id && updates.role && updates.role !== 'ADMIN') return NextResponse.json({ error: 'You cannot demote yourself.' }, { status: 400 })
  const data: any = {}
  if (updates.name !== undefined) { if (!updates.name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 }); data.name = updates.name.trim() }
  if (updates.role !== undefined) { if (!['STUDENT', 'FACULTY', 'STAFF', 'ADMIN'].includes(updates.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 }); data.role = updates.role }
  if (updates.department !== undefined) data.department = updates.department?.trim() || null
  const updated = await db.user.update({ where: { id }, data, select: { id: true, name: true, email: true, role: true, department: true, createdAt: true } })
  return NextResponse.json({ user: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const admin = await db.user.findUnique({ where: { id: userId } })
  if (!admin || admin.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  if (id === userId) return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  const target = await db.user.findUnique({ where: { id } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  await db.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
