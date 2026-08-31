# دار مكة — Dar Makkah

منصة اختبارات ومسابقات قرآنية بأسلوب Kahoot: المعلّم ينشئ اختبارات قرآنية، والطلاب ينضمون للمنافسات المباشرة برقم الجلسة واسم مستعار — بلا حساب — أو يتدرّبون ذاتيًا بحساب طالب.

A Kahoot-style Quran quiz platform. Arabic-only RTL v1.

## Stack

- Next.js 14 (App Router) + React 18 + Tailwind
- Socket.IO (`/socket`, namespace `/session`) — live Competition sessions
- Prisma + PostgreSQL
- Clerk (auth for Teachers and Practice Students)
- Playwright (e2e)
- Single Node process serves Next.js + Socket.IO together (`src/server/index.ts`)

## Domain quick reference

Full glossary in `CONTEXT.md`. Key terms: **Quiz** (reusable question set) → launched as **Competition** (live, nickname-only) or **Practice** (self-paced, student account). **Join Code**: 6–7 digit code students enter. **Input Answer**: free-text answer a teacher marks manually (Practice only).

## Setup

1. **Dependencies**

   ```bash
   npm install
   ```

2. **PostgreSQL**

   ```bash
   docker compose up -d
   npx prisma db push
   ```

   Uses `postgres:16-alpine` on port `5434` (adjust `docker-compose.yml` and `DATABASE_URL` if taken).

3. **Clerk** (https://dashboard.clerk.com → API Keys)

   ```bash
   cp .env.example .env
   ```

   Fill `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env`.

   > **Dev mode without Clerk keys**: if the secret key is missing or contains `placeholder`, the app runs with a built-in dev teacher/student (no auth prompts) so you can develop and test everything locally. Real keys enable proper sign-in/sign-up (email or phone with SMS OTP — enable Phone authentication in Clerk dashboard).

4. **Run**

   ```bash
   npm run dev        # dev server (Next + Socket.IO via tsx)
   npm run build      # production build
   npm run start      # production server (single Node process)
   ```

## Tests

```bash
npm run test:e2e       # Playwright UI e2e (landing RTL/overflow, join validation, quiz CRUD, copy, full live host+student flow)
npm run test:flow      # API + Socket.IO live flow (join, dedupe, answer, speed scoring, reveal, leaderboard, DB persistence)
npm run test:practice  # Practice track: auto-grade MCQ, manual Input marking, teacher review
```

Playwright needs the app running (`npm run start` in another terminal) and `npx playwright install chromium` once.

## Speed scoring

Correct answer: `500 + 500 × (remaining time fraction)` → faster answers earn more, max 1000, wrong/timeout = 0. One answer per participant per question.

## Fonts

Thmanyah font families (Serif Display / Serif Text / Sans) from https://font.thmanyah.com/ are the binding typeface. CSS font stacks reference them with system fallbacks; drop the font files into `src/app/fonts/` and register via `next/font/local` when available.

## Deploying to a VPS (single process)

1. Provision a Linux VPS; install Node 20+, Docker (for Postgres), and clone the repo.
2. `docker compose up -d` — Postgres on `5434`, volume-backed.
3. `.env`: production `DATABASE_URL`, Clerk keys.
4. `npm ci && npx prisma db push && npm run build`.
5. Run `npm run start` under a process manager (systemd unit or pm2). One Node process serves HTTP + WebSocket.
6. Reverse proxy (nginx/Caddy) → `http://127.0.0.1:3000`; ensure `/socket/` is proxied with WebSocket upgrade (`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
7. No serverless platforms — Socket.IO requires the long-lived process.

## Design system

See `DESIGN.md` (parchment/ink/gold + lapis/red accents, girih world, RTL rules) and `PRODUCT.md` for the product brief.
