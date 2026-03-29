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

    // Modifier keys
    this.shiftKey = false;
    this.ctrlKey  = false;

    /**
     * Callback fired when the player completes a drag-to-send gesture.
     * Signature: (selectedNodes: Node[], targetNode: Node, ratio: number) => void
     */
    this.onSendEnergy = null;

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
      // Start a selection + potential drag on a player-owned node
      this.selectedNodes = [node];
      this.isDragging    = true;
      this.dragStartNode = node;
    } else {
      // Clicked empty space — deselect
      this.selectedNodes = [];
      this.isDragging    = false;
      this.dragStartNode = null;
    }
  }

  _onMouseMove(e) {
    this._updateModifiers(e);
    this._updateMousePos(e);

    const world = this.getWorld();
    if (world) {
      this.hoveredNode = world.getNodeAt(this._mouseX, this._mouseY) ?? null;
    }
  }

  _onMouseUp(e) {
    if (e.button !== 0) return;

    this._updateModifiers(e);
    this._updateMousePos(e);

    const world = this.getWorld();

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
    this.isDragging    = false;
    this.dragStartNode = null;
    this.hoveredNode   = null;
  }

  _onContextMenu(e) {
    e.preventDefault();
    // Right-click cancels any in-progress drag
    this.isDragging    = false;
    this.dragStartNode = null;
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
