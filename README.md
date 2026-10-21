# CRMO

### → [**Open the live app**](https://gigolajulian.github.io/crmo/)

A photography business system — enquiries, shoots, quotes, deposits, licences,
moodboards, deliverables and client approvals in one place.

One record carries a job from the first enquiry through the quote, the deposit,
the shoot day, the edit, delivery and on into the licence term, because that is
one job rather than a deal and a project that happen to be linked.

Built to feel like a project studio rather than a corporate admin panel: a warm-grey
canvas, soft panels, a single saturated accent, and a component language made
almost entirely of pills.

[![Deploy](https://github.com/gigolajulian/crmo/actions/workflows/deploy.yml/badge.svg)](https://github.com/gigolajulian/crmo/actions/workflows/deploy.yml)

## Running it

```bash
npm install
```

```bash
npm run dev
```

The app opens at `http://localhost:5173`. With no Supabase credentials configured it
runs entirely in the browser against `localStorage` — see **Connecting Supabase** below.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck, then a production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

## Setup and customisation

On first run, CRMO walks through a few short steps: name the studio, introduce
yourself, set the money and billing details, pick your lifecycle stages, an
accent and a theme, and choose whether to start from the demo studio or an
empty workspace. All of it is editable afterwards under
**Settings → Account & studio**, and **Open setup** runs the flow again.

Without Supabase credentials this is a **local profile, not authentication**:
no password and no sign-in, and the workspace lives in this browser's local
storage. With them, setup runs after you sign in and the workspace lives in the
database — see **Connecting Supabase** below.

The accent is the only chromatic decision in the product; everything else is warm
grey and near-black. Five presets ship (lime, amber, coral, sky, iris), each
defined once in `tokens.css` under a `[data-accent]` block for both themes, and
each light enough to carry near-black text well above 4.5:1.


## Live app

**https://gigolajulian.github.io/crmo/**

Runs in connected mode: the repository has `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` set as secrets, so the live site asks you to sign in and
your workspace is stored in that Supabase project, not in the browser. Deployed
from `main` by `.github/workflows/deploy.yml`.

A deploy does not touch the database. When a change adds a file under
`supabase/migrations/`, run it in the SQL editor before using the new build, or
the app reports that the database is missing a column and keeps that change on
the device until you do.

### Install it as an app

CRMO is a Progressive Web App. In Chrome or Edge, open the live link and choose
**Install CRMO** from the install icon at the right of the address bar (or
**⋮ → Cast, save and share → Install page as app**). It then opens in its own
window, from the dock or Start menu. Without a connection it opens the last
version it loaded, but signing in and syncing need the network.
On iOS, use **Share → Add to Home Screen** in Safari.

## Connecting Supabase

Without credentials CRMO is local-only and works offline. Add them and it becomes
a real multi-user app with auth, Postgres and file storage.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run every file in `supabase/migrations/` in order,
   starting with `0001_init.sql`. That creates the tables, the row-level security
   policies and the storage bucket; the later files add columns the app now
   writes.
3. Copy **Project Settings → API** into `.env.local`:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. `npm run dev`. You get a sign-in screen; create an account and your workspace
   is provisioned from whatever the setup flow produced locally.

To deploy it connected, add the same two values as **repository secrets** named
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — the workflow already reads them.

**The anon key is public by design.** It ships in the JavaScript bundle. Your data
is protected by the RLS policies in the migration and nothing else, which is why
every table is locked to workspace members. Never put the `service_role` key in the
client: it bypasses RLS entirely.

### How sync works

The ~40 store actions are untouched. `store/sync.ts` subscribes to the store,
diffs each collection by id against the last synced snapshot, and pushes only what
changed — debounced 400ms and coalesced, so dragging a moodboard item is one round
trip rather than thirty. A failed flush keeps its old snapshot so the change is
retried instead of silently lost.

Conflict resolution is last-write-wins. Honest for a studio where two people rarely
edit the same record in the same second; per-field versioning is the next step.

## Documents

Quotes and invoices are generated in the browser as real PDFs — no service, no
server round trip. `lib/pdf` is a small typesetting engine ported from the
studio's standalone invoice generator:

```
lib/pdf/
  ttf.ts              cmap + hmtx parsing, so text can be measured exactly
  fonts.ts            lazy fetch of the two Inter faces from /fonts
  doc.ts              PDF 1.4 writer — FlateDecode, embedded TrueType, image SMask
  svg.ts              the on-screen proof
  templates/invoice   the layout, measured from the reference document
```

The load-bearing idea is that `templates/invoice` emits **one draw list** that
both the SVG proof and the PDF writer consume. There is no second layout for
print, so what you approve on screen is what the client receives, to the decimal.

Two things are worth knowing. The template fits **eight line items** before the
notes block — a ninth is dropped rather than overflowing, and page-2 overflow is
the next step. And text is encoded as WinAnsi, which covers Latin-1 but not
Cyrillic or CJK; those characters become `?` rather than corrupting the file.

The fonts are ~1.4MB of TrueType, served from `public/fonts` and fetched on
demand rather than inlined, so they stay out of the JavaScript bundle and get
cached between visits. The whole billing route is lazily loaded.

**Your billing details live in Settings, not in the repo.** Business name,
address, email, phone and tax id are workspace data; the demo seed ships them
blank on purpose, because a letterhead filled with plausible invented details is
worse than an obviously empty one.

## Architecture

```
src/
  styles/tokens.css     Design tokens as CSS variables — light and dark
  styles/base.css       Reset, focus rings, scrollbars, motion, reduced-motion
  lib/                  brand · utils · art (generative fallback) · hotkeys · supabase
  lib/pdf/              document engine — see Documents above
  data/                 types · schema (table map) · images · seed/ (demo studio)
  store/                useStore (zustand) · selectors · sync (Supabase) · useUI
  components/
    ui/                 primitives · form · overlay · feedback · Avatar · Tabs
    charts/             hand-drawn SVG chart primitives
    shell/              AppShell · CommandPalette · QuickAdd · Logo · nav
    common/             Img · records · PageHeader · FilterBar
  features/             auth · onboarding · dashboard · shoots · moodboard
                        contacts · billing · licences · tasks · activity
                        approvals · reports · settings
```

**Stack.** Vite · React 19 · TypeScript · Tailwind v4 (CSS-first `@theme`) ·
React Router 7 · Zustand · dnd-kit · lucide-react · Supabase (optional).

A few decisions worth knowing about:

- **All derived data lives in `store/selectors.ts`.** Shoot health, quoted and
  collected totals, balance due, licence expiry, stale quotes, task buckets,
  workload and the dashboard's priority list are computed there and nowhere else.
  Money in particular is never stored: a shoot's value is summed from its line
  items every time, so revising a quote cannot leave a stale figure behind.
- **An invoice freezes what it billed.** `Invoice.lineItems` is a copy taken when
  the invoice is raised, not a reference to the shoot — editing a quote afterwards
  must never rewrite a document that has already gone out.
- **Stages are data, not an enum.** Selectors branch on `PipelineStage.kind`
  (`lead`, `quoted`, `booked`, …), never on a stage's name, so renaming "Quoted"
  to "Proposal out" does not stop the follow-up timers.
- **Charts are hand-drawn SVG,** not a charting library. The reference language —
  diagonal-hatch fills, grey bars with one accent bar, a single accent callout pill —
  is not something a library will give you, and this is ~250 lines with no
  dependency.
- **Never filter inside a zustand selector.** Returning a new array or object each
  render makes the store's snapshot comparison fail and loops React forever.
  Derived lists use memoised hooks (`useActiveTeam`, `useOpenStages`, …).
- **Grids carry `grid-cols-1` explicitly.** Without it the mobile track is sized to
  `min-content`, and one `truncate` line of nowrap text pushes the whole page wide.

## What is mocked

Beyond Supabase there is no server, so a few things stand in for real integrations. Each is
implemented so it behaves completely rather than being a dead end:

| Area | How it works |
| --- | --- |
| **Persistence** | Local mode uses `localStorage`; connected mode uses Postgres. Both survive a reload. |
| **File upload** | Still the curated photo library rather than a file dialog. The storage bucket and `storage_path` column exist; wiring the picker to them is the remaining step. |
| **Photography** | Curated Unsplash URLs, each checked to resolve. If one fails — offline, dead URL — `lib/art.ts` renders deterministic generated artwork seeded from the record id, so no image is ever broken. |
| **Avatars** | Nothing external. Your own picture uploads for real — centre-cropped to 256px and stored as a ~3KB WebP data URL, so it works in both modes, survives a reload and cannot expire. The demo team get deterministic portraits drawn locally by `lib/art.ts`. Anyone without either gets tinted initials. |
| **Email** | Paste a Gmail thread link onto a client or shoot and log the exchange as activity. No OAuth — real Gmail access needs a token-holding backend and Google's verification review. |
| **Calendar** | Shoot dates, call times and tentative holds live on the record. An `.ics` feed is the next step. |
| **Documents** | Genuinely real — quotes and invoices are proper PDFs with embedded fonts, generated locally. Sending them is still your own email client. |
| **Accounts & auth** | Local mode has no sign-in — setup creates a browser-local profile. Connected mode uses real Supabase auth. Roles are reflected in the UI but only RLS enforces tenancy; per-role write rules are next. |
| **Notifications** | Preferences are stored; nothing is actually delivered. |

## Accessibility

- The accent is never foreground text on a light surface — only a background paired
  with ink, a large fill, or a chart mark. Muted ink clears 4.5:1 on canvas in both themes.
- Every icon-only control has an accessible name; there are no unlabelled focusables.
- Every drag has a keyboard equivalent: dnd-kit's keyboard sensor on the handle,
  plus a "move to…" menu on every draggable card.
- Overlays trap focus, restore it to the opener on close, lock background scroll,
  and close on `Escape`.
- A skip link is the first thing `Tab` reaches; route changes move focus to `<main>`.
- `prefers-reduced-motion` disables transitions and entrance animation.

## Keyboard

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl K`, or `/` | Search and jump to anything |
| `C` | Quick add |
| `G` then `H P M T R D C A E S` | Jump to a section |
| `Esc` | Close any overlay |
| `←` `→` | Move between references in the lightbox |
