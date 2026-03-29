import {
  SEND_RATIO_DEFAULT,
  SEND_RATIO_SHIFT,
  SEND_RATIO_CTRL,
} from '../utils/constants.js';

/**
 * InputManager — translates mouse events on the canvas into game actions.
 *
 * Responsibilities:
 *   - Track mouse position in CSS/logical canvas coordinates
 *   - Detect which node is under the cursor (hoveredNode)
 *   - Track the player's selected node(s)
 *   - Drive drag-to-send interaction
 *   - Call onSendEnergy(selectedNodes, targetNode, ratio) on valid drag-release
 *   - Call onRedirectSwarm(swarm, newTargetNode) when a swarm is redirected
 */
export class InputManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {() => World | null} getWorld  - getter called each frame / event
   */
  constructor(canvas, getWorld) {
    this.canvas   = canvas;
    this.getWorld = getWorld;

    // Mouse position in logical (CSS) pixels relative to canvas
    this._mouseX = 0;
    this._mouseY = 0;

    // Public state
    this.hoveredNode   = null;
    this.selectedNodes = [];     // array of owned nodes the player has selected
    this.isDragging    = false;
    this.dragStartNode = null;   // the node the current drag originated from

    // Swarm redirect state
    this.selectedSwarm = null;   // swarm currently being redirected
    this.isRedirecting = false;

    // Box-selection state
    this._boxStartX      = 0;
    this._boxStartY      = 0;
    this._isBoxSelecting = false;
    /** Exposed to Renderer: {x1, y1, x2, y2} during drag, null otherwise */
    this.boxSelectRect   = null;

    // Modifier keys
    this.shiftKey = false;
    this.ctrlKey  = false;

    /**
     * Callback fired when the player completes a drag-to-send gesture.
     * Signature: (selectedNodes: Node[], targetNode: Node, ratio: number) => void
     */
    this.onSendEnergy = null;

    /**
     * Callback fired when the player redirects an in-flight swarm.
     * Signature: (swarm: Swarm, newTargetNode: Node) => void
     */
    this.onRedirectSwarm = null;

    this._bindEvents();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Returns the current mouse position in logical canvas coordinates. */
  getMousePos() {
    return { x: this._mouseX, y: this._mouseY };
  }

  /**
   * The energy send ratio based on held modifier keys.
   *   Shift  → 100%
   *   Ctrl   → 25%
   *   (none) → 50%
   */
  getSendRatio() {
    if (this.shiftKey) return SEND_RATIO_SHIFT;
    if (this.ctrlKey)  return SEND_RATIO_CTRL;
    return SEND_RATIO_DEFAULT;
  }

  /**
   * Call once per frame to refresh hoveredNode from the current world state.
   * @param {World} world
   */
  update(world) {
    this.hoveredNode = world.getNodeAt(this._mouseX, this._mouseY) ?? null;
  }

  // -------------------------------------------------------------------------
  // Event binding
  // -------------------------------------------------------------------------

  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown',   e => this._onMouseDown(e));
    canvas.addEventListener('mousemove',   e => this._onMouseMove(e));
    canvas.addEventListener('mouseup',     e => this._onMouseUp(e));
    canvas.addEventListener('mouseleave',  e => this._onMouseLeave(e));
    canvas.addEventListener('contextmenu', e => this._onContextMenu(e));

    // Track modifier keys globally so we catch them even if focus moves
    window.addEventListener('keydown', e => {
      this.shiftKey = e.shiftKey;
      this.ctrlKey  = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') this._cancelRedirect();
    });
    window.addEventListener('keyup', e => {
      this.shiftKey = e.shiftKey;
      this.ctrlKey  = e.ctrlKey || e.metaKey;
    });
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  _onMouseDown(e) {
    if (e.button !== 0) return; // left click only

    this._updateModifiers(e);
    this._updateMousePos(e);

    const world = this.getWorld();
    if (!world) return;

    const node = world.getNodeAt(this._mouseX, this._mouseY);

    if (node && node.owner === 0) {
      // Clicking an owned node
      this._cancelRedirect();
      this._isBoxSelecting = false;
      this.boxSelectRect   = null;

      if (this.shiftKey) {
        // Shift+click: toggle node in/out of selection
        const idx = this.selectedNodes.indexOf(node);
        if (idx === -1) {
          this.selectedNodes = [...this.selectedNodes, node];
        } else {
          this.selectedNodes = this.selectedNodes.filter(n => n !== node);
        }
        // Allow dragging from this node if it ended up selected
        if (this.selectedNodes.includes(node)) {
          this.isDragging    = true;
          this.dragStartNode = node;
        } else {
          this.isDragging    = false;
          this.dragStartNode = null;
        }
      } else {
        // Normal click: replace selection with this node
        this.selectedNodes = [node];
        this.isDragging    = true;
        this.dragStartNode = node;
      }
    } else {
      // No owned node — check if the click lands on a player swarm
      const swarm = world.getSwarmAt(this._mouseX, this._mouseY, 0);
      if (swarm) {
        // Begin swarm redirect gesture
        this.selectedSwarm   = swarm;
        this.isRedirecting   = true;
        this._isBoxSelecting = false;
        this.boxSelectRect   = null;
        // Don't select nodes or start a drag
        this.selectedNodes  = [];
        this.isDragging     = false;
        this.dragStartNode  = null;
      } else {
        // Clicked empty space — begin box selection
        this._cancelRedirect();
        if (!this.shiftKey) {
          this.selectedNodes = [];
        }
        this.isDragging      = false;
        this.dragStartNode   = null;
        this._isBoxSelecting = true;
        this._boxStartX      = this._mouseX;
        this._boxStartY      = this._mouseY;
        this.boxSelectRect   = { x1: this._mouseX, y1: this._mouseY,
                                  x2: this._mouseX, y2: this._mouseY };
      }
    }
  }

  _onMouseMove(e) {
    this._updateModifiers(e);
    this._updateMousePos(e);

    const world = this.getWorld();
    if (world) {
      this.hoveredNode = world.getNodeAt(this._mouseX, this._mouseY) ?? null;
    }

    // Update box selection rectangle as the mouse moves
    if (this._isBoxSelecting) {
      this.boxSelectRect = {
        x1: this._boxStartX,
        y1: this._boxStartY,
        x2: this._mouseX,
        y2: this._mouseY,
      };
    }
  }

  _onMouseUp(e) {
    if (e.button !== 0) return;

    this._updateModifiers(e);
    this._updateMousePos(e);

    const world = this.getWorld();

    // --- Handle swarm redirect completion ---
    if (this.isRedirecting && this.selectedSwarm && world) {
      const target = world.getNodeAt(this._mouseX, this._mouseY);
      if (target && target.id !== this.selectedSwarm.targetId) {
        if (this.onRedirectSwarm) {
          this.onRedirectSwarm(this.selectedSwarm, target);
        }
      }
      this._cancelRedirect();
      return;
    }

    // --- Handle box selection completion ---
    if (this._isBoxSelecting) {
      this._isBoxSelecting = false;

      if (world && this.boxSelectRect) {
        const r   = this.boxSelectRect;
        const minX = Math.min(r.x1, r.x2);
        const maxX = Math.max(r.x1, r.x2);
        const minY = Math.min(r.y1, r.y2);
        const maxY = Math.max(r.y1, r.y2);

        // Only treat as a real box-select if the user dragged a meaningful area
        const BOX_MIN_SIZE = 4;
        if (maxX - minX > BOX_MIN_SIZE || maxY - minY > BOX_MIN_SIZE) {
          const inBox = world.nodes.filter(n =>
            n.owner === 0 &&
            n.position.x >= minX && n.position.x <= maxX &&
            n.position.y >= minY && n.position.y <= maxY
          );

          if (this.shiftKey) {
            // Shift+drag: add to existing selection (no duplicates)
            const merged = [...this.selectedNodes];
            for (const n of inBox) {
              if (!merged.includes(n)) merged.push(n);
            }
            this.selectedNodes = merged;
          } else {
            this.selectedNodes = inBox;
          }
        }
        // else: tiny drag treated as click — selection already cleared on mousedown
      }

      this.boxSelectRect = null;
      return;
    }

    // --- Handle drag-to-send completion ---
    if (this.isDragging && this.dragStartNode && world) {
      const target = world.getNodeAt(this._mouseX, this._mouseY);

      if (
        target &&
        target.id !== this.dragStartNode.id &&
        this.onSendEnergy &&
        this.selectedNodes.length > 0
      ) {
        this.onSendEnergy(this.selectedNodes, target, this.getSendRatio());
      }
    }

    // Reset drag state (keep selection so player can see which node is selected)
    this.isDragging    = false;
    this.dragStartNode = null;
  }

  _onMouseLeave(e) {
    // Cancel drag when cursor leaves the canvas
    this.isDragging      = false;
    this.dragStartNode   = null;
    this.hoveredNode     = null;
    // Also cancel any in-progress box selection
    this._isBoxSelecting = false;
    this.boxSelectRect   = null;
  }

  _onContextMenu(e) {
    e.preventDefault();
    // Right-click cancels any in-progress drag, redirect, or box select
    this._cancelRedirect();
    this.isDragging      = false;
    this.dragStartNode   = null;
    this._isBoxSelecting = false;
    this.boxSelectRect   = null;
  }

  /** Cancel any in-progress swarm redirect gesture. */
  _cancelRedirect() {
    this.selectedSwarm = null;
    this.isRedirecting = false;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Convert a MouseEvent to logical canvas coordinates. */
  _updateMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._mouseX = e.clientX - rect.left;
    this._mouseY = e.clientY - rect.top;
  }

  _updateModifiers(e) {
    this.shiftKey = e.shiftKey;
    this.ctrlKey  = e.ctrlKey || e.metaKey;
  }
}
