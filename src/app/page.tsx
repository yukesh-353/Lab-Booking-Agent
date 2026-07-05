'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Bot, Send, Calendar as CalendarIcon, LayoutDashboard, Shield, LogOut, Loader2, User,
  Clock, MapPin, Users, Monitor, CheckCircle2, XCircle, CalendarDays, Sparkles, History,
  Plus, Pencil, FlaskConical, Trash2, LogIn, UserPlus,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ThemeToggle } from '@/components/theme-toggle'

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
  } catch { return null }
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
  const [mode, setMode] = useState<'login' | 'register'>('login')
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

  // Login existing user by email (no password — consistent with demo auth model)
  const loginExisting = async () => {
    if (!email.trim()) { toast({ title: 'Email is required', variant: 'destructive' }); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/session?email=${encodeURIComponent(email.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'User not found')
      saveUser(data.user)
      onLogin(data.user)
    } catch (e: any) { toast({ title: 'Login failed', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }

  // Quick-login a demo account
  const loginDemo = async (demoEmail: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/session?email=${encodeURIComponent(demoEmail)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      saveUser(data.user)
      onLogin(data.user)
    } catch (e: any) { toast({ title: 'Login failed', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }

  // Register a new user
  const register = async () => {
    if (!name.trim() || !email.trim()) { toast({ title: 'Name and email are required', variant: 'destructive' }); return }
    setLoading(true)
    try {
      const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim(), role, department: department.trim() || undefined }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      saveUser(data.user)
      onLogin(data.user)
    } catch (e: any) { toast({ title: 'Registration failed', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 p-4">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-full max-w-md space-y-6 animate-fade-in-up">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg"><Bot className="w-8 h-8" /></div>
          <h1 className="text-3xl font-bold tracking-tight">Labby</h1>
          <p className="text-muted-foreground text-sm">Your AI agent for campus computer lab bookings</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Welcome</CardTitle>
            <CardDescription>Log in with your email or create a new account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as 'login' | 'register'); setEmail(''); setName(''); setDepartment('') }}>
              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="login">Login</TabsTrigger><TabsTrigger value="register">Sign up</TabsTrigger></TabsList>

              {/* LOGIN TAB — for existing users */}
              <TabsContent value="login" className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campus.edu" disabled={loading} onKeyDown={(e) => e.key === 'Enter' && loginExisting()} />
                </div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading} onClick={loginExisting}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}Login
                </Button>

                {/* Quick demo logins */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground text-center mb-2">Or try a demo account:</p>
                  <div className="grid grid-cols-2 gap-2 stagger">
                    {demoUsers.map((u) => (
                      <Button key={u.email} variant="outline" size="sm" disabled={loading} onClick={() => loginDemo(u.email)} className="text-xs h-auto py-2 flex flex-col items-start">
                        <span className="font-medium">{u.label.split(' · ')[0]}</span>
                        <span className="text-[10px] text-muted-foreground">{u.label.split(' · ')[1]}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* REGISTER TAB — for new users */}
              <TabsContent value="register" className="space-y-3 pt-4">
                <div className="space-y-1.5"><Label htmlFor="reg-name">Name</Label><Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" disabled={loading} /></div>
                <div className="space-y-1.5"><Label htmlFor="reg-email">Email</Label><Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@campus.edu" disabled={loading} /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-role">Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as any)} disabled={loading}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="STUDENT">Student</SelectItem><SelectItem value="FACULTY">Faculty</SelectItem><SelectItem value="STAFF">Staff</SelectItem><SelectItem value="ADMIN">Admin</SelectItem></SelectContent></Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="reg-dept">Department (optional)</Label><Input id="reg-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Computer Science" disabled={loading} /></div>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading} onClick={register}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}Create account
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------- Chat Panel ----------
function ChatPanel({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: `Hi ${user.name.split(' ')[0]}! I'm Labby, your lab booking assistant. I can help you book a computer lab, check availability, view your bookings, or cancel one. What would you like to do?`, ts: Date.now() }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, loading])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed, ts: Date.now() }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, message: trimmed, history }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
    } catch (e: any) {
      toast({ title: 'Chat error', description: e.message, variant: 'destructive' })
      setMessages((prev) => [...prev, { role: 'assistant', content: `Sorry, I hit an error: ${e.message}. Please try again.`, ts: Date.now() }])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef as any}>
          <div className="space-y-4 p-4 max-w-3xl mx-auto">
            {messages.map((m, i) => <MessageBubble key={i} message={m} userName={user.name} />)}
            {loading && (
              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0"><Bot className="w-4 h-4" /></div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm text-muted-foreground">Thinking…</span></div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <div className="border-t bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto p-4 space-y-3">
          <div className="flex flex-wrap gap-2">{QUICK_PROMPTS.map((p) => <Button key={p} variant="outline" size="sm" className="text-xs h-8" disabled={loading} onClick={() => send(p)}>{p}</Button>)}</div>
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Labby anything — e.g. 'book Lab A tomorrow 2-4pm'" disabled={loading} className="flex-1" />
            <Button type="submit" disabled={loading || !input.trim()} size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
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
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''} ${isUser ? 'animate-slide-in-right' : 'animate-slide-in-left'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-semibold ${isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>{isUser ? initials : <Bot className="w-4 h-4" />}</div>
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${isUser ? 'bg-slate-700 text-white rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}><MarkdownLite content={message.content} /></div>
    </div>
  )
}

function MarkdownLite({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.trim().startsWith('• ') || line.trim().startsWith('- ')) return (<div key={i} className="flex gap-2 pl-1"><span className="text-emerald-500 font-bold">•</span><span>{renderInline(line.trim().slice(2))}</span></div>)
        return <div key={i}>{renderInline(line) || <br />}</div>
      })}
    </div>
  )
}

function renderInline(text: string) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="px-1.5 py-0.5 rounded bg-background/60 text-xs font-mono">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

// ---------- Calendar / Availability Panel ----------
function CalendarPanel({ user: _user }: { user: User }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [selectedLab, setSelectedLab] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('sv-SE'))
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/labs').then((r) => r.json()).then((d) => { setLabs(d.labs || []); if (d.labs?.length) setSelectedLab(d.labs[0].id) }).catch(() => {})
  }, [])

  const loadSchedule = useCallback(async () => {
    if (!selectedLab || !selectedDate) return
    setLoading(true)
    try {
      const res = await fetch(`/api/labs/${selectedLab}/availability?date=${selectedDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSlots(data.slots || [])
    } catch (e: any) { toast({ title: 'Failed to load schedule', description: e.message, variant: 'destructive' }); setSlots([]) }
    finally { setLoading(false) }
  }, [selectedLab, selectedDate, toast])

  useEffect(() => { loadSchedule() }, [loadSchedule])

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
              <Select value={selectedLab} onValueChange={setSelectedLab}><SelectTrigger><SelectValue placeholder="Select a lab" /></SelectTrigger><SelectContent>{labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} {l.status !== 'OPEN' ? `(${l.status.toLowerCase()})` : ''}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="date">Date</Label><Input id="date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div>
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
              <h4 className="text-sm font-medium">Schedule for {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMM d, yyyy')}</h4>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            </div>
            <div className="space-y-1.5">
              {!loading && slots.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">Lab is closed or unavailable on this date.</div>}
              {slots.map((s, i) => (
                <div key={i} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${s.booked ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'}`}>
                  <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><span className="font-mono">{s.start} – {s.end}</span></div>
                  {s.booked ? <Badge variant="destructive" className="text-xs">Booked{s.bookerName ? ` · ${s.bookerName}` : ''}{s.purpose ? ` · ${s.purpose}` : ''}</Badge> : <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-700">Free</Badge>}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Book Panel (manual booking form with time pickers) ----------
function BookPanel({ user }: { user: User }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [selectedLabId, setSelectedLabId] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [purpose, setPurpose] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const { toast } = useToast()
  const todayStr = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    fetch('/api/labs')
      .then((r) => r.json())
      .then((d) => {
        const openLabs = (d.labs || []).filter((l: Lab) => l.status === 'OPEN')
        setLabs(openLabs)
        if (openLabs.length) setSelectedLabId(openLabs[0].id)
      })
      .catch(() => {})
  }, [])

  const selectedLab = labs.find((l) => l.id === selectedLabId)

  // Generate time options in 30-min increments within the lab's open hours
  const timeOptions: string[] = (() => {
    if (!selectedLab) return []
    const [oh, om] = selectedLab.openTime.split(':').map(Number)
    const [ch, cm] = selectedLab.closeTime.split(':').map(Number)
    const openM = oh * 60 + om
    const closeM = ch * 60 + cm
    const opts: string[] = []
    for (let m = openM; m <= closeM; m += 30) {
      opts.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    }
    return opts
  })()

  const endTimeOptions = startTime ? timeOptions.filter((t) => t > startTime) : timeOptions

  // Load availability preview for the selected lab + date
  useEffect(() => {
    if (!selectedLabId || !selectedDate) return
    fetch(`/api/labs/${selectedLabId}/availability?date=${selectedDate}`)
      .then((r) => r.json())
      .then((d) => { if (d.slots) setSlots(d.slots) })
      .catch(() => {})
  }, [selectedLabId, selectedDate])

  const submit = async () => {
    if (!selectedLabId || !selectedDate || !startTime || !endTime) {
      toast({ title: 'Please fill in all fields', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, labId: selectedLabId, date: selectedDate, startTime, endTime, purpose: purpose.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      toast({ title: 'Booking confirmed', description: `${selectedLab?.name} · ${format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')} · ${startTime}–${endTime}` })
      setStartTime(''); setEndTime(''); setPurpose('')
      // Refresh preview
      fetch(`/api/labs/${selectedLabId}/availability?date=${selectedDate}`).then((r) => r.json()).then((d) => { if (d.slots) setSlots(d.slots) })
    } catch (e: any) {
      toast({ title: 'Booking failed', description: e.message, variant: 'destructive' })
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-emerald-600" /> Book a lab</CardTitle>
          <CardDescription>Pick a lab, date, and time slot. Conflicts are checked automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Lab select */}
          <div className="space-y-1.5">
            <Label htmlFor="book-lab">Lab</Label>
            <Select value={selectedLabId} onValueChange={setSelectedLabId}>
              <SelectTrigger><SelectValue placeholder="Select a lab" /></SelectTrigger>
              <SelectContent>{labs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {selectedLab && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedLab.location}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {selectedLab.capacity} seats</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedLab.openTime}–{selectedLab.closeTime}</span>
                <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {selectedLab.software?.split(',')[0] || 'Standard'}</span>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="book-date">Date</Label>
            <Input id="book-date" type="date" min={todayStr} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>

          {/* Time pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="book-start">Start time</Label>
              <Select value={startTime} onValueChange={(v) => { setStartTime(v); setEndTime('') }}>
                <SelectTrigger><SelectValue placeholder="— select —" /></SelectTrigger>
                <SelectContent className="max-h-72">{timeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-end">End time</Label>
              <Select value={endTime} onValueChange={setEndTime} disabled={!startTime}>
                <SelectTrigger><SelectValue placeholder={startTime ? '— select —' : 'Pick start first'} /></SelectTrigger>
                <SelectContent className="max-h-72">{endTimeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-1.5">
            <Label htmlFor="book-purpose">Purpose (optional)</Label>
            <Input id="book-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} placeholder="e.g. ML project work" />
            <p className="text-[10px] text-muted-foreground">{purpose.length}/500 characters</p>
          </div>

          {/* Availability preview */}
          {selectedLab && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Availability on {format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {slots.length === 0 && <span className="text-xs text-muted-foreground">No data.</span>}
                {slots.map((s, i) => (
                  <Badge key={i} variant={s.booked ? 'destructive' : 'default'} className={`text-[10px] font-mono ${s.booked ? '' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{s.start}–{s.end}</Badge>
                ))}
              </div>
            </div>
          )}

          <Button onClick={submit} disabled={submitting || !selectedLabId || !startTime || !endTime} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}Confirm booking
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Labs Management Panel (faculty/staff/admin) ----------
function LabsPanel({ user }: { user: User }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Lab | null>(null)
  const [creating, setCreating] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/labs')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLabs(data.labs || [])
    } catch (e: any) { toast({ title: 'Failed to load labs', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const setLabStatus = async (lab: Lab, status: 'OPEN' | 'CLOSED' | 'MAINTENANCE') => {
    try {
      const res = await fetch(`/api/labs/${lab.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, status }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Status updated', description: `${lab.name} is now ${status.toLowerCase()}.` })
      load()
    } catch (e: any) { toast({ title: 'Failed to update', description: e.message, variant: 'destructive' }) }
  }

  const deleteLab = async (lab: Lab) => {
    if (!confirm(`Delete ${lab.name}? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/labs/${lab.id}?userId=${user.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Lab deleted', description: `${lab.name} has been removed.` })
      load()
    } catch (e: any) { toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' }) }
  }

  if (user.role === 'STUDENT') {
    return (<div className="p-4 max-w-5xl mx-auto"><Card><CardContent className="py-12 text-center"><Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" /><p className="text-muted-foreground">Faculty, staff, or admin access required.</p><p className="text-sm text-muted-foreground mt-1">Only faculty, staff, and admins can manage labs.</p></CardContent></Card></div>)
  }

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = { OPEN: 'bg-emerald-600 hover:bg-emerald-700', CLOSED: 'bg-slate-500 hover:bg-slate-600', MAINTENANCE: 'bg-amber-500 hover:bg-amber-600' }
    return <Badge variant="default" className={`text-xs ${cls[s] || ''}`}>{s.toLowerCase()}</Badge>
  }

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-emerald-600" /> Manage labs</CardTitle>
              <CardDescription>Create, edit, and control the status of campus computer labs.</CardDescription>
            </div>
            <Button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-1" /> Add lab</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
           : labs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No labs yet. Click "Add lab" to create the first one.</p>
           : (
            <div className="space-y-2">
              {labs.map((lab) => (
                <div key={lab.id} className="flex items-center justify-between rounded-lg border p-3 gap-3 hover-lift">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{lab.name}</span>
                      {statusBadge(lab.status)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {lab.location}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {lab.capacity}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {lab.openTime}–{lab.closeTime}</span>
                    </div>
                    {lab.software && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">Software: {lab.software}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Select value={lab.status} onValueChange={(v) => setLabStatus(lab, v as any)}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="OPEN">Open</SelectItem><SelectItem value="CLOSED">Closed</SelectItem><SelectItem value="MAINTENANCE">Maintenance</SelectItem></SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(lab)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => deleteLab(lab)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {(creating || editing) && <LabEditor lab={editing} userId={user.id} onClose={() => { setCreating(false); setEditing(null) }} onSaved={() => { setCreating(false); setEditing(null); load() }} />}
    </div>
  )
}

// ---------- Lab Editor (create/edit dialog) ----------
function LabEditor({ lab, userId, onClose, onSaved }: { lab: Lab | null; userId: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!lab
  const [name, setName] = useState(lab?.name || '')
  const [location, setLocation] = useState(lab?.location || '')
  const [capacity, setCapacity] = useState(lab?.capacity?.toString() || '30')
  const [openTime, setOpenTime] = useState(lab?.openTime || '08:00')
  const [closeTime, setCloseTime] = useState(lab?.closeTime || '22:00')
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'MAINTENANCE'>(lab?.status || 'OPEN')
  const [description, setDescription] = useState(lab?.description || '')
  const [software, setSoftware] = useState(lab?.software || '')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const allTimeOptions: string[] = (() => { const opts: string[] = []; for (let m = 0; m < 24 * 60; m += 30) opts.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`); return opts })()

  const save = async () => {
    if (!name.trim() || !location.trim() || !capacity || !openTime || !closeTime) { toast({ title: 'Please fill in all required fields', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const payload: any = { userId, name: name.trim(), location: location.trim(), capacity: Number(capacity), openTime, closeTime, status, description: description.trim() || null, software: software.trim() || null }
      const url = isEdit ? `/api/labs/${lab!.id}` : '/api/labs'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: isEdit ? 'Lab updated' : 'Lab created', description: `${name} has been ${isEdit ? 'updated' : 'added'}.` })
      onSaved()
    } catch (e: any) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit lab' : 'Add new lab'}</DialogTitle>
          <DialogDescription>{isEdit ? `Update details for ${lab!.name}.` : 'Create a new computer lab.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="lab-name">Name *</Label><Input id="lab-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Lab E — Engineering 305" /></div>
          <div className="space-y-1.5"><Label htmlFor="lab-location">Location *</Label><Input id="lab-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Building, room" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="lab-capacity">Capacity *</Label><Input id="lab-capacity" type="number" min="1" max="1000" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="lab-status">Status</Label><Select value={status} onValueChange={(v) => setStatus(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OPEN">Open</SelectItem><SelectItem value="CLOSED">Closed</SelectItem><SelectItem value="MAINTENANCE">Maintenance</SelectItem></SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="lab-open">Open time *</Label><Select value={openTime} onValueChange={setOpenTime}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-60">{allTimeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="lab-close">Close time *</Label><Select value={closeTime} onValueChange={setCloseTime}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="max-h-60">{allTimeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="lab-desc">Description</Label><Textarea id="lab-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} placeholder="Short description of the lab" /></div>
          <div className="space-y-1.5"><Label htmlFor="lab-software">Software (comma-separated)</Label><Input id="lab-software" value={software} onChange={(e) => setSoftware(e.target.value)} maxLength={500} placeholder="e.g. Python, MATLAB, Git" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{isEdit ? 'Save changes' : 'Create lab'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    } catch (e: any) { toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [user.id, toast])

  useEffect(() => { load() }, [load])

  const cancel = async (id: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}?userId=${user.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Booking cancelled', description: 'The slot is now free for others.' })
      load()
    } catch (e: any) { toast({ title: 'Failed to cancel', description: e.message, variant: 'destructive' }) }
  }

  const today = new Date().toLocaleDateString('sv-SE')
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
          {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
           : bookings.length === 0 ? <div className="text-center py-12 text-muted-foreground"><CalendarIcon className="w-10 h-10 mx-auto mb-3 opacity-50" /><p>You don't have any bookings yet.</p><p className="text-sm mt-1">Use the Chat tab to ask Labby to book a lab for you.</p></div>
           : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Upcoming ({upcoming.length})</h3>
                {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming bookings.</p> : <div className="space-y-2">{upcoming.map((b) => <BookingCard key={b.id} booking={b} onCancel={() => cancel(b.id)} />)}</div>}
              </div>
              {past.length > 0 && (<div><h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Past ({past.length})</h3><div className="space-y-2 opacity-70">{past.map((b) => <BookingCard key={b.id} booking={b} onCancel={() => cancel(b.id)} />)}</div></div>)}
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
    <div className={`flex items-center justify-between rounded-lg border p-3 ${cancelled ? 'opacity-60' : 'hover-lift'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{booking.lab.name}</span>
          <Badge variant={cancelled ? 'secondary' : 'default'} className={`text-xs ${cancelled ? '' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{booking.status.toLowerCase()}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {format(new Date(booking.date + 'T00:00:00'), 'EEE, MMM d, yyyy')}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {booking.startTime}–{booking.endTime}</span>
        </div>
        {booking.purpose && <div className="text-xs text-muted-foreground mt-0.5">Purpose: {booking.purpose}</div>}
        <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">ID: {booking.id}</div>
      </div>
      {!cancelled && <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onCancel}><XCircle className="w-4 h-4 mr-1" /> Cancel</Button>}
    </div>
  )
}

// ---------- Admin Panel ----------
function AdminPanel({ user }: { user: User }) {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [allBookings, setAllBookings] = useState<Booking[]>([])
  const [allBookingsDate, setAllBookingsDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [adminTab, setAdminTab] = useState<'overview' | 'users'>('overview')
  const { toast } = useToast()

  const loadStats = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch(`/api/admin/stats?userId=${user.id}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setStats(data) }
    catch (e: any) { toast({ title: 'Failed to load admin stats', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [user.id, toast])

  const loadAllBookings = useCallback(async () => {
    try { const res = await fetch(`/api/bookings?userId=${user.id}&scope=all&date=${allBookingsDate}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setAllBookings(data.bookings || []) }
    catch (e: any) { toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' }) }
  }, [user.id, allBookingsDate, toast])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadAllBookings() }, [loadAllBookings])

  if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
    return (<div className="p-4 max-w-5xl mx-auto"><Card><CardContent className="py-12 text-center"><Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" /><p className="text-muted-foreground">Admin access required.</p><p className="text-sm text-muted-foreground mt-1">Only STAFF and ADMIN roles can view campus-wide stats.</p></CardContent></Card></div>)
  }

  const statusBadge = (status: string) => {
    const cls: Record<string, string> = { CONFIRMED: 'bg-emerald-600 hover:bg-emerald-700', PENDING: 'bg-amber-500 hover:bg-amber-600', CANCELLED: 'bg-slate-500 hover:bg-slate-600', REJECTED: 'bg-red-500 hover:bg-red-600' }
    return <Badge variant="default" className={`text-xs ${cls[status] || ''}`}>{status.toLowerCase()}</Badge>
  }

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      {/* Sub-tabs: Overview + Users (admin only) */}
      <div className="flex gap-2">
        <Button variant={adminTab === 'overview' ? 'default' : 'outline'} size="sm" onClick={() => setAdminTab('overview')} className={adminTab === 'overview' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}>Overview</Button>
        {user.role === 'ADMIN' && <Button variant={adminTab === 'users' ? 'default' : 'outline'} size="sm" onClick={() => setAdminTab('users')} className={adminTab === 'users' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}><Users className="w-3.5 h-3.5 mr-1" /> User Management</Button>}
      </div>

      {adminTab === 'users' && user.role === 'ADMIN' ? (
        <UsersPanel user={user} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
            <StatCard label="Total labs" value={stats?.totals?.labs ?? '—'} icon={<Monitor className="w-4 h-4" />} />
            <StatCard label="Total users" value={stats?.totals?.users ?? '—'} icon={<Users className="w-4 h-4" />} />
            <StatCard label="Bookings today" value={stats?.totals?.bookingsToday ?? '—'} icon={<CalendarIcon className="w-4 h-4" />} />
            <StatCard label="Bookings next 7 days" value={stats?.totals?.bookingsNext7Days ?? '—'} icon={<CalendarDays className="w-4 h-4" />} />
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-emerald-600" /> Lab usage (next 7 days)</CardTitle><CardDescription>Bookings per lab over the coming week.</CardDescription></CardHeader>
            <CardContent>
              {loading ? <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
                <div className="space-y-2">
                  {stats?.labUsage?.map((lab: any, i: number) => {
                    const max = Math.max(1, ...stats.labUsage.map((l: any) => l.bookingsNext7Days))
                    const pct = (lab.bookingsNext7Days / max) * 100
                    return (<div key={i} className="space-y-1"><div className="flex items-center justify-between text-sm"><span className="truncate">{lab.lab}</span><span className="text-muted-foreground text-xs ml-2">{lab.bookingsNext7Days} bookings · {lab.status.toLowerCase()}</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-600" style={{ width: `${pct}%` }} /></div></div>)
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-emerald-600" /> All bookings on date</CardTitle><CardDescription>Browse every reservation across campus.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end"><div className="space-y-1.5"><Label htmlFor="all-date">Date</Label><Input id="all-date" type="date" value={allBookingsDate} onChange={(e) => setAllBookingsDate(e.target.value)} className="w-auto" /></div></div>
              {allBookings.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No bookings on this date.</p> : (
                <div className="rounded-md border overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"><div className="col-span-4">Lab</div><div className="col-span-2">Time</div><div className="col-span-3">Booked by</div><div className="col-span-2">Purpose</div><div className="col-span-1">Status</div></div>
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {allBookings.map((b) => (<div key={b.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center"><div className="col-span-4 truncate">{b.lab.name}</div><div className="col-span-2 font-mono">{b.startTime}–{b.endTime}</div><div className="col-span-3 truncate">{b.user?.name || '—'} <span className="text-muted-foreground">({(b.user?.role || '').toLowerCase()})</span></div><div className="col-span-2 truncate text-muted-foreground">{b.purpose || '—'}</div><div className="col-span-1">{statusBadge(b.status)}</div></div>))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {stats?.recentActivity?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-emerald-600" /> Recent activity</CardTitle><CardDescription>Latest 10 booking events.</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.recentActivity.map((b: Booking) => (<div key={b.id} className="flex items-center justify-between text-xs border-b last:border-0 py-2"><div className="flex items-center gap-2 min-w-0">{statusBadge(b.status)}<span className="truncate">{b.user?.name || 'Unknown'}</span><span className="text-muted-foreground">→</span><span className="truncate">{b.lab.name}</span></div><span className="text-muted-foreground whitespace-nowrap ml-2">{b.date} {b.startTime}–{b.endTime}</span></div>))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ---------- User Management Panel (admin only) ----------
function UsersPanel({ user }: { user: User }) {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?userId=${user.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.users || [])
    } catch (e: any) { toast({ title: 'Failed to load users', description: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [user.id, toast])

  useEffect(() => { load() }, [load])

  const deleteUser = async (u: any) => {
    if (!confirm(`Delete ${u.name}? This will also delete all their bookings. This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/users/${u.id}?userId=${user.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'User deleted', description: `${u.name} has been removed.` })
      load()
    } catch (e: any) { toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' }) }
  }

  const roleBadge = (r: string) => {
    const cls: Record<string, string> = {
      STUDENT: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      FACULTY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
      STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    }
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls[r] || ''}`}>{r.toLowerCase()}</span>
  }

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600" /> Manage users</CardTitle>
              <CardDescription>Add, edit, or remove users from the system.</CardDescription>
            </div>
            <Button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-1" /> Add user</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
           : users.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
           : (
            <div className="rounded-md border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-3">Name</div>
                <div className="col-span-4">Email</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Department</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              <div className="divide-y max-h-[60vh] overflow-y-auto">
                {users.map((u) => (
                  <div key={u.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-xs items-center">
                    <div className="col-span-3 font-medium truncate">{u.name}{u.id === user.id && <span className="text-[9px] text-muted-foreground ml-1">(you)</span>}</div>
                    <div className="col-span-4 truncate text-muted-foreground">{u.email}</div>
                    <div className="col-span-2">{roleBadge(u.role)}</div>
                    <div className="col-span-2 truncate text-muted-foreground">{u.department || '—'}</div>
                    <div className="col-span-1 flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(u)} title="Edit"><Pencil className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => deleteUser(u)} title="Delete" disabled={u.id === user.id}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {(creating || editing) && <UserEditor user={editing} adminId={user.id} onClose={() => { setCreating(false); setEditing(null) }} onSaved={() => { setCreating(false); setEditing(null); load() }} />}
    </div>
  )
}

// ---------- User Editor (create/edit dialog) ----------
function UserEditor({ user, adminId, onClose, onSaved }: { user: any | null; adminId: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!user
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [role, setRole] = useState<'STUDENT' | 'FACULTY' | 'STAFF' | 'ADMIN'>(user?.role || 'FACULTY')
  const [department, setDepartment] = useState(user?.department || '')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const save = async () => {
    if (!name.trim() || !email.trim()) { toast({ title: 'Name and email are required', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const payload: any = { userId: adminId, name: name.trim(), role, department: department.trim() || null }
      if (!isEdit) payload.email = email.trim().toLowerCase()
      const url = isEdit ? `/api/admin/users/${user.id}?userId=${adminId}` : '/api/admin/users'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: isEdit ? 'User updated' : 'User created', description: `${name} has been ${isEdit ? 'updated' : 'added'}.` })
      onSaved()
    } catch (e: any) { toast({ title: 'Save failed', description: e.message, variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'Add new user'}</DialogTitle>
          <DialogDescription>{isEdit ? `Update details for ${user.name}.` : 'Create a new user account.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="user-name">Name *</Label><Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Jane Doe" /></div>
          <div className="space-y-1.5"><Label htmlFor="user-email">Email *</Label><Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@campus.edu" disabled={isEdit} />{isEdit && <p className="text-[10px] text-muted-foreground">Email cannot be changed.</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="user-role">Role</Label><Select value={role} onValueChange={(v) => setRole(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="STUDENT">Student</SelectItem><SelectItem value="FACULTY">Faculty</SelectItem><SelectItem value="STAFF">Staff</SelectItem><SelectItem value="ADMIN">Admin</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="user-dept">Department</Label><Input id="user-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Computer Science" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{isEdit ? 'Save changes' : 'Create user'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) {
  return (<Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span><span className="text-emerald-600">{icon}</span></div><div className="mt-2 text-2xl font-bold">{value}</div></CardContent></Card>)
}

// ---------- Main page ----------
export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('chat')

  useEffect(() => {
    // Load cached user, then refresh from server using email (stable across DB re-seeds).
    const cached = loadUser()
    let cancelled = false
    const id = setTimeout(async () => {
      if (!cached) { if (!cancelled) setLoading(false); return }
      try {
        const res = await fetch(`/api/session?email=${encodeURIComponent(cached.email)}`)
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data.user) { saveUser(data.user); setUser(data.user) }
          else { saveUser(null); setUser(null) }
        } else { saveUser(null); setUser(null) }
      } catch {
        if (cancelled) return
        setUser(cached)
      }
      if (!cancelled) setLoading(false)
    }, 0)
    return () => { cancelled = true; clearTimeout(id) }
  }, [])

  if (loading) {
    return (<div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background"><div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center animate-scale-in"><Bot className="w-6 h-6" /></div><div className="flex items-center gap-2 text-sm text-muted-foreground animate-fade-in-down"><Loader2 className="w-4 h-4 animate-spin" /> Loading Labby…</div></div>)
  }

  if (!user) return <LoginScreen onLogin={setUser} />

  const logout = () => { saveUser(null); setUser(null) }

  const roleBadge = {
    STUDENT: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    FACULTY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  }[user.role]

  const canSeeAdmin = user.role === 'ADMIN' || user.role === 'STAFF'
  const canManageLabs = user.role === 'ADMIN' || user.role === 'STAFF' || user.role === 'FACULTY'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center"><Bot className="w-4 h-4" /></div>
            <div><h1 className="font-semibold text-sm leading-tight">Labby</h1><p className="text-[10px] text-muted-foreground leading-tight">Campus Lab Booking Agent</p></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-semibold">{user.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div>
              <div className="hidden sm:block text-xs"><div className="font-medium leading-tight">{user.name}</div><div className="text-muted-foreground leading-tight">{user.email}</div></div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge}`}>{user.role.toLowerCase()}</span>
            </div>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} title="Sign out"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>
      <div className="border-b bg-background">
        <div className="max-w-6xl mx-auto px-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-transparent h-12 p-0 gap-4">
              <TabsTrigger value="chat" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5"><Bot className="w-4 h-4" /> Chat</TabsTrigger>
              <TabsTrigger value="book" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Book</TabsTrigger>
              <TabsTrigger value="calendar" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5"><CalendarIcon className="w-4 h-4" /> Availability</TabsTrigger>
              <TabsTrigger value="bookings" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5"><LayoutDashboard className="w-4 h-4" /> My Bookings</TabsTrigger>
              {canManageLabs && <TabsTrigger value="labs" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5"><FlaskConical className="w-4 h-4" /> Labs</TabsTrigger>}
              {canSeeAdmin && <TabsTrigger value="admin" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5"><Shield className="w-4 h-4" /> Admin</TabsTrigger>}
            </TabsList>
            <TabsContent value="chat" className="mt-0 h-[calc(100vh-3.5rem-3rem)]"><ChatPanel user={user} /></TabsContent>
            <TabsContent value="book" className="mt-0 tab-content-enter"><BookPanel user={user} /></TabsContent>
            <TabsContent value="calendar" className="mt-0 tab-content-enter"><CalendarPanel user={user} /></TabsContent>
            <TabsContent value="bookings" className="mt-0 tab-content-enter"><MyBookingsPanel user={user} /></TabsContent>
            {canManageLabs && <TabsContent value="labs" className="mt-0 tab-content-enter"><LabsPanel user={user} /></TabsContent>}
            {canSeeAdmin && <TabsContent value="admin" className="mt-0 tab-content-enter"><AdminPanel user={user} /></TabsContent>}
          </Tabs>
        </div>
      </div>
      <footer className="mt-auto border-t bg-background"><div className="max-w-6xl mx-auto px-4 py-3 text-xs text-muted-foreground flex items-center justify-between"><span>Labby · Campus Lab Booking Agent</span><span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> All systems operational</span></div></footer>
    </div>
  )
}
