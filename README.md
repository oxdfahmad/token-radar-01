# Token Radar — model radar-3

A token launch radar for make.fun's token-radar-01 bounty. It reads a sealed
DefiLlama snapshot of 758 protocols, ranks the pre-token ones by implied launch
value, and hands in a web dashboard: a sortable, filterable board, a detail view
for every protocol with its model breakdown, its risks and its farm plan, plus a
live-token view kept apart with market caps.

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
