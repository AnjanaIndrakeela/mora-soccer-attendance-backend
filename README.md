# Mora Football — Backend

REST API for the Mora Football team attendance system: players check in by scanning a session QR code, admins approve attendance and finalize sessions, and the API serves squad stats, tournaments and matches. Built with Node.js, Express 5, TypeScript, PostgreSQL and Prisma. The web app lives in the separate `MoraSoccer-Frontend` repository (Next.js).

## Tech stack

- [Node.js](https://nodejs.org) 20+ (ES modules), [Express](https://expressjs.com) 5, [TypeScript](https://www.typescriptlang.org)
- [PostgreSQL](https://www.postgresql.org) 17 + [Prisma](https://www.prisma.io) 7 (`@prisma/adapter-pg`)
- Auth: JWT in an httpOnly cookie (`jsonwebtoken`), `bcrypt` password hashing, `express-rate-limit`
- Validation: [Zod](https://zod.dev)
- `qrcode` for session QR codes, `multer` + [Cloudinary](https://cloudinary.com) for profile pictures, [Resend](https://resend.com) for password-reset emails
- Tests: [Vitest](https://vitest.dev) + [Supertest](https://github.com/ladjs/supertest)

## Getting started

Prerequisites: Node.js 20+, npm, and Docker (for the local database).

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in JWT_SECRET and QR_TOKEN_SECRET (see below)
npm run db:up               # start PostgreSQL in Docker
npm run db:migrate          # apply migrations
npm run db:seed             # optional: demo data
npm run dev
```

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The API starts on http://localhost:8000 (`curl http://localhost:8000/health`).

### Demo data

`npm run db:seed` **wipes the database** and creates 20 players, 8 weeks of finalized sessions, a session in progress right now (for trying QR check-in), an upcoming session, tournaments and matches. It refuses to run with `NODE_ENV=production`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@morasoccer.lk` | `admin12345` |
| Player (confirmed) | `kasun@morasoccer.lk` | `player12345` |
| Player (awaiting confirmation) | `tharindu@morasoccer.lk` | `player12345` |

Override the admin with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server with auto-reload |
| `npm run build` / `npm run start` | Compile to `dist/` / run the build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Integration tests (needs the Docker database running) |
| `npm run db:up` / `db:down` | Start / stop local PostgreSQL |
| `npm run db:migrate` | Create and apply a migration after editing `schema.prisma` |
| `npm run db:deploy` | Apply pending migrations (production) |
| `npm run db:seed` | Reset and load demo data |
| `npm run db:reset` | Drop the database and re-apply migrations (**deletes data**) |
| `npm run db:studio` | Browse data in Prisma Studio |
| `npm run create-admin -- <email> <password>` | Create an admin, or promote an existing user |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `JWT_SECRET` | ✓ | Signs login tokens |
| `QR_TOKEN_SECRET` | ✓ | Signs session QR tokens |
| `CLIENT_URL` | | Frontend URL (default `http://localhost:3000`). Used for CORS, QR links and reset-email links. |
| `PORT` | | Default `8000` |
| `NODE_ENV` | | `production` enables secure cookies and disables the dev fallbacks below |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | prod | Profile picture uploads. Without them in development, images are stored inline as data URLs. |
| `RESEND_API_KEY` | prod | Password-reset emails. Without it, emails are printed to the server log. |
| `MAIL_FROM` | | Sender, e.g. `Mora Football <noreply@yourdomain>` (must be a domain verified in Resend) |

## How it works

### Accounts
- **Player** is a roster entry created by an admin. **User** is a login account. They are separate tables.
- Sign-up requires an index number that is on the roster and not yet claimed. The account can log in straight away, but can't check in until an admin confirms the claim (`GET /users/pending`, `POST /users/:id/confirm`). Rejecting deletes the account so the entry can be claimed again.
- Login sets an httpOnly `token` cookie (JWT, 7 days, `SameSite=Lax`, `Secure` in production). The frontend proxies `/api/*` here, so the cookie is first-party.

### Sessions and QR check-in
1. **Create:** an admin creates a session, and the server signs a QR token that expires 15 minutes after the session ends.
2. **Show the QR:** `GET /sessions/:id/qr` returns a PNG data URL and an SVG encoding `CLIENT_URL/attend/{id}?t={token}`.
3. **Scan and confirm:** the QR opens the frontend's `/attend` page, which calls `GET /attend/:sessionId?t=` to show the session and whether the player can check in. When the player taps **Confirm**, `POST /attend` creates a `PENDING` record if the token is valid, the time is within the scan window (15 minutes before the start until 15 minutes after the end), the user is a confirmed, active player, and they haven't already scanned.
4. **End:** `POST /sessions/:id/end` closes check-in. A session whose window has passed is treated as ended automatically.
5. **Review:** admins approve or reject each record (`PATCH /attendance/:id`) or use `POST /sessions/:id/approve-all`. They can also add a record by hand (`POST /sessions/:id/attendance`).
6. **Finalize:** `POST /sessions/:id/finalize` requires no pending records. It marks every active player without a record `ABSENT`, but only players who had joined by the session's end. Only finalized sessions count in stats.

**Attendance %** = approved records ÷ finalized sessions that ended after the player's `joinedAt`.

### Match reports and points
After a match, an admin saves its report with `PUT /matches/:id/report`: who played, each player's cards (0–2 yellow, 0–1 red) and the man of the match, who must be one of the players. Saving replaces the whole report, so corrections are simple.

Points are calculated from reports whenever they're requested, never stored, so editing or deleting a report or match updates them straight away. The values live in `POINTS` in [src/services/points.service.ts](src/services/points.service.ts).

| Event | Points |
| --- | --- |
| Played a match | +3 |
| Man of the match | +7 |
| Each yellow card | −1 |
| Each red card | −2 |

## API

All routes except `/health`, `/auth/register|login|logout|forgot-password|reset-password` require login. 🔒 = admin only.

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Sign-ups 🔒 | `GET /users/pending`, `POST /users/:id/confirm`, `DELETE /users/:id` |
| Players | `GET /players?sort=attendance\|points\|name\|number&limit=&search=&includeInactive=`, `GET /players/:id`, 🔒 `POST /players` (multipart, `profilePic`), 🔒 `PATCH /players/:id` (multipart), 🔒 `DELETE /players/:id` (soft delete) |
| Sessions | `GET /sessions?limit=&status=`, `GET /sessions/:id`, 🔒 `POST /sessions`, 🔒 `PATCH /sessions/:id`, 🔒 `DELETE /sessions/:id`, 🔒 `GET /sessions/:id/qr`, 🔒 `POST /sessions/:id/end`, 🔒 `GET /sessions/:id/attendance`, 🔒 `POST /sessions/:id/attendance`, 🔒 `POST /sessions/:id/approve-all`, 🔒 `POST /sessions/:id/finalize` |
| Attendance | `GET /attend/:sessionId?t=` (scan preview), `POST /attend` `{ sessionId, token }`, 🔒 `PATCH /attendance/:id` `{ status }` |
| Tournaments | `GET /tournaments?upcoming=true\|false`, `GET /tournaments/:id`, 🔒 `POST /tournaments`, 🔒 `PATCH /tournaments/:id`, 🔒 `DELETE /tournaments/:id`, 🔒 `POST /tournaments/:id/matches` |
| Matches | `GET /matches?tournamentId=&friendlies=true`, `GET /matches/:id` (with report), 🔒 `POST /matches`, 🔒 `PATCH /matches/:id`, 🔒 `PUT /matches/:id/report` `{ appearances: [{ playerId, yellowCards, redCards }], manOfTheMatchId }`, 🔒 `DELETE /matches/:id` |
| Stats | `GET /stats/dashboard`, `GET /stats/attendance-trend?groupBy=session\|week&limit=&from=&to=`, `GET /stats/progress?from=&to=&atRiskThreshold=`, `GET /stats/points` (leaderboard + rules) |

- **Request formats:** session create/update takes `date` (`YYYY-MM-DD`) plus `startTime`/`endTime` as ISO datetimes with an offset. The frontend converts the team's local time to UTC.
- **Errors:** every error is JSON, `{ error, details? }`.
- **Rate limits:** login, register, forgot-password and reset-password are rate-limited per IP.
- **Private fields:** birthday, contact number and index number are only returned to admins and to the player themselves.

## Database

Schema: [prisma/schema.prisma](prisma/schema.prisma). Migrations are in `prisma/migrations/` and are committed. The generated client goes to `src/generated/prisma` (gitignored, regenerated on install and build). Import the shared client from `src/lib/prisma.ts`.

| Model | Purpose |
| --- | --- |
| `User` | Login account (`ADMIN` / `PLAYER`), optionally linked to one `Player`; `playerConfirmedAt` marks the admin's confirmation |
| `PasswordResetToken` | SHA-256 hash of a reset token, 45-minute expiry, single use |
| `Player` | Roster entry; soft-deleted via `isActive` |
| `Session` | `SCHEDULED → ACTIVE → ENDED → FINALIZED`, with its signed `qrToken` |
| `AttendanceRecord` | One per player per session: `PENDING` / `APPROVED` / `REJECTED` / `ABSENT` |
| `Tournament`, `Match` | Match `result` is derived from the score when not given; `tournamentId` is null for friendlies; `manOfTheMatchId` links a player |
| `MatchAppearance` | One per player per match played, with `yellowCards` and `redCards`; drives points |

All timestamps are `timestamptz` (UTC). Change the schema by editing `schema.prisma`, running `npm run db:migrate -- --name <what-changed>`, and committing the new migration folder.

## Tests

`npm test` runs integration tests against a separate `mora_soccer_test` database, which is created and migrated automatically. The Docker Postgres must be running. The tests cover the attendance flow: the scan window, duplicate scans, invalid tokens, unconfirmed accounts, ending, review, finalize and the attendance % formula, plus access control. Set `TEST_DATABASE_URL` to use another database.

## Project structure

```
prisma/
  schema.prisma, migrations/, seed.ts
src/
  server.ts          # Entry point
  app.ts             # Express app: security headers, CORS, JSON, cookies, routes, errors
  config/env.ts      # Environment loading
  routes/            # Route definitions (index.ts mounts them)
  controllers/       # HTTP in/out
  services/          # Business logic and stats queries
  schemas/           # Zod request schemas
  middleware/        # Auth/roles, validation, uploads, rate limits, errors
  lib/               # Prisma client, JWT, QR tokens, mailer, Cloudinary, HTTP errors
  generated/         # Prisma client (generated, gitignored)
tests/               # Vitest + Supertest integration tests
docker-compose.yml   # Local PostgreSQL
```

## Deploying

**Database (Neon or Supabase):** create a Postgres database and use its connection string as `DATABASE_URL`. For Neon, the pooled connection string works for the app, and migrations also run over it.

**Backend (Render or Railway):**
- Build command: `npm ci && npm run build && npm run db:deploy`
- Start command: `npm start`
- Env: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `QR_TOKEN_SECRET`, `CLIENT_URL` (the Vercel URL), `CLOUDINARY_*`, `RESEND_API_KEY`, `MAIL_FROM`
- Create the first admin from the Render/Railway shell: `npm run create-admin -- coach@example.com <password>`

**Render free tier:** the service sleeps when idle, and the first request can take 30+ seconds. Open the app a few minutes before practice, use Railway, or set up an uptime ping to `/health`.
