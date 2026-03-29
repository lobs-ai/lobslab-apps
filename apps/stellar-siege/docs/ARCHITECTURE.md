# Stellar Siege — Code Architecture

## Tech Stack

- **Rendering:** HTML5 Canvas 2D
- **Language:** Vanilla JavaScript (ES modules)
- **Server:** Node.js static file server (lobslab template)
- **Build:** None — no bundler, no framework, just files
- **Deployment:** Docker → Traefik → stellar-siege.lobslab.com

No dependencies. No npm packages. Pure browser JS with Canvas.

---

## File Structure

```
stellar-siege/
├── server.mjs                  # Static file server (from template)
├── Dockerfile                  # Docker container
├── package.json
├── index.html                  # Entry point, canvas + UI
├── docs/
│   ├── DESIGN.md               # Game design document
│   └── ARCHITECTURE.md         # This file
├── css/
│   ├── main.css                # Layout, canvas, base styles
│   └── ui.css                  # HUD, tooltips, menus
└── js/
    ├── main.js                 # Entry point — init, game loop
    ├── game/
    │   ├── Game.js             # Top-level game state machine
    │   ├── World.js            # Contains all entities, handles ticks
    │   ├── Node.js             # Node entity (star, planet, etc.)
    │   ├── Stream.js           # Energy stream between nodes
    │   └── Player.js           # Player state (color, owned nodes, stats)
    ├── systems/
    │   ├── ProductionSystem.js # Tick energy production for all nodes
    │   ├── StreamSystem.js     # Move streams, handle arrival/combat
    │   ├── CaptureSystem.js    # Resolve captures when energy hits 0
    │   ├── UpgradeSystem.js    # Handle node upgrades
    │   ├── AISystem.js         # AI decision-making
    │   └── EventSystem.js      # Solar storms, random events
    ├── map/
    │   ├── MapGenerator.js     # Procedural map generation
    │   └── MapTemplates.js     # Preset map configs (node counts, etc.)
    ├── render/
    │   ├── Renderer.js         # Main render orchestrator
    │   ├── NodeRenderer.js     # Draw nodes (stars, planets, etc.)
    │   ├── StreamRenderer.js   # Draw energy streams + particles
    │   ├── BackgroundRenderer.js  # Star field, nebula clouds
    │   ├── UIRenderer.js       # HUD, tooltips, selection indicators
    │   └── ParticlePool.js     # Object pool for particle effects
    ├── input/
    │   ├── InputManager.js     # Mouse/keyboard event handling
    │   └── DragHandler.js      # Click-drag stream creation
    ├── ui/
    │   ├── HUD.js              # Top bar (energy, nodes, timer)
    │   ├── UpgradePanel.js     # Node upgrade selection UI
    │   ├── GameOverScreen.js   # Win/loss screen
    │   └── MenuScreen.js       # Start menu, settings
    └── utils/
        ├── math.js             # Vector math, distance, lerp
        ├── constants.js        # Game balance constants
        └── colors.js           # Player colors, node type colors
```

---

## Architecture Overview

### ECS-Lite Pattern

Not a full Entity-Component-System, but inspired by it. Entities (Nodes, Streams, Players) are plain data objects. Systems operate on collections of entities each tick. This keeps logic separated from data and rendering.

```
Game Loop (60fps)
  │
  ├── Input Phase
  │   └── InputManager processes mouse/keyboard → queues actions
  │
  ├── Update Phase (fixed timestep)
  │   ├── ProductionSystem.update(world, dt)
  │   ├── StreamSystem.update(world, dt)
  │   ├── CaptureSystem.update(world, dt)
  │   ├── UpgradeSystem.update(world, dt)
  │   ├── AISystem.update(world, dt)
  │   └── EventSystem.update(world, dt)
  │
  └── Render Phase
      ├── BackgroundRenderer.draw(ctx)
      ├── NodeRenderer.draw(ctx, world.nodes)
      ├── StreamRenderer.draw(ctx, world.streams)
      ├── UIRenderer.draw(ctx, world, input)
      └── ParticlePool.draw(ctx)
```

### Fixed Timestep

Game simulation runs at a fixed timestep (60 ticks/sec) decoupled from rendering. This ensures deterministic behavior regardless of frame rate.

```javascript
const TICK_RATE = 1 / 60;
let accumulator = 0;

function loop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  accumulator += dt;

  while (accumulator >= TICK_RATE) {
    update(TICK_RATE);
    accumulator -= TICK_RATE;
  }

  render(accumulator / TICK_RATE);  // interpolation factor
  requestAnimationFrame(loop);
}
```

---

## Key System Details

### Game.js — State Machine

```
States: MENU → LOADING → PLAYING → PAUSED → GAME_OVER
```

Manages transitions, holds World reference, coordinates systems.

### World.js — Entity Container

```javascript
class World {
  nodes = []          // All Node entities
  streams = []        // Active Stream entities
  players = []        // Player objects
  events = []         // Active environmental events
  time = 0            // Game elapsed time
  
  getNodeById(id) { ... }
  getNodesByOwner(playerId) { ... }
  addStream(stream) { ... }
  removeStream(id) { ... }
}
```

### Node.js — Entity Data

```javascript
function createNode(config) {
  return {
    id: nextId++,
    type: config.type,          // 'star' | 'planet' | 'asteroid' | 'blackhole' | 'nebula'
    owner: config.owner ?? null,
    energy: config.energy ?? 0,
    maxEnergy: NODE_DEFAULTS[config.type].maxEnergy,
    productionRate: NODE_DEFAULTS[config.type].productionRate,
    defense: NODE_DEFAULTS[config.type].defense,
    position: config.position,
    radius: NODE_DEFAULTS[config.type].radius,
    upgrade: null,
    upgradeLevel: 0,
  };
}
```

Nodes are plain objects, not classes. Systems mutate them directly.

### Stream.js — Energy in Transit

```javascript
function createStream(source, target, amount, owner) {
  return {
    id: nextId++,
    owner,
    sourceId: source.id,
    targetId: target.id,
    totalEnergy: amount,
    deliveredEnergy: 0,
    position: { ...source.position },
    speed: STREAM_SPEED,
    alive: true,
    particles: [],
  };
}
```

Streams move from source to target. Energy is delivered incrementally as particles arrive (not all at once). This creates a continuous flow visual.

### ProductionSystem.js

```javascript
function update(world, dt) {
  for (const node of world.nodes) {
    if (node.owner === null) continue;
    
    let rate = node.productionRate;
    if (node.upgrade === 'overcharge') rate *= 1.5;
    if (node.upgrade === 'shield') rate *= 0.8;
    
    // Solar storm bonus
    if (world.events.some(e => e.type === 'solar_storm' && e.active)) {
      rate *= 2;
    }
    
    node.energy = Math.min(node.energy + rate * dt, node.maxEnergy);
  }
}
```

### StreamSystem.js

Handles stream movement, particle spawning, energy delivery, and combat resolution:

1. Move stream head toward target
2. Spawn trail particles along path
3. When particles reach target:
   - If friendly: add energy (up to max)
   - If enemy/neutral: subtract energy (modified by defense)
4. If target energy ≤ 0: flag for capture
5. Remove streams when all energy delivered

### CaptureSystem.js

When a node's energy is driven to 0 by an enemy stream:
1. Set `node.owner = stream.owner`
2. Set `node.energy = abs(overflow)` (remaining attack energy)
3. Clear any upgrade on the node
4. Emit capture event (for particles/sound)

### AISystem.js

```javascript
class AIController {
  difficulty = 'medium'
  reactionTimer = 0
  
  update(world, playerId, dt) {
    this.reactionTimer -= dt;
    if (this.reactionTimer > 0) return;
    this.reactionTimer = DIFFICULTY_REACTION[this.difficulty];
    
    const myNodes = world.getNodesByOwner(playerId);
    if (myNodes.length === 0) return; // eliminated
    
    // 1. Find best target (neutral or weakest enemy node in range)
    // 2. Pick source node with most energy
    // 3. Create stream if worthwhile
    // 4. Reinforce any threatened nodes
    // 5. Upgrade if safe
  }
}
```

AI evaluates nodes with a simple scoring function:
```
score = (target.productionRate * 10) + (target.maxEnergy * 0.5) - (target.energy * 2) - (distance * 0.1)
```

### MapGenerator.js

```javascript
function generateMap(config) {
  const { playerCount, nodeCount, width, height } = config;
  
  // 1. Place player starts (evenly spaced on a circle around center)
  // 2. Poisson disk sampling for remaining positions (min distance between nodes)
  // 3. Assign node types based on distance from center + randomness
  // 4. Ensure connectivity (every node reachable within 2 hops)
  // 5. Assign player starting nodes (1 star each, nearby planets)
  
  return { nodes, width, height };
}
```

### InputManager.js

Captures mouse events on the canvas, converts to world coordinates, and provides:
- `hoveredNode` — node under cursor
- `selectedNodes` — currently selected owned nodes
- `dragTarget` — node being dragged to (for stream creation)
- `isDragging` — whether a drag is in progress

### Renderer.js

Orchestrates all rendering. Each sub-renderer draws to a shared Canvas 2D context.

```javascript
class Renderer {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.background = new BackgroundRenderer();
    this.nodes = new NodeRenderer();
    this.streams = new StreamRenderer();
    this.ui = new UIRenderer();
    this.particles = new ParticlePool(2000); // max particles
  }
  
  draw(world, input, interpolation) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.background.draw(this.ctx, world);
    this.streams.draw(this.ctx, world.streams, interpolation);
    this.nodes.draw(this.ctx, world.nodes, input, interpolation);
    this.particles.draw(this.ctx);
    this.ui.draw(this.ctx, world, input);
  }
}
```

### ParticlePool.js

Object pool to avoid GC pressure. Pre-allocates N particles, recycles dead ones.

```javascript
class ParticlePool {
  pool = []
  activeCount = 0
  
  spawn(x, y, vx, vy, color, lifetime) { ... }
  update(dt) { ... }
  draw(ctx) { ... }
}
```

---

## Game Balance Constants (constants.js)

All tunable values in one place:

```javascript
export const NODE_DEFAULTS = {
  star:      { productionRate: 8,  maxEnergy: 200, defense: 1.0, radius: 30 },
  planet:    { productionRate: 4,  maxEnergy: 120, defense: 1.0, radius: 22 },
  asteroid:  { productionRate: 12, maxEnergy: 60,  defense: 0.6, radius: 16 },
  blackhole: { productionRate: 10, maxEnergy: 250, defense: 1.4, radius: 35 },
  nebula:    { productionRate: 2,  maxEnergy: 100, defense: 1.0, radius: 24 },
};

export const STREAM_SPEED = 120;          // pixels per second
export const SEND_RATIO_DEFAULT = 0.5;
export const SEND_RATIO_SHIFT = 1.0;
export const SEND_RATIO_CTRL = 0.25;

export const UPGRADE_COST_RATIO = 0.5;   // fraction of maxEnergy

export const SOLAR_STORM_INTERVAL = 120;  // seconds
export const SOLAR_STORM_DURATION = 10;   // seconds
export const SOLAR_STORM_VARIANCE = 30;   // ± seconds

export const AI_REACTION = {
  easy: 3.0,
  medium: 1.5,
  hard: 0.5,
};
```

---

## Rendering Approach

### Node Rendering
Each node type has a distinct draw function:
- **Stars:** Radial gradient (white center → player color), subtle pulsing glow, occasional flare particles
- **Planets:** Solid circle with atmospheric gradient ring
- **Asteroids:** Cluster of small irregular circles
- **Black Holes:** Dark center with bright accretion disk ring, distortion effect
- **Nebula:** Soft, blurred cloud shape with slow color shift

### Stream Rendering
- Continuous particle trail from source to target
- Particles are small circles with glow (using `shadowBlur`)
- Color matches owner
- Density proportional to stream energy amount
- Trail fades over distance

### Background
- Static star field (generated once, drawn from offscreen canvas)
- Subtle parallax effect on camera movement (stretch)
- Nebula cloud regions as soft radial gradients

---

## Camera System (Phase 2)

For larger maps, add pan/zoom:
- Mouse wheel to zoom
- Middle-click drag or edge scroll to pan
- World coordinates → screen coordinates transform
- Minimap in corner

For MVP, the map fits the canvas (no camera needed).

---

## Implementation Order

### Sprint 1: Foundation (Day 1–2)
1. `main.js` — game loop with fixed timestep
2. `constants.js` + `math.js` + `colors.js`
3. `Node.js` + `Player.js` — entity creation
4. `World.js` — entity container
5. `Game.js` — state machine (MENU → PLAYING → GAME_OVER)
6. `Renderer.js` + `BackgroundRenderer.js` — canvas setup, star field
7. `NodeRenderer.js` — draw stars + planets

### Sprint 2: Core Mechanics (Day 3–4)
1. `InputManager.js` + `DragHandler.js` — click/drag on nodes
2. `ProductionSystem.js` — energy generation
3. `Stream.js` + `StreamSystem.js` — energy flow
4. `StreamRenderer.js` — particle trails
5. `CaptureSystem.js` — ownership changes
6. `UIRenderer.js` — energy bars on nodes, selection indicators

### Sprint 3: Playable Game (Day 5–6)
1. `MapGenerator.js` — procedural star system
2. `AISystem.js` — basic AI opponent
3. `HUD.js` — top bar with stats
4. `GameOverScreen.js` — win/loss detection + display
5. `MenuScreen.js` — start game with settings
6. `ParticlePool.js` — capture explosions, production sparkles

### Sprint 4: Polish (Day 7–8)
1. Visual polish — glow effects, animations, smooth transitions
2. Balance tuning — production rates, AI difficulty, map generation
3. `UpgradeSystem.js` + `UpgradePanel.js` — node upgrades
4. Multi-node selection (shift-click multiple nodes)
5. Sound effects (stretch)
6. Mobile touch events (stretch)

---

## Performance Strategy

- **Object pooling** for particles and streams (no allocation during gameplay)
- **Offscreen canvas** for static background (drawn once)
- **Spatial partitioning** if needed (grid-based, for >100 nodes)
- **Batch rendering** — group draw calls by type
- **No DOM manipulation** during gameplay — everything on canvas
- **requestAnimationFrame** with time-based updates

---

## Testing Strategy

No test framework (it's a game, not a service). Testing approach:
- **Balance sandbox:** Press `B` to enter sandbox mode (spawn nodes, adjust values)
- **Debug overlay:** Press `F3` to show FPS, node count, stream count, AI state
- **Console API:** Expose `window.game` for live debugging
- **Speed controls:** Press `1-3` to adjust game speed (1x, 2x, 4x)
