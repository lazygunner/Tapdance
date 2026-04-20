import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVolcengineShotListResult } from '../src/services/volcengineShotList.ts';

const shot = {
  shotNumber: 1,
  duration: 3,
  shotSize: '中景',
  cameraAngle: '平视',
  cameraMovement: '推进',
  subject: '主角',
  action: '进入场景',
  mood: '紧张',
  transition: '硬切',
  dialog: '',
  referenceAssets: [],
};

test('normalizeVolcengineShotListResult accepts json_object wrapped shots', () => {
  assert.deepEqual(normalizeVolcengineShotListResult({ shots: [shot] }), [shot]);
});

test('normalizeVolcengineShotListResult keeps backward compatibility with top-level arrays', () => {
  assert.deepEqual(normalizeVolcengineShotListResult([shot]), [shot]);
});

test('normalizeVolcengineShotListResult rejects non-array model responses with a clear error', () => {
  assert.throws(
    () => normalizeVolcengineShotListResult({ message: 'no shots here' }),
    /分镜列表格式无效/u,
  );
});
