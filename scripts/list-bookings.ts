// Check all bookings in the database
import { db } from '../src/lib/db'

async function main() {
  const bookings = await db.booking.findMany({
    include: { lab: true, user: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  console.log(`Total bookings in DB: ${bookings.length}\n`)
  for (const b of bookings) {
    console.log(`[${b.status}] ${b.date} ${b.startTime}-${b.endTime} | ${b.lab.name} | ${b.user.name} (${b.user.role}) | purpose: ${b.purpose} | id: ${b.id}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
