const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Set up a minimal sandbox for the game code to run in
function createGameContext() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  // Extract main script (first <script> to last </script>)
  // Template literals inside use <scr${''}ipt> escapes so they won't interfere.
  const scriptStart = html.indexOf('<script>') + '<script>'.length;
  const scriptEnd = html.lastIndexOf('</script>');
  let js = html.substring(scriptStart, scriptEnd);

  // Disable auto-start and animation loop
  js = js.replace(/^init\(\);$/m, '// init(); // disabled for testing');
  js = js.replace(/requestAnimationFrame\(gameLoop\)/g, '// raf disabled');

  // Expose all game internals to the sandbox context so tests can access them.
  // In a vm context, const/let are not context properties — we must assign them
  // explicitly to globalThis.
  js += `
;(function _expose() {
  // Constants
  globalThis.SAVE_KEY = SAVE_KEY;
  globalThis.GEN_MILESTONES = GEN_MILESTONES;
  globalThis.SKILL_DEFS = SKILL_DEFS;
  globalThis.TIER_REQS = TIER_REQS;
  globalThis.TIER_NAMES = TIER_NAMES;
  globalThis.ACHIEVEMENTS = ACHIEVEMENTS;
  globalThis.CHALLENGE_DEFS = CHALLENGE_DEFS;
  globalThis.GEN_VISUALS = GEN_VISUALS;
  globalThis.GEN_UPGRADES = GEN_UPGRADES;
  globalThis.GEN_UPGRADE_TIERS = GEN_UPGRADE_TIERS;
  globalThis.GOLDEN_EVENTS = GOLDEN_EVENTS;
  globalThis.NEWS_STATIC = NEWS_STATIC;
  // State accessor — reading/writing ctx.state goes through a getter/setter
  // so that changes from outside the vm propagate to the inner 'state' variable.
  Object.defineProperty(globalThis, 'state', {
    get() { return state; },
    set(v) { state = v; },
    configurable: true,
    enumerable: true,
  });
})();
`;

  // Minimal DOM stubs — enough for game constants & pure functions to load
  const mockElement = () => ({
    innerHTML: '',
    textContent: '',
    style: {},
    className: '',
    appendChild: () => {},
    removeChild: () => {},
    remove: () => {},
    children: [],
    firstChild: null,
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
    addEventListener: () => {},
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fillText: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      save: () => {},
      restore: () => {},
      canvas: { width: 400, height: 600 },
    }),
    width: 400,
    height: 600,
  });

  const sandbox = {
    window: {
      open: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 1280,
      innerHeight: 800,
    },
    performance: {
      now: () => Date.now(),
    },
    document: {
      getElementById: () => mockElement(),
      createElement: () => mockElement(),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      title: '',
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = v; },
      removeItem(k) { delete this._data[k]; },
    },
    requestAnimationFrame: () => 0,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    alert: () => {},
    confirm: () => true,
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    Error,
    TypeError,
    ReferenceError,
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(js, context);
  return context;
}

module.exports = { createGameContext };
