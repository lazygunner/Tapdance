import test from 'node:test';
import assert from 'node:assert/strict';

import type { Shot } from '../src/types.ts';
import { getTimelineStripItems, getTimelineTotalDuration } from '../src/features/creativeFlow/utils/timeline.ts';

function createShot(id: string, shotNumber: number, overrides: Partial<Shot> = {}): Shot {
  return {
    id,
    shotNumber,
    duration: 5,
    shotSize: 'Medium',
    cameraAngle: 'Eye level',
    cameraMovement: 'Static',
    subject: 'Subject',
    action: 'Action',
    mood: 'Calm',
    transition: 'Cut',
    ...overrides,
  };
}

test('getTimelineStripItems includes transition duration and generated transition video url', () => {
  const items = getTimelineStripItems([
    createShot('shot-1', 1, {
      duration: 4,
      transitionVideoDuration: 3,
      transitionVideoUrl: 'blob:transition-1',
    }),
    createShot('shot-2', 2, { duration: 6 }),
  ]);

  assert.equal(items.length, 3);
  assert.equal(items[0].kind, 'shot');
  assert.equal(items[0].startSeconds, 0);
  assert.equal(items[0].durationSeconds, 4);

  assert.equal(items[1].kind, 'transition');
  if (items[1].kind === 'transition') {
    assert.equal(items[1].startSeconds, 4);
    assert.equal(items[1].durationSeconds, 4);
    assert.equal(items[1].transitionVideoUrl, 'blob:transition-1');
  }

  assert.equal(items[2].kind, 'shot');
  assert.equal(items[2].startSeconds, 8);
});

test('getTimelineTotalDuration includes configured transition durations', () => {
  const totalDuration = getTimelineTotalDuration([
    createShot('shot-1', 1, { duration: 4, transitionVideoDuration: 3 }),
    createShot('shot-2', 2, { duration: 6, transitionVideoDuration: 10 }),
    createShot('shot-3', 3, { duration: 5 }),
  ]);

  assert.equal(totalDuration, 4 + 4 + 6 + 10 + 5);
});
