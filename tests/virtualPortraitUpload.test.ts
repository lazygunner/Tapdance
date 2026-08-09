import test from 'node:test';
import assert from 'node:assert/strict';

import { getVirtualPortraitDescriptionFromFileName } from '../src/features/portraitLibrary/utils/virtualPortraitUpload.ts';

test('virtual portrait upload descriptions use the file name without its final extension', () => {
  assert.equal(getVirtualPortraitDescriptionFromFileName('奥德赛角色.png'), '奥德赛角色');
  assert.equal(getVirtualPortraitDescriptionFromFileName('character.profile.webp'), 'character.profile');
  assert.equal(getVirtualPortraitDescriptionFromFileName('portrait'), 'portrait');
  assert.equal(getVirtualPortraitDescriptionFromFileName(''), '虚拟人像素材');
});
