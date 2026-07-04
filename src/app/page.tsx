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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Bot, Send, Calendar as CalendarIcon, LayoutDashboard, Shield, LogOut, Loader2, User,
  Clock, MapPin, Users, Monitor, CheckCircle2, XCircle, CalendarDays, Sparkles, History,
  Plus, Pencil, FlaskConical, Trash2, AlertCircle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ThemeToggle } from '@/components/theme-toggle'

// ---------- Types ----------
interface User {
  id: string
  name: string
  email: string
  role: 'FACULTY' | 'STAFF' | 'ADMIN'
  department?: string | null
}
type LiveStatus = 'AVAILABLE' | 'BOOKED_NOW' | 'CLOSED' | 'MAINTENANCE' | 'OUTSIDE_HOURS'
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
  // Live status fields (from /api/labs)
  liveStatus?: LiveStatus
  activeBooking?: { startTime: string; endTime: string; bookerName?: string } | null
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

// ---------- Live status badge ----------
function liveStatusConfig(status?: LiveStatus, activeBooking?: { startTime: string; endTime: string; bookerName?: string } | null) {
  switch (status) {
    case 'AVAILABLE':
      return { label: 'Available now', cls: 'bg-emerald-600 hover:bg-emerald-700 text-white', icon: CheckCircle2 }
    case 'BOOKED_NOW':
      return { label: activeBooking ? `Booked until ${activeBooking.endTime}` : 'Booked now', cls: 'bg-red-500 hover:bg-red-600 text-white', icon: XCircle }
    case 'OUTSIDE_HOURS':
      return { label: 'Outside hours', cls: 'bg-slate-400 hover:bg-slate-500 text-white', icon: Clock }
    case 'MAINTENANCE':
      return { label: 'Maintenance', cls: 'bg-amber-500 hover:bg-amber-600 text-white', icon: AlertCircle }
    case 'CLOSED':
      return { label: 'Closed', cls: 'bg-slate-500 hover:bg-slate-600 text-white', icon: XCircle }
    default:
      return { label: 'Unknown', cls: 'bg-slate-400 hover:bg-slate-500 text-white', icon: AlertCircle }
  }
}

function LiveStatusBadge({ status, activeBooking, className = '' }: { status?: LiveStatus; activeBooking?: { startTime: string; endTime: string; bookerName?: string } | null; className?: string }) {
  const cfg = liveStatusConfig(status, activeBooking)
  const Icon = cfg.icon
  return (
    <Badge variant="default" className={`text-[10px] ${cfg.cls} ${className}`}>
      <Icon className="w-3 h-3 mr-1" />
      {cfg.label}
    </Badge>
  )
}

// Hook: re-render every `intervalMs` milliseconds so time-based UI stays fresh
function useTick(intervalMs = 60000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

// Convert "HH:mm" to minutes since midnight (local)
function timeToMinutesLocal(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Auth-aware fetch wrapper: if any API call returns 401, dispatch a global event
// that logs the user out and shows the login screen.
// Skip the event for /api/auth/* endpoints — those handle their own 401s.
async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options)
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event('labby-unauthorized'))
  }
  return res
}

// Helper: check if an error is an auth error (401) — these are handled globally
// by the labby-unauthorized event, so individual catch blocks should skip
// showing a toast for them.
function isAuthError(e: any): boolean {
  const msg = (e?.message || '').toLowerCase()
  return msg.includes('not authenticated') || msg.includes('unauthorized')
}

// ---------- Login screen (secure login + register with captcha) ----------
function LoginScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const { toast } = useToast()

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
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
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'login' | 'register')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="pt-4">
                <LoginForm onLogin={onLogin} toast={toast} />
              </TabsContent>
              <TabsContent value="register" className="pt-4">
                <RegisterForm onLogin={onLogin} toast={toast} />
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>
        <p className="text-xs text-center text-muted-foreground">
          Demo accounts: bob/carol/admin @campus.edu · password: <code className="font-mono">demo1234</code>
        </p>
      </div>
    </div>
  )
}

// ---------- Login form ----------
function LoginForm({ onLogin, toast }: { onLogin: (u: User) => void; toast: any }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast({ title: 'Email and password are required', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      // Verify the session cookie was actually set by calling /api/auth/me
      // This ensures the cookie is valid before we transition to the app.
      const meRes = await fetch('/api/auth/me')
      if (meRes.ok) {
        const meData = await meRes.json()
        saveUser(meData.user)
        onLogin(meData.user)
      } else {
        // Cookie didn't set — fall back to the login response user
        saveUser(data.user)
        onLogin(data.user)
      }
    } catch (e: any) {
      toast({ title: 'Login failed', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Email</Label>
        <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campus.edu" autoComplete="email" disabled={loading} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Password</Label>
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={loading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  )
}

// ---------- Register form (with captcha) ----------
function RegisterForm({ onLogin, toast }: { onLogin: (u: User) => void; toast: any }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<'FACULTY' | 'STAFF'>('FACULTY')
  const [department, setDepartment] = useState('')
  const [captcha, setCaptcha] = useState<{ id: string; question: string } | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Fetch a captcha when the register tab first renders
  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true)
    try {
      const res = await fetch('/api/auth/captcha')
      const data = await res.json()
      setCaptcha({ id: data.id, question: data.question })
      setCaptchaAnswer('')
    } catch {
      // ignore
    } finally {
      setCaptchaLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCaptcha()
  }, [loadCaptcha])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password) {
      toast({ title: 'All fields are required', variant: 'destructive' })
      return
    }
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    if (password.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }
    if (!captcha || !captchaAnswer.trim()) {
      toast({ title: 'Please solve the captcha', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          department: department.trim() || undefined,
          captchaId: captcha.id,
          captchaAnswer: captchaAnswer.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Captcha failed — get a fresh one
        if (/captcha/i.test(data.error || '')) loadCaptcha()
        throw new Error(data.error || 'Registration failed')
      }
      saveUser(data.user)
      onLogin(data.user)
    } catch (e: any) {
      toast({ title: 'Registration failed', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="reg-name">Full name</Label>
        <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" disabled={loading} maxLength={100} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">Email</Label>
        <Input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@campus.edu" autoComplete="email" disabled={loading} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reg-password">Password</Label>
          <div className="relative">
            <Input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 8 chars"
              autoComplete="new-password"
              disabled={loading}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground" tabIndex={-1}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-confirm">Confirm</Label>
          <Input
            id="reg-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="re-enter"
            autoComplete="new-password"
            disabled={loading}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reg-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as any)} disabled={loading}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FACULTY">Faculty</SelectItem>
              <SelectItem value="STAFF">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-dept">Department</Label>
          <Input id="reg-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Computer Science" disabled={loading} />
        </div>
      </div>

      {/* Captcha */}
      <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="captcha" className="text-xs flex items-center gap-1">
            <Shield className="w-3 h-3" /> Verification
          </Label>
          <button type="button" onClick={loadCaptcha} disabled={captchaLoading || loading} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1" tabIndex={-1}>
            <Sparkles className="w-3 h-3" /> Refresh
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono bg-background px-3 py-1.5 rounded border flex-1 text-center select-none">
            {captchaLoading ? '…' : captcha?.question || 'Loading…'}
          </span>
          <Input
            id="captcha"
            value={captchaAnswer}
            onChange={(e) => setCaptchaAnswer(e.target.value)}
            placeholder="answer"
            disabled={loading || captchaLoading}
            className="w-24 text-center"
            inputMode="numeric"
          />
        </div>
      </div>

      <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Create account
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        Admin role cannot be self-assigned. Contact IT if you need admin access.
      </p>
    </form>
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
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Chat error', description: e.message, variant: 'destructive' })
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
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('sv-SE'))
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  useTick(30000) // re-render every 30s so the "NOW" highlight follows the current time

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
      const res = await apiFetch(`/api/labs/${selectedLab}/availability?date=${selectedDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSlots(data.slots || [])
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to load schedule', description: e.message, variant: 'destructive' })
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
              {slots.map((s, i) => {
                // Highlight the slot that contains "now" if viewing today's schedule
                const nowM = new Date().getHours() * 60 + new Date().getMinutes()
                const isToday = selectedDate === new Date().toLocaleDateString('sv-SE')
                const isNowSlot = isToday && nowM >= timeToMinutesLocal(s.start) && nowM < timeToMinutesLocal(s.end)
                const isPastSlot = isToday && nowM >= timeToMinutesLocal(s.end)
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                      isNowSlot
                        ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40 ring-1 ring-blue-400'
                        : isPastSlot
                        ? 'opacity-50 ' + (s.booked ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30')
                        : s.booked ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-mono">{s.start} – {s.end}</span>
                      {isNowSlot && (
                        <Badge variant="default" className="text-[10px] bg-blue-500 hover:bg-blue-600 text-white ml-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1" /> NOW
                        </Badge>
                      )}
                      {isPastSlot && !isNowSlot && (
                        <span className="text-[10px] text-muted-foreground">past</span>
                      )}
                    </div>
                    {s.booked ? (
                      <Badge variant="destructive" className="text-xs">
                        Booked{s.bookerName ? ` · ${s.bookerName}` : ''}{s.purpose ? ` · ${s.purpose}` : ''}
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-700">Free</Badge>
                    )}
                  </div>
                )
              })}
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

// ---------- Book Panel (manual booking form with time pickers) ----------
function BookPanel({ user }: { user: User }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [selectedLabId, setSelectedLabId] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [purpose, setPurpose] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const { toast } = useToast()
  const todayStr = new Date().toLocaleDateString('sv-SE')

  // Re-fetch labs every 60s so live status updates as bookings start/end
  const loadLabs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/labs')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const openLabs = (data.labs || []).filter((l: Lab) => l.status === 'OPEN')
      setLabs(openLabs)
      setSelectedLabId((prev) => prev && openLabs.some((l: Lab) => l.id === prev) ? prev : (openLabs[0]?.id || ''))
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to load labs', description: e.message, variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => {
    loadLabs()
    const id = setInterval(loadLabs, 60000) // refresh live status every 60s
    return () => clearInterval(id)
  }, [loadLabs])

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

  // Filter end-time options to be after the selected start time
  const endTimeOptions = startTime ? timeOptions.filter((t) => t > startTime) : timeOptions

  // Load availability preview for the selected lab + date
  const loadPreview = useCallback(async () => {
    if (!selectedLabId || !selectedDate) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/labs/${selectedLabId}/availability?date=${selectedDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSlots(data.slots || [])
    } catch {
      setSlots([])
    } finally {
      setLoading(false)
    }
  }, [selectedLabId, selectedDate])

  useEffect(() => { loadPreview() }, [loadPreview])

  const submit = async () => {
    if (!selectedLabId || !selectedDate || !startTime || !endTime) {
      toast({ title: 'Please fill in all fields', description: 'Lab, date, start time, and end time are required.', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labId: selectedLabId,
          date: selectedDate,
          startTime,
          endTime,
          purpose: purpose.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      toast({
        title: 'Booking confirmed',
        description: `${selectedLab?.name} on ${format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d')} · ${startTime}–${endTime}`,
      })
      // Reset time + purpose, refresh preview
      setStartTime('')
      setEndTime('')
      setPurpose('')
      loadPreview()
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Booking failed', description: e.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-emerald-600" /> Book a lab</CardTitle>
          <CardDescription>Pick a lab, date, and time slot. Conflicts are checked automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Lab select with live status */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="book-lab">Lab</Label>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live status
              </span>
            </div>
            <Select value={selectedLabId} onValueChange={setSelectedLabId}>
              <SelectTrigger><SelectValue placeholder="Select a lab" /></SelectTrigger>
              <SelectContent>
                {labs.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <div className="flex items-center gap-2 w-full">
                      <span className="truncate">{l.name}</span>
                      <LiveStatusBadge status={l.liveStatus} activeBooking={l.activeBooking} className="ml-auto" />
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedLab && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Live status</span>
                <LiveStatusBadge status={selectedLab.liveStatus} activeBooking={selectedLab.activeBooking} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedLab.location}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {selectedLab.capacity} seats</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedLab.openTime}–{selectedLab.closeTime}</span>
                <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {selectedLab.software?.split(',')[0] || 'Standard'}</span>
              </div>
              {selectedLab.liveStatus === 'BOOKED_NOW' && selectedLab.activeBooking && (
                <div className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1 pt-1 border-t">
                  <AlertCircle className="w-3 h-3" />
                  Currently in use{selectedLab.activeBooking.bookerName ? ` by ${selectedLab.activeBooking.bookerName}` : ''} until {selectedLab.activeBooking.endTime}. It'll be available again after that.
                </div>
              )}
              {selectedLab.liveStatus === 'AVAILABLE' && (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1 border-t">
                  <CheckCircle2 className="w-3 h-3" />
                  Free right now — pick any available time slot below.
                </div>
              )}
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
                <SelectContent className="max-h-72">
                  {timeOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-end">End time</Label>
              <Select value={endTime} onValueChange={setEndTime} disabled={!startTime}>
                <SelectTrigger><SelectValue placeholder={startTime ? '— select —' : 'Pick start first'} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {endTimeOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
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
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {slots.length === 0 && !loading && <span className="text-xs text-muted-foreground">No data.</span>}
                {slots.map((s, i) => (
                  <Badge key={i} variant={s.booked ? 'destructive' : 'default'} className={`text-[10px] font-mono ${s.booked ? '' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {s.start}–{s.end}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Button onClick={submit} disabled={submitting || !selectedLabId || !startTime || !endTime} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Confirm booking
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Labs Management Panel (admin/staff only) ----------
function LabsPanel({ user }: { user: User }) {
  const [labs, setLabs] = useState<Lab[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Lab | null>(null)
  const [creating, setCreating] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/labs')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLabs(data.labs || [])
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to load labs', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000) // refresh live status every 60s
    return () => clearInterval(id)
  }, [load])

  const setLabStatus = async (lab: Lab, status: 'OPEN' | 'CLOSED' | 'MAINTENANCE') => {
    try {
      const res = await apiFetch(`/api/labs/${lab.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Status updated', description: `${lab.name} is now ${status.toLowerCase()}.` })
      load()
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to update', description: e.message, variant: 'destructive' })
    }
  }

  const deleteLab = async (lab: Lab) => {
    if (!confirm(`Delete ${lab.name}? This cannot be undone.`)) return
    try {
      const res = await apiFetch(`/api/labs/${lab.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Lab deleted', description: `${lab.name} has been removed.` })
      load()
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' })
    }
  }

  // All authenticated users (faculty, staff, admin) can manage labs.
  // No role gate needed — the tab is visible to everyone.

  const statusBadge = (s: string) => {
    const cls: Record<string, string> = {
      OPEN: 'bg-emerald-600 hover:bg-emerald-700',
      CLOSED: 'bg-slate-500 hover:bg-slate-600',
      MAINTENANCE: 'bg-amber-500 hover:bg-amber-600',
    }
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
            <Button onClick={() => setCreating(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add lab
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : labs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No labs yet. Click "Add lab" to create the first one.</p>
          ) : (
            <div className="space-y-2">
              {labs.map((lab) => (
                <div key={lab.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{lab.name}</span>
                      {statusBadge(lab.status)}
                      <LiveStatusBadge status={lab.liveStatus} activeBooking={lab.activeBooking} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {lab.location}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {lab.capacity}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {lab.openTime}–{lab.closeTime}</span>
                    </div>
                    {lab.software && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">Software: {lab.software}</div>}
                    {lab.liveStatus === 'BOOKED_NOW' && lab.activeBooking && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                        In session{lab.activeBooking.bookerName ? ` — ${lab.activeBooking.bookerName}` : ''} ({lab.activeBooking.startTime}–{lab.activeBooking.endTime})
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Quick status toggle */}
                    <Select value={lab.status} onValueChange={(v) => setLabStatus(lab, v as any)}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                        <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(lab)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => deleteLab(lab)} title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <LabEditor
          lab={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ---------- Lab Editor (create/edit dialog) ----------
function LabEditor({ lab, onClose, onSaved }: { lab: Lab | null; onClose: () => void; onSaved: () => void }) {
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

  // Time options for open/close (every 30 min from 00:00 to 23:30)
  const allTimeOptions: string[] = (() => {
    const opts: string[] = []
    for (let m = 0; m < 24 * 60; m += 30) opts.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    return opts
  })()

  const save = async () => {
    if (!name.trim() || !location.trim() || !capacity || !openTime || !closeTime) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload: any = {
        name: name.trim(),
        location: location.trim(),
        capacity: Number(capacity),
        openTime,
        closeTime,
        status,
        description: description.trim() || null,
        software: software.trim() || null,
      }
      const url = isEdit ? `/api/labs/${lab!.id}` : '/api/labs'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: isEdit ? 'Lab updated' : 'Lab created', description: `${name} has been ${isEdit ? 'updated' : 'added'}.` })
      onSaved()
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit lab' : 'Add new lab'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Update details for ${lab!.name}.` : 'Create a new computer lab. Only admins and staff can do this.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lab-name">Name *</Label>
            <Input id="lab-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Lab E — Engineering 305" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-location">Location *</Label>
            <Input id="lab-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="Building, room" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lab-capacity">Capacity *</Label>
              <Input id="lab-capacity" type="number" min="1" max="1000" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lab-open">Open time *</Label>
              <Select value={openTime} onValueChange={setOpenTime}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">{allTimeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-close">Close time *</Label>
              <Select value={closeTime} onValueChange={setCloseTime}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">{allTimeOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-desc">Description</Label>
            <Textarea id="lab-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} placeholder="Short description of the lab" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-software">Software (comma-separated)</Label>
            <Input id="lab-software" value={software} onChange={(e) => setSoftware(e.target.value)} maxLength={500} placeholder="e.g. Python, MATLAB, Git" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {isEdit ? 'Save changes' : 'Create lab'}
          </Button>
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
      const res = await apiFetch(`/api/bookings?scope=mine`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBookings(data.bookings || [])
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const cancel = async (id: string) => {
    try {
      const res = await apiFetch(`/api/bookings/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Booking cancelled', description: 'The slot is now free for others.' })
      load()
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to cancel', description: e.message, variant: 'destructive' })
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
  const [allBookingsDate, setAllBookingsDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const { toast } = useToast()

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/admin/stats`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStats(data)
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to load admin stats', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadAllBookings = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/bookings?scope=all&date=${allBookingsDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAllBookings(data.bookings || [])
    } catch (e: any) {
      if (!isAuthError(e)) toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' })
    }
  }, [allBookingsDate, toast])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadAllBookings()
  }, [loadAllBookings])

  // All authenticated users (faculty, staff, admin) can view admin stats.
  // No role gate needed — the tab is visible to everyone.

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
  // Always start with null user + loading=true so server and client render
  // the same initial HTML (the loading screen). The real user is loaded from
  // localStorage in a useEffect after hydration completes.
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('chat')

  useEffect(() => {
    // Always verify the session with the server BEFORE showing the authenticated UI.
    // This prevents the race condition where a stale localStorage cache shows the
    // user as logged in, but the session cookie is invalid (e.g. after a DB reset)
    // — which would cause 401 errors on every API call.
    let cancelled = false
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (data.user) {
            saveUser(data.user)
            setUser(data.user)
          }
        } else {
          // Session invalid/expired — clear any stale cache.
          // Do NOT dispatch labby-unauthorized here; this is the initial check,
          // not a mid-session expiry. Just clear state silently.
          saveUser(null)
        }
      } catch {
        if (cancelled) return
        // Network error — try the cached user as a fallback (offline mode)
        const cached = loadUser()
        if (cached) setUser(cached)
      }
      if (!cancelled) setLoading(false)
    }, 0)
    return () => { cancelled = true; clearTimeout(id) }
  }, [])

  // Global 401 handler: if any API call returns 401 AFTER the initial load,
  // log out and show login. This catches stale sessions that expire while
  // the user is using the app. We skip this during the initial loading phase
  // to avoid racing with the /api/auth/me check above.
  useEffect(() => {
    const handle401 = () => {
      // Only react to 401 if we're past the initial loading screen.
      // During initial load, the /api/auth/me check handles auth state.
      if (!loading) {
        saveUser(null)
        setUser(null)
      }
    }
    window.addEventListener('labby-unauthorized', handle401)
    return () => window.removeEventListener('labby-unauthorized', handle401)
  }, [loading])

  // Loading state — matches what the server renders, so no hydration mismatch
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center">
          <Bot className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Labby…
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore — still clear local state
    }
    saveUser(null)
    setUser(null)
  }

  const roleBadge = {
    FACULTY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  }[user.role as 'FACULTY' | 'STAFF' | 'ADMIN'] || 'bg-slate-100 text-slate-700'

  // The software is for faculty, staff, and admins only (no students).
  // All roles have full access to every feature: chat, book, availability,
  // bookings, lab management (Labs tab), and campus-wide stats (Admin tab).
  const canSeeAdmin = true
  const canSeeLabs = true

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
            <ThemeToggle />
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
            <TabsList className="bg-transparent h-12 p-0 gap-4 overflow-x-auto">
              <TabsTrigger value="chat" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <Bot className="w-4 h-4" /> Chat
              </TabsTrigger>
              <TabsTrigger value="book" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" /> Book
              </TabsTrigger>
              <TabsTrigger value="calendar" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4" /> Availability
              </TabsTrigger>
              <TabsTrigger value="bookings" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                <LayoutDashboard className="w-4 h-4" /> My Bookings
              </TabsTrigger>
              {canSeeLabs && (
                <TabsTrigger value="labs" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                  <FlaskConical className="w-4 h-4" /> Labs
                </TabsTrigger>
              )}
              {canSeeAdmin && (
                <TabsTrigger value="admin" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 flex items-center gap-1.5">
                  <Shield className="w-4 h-4" /> Admin
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="chat" className="mt-0 h-[calc(100vh-3.5rem-3rem)]">
              <ChatPanel user={user} />
            </TabsContent>
            <TabsContent value="book" className="mt-0">
              <BookPanel user={user} />
            </TabsContent>
            <TabsContent value="calendar" className="mt-0">
              <CalendarPanel user={user} />
            </TabsContent>
            <TabsContent value="bookings" className="mt-0">
              <MyBookingsPanel user={user} />
            </TabsContent>
            {canSeeLabs && (
              <TabsContent value="labs" className="mt-0">
                <LabsPanel user={user} />
              </TabsContent>
            )}
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
