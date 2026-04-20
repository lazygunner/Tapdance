import test from 'node:test';
import assert from 'node:assert/strict';

import type { VisualAspectRatio } from '../src/types.ts';
import { mapVolcengineImageSize } from '../src/services/volcengineImageSize.ts';

test('Seedream 5 image generation uses lowercase 2k instead of legacy 1K/2K sizes', () => {
  const aspectRatios: VisualAspectRatio[] = ['1:1', '16:9'];

  for (const aspectRatio of aspectRatios) {
    assert.equal(mapVolcengineImageSize(aspectRatio, 'doubao-seedream-5-0-260128'), '2k');
    assert.equal(mapVolcengineImageSize(aspectRatio, 'Seedream-5.0-lite'), '2k');
  }
});

test('older Seedream image models keep their existing size mapping', () => {
  assert.equal(mapVolcengineImageSize('1:1', 'Seedream-4.0'), '1K');
  assert.equal(mapVolcengineImageSize('16:9', 'Seedream-4.0'), '2K');
});
