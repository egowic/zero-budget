# Zero Budget

Zero Budget is a private, local-first budgeting app built around one question:
**how much can I safely spend today?**

The web version is designed primarily for iPhone and can be installed from
Safari as a standalone PWA. It works offline, stores every change on the device
first, and keeps a durable private copy in Supabase when a connection is
available.

Live app: [egowic.github.io/zero-budget](https://egowic.github.io/zero-budget/)

## Current product model

- **Private single-account app:** there is a login screen, but no public sign-up
  flow. The production Supabase project has new-user sign-up and anonymous
  sign-in disabled.
- **Persistent login:** the Supabase email/password session is stored and its
  token refreshes automatically. Normal app launches do not ask for the password
  again. Login is required again only after logout, cleared site data, an invalid
  or revoked session, or a comparable authentication reset.
- **Local-first:** budgets, expenses, and categories are read from and written to
  IndexedDB through Dexie. Saving never waits for Supabase.
- **Offline-capable:** the app shell is precached by a service worker and local
  changes remain usable without a connection.
- **Cloud sync and recovery:** signed-in devices push local changes to Supabase
  and pull the same account's cloud copy. JSON export and restore provide a
  separate backup path.

Someone who finds the public URL can see only the login screen. They cannot
create an account through the app, and Supabase row-level security prevents one
authenticated user from reading another user's rows. The client-side anon key
is intentionally public; the `service_role` key must never be shipped.

## Main features

### Budgets and daily allowance

A budget has an amount, start date, period, and optional recurrence. Monthly,
weekly, and custom periods are supported. Repeating budgets roll to their next
period when the app starts.

Expenses do not own a `budgetId`. They belong to a calendar date, and every
budget covering that date includes the expense. This allows overlapping budgets
without duplicating or assigning spending records.

The daily allowance is the remaining amount divided across the remaining days,
including today. Upcoming budgets also show their future daily allowance.

Both Activity and Budgets cards include:

- remaining amount and spent total;
- a 22 px progress bar with the spent percentage fixed inside its left edge;
- a separate `Today` pace marker for active periods;
- state colors for healthy, watch, and over-budget conditions.

The selected Activity budget can be switched without changing the card's other
behavior. Its typography is aligned with the compact cards on the Budgets tab.

### Expenses

- Fast custom numeric keypad and one-tap save.
- Optional date, category, and note.
- Existing expenses can be opened and recategorized with immediate visual
  selection feedback.
- Deleting an expense is intentionally a single action from its detail sheet.

### Categories and ordering

- Nine built-in categories are provided.
- Built-in category names cannot be renamed or deleted; their emoji can be
  changed.
- Custom categories can be added, renamed, reordered, and deleted.
- Category order is changed using the six-dot handle in Settings and is reused
  by both expense category grids.
- Budget cards can likewise be reordered using their dedicated six-dot handle;
  tapping the rest of a card continues to open editing.

### Settings, account, and backup

- Minimal signed-in and sync status indicators.
- Manual **Sync now** action.
- Detailed last-sync error and pending local-change count when synchronization
  fails.
- Logout requires inline confirmation and is disabled while a sync is active or
  local changes are still pending.
- JSON export and idempotent restore. Restore merges records and does not replace
  newer local versions with older backup data.

## Authentication behavior

The configured production build requires an existing Supabase email/password
account. `useAuthSession()` restores the persisted session before rendering the
app. When there is no valid email session, the login screen is shown.

There is deliberately:

- no sign-up screen;
- no anonymous cloud identity;
- no automatic creation of a second user behind the login screen;
- no password or service key stored in the repository.

Logging out removes the session from that browser context but leaves its local
IndexedDB data in place. Signing back into the same account resumes sync.

When Supabase environment variables are omitted, the codebase also supports a
local-only development build. In that mode no login screen is shown and no cloud
sync occurs.

## Data and sync architecture

### Local writes and outbox

Every mutation writes the data row and an outbox entry in the same Dexie
transaction. The UI updates immediately from IndexedDB. If the network or
Supabase is unavailable, the outbox is retained for a later retry.

### Push and pull

1. Pending categories, budgets, and expenses are pushed in dependency order.
2. Supabase accepts them through per-user upserts protected by RLS.
3. Successfully accepted outbox entries are removed.
4. Rows updated after each table's local cursor are pulled in pages and merged.

IDs are client-generated UUIDs, so records can be created offline. Deletes are
tombstones rather than immediate hard deletes, preventing deleted rows from
reappearing during a later pull.

Conflicts use last-write-wins based on Supabase's server-generated `updated_at`.
Device clocks are not trusted to decide which cloud version is newer. A pending
local outbox mutation is not overwritten by a pull running at the same time.

### Failure behavior

The sync layer distinguishes authentication, backend/quota, network, and unknown
errors. Permanent-looking failures remain visible in Settings with their start
time and underlying message. Network loss leaves data local and retryable rather
than discarding it.

Supabase does not automatically delete the oldest application rows when a plan
limit is approached. No automatic retention job is enabled for this project.
For a single user's small budgeting records, current storage needs are expected
to remain modest, but periodic JSON exports are still recommended for long-term
independence from any one cloud provider.

## PWA and iPhone behavior

Install from Safari using **Add to Home Screen** with **Open as Web App** enabled.
The manifest runs in standalone portrait mode and the layout contains targeted
iOS safe-area handling for the status bar, Dynamic Island, and bottom navigation.

The installed PWA updates from the same GitHub Pages URL. It does not normally
need to be removed and added again after a deployment. iOS may require fully
closing and reopening the app once or twice before a new service worker becomes
visible.

Safari and the standalone Home Screen app can maintain separate local storage
contexts. After both contexts sign into the same account and sync, their cloud
data converges even though their IndexedDB stores remain separate.

## Separate native iOS project

A separate Capacitor iOS build lives at `/Users/egowic/Xcode/ZeroBudget`. It
shares the product interface and budgeting behavior but is intentionally
local-only: it has no Supabase, login, sync, recovery, or cloud backup. Its data
does not mix with this PWA's data and is deleted if the native app is removed.

## Development

Requirements: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The development server uses port `5173` by default and is reachable on the local
network for phone testing.

### Supabase setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor.
3. Create the intended email/password user manually in Authentication.
4. Disable public new-user sign-up and anonymous sign-ins for a private
   single-account deployment.
5. Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

The schema enables RLS for all synchronized tables. Never put a database
password or Supabase `service_role` key in `.env.local`, GitHub Actions, or the
client bundle.

### Money and dates

Amounts are stored as integer minor units (kuruş), avoiding floating-point money
errors. Budget and expense dates are local calendar strings in `YYYY-MM-DD`
format, not timestamps, so period boundaries do not move with time zones.

## Deployment

Pushes to `main` run the GitHub Actions workflow in
`.github/workflows/deploy.yml`:

1. `npm ci`
2. `npm run test`
3. `npm run build`
4. Upload and deploy the GitHub Pages artifact

The workflow injects `BASE_PATH=/zero-budget/` and reads
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from GitHub repository secrets.
The generated PWA uses `registerType: 'autoUpdate'`.

## Repository layout

```text
src/
  components/   Shared cards, progress bar, sheets, and navigation
  db/           Dexie schema, reactive queries, and local mutations
  lib/          Money, date, and budget calculations
  screens/      Activity, Budgets, Login, Settings, and edit/create sheets
  sync/         Supabase auth, push/pull engine, status, and JSON backup
supabase/
  schema.sql    Tables, triggers, indexes, and row-level security policies
.github/
  workflows/    Test, build, and GitHub Pages deployment
```

For the complete implementation history, operational notes, and handover
details, see [`HANDOVER.md`](HANDOVER.md).
