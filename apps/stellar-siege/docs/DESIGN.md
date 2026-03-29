# Stellar Siege — Game Design Document

## Overview

**Genre:** Real-Time Strategy / Territory Control
**Platform:** Web (lobslab.com) → potential Steam/mobile later
**Session Length:** 5–10 minutes
**Players:** 1–4 (local + AI)
**Inspiration:** Auralux, Galcon, Eufloria, Microcosmum

## Core Hook

A fast-paced cosmic RTS where players command stars that generate solar plasma, sending streams of energy to conquer planets, collapse black holes, and dominate entire star systems.

## Victory & Defeat

- **Win:** Control all nodes in the star system
- **Lose:** Own zero nodes

---

## Core Gameplay Loop

### 1. Production
Stars and planets generate energy plasma continuously:
```
node.energy += production_rate * delta_time
```
Energy caps at `node.max_energy`.

### 2. Expansion
Players send energy to capture neutral or enemy nodes via click-drag.

### 3. Combat
Incoming energy damages enemy node defense:
```
node.energy -= incoming_energy
```
When energy reaches zero, ownership flips to the attacker with remaining energy.

### 4. Snowball
More nodes = more production. Players balance attacking, defending, and upgrading.

---

## Controls

| Action | Input |
|--------|-------|
| Select node | Left click |
| Send energy | Click + drag to target |
| Send 50% (default) | Drag |
| Send 100% | Shift + drag |
| Send 25% | Ctrl + drag |
| Cancel stream | Right click |
| Multi-select | Click multiple owned nodes, then drag to target |

---

## Node Types

### ⭐ Star (Primary Base)
Main production node. Strong economy, can upgrade.
- **Production:** High (8/s)
- **Defense:** Medium
- **Capacity:** High (200)
- **Visual:** Glowing star with solar flare particles

### 🪐 Planet
Secondary expansion target. Cheaper to capture.
- **Production:** Medium (4/s)
- **Defense:** Medium
- **Capacity:** Medium (120)
- **Visual:** Colored sphere with atmospheric glow

### ☄ Asteroid Cluster
High-risk, high-reward resource node.
- **Production:** Very High (12/s)
- **Defense:** Low
- **Capacity:** Low (60)
- **Visual:** Cluster of rocky debris with mineral glow

### 🌑 Black Hole
Late-game strategic node with gravity field.
- **Production:** Very High (10/s)
- **Defense:** High
- **Capacity:** High (250)
- **Special:** `gravity_field` — nearby enemy streams slowed by 40%
- **Visual:** Dark void with accretion disk and gravitational lensing

### ☁ Nebula Node
Utility/stealth node.
- **Production:** Low (2/s)
- **Defense:** Medium
- **Capacity:** Medium (100)
- **Special:** `stealth_field` — enemy streams hidden while inside radius
- **Visual:** Soft colorful cloud with particles

---

## Node Data Model

```
Node {
  id: number
  type: 'star' | 'planet' | 'asteroid' | 'blackhole' | 'nebula'
  owner: number | null          // player ID or null (neutral)
  energy: number
  maxEnergy: number
  productionRate: number
  defense: number               // damage reduction multiplier
  position: { x, y }
  radius: number                // visual + interaction radius
  upgradeLevel: number          // 0 = none
  upgrade: 'overcharge' | 'shield' | 'cannon' | null
}
```

---

## Energy Streams

Streams represent energy flowing between nodes.

```
Stream {
  id: number
  owner: number
  sourceNode: number
  targetNode: number
  amount: number                // total energy being sent
  currentEnergy: number         // energy remaining in transit
  speed: number
  position: { x, y }           // current head position
  particles: []                 // visual particle trail
}
```

Movement: `position += direction * speed * dt`

Streams are visible to all players (except in nebula stealth fields). Energy arrives over time as particles reach the target, not all at once.

---

## Node Upgrades

Each node can receive ONE upgrade. Cost: `node.maxEnergy * 0.5` (deducted from current energy).

### ⚡ Overcharge
- +50% production rate
- -20% defense
- Good for: economic nodes behind the front line

### 🛡 Shield Matrix
- +50% defense
- -20% production rate
- Good for: defensive choke points

### 🚀 Pulse Cannon
- Auto-attacks nearby enemy streams (damages passing streams)
- Range: 150px
- DPS: 5/s
- Good for: area denial, protecting key routes

---

## Environmental Mechanics

### Solar Storm (Random Event)
- +100% production for ALL nodes for 10 seconds
- Occurs every ~120 seconds (±30s random)
- Visual: screen-wide golden pulse, particle effects

### Gravity Fields
- All black holes + large planets exert gravity
- Energy streams curve around gravitational bodies
- Creates strategic pathing — some routes are faster than others

### Nebula Clouds
- Large fog regions on the map
- Stream speed -30% inside
- Enemy streams become invisible while in nebula
- Creates fog-of-war zones

---

## Map Generation

Procedural star system generation.

### Target Distribution (for ~50 node maps)
| Type | Count | Notes |
|------|-------|-------|
| Stars | 4–6 | Evenly distributed, 1 per player minimum |
| Planets | 20–25 | Bulk of the map |
| Asteroids | 8–12 | Clustered in belts |
| Black Holes | 1–3 | Central or contested positions |
| Nebula Nodes | 5–8 | Grouped near nebula cloud regions |

### Generation Algorithm
1. Place player starting stars at equal distances from center
2. Generate star cluster centers (Poisson disk sampling)
3. Scatter planets around clusters
4. Place asteroid belts between clusters
5. Place black holes at strategic choke points
6. Generate nebula cloud regions with nebula nodes inside
7. Ensure all nodes have at least 2 reachable neighbors within stream range

---

## AI System

### Difficulty Levels
| Level | Reaction Time | Decision Quality | Aggression |
|-------|--------------|-----------------|------------|
| Easy | 3s delay | Targets nearest | Low |
| Medium | 1.5s delay | Balanced expand/defend | Medium |
| Hard | 0.5s delay | Optimal targeting, focuses production | High |

### AI Decision Loop (runs every tick at reaction_time interval)
1. Evaluate all visible nodes for attack/defense priority
2. Send expansion streams to highest-priority neutral nodes
3. Reinforce weakest owned nodes under threat
4. Upgrade key nodes when safe
5. Coordinate multi-node attacks on enemy positions

---

## Game Modes

### Skirmish (MVP)
- 1v1 to 1v3 against AI
- Procedural map
- Standard victory conditions

### Free For All
- 2–4 players (human or AI)
- Last player standing wins

### Team Battle (Stretch)
- 2v2 mode
- Shared victory condition

### Survival (Stretch)
- Player vs escalating AI waves
- Survive as long as possible

---

## UI Design

Minimalist HUD:
- **Top bar:** Player color indicator, total energy, node count, timer
- **Node hover tooltip:** Owner, energy/capacity, production rate, upgrade status
- **Upgrade panel:** Appears when clicking owned node, shows 3 upgrade options
- **Minimap:** Lower-right corner for larger maps (stretch)

---

## Visual Style

**Art direction:** Minimalist cosmic / neon-on-dark

- Deep space dark background with subtle star field
- Nodes glow with owner's color (4 distinct player colors)
- Energy streams are flowing particle trails
- Captures have burst/explosion effects
- Solar storms create screen-wide golden pulse
- Nebula regions are soft semi-transparent clouds
- Clean, readable at all times — gameplay clarity over visual complexity

### Player Colors
1. Cyan (#00e5ff)
2. Magenta (#ff00e5)
3. Gold (#ffe500)
4. Green (#00ff88)
5. Neutral: Gray (#666666)

---

## Audio Design (Stretch)

- **Music:** Ambient space synth, low-key
- **SFX:** Plasma flow whoosh, capture explosion, solar storm rumble, upgrade chime

---

## Performance Targets

- 60+ FPS with 100 nodes and 1000 active stream particles
- Canvas 2D rendering (no WebGL required for MVP)
- Lightweight enough to run on any modern browser

---

## MVP Scope (Phase 1)

What ships first:
- [x] Stars + Planets (2 node types)
- [x] Energy production + streams
- [x] Capture mechanic
- [x] Click-drag controls
- [x] 1 AI opponent (Easy/Medium)
- [x] Procedural map generation (simple)
- [x] Win/lose conditions
- [x] Basic particle effects
- [x] Game restart

### Phase 2
- Asteroid, Black Hole, Nebula node types
- All 3 upgrades
- Hard AI
- Solar storm events
- Multi-node selection

### Phase 3
- Gravity field stream curving
- Nebula fog-of-war
- 4-player FFA
- Team mode
- Sound effects

### Phase 4 (Stretch)
- WebSocket multiplayer
- Survival mode
- Cosmetics/progression
- Mobile touch controls
