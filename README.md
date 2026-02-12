# VFS Appointment Automation System

Automated VFS Global visa appointment monitoring and booking system for Angola → Brazil and Angola → Portugal routes.

## Architecture

```
frontend/          Next.js 14 dashboard (Tailwind CSS)
backend/           Express.js API server (Prisma ORM, PostgreSQL)
automation/        Playwright-based browser automation engine
```

## Features

- **Appointment Monitoring** — Continuously checks VFS Global for available slots with configurable refresh intervals (5–60s)
- **Auto Booking** — Instantly books appointments when slots are detected (auto or manual mode)
- **Profile Management** — Store multiple applicant profiles with encrypted sensitive data; bulk upload via Excel
- **Captcha Handling** — Manual input, 2Captcha, or Anti-Captcha integration
- **Proxy & IP Rotation** — Residential proxy support with auto-rotation on block detection
- **Notifications** — Telegram bot, email (SMTP), and desktop push notifications
- **Admin Dashboard** — Real-time status, live logs, session monitoring
- **Logs & Export** — Timestamped logs with CSV/TXT export

## Tech Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Frontend     | Next.js 14, React, Tailwind CSS     |
| Backend      | Node.js, Express, Prisma, Zod       |
| Database     | PostgreSQL (AES-256-GCM encryption)  |
| Automation   | Playwright                          |
| Auth         | JWT (bcrypt password hashing)       |
| Notifications| Telegram Bot API, Nodemailer (SMTP) |

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Playwright browsers (`npx playwright install chromium`)

## Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url> && cd automatedsystem
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database URL, JWT secret, etc.
   ```

3. **Set up database:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. **Start development:**
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## API Endpoints

| Method | Path                        | Description               |
| ------ | --------------------------- | ------------------------- |
| POST   | /api/auth/register          | Register new user         |
| POST   | /api/auth/login             | Login                     |
| GET    | /api/auth/me                | Current user              |
| GET    | /api/profiles               | List profiles             |
| POST   | /api/profiles               | Create profile            |
| POST   | /api/profiles/bulk-upload   | Upload profiles via Excel |
| GET    | /api/bookings               | List booking tasks        |
| POST   | /api/bookings               | Create booking task       |
| POST   | /api/bookings/:id/start     | Start monitoring          |
| POST   | /api/bookings/:id/stop      | Stop monitoring           |
| GET    | /api/dashboard/stats        | Dashboard statistics      |
| GET    | /api/logs                   | List logs (paginated)     |
| GET    | /api/logs/export            | Export logs (CSV/TXT)     |
| GET/PUT| /api/notifications          | Notification preferences  |
| CRUD   | /api/proxies                | Proxy management (admin)  |

## Security

- AES-256-GCM encryption for passport numbers and proxy passwords
- bcrypt (12 rounds) for password hashing
- JWT authentication with configurable expiry
- Rate limiting (100 req/min per IP)
- Helmet security headers
- No hardcoded secrets — all via environment variables

## Project Structure

```
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   └── src/
│       ├── index.ts               # Express server entry
│       ├── config.ts              # Environment config
│       ├── db/client.ts           # Prisma client
│       ├── middleware/
│       │   ├── auth.ts            # JWT auth middleware
│       │   └── errorHandler.ts    # Error handler
│       ├── routes/
│       │   ├── auth.ts            # Auth endpoints
│       │   ├── bookings.ts        # Booking CRUD + start/stop
│       │   ├── dashboard.ts       # Dashboard stats
│       │   ├── logs.ts            # Log listing + export
│       │   ├── notifications.ts   # Notification preferences
│       │   ├── profiles.ts        # Profile CRUD + bulk upload
│       │   └── proxies.ts         # Proxy management
│       └── services/
│           ├── automationManager.ts # Task scheduling
│           ├── encryption.ts        # AES-256-GCM
│           ├── logger.ts            # Winston logger
│           └── notifications.ts     # Telegram + email
├── automation/
│   └── src/
│       ├── index.ts               # Engine exports
│       ├── browser.ts             # Playwright browser manager
│       ├── captcha.ts             # Captcha detection + solving
│       ├── engine.ts              # VFS automation engine
│       ├── logger.ts              # Automation logger
│       └── proxy.ts               # Proxy rotation manager
└── frontend/
    └── src/
        ├── app/
        │   ├── layout.tsx         # Root layout
        │   ├── page.tsx           # Redirect
        │   ├── login/page.tsx     # Login/register
        │   └── dashboard/
        │       ├── layout.tsx     # Dashboard layout + sidebar
        │       ├── page.tsx       # Dashboard overview
        │       ├── appointments/  # Appointment setup
        │       ├── profiles/      # Profile management
        │       ├── logs/          # Logs & history
        │       ├── notifications/ # Notification settings
        │       ├── proxies/       # Proxy configuration
        │       └── settings/      # System settings
        ├── components/
        │   └── Sidebar.tsx        # Navigation sidebar
        └── lib/
            ├── api.ts             # Axios API client
            └── store.ts           # Zustand auth store
```
