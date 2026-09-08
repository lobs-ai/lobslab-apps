// ── Input Handler ──
// Handles mouse/touch input for ball selection, aiming, and shooting.

import { MAX_POWER } from '../constants.js';
import { distSq } from '../utils.js';

export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = 0;
    this.mouseY = 0;
    this.aiming = false;
    this.aimStartX = 0;
    this.aimStartY = 0;

    // Callbacks — set by GameManager
    this.onBallSelected = null;    // (ball) => void
    this.onShot = null;            // (angle, power) => void
    this.onCancel = null;          // () => void
    this.onItemClick = null;       // (index) => void

    this._bindEvents();
  }

  _bindEvents() {
    const c = this.canvas;
    this.events = new AbortController();
    const signal = this.events.signal;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      c.setPointerCapture(e.pointerId);
      this._onDown(e.clientX, e.clientY);
    }, { signal });
    c.addEventListener('pointermove', (e) => this._onMove(e.clientX, e.clientY), { signal });
    c.addEventListener('pointerup', (e) => {
      this._onMove(e.clientX, e.clientY);
      this._onUp();
    }, { signal });
    c.addEventListener('pointercancel', () => this._cancel(), { signal });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); this._cancel(); }, { signal });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this._cancel();
    }, { signal });
    window.addEventListener('blur', () => this._cancel(), { signal });
  }

  destroy() {
    this.events.abort();
    this.setPhase('menu');
  }

  _screenToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _onDown(clientX, clientY) {
    const { x, y } = this._screenToCanvas(clientX, clientY);
    this.mouseX = x;
    this.mouseY = y;

    if (this._phase === 'select' && this.selectableBalls) {
      // Try to select a ball
      for (const ball of this.selectableBalls) {
        const threshold = (ball.radius + 10) ** 2;
        if (distSq(x, y, ball.x, ball.y) < threshold) {
          this.onBallSelected?.(ball);
          if (this._phase === 'aim') {
            this.aiming = true;
            this.aimStartX = x;
            this.aimStartY = y;
          }
          return;
        }
      }
    } else if (this._phase === 'aim' && this._selectedBall) {
      const threshold = (this._selectedBall.radius + 30) ** 2;
      if (distSq(x, y, this._selectedBall.x, this._selectedBall.y) < threshold) {
        this.aiming = true;
        this.aimStartX = x;
        this.aimStartY = y;
      } else {
        // Cancel aim, then try to immediately select a different ball (single-click switch)
        this._cancel();
        if (this.selectableBalls) {
          for (const b of this.selectableBalls) {
            const t = (b.radius + 10) ** 2;
            if (distSq(x, y, b.x, b.y) < t) {
              this.onBallSelected?.(b);
              if (this._phase === 'aim') {
                this.aiming = true;
                this.aimStartX = x;
                this.aimStartY = y;
              }
              return;
            }
          }
        }
      }
    }
  }

  _onMove(clientX, clientY) {
    const { x, y } = this._screenToCanvas(clientX, clientY);
    this.mouseX = x;
    this.mouseY = y;
  }

  _onUp() {
    if (!this.aiming || !this._selectedBall) return;
    this.aiming = false;

    const dx = this.aimStartX - this.mouseX;
    const dy = this.aimStartY - this.mouseY;
    const d = Math.sqrt(dx * dx + dy * dy);
    const power = this._power(d);

    if (d < 6 || power < 1) return; // A tap selects without accidentally firing.

    const angle = Math.atan2(dy, dx);
    this.onShot?.(angle, power);
  }

  _cancel() {
    this.aiming = false;
    if (this._phase === 'aim') this.onCancel?.();
  }

  _power(distance) {
    return Math.min(distance / Math.min(180, this.canvas.clientWidth * 0.32) * MAX_POWER, MAX_POWER);
  }

  /** Called by GameManager to update what phase we're in and what's selectable. */
  setPhase(phase, selectedBall = null, selectableBalls = null) {
    this._phase = phase;
    this._selectedBall = selectedBall;
    this.selectableBalls = selectableBalls;
    if (phase !== 'aim') this.aiming = false;
  }

  /** Get current aim info for rendering. */
  getAimInfo() {
    if (!this.aiming || !this._selectedBall) return null;
    const dx = this.aimStartX - this.mouseX;
    const dy = this.aimStartY - this.mouseY;
    const d = Math.sqrt(dx * dx + dy * dy);
    return {
      ball: this._selectedBall,
      angle: Math.atan2(dy, dx),
      power: this._power(d),
      pullX: this.mouseX,
      pullY: this.mouseY,
    };
  }
}
