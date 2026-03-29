import { BackgroundRenderer } from './BackgroundRenderer.js';
import { NodeRenderer } from './NodeRenderer.js';
import { StreamRenderer } from './StreamRenderer.js';
import { ParticlePool } from './ParticlePool.js';
import { getOwnerColor, hexAlpha } from '../utils/colors.js';
import { PARTICLE_POOL_SIZE } from '../utils/constants.js';

/**
 * Renderer — main render orchestrator.
 *
 * Owns the canvas context and all sub-renderers. Each frame:
 *   clear → background → streams → nodes → particles → UI overlay
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Device pixel ratio for crisp rendering on HiDPI displays
    this.dpr = window.devicePixelRatio || 1;

    // Sub-renderers
    this.particles    = new ParticlePool(PARTICLE_POOL_SIZE);
    this.background   = new BackgroundRenderer();
    this.nodeRenderer = new NodeRenderer(this.particles);
    this.streamRenderer = new StreamRenderer(this.particles);

    // Internal time accumulator for background animation
    this._time = 0;
    this._lastDt = 0;

    // Resize once, then listen for future resizes
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // -------------------------------------------------------------------------
  // Sizing
  // -------------------------------------------------------------------------

  _resize() {
    const dpr = this.dpr;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Physical pixel dimensions
    this.canvas.width  = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);

    // CSS dimensions (logical pixels)
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';

    // Scale context so all drawing is in logical pixels
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Logical size for use by sub-renderers
    this.width  = w;
    this.height = h;

    // Regenerate static starfield background at new logical size
    this.background.generate(w, h);
  }

  // -------------------------------------------------------------------------
  // Main draw
  // -------------------------------------------------------------------------

  /**
   * Draw one frame.
   *
   * @param {World}        world         - game world
   * @param {InputManager} inputManager  - current input state
   * @param {number}       interpolation - fraction [0,1] between last two ticks
   * @param {number}       [dt=0]        - elapsed seconds since last frame
   */
  draw(world, inputManager, interpolation, dt = 0) {
    const ctx  = this.ctx;
    const w    = this.width;
    const h    = this.height;

    // Accumulate time for animations
    this._time += dt;
    this._lastDt = dt;

    // Use world time for simulation-linked animations
    const simTime = world.time;

    // 1. Clear
    ctx.clearRect(0, 0, w, h);

    // 2. Background (static starfield + twinkle)
    this.background.draw(ctx, simTime);

    // 3. Streams — pass highlighted stream id for redirect visual feedback
    const highlightedStreamId = (inputManager && inputManager.isRedirecting && inputManager.selectedStream)
      ? inputManager.selectedStream.id
      : null;
    this.streamRenderer.draw(ctx, world, simTime, dt, highlightedStreamId);

    // 4. Nodes
    //    NodeRenderer.draw(ctx, world, hoveredNode, selectedNode, time)
    //    We pass the first selected node as "selectedNode" for the ring,
    //    but also highlight all selected nodes manually after.
    const hovered  = inputManager ? inputManager.hoveredNode : null;
    const selected = inputManager && inputManager.selectedNodes.length > 0
      ? inputManager.selectedNodes[0]
      : null;

    this.nodeRenderer.draw(ctx, world, hovered, selected, simTime);

    // Highlight extra selected nodes beyond the first
    if (inputManager && inputManager.selectedNodes.length > 1) {
      this._drawExtraSelections(ctx, inputManager.selectedNodes, simTime);
    }

    // 5. Particles
    this.particles.update(dt);
    this.particles.draw(ctx);

    // 6. UI overlay
    if (inputManager) {
      this._drawUIOverlay(ctx, world, inputManager, simTime);
    }
  }

  // -------------------------------------------------------------------------
  // Extra selection rings (nodes 2..N in selectedNodes)
  // -------------------------------------------------------------------------

  _drawExtraSelections(ctx, selectedNodes, time) {
    // Skip index 0 — already drawn by NodeRenderer
    for (let i = 1; i < selectedNodes.length; i++) {
      const node  = selectedNodes[i];
      const color = getOwnerColor(node.owner);
      const r     = node.radius + 7;
      const { x, y } = node.position;

      ctx.save();
      ctx.globalAlpha  = 0.9;
      ctx.strokeStyle  = color;
      ctx.lineWidth    = 2.5;
      ctx.shadowBlur   = 12;
      ctx.shadowColor  = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // UI overlay: drag line + tooltip
  // -------------------------------------------------------------------------

  _drawUIOverlay(ctx, world, inputManager, time) {
    const mouse = inputManager.getMousePos();

    // --- Stream redirect preview ---
    if (inputManager.isRedirecting && inputManager.selectedStream) {
      this._drawRedirectLine(ctx, world, inputManager.selectedStream, mouse, time);
    }

    // --- Drag preview line (only when not redirecting) ---
    if (inputManager.isDragging && inputManager.dragStartNode && !inputManager.isRedirecting) {
      this._drawDragLine(ctx, inputManager.dragStartNode, mouse, inputManager, time);
    }

    // --- Box selection rectangle ---
    if (inputManager.boxSelectRect) {
      const r = inputManager.boxSelectRect;
      const x = Math.min(r.x1, r.x2);
      const y = Math.min(r.y1, r.y2);
      const w = Math.abs(r.x2 - r.x1);
      const h = Math.abs(r.y2 - r.y1);

      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle   = 'rgba(0, 229, 255, 0.05)';
      ctx.globalAlpha = 1;
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // --- Tooltip ---
    if (inputManager.hoveredNode && !inputManager.isDragging && !inputManager.isRedirecting) {
      this._drawTooltip(ctx, inputManager.hoveredNode, mouse);
    }
  }

  // -------------------------------------------------------------------------
  // Redirect line
  // -------------------------------------------------------------------------

  /**
   * Draw the stream-redirect overlay:
   *  - A white/cyan pulsing highlight ring around the selected stream's head
   *  - A dashed cyan line from the stream head to the mouse cursor
   *  - A "REDIRECT" label near the cursor
   */
  _drawRedirectLine(ctx, world, stream, mouse, time) {
    const hx = stream.headX;
    const hy = stream.headY;
    const tx = mouse.x;
    const ty = mouse.y;

    const REDIRECT_COLOR = '#00ffff';

    // Don't draw if cursor is right on the head
    const dx = tx - hx;
    const dy = ty - hy;
    if (dx * dx + dy * dy < 25) return;

    ctx.save();

    // --- Pulsing highlight ring around stream head ---
    const pulse = 0.55 + 0.45 * Math.sin(time * 6);
    ctx.beginPath();
    ctx.arc(hx, hy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.globalAlpha = pulse * 0.9;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = REDIRECT_COLOR;
    ctx.stroke();

    // Outer glow along redirect line
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = REDIRECT_COLOR;
    ctx.lineWidth   = 5;
    ctx.globalAlpha = 0.12;
    ctx.shadowBlur  = 0;
    ctx.setLineDash([]);
    ctx.stroke();

    // Dashed inner redirect line
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = REDIRECT_COLOR;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = REDIRECT_COLOR;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -(time * 50) % 13;
    ctx.stroke();

    // Arrow head at cursor
    const len  = Math.sqrt(dx * dx + dy * dy);
    const nx   = dx / len;
    const ny   = dy / len;
    const ax   = tx - nx * 12;
    const ay   = ty - ny * 12;
    const perpX = -ny * 5;
    const perpY =  nx * 5;

    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ax + perpX, ay + perpY);
    ctx.lineTo(ax - perpX, ay - perpY);
    ctx.closePath();
    ctx.fillStyle   = REDIRECT_COLOR;
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = REDIRECT_COLOR;
    ctx.fill();

    // "REDIRECT" label near cursor
    ctx.font         = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 6;
    ctx.shadowColor  = REDIRECT_COLOR;
    ctx.fillStyle    = '#ffffff';
    ctx.globalAlpha  = 0.9;
    ctx.fillText('REDIRECT', tx + 14, ty - 14);

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Drag line
  // -------------------------------------------------------------------------

  _drawDragLine(ctx, sourceNode, mouse, inputManager, time) {
    const sx   = sourceNode.position.x;
    const sy   = sourceNode.position.y;
    const tx   = mouse.x;
    const ty   = mouse.y;
    const color = getOwnerColor(sourceNode.owner);

    // Don't draw if cursor is right on the source
    const dx = tx - sx;
    const dy = ty - sy;
    if (dx * dx + dy * dy < 100) return;

    ctx.save();

    // Outer glow
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 5;
    ctx.globalAlpha = 0.15;
    ctx.setLineDash([]);
    ctx.stroke();

    // Dashed inner line
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = color;
    ctx.setLineDash([8, 5]);
    // Animate dash offset so it "flows" toward the target
    ctx.lineDashOffset = -(time * 40) % 13;
    ctx.stroke();

    // Arrow head at cursor end
    const len  = Math.sqrt(dx * dx + dy * dy);
    const nx   = dx / len;
    const ny   = dy / len;
    const ax   = tx - nx * 12;
    const ay   = ty - ny * 12;
    const perpX = -ny * 5;
    const perpY =  nx * 5;

    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ax + perpX, ay + perpY);
    ctx.lineTo(ax - perpX, ay - perpY);
    ctx.closePath();
    ctx.fillStyle  = color;
    ctx.globalAlpha = 0.85;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = color;
    ctx.fill();

    ctx.restore();

    // Show send ratio hint near cursor
    this._drawSendRatioHint(ctx, mouse, inputManager, color);
  }

  _drawSendRatioHint(ctx, mouse, inputManager, color) {
    const ratio   = inputManager.getSendRatio();
    const pct     = Math.round(ratio * 100);
    const label   = `${pct}%`;
    const tx      = mouse.x + 14;
    const ty      = mouse.y - 14;

    ctx.save();
    ctx.font         = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur   = 6;
    ctx.shadowColor  = color;
    ctx.fillStyle    = color;
    ctx.globalAlpha  = 0.9;
    ctx.fillText(label, tx, ty);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Tooltip
  // -------------------------------------------------------------------------

  _drawTooltip(ctx, node, mouse) {
    const typeLabel = node.type.charAt(0).toUpperCase() + node.type.slice(1);
    const energy    = Math.floor(node.energy);
    const maxEnergy = node.maxEnergy;
    const rate      = node.productionRate.toFixed(1);
    const color     = getOwnerColor(node.owner);

    const lines = [
      typeLabel,
      `⚡ ${energy} / ${maxEnergy}`,
      `+${rate}/s`,
    ];
    if (node.upgrade) {
      lines.push(`[${node.upgrade}]`);
    }

    const PAD   = 10;
    const LH    = 18;
    const W     = 130;
    const H     = PAD * 2 + lines.length * LH;

    // Position tooltip to the right of cursor, nudge left if near edge
    let tx = mouse.x + 16;
    let ty = mouse.y - H / 2;
    if (tx + W > this.width  - 8) tx = mouse.x - W - 10;
    if (ty < 4)                   ty = 4;
    if (ty + H > this.height - 4) ty = this.height - H - 4;

    ctx.save();

    // Background panel
    ctx.globalAlpha = 0.88;
    ctx.fillStyle   = '#0a0a18';
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = color;
    _roundRect(ctx, tx, ty, W, H, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';

    lines.forEach((line, i) => {
      if (i === 0) {
        // Title line: node type in owner color
        ctx.font      = 'bold 13px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = color;
      } else {
        ctx.font      = '11px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#ccddee';
      }
      ctx.fillText(line, tx + PAD, ty + PAD + i * LH);
    });

    ctx.restore();
  }
}

// ---- Helpers ----------------------------------------------------------------

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
