// Helpers for time, availability, and validation
import { db } from './db'

export type Role = 'STUDENT' | 'FACULTY' | 'STAFF' | 'ADMIN'
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED'
export type LabStatus = 'OPEN' | 'CLOSED' | 'MAINTENANCE'

// Time helpers (HH:mm 24h format)
export const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const isValidTime = (t: string): boolean => /^\d{2}:\d{2}$/.test(t) && timeToMinutes(t) >= 0 && timeToMinutes(t) < 24 * 60

// Date helpers (YYYY-MM-DD) — use LOCAL date, not UTC
// Sweden locale ('sv-SE') formats as YYYY-MM-DD, which is what we want for the user's local day
export const todayISO = (): string => new Date().toLocaleDateString('sv-SE')

export const isValidDate = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00').getTime())

export const addDays = (dateStr: string, n: number): string => {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE')
}

export const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Generate time slot options for a lab, in 30-minute increments
export const generateTimeOptions = (openTime: string, closeTime: string): string[] => {
  const options: string[] = []
  const open = timeToMinutes(openTime)
  const close = timeToMinutes(closeTime)
  for (let m = open; m <= close; m += 30) {
    options.push(minutesToTime(m))
  }
  return options
}

// Conflict check — does [startA, endA) overlap [startB, endB)?
export const overlaps = (startA: string, endA: string, startB: string, endB: string): boolean => {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA)
}

// Get all bookings for a lab on a date (excluding cancelled/rejected)
export const getLabBookingsForDate = async (labId: string, date: string) => {
  return db.booking.findMany({
    where: {
      labId,
      date,
      status: { in: ['CONFIRMED', 'PENDING'] },
    },
    orderBy: { startTime: 'asc' },
    include: { user: { select: { id: true, name: true, role: true, department: true } } },
  })
}

// Generate free-busy slots for a lab on a date
export const getLabSchedule = async (labId: string, date: string) => {
  const lab = await db.lab.findUnique({ where: { id: labId } })
  if (!lab) throw new Error('Lab not found')

  const bookings = await getLabBookingsForDate(labId, date)
  const openM = timeToMinutes(lab.openTime)
  const closeM = timeToMinutes(lab.closeTime)

  type Slot = { start: string; end: string; booked: boolean; bookingId?: string; bookerName?: string; purpose?: string }
  const slots: Slot[] = []

  // Build busy intervals
  const busy = bookings
    .map((b) => ({
      start: Math.max(timeToMinutes(b.startTime), openM),
      end: Math.min(timeToMinutes(b.endTime), closeM),
      bookingId: b.id,
      bookerName: b.user.name,
      purpose: b.purpose || undefined,
    }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start)

  let cursor = openM
  for (const b of busy) {
    if (b.start > cursor) {
      slots.push({ start: minutesToTime(cursor), end: minutesToTime(b.start), booked: false })
    }
    slots.push({
      start: minutesToTime(b.start),
      end: minutesToTime(b.end),
      booked: true,
      bookingId: b.bookingId,
      bookerName: b.bookerName,
      purpose: b.purpose,
    })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < closeM) {
    slots.push({ start: minutesToTime(cursor), end: minutesToTime(closeM), booked: false })
  }
  return { lab, slots }
}

// Validate a new booking request — returns { ok, error? }
export const validateBooking = async (params: {
  labId: string
  date: string
  startTime: string
  endTime: string
  userId: string
  excludeBookingId?: string
}): Promise<{ ok: boolean; error?: string; lab?: any }> => {
  const { labId, date, startTime, endTime, userId, excludeBookingId } = params

  if (!labId || !date || !startTime || !endTime) {
    return { ok: false, error: 'Missing required fields (labId, date, startTime, endTime).' }
  }
  if (!isValidDate(date)) {
    return { ok: false, error: 'Date must be in YYYY-MM-DD format.' }
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return { ok: false, error: 'Times must be in HH:mm 24h format.' }
  }
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    return { ok: false, error: 'Start time must be earlier than end time.' }
  }

  const lab = await db.lab.findUnique({ where: { id: labId } })
  if (!lab) return { ok: false, error: 'Lab not found.' }
  if (lab.status !== 'OPEN') {
    return { ok: false, error: `Lab is currently ${lab.status.toLowerCase()} and not bookable.` }
  }
  if (timeToMinutes(startTime) < timeToMinutes(lab.openTime) || timeToMinutes(endTime) > timeToMinutes(lab.closeTime)) {
    return { ok: false, error: `Booking must be within lab hours (${lab.openTime}–${lab.closeTime}).` }
  }

  // Date must be today or future
  if (date < todayISO()) {
    return { ok: false, error: 'Cannot book in the past.' }
  }

  // Conflict check — a lab cannot have two overlapping confirmed/pending bookings,
  // regardless of who owns them. Self-overlap is also disallowed (a user cannot
  // double-book the same lab at the same time). excludeBookingId is used when
  // editing an existing booking so it doesn't conflict with itself.
  const existing = await getLabBookingsForDate(labId, date)
  for (const b of existing) {
    if (excludeBookingId && b.id === excludeBookingId) continue
    if (overlaps(startTime, endTime, b.startTime, b.endTime)) {
      const owner = b.userId === userId ? 'your existing booking' : 'an existing booking'
      return { ok: false, error: `Time conflicts with ${owner} (${b.startTime}–${b.endTime}).` }
    }
  }

  return { ok: true, lab }
}

// Role-based permissions
export const canApproveBookings = (role: string) => role === 'ADMIN' || role === 'STAFF'
export const canManageLabs = (role: string) => role === 'ADMIN' || role === 'STAFF'

// Field length limits (defense against abuse)
export const MAX_PURPOSE_LENGTH = 500
export const MAX_LAB_NAME_LENGTH = 100
export const MAX_LAB_LOCATION_LENGTH = 200
export const MAX_LAB_DESCRIPTION_LENGTH = 1000
export const MAX_SOFTWARE_LENGTH = 500

// Validate a lab create/update payload — returns { ok, error? }
export const validateLab = (params: {
  name?: string
  location?: string
  capacity?: number
  openTime?: string
  closeTime?: string
  status?: string
  description?: string | null
  software?: string | null
}): { ok: boolean; error?: string } => {
  const { name, location, capacity, openTime, closeTime, status, description, software } = params

  if (name !== undefined) {
    if (!name.trim()) return { ok: false, error: 'Lab name is required.' }
    if (name.length > MAX_LAB_NAME_LENGTH) return { ok: false, error: `Lab name must be ≤ ${MAX_LAB_NAME_LENGTH} chars.` }
  }
  if (location !== undefined) {
    if (!location.trim()) return { ok: false, error: 'Location is required.' }
    if (location.length > MAX_LAB_LOCATION_LENGTH) return { ok: false, error: `Location must be ≤ ${MAX_LAB_LOCATION_LENGTH} chars.` }
  }
  if (capacity !== undefined) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
      return { ok: false, error: 'Capacity must be a whole number between 1 and 1000.' }
    }
  }
  if (openTime !== undefined && !isValidTime(openTime)) return { ok: false, error: 'Open time must be HH:mm.' }
  if (closeTime !== undefined && !isValidTime(closeTime)) return { ok: false, error: 'Close time must be HH:mm.' }
  if (openTime !== undefined && closeTime !== undefined && timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
    return { ok: false, error: 'Open time must be earlier than close time.' }
  }
  if (status !== undefined && !['OPEN', 'CLOSED', 'MAINTENANCE'].includes(status)) {
    return { ok: false, error: 'Status must be OPEN, CLOSED, or MAINTENANCE.' }
  }
  if (description !== undefined && description !== null && description.length > MAX_LAB_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Description must be ≤ ${MAX_LAB_DESCRIPTION_LENGTH} chars.` }
  }
  if (software !== undefined && software !== null && software.length > MAX_SOFTWARE_LENGTH) {
    return { ok: false, error: `Software list must be ≤ ${MAX_SOFTWARE_LENGTH} chars.` }
  }
  return { ok: true }
}
