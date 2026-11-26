# token-radar-entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/seijin88/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/seijin88/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A launch radar for pre-token protocols. It reads the sealed protocol snapshot, ranks every protocol that
records no token by what its launch would be worth, and hands in a static dashboard with a board, a detail
view for every protocol and a filter.

## What makes the ranking different

The house starter multiplies TVL by a flat `0.25` for every protocol. This entry **measures the multiple
instead**: every protocol that already has a token carries a market cap and a TVL in the same snapshot, so
the ratio between them is what the market has actually paid for that kind of protocol.

```
multiple(category) = (n × median(category) + 4 × median(all)) / (n + 4)

base       = tvl_usd × multiple(category)
growthMult = 1 + clamp(change_7d, −60, 120) / 100 × 0.50
maturity   = 0.55 + min(age_days, 1095) / 1095 × 0.45
breadth    = 1 + min(chains − 1, 4) × 0.03
implied    = max(1, round(base × growthMult × maturity × breadth))
```

A category with few live peers has its own median shrunk toward the median over all of them, so a sample of
three cannot swing the board. No protocol name is ever special-cased: the same functions score every row.

The board covers the house watchlist in full and every other pre-token protocol the snapshot holds — 198
rows — while leaving out the wrapped, staked, bridged and exchange products that record no new token of
their own.

## The dashboard

- **Board** — every protocol ranked by implied value, with TVL, seven-day momentum drawn from a centre
  line, age, the measured multiple and the implied value with its bar.
- **Detail view** — one click on a row opens its arithmetic: the base, each multiplier, what the value
  would be with momentum at zero, and a seven-step farm plan derived from the protocol's own category,
  chains, size and age, each step with what it costs and how long it takes.
- **Live tokens** — the calibration itself: the live protocols, their market cap over TVL, and the measured
  multiple for every category.
- **Model** — the formula, the constants, the shrinkage, and what the board does not claim.
- **Farm guide** — how to farm a pre-token protocol, and the rules that matter.

No framework, no build step, no network: the page is static files that open offline in a browser.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

That writes `board.json`, `data.js`, the dashboard and `dossier.json` into `out/`. Node 22.18 or later,
standard library only. The same snapshot always produces the same bytes.

## Layout

```
main.ts                 the entry point: read, score, write
lib/model.ts            the model: calibration, ranking, farm plans
vendor/makefun-board.ts make.fun's dossier builder, copied unchanged from the kit
dashboard/index.html    the page
dashboard/app.css       the design system
dashboard/app.js        the rendering
screenshots/            the board, a detail view, a filtered view and the model
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01).</sub>
