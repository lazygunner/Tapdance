import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countSeedanceCliQueueAhead,
  createEmptySeedanceCliQueueState,
  getSeedanceCliRetryDelayMs,
  normalizeSeedanceCliQueueState,
} from '../src/features/fastVideoFlow/services/seedanceCliQueue.ts';

test('countSeedanceCliQueueAhead counts active local queue states only', () => {
  const state = createEmptySeedanceCliQueueState();
  state.items = [
    { id: '1', projectId: 'p', projectName: 'P', label: 'a', draft: {} as any, cliOptions: {} as any, status: 'queued', createdAt: '', attemptCount: 0 },
    { id: '2', projectId: 'p', projectName: 'P', label: 'b', draft: {} as any, cliOptions: {} as any, status: 'retry_wait', createdAt: '', attemptCount: 0 },
    { id: '3', projectId: 'p', projectName: 'P', label: 'c', draft: {} as any, cliOptions: {} as any, status: 'completed', createdAt: '', attemptCount: 0 },
  ];

  assert.equal(countSeedanceCliQueueAhead(state.items), 2);
});

test('normalizeSeedanceCliQueueState makes stale submitting tasks queued again', () => {
  const normalized = normalizeSeedanceCliQueueState({
    items: [{
      id: 'stale',
      projectId: 'project-1',
      projectName: 'Project',
      label: 'Task',
      draft: { prompt: { rawPrompt: 'prompt', diagnostics: [] }, assets: [], options: {}, overlayTemplateIds: [], baseTemplateId: 'free_text' },
      cliOptions: { modelVersion: 'seedance2.0', ratio: '16:9', duration: 4, videoResolution: '720p' },
      status: 'submitting',
      createdAt: '2026-04-16T00:00:00.000Z',
      attemptCount: 0,
    }],
  });

  assert.equal(normalized.items[0].status, 'queued');
});

test('getSeedanceCliRetryDelayMs backs off up to two minutes', () => {
  assert.equal(getSeedanceCliRetryDelayMs(1), 30_000);
  assert.equal(getSeedanceCliRetryDelayMs(2), 60_000);
  assert.equal(getSeedanceCliRetryDelayMs(99), 120_000);
});
