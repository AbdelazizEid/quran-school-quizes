# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Teachers: registered accounts; build Quizzes on Quranic material, launch them as Practice or live Competitions, review results.
- Students: signed-in accounts for self-paced Practice; nickname-only (no account) for live Competitions via QR or 6–7 digit Join Code.

## Product Purpose

A Kahoot-style application for Dar Makkah Quran school. Teachers create reusable Quizzes (MCQ up to 4 options, True/False, free-text Input) and launch them in one of two Tracks: Practice (self-paced) or Competition (live, synchronized, Kahoot-style speed scoring). Success means teachers can run in-class live sessions with a lobby + leaderboard and assign self-paced practice, with all results persisted.

## Positioning

Not a generic Kahoot-clone: Quran-specialized (surah/ayah/tajwid vocabulary and marked Input Answers), a teacher-to-teacher Quiz Copy library (copies detach from originals), and self-hosted deployment on the school's own VPS (school owns its data and runtime).

## Operating Context

Teachers work from the Teacher Dashboard; students join live sessions on phones with a numeric Join Code or QR, nickname uniqueness enforced in-session. Practice requires a Student account. Competition join requires no account. Teachers mark free-text Input Answers manually after Practice.

## Capabilities and Constraints

- Question kinds: MCQ (max 4 options, one correct), True/False, Input (free-text; Practice only).
- Competition sessions: lobby → question → reveal → leaderboard; per-question time limit, default 20s, adjustable per question.
- Scoring: Kahoot-style speed scoring for MC/TF; Input answers are manually marked by the teacher.
- Auth: Clerk; mobile phone (SMS OTP) or email for both Teachers and Practice Students.
- Deployment: single Node process serving Next.js + Socket.IO on a self-hosted VPS; PostgreSQL via Prisma.
- UI: Arabic-only, RTL (v1). No i18n framework.
- Brand font: Thmanyah (Serif Display for headings, Serif Text for body, Sans for UI), free license.
- Quiz Copy: teacher shares a quiz; copies are detached from the original.
- e2e testing with Playwright is required before v1 packaging (session flows, join flow, Quiz CRUD).

## Brand Commitments

- School/product name: Dar Makkah (دار مكة). The scaffold working title "مدرسة القرآن" is superseded.
- Typeface: Thmanyah families are binding (per https://font.thmanyah.com/ free license).
- Voice (user-pinned): plain, normal Arabic copy. No ornate rhetoric, no saj'/rhymed flourishes.

## Evidence on Hand

- Domain glossary and decisions: `CONTEXT.md`.
- ADR 0001 (stack): `docs/adr/0001-nextjs-socketio-postgres.md`.
- ADR 0002 (Clerk auth): `docs/adr/0002-clerk-auth.md`.
- Data model: `prisma/schema.prisma`.
- No real testimonials, logos, or imagery are on hand; future work must not fabricate any. The current landing page uses text-only hero content.

## Product Principles

1. One Quiz, two Tracks — content stays reusable; launch mode is a property of the Session, not the Quiz.
2. Teachers own content — copying detaches; independent teachers, no admin/school entity.
3. Low-friction joining — Competition students never need accounts; nicknames are scoped per session.
4. Practice is accountable — Practice answers persist so teachers can review and manually mark Input.
5. School owns the runtime — self-hosted single process; external dependencies only where chosen deliberately (Clerk).

## Accessibility & Inclusion

Arabic-only RTL interface v1; ensure readable contrast and comfortable tap targets for phone-based students. No formal WCAG level is a committed target.
