'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Bot, Send, Calendar as CalendarIcon, LayoutDashboard, Shield, LogOut, Loader2, User,
  Clock, MapPin, Users, Monitor, CheckCircle2, XCircle, CalendarDays, Sparkles, History,
  Mail, Sun, Moon, Contrast, Flame, Palette, LogIn, AlertCircle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

// ---------- Types ----------
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
  user?: { name: string; role: string; email: string }
  createdAt?: string
}
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

// ---------- Quick suggestions ----------
const QUICK_PROMPTS = [
  'List all available labs',
  'Is Lab A free tomorrow afternoon?',
  'Book Lab B tomorrow 2-4pm for ML project',
  'Show my bookings',
]

// ---------- Theme switcher ----------
const THEMES = [
  { id: 'light', label: 'Light', description: 'Clean daytime', icon: Sun },
  { id: 'dark', label: 'Dark', description: 'Standard dark mode', icon: Moon },
  { id: 'amoled', label: 'AMOLED', description: 'Pure black for OLED screens', icon: Contrast },
  { id: 'ambient', label: 'Ambient', description: 'Warm low-light for night', icon: Flame },
]

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // Defer to next tick to avoid synchronous state update in effect body
    const id = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(id)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Palette className="h-4 w-4" />
      </Button>
    )
  }

  const current = THEMES.find((t) => t.id === theme) || THEMES[0]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" title={`Theme: ${current.label}`}>
          <CurrentIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((t) => {
          const Icon = t.icon
          return (
            <DropdownMenuItem
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="flex items-start gap-2 py-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium flex items-center justify-between">
                  {t.label}
                  {theme === t.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------- Logo ----------
function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt="Labby"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      priority
    />
  )
}

// ---------- Login screen (magic link) ----------
function LoginScreen() {
  const { data: session, status, update } = useSession()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [magicLink, setMagicLink] = useState<string | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [profile, setProfile] = useState({ name: '', role: 'STUDENT' as 'STUDENT' | 'FACULTY' | 'STAFF' | 'ADMIN', department: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const { toast } = useToast()

  // Auto-detect when session arrives but lacks a name → ask user to complete profile
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.email && !session.user.name) {
      setNeedsProfile(true)
    }
  }, [status, session])

  // Poll for magic link in dev mailbox
  useEffect(() => {
    if (!pendingEmail) return
    setPolling(true)
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/auth/dev-mailbox?email=${encodeURIComponent(pendingEmail)}`)
        const data = await res.json()
        if (!cancelled && data.found && data.url) {
          setMagicLink(data.url)
          setPolling(false)
          return
        }
      } catch {}
      if (!cancelled) {
        setTimeout(poll, 1500)
      }
    }
    poll()
    return () => { cancelled = true }
  }, [pendingEmail])

  const sendMagicLink = async () => {
    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Enter your campus email to receive a sign-in link.', variant: 'destructive' })
      return
    }
    setSending(true)
    setMagicLink(null)
    setPendingEmail(email.trim().toLowerCase())
    try {
      const res = await signIn('email', {
        email: email.trim().toLowerCase(),
        redirect: false,
        callbackUrl: '/',
      })
      if (res?.error) {
        toast({ title: 'Sign-in failed', description: res.error, variant: 'destructive' })
        setPendingEmail(null)
      } else {
        toast({
          title: 'Magic link sent',
          description: 'Check the dev mailbox panel below (or your real inbox in production).',
        })
      }
    } catch (e: any) {
      toast({ title: 'Sign-in failed', description: e.message, variant: 'destructive' })
      setPendingEmail(null)
    } finally {
      setSending(false)
    }
  }

  const openLink = async () => {
    if (!magicLink) return
    // Open the magic link in a new tab — NextAuth will verify and set the session cookie
    window.open(magicLink, '_blank')
  }

  const tryDemoAccount = async (demoEmail: string) => {
    setEmail(demoEmail)
    setPendingEmail(demoEmail.toLowerCase())
    setSending(true)
    try {
      await signIn('email', { email: demoEmail, redirect: false, callbackUrl: '/' })
      toast({ title: 'Magic link sent', description: `Check the dev mailbox for ${demoEmail}` })
    } finally {
      setSending(false)
    }
  }

  const saveProfile = async () => {
    if (!profile.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    setSavingProfile(true)
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await update({ role: profile.role, department: profile.department, name: profile.name })
      setNeedsProfile(false)
      toast({ title: 'Profile saved', description: `Welcome, ${profile.name}!` })
    } catch (e: any) {
      toast({ title: 'Failed to save profile', description: e.message, variant: 'destructive' })
    } finally {
      setSavingProfile(false)
    }
  }

  // If authenticated but profile incomplete, show profile-completion form
  if (needsProfile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 amoled:from-black amoled:via-black amoled:to-emerald-950 ambient:from-amber-950/40 ambient:via-stone-900 ambient:to-amber-900/40 p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <Logo size={64} className="mx-auto" />
            <h1 className="text-2xl font-bold tracking-tight">Complete your profile</h1>
            <p className="text-muted-foreground text-sm">Welcome to Labby! Tell us a bit about yourself.</p>
          </div>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Full name</Label>
                <Input id="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-role">Role</Label>
                <Select value={profile.role} onValueChange={(v) => setProfile({ ...profile, role: v as any })}>
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
                <Label htmlFor="profile-dept">Department (optional)</Label>
                <Input id="profile-dept" value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })} placeholder="Computer Science" />
              </div>
              <Button className="w-full" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save & continue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 amoled:from-black amoled:via-black amoled:to-emerald-950 ambient:from-amber-950/40 ambient:via-stone-900 ambient:to-amber-900/40 p-4">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Logo size={72} className="mx-auto" />
          <h1 className="text-3xl font-bold tracking-tight">Labby</h1>
          <p className="text-muted-foreground text-sm">Your AI agent for campus computer lab bookings</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Sign in with magic link</CardTitle>
            <CardDescription>Enter your email — we'll send a one-click sign-in link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMagicLink()}
                  placeholder="you@campus.edu"
                  disabled={sending}
                  className="flex-1"
                />
                <Button onClick={sendMagicLink} disabled={sending || !email.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Send link
                </Button>
              </div>
            </div>

            {/* Dev mailbox panel — shown after sending */}
            {pendingEmail && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {magicLink ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
                  {magicLink ? 'Magic link ready' : 'Waiting for magic link...'}
                </div>
                <p className="text-xs text-muted-foreground">
                  To: <code className="font-mono">{pendingEmail}</code>
                </p>
                {magicLink ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Click below to sign in (sandbox mode — no real email sent):</p>
                    <Button onClick={openLink} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
                      <LogIn className="w-3.5 h-3.5 mr-2" /> Sign in now
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Polling dev mailbox...</p>
                )}
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or try a demo account</span></div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { email: 'alice@campus.edu', label: 'Alice', role: 'Student' },
                { email: 'bob@campus.edu', label: 'Bob', role: 'Faculty' },
                { email: 'carol@campus.edu', label: 'Carol', role: 'Staff' },
                { email: 'admin@campus.edu', label: 'Admin', role: 'Admin' },
              ].map((u) => (
                <Button
                  key={u.email}
                  variant="outline"
                  size="sm"
                  disabled={sending}
                  onClick={() => tryDemoAccount(u.email)}
                  className="flex flex-col items-start h-auto py-2"
                >
                  <span className="text-xs font-medium">{u.label}</span>
                  <span className="text-[10px] text-muted-foreground">{u.role}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Sandbox mode: magic links appear in the panel above instead of being emailed.
        </p>
      </div>
    </div>
  )
}

// ---------- Chat Panel ----------
function ChatPanel({ user }: { user: { id: string; name: string; role: string; email: string; department?: string | null } }) {
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
        body: JSON.stringify({ message: trimmed, history }),
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
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                  <Logo size={32} className="!rounded-none opacity-90" />
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
              <Button key={p} variant="outline" size="sm" className="text-xs h-8" disabled={loading} onClick={() => send(p)}>
                {p}
              </Button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2">
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
      {isUser ? (
        <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 text-xs font-semibold">
          {initials}
        </div>
      ) : (
        <Logo size={32} className="shrink-0" />
      )}
      <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${isUser ? 'bg-slate-700 text-white rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
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
function CalendarPanel() {
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
      .catch((e) => toast({ title: 'Failed to load labs', description: e.message, variant: 'destructive' }))
  }, [toast])

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

  useEffect(() => { loadSchedule() }, [loadSchedule])

  const selectedLabObj = labs.find((l) => l.id === selectedLab)

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Lab availability</CardTitle>
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
                    <SelectItem key={l.id} value={l.id}>{l.name} {l.status !== 'OPEN' ? `(${l.status.toLowerCase()})` : ''}</SelectItem>
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
              <h4 className="text-sm font-medium">Schedule for {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMM d, yyyy')}</h4>
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
                    s.booked ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 amoled:border-red-900/40 amoled:bg-red-950/20 ambient:border-red-900/40 ambient:bg-red-950/20' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 amoled:border-emerald-900/40 amoled:bg-emerald-950/20 ambient:border-emerald-900/40 ambient:bg-emerald-950/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono">{s.start} – {s.end}</span>
                  </div>
                  {s.booked ? (
                    <Badge variant="destructive" className="text-xs">Booked{s.bookerName ? ` · ${s.bookerName}` : ''}{s.purpose ? ` · ${s.purpose}` : ''}</Badge>
                  ) : (
                    <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-700">Free</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 amoled:bg-emerald-950/20 ambient:bg-amber-900/20 border border-emerald-200 dark:border-emerald-900/50 p-3 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 inline mr-1 text-emerald-600" />
            Tip: Switch to the Chat tab and just say "book {selectedLabObj?.name.split('—')[0].trim() || 'Lab A'} {selectedDate} 14:00-16:00" — Labby will handle it.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- My Bookings Panel ----------
function MyBookingsPanel({ user }: { user: { id: string; name: string; role: string } }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings?scope=mine`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBookings(data.bookings || [])
    } catch (e: any) {
      toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const cancel = async (id: string) => {
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
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
          <CardTitle className="flex items-center gap-2"><LayoutDashboard className="w-5 h-5 text-primary" /> My bookings</CardTitle>
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
                    {upcoming.map((b) => <BookingCard key={b.id} booking={b} onCancel={() => cancel(b.id)} />)}
                  </div>
                )}
              </div>
              {past.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Past ({past.length})</h3>
                  <div className="space-y-2 opacity-70">
                    {past.map((b) => <BookingCard key={b.id} booking={b} onCancel={() => cancel(b.id)} />)}
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
        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={onCancel}>
          <XCircle className="w-4 h-4 mr-1" /> Cancel
        </Button>
      )}
    </div>
  )
}

// ---------- Admin Panel ----------
function AdminPanel({ user }: { user: { id: string; role: string } }) {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [allBookings, setAllBookings] = useState<Booking[]>([])
  const [allBookingsDate, setAllBookingsDate] = useState(new Date().toISOString().slice(0, 10))
  const { toast } = useToast()

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/stats`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStats(data)
    } catch (e: any) {
      toast({ title: 'Failed to load admin stats', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadAllBookings = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings?scope=all&date=${allBookingsDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAllBookings(data.bookings || [])
    } catch (e: any) {
      toast({ title: 'Failed to load bookings', description: e.message, variant: 'destructive' })
    }
  }, [allBookingsDate, toast])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadAllBookings() }, [loadAllBookings])

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total labs" value={stats?.totals?.labs ?? '—'} icon={<Monitor className="w-4 h-4" />} />
        <StatCard label="Total users" value={stats?.totals?.users ?? '—'} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Bookings today" value={stats?.totals?.bookingsToday ?? '—'} icon={<CalendarIcon className="w-4 h-4" />} />
        <StatCard label="Bookings next 7 days" value={stats?.totals?.bookingsNext7Days ?? '—'} icon={<CalendarDays className="w-4 h-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Lab usage (next 7 days)</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> All bookings on date</CardTitle>
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

      {stats?.recentActivity?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-primary" /> Recent activity</CardTitle>
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
          <span className="text-primary">{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

// ---------- Main page ----------
export default function Home() {
  const { data: session, status, update } = useSession()
  const [tab, setTab] = useState('chat')

  // Loading state during initial session fetch
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Logo size={48} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Labby…
        </div>
      </div>
    )
  }

  // Not authenticated → show login
  if (status !== 'authenticated' || !session?.user) {
    return <LoginScreen />
  }

  const user = {
    id: session.user.id,
    name: session.user.name || session.user.email,
    role: session.user.role,
    email: session.user.email,
    department: session.user.department,
  }

  const roleBadge = {
    STUDENT: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 amoled:bg-blue-950/80 amoled:text-blue-300 ambient:bg-blue-900/40 ambient:text-blue-200',
    FACULTY: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 amoled:bg-purple-950/80 amoled:text-purple-300 ambient:bg-purple-900/40 ambient:text-purple-200',
    STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 amoled:bg-amber-950/80 amoled:text-amber-300 ambient:bg-amber-900/40 ambient:text-amber-200',
    ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 amoled:bg-emerald-950/80 amoled:text-emerald-300 ambient:bg-emerald-900/40 ambient:text-emerald-200',
  }[user.role] || ''

  const canSeeAdmin = user.role === 'ADMIN' || user.role === 'STAFF'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <div>
              <h1 className="font-semibold text-sm leading-tight">Labby</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Campus Lab Booking Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeSwitcher />
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
            <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/' })} title="Sign out">
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
              <TabsTrigger value="chat" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary flex items-center gap-1.5">
                <Bot className="w-4 h-4" /> Chat Assistant
              </TabsTrigger>
              <TabsTrigger value="calendar" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="bookings" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary flex items-center gap-1.5">
                <LayoutDashboard className="w-4 h-4" /> My Bookings
              </TabsTrigger>
              {canSeeAdmin && (
                <TabsTrigger value="admin" className="bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary flex items-center gap-1.5">
                  <Shield className="w-4 h-4" /> Admin
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="chat" className="mt-0 h-[calc(100vh-3.5rem-3rem)]">
              <ChatPanel user={user} />
            </TabsContent>
            <TabsContent value="calendar" className="mt-0"><CalendarPanel /></TabsContent>
            <TabsContent value="bookings" className="mt-0"><MyBookingsPanel user={user} /></TabsContent>
            {canSeeAdmin && <TabsContent value="admin" className="mt-0"><AdminPanel user={user} /></TabsContent>}
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
