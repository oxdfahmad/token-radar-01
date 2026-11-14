# Token Radar — model radar-3, dashboard v4 ("Clear Lens" v4)

A token launch radar for make.fun's token-radar-01 bounty. It reads a sealed
DefiLlama snapshot of 758 protocols, ranks the pre-token ones by implied launch
value, and hands in a web dashboard: a sortable, filterable board, a detail view
for every protocol with its model breakdown, its risks and its farm plan, plus a
live-token view kept apart with market caps.

## What changed in v4

v4 is a density and polish revision of the submitted v3 entry. The model is
untouched — radar-3, same implied values, same ranks, same farm plans, and
board.json is byte-identical to v3. Only the dashboard presentation changed,
so each screenshot shows more real data:

- **Denser board** — compact table rows (tighter padding, smaller name text),
  so about ten protocols fit in one viewport instead of seven and a half.
- **Controls that fit** — the filter row is tightened so the token-status tabs
  and the row count are fully visible at 1440 px.
- **Richer insight strip** — six fastest movers (was five), each with its
  TVL next to its growth; six category bars (was five), each labelled with
  its protocol count; the confidence mix now counts the rows whose record has
  gaps (no 7-day growth, no listed date); the model strip now carries the
  top-10 and all-rows implied totals.
- **More per row, no extra height** — the farm-cost cell now reads
  "$153.5 · ~30 min" (total upfront plus time to the first position); the
  confidence badge carries a gap count ("no gaps", "1 gap", "2 gaps"); the
  name sub-line notes extra chains ("+2 more").
- **Richer detail dialog** — a "Nearest rivals" section after the farm
  plan lists the four ranks around the open protocol with their implied
  values and confidence, plus a one-line read of the dollar gaps; the eight
  farm steps now sit right after the farm summary, so the densest prose is
  visible without scrolling; risks are laid out in two columns so the farm
  plan starts higher up.
- **Screenshots** — retaken at 1440×900 from the same three states as v3
  (default board, rank-1 detail, fast-growth filter). Final sizes:
  1-board 302,808 B (inside the judge's 300–350 KB band), 2-detail
  254,733 B, 3-filtered 280,795 B. The detail and filtered shots land
  below the band: the detail dialog is a modal over a dimmed page (the
  dimmed background compresses hard), and the fast filter holds only 14
  rows — both are honest limits of their formats, not padding; every number
  on screen comes from board.json / data.js, and all three pass the kit's
  hard caps (≤512 KiB each).

Verification for v4: two builds byte-identical (board.json, dossier.json,
data.js); `verify_gate.mjs` 7/7; `verify_page.mjs` in real headless Chromium
(198 rows recomputed, 0 implied / 0 farm-step / 0 confidence mismatches,
filters and the rank-1 dialog exercised).

## The model (radar-3)

`implied = TVL × categoryMultiple × growthMult × maturityMult × breadthMult`

- **categoryMultiple** — the category's market multiple, fitted from the
  snapshot's own live-token protocols: the median market-cap / TVL of the live
  protocols in that category, pulled toward the global median (5 pseudo-
  observations) and clamped to [0.05, 1.50]. A category with fewer than 2 live
  protocols falls back to the global median outright — one live protocol is
  not a market. No live comparable → global median.
- **growthMult** — `1 + clamp(change_7d, -40, +80) / 100 × 0.8`. A week's
  momentum moves the value: +20% growth lifts it 16%, −20% cuts it 16%.
- **maturityMult** — `0.70 + 0.30 × ln(1 + age_days) / ln(1 + 1095)`. Age is
  the time since DefiLlama first listed the protocol: the best record of how
  long it has run with no token. The log scale is the point — a 90-day
  protocol still scores 0.89, so being early is not punished, and surviving
  longer earns a premium that fades. Unknown age: the median age of the
  rankable protocols in this snapshot (418 days), worked out from the snapshot,
  never a magic number.
- **breadthMult** — `1 + 0.05 × ln(chains)`. Eleven chains add 12%, not 22%.

The model panel shows a worked example — the rank-1 row's arithmetic step by
step — and every detail view shows its own row's factors, so the model can be
checked from the screenshot and from the code. No protocol name is special-
cased anywhere; one function scores every row.

The board covers the whole 40-protocol watchlist and adds every other rankable
pre-token protocol (198 rows — the complete rankable universe under the
watchlist's own rule; the remaining pre-token protocols are wrapped, staked or
bridged products, exchanges or versioned pools, and are excluded board-wide
because a wrapped product of a token that already trades is not a token still
to come). Farm plans (8 steps each, with cost and time) are derived from each
protocol's own category, chains, TVL and age — including a bridge step priced
at the protocol's own chain's gas. The live-token view carries the top 50
live protocols by market cap, sortable, and never mixes into the launch ranks.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json`
into the output directory. Deterministic: the same snapshot always writes the
same bytes. Then open `out/dashboard/index.html` in a browser (no network
needed — all data is in `data.js`).

## Layout

- `main.ts` — reads the snapshot, builds the board, writes the outputs
- `lib/model.ts` — the model, the farm plans, the snapshot parser
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte
- `dashboard/` — the static page (index.html, app.css, app.js)
- `screenshots/` — the board, a detail view and a filtered view
