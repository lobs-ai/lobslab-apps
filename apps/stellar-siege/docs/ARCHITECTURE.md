# Stellar Siege — Code Architecture

## Runtime

The browser uses vanilla ES modules and Canvas 2D. `server.mjs` serves the files
and runs multiplayer matches through Lance 5 and Socket.IO. There is no bundler.
`bin/stellar-siege` owns local start, stop, restart, status, and tests. Docker
installs production dependencies; browser test tooling stays outside the image.

## Simulation

`Game` owns a `World` containing plain nodes, players, and mote swarms. At 60Hz it
runs production, swarm movement/combat, capture fallback, and AI, then checks the
winner. Solo runs this loop locally. Multiplayer runs it only on the server.
Each world allocates its own swarm IDs, so creating a second match cannot reuse
an active match's IDs.

`SwarmSystem` steers and separates motes, annihilates hostile motes that collide,
and delivers energy on arrival. Ownership changes at the arrival that crosses
zero energy, before the attacking swarm can be removed. A wormhole transports
the fleet together and sets an exit hold point. `AISystem` uses the same swarm
creation and movement rules as human players.

## Multiplayer data flow

1. The client checks protocol compatibility during the Socket.IO handshake and
   receives its compact player ID, roster, dimensions, and match start tick.
2. Launches and redirects travel as `action` socket events and are applied on
   arrival. (Lance's own input queue holds each input until the server's step
   counter reaches the client's, which turned tick-rate drift into input lag
   that grew by seconds per minute.) The server validates ownership, launch
   ratios, and finite, bounded redirect coordinates.
3. Launch previews appear locally. Every launch carries a command ID. A rejected
   command removes its preview; a matching replicated swarm blends from the
   preview over 120ms. Previews expire if no confirmation arrives.
4. The server publishes actual mote positions and velocities at 20Hz. Stable
   mote indices survive casualties. `moteCodec.js` packs each mote into five
   UTF-16 code units (10 wire bytes), with quarter-pixel precision.
5. Each sync is applied on arrival and recorded on a server timeline
   (`ServerTimeline.js`). `ServerClock` maps local time to a fractional server
   tick: the fastest-arriving samples in a sliding window set the offset, the
   buffer is sized from observed jitter (p90) plus one sync interval, the real
   step period is estimated from long-lived anchors, and the cursor glides toward
   changes so only a stall over 250ms snaps it. `MoteTrack` interpolates motes at
   that tick, extrapolates at most 100ms, and treats teleports as discontinuities.
   Node ownership, energy, and effects resolve at the same tick, so a capture
   never shows before its fleet lands. Capture flash and pulse are client-derived.
6. Combat and wormhole effects are forwarded with their server tick. Node
   ownership and energy remain authoritative. Match completion and closure are
   explicit events.

The server steps against an absolute 60Hz schedule. Lance's scheduler times each
step from the previous step's start, so timer overshoot accumulated and the
server ran at 52-57 steps/s. Lance's idle timeout is disabled: it only counts
inputs as activity and kicked lobbies after two minutes.

The server has room-local lifecycle event queues. Lance's default shared queue
can otherwise send another room's creates/destroys to the first room synchronized.
The client applies each reliable delta in arrival order; dropping intermediate
deltas can lose fields or object lifecycle changes until a full snapshot arrives.

Both replicated classes bypass Lance 5's string-pruning implementation, which
can discard changed strings and assumes a class ID that these objects do not
set. Complete snapshot strings are sent instead.

Increment `js/net/protocol.js` whenever the binary schema or mote encoding
changes. Deploy server and browser files together; incompatible clients are
rejected instead of receiving a binary layout they cannot decode.

## Rendering and controls

`Renderer` composes the star field, swarm glow/trails, nodes, pooled effects, and
order previews. `Camera` starts with a fit of the entire battlefield and supports
cursor-centered zoom, bounded panning, and resetting with F. `InputManager`
converts screen coordinates through that same camera transform. Box selections
survive dragging a selected source; Shift-click toggles selection on release,
while Shift-drag sends all selected energy.

`SoundSystem` synthesizes bounded launch, capture, combat, and transit effects
after a user gesture. The HUD sound toggle persists the user's preference.

## Verification

- `bin/stellar-siege test`: simulation, serializer, capture, map generation,
  wormhole transit, camera/input, protocol, and server lifecycle regressions,
  including three simulated minutes with four AI factions.
- `bin/browser-test`: isolated host/guest browsers, pointer orders, roughly 180ms
  simulated RTT with jitter, stalled updates, redirects, rejection, simultaneous
  rooms, capture, match closure, zoom, combined orders, and offline recovery.
- `bin/swarm-benchmark`: a 2,400-mote fixture reporting median, p95, and worst
  frame times. Results depend on the browser and machine.

Browser screenshots are saved under `/tmp/stellar-siege-*.png`. Run a browser
script with `--build` if Chromium needs to be installed.
