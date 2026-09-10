# Stellar Siege

Fast-paced cosmic RTS where you command stars that generate solar plasma, sending streams of energy to conquer planets and dominate entire star systems.

**Play:** [stellar-siege.lobslab.com](https://stellar-siege.lobslab.com)

## Quick Start

```bash
bin/stellar-siege start
# Open http://localhost:47104
```

Use `bin/stellar-siege restart` to rebuild and restart, `stop` to shut down,
`status` to check the server, and `test` to run the regression suite.

## Docs

- [Game Design Document](docs/DESIGN.md)
- [Code Architecture](docs/ARCHITECTURE.md)

## Controls

Drag an owned node to send half its energy. Hold Shift for all or Ctrl/Cmd for
25%. Box-select several nodes to launch a combined attack. Drag a moving swarm
to redirect it to another node or a hold position. Right-click cancels an order. Scroll to zoom around the cursor, middle-drag to
pan, and press F to fit the whole map again.
The attack preview shows the current defense requirement; reinforcements and
production can change it before arrival. Wormholes transport the entire fleet.

## Multiplayer verification

`bin/browser-test` runs two isolated Chromium clients against the local server.
Its Chromium dependency is installed by `bin/stellar-siege start --build`. Set `GAME_URL`
to target another development server. It checks pointer input, ~180ms simulated
round-trip latency with jitter, a 400ms client stall, prediction handoff,
redirects, rejected commands, room isolation, captures, and solo restart.
Screenshots are written to `/tmp/stellar-siege-*.png`. If Chromium is missing,
run `bin/browser-test --build` once to install it.

The server simulates at 60Hz against an absolute schedule and sends mote
snapshots at 20Hz. Commands are applied the moment they reach the server.
Clients render nodes, motes and effects at one server tick that trails the
newest snapshot by an adaptive buffer (observed jitter plus one snapshot
interval, 90-400ms) and stop extrapolating after 100ms without a new sample.
Each mote costs 10 bytes of position data per snapshot. Launch previews
reconcile by command ID; combat stays authoritative. Deploy the server and
client together because the replication schema changed.

`bin/swarm-benchmark` measures frame times with a 2,400-mote battle fixture and
saves `/tmp/stellar-siege-stress.png`.
