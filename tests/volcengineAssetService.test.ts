import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isArkAssetActiveStatus,
  isArkAssetFailedStatus,
  normalizeArkAssetStatus,
} from '../src/services/volcengineAssetService.ts';

test('normalizeArkAssetStatus canonicalizes common asset processing states', () => {
  assert.equal(normalizeArkAssetStatus('active'), 'Active');
  assert.equal(normalizeArkAssetStatus('SUCCESS'), 'Active');
  assert.equal(normalizeArkAssetStatus('pending'), 'Processing');
  assert.equal(normalizeArkAssetStatus('running'), 'Processing');
  assert.equal(normalizeArkAssetStatus('fail'), 'Failed');
  assert.equal(normalizeArkAssetStatus(''), 'Processing');
});

test('asset status helpers recognize canonical terminal states', () => {
  assert.equal(isArkAssetActiveStatus('succeeded'), true);
  assert.equal(isArkAssetFailedStatus('FAILED'), true);
  assert.equal(isArkAssetActiveStatus('processing'), false);
  assert.equal(isArkAssetFailedStatus('processing'), false);
});
