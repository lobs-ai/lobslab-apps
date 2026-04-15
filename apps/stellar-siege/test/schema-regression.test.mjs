import test from 'node:test';
import assert from 'node:assert/strict';

import { BaseTypes, GameObject } from 'lance-gg';
import { createStellarLanceClasses } from '../js/net/lance/schema.js';

test('Lance schema objects tolerate engine-less clone construction', () => {
  const { StellarNodeObject, StellarSwarmObject } = createStellarLanceClasses({ GameObject, BaseTypes });

  assert.doesNotThrow(() => new StellarNodeObject(null, { id: null }));
  assert.doesNotThrow(() => new StellarSwarmObject(null, { id: null }));
});
