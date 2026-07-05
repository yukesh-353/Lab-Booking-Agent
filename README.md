# Labby — Campus Lab Booking Agent

> Full-stack Next.js + TypeScript app for managing campus computer lab bookings.

## Quick start

Prerequisites:
- Node.js (v18+ recommended)
- npm

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Environment:
- Copy `.env.example` or edit `.env` and ensure `DATABASE_URL` is set. For local development this project uses SQLite:

```text
DATABASE_URL=file:./dev.db
```

Generate Prisma client and push schema:

```bash
npm run db:generate
npm run db:push
```

Seed demo data (uses `ts-node-esm`):

```bash
npm exec -- ts-node-esm scripts/seed.ts
```

Run development server (Windows-safe):

```bash
node ./node_modules/next/dist/bin/next dev -p 3000
# or, if you prefer the npm script on Unix-like systems:
# npm run dev
```

Open: http://localhost:3000

## Demo accounts

- `alice@campus.edu` (Student)
- `bob@campus.edu` (Faculty)
- `carol@campus.edu` (Staff)
- `admin@campus.edu` (Admin)

## Notes
- The original `dev` script uses `tee` which is Unix-only; the direct `node` command above works on Windows.
- A local SQLite DB file is created at `dev.db` when running `npm run db:push`.
- Consider adding the database file to `.gitignore` to avoid committing binary DB files.

## Remote
The repository has been pushed to: https://github.com/yukesh-353/Lab-Booking-Agent.git

---
Created automatically by an assistant to document local setup and demo accounts.
