import test from 'node:test';
import assert from 'node:assert/strict';
import {Ball} from '../js/game/Ball.js';
import {Arena} from '../js/game/Arena.js';
import {Storm} from '../js/game/Storm.js';
import {simulateStep, allBallsStopped} from '../js/physics/PhysicsEngine.js';
import {AIController} from '../js/game/AIController.js';
import {Player} from '../js/game/Player.js';
import {PLAYER_COLORS} from '../js/constants.js';

function travel(fps) {
  const ball = new Ball(300, 400, 0);
  ball.shoot(0, 18);
  const arena = new Arena(3000, 2000);
  for (let i=0;i<fps;i++) simulateStep([ball], arena, arena.radius, 1/fps);
  return ball;
}
test('drag is stable across 30, 60 and 120 Hz', () => {
  const positions = [30,60,120].map(fps => travel(fps).x);
  assert.ok(Math.max(...positions)-Math.min(...positions)<3, positions.join(', '));
});
test('maximum-power shots cannot tunnel through an opponent', () => {
  const arena = new Arena(1400, 900);
  const a = new Ball(500,450,0), b = new Ball(550,450,1);
  a.shoot(0,88);
  const events = simulateStep([a,b],arena,arena.radius,0.05);
  assert.ok(events.some(e => e.type === 'ballCollision'));
  assert.ok(b.vx>0);
});
test('a pocket removes a ball and shield blocks once', () => {
  const arena = new Arena(1400,900);
  const pocket = arena.pockets[0];
  const ball = new Ball(pocket.x+5,pocket.y+5,0);
  ball.shielded = true;
  const events = simulateStep([ball],arena,arena.radius,1/60);
  assert.ok(events.some(e => e.type === 'shieldBlock'));
  assert.equal(ball.shielded,false);
  assert.equal(ball.alive,true);
  const unshielded = new Ball(pocket.x+5,pocket.y+5,0);
  simulateStep([unshielded],arena,arena.radius,1/60);
  assert.equal(unshielded.alive,false);
});
test('ghost passes fully through the first ball without an impulse', () => {
  const arena = new Arena(1400,900);
  const a = new Ball(500,450,0), b = new Ball(550,450,1);
  a.applyItem('ghost'); a.shoot(0,30);
  for(let i=0;i<8;i++) simulateStep([a,b],arena,arena.radius,1/60);
  assert.ok(a.x>b.x+a.radius+b.radius);
  assert.equal(b.vx,0);
});
test('storm interpolation is independent of frame rate', () => {
  const radii = [30,60,120].map(fps => {
    const storm = new Storm(500); storm.shrink();
    for(let i=0;i<fps;i++) storm.update(1/fps);
    return storm.currentRadius;
  });
  assert.ok(Math.max(...radii)-Math.min(...radii)<0.01);
});
test('AI uses a contact point that pockets an aligned opponent', () => {
  const arena = new Arena(1400,900);
  const pocket = arena.pockets[4];
  const a = new Ball(pocket.x,pocket.y+190,0);
  const b = new Ball(pocket.x,pocket.y+90,1);
  const ai = new AIController();
  const player = new Player(0,'Bot',PLAYER_COLORS[0],true);
  const shot = ai.computeShot(player,[a,b],arena);
  assert.ok(Math.abs(shot.angle + Math.PI/2)<0.02);
  a.shoot(shot.angle,shot.power);
  for(let i=0;i<600 && !allBallsStopped([a,b]);i++) simulateStep([a,b],arena,arena.radius,1/120);
  assert.equal(b.alive,false);
});
