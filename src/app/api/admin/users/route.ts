import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const users = await db.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }], select: { id: true, name: true, email: true, role: true, department: true, createdAt: true, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } } })
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const admin = await getUserFromRequest(req)
  if (!admin || admin.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { name, email, role, department } = body
  if (!name?.trim() || !email?.trim() || !role) return NextResponse.json({ error: 'name, email, and role are required' }, { status: 400 })
  const emailStr = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  if (!['STUDENT', 'FACULTY', 'STAFF', 'ADMIN'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  const existing = await db.user.findUnique({ where: { email: emailStr } })
  if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
  const newUser = await db.user.create({ data: { name: name.trim(), email: emailStr, role, department: department?.trim() || null }, select: { id: true, name: true, email: true, role: true, department: true, createdAt: true } })
  return NextResponse.json({ user: newUser }, { status: 201 })
}
