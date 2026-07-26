import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { Box3, Vector3 } from 'three';

test('bundled UE mannequin keeps its metre-scale GLB dimensions', async () => {
  const model = fs.readFileSync(new URL('../public/models/ue-mannequin-retopology.glb', import.meta.url));
  Reflect.set(globalThis, 'self', globalThis);
  if (!Reflect.get(globalThis, 'ProgressEvent')) {
    Reflect.set(globalThis, 'ProgressEvent', class ProgressEvent {});
  }
  if (!Reflect.get(globalThis, 'createImageBitmap')) {
    Reflect.set(globalThis, 'createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  }
  Reflect.set(globalThis, 'window', {
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    electronAPI: {
      isElectron: true,
      readBundledModel: async () => model.toString('base64'),
    },
  });

  const { createUeMannequin } = await import(
    '../src/features/fastVideoFlow/services/fastDirectorUeMannequin.ts'
  );
  const mannequin = await createUeMannequin('mannequin');
  mannequin.updateMatrixWorld(true);
  const size = new Box3().setFromObject(mannequin, true).getSize(new Vector3());

  assert.ok(size.y > 1.7 && size.y < 2, `expected a human-scale model, got ${size.y}m`);
  assert.ok(size.x > 0.65 && size.x < 0.9, `expected UE mannequin shoulder width, got ${size.x}m`);
});
