// ── WebSocket Connection ──
// Manages WebSocket connection with auto-reconnect and message queue.

export class Connection {
  constructor() {
    this.ws = null;
    this.handlers = new Map();  // type → [callback]
    this.queue = [];            // messages queued while disconnected
    this.connected = false;
    this.reconnectTimer = null;
    this.url = null;
    this.onStatusChange = null; // (connected: boolean) => void
  }

  /** Connect to the WebSocket server. */
  connect(url) {
    this.url = url;
    this._doConnect();
  }

  _doConnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.onStatusChange?.(true);
      // Flush queued messages
      for (const msg of this.queue) {
        this.ws.send(JSON.stringify(msg));
      }
      this.queue = [];
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const callbacks = this.handlers.get(msg.type);
        if (callbacks) {
          for (const cb of callbacks) cb(msg);
        }
        // Also fire wildcard handlers
        const wild = this.handlers.get('*');
        if (wild) {
          for (const cb of wild) cb(msg);
        }
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.onStatusChange?.(false);
      // Auto-reconnect after 2 seconds
      this.reconnectTimer = setTimeout(() => this._doConnect(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('WS error:', err);
    };
  }

  /** Register a handler for a message type. */
  on(type, callback) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(callback);
  }

  /** Remove a handler. */
  off(type, callback) {
    const cbs = this.handlers.get(type);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  }

  /** Send a message to the server. */
  send(msg) {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }

  /** Disconnect and stop reconnecting. */
  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.connected = false;
    this.ws = null;
  }
}
