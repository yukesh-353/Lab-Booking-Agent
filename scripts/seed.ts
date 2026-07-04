// Seed script — populate labs, demo users, and a few bookings
import { db } from '../src/lib/db'

const today = new Date()
const isoDate = (d: Date) => d.toISOString().slice(0, 10)
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

  // Users — emailVerified set so they appear pre-verified
  const now = new Date()
  const alice = await db.user.upsert({
    where: { email: 'alice@campus.edu' },
    update: { name: 'Alice Chen', role: 'STUDENT', department: 'Computer Science' },
    create: { name: 'Alice Chen', email: 'alice@campus.edu', role: 'STUDENT', department: 'Computer Science', emailVerified: now },
  })
  const bob = await db.user.upsert({
    where: { email: 'bob@campus.edu' },
    update: { name: 'Bob Patel', role: 'FACULTY', department: 'Computer Science' },
    create: { name: 'Bob Patel', email: 'bob@campus.edu', role: 'FACULTY', department: 'Computer Science', emailVerified: now },
  })
  const carol = await db.user.upsert({
    where: { email: 'carol@campus.edu' },
    update: { name: 'Carol Reyes', role: 'STAFF', department: 'IT Services' },
    create: { name: 'Carol Reyes', email: 'carol@campus.edu', role: 'STAFF', department: 'IT Services', emailVerified: now },
  })
  const admin = await db.user.upsert({
    where: { email: 'admin@campus.edu' },
    update: { name: 'Admin Wang', role: 'ADMIN', department: 'IT Services' },
    create: { name: 'Admin Wang', email: 'admin@campus.edu', role: 'ADMIN', department: 'IT Services', emailVerified: now },
  })

  // Labs
  const labA = await db.lab.upsert({
    where: { name: 'Lab A — Engineering 101' },
    update: {},
    create: {
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
  const labB = await db.lab.upsert({
    where: { name: 'Lab B — Science 204' },
    update: {},
    create: {
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
  const labC = await db.lab.upsert({
    where: { name: 'Lab C — Library Lower Level' },
    update: {},
    create: {
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
  const labD = await db.lab.upsert({
    where: { name: 'Lab D — Innovation Hub' },
    update: {},
    create: {
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
      {
        userId: bob.id,
        labId: labA.id,
        date: addDays(0),
        startTime: '10:00',
        endTime: '12:00',
        purpose: 'CS101 lecture session',
        status: 'CONFIRMED',
      },
      {
        userId: carol.id,
        labId: labB.id,
        date: addDays(1),
        startTime: '14:00',
        endTime: '16:00',
        purpose: 'ML workshop',
        status: 'CONFIRMED',
      },
      {
        userId: alice.id,
        labId: labC.id,
        date: addDays(2),
        startTime: '15:00',
        endTime: '17:00',
        purpose: '3D printing project work',
        status: 'CONFIRMED',
      },
      {
        userId: alice.id,
        labId: labA.id,
        date: addDays(-3),
        startTime: '09:00',
        endTime: '11:00',
        purpose: 'Assignment work',
        status: 'CANCELLED',
      },
    ],
  })

  console.log('Seed complete.')
  console.log('Demo users:')
  console.log('  Student: alice@campus.edu')
  console.log('  Faculty: bob@campus.edu')
  console.log('  Staff:   carol@campus.edu')
  console.log('  Admin:   admin@campus.edu')
  console.log('Labs created: 4')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
