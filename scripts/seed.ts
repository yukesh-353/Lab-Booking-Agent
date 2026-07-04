// Seed script — populate labs, demo users (with hashed passwords), and a few bookings
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

const today = new Date()
const isoDate = (d: Date) => d.toLocaleDateString('sv-SE')
const addDays = (n: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

async function main() {
  console.log('Seeding database...')

  // Clean slate for idempotency
  await db.booking.deleteMany({})
  await db.user.deleteMany({})
  await db.lab.deleteMany({})

  // Hash a shared demo password once for all demo users
  const demoPasswordHash = await hashPassword('demo1234')

  // Users — now with passwordHash so they can log in via /api/auth/login
  // No student accounts — the software is for faculty, staff, and admins only.
  const bob = await db.user.create({
    data: { name: 'Bob Patel', email: 'bob@campus.edu', role: 'FACULTY', department: 'Computer Science', passwordHash: demoPasswordHash },
  })
  const carol = await db.user.create({
    data: { name: 'Carol Reyes', email: 'carol@campus.edu', role: 'STAFF', department: 'IT Services', passwordHash: demoPasswordHash },
  })
  const admin = await db.user.create({
    data: { name: 'Admin Wang', email: 'admin@campus.edu', role: 'ADMIN', department: 'IT Services', passwordHash: demoPasswordHash },
  })

  // Labs
  const labA = await db.lab.create({
    data: {
      name: 'Lab A — Engineering 101',
      location: 'Engineering Building, Room 101',
      capacity: 30,
      description: 'General-purpose Windows computer lab with dual monitors. Ideal for programming coursework.',
      openTime: '08:00',
      closeTime: '22:00',
      status: 'OPEN',
      software: 'Visual Studio, Python, MATLAB, Git, Office Suite',
    },
  })
  const labB = await db.lab.create({
    data: {
      name: 'Lab B — Science 204',
      location: 'Science Building, Room 204',
      capacity: 24,
      description: 'Linux workstation lab optimized for data science and machine learning projects.',
      openTime: '09:00',
      closeTime: '21:00',
      status: 'OPEN',
      software: 'Ubuntu 22.04, PyTorch, TensorFlow, R Studio, Jupyter',
    },
  })
  const labC = await db.lab.create({
    data: {
      name: 'Lab C — Library Lower Level',
      location: 'Main Library, Lower Level',
      capacity: 40,
      description: 'Quiet study lab with high-performance workstations and 3D printer access.',
      openTime: '07:00',
      closeTime: '23:00',
      status: 'OPEN',
      software: 'Adobe Creative Cloud, Blender, Fusion 360, Cura',
    },
  })
  const labD = await db.lab.create({
    data: {
      name: 'Lab D — Innovation Hub',
      location: 'Innovation Center, Room 110',
      capacity: 18,
      description: 'Collaborative lab with whiteboards, projectors, and breakout screens.',
      openTime: '10:00',
      closeTime: '20:00',
      status: 'MAINTENANCE',
      software: 'MS Teams, Zoom, Miro, Figma',
    },
  })

  // A few existing bookings for context
  await db.booking.createMany({
    data: [
      { userId: bob.id, labId: labA.id, date: addDays(0), startTime: '10:00', endTime: '12:00', purpose: 'CS101 lecture session', status: 'CONFIRMED' },
      { userId: carol.id, labId: labB.id, date: addDays(1), startTime: '14:00', endTime: '16:00', purpose: 'ML workshop', status: 'CONFIRMED' },
      { userId: bob.id, labId: labC.id, date: addDays(2), startTime: '15:00', endTime: '17:00', purpose: '3D printing project work', status: 'CONFIRMED' },
      { userId: bob.id, labId: labA.id, date: addDays(-3), startTime: '09:00', endTime: '11:00', purpose: 'Assignment work', status: 'CANCELLED' },
    ],
  })

  console.log('Seed complete.')
  console.log('Demo users (all use password: demo1234):')
  console.log('  Faculty: bob@campus.edu')
  console.log('  Staff:   carol@campus.edu')
  console.log('  Admin:   admin@campus.edu')
  console.log('Labs created: 4')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
