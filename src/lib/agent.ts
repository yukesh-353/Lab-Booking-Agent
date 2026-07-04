// AI Booking Agent
import ZAI from 'z-ai-web-dev-sdk'
import { db } from './db'
import { validateBooking, todayISO, addDays, formatDate, getLabSchedule, canApproveBookings, MAX_PURPOSE_LENGTH } from './booking'

export type ChatRole = 'user' | 'assistant' | 'system'
export interface ChatMessage {
  role: ChatRole
  content: string
}

interface AgentAction {
  action: string
  text?: string
  lab?: string
  date?: string
  start?: string
  end?: string
  purpose?: string
  bookingId?: string
}

interface AgentContext {
  user: { id: string; name: string; role: string; email: string; department?: string | null }
  history: ChatMessage[]
}

async function buildSystemPrompt(ctx: AgentContext): Promise<string> {
  const labs = await db.lab.findMany({ orderBy: { name: 'asc' } })
  const now = new Date()
  const todayStr = todayISO()
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

  const labList = labs.map((l) => `- "${l.name}" | location: ${l.location} | capacity: ${l.capacity} | hours: ${l.openTime}–${l.closeTime} | status: ${l.status} | software: ${l.software || 'n/a'} | id: ${l.id}`).join('\n')

  return `You are Labby, the campus computer lab booking assistant for a mixed-campus university (students, faculty, staff).

CURRENT CONTEXT
- Today's date: ${todayStr} (${weekday})
- Current time: ${currentTime} (local)
- Logged-in user: ${ctx.user.name} (${ctx.user.role}${ctx.user.department ? ', ' + ctx.user.department : ''})

AVAILABLE LABS
${labList}

WHAT YOU CAN DO
1. List available labs and their info.
2. Check free/busy time slots for a specific lab on a specific date.
3. Create a booking for the current user.
4. List the current user's upcoming bookings.
5. Cancel one of the user's bookings by ID.
6. List all bookings across all labs for a date (only STAFF/ADMIN).

OUTPUT FORMAT — STRICT
Respond with a single JSON object. No markdown outside the JSON.

Actions:
- {"action":"answer","text":"<reply>"}
- {"action":"list_labs"}
- {"action":"check_availability","lab":"<lab name or id>","date":"YYYY-MM-DD"}
- {"action":"book","lab":"<lab name or id>","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","purpose":"<optional>"}
- {"action":"list_my_bookings"}
- {"action":"cancel","bookingId":"<id>"}
- {"action":"list_all_bookings","date":"YYYY-MM-DD"}

RULES
- Convert natural-language dates to ISO YYYY-MM-DD. "today" = ${todayStr}, "tomorrow" = ${addDays(todayStr, 1)}.
- Convert times to 24h HH:mm. "2-4pm" → "14:00"-"16:00".
- If purpose not specified, use "General use".
- If info missing, ask for it via "answer".
- Only STAFF and ADMIN can use "list_all_bookings".
- Never invent booking IDs.
- Keep answers concise and friendly.

Examples:
User: "Hi" → {"action":"answer","text":"Hi ${ctx.user.name.split(' ')[0]}! I can help you book a computer lab, check availability, view your bookings, or cancel one. What would you like to do?"}
User: "What labs are available?" → {"action":"list_labs"}
User: "Book Lab B tomorrow 2-4pm for ML project" → {"action":"book","lab":"Lab B","date":"${addDays(todayStr, 1)}","start":"14:00","end":"16:00","purpose":"ML project"}
User: "Show my bookings" → {"action":"list_my_bookings"}`
}

function extractAction(raw: string): AgentAction | null {
  try { return JSON.parse(raw.trim()) as AgentAction } catch {}
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) as AgentAction } catch {} }
  return null
}

async function resolveLab(nameOrId?: string) {
  if (!nameOrId) return null
  const trimmed = nameOrId.trim()
  const byId = await db.lab.findUnique({ where: { id: trimmed } })
  if (byId) return byId
  const byName = await db.lab.findUnique({ where: { name: trimmed } })
  if (byName) return byName
  const all = await db.lab.findMany()
  const lower = trimmed.toLowerCase()
  return all.find((l) => l.name.toLowerCase().includes(lower) || lower.includes(l.name.toLowerCase().split('—')[0].trim().toLowerCase())) || null
}

async function executeAction(action: AgentAction, ctx: AgentContext): Promise<string> {
  const user = ctx.user
  switch (action.action) {
    case 'answer':
      return action.text || 'How can I help you with lab bookings?'

    case 'list_labs': {
      const labs = await db.lab.findMany({ orderBy: { name: 'asc' } })
      const lines = labs.map((l) => {
        const status = l.status === 'OPEN' ? '✓ open' : l.status === 'MAINTENANCE' ? '⚠ maintenance' : '✗ closed'
        return `• **${l.name}** — ${l.location}\n  Capacity ${l.capacity} · Hours ${l.openTime}–${l.closeTime} · ${status}\n  Software: ${l.software || 'n/a'}`
      })
      return `Here are the ${labs.length} computer labs on campus:\n\n${lines.join('\n\n')}\n\nAsk me to check availability or book a lab.`
    }

    case 'check_availability': {
      const lab = await resolveLab(action.lab)
      if (!lab) return `I couldn't find a lab matching "${action.lab}".`
      const date = action.date || todayISO()
      const { slots } = await getLabSchedule(lab.id, date)
      const free = slots.filter((s) => !s.booked)
      const busy = slots.filter((s) => s.booked)
      let msg = `**${lab.name}** on ${formatDate(date)}\nHours: ${lab.openTime}–${lab.closeTime} · Capacity: ${lab.capacity}\n\n`
      if (busy.length === 0) { msg += `✓ Fully available all day.` }
      else {
        msg += `**Busy slots:**\n`
        for (const b of busy) msg += `• ${b.start}–${b.end} — ${b.bookerName}${b.purpose ? ` (${b.purpose})` : ''}\n`
        msg += `\n**Free slots:**\n`
        if (free.length === 0) msg += `• None — fully booked.\n`
        else for (const f of free) msg += `• ${f.start}–${f.end}\n`
      }
      return msg
    }

    case 'book': {
      const lab = await resolveLab(action.lab)
      if (!lab) return `I couldn't find a lab matching "${action.lab}".`
      const date = action.date || todayISO()
      if (!action.start || !action.end) return `I need both start and end times.`
      const validation = await validateBooking({ labId: lab.id, date, startTime: action.start, endTime: action.end, userId: user.id })
      if (!validation.ok) return `I couldn't create that booking: ${validation.error}`
      const cleanPurpose = (action.purpose || 'General use').slice(0, MAX_PURPOSE_LENGTH)
      const booking = await db.booking.create({ data: { userId: user.id, labId: lab.id, date, startTime: action.start, endTime: action.end, purpose: cleanPurpose, status: 'CONFIRMED' } })
      return `✓ **Booking confirmed**\n\n• Lab: ${lab.name}\n• Date: ${formatDate(date)}\n• Time: ${action.start}–${action.end}\n• Purpose: ${cleanPurpose}\n• Booking ID: \`${booking.id}\``
    }

    case 'list_my_bookings': {
      const bookings = await db.booking.findMany({ where: { userId: user.id, status: { in: ['CONFIRMED', 'PENDING'] } }, include: { lab: true }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] })
      if (bookings.length === 0) return `You have no upcoming bookings, ${user.name.split(' ')[0]}.`
      const lines = bookings.map((b) => `• ID \`${b.id}\` — ${b.lab.name}\n  ${formatDate(b.date)} · ${b.startTime}–${b.endTime} · ${b.purpose || 'General use'} · status: ${b.status.toLowerCase()}`)
      return `Here are your ${bookings.length} upcoming booking(s):\n\n${lines.join('\n\n')}\n\nTo cancel, tell me the ID.`
    }

    case 'cancel': {
      if (!action.bookingId) return `Please give me the booking ID you want to cancel.`
      const booking = await db.booking.findUnique({ where: { id: action.bookingId }, include: { lab: true } })
      if (!booking) return `I couldn't find a booking with ID \`${action.bookingId}\`.`
      if (booking.userId !== user.id && !canApproveBookings(user.role)) return `That booking belongs to another user.`
      if (booking.status === 'CANCELLED') return `That booking was already cancelled.`
      await db.booking.update({ where: { id: action.bookingId }, data: { status: 'CANCELLED' } })
      return `✓ Cancelled your booking:\n• ${booking.lab.name}\n• ${formatDate(booking.date)} · ${booking.startTime}–${booking.endTime}`
    }

    case 'list_all_bookings': {
      if (!canApproveBookings(user.role)) return `Sorry, only staff and admins can view all bookings campus-wide.`
      const date = action.date || todayISO()
      const bookings = await db.booking.findMany({ where: { date, status: { in: ['CONFIRMED', 'PENDING'] } }, include: { lab: true, user: true }, orderBy: [{ lab: { name: 'asc' } }, { startTime: 'asc' }] })
      if (bookings.length === 0) return `No bookings on ${formatDate(date)} across campus.`
      const lines = bookings.map((b) => `• ${b.lab.name} — ${b.startTime}–${b.endTime}\n  Booked by ${b.user.name} (${b.user.role.toLowerCase()}) · ID \`${b.id}\`${b.purpose ? ` · ${b.purpose}` : ''}`)
      return `**All bookings on ${formatDate(date)}** (${bookings.length} total):\n\n${lines.join('\n\n')}`
    }

    default:
      return `I can: list labs, check availability, book a lab, show your bookings, or cancel a booking. What would you like to do?`
  }
}

export async function runAgent(userMessage: string, ctx: AgentContext): Promise<string> {
  let zai
  try { zai = await ZAI.create() } catch (err: any) {
    console.error('[agent] ZAI init failed:', err?.message)
    return ruleBasedFallback(userMessage, ctx)
  }
  const systemPrompt = await buildSystemPrompt(ctx)
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...ctx.history.slice(-6), { role: 'user', content: userMessage }]
  let completion
  try {
    completion = await zai.chat.completions.create({ messages, thinking: { type: 'disabled' }, temperature: 0.3 })
  } catch (err: any) {
    console.error('[agent] chat completion failed:', err?.message)
    return ruleBasedFallback(userMessage, ctx)
  }
  const raw = completion?.choices?.[0]?.message?.content || ''
  const action = extractAction(raw)
  if (!action) return raw.trim() || 'Sorry, I had trouble processing that. Could you rephrase?'
  try { return await executeAction(action, ctx) } catch (err: any) {
    console.error('[agent] action execution failed:', err?.message)
    return `Something went wrong. Please try again.`
  }
}

async function ruleBasedFallback(userMessage: string, ctx: AgentContext): Promise<string> {
  const msg = userMessage.toLowerCase()
  const labs = await db.lab.findMany({ orderBy: { name: 'asc' } })
  if (/(hi|hello|hey)\b/.test(msg)) return `Hi ${ctx.user.name.split(' ')[0]}! I can help you book a computer lab, check availability, view your bookings, or cancel one. (Running in offline mode.)`
  if (msg.includes('list') && msg.includes('lab')) return `Here are the ${labs.length} computer labs:\n\n${labs.map((l) => `• ${l.name} — ${l.location}, capacity ${l.capacity}, ${l.openTime}–${l.closeTime}, status: ${l.status.toLowerCase()}`).join('\n')}`
  if (msg.includes('my booking')) {
    try {
      const bookings = await db.booking.findMany({ where: { userId: ctx.user.id, status: { in: ['CONFIRMED', 'PENDING'] } }, include: { lab: true }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] })
      if (bookings.length === 0) return `You have no upcoming bookings, ${ctx.user.name.split(' ')[0]}.`
      const lines = bookings.map((b) => `• ID \`${b.id}\` — ${b.lab.name}\n  ${formatDate(b.date)} · ${b.startTime}–${b.endTime} · ${b.purpose || 'General use'}`)
      return `Here are your ${bookings.length} upcoming booking(s):\n\n${lines.join('\n\n')}`
    } catch { return `I couldn't retrieve your bookings right now.` }
  }
  return `I'm currently in offline mode. Try saying "list labs" or "show my bookings".`
}
