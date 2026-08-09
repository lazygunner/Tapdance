import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMaterialsInSelectionOrder,
  toggleSelectionOrder,
} from '../src/features/fastVideoFlow/utils/historyMaterialSelection.ts';

test('history material multi-selection preserves click order', () => {
  const materials = [
    { id: 'image-a', title: 'A' },
    { id: 'image-b', title: 'B' },
    { id: 'image-c', title: 'C' },
  ];
  let selection: string[] = [];
  selection = toggleSelectionOrder(selection, 'image-c');
  selection = toggleSelectionOrder(selection, 'image-a');
  selection = toggleSelectionOrder(selection, 'image-b');

  assert.deepEqual(selection, ['image-c', 'image-a', 'image-b']);
  assert.deepEqual(
    resolveMaterialsInSelectionOrder(materials, selection).map((material) => material.id),
    ['image-c', 'image-a', 'image-b'],
  );
});

test('deselecting and selecting again moves a material to the end', () => {
  let selection = ['image-a', 'image-b', 'image-c'];
  selection = toggleSelectionOrder(selection, 'image-b');
  selection = toggleSelectionOrder(selection, 'image-b');
  assert.deepEqual(selection, ['image-a', 'image-c', 'image-b']);
});
