import { getOwnerColor } from '../utils/colors.js';
import { NODE_DEFAULTS } from '../utils/constants.js';

/**
 * NodeRenderer — draws all nodes with glow, energy bars, and selection rings.
 *
 * Visual language:
 *   Stars:       Radial gradient, pulsing glow, large
 *   Planets:     Solid with atmosphere rim, medium
 *   Asteroids:   Rough polygon look, small, dim
 *   Nebulae:     Soft cloud shape, slightly larger
 *   Black holes: Dark with accretion ring glow
 */
export class NodeRenderer {
  constructor(particlePool) {
    this.particles = particlePool;
    // Track previous capture flash state to spawn burst particles
    this._prevFlash = new Map();
  }

  draw(ctx, world, hoveredNode, selectedNode, time) {
    for (const node of world.nodes) {
      this._drawNode(ctx, node, hoveredNode, selectedNode, time, world);

      // Spawn capture burst particles
      if (node.captureFlash > 0.9) {
        const prev = this._prevFlash.get(node.id) || 0;
        if (prev <= 0.9 && this.particles) {
          const color = getOwnerColor(node.owner);
          this.particles.spawnBurst(
            node.position.x, node.position.y,
            color, 20, 120, 0.8
          );
        }
      }
      this._prevFlash.set(node.id, node.captureFlash);
    }
  }

  _drawNode(ctx, node, hoveredNode, selectedNode, time, world) {
    const { x, y } = node.position;
    const r = node.radius;
    const color = getOwnerColor(node.owner);
    const isSelected = selectedNode && selectedNode.id === node.id;
    const isHovered = hoveredNode && hoveredNode.id === node.id;
    const isOwned = node.owner !== null;

    // --- Capture flash overlay (drawn under everything else) ---
    if (node.captureFlash > 0) {
      ctx.save();
      ctx.globalAlpha = node.captureFlash * 0.6;
      ctx.shadowBlur = 40 * node.captureFlash;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // --- Draw based on node type ---
    switch (node.type) {
      case 'star':      this._drawStar(ctx, node, color, time); break;
      case 'planet':    this._drawPlanet(ctx, node, color, time); break;
      case 'asteroid':  this._drawAsteroid(ctx, node, color, time); break;
      case 'nebula':    this._drawNebula(ctx, node, color, time); break;
      case 'blackhole': this._drawBlackhole(ctx, node, color, time); break;
      case 'wormhole':   this._drawWormhole(ctx, node, world, time); break;
      default:          this._drawPlanet(ctx, node, color, time); break;
    }

    // --- Selection ring ---
    if (isSelected || isHovered) {
      const ringColor = isSelected ? color : '#ffffff';
      const ringAlpha = isSelected ? 0.9 : 0.5;
      const ringWidth = isSelected ? 2.5 : 1.5;
      const ringR = r + (isSelected ? 7 : 5);
      const dashLen = isSelected ? 0 : 5; // dashed for hover, solid for selected

      ctx.save();
      ctx.globalAlpha = ringAlpha;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = ringWidth;
      ctx.shadowBlur = 12;
      ctx.shadowColor = ringColor;

      if (dashLen > 0) ctx.setLineDash([dashLen, 3]);
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // --- Energy bar ---
    this._drawEnergyBar(ctx, node, color);

    // --- Energy label (on larger nodes) ---
    if (r >= 18) {
      this._drawEnergyLabel(ctx, node, color);
    }
  }

  // ---- Type-specific draw methods ----

  _drawStar(ctx, node, color, time) {
    const { x, y } = node.position;
    const r = node.radius;
    const pulse = node.owner !== null
      ? 1 + 0.08 * Math.sin(node.pulsePhase)
      : 1;
    const rr = r * pulse;

    // Outer glow
    const outerGlow = ctx.createRadialGradient(x, y, rr * 0.2, x, y, rr * 2.5);
    outerGlow.addColorStop(0, color + '55');
    outerGlow.addColorStop(0.4, color + '22');
    outerGlow.addColorStop(1, 'transparent');
    ctx.save();
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(x, y, rr * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Core gradient
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rr);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ffffdd');
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, darken(color, 0.5));
    ctx.fillStyle = grad;
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();

    // Corona spikes for owned stars
    if (node.owner !== null) {
      this._drawCorona(ctx, x, y, rr, color, time, node.pulsePhase);
    }

    ctx.restore();
  }

  _drawCorona(ctx, x, y, r, color, time, phase) {
    const spikes = 6;
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.15 * Math.sin(phase);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + time * 0.3;
      const len = r * (1.4 + 0.2 * Math.sin(phase + i));
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPlanet(ctx, node, color, time) {
    const { x, y } = node.position;
    const r = node.radius;
    const baseColor = node.owner !== null ? color : '#556677';

    ctx.save();

    // Body
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, lighten(baseColor, 0.6));
    grad.addColorStop(0.5, baseColor);
    grad.addColorStop(1, darken(baseColor, 0.6));

    ctx.fillStyle = grad;
    ctx.shadowBlur = node.owner !== null ? 14 : 4;
    ctx.shadowColor = baseColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Atmosphere rim
    const atmoGrad = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 1.3);
    atmoGrad.addColorStop(0, 'transparent');
    atmoGrad.addColorStop(0.6, baseColor + '22');
    atmoGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = atmoGrad;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawAsteroid(ctx, node, color, time) {
    const { x, y } = node.position;
    const r = node.radius;
    const baseColor = node.owner !== null ? color : '#444455';

    ctx.save();

    // Draw a rough polygon to simulate rocky shape
    const sides = 7;
    const seed = node.id * 137.5; // deterministic pseudo-random per node
    ctx.shadowBlur = node.owner !== null ? 10 : 2;
    ctx.shadowColor = baseColor;
    ctx.fillStyle = node.owner !== null ? baseColor : '#3a3a4a';
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const variation = 0.7 + 0.3 * Math.sin(seed + i * 1.7);
      const pr = r * variation;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * pr, y + Math.sin(a) * pr);
      else         ctx.lineTo(x + Math.cos(a) * pr, y + Math.sin(a) * pr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  _drawNebula(ctx, node, color, time) {
    const { x, y } = node.position;
    const r = node.radius;
    const baseColor = node.owner !== null ? color : '#334466';
    const pulse = 1 + 0.05 * Math.sin(node.pulsePhase * 0.7);

    ctx.save();

    // Soft cloud glow
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8 * pulse);
    grd.addColorStop(0, baseColor + '99');
    grd.addColorStop(0.5, baseColor + '44');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = baseColor + 'aa';
    ctx.shadowBlur = 15;
    ctx.shadowColor = baseColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawBlackhole(ctx, node, color, time) {
    const { x, y } = node.position;
    const r = node.radius;
    const baseColor = node.owner !== null ? color : '#8800cc';
    const spinAngle = time * 1.2;

    ctx.save();

    // Accretion disk (glowing ring)
    const ring = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.2);
    ring.addColorStop(0, 'transparent');
    ring.addColorStop(0.35, baseColor + '66');
    ring.addColorStop(0.6, baseColor + '33');
    ring.addColorStop(1, 'transparent');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Dark event horizon
    ctx.fillStyle = '#050508';
    ctx.shadowBlur = 20;
    ctx.shadowColor = baseColor;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // Thin bright ring edge
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawWormhole(ctx, node, world, time) {
    const { x, y } = node.position;
    const r = node.radius;
    const pairColor = node.pairColor || '#cc44ff';
    const rotSpeed = 1.0; // rad/sec

    ctx.save();

    // Draw faint connection line to paired wormhole
    if (node.pairId !== undefined) {
      const paired = world.nodes.find(
        n => n.type === 'wormhole' && n.pairId === node.pairId && n.id !== node.id
      );
      if (paired) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = pairColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(paired.position.x, paired.position.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Outer swirling ring (rotates clockwise)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * rotSpeed);
    ctx.strokeStyle = pairColor;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.6;
    ctx.shadowBlur = 15;
    ctx.shadowColor = pairColor;
    ctx.beginPath();
    // Draw a partial arc with dashes to simulate swirl
    ctx.setLineDash([8, 4]);
    ctx.arc(0, 0, r * 1.1, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Inner swirling ring (rotates counter-clockwise)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-time * rotSpeed * 1.3);
    ctx.strokeStyle = pairColor;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = pairColor;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 1.3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Dark center (event horizon)
    const centerGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 0.6);
    centerGrad.addColorStop(0, '#020008');
    centerGrad.addColorStop(0.7, '#0a0020');
    centerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Pulsing inner glow
    const pulse = 0.6 + 0.4 * Math.sin(time * 3 + node.pulsePhase);
    ctx.globalAlpha = pulse * 0.7;
    ctx.shadowBlur = 20;
    ctx.shadowColor = pairColor;
    ctx.strokeStyle = pairColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // ---- Energy bar + label ----

  _drawEnergyBar(ctx, node, color) {
    const { x, y } = node.position;
    const r = node.radius;
    const barW = r * 2.4;
    const barH = 4;
    const barX = x - barW / 2;
    const barY = y + r + 6;
    const fill = node.energy / node.maxEnergy;

    ctx.save();

    // Background track
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 2);
    ctx.fill();

    if (fill > 0) {
      // Fill
      const fillColor = node.owner !== null ? color : '#556677';
      ctx.fillStyle = fillColor;
      ctx.shadowBlur = 6;
      ctx.shadowColor = fillColor;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * fill, barH, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawEnergyLabel(ctx, node, color) {
    const { x, y } = node.position;
    const r = node.radius;
    const energy = Math.floor(node.energy);
    const labelY = y + r + 20;

    ctx.save();
    ctx.font = `bold ${r >= 28 ? 13 : 11}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow for readability
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(energy, x + 1, labelY + 1);

    ctx.fillStyle = node.owner !== null ? '#ffffff' : '#88aacc';
    ctx.fillText(energy, x, labelY);
    ctx.restore();
  }
}

// ---- Color helpers ----

function lighten(hex, amount) {
  return shiftColor(hex, amount);
}

function darken(hex, amount) {
  return shiftColor(hex, -amount);
}

function shiftColor(hex, amount) {
  try {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = clamp(parseInt(c.substring(0, 2), 16) + Math.round(255 * amount), 0, 255);
    const g = clamp(parseInt(c.substring(2, 4), 16) + Math.round(255 * amount), 0, 255);
    const b = clamp(parseInt(c.substring(4, 6), 16) + Math.round(255 * amount), 0, 255);
    return `rgb(${r},${g},${b})`;
  } catch {
    return hex;
  }
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
