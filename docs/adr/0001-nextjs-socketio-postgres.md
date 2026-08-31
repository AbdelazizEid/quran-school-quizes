# Next.js + Socket.IO + Postgres as the stack

The webapp is a single Next.js (App Router, TypeScript) full-stack application. Live Competitions are implemented with Socket.IO hosted in the same Node process; persistence is PostgreSQL. Alternatives (separate backend, alternative transports, different databases) were considered; this combination was picked because it keeps deployment simple (one Node process) while still handling live sessions chat loads reasonably. Prisma is the current ORM choice on top of Postgres.
