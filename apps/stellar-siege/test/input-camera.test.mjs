import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../js/render/Camera.js';
import { InputManager } from '../js/input/InputManager.js';
import { World } from '../js/game/World.js';
import { createNode } from '../js/game/Node.js';

test('zoom holds the point under the cursor and fit restores reachable bounds', () => {
  const camera = new Camera(), world = { width: 2000, height: 1200 };
  const before = camera.update(1280, 800, world);
  const x = 700, y = 420;
  const point = { x: (x - before.x) / before.scale, y: (y - before.y) / before.scale };
  camera.zoomAt(x, y, -400);
  assert.ok(camera.zoom > 1);
  assert.ok(Math.abs((x - camera.view.x) / camera.view.scale - point.x) < 0.001);
  assert.ok(Math.abs((y - camera.view.y) / camera.view.scale - point.y) < 0.001);
  camera.reset();
  const view = camera.update(900, 700, world);
  assert.ok(view.x >= 0 && view.y >= 70);
  assert.ok(view.x + world.width * view.scale <= 900);
  assert.ok(view.y + world.height * view.scale <= 640);
});

test('box-selected sources stay selected when dragging; Shift sends all or toggles on a click', () => {
  const world = new World();
  world.nodes = [100, 240, 600].map((x, i) => createNode({ type: 'planet', x, y: 100, owner: i === 2 ? 1 : 0 }));
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  try {
    const canvas = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const input = new InputManager(canvas, () => world);
    const event = (x, y, shiftKey = false) => ({ clientX: x, clientY: y, shiftKey, button: 0 });
    input._onMouseDown(event(30, 40));
    input._onMouseMove(event(290, 150));
    input._onMouseUp(event(290, 150));
    assert.equal(input.selectedNodes.length, 2);
    let order;
    input.onSendEnergy = (sources, target, ratio) => { order = { sources: [...sources], target, ratio }; };
    input._onMouseDown(event(100, 100));
    input._onMouseMove(event(600, 100));
    input._onMouseUp(event(600, 100));
    assert.equal(order.sources.length, 2);
    assert.equal(order.ratio, 0.5);
    input._onMouseDown(event(100, 100, true));
    input._onMouseMove(event(600, 100, true));
    input._onMouseUp(event(600, 100, true));
    assert.equal(order.sources.length, 2);
    assert.equal(order.ratio, 1);
    input._onMouseDown(event(100, 100, true));
    input._onMouseUp(event(100, 100, true));
    assert.equal(input.selectedNodes.length, 1);
  } finally { globalThis.window = previousWindow; }
});
