'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Bot, Send, Calendar as CalendarIcon, LayoutDashboard, Shield, LogOut, Loader2, User,
  Clock, MapPin, Users, Monitor, CheckCircle2, XCircle, CalendarDays, Sparkles, History,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

// ---------- Types ----------
interface User {
  id: string
  name: string
  email: string
  role: 'STUDENT' | 'FACULTY' | 'STAFF' | 'ADMIN'
  department?: string | null
}
interface Lab {
  id: string
  name: string
  location: string
  capacity: number
  description?: string | null
  openTime: string
  closeTime: string
  status: 'OPEN' | 'CLOSED' | 'MAINTENANCE'
  software?: string | null
}
interface Slot {
  start: string
  end: string
  booked: boolean
  bookingId?: string
  bookerName?: string
  purpose?: string
}
interface Booking {
  id: string
  date: string
  startTime: string
  endTime: string
  purpose?: string | null
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED'
  lab: Lab
  user?: User
  createdAt?: string
}
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

// ---------- Local session storage ----------
const USER_KEY = 'labby_user'

function loadUser(): User | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(USER_KEY) : null
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}
function saveUser(u: User | null) {
  if (typeof window === 'undefined') return
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
  else localStorage.removeItem(USER_KEY)
}

// ---------- Quick suggestions ----------
const QUICK_PROMPTS = [
  'List all available labs',
  'Is Lab A free tomorrow afternoon?',
  'Book Lab B tomorrow 2-4pm for ML project',
  'Show my bookings',
]

// ---------- Login screen ----------
function LoginScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'demo' | 'custom'>('demo')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'STUDENT' | 'FACULTY' | 'STAFF' | 'ADMIN'>('STUDENT')
  const [department, setDepartment] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const demoUsers = [
    { email: 'alice@campus.edu', label: 'Alice Chen · Student · Computer Science' },
    { email: 'bob@campus.edu', label: 'Bob Patel · Faculty · Computer Science' },
    { email: 'carol@campus.edu', label: 'Carol Reyes · Staff · IT Services' },
    { email: 'admin@campus.edu', label: 'Admin Wang · Admin · IT Services' },
  ]

  const loginDemo = async (email: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/session?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      saveUser(data.user)
      onLogin(data.user)
    } catch (e: any) {
      toast({ title: 'Login failed', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const loginCustom = async () => {
    if (!name.trim() || !email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), role, department: department.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      saveUser(data.user)
      onLogin(data.user)
    } catch (e: any) {
      toast({ title: 'Login failed', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Labby</h1>
          <p className="text-muted-foreground text-sm">Your AI agent for campus computer lab bookings</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign in to continue</CardTitle>
            <CardDescription>Pick a demo account or create your own</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'demo' | 'custom')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="demo">Demo accounts</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
              <TabsContent value="demo" className="space-y-2 pt-4">
                {demoUsers.map((u) => (
                  <Button
                    key={u.email}
                    variant="outline"
                    className="w-full justify-start text-left h-auto py-3"
                    disabled={loading}
                    onClick={() => loginDemo(u.email)}
                  >
                    <User className="w-4 h-4 mr-3 shrink-0" />
                    <span className="text-sm">{u.label}</span>
                  </Button>
                ))}
              </TabsContent>
              <TabsContent value="custom" className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@campus.edu" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STUDENT">Student</SelectItem>
                      <SelectItem value="FACULTY">Faculty</SelectItem>
                      <SelectItem value="STAFF">Staff</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dept">Department (optional)</Label>
                  <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Computer Science" />
                </div>
                <Button className="w-full" disabled={loading} onClick={loginCustom}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Sign in
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <p className="text-xs text-center text-muted-foreground">
          By signing in you agree to campus IT acceptable-use policy.
        </p>
      </div>
    </div>
  )
}

// ---------- Chat Panel ----------
function ChatPanel({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi ${user.name.split(' ')[0]}! I'm Labby, your lab booking assistant. I can help you book a computer lab, check availability, view your bookings, or cancel one. What would you like to do?`,
      ts: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed, ts: Date.now() }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, message: trimmed, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
    } catch (e: any) {
      toast({ title: 'Chat error', description: e.message, variant: 'destructive' })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I hit an error: ${e.message}. Please try again.`, ts: Date.now() },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef as any}>
          <div className="space-y-4 p-4 max-w-3xl mx-auto">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} userName={user.name} />
            ))}
            {loading && (
              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="border-t bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <Button
                key={p}
                variant="outline"
                size="sm"
                className="text-xs h-8"
                disabled={loading}
                onClick={() => send(p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Labby anything — e.g. 'book Lab A tomorrow 2-4pm'"
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message, userName }: { message: ChatMessage; userName: string }) {
  const isUser = message.role === 'user'
  const initials = isUser ? userName.split(' ').map((s) => s[0]).slice(0, 2).join('') : 'L'

  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-semibold ${
          isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        }`}
      >
        {isUser ? initials : <Bot className="w-4 h-4" />}
      </div>
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
          isUser ? 'bg-slate-700 text-white rounded-tr-sm' : 'bg-muted rounded-tl-sm'
        }`}
      >
        <MarkdownLite content={message.content} />
      </div>
    </div>
  )
}

// Lightweight markdown renderer — handles **bold**, `code`, and bullet lists
function MarkdownLite({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.trim().startsWith('• ') || line.trim().startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-emerald-500 font-bold">•</span>
              <span>{renderInline(line.trim().slice(2))}</span>
            </div>
          )
        }
        return <div key={i}>{renderInline(line) || <br />}</div>
      })}
    </div>
  )
}

function renderInline(text: string) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i} className="px-1.5 py-0.5 rounded bg-background/60 text-xs font-mono">{p.slice(1, -1)}</code>
    }
    return <span key={i}>{p}</span>
  })
}

// ---------- Calendar / Availability Panel ----------
function CalendarPanel({ user }: { user: User }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [selectedLab, setSelectedLab] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/labs')
      .then((r) => r.json())
      .then((d) => {
        setLabs(d.labs || [])
        if (d.labs?.length) setSelectedLab(d.labs[0].id)
      })
  }, [])

  const loadSchedule = useCallback(async () => {
    if (!selectedLab || !selectedDate) return
    setLoading(true)
    try {
      const res = await fetch(`/api/labs/${selectedLab}/availability?date=${selectedDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSlots(data.slots || [])
    } catch (e: any) {
      toast({ title: 'Failed to load schedule', description: e.message, variant: 'destructive' })
      setSlots([])
    } finally {
      setLoading(false)
    }
  }, [selectedLab, selectedDate, toast])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const selectedLabObj = labs.find((l) => l.id === selectedLab)

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-emerald-600" /> Lab availability</CardTitle>
          <CardDescription>Check free and booked time slots for any lab on any date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lab">Lab</Label>
              <Select value={selectedLab} onValueChange={setSelectedLab}>
                <SelectTrigger><SelectValue placeholder="Select a lab" /></SelectTrigger>
                <SelectContent>
                  {labs.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} {l.status !== 'OPEN' ? `(${l.status.toLowerCase()})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
          </div>

          {selectedLabObj && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-semibold mb-1">{selectedLabObj.name}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground text-xs">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedLabObj.location}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {selectedLabObj.capacity} seats</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedLabObj.openTime}–{selectedLabObj.closeTime}</span>
                <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {selectedLabObj.software?.split(',')[0] || 'Standard suite'}</span>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">
                Schedule for {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMM d, yyyy')}
              </h4>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            </div>
            <div className="space-y-1.5">
              {!loading && slots.length === 0 && (
                <div className="text-sm text-muted-foreground py-8 text-center">Lab is closed or unavailable on this date.</div>
              )}
              {slots.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                    s.booked ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono">{s.start} – {s.end}</span>
                  </div>
                  {s.booked ? (
                    <Badge variant="destructive" className="text-xs">
                      Booked{s.bookerName ? ` · ${s.bookerName}` : ''}{s.purpose ? ` · ${s.purpose}` : ''}
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-700">Free</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 inline mr-1 text-emerald-600" />
            Tip: Switch to the Chat tab and just say "book {selectedLabObj?.name.split('—')[0].trim() || 'Lab A'} {selectedDate} 14:00-16:00" — Labby will handle it.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- My Bookings Panel ----------
function MyBookingsPanel({ user }: { user: User }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings?userId=${user.id}&scope=mine`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBookings(data.bookings || [])
    } catch (e: any) {
      toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [user.id, toast])

  useEffect(() => {
    load()
  }, [load])

  const cancel = async (id: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}?userId=${user.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Booking cancelled', description: 'The slot is now free for others.' })
      load()
    } catch (e: any) {
      toast({ title: 'Failed to cancel', description: e.message, variant: 'destructive' })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = bookings.filter((b) => b.date >= today)
  const past = bookings.filter((b) => b.date < today)

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-emerald-600" /> My bookings</CardTitle>
          <CardDescription>Your upcoming and past lab reservations.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>You don't have any bookings yet.</p>
              <p className="text-sm mt-1">Use the Chat tab to ask Labby to book a lab for you.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Upcoming ({upcoming.length})</h3>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map((b) => (
                      <BookingCard key={b.id} booking={b} onCancel={() => cancel(b.id)} />
                    ))}
                  </div>
                )}
              </div>
              {past.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Past ({past.length})</h3>
                  <div className="space-y-2 opacity-70">
                    {past.map((b) => (
                      <BookingCard key={b.id} booking={b} onCancel={() => cancel(b.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel: () => void }) {
  const cancelled = booking.status === 'CANCELLED' || booking.status === 'REJECTED'
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{booking.lab.name}</span>
          <Badge variant={cancelled ? 'secondary' : 'default'} className={`text-xs ${cancelled ? '' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {booking.status.toLowerCase()}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {format(new Date(booking.date + 'T00:00:00'), 'EEE, MMM d, yyyy')}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {booking.startTime}–{booking.endTime}</span>
        </div>
        {booking.purpose && <div className="text-xs text-muted-foreground mt-0.5">Purpose: {booking.purpose}</div>}
        <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">ID: {booking.id}</div>
      </div>
      {!cancelled && (
        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onCancel}>
          <XCircle className="w-4 h-4 mr-1" /> Cancel
        </Button>
      )}
    </div>
  )
}

// ---------- Admin Panel ----------
function AdminPanel({ user }: { user: User }) {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [allBookings, setAllBookings] = useState<Booking[]>([])
  const [allBookingsDate, setAllBookingsDate] = useState(new Date().toISOString().slice(0, 10))
  const { toast } = useToast()

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/stats?userId=${user.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStats(data)
    } catch (e: any) {
      toast({ title: 'Failed to load admin stats', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [user.id, toast])

  const loadAllBookings = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings?userId=${user.id}&scope=all&date=${allBookingsDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAllBookings(data.bookings || [])
    } catch (e: any) {
      toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' })
    }
  }, [user.id, allBookingsDate, toast])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadAllBookings()
  }, [loadAllBookings])

  if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">Admin access required.</p>
            <p className="text-sm text-muted-foreground mt-1">Only STAFF and ADMIN roles can view campus-wide stats.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusBadge = (status: string) => {
    const cls: Record<string, string> = {
      CONFIRMED: 'bg-emerald-600 hover:bg-emerald-700',
      PENDING: 'bg-amber-500 hover:bg-amber-600',
      CANCELLED: 'bg-slate-500 hover:bg-slate-600',
      REJECTED: 'bg-red-500 hover:bg-red-600',
    }
    return <Badge variant="default" className={`text-xs ${cls[status] || ''}`}>{status.toLowerCase()}</Badge>
  }

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total labs" value={stats?.totals?.labs ?? '—'} icon={<Monitor className="w-4 h-4" />} />
        <StatCard label="Total users" value={stats?.totals?.users ?? '—'} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Bookings today" value={stats?.totals?.bookingsToday ?? '—'} icon={<CalendarIcon className="w-4 h-4" />} />
        <StatCard label="Bookings next 7 days" value={stats?.totals?.bookingsNext7Days ?? '—'} icon={<CalendarDays className="w-4 h-4" />} />
      </div>

      {/* Lab usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-emerald-600" /> Lab usage (next 7 days)</CardTitle>
          <CardDescription>Bookings per lab over the coming week.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {stats?.labUsage?.map((lab: any, i: number) => {
                const max = Math.max(1, ...stats.labUsage.map((l: any) => l.bookingsNext7Days))
                const pct = (lab.bookingsNext7Days / max) * 100
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate">{lab.lab}</span>
                      <span className="text-muted-foreground text-xs ml-2">{lab.bookingsNext7Days} bookings · {lab.status.toLowerCase()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All bookings for a date */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-emerald-600" /> All bookings on date</CardTitle>
          <CardDescription>Browse every reservation across campus.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="all-date">Date</Label>
              <Input id="all-date" type="date" value={allBookingsDate} onChange={(e) => setAllBookingsDate(e.target.value)} className="w-auto" />
            </div>
          </div>
          {allBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No bookings on this date.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-4">Lab</div>
                <div className="col-span-2">Time</div>
                <div className="col-span-3">Booked by</div>
                <div className="col-span-2">Purpose</div>
                <div className="col-span-1">Status</div>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {allBookings.map((b) => (
                  <div key={b.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center">
                    <div className="col-span-4 truncate">{b.lab.name}</div>
                    <div className="col-span-2 font-mono">{b.startTime}–{b.endTime}</div>
                    <div className="col-span-3 truncate">{b.user?.name || '—'} <span className="text-muted-foreground">({(b.user?.role || '').toLowerCase()})</span></div>
                    <div className="col-span-2 truncate text-muted-foreground">{b.purpose || '—'}</div>
                    <div className="col-span-1">{statusBadge(b.status)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      {stats?.recentActivity?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-emerald-600" /> Recent activity</CardTitle>
            <CardDescription>Latest 10 booking events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentActivity.map((b: Booking) => (
                <div key={b.id} className="flex items-center justify-between text-xs border-b last:border-0 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {statusBadge(b.status)}
                    <span className="truncate">{b.user?.name || 'Unknown'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="truncate">{b.lab.name}</span>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap ml-2">{b.date} {b.startTime}–{b.endTime}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <span className="text-emerald-600">{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

// ---------- Main page ----------
export default function Home() {
  const [user, setUser] = useState<User | null>(() => (typeof window !== 'undefined' ? loadUser() : null))
  const [tab, setTab] = useState('chat')

  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  const logout = () => {
    saveUser(null)
    setUser(null)
  }

  const roleBadge = {
    STUDENT: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    FACULTY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  }[user.role]

  const canSeeAdmin = user.role === 'ADMIN' || user.role === 'STAFF'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-tight">Labby</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Campus Lab Booking Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-semibold">
                {user.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
              </div>
              <div className="hidden sm:block text-xs">
                <div className="font-medium leading-tight">{user.name}</div>
                <div className="text-muted-foreground leading-tight">{user.email}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge}`}>{user.role.toLowerCase()}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-transparent h-12 p-0 gap-4">
              <TabsTrigger value="chat" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <Bot className="w-4 h-4" /> Chat Assistant
              </TabsTrigger>
              <TabsTrigger value="calendar" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="bookings" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <LayoutDashboard className="w-4 h-4" /> My Bookings
              </TabsTrigger>
              {canSeeAdmin && (
                <TabsTrigger value="admin" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                  <Shield className="w-4 h-4" /> Admin
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="chat" className="mt-0 h-[calc(100vh-3.5rem-3rem)]">
              <ChatPanel user={user} />
            </TabsContent>
            <TabsContent value="calendar" className="mt-0">
              <CalendarPanel user={user} />
            </TabsContent>
            <TabsContent value="bookings" className="mt-0">
              <MyBookingsPanel user={user} />
            </TabsContent>
            {canSeeAdmin && (
              <TabsContent value="admin" className="mt-0">
                <AdminPanel user={user} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t bg-background">
        <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>Labby · Campus Lab Booking Agent</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> All systems operational</span>
        </div>
      </footer>
    </div>
  )
}
