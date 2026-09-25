# Cashflow Lens

A personal finance dashboard that runs entirely in your browser. Load a CSV export, or
pull straight from your Google Sheet, then explore income vs spending, categories, merchants, month-over-month changes,
recurring payments and a pivot table, with drill-down that keeps every view in sync.

**No backend, no database.** CSVs are parsed in the browser and kept only in that browser's
`localStorage`. If you connect a Google Sheet, the data travels only between Google and your
browser, read-only.

Built with React 19, TypeScript, Vite, D3 v7, Zustand and Papa Parse. Tests use Vitest.

---

## Run it

### Option 1: npm (Node 20+; developed on Node 24)

```bash
npm install
npm run dev          # http://localhost:5173 (hot reload)
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Run the unit tests once (`npm run test:watch` to keep watching) |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build at http://localhost:4173 |

Stop the dev or preview server with `Ctrl+C`. Vite binds to `localhost` only by
default, so it isn't reachable from other devices.

### Option 2: Docker

Production build served by nginx:

```bash
docker compose up -d --build     # build the image and start it in the background
```

Open **http://localhost:8080**. The container only listens on your own machine. Use
`localhost` rather than `127.0.0.1`, because Google sign-in (for Sheets) only accepts `localhost`.

| Task | Command |
|---|---|
| Stop | `docker compose down` |
| Rebuild after code changes | `docker compose up -d --build` |
| Rebuild from scratch (no cache) | `docker compose build --no-cache && docker compose up -d` |
| Logs | `docker compose logs -f app` |

Dev server with hot reload inside Docker (the source is mounted as a volume):

```bash
docker compose --profile dev up dev
```

Open **http://localhost:5173**. Stop it with `Ctrl+C`, or run
`docker compose --profile dev down`. If you change `package.json`, restart the
dev service (it runs `npm install` on start). To reset its dependency volume, run
`docker compose --profile dev down -v`.

#### Ports

| Port | Used by | Bound to |
|---|---|---|
| 5173 | Vite dev server (npm or `dev` container) | localhost / 127.0.0.1 |
| 4173 | `npm run preview` | localhost |
| 8080 | nginx container (`app`) | 127.0.0.1 |

Both compose services publish on `127.0.0.1` only, so they aren't reachable from other
machines on your network. There's no need to open any firewall ports.

---

## Your data

### Expected CSV

Headers are matched case-insensitively. The format this was built for:

| Column | Example | Meaning |
|---|---|---|
| `Bank` | `REVOLUT` | Account |
| `Date (month)` | `May 2025` | Budget month (required if there's no full date) |
| `Bookmark Date` | `Thursday, 9 July` | Optional day; the year comes from `Date (month)` |
| `Description` | `tesco` | Free text |
| `Type` | `Supermarket` | Category |
| `Amount` | `"-€1,307.63"` | Signed: negative is money out |
| `Spending Bucket` | `Fixed Essential` | Fixed Essential / Variable Essential / Discretionary / Other / Income |

Other common layouts also work: `Date` as `DD/MM/YYYY` or ISO, `Payee`/`Merchant`,
`Category`, `Debit` + `Credit` columns instead of `Amount`, and `Currency`.

### How rows are interpreted

- **Income** is anything categorised `Income` (or with bucket `Income`). Everything else is spending.
- **Refunds**: a positive amount in a spending category (e.g. a pharmacy reimbursement) reduces
  that category's spending instead of counting as income. Rows you labelled `Income`, such as
  "refund amazon", stay income.
- **Future and estimated rows** are hidden by default. That means anything dated after today, or
  with a description starting with `?` or containing `(est)`. The **Show future & estimates**
  toggle brings them back.
- **Merchant** is derived from the description: lower-cased, with notes in brackets removed and
  anything after ` - ` / ` + ` / `,` dropped. So `London - food (50%)` becomes `London`.
- **Amounts** accept `€ £ $`, thousands commas, decimal commas (`12,50`), `(12.50)` and trailing minus signs.
- **Skipped rows** are reported with line numbers and reasons under **Data & rules**: blank
  template rows, missing or unparseable amounts, bad dates, and wrong column counts.
- **Duplicates are kept.** Two `spar −€11.40` rows in the same month are treated as two
  purchases, because there's no day to tell them apart.

### Keeping it private

- `.gitignore` ignores `*.csv`, spreadsheets, bank-export formats and any `data/` folder, so a
  stray export can't be committed. Put your exports in `data/` if you like.
- `.dockerignore` keeps the same files out of the Docker build context, so they can never end up
  in an image layer.
- The Vite dev server is configured (`server.fs.deny`) to refuse to serve CSVs or `data/`.
- nginx sends a Content-Security-Policy whose `connect-src` allows only the app itself, the
  Google Sheets API and Google sign-in. The page can't send data anywhere else.
- **Data & rules → Reset everything** wipes the data, rules and saved layouts from the browser.

### Google Sheets

You can load straight from your spreadsheet instead of exporting a CSV. CSV loading still works;
whichever you loaded last is what the app shows. Access is **read-only**, the sign-in token is
kept **in memory only** (never saved), and data comes straight from Google to your browser.

**One-time setup (about 10 minutes):**

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project
   (e.g. "Cashflow Lens").
2. **APIs & Services → Library**, search for **Google Sheets API**, and click **Enable**.
3. **Google Auth Platform** (or **OAuth consent screen**) → **Get started**:
   - App name: anything, e.g. "Cashflow Lens". Support email: yours.
   - Audience: **External**, and leave it in **Testing**.
   - **Test users**: add your own Google address.
4. **Clients → Create client** → **Web application**. Under **Authorized JavaScript origins** add:
   - `http://localhost:5173` (npm run dev / dev container)
   - `http://localhost:4173` (npm run preview)
   - `http://localhost:8080` (Docker)

   No redirect URIs are needed.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into a file called `.env` in
   the project folder. `.env` is git-ignored; see `.env.example`.
   ```
   VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   ```
6. Restart `npm run dev`, or rebuild Docker with `docker compose up -d --build`. Compose reads
   the same `.env`.

**Using it:** **Data & rules → Google Sheets**. Paste your sheet's URL, click **Connect** and sign
in, pick the tab (e.g. "Fin Data"), then click **Load this tab**. After that, **↻ Refresh sheet**
in the top bar reloads it whenever you like.

- Because the app is in "Testing" mode, Google shows a "Google hasn't verified this app" screen.
  That's expected for your own private app: click **Continue**.
- The tab's first row must be the header, with the same columns as the CSV. Cells are read
  exactly as displayed in Sheets, so `-€1,307.63` and `May 2025` parse just like the CSV export.
- The sign-in lasts about an hour. After that, the next Refresh opens a quick Google popup,
  which usually closes by itself.
- To revoke access, click **Disconnect** in the app, or visit
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

---

## Using it

- **Load data**: use **Load CSV**, drag a file anywhere onto the page, or connect a Google Sheet
  (see above). **Try it with demo
  data** loads a generated sample.
- **Filters** (top bar): period, account, category and bucket. They apply to every chart,
  the summary, the table and the pivot.
- **Drill-down**: click a month, then a category, then a merchant. The breadcrumb
  (`All › 2026 › August › Supermarket`) jumps back to any level, and `←` or the browser Back
  button goes up one level. Each drillable chart also shows a **← Back to …** button while you're
  drilled in. The path is stored in the URL (`?drill=…`), so a refresh keeps your place.
- **Peek**: right-click a chart element (or long-press it on touch, or press `Shift+F10` on a
  focused bar) to see its transactions without drilling.
- **Pivot**: pick row, column and filter fields, the value and the aggregation. Click `▸` to
  collapse a group and click a header to sort. Click any number to see the transactions behind
  it. You can export the view to CSV and save named layouts. On wide screens it uses the full window width.
- **Waterfall**: *Net by month* stacks each month's net (income − spending) into a running total
  that ends at the total saved. *Where the income went* steps from income sources down through
  spending categories to net savings.
- **Money flow**: a Sankey diagram of income sources → Income → spending buckets (plus Saved) →
  categories, where flow width shows the money. If you spent more than you earned, a
  *From savings* flow makes up the difference. Click a node or flow to drill in.
- **Budgets**: a monthly limit per category or bucket, with a progress bar, a "spending evenly"
  marker and a status: ✓ on track, ! at risk (the current pace would overshoot), ✕ over.
  - Pace only applies to spread-out spending. A rent or bill paid in one go is just "fully used".
  - **Suggest budgets for my top categories** starts you off at your typical spending.
  - Budgets also appear in the Money flow tooltips (scaled to the months in view) and in the
    pivot. Turn on **Budget vs actual** with Category or Spending bucket as the first row field.
- **Rules**: under **Data & rules**, keyword and regex rules fill in missing categories (or
  override the CSV's categories if you switch that on). The first matching rule wins. Changes
  apply immediately and are saved.

---

## How it's built

```
src/
  lib/          Pure logic, no React. Unit tested (except googleAuth.ts, the browser sign-in glue).
    parse.ts        CSV or sheet rows -> transactions + skipped-row report (Papa Parse)
    sheets.ts       read-only Google Sheets API client (tabs, formatted cell values)
    googleAuth.ts   Google sign-in popup; access token kept in memory only
    amount.ts       money parsing
    dates.ts        month/day parsing and month maths
    merchant.ts     description -> merchant, estimate detection
    categorise.ts   keyword rules, income/expense, future flag
    filters.ts      global filters
    drill.ts        drill path: apply, push, URL encode/decode, explorer level
    aggregate.ts    monthly totals, summary, spend by key, MoM change, buckets
    recurring.ts    recurring payment detection
    pivot.ts        pivot engine: tree, subtotals, sorting, drill-through, export
    waterfall.ts    waterfall steps (net by month; income → categories → net)
    flow.ts         Sankey graph (income → buckets → categories)
    budget.ts       budget status (spent, pace, days left), suggestions
  store/        Zustand store (single source of truth) + derived-data context
  hooks/        data loading (CSV / demo / Sheets), URL sync, theme, resize, peek
  charts/       D3 charts and shared D3 helpers
  components/   UI: filter bar, breadcrumbs, summary, tables, pivot, rules, dashboard panels
```

### State

One Zustand store (`store/useAppStore.ts`) holds everything that changes what you see:

```ts
{
  transactions, report,            // parsed data + import report   (localStorage)
  rules, rulesOverride,            // categorisation rules          (localStorage)
  filters: { from, to, accounts, categories, buckets, includeFuture },
  drill: DrillStep[],              // e.g. [{dim:'year',value:'2026'}, {dim:'month',value:'2026-08'}]  (URL)
  pivot: { rows, cols, value, agg, filters, sort, heatmap, collapsed },  (localStorage)
  savedPivots, theme, tab (URL), peek
}
```

`DataProvider` derives, once per change, `all` (after rules), `filtered` (filters + drill),
which every view reads, and `context` (the same but without date limits), which the trend views
use so month-over-month comparisons and recurring detection can see neighbouring months.

### React + D3 pattern

**React owns the structure. D3 owns the maths and the marks inside one `<g>`.**

1. `useMemo` computes the layout with D3 scales and stack/line generators. This is pure maths.
2. React renders the static skeleton: `<svg>`, empty `<g ref>` containers, legends and the
   tooltip (a React element positioned from pointer coordinates).
3. A `useLayoutEffect` gives those `<g>` refs to D3, which runs `selection.join()` with
   enter/update/exit transitions (`charts/bars.ts`). React never renders children inside those
   groups, so the two never fight over the same DOM nodes.

Why this split: D3's data join with keyed enter/update/exit is what makes transitions smooth.
Bars keep their identity (object constancy) when filters change, and exiting bars shrink away
instead of vanishing. Rebuilding that in React would mean reimplementing D3's transition engine.
Keeping D3 confined to a `<g>` keeps React's rendering predictable. Callbacks reach D3 handlers
through a "latest ref" (`hooks/useLatest.ts`), so re-renders don't restart transitions.

Every bar is drawn as the same path shape (`roundedRect` in `charts/core.ts`, always four
corners). This lets D3 tween any bar into any other. When you drill, the next view's bars grow
out of the bar you clicked. When you go back up, the view collapses into the bar you came from.

## Troubleshooting

- **Google: "origin_mismatch" / "redirect_uri_mismatch"**: the address in your browser must be
  listed exactly under *Authorized JavaScript origins*. Use `localhost`, not `127.0.0.1`.
- **Google: "access_denied"**: add your Google account as a **Test user** on the consent screen.
- **"The Google Sheets API isn't enabled"**: enable it under APIs & Services → Library (step 2).
- **The Google popup doesn't appear**: allow popups for `localhost` in your browser.
- **The Sheets option says "Not set up"**: `.env` is missing `VITE_GOOGLE_CLIENT_ID`, or the dev
  server or Docker image wasn't restarted or rebuilt after adding it.

- **"No amount column found"**: check the header row. See *Expected CSV* above.
- **Nothing saves between refreshes**: the browser may be blocking site data (private window).
  A banner under **Data & rules** says so.
- **Docker dev server doesn't reload on Windows/macOS**: polling is already on inside the
  container (`DOCKER_DEV=true`). Make sure the project folder is shared with Docker Desktop.
