/**
 * NetClient — client-side WebSocket networking for multiplayer.
 *
 * Connects to the game server and provides methods for lobby management
 * and in-game action sending. Uses callbacks for all server messages.
 */
export class NetClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.lobby = null;
    this.connected = false;

    // Callbacks — set by consumer
    this.onLobbyCreated    = null;   // (code, lobby) => {}
    this.onLobbyJoined     = null;   // (lobby, playerId) => {}
    this.onLobbyUpdate     = null;   // (lobby) => {}
    this.onGameStart       = null;   // (initialState, playerId, seed) => {}
    this.onStateUpdate     = null;   // (state) => {}
    this.onActionBroadcast = null;   // (action) => {}
    this.onGameOver        = null;   // (winnerId) => {}
    this.onError           = null;   // (message) => {}
    this.onDisconnect      = null;   // () => {}
  }

  /**
   * Connect to the WebSocket server.
   * @returns {Promise<void>}
   */
  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);
    this.ws.onmessage = (ev) => this._handleMessage(JSON.parse(ev.data));
    this.ws.onclose = () => {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
    };
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws.onerror = (err) => reject(err);
    });
  }

  /**
   * Send a JSON message to the server.
   */
  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // -- Lobby actions --

  createLobby(config) {
    this.send({ type: 'create_lobby', config });
  }

  /**
   * Join an existing lobby by invite code.
   * @param {string} code    - 6-character invite code
   * @param {string} [name]  - display name for this player
   */
  joinLobby(code, name) {
    this.send({ type: 'join_lobby', code: code.toUpperCase(), name: name || 'Player' });
  }

  startGame() {
    this.send({ type: 'start_game' });
  }

  leave() {
    this.send({ type: 'leave' });
    if (this.ws) this.ws.close();
  }

  // -- In-game actions --

  sendAction(action) {
    this.send({ type: 'action', action });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // -- Internal --

  _handleMessage(msg) {
    switch (msg.type) {
      case 'lobby_created':
        this.lobby = msg.lobby;
        if (this.onLobbyCreated) this.onLobbyCreated(msg.code, msg.lobby);
        break;
      case 'lobby_joined':
        this.playerId = msg.playerId;
        this.lobby = msg.lobby;
        if (this.onLobbyJoined) this.onLobbyJoined(msg.lobby, msg.playerId);
        break;
      case 'lobby_update':
        this.lobby = msg.lobby;
        if (this.onLobbyUpdate) this.onLobbyUpdate(msg.lobby);
        break;
      case 'game_start':
        this.playerId = msg.playerId;
        if (this.onGameStart) this.onGameStart(msg.initialState, msg.playerId, msg.seed);
        break;
      case 'action_broadcast':
        if (this.onActionBroadcast) this.onActionBroadcast(msg.action);
        break;
      case 'sync':
        if (this.onStateUpdate) this.onStateUpdate(msg.state);
        break;
      case 'game_over':
        if (this.onGameOver) this.onGameOver(msg.winnerId);
        break;
      case 'error':
        if (this.onError) this.onError(msg.message);
        break;
    }
  }
}
