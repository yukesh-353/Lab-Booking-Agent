// AI Booking Agent
// Receives user message + context, calls ZAI chat completions, parses an action envelope,
// executes the action against the database, and returns a final natural-language reply.
import ZAI from 'z-ai-web-dev-sdk'
import { db } from './db'
import {
  validateBooking,
  todayISO,
  addDays,
  formatDate,
  getLabSchedule,
  canApproveBookings,
} from './booking'

export type ChatRole = 'user' | 'assistant' | 'system'
export interface ChatMessage {
  role: ChatRole
  content: string
}

// Action envelope returned by the LLM (single JSON object on its own line)
// Examples:
//   {"action":"answer","text":"Lab A is open from 08:00 to 22:00."}
//   {"action":"list_labs"}
//   {"action":"check_availability","lab":"Lab A","date":"2026-07-05"}
//   {"action":"book","lab":"Lab A","date":"2026-07-05","start":"14:00","end":"16:00","purpose":"ML project"}
//   {"action":"list_my_bookings"}
//   {"action":"cancel","bookingId":"abc123"}
//   {"action":"list_all_bookings","date":"2026-07-05"}

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

// Build the system prompt with current date, available labs, and instructions
async function buildSystemPrompt(ctx: AgentContext): Promise<string> {
  const labs = await db.lab.findMany({ orderBy: { name: 'asc' } })
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })

  const labList = labs
    .map((l) => {
      return `- "${l.name}" | location: ${l.location} | capacity: ${l.capacity} | hours: ${l.openTime}–${l.closeTime} | status: ${l.status} | software: ${l.software || 'n/a'} | id: ${l.id}`
    })
    .join('\n')

  return `You are Labby, the campus computer lab booking assistant for a mixed-campus university (students, faculty, staff).

CURRENT CONTEXT
- Today's date: ${todayStr} (${weekday})
- Current time: ${now.toTimeString().slice(0, 5)}
- Logged-in user: ${ctx.user.name} (${ctx.user.role}${ctx.user.department ? ', ' + ctx.user.department : ''})

AVAILABLE LABS
${labList}

WHAT YOU CAN DO
You help users with these tasks:
1. List available labs and their info (hours, capacity, software, status).
2. Check free/busy time slots for a specific lab on a specific date.
3. Create a booking for the current user (you receive a request like "book Lab A tomorrow 2-4pm").
4. List the current user's upcoming bookings.
5. Cancel one of the user's bookings by ID (always confirm the ID first by listing their bookings).
6. List all bookings across all labs for a date (only STAFF/ADMIN).

OUTPUT FORMAT — STRICT
You MUST respond with a single JSON object on its own line. No markdown, no commentary outside the JSON.
The JSON has one required field "action" plus optional fields depending on the action.

Actions and their fields:
- {"action":"answer","text":"<your reply to the user>"}  — use this for any conversational reply, info, or follow-up question. The text field is what the user sees.
- {"action":"list_labs"}  — fetch the current lab list with availability summary.
- {"action":"check_availability","lab":"<lab name or id>","date":"YYYY-MM-DD"}  — fetch free/busy slots.
- {"action":"book","lab":"<lab name or id>","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","purpose":"<optional purpose>"}  — create a booking for the current user.
- {"action":"list_my_bookings"}  — fetch the user's upcoming bookings.
- {"action":"cancel","bookingId":"<id>"}  — cancel a booking owned by the current user.
- {"action":"list_all_bookings","date":"YYYY-MM-DD"}  — fetch all bookings on a date (requires STAFF/ADMIN).

RULES
- Always convert natural-language dates to ISO YYYY-MM-DD using today's date as reference. "today" = ${todayStr}, "tomorrow" = ${addDays(todayStr, 1)}, etc.
- Always convert times to 24h HH:mm. "2-4pm" → start "14:00", end "16:00". "10am" → "10:00".
- For "book" actions, if the user did not specify purpose, set purpose to "General use".
- If essential info is missing (lab, date, or time), respond with an "answer" action asking for the missing info.
- If the user asks to cancel but did not specify which booking, first respond with list_my_bookings action.
- Only STAFF and ADMIN can use "list_all_bookings". If a non-admin asks, respond with an "answer" explaining the restriction.
- For free-form chat (greetings, jokes, questions about lab policies), use "answer".
- Never invent booking IDs. Only use IDs you would obtain from a list_my_bookings action.
- Keep answers concise and friendly. Address the user by their first name when natural.

Examples:
User: "Hi" → {"action":"answer","text":"Hi ${ctx.user.name.split(' ')[0]}! I can help you book a computer lab, check availability, view your bookings, or cancel one. What would you like to do?"}
User: "What labs are available?" → {"action":"list_labs"}
User: "Is Lab A free tomorrow afternoon?" → {"action":"check_availability","lab":"Lab A","date":"${addDays(todayStr, 1)}"}
User: "Book Lab B tomorrow 2-4pm for ML project" → {"action":"book","lab":"Lab B","date":"${addDays(todayStr, 1)}","start":"14:00","end":"16:00","purpose":"ML project"}
User: "Show my bookings" → {"action":"list_my_bookings"}
User: "Cancel my booking" → {"action":"list_my_bookings"}`
}

// Extract the first JSON object from the LLM response
function extractAction(raw: string): AgentAction | null {
  // Try direct parse first
  try {
    return JSON.parse(raw.trim()) as AgentAction
  } catch {
    // fall through
  }
  // Try to find a JSON object in the text
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as AgentAction
    } catch {
      return null
    }
  }
  return null
}

// Resolve a lab name (or id) to a lab record
async function resolveLab(nameOrId?: string) {
  if (!nameOrId) return null
  const trimmed = nameOrId.trim()
  // By ID
  const byId = await db.lab.findUnique({ where: { id: trimmed } })
  if (byId) return byId
  // By exact name
  const byName = await db.lab.findUnique({ where: { name: trimmed } })
  if (byName) return byName
  // By case-insensitive partial match
  const all = await db.lab.findMany()
  const lower = trimmed.toLowerCase()
  const fuzzy = all.find(
    (l) =>
      l.name.toLowerCase().includes(lower) ||
      lower.includes(l.name.toLowerCase().split('—')[0].trim().toLowerCase()),
  )
  return fuzzy || null
}

// Execute the action against the database
async function executeAction(action: AgentAction, ctx: AgentContext): Promise<string> {
  const user = ctx.user
  switch (action.action) {
    case 'answer': {
      return action.text || 'How can I help you with lab bookings?'
    }

    case 'list_labs': {
      const labs = await db.lab.findMany({ orderBy: { name: 'asc' } })
      const lines = labs.map((l) => {
        const status = l.status === 'OPEN' ? '✓ open' : l.status === 'MAINTENANCE' ? '⚠ maintenance' : '✗ closed'
        return `• **${l.name}** — ${l.location}\n  Capacity ${l.capacity} · Hours ${l.openTime}–${l.closeTime} · ${status}\n  Software: ${l.software || 'n/a'}`
      })
      return `Here are the ${labs.length} computer labs on campus:\n\n${lines.join('\n\n')}\n\nAsk me to check availability for any of them, or just say "book Lab A tomorrow 2-4pm" to make a reservation.`
    }

    case 'check_availability': {
      const lab = await resolveLab(action.lab)
      if (!lab) {
        return `I couldn't find a lab matching "${action.lab}". Available labs are: ${(await db.lab.findMany()).map((l) => l.name).join(', ')}.`
      }
      const date = action.date || todayISO()
      const { slots } = await getLabSchedule(lab.id, date)
      const free = slots.filter((s) => !s.booked)
      const busy = slots.filter((s) => s.booked)
      let msg = `**${lab.name}** on ${formatDate(date)}\n`
      msg += `Hours: ${lab.openTime}–${lab.closeTime} · Capacity: ${lab.capacity}\n\n`
      if (busy.length === 0) {
        msg += `✓ Fully available all day. Book any time slot you like.`
      } else {
        msg += `**Busy slots:**\n`
        for (const b of busy) {
          msg += `• ${b.start}–${b.end} — ${b.bookerName}${b.purpose ? ` (${b.purpose})` : ''}\n`
        }
        msg += `\n**Free slots:**\n`
        if (free.length === 0) {
          msg += `• None — fully booked.\n`
        } else {
          for (const f of free) {
            msg += `• ${f.start}–${f.end}\n`
          }
        }
      }
      msg += `\nTo book, just tell me a time range, e.g. "book ${lab.name.split('—')[0].trim()} ${date} 14:00-16:00".`
      return msg
    }

    case 'book': {
      const lab = await resolveLab(action.lab)
      if (!lab) {
        return `I couldn't find a lab matching "${action.lab}". Available labs are: ${(await db.lab.findMany()).map((l) => l.name).join(', ')}.`
      }
      const date = action.date || todayISO()
      const start = action.start
      const end = action.end
      if (!start || !end) {
        return `I need both a start and end time to book ${lab.name} on ${formatDate(date)}. For example: "book ${lab.name} ${date} 14:00-16:00".`
      }
      const validation = await validateBooking({
        labId: lab.id,
        date,
        startTime: start,
        endTime: end,
        userId: user.id,
      })
      if (!validation.ok) {
        return `I couldn't create that booking: ${validation.error}\n\nWould you like me to check ${lab.name}'s availability on ${formatDate(date)} instead?`
      }
      const booking = await db.booking.create({
        data: {
          userId: user.id,
          labId: lab.id,
          date,
          startTime: start,
          endTime: end,
          purpose: action.purpose || 'General use',
          status: 'CONFIRMED',
        },
      })
      return `✓ **Booking confirmed**\n\n• Lab: ${lab.name}\n• Date: ${formatDate(date)}\n• Time: ${start}–${end}\n• Purpose: ${action.purpose || 'General use'}\n• Booking ID: \`${booking.id}\`\n\nYou can cancel it anytime by asking me to cancel your bookings.`
    }

    case 'list_my_bookings': {
      const bookings = await db.booking.findMany({
        where: { userId: user.id, status: { in: ['CONFIRMED', 'PENDING'] } },
        include: { lab: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      })
      if (bookings.length === 0) {
        return `You have no upcoming bookings, ${user.name.split(' ')[0]}. Would you like to make one?`
      }
      const lines = bookings.map((b) => {
        return `• ID \`${b.id}\` — ${b.lab.name}\n  ${formatDate(b.date)} · ${b.startTime}–${b.endTime} · ${b.purpose || 'General use'} · status: ${b.status.toLowerCase()}`
      })
      return `Here are your ${bookings.length} upcoming booking(s):\n\n${lines.join('\n\n')}\n\nTo cancel one, tell me the ID (e.g. "cancel ${bookings[0].id}").`
    }

    case 'cancel': {
      const bookingId = action.bookingId
      if (!bookingId) {
        return `Please give me the booking ID you want to cancel. You can list your bookings by saying "show my bookings".`
      }
      const booking = await db.booking.findUnique({
        where: { id: bookingId },
        include: { lab: true },
      })
      if (!booking) {
        return `I couldn't find a booking with ID \`${bookingId}\`. Run "show my bookings" to see your current IDs.`
      }
      if (booking.userId !== user.id && !canApproveBookings(user.role)) {
        return `That booking belongs to another user; I can only cancel bookings you own.`
      }
      if (booking.status === 'CANCELLED') {
        return `That booking was already cancelled.`
      }
      await db.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      })
      return `✓ Cancelled your booking:\n• ${booking.lab.name}\n• ${formatDate(booking.date)} · ${booking.startTime}–${booking.endTime}\n\nThe slot is now free for others.`
    }

    case 'list_all_bookings': {
      if (!canApproveBookings(user.role)) {
        return `Sorry, only staff and admins can view all bookings campus-wide. Students and faculty can see their own bookings via "show my bookings".`
      }
      const date = action.date || todayISO()
      const bookings = await db.booking.findMany({
        where: { date, status: { in: ['CONFIRMED', 'PENDING'] } },
        include: { lab: true, user: true },
        orderBy: [{ lab: { name: 'asc' } }, { startTime: 'asc' }],
      })
      if (bookings.length === 0) {
        return `No bookings on ${formatDate(date)} across campus.`
      }
      const lines = bookings.map((b) => {
        return `• ${b.lab.name} — ${b.startTime}–${b.endTime}\n  Booked by ${b.user.name} (${b.user.role.toLowerCase()}) · ID \`${b.id}\`${b.purpose ? ` · ${b.purpose}` : ''}`
      })
      return `**All bookings on ${formatDate(date)}** (${bookings.length} total):\n\n${lines.join('\n\n')}`
    }

    default:
      return `I'm not sure how to handle that. I can: list labs, check availability, book a lab, show your bookings, or cancel a booking. What would you like to do?`
  }
}

// Main entry point
export async function runAgent(userMessage: string, ctx: AgentContext): Promise<string> {
  let zai
  try {
    zai = await ZAI.create()
  } catch (err: any) {
    console.error('[agent] ZAI init failed:', err?.message)
    // Fallback to a rule-based response if AI is unavailable
    return ruleBasedFallback(userMessage, ctx)
  }

  const systemPrompt = await buildSystemPrompt(ctx)

  // Build messages: system + recent history + current user message
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...ctx.history.slice(-6),
    { role: 'user', content: userMessage },
  ]

  let completion
  try {
    completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
      temperature: 0.3,
    })
  } catch (err: any) {
    console.error('[agent] chat completion failed:', err?.message)
    return ruleBasedFallback(userMessage, ctx)
  }

  const raw = completion?.choices?.[0]?.message?.content || ''
  const action = extractAction(raw)

  if (!action) {
    // LLM didn't return valid JSON — return the raw text as a fallback answer
    return raw.trim() || 'Sorry, I had trouble processing that. Could you rephrase?'
  }

  try {
    return await executeAction(action, ctx)
  } catch (err: any) {
    console.error('[agent] action execution failed:', err?.message)
    return `Something went wrong while I was trying to ${action.action}. Please try again or rephrase your request.`
  }
}

// Rule-based fallback when AI is unavailable
async function ruleBasedFallback(userMessage: string, ctx: AgentContext): Promise<string> {
  const msg = userMessage.toLowerCase()
  const labs = await db.lab.findMany({ orderBy: { name: 'asc' } })

  if (/(hi|hello|hey)\b/.test(msg)) {
    return `Hi ${ctx.user.name.split(' ')[0]}! I can help you book a computer lab, check availability, view your bookings, or cancel one. (Running in offline mode — AI engine unavailable.)`
  }
  if (msg.includes('list') && msg.includes('lab')) {
    return `Here are the ${labs.length} computer labs:\n\n${labs.map((l) => `• ${l.name} — ${l.location}, capacity ${l.capacity}, ${l.openTime}–${l.closeTime}, status: ${l.status.toLowerCase()}`).join('\n')}`
  }
  if (msg.includes('my booking')) {
    return runAgent('show my bookings', ctx).catch(() => 'Could not retrieve bookings.')
  }
  return `I'm currently in offline mode and can only handle simple requests. Try saying "list labs" or "show my bookings". For full natural-language booking, please retry in a moment.`
}
