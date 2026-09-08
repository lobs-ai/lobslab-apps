# Ballz Royale

Pocket the other colors and keep your balls inside the shrinking storm. The last surviving color wins.

- **Play now:** you versus three bots, with a bomb to start.
- **Pass & play:** 2–4 people or bots sharing one screen.
- **Play online:** create a room and share its code. Online uses the circular arena and server-authoritative shot replays.

Drag a ball backward and release to shoot. Pull farther for more power. The white guide shows first contact; the gold line shows the direction an opponent will be pushed (local play). Press Escape or right-click to cancel. Select a power-up before shooting to use it.

In local play, the storm closes every four rounds. Bring exposed balls inside during your turn: your balls outside the safe zone are lost when your turn ends.

## Run locally

```sh
bin/ballz-royale start
bin/ballz-royale status
bin/ballz-royale restart
bin/ballz-royale stop
```

Open http://localhost:47101. `start --build` reinstalls dependencies with `npm ci`; `restart` always does this. Source files are served directly, so there is no frontend bundle step. Set `PORT` to choose another port. Runtime logs are in `.runtime/server.log`.

The older individual scripts remain for compatibility, including the Docker deployment scripts.

## Verify

```sh
bin/check
bin/check-online
```

`bin/check` runs physics and power-up regression tests. The online smoke test requires the local server and verifies two clients joining, matching replays, and turn advancement.

With Vibium installed and its active browser page on this game, `bin/check-browser` runs complete 2-, 3-, and 4-player matches, checks spawn placement, shot input, bot turn locking, and cleanup. It resets the current match. Repeat at desktop and mobile viewport sizes to check both table layouts.
