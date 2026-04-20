import type { Shot } from '../../../types.ts';

export type TimelineStripItem =
  | {
    kind: 'shot';
    key: string;
    shot: Shot;
    index: number;
    startSeconds: number;
    durationSeconds: number;
  }
  | {
    kind: 'transition';
    key: string;
    fromShot: Shot;
    toShot: Shot;
    index: number;
    startSeconds: number;
    durationSeconds: number;
    transitionVideoUrl?: string;
  };

export function getTransitionDurationSeconds(shot: Shot | undefined) {
  return Math.max(4, Math.round(shot?.transitionVideoDuration || 4));
}

export function getTimelineTotalDuration(shots: Shot[]) {
  return shots.reduce((total, shot, index) => {
    const shotDuration = Math.max(0, Math.round(shot.duration || 0));
    const transitionDuration = shots[index + 1] ? getTransitionDurationSeconds(shot) : 0;
    return total + shotDuration + transitionDuration;
  }, 0);
}

export function getTimelineStripItems(shots: Shot[]): TimelineStripItem[] {
  const items: TimelineStripItem[] = [];
  let elapsedSeconds = 0;

  shots.forEach((shot, index) => {
    const shotDuration = Math.max(0, Math.round(shot.duration || 0));
    items.push({
      kind: 'shot',
      key: `shot-${shot.id}`,
      shot,
      index,
      startSeconds: elapsedSeconds,
      durationSeconds: shotDuration,
    });
    elapsedSeconds += shotDuration;

    const nextShot = shots[index + 1];
    if (nextShot) {
      const transitionDuration = getTransitionDurationSeconds(shot);
      items.push({
        kind: 'transition',
        key: `transition-${shot.id}-${nextShot.id}`,
        fromShot: shot,
        toShot: nextShot,
        index,
        startSeconds: elapsedSeconds,
        durationSeconds: transitionDuration,
        transitionVideoUrl: shot.transitionVideoUrl,
      });
      elapsedSeconds += transitionDuration;
    }
  });

  return items;
}
