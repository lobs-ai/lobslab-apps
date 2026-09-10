import test from 'node:test';
import assert from 'node:assert/strict';

import { BaseTypes, GameObject, Serializer } from 'lance-gg';
import { createStellarLanceClasses } from '../js/net/lance/schema.js';

const { StellarNodeObject, StellarSwarmObject } = createStellarLanceClasses({ GameObject, BaseTypes });

test('Lance schema objects tolerate engine-less clone construction', () => {
  assert.doesNotThrow(() => new StellarNodeObject(null, { id: null }));
  assert.doesNotThrow(() => new StellarSwarmObject(null, { id: null }));
});

test('StellarNodeObject serializes and deserializes all fields correctly', () => {
  const serializer = new Serializer();
  serializer.registerClass(StellarNodeObject);

  const mockEngine = { world: { getNewId: () => 42 } };
  const node = new StellarNodeObject(mockEngine, { id: 42 }, {
    playerId: 1,
    nodeId: 7,
    nodeType: 'star',
    ownerId: 2,
    energy: 123.5,
    maxEnergy: 300.0,
    productionRate: 3.25,
    defense: 1.1,
    radius: 30.0,
    x: 400.125,
    y: 299.875,
    upgrade: 'shield',
    pulsePhase: 0.5,
    captureFlash: 0.0,
  });

  const { dataBuffer } = node.serialize(serializer, { bufferOffset: 0 });
  assert.ok(dataBuffer instanceof ArrayBuffer, 'serialize must return ArrayBuffer');
  assert.ok(dataBuffer.byteLength > 0, 'serialized buffer must be non-empty');

  const { obj: decoded } = serializer.deserialize(dataBuffer, 0);
  assert.ok(decoded instanceof StellarNodeObject, 'decoded object must be instanceof StellarNodeObject');

  assert.equal(decoded.nodeId, 7, 'nodeId must round-trip');
  assert.equal(decoded.nodeType, 'star', 'nodeType string must round-trip');
  assert.equal(decoded.ownerId, 2, 'ownerId must round-trip');
  assert.equal(decoded.upgrade, 'shield', 'upgrade string must round-trip');
  assert.ok(Math.abs(decoded.energy - 123.5) < 0.1, `energy drift: ${decoded.energy}`);
  assert.ok(Math.abs(decoded.x - 400.125) < 0.5, `x drift: ${decoded.x}`);
  assert.ok(Math.abs(decoded.y - 299.875) < 0.5, `y drift: ${decoded.y}`);
  assert.ok(Math.abs(decoded.pulsePhase - 0.5) < 0.01, `pulsePhase drift: ${decoded.pulsePhase}`);
});

test('StellarSwarmObject serializes and deserializes all fields correctly', () => {
  const serializer = new Serializer();
  serializer.registerClass(StellarSwarmObject);

  const mockEngine = { world: { getNewId: () => 99 } };
  const swarm = new StellarSwarmObject(mockEngine, { id: 99 }, {
    playerId: 0,
    swarmId: 3,
    ownerId: 0,
    sourceNodeId: 1,
    targetNodeId: 5,
    moteCount: 42,
    centerX: 600.5,
    centerY: 400.25,
    targetX: 800.0,
    targetY: 350.0,
  });

  const { dataBuffer } = swarm.serialize(serializer, { bufferOffset: 0 });
  assert.ok(dataBuffer instanceof ArrayBuffer, 'serialize must return ArrayBuffer');

  const { obj: decoded } = serializer.deserialize(dataBuffer, 0);
  assert.ok(decoded instanceof StellarSwarmObject, 'decoded object must be instanceof StellarSwarmObject');

  assert.equal(decoded.swarmId, 3, 'swarmId must round-trip');
  assert.equal(decoded.ownerId, 0, 'ownerId must round-trip');
  assert.equal(decoded.sourceNodeId, 1, 'sourceNodeId must round-trip');
  assert.equal(decoded.targetNodeId, 5, 'targetNodeId must round-trip');
  assert.equal(decoded.moteCount, 42, 'moteCount must round-trip');
  assert.ok(Math.abs(decoded.centerX - 600.5) < 0.5, `centerX drift: ${decoded.centerX}`);
  assert.ok(Math.abs(decoded.centerY - 400.25) < 0.5, `centerY drift: ${decoded.centerY}`);
  assert.ok(Math.abs(decoded.targetX - 800.0) < 0.5, `targetX drift: ${decoded.targetX}`);
});

test('StellarNodeObject ownerId -1 encodes neutral owner correctly', () => {
  const serializer = new Serializer();
  serializer.registerClass(StellarNodeObject);

  const mockEngine = { world: { getNewId: () => 1 } };
  const node = new StellarNodeObject(mockEngine, { id: 1 }, {
    playerId: 0,
    nodeId: 1,
    nodeType: 'planet',
    ownerId: -1,
    energy: 50,
    maxEnergy: 100,
    productionRate: 1,
    defense: 1,
    radius: 20,
    x: 200,
    y: 150,
    upgrade: '',
    pulsePhase: 0,
    captureFlash: 0,
  });

  const { dataBuffer } = node.serialize(serializer, { bufferOffset: 0 });
  const { obj: decoded } = serializer.deserialize(dataBuffer, 0);

  assert.equal(decoded.ownerId, -1, 'neutral ownerId -1 must round-trip through Int16');
  assert.equal(decoded.upgrade, '', 'empty string upgrade must round-trip');
});

test('changed snapshot strings survive delta pruning and deserialization', () => {
  const serializer = new Serializer();
  serializer.registerClass(StellarSwarmObject);
  const obj = new StellarSwarmObject(null, { id: 4 }, {
    swarmId: 40000, sampleTick: 60, commandId: 9, moteData: '[[7,1,2,3,4]]',
  });
  const previous = obj.serialize(serializer).dataBuffer;
  obj.moteData = '[[7,20,30,40,50]]';
  const pruned = obj.prunedStringsClone(serializer, previous);
  const decoded = serializer.deserialize(pruned.serialize(serializer).dataBuffer).obj;
  assert.equal(decoded.moteData, obj.moteData);
  assert.equal(decoded.swarmId, 40000);
  assert.equal(decoded.commandId, 9);
});

test('compact mote payload round-trips through the actual wire serializer', async () => {
  const { encodeMotes, decodeMotes } = await import('../js/net/moteCodec.js');
  const motes = [{ alive: false }, { alive: true, x: -12.123, y: 1999.97, vx: -95, vy: 4.25 }];
  const data = encodeMotes(motes);
  assert.equal(data.length, 5);
  const serializer = new Serializer(); serializer.registerClass(StellarSwarmObject);
  const obj = new StellarSwarmObject(null, { id: 1 }, { moteData: data });
  const decoded = serializer.deserialize(obj.serialize(serializer).dataBuffer).obj;
  const [row] = decodeMotes(decoded.moteData);
  assert.equal(row[0], 1);
  assert.ok(Math.abs(row[1] - motes[1].x) <= 0.125);
  assert.ok(Math.abs(row[2] - motes[1].y) <= 0.125);
  assert.equal(row[3], -95);
  assert.equal(row[4], 4.25);
});
