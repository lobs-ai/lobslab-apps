# Ballz Royale — Turn-Based Billiards Battle Royale

## Core Concept
Pool + Fortnite + Worms. Physics-based multiplayer battle where players take turns shooting billiard balls to knock opponents into pockets or hazards while a shrinking danger circle consumes the table. Last player with balls remaining wins.

## Architecture
Single-page app with all game logic client-side (Phase 1 is local multiplayer / vs AI).
- `js/physics.js` — 2D physics engine (balls, walls, collisions, friction)
- `js/game.js` — Game state machine (turns, players, storm, win conditions)
- `js/renderer.js` — Canvas rendering (table, balls, storm, effects)
- `js/input.js` — Aiming, power, spin controls
- `js/items.js` — Item system (spawning, collection, activation)
- `js/ai.js` — AI opponent logic
- `js/audio.js` — Sound effects (optional, Phase 2)
- `index.html` — Entry point
- `css/styles.css` — UI styling

## Game Flow

### Match Setup
- 2-8 players (local hot-seat or AI)
- Each player gets colored balls based on player count:
  - 2 players: 5 balls each
  - 4 players: 4 balls each
  - 6 players: 3 balls each
  - 8 players: 2 balls each

### Arena
- Circular table (not rectangular)
- 6-8 pockets around the perimeter
- Optional bumpers/obstacles in center
- Ball spawns distributed evenly around outer ring

### Turn Flow
1. Active player selects one of their balls
2. Aim with mouse (shows trajectory preview with reflection)
3. Set power (click and drag or power bar)
4. Optional: apply spin (L/R english)
5. Optional: use collected item
6. Shoot — physics simulates until all balls stop
7. Check eliminations (balls in pockets / off table)
8. Next player's turn

### Storm (Shrinking Circle)
- Every N rounds, safe zone shrinks
- Outside the zone: inward physics force (not damage)
- Creates curved trajectories and forces confrontation
- Visual: glowing energy ring / neon border

| Rounds | Circle Size |
|--------|-------------|
| 1-4    | 100%        |
| 5-8    | 80%         |
| 9-12   | 60%         |
| 13-16  | 40%         |
| 17+    | 20%         |

### Items
Items spawn on table. Collecting = your ball touches one.
- **Bomb Shot** — ball explodes on first collision, massive knockback
- **Heavy Ball** — 3× mass, bulldozes everything
- **Ghost Ball** — passes through other balls once
- **Teleport Shot** — ball teleports to random position after first hit
- **Grapple Shot** — ball pulls toward first ball it hits

### Win Condition
Last player with balls on the table wins.

## Physics Details
- Ball-ball elastic collisions with mass
- Ball-wall reflections with dampening
- Friction (rolling + sliding)
- Spin affects post-collision trajectory
- Pockets = circular zones that capture balls entering them
- Storm force = radial inward force on balls outside safe zone

## Visual Style
- Dark table with neon accents
- Glowing ball trails
- Particle effects on collisions
- Slow-motion on eliminations
- Storm ring with animated energy effect
