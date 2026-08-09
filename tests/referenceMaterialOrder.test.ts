import test from 'node:test';
import assert from 'node:assert/strict';

import { reorderReferenceItems } from '../src/features/fastVideoFlow/utils/referenceMaterialOrder.ts';

test('reference materials can be moved forward and backward', () => {
  const materials = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  assert.deepEqual(reorderReferenceItems(materials, 'd', 'b').map((item) => item.id), ['a', 'd', 'b', 'c']);
  assert.deepEqual(reorderReferenceItems(materials, 'a', 'c').map((item) => item.id), ['b', 'c', 'a', 'd']);
});

test('reference material reorder ignores invalid and identical targets', () => {
  const materials = [{ id: 'a' }, { id: 'b' }];

  assert.equal(reorderReferenceItems(materials, 'a', 'a'), materials);
  assert.equal(reorderReferenceItems(materials, 'missing', 'b'), materials);
});
