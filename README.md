# Labby — Campus Lab Booking Agent

An AI-powered laboratory booking system that enables students, faculty, staff, and administrators to reserve campus computer laboratories through an intelligent chat assistant or a manual booking interface. Labby streamlines laboratory scheduling with conflict detection, role-based access control, and centralized administration.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-4-38BDF8)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57)
![AI](https://img.shields.io/badge/AI-GLM_Chat-success)

---

# Overview

Labby is a smart laboratory reservation platform built for educational institutions. It simplifies the process of booking computer laboratories while eliminating scheduling conflicts through automated validation.

The platform combines an AI-powered conversational assistant with a traditional booking interface, allowing users to reserve laboratories using natural language or a structured booking form.

Administrators can efficiently manage laboratories, users, and campus-wide reservations from a centralized dashboard.

---

# Features

## AI Booking Assistant

- Natural language laboratory booking
- Check laboratory availability through chat
- View existing reservations
- Cancel bookings
- Intelligent responses powered by GLM AI

---

## Manual Laboratory Booking

- Calendar-based date selection
- Start and end time selection
- 30-minute booking intervals
- Purpose of booking
- Instant validation

---

## Conflict Detection

- Prevents double booking
- Validates overlapping reservations
- Time slot verification
- Booking status management

---

## Laboratory Management

- Add laboratories
- Edit laboratory information
- Delete laboratories
- Configure operating hours
- Manage laboratory capacity
- Laboratory status management

Available statuses:

- Open
- Closed
- Maintenance

---

## User Management

Administrator features include:

- Add users
- Edit user information
- Delete users
- Department management
- Role assignment

Supported roles:

- Student
- Faculty
- Staff
- Administrator

---

## Admin Dashboard

- Campus-wide statistics
- Total bookings
- Active laboratories
- User overview
- Recent booking activity
- Reservation management

---

## Modern User Interface

- Responsive design
- Dark mode
- Light mode
- Smooth page transitions
- Interactive animations
- Modern component library

---

# Technology Stack

## Frontend

| Technology | Purpose |
|------------|---------|
| React 19 | User Interface |
| Next.js 16 (App Router) | Web Framework |
| TypeScript 5 | Programming Language |
| Tailwind CSS 4 | Styling |
| shadcn/ui | UI Components |
| Lucide React | Icons |
| date-fns | Date Formatting |
| next-themes | Theme Management |

---

## Backend

| Technology | Purpose |
|------------|---------|
| Next.js API Routes | Backend APIs |
| Bun Runtime | JavaScript Runtime |
| TypeScript | Backend Language |
| z-ai-web-dev-sdk | AI Integration |
| Custom Validators | Request Validation |

---

## Database

| Technology | Purpose |
|------------|---------|
| SQLite | Database |
| Prisma ORM 6 | Database ORM |

---

# Database Schema

## User

```text
id
name
email
role
department
```

## Lab

```text
id
name
location
capacity
openTime
closeTime
status
software
```

## Booking

```text
id
userId
labId
date
startTime
endTime
purpose
status
```

---

# REST API

## Session

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/session | Get current session |
| POST | /api/session | Demo login |

---

## Laboratories

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/labs | List laboratories |
| POST | /api/labs | Create laboratory |
| PATCH | /api/labs/[id] | Update laboratory |
| DELETE | /api/labs/[id] | Delete laboratory |
| GET | /api/labs/[id]/availability | Check availability |

---

## Bookings

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/bookings | List bookings |
| POST | /api/bookings | Create booking |
| DELETE | /api/bookings/[id] | Cancel booking |

---

## AI Assistant

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/chat | AI booking assistant |

---

## Administration

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/admin/stats | Dashboard statistics |
| GET | /api/admin/users | List users |
| POST | /api/admin/users | Create user |
| PATCH | /api/admin/users/[id] | Update user |
| DELETE | /api/admin/users/[id] | Delete user |

---

# Project Architecture

```text
                         Browser
                  React 19 + Next.js 16
                            │
                            │
                 Tailwind CSS + shadcn/ui
                            │
                            ▼
                 Next.js API Routes
     ┌───────────────┬──────────────────┐
     │               │                  │
     ▼               ▼                  ▼
 Booking APIs   User APIs         AI Chat API
     │               │                  │
     └───────────────┼──────────────────┘
                     ▼
               Prisma ORM 6
                     │
              SQLite Database
                     │
                     ▼
          z-ai-web-dev-sdk (GLM AI)
```

---

# Role-Based Access

| Feature | Student | Faculty | Staff | Admin |
|----------|:------:|:-------:|:-----:|:-----:|
| AI Chat | ✅ | ✅ | ✅ | ✅ |
| Book Labs | ✅ | ✅ | ✅ | ✅ |
| Check Availability | ✅ | ✅ | ✅ | ✅ |
| My Bookings | ✅ | ✅ | ✅ | ✅ |
| Lab Management | ❌ | ✅ | ✅ | ✅ |
| Dashboard | ❌ | ✅ | ✅ | ✅ |
| User Management | ❌ | ❌ | ❌ | ✅ |

---

# Installation

## Clone Repository

```bash
git clone https://github.com/your-username/labby-campus-lab-booking-agent.git
```

## Enter Project

```bash
cd labby-campus-lab-booking-agent
```

## Install Dependencies

Using Bun

```bash
bun install
```

or npm

```bash
npm install
```

---

# Environment Variables

Create a `.env` file.

```env
DATABASE_URL=file:./db/custom.db
```

The AI SDK reads its configuration from the configured environment or `.z-ai-config` in supported deployments.

---

# Run the Application

Development

```bash
bun dev
```

or

```bash
npm run dev
```

Production

```bash
bun run build
bun start
```

---

# Future Enhancements

- Google Calendar integration
- Email notifications
- QR-based laboratory check-in
- Booking reminders
- Multi-campus support
- Analytics dashboard
- Equipment reservation
- AI scheduling recommendations
- Voice-based booking assistant
- Mobile application

---

# License

This project is licensed under the MIT License.

---

# Developer

**Yukesh S**

B.Tech Computer Science and Business Systems

Areas of Interest:

- Artificial Intelligence
- Full Stack Development
- Cloud Computing
- Prompt Engineering
- Software Engineering
- Data Analytics

---

If you found this project useful, consider starring the repository.
