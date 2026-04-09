import type { Shot } from '../../../types.ts';

export type TimelineStripItem =
  | {
    kind: 'shot';
    key: string;
    shot: Shot;
    index: number;
    startSeconds: number;
  }
  | {
    kind: 'transition';
    key: string;
    fromShot: Shot;
    toShot: Shot;
    index: number;
    startSeconds: number;
  };

export function getTimelineStripItems(shots: Shot[]): TimelineStripItem[] {
  const items: TimelineStripItem[] = [];
  let elapsedSeconds = 0;

  shots.forEach((shot, index) => {
    items.push({
      kind: 'shot',
      key: `shot-${shot.id}`,
      shot,
      index,
      startSeconds: elapsedSeconds,
    });
    elapsedSeconds += shot.duration;

    const nextShot = shots[index + 1];
    if (nextShot) {
      items.push({
        kind: 'transition',
        key: `transition-${shot.id}-${nextShot.id}`,
        fromShot: shot,
        toShot: nextShot,
        index,
        startSeconds: elapsedSeconds,
      });
    }
  });

  return items;
}
