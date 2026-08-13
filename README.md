# Zero

A budgeting app that answers one question: **how much can I spend today?**

Installed to the iPhone home screen as a PWA. No App Store, no developer
licence, no sign-in screen.

## Commands

```bash
npm install
npm run dev        # dev server on :5173
npm run build      # production build + service worker
npm run test       # vitest
npm run typecheck
```

## How it works

### Local-first

The UI reads and writes IndexedDB only. Nothing waits on the network: opening
the app paints from local data in milliseconds, an expense saves instantly, and
the whole app works with the phone in airplane mode.

Components subscribe to Dexie through `useLiveQuery`, so the database *is* the
state layer — there is no store to keep in agreement with it, and no loading
states to thread through the tree.

### Sync

Supabase holds the durable copy. A local write lands in an `outbox` in the same
transaction as the row itself; the engine drains that outbox and then pulls
anything the server has stamped since the last cursor.

- **Ids** are client-generated UUIDs, so records can be created fully offline.
- **Deletes** are tombstones — a hard delete is invisible to a pull-based sync
  and the row would resurrect on the next device.
- **Conflicts** resolve last-write-wins on the server's `updated_at`, set by a
  trigger. Device clocks are never trusted to order anything.

### No sign-in, ever

The app signs in anonymously on first *write*, not on first load. Supabase
issues a real user, so row-level security works normally, but nothing is asked
of the person using it. The refresh token persists and renews itself, so first
launch and every launch after look identical: the app opens.

The one thing that costs is recovery. The anonymous account's only key lives in
this device's storage, so deleting the app from the home screen also loses the
way back to the cloud copy. Two optional safety nets, both in Settings:

1. **Export a backup** — plain JSON you keep. Restoring merges by `updatedAt`,
   so it never rolls back newer data and is safe to run twice.
2. **Add a recovery email** — links a credential to the anonymous account so a
   new phone can reach the same data. Never prompted, never blocking.

### Budgets

A budget is an amount over a period. Only the **start date** is entered — the
end always follows from the length (month / week / N days), because a monthly
budget starting on the 27th ends on the 26th and that is not a decision worth a
form field. **Repeat** is a separate switch: when on, the budget rolls into its
next period automatically on app start.

Expenses carry **no budget reference**. An expense belongs to a date, and every
budget whose period covers that date counts it — so a trip budget sitting
inside a monthly one sees the same spending, with no ownership to arbitrate.

The headline figure is `remaining ÷ days left`, with today counted as
spendable, rounded down to whole lira.

## Setup

### Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. SQL Editor → paste [`supabase/schema.sql`](supabase/schema.sql) → Run.
3. Authentication → Sign In / Providers → enable **Anonymous sign-ins**.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.

The anon key is public by design and ships in the bundle; row-level security is
what protects the data. Never put the `service_role` key anywhere near this.

> Free-tier projects pause after a week with no requests. Daily use keeps that
> from happening, and a paused project is restored from the dashboard with no
> data loss.

### Money and dates

Amounts are integers in minor units (kuruş) everywhere — floats produce
balances that are off by a kuruş and never reconcile. Dates are plain
`YYYY-MM-DD` local calendar days, never timestamps, so a period boundary does
not shift for anyone east of Greenwich.

## Layout

```
src/
  db/        Dexie schema, mutations (all writes go through the outbox), queries
  lib/       money, dates, budget math — pure and unit-tested
  sync/      Supabase client, anonymous auth, push/pull engine, JSON backup
  screens/   Timeline, Budgets, and the sheets
  components/
supabase/schema.sql
```
