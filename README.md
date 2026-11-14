# Token Radar — model radar-2

A token launch radar for make.fun's token-radar-01 bounty. It reads a sealed
DefiLlama snapshot of 758 protocols, ranks the pre-token ones by implied launch
value, and hands in a web dashboard: a sortable, filterable board, a detail view
for every protocol with its model breakdown and farm plan, and a live-token view
kept apart with market caps.

## The model (radar-2)

`implied = TVL × categoryMultiple × growthMult × maturityMult × breadthMult`

- **categoryMultiple** — the category's market multiple, calibrated from the
  snapshot's own live-token protocols: the median market-cap / TVL of the live
  protocols in that category, shrunk toward the global median (3 pseudo-
  observations) and clamped to [0.05, 1.50]. No live comparable → global median.
- **growthMult** — `1 + clamp(change_7d, -60, 120) / 100 × 0.5`
- **maturityMult** — `0.6 + min(age_days, 1095) / 1095 × 0.4` (unknown age: 365 days)
- **breadthMult** — `1 + 0.02 × min(chains, 5)`

The board covers the whole 40-protocol watchlist and adds every other rankable
pre-token protocol (198 rows). Wrapped, staked and bridged products, exchanges
and versioned pools are excluded board-wide — a wrapped product of a token that
already trades is not a token still to come. Farm plans (7 steps each, with cost
and time) are derived from each protocol's own category, chains, TVL and age.

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
