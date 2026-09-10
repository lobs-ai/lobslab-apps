# Ballz — Idle Ball Factory

A chaotic idle ball factory. Click anywhere, catch bouncing balls for combos,
buy generators, trigger golden events, and eventually break reality with the
Overflow. The original dark playfield, rainbow balls, sounds, and skill tree
remain the heart of the game.

**Live:** [ballz.lobslab.com](https://ballz.lobslab.com)

Single-file static app (`index.html`) served via nginx.

## Dev

```sh
bin/ballz start          # http://localhost:47100
bin/ballz stop
bin/ballz restart        # clean dependency install, tests, then start
bin/ballz status
bin/ballz start --build  # rebuild and test before starting
bin/ballz test
bin/ballz balance        # deterministic economy simulations
bin/ballz playtest       # isolated Chrome browser tests and screenshots
```

Use `PORT=47110 bin/ballz start` for another port, and the same PORT for stop/status.
HTML changes take effect on refresh; there is no runtime build step.
The browser test needs Chrome/Chromium; set `CHROME_BIN` if it is not in a standard location.

## Progression

- A first Dropper costs 15 balls and produces 1 ball/second.
- Ordinary clicks include 2% of production. Catches build a four-second combo
  and add 1% of production per combo level, capped at 10%. Click bonuses apply
  to this catch reward too. Enter/Space on the canvas drops a ball.
- Buy 1, 10, 100, or MAX immediately. The old Bulk Buy skill now gives a 5%
  discount. Automatic ownership milestones and 80 purchased tier upgrades keep
  older machines useful.
- Nine one-time factory goals guide the opening and award spending money.
- Golden balls are guaranteed about every 90 seconds once you have clicked
  15 times or own a machine. Their upgrade halves this interval. Catch the
  moving ball or use the golden button.
- Prestige starts at 1 million balls earned this run, awards at least 5 points,
  and gives +25% permanent base production per reset. Subsequent thresholds
  grow quadratically. Build longer before resetting to earn more points.
- Skills, achievements, and claimed goals persist. Machines and purchased
  upgrades reset unless a skill explicitly preserves them.
- Offline income is 50% of normal production, up to eight hours. Idle Efficiency
  raises this to 100%. Temporary buffs do not multiply offline income.

Existing v2–v6 saves retain their progress and adopt the current balance.
Autosave runs every 15 seconds, on purchases, and when leaving the page.
Export/Import in Stats provides backups; storage failures are reported in the UI.

`index.html` is the canonical game. The older `js/` and `styles/` files are not
loaded. `game-harness.cjs` extracts the actual game for tests and simulations.
The balance simulation buys efficiently by marginal income per cost without
golden events or catches; its timings are a benchmark, not a casual-player forecast.
