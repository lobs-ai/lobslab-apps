// ── WebSocket Protocol ──
// Message type constants shared between client and server.

// Client → Server
export const C_CREATE  = 'create';
export const C_JOIN    = 'join';
export const C_START   = 'start';
export const C_SELECT  = 'select';
export const C_SHOOT   = 'shoot';
export const C_CHAT    = 'chat';

// Server → Client
export const S_ROOM        = 'room';
export const S_JOINED      = 'joined';
export const S_ERROR       = 'error';
export const S_GAME_START  = 'gameStart';
export const S_TURN        = 'turn';
export const S_BALL_SELECTED = 'ballSelected';
export const S_REPLAY      = 'replay';
export const S_TURN_END    = 'turnEnd';
export const S_ELIMINATION = 'elimination';
export const S_GAME_OVER   = 'gameOver';
export const S_PLAYER_LEFT = 'playerLeft';
export const S_CHAT        = 'chat';
export const S_TIMER       = 'timer';
