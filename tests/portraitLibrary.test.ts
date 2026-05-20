import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSeedreamGeneratedPortraitPrompt,
  parseRealPortraitValidationCallback,
  SEEDREAM_GENERATED_PORTRAIT_MODEL,
} from '../src/services/portraitLibrary.ts';

test('buildSeedreamGeneratedPortraitPrompt expands user prompt into a 16:9 character turnaround brief', () => {
  const prompt = buildSeedreamGeneratedPortraitPrompt('银灰色短发女性主理人，机能夹克，写实商业摄影风格');

  assert.match(prompt, /银灰色短发女性主理人/u);
  assert.match(prompt, /正视图/u);
  assert.match(prompt, /侧视图/u);
  assert.match(prompt, /背视图/u);
  assert.match(prompt, /面部五官放大特写/u);
  assert.match(prompt, /纯白色/u);
  assert.match(prompt, /比例16:9/u);
});

test('Seedream generated portrait model is pinned to the supported model id', () => {
  assert.equal(SEEDREAM_GENERATED_PORTRAIT_MODEL, 'doubao-seedream-5-0-260128');
});

test('parseRealPortraitValidationCallback extracts token and result code from callback URL', () => {
  const parsed = parseRealPortraitValidationCallback('https://example.com/callback?bytedToken=token-123&resultCode=10000&verify_type=real_time');

  assert.equal(parsed.bytedToken, 'token-123');
  assert.equal(parsed.resultCode, '10000');
});
