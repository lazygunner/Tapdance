import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAppStateStore } from '../server/appStateStore.mjs';

test('app state store persists JSON values in a sqlite file', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'renren-app-state-'));
  const dbPath = join(tempDir, 'app-state.sqlite');

  const store = createAppStateStore(dbPath);
  const saved = store.set('projects', [{ id: 'project-1', name: 'Demo' }]);
  store.close();

  const reopenedStore = createAppStateStore(dbPath);
  const loaded = reopenedStore.get('projects');
  reopenedStore.close();

  assert.equal(saved.key, 'projects');
  assert.ok(saved.updatedAt);
  assert.deepEqual(loaded, {
    key: 'projects',
    value: [{ id: 'project-1', name: 'Demo' }],
    updatedAt: saved.updatedAt,
  });

  await rm(tempDir, { recursive: true, force: true });
});

test('app state store rejects invalid keys', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'renren-app-state-'));
  const dbPath = join(tempDir, 'app-state.sqlite');
  const store = createAppStateStore(dbPath);

  assert.throws(() => store.set('../projects', []), /状态键无效/u);

  store.close();
  await rm(tempDir, { recursive: true, force: true });
});

test('app state store can reset all persisted entries', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'renren-app-state-'));
  const dbPath = join(tempDir, 'app-state.sqlite');
  const store = createAppStateStore(dbPath);

  store.set('projects', [{ id: 'project-1' }]);
  store.set('api_settings', { gemini: { apiKey: 'demo' } });
  const resetResult = store.reset();
  store.close();

  const reopenedStore = createAppStateStore(dbPath);
  const projects = reopenedStore.get('projects');
  const apiSettings = reopenedStore.get('api_settings');
  reopenedStore.close();

  assert.ok(resetResult.resetAt);
  assert.equal(projects, null);
  assert.equal(apiSettings, null);

  await rm(tempDir, { recursive: true, force: true });
});
