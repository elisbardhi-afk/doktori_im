# Doktori Im 🩺

A modern, bilingual (Albanian 🇦🇱 / English 🇬🇧) doctor-appointment booking platform for Albania — a DoctoLib-style product with three role-based portals (patient, doctor, admin) and a concurrency-safe, timezone-correct booking engine.

## Stack

- **Next.js 14** (App Router, TypeScript) + **Tailwind CSS** + shadcn-style UI
- **Supabase** — Postgres, Auth, Storage, RLS
- **next-intl** — Albanian (default) + English
- Design: "Teal & Light" (`#0D6B8C`) with Plus Jakarta Sans

## Flawless booking

- **No double-booking:** a Postgres `GiST` exclusion constraint on `appointments` makes overlapping bookings *physically impossible*, even under concurrent requests.
- **Authoritative availability:** `book_appointment` re-derives the slot from `get_available_slots()` *inside the transaction* — a client can't book outside working hours or off-grid.
- **Timezone/DST correct:** all instants stored UTC; availability expressed in `Europe/Tirane` wall-clock and resolved per-date (verified against DST spring-forward / fall-back).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project keys
```

### Database

Paste [`supabase/SETUP.sql`](supabase/SETUP.sql) into the Supabase **SQL Editor** and run it (schema + RLS + booking RPCs + seed specialties). Then seed demo users:

```bash
node scripts/seed-users.mjs
```

### Run

```bash
npm run dev        # http://localhost:3000
npm test           # unit tests (booking/DST logic)
npm run build      # production build
```

## Demo accounts

All use password `DoktoriIm123!`:

| Role    | Email                    |
| ------- | ------------------------ |
| Admin   | admin@doktori-im.al      |
| Patient | patient@doktori-im.al    |
| Doctor  | dr.hoxha@doktori-im.al   |

## Project layout

```
src/
  app/[locale]/(marketing|auth|patient|doctor|admin)/   # role-based portals
  components/            # design system + domain components
  lib/booking/           # pure TS slot generation + DST logic (unit-tested)
  lib/supabase/          # server / client / service / middleware clients
  i18n/                  # next-intl routing
supabase/
  migrations/            # schema, functions (RPCs), RLS
  SETUP.sql              # consolidated, paste-ready
```
