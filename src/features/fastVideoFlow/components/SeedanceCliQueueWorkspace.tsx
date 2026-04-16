import { useEffect, useState } from 'react';

import { CheckCircle2, Clock3, Loader2, Trash2, XCircle, AlertTriangle, Hourglass } from 'lucide-react';

import { StudioPage, StudioPanel, cx } from '../../../components/studio/StudioPrimitives.tsx';
import type { SeedanceCliQueueItem, SeedanceCliQueueItemStatus } from '../types/queueTypes.ts';

type Props = {
  items: SeedanceCliQueueItem[];
  activeCount: number;
  waitingCount: number;
  onCancelItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onClearTerminalItems: () => void;
  onClearWaitingItems: () => void;
};

const STATUS_LABELS: Record<SeedanceCliQueueItemStatus, string> = {
  queued: '排队中',
  submitting: '提交中',
  running: '生成中',
  retry_wait: '等待重试',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function getStatusTone(status: SeedanceCliQueueItemStatus) {
  if (status === 'completed') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'failed') return 'border-red-500/20 bg-red-500/10 text-red-200';
  if (status === 'cancelled') return 'border-zinc-700 bg-zinc-900 text-zinc-300';
  if (status === 'retry_wait') return 'border-amber-500/20 bg-amber-500/10 text-amber-100';
  return 'border-sky-500/20 bg-sky-500/10 text-sky-100';
}

function StatusIcon({ status }: { status: SeedanceCliQueueItemStatus }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'cancelled') return <XCircle className="h-4 w-4" />;
  if (status === 'retry_wait') return <Hourglass className="h-4 w-4" />;
  if (status === 'submitting' || status === 'running') return <Loader2 className="h-4 w-4 animate-spin" />;
  return <Clock3 className="h-4 w-4" />;
}

function formatTime(value?: string) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(durationMs?: number) {
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, Number(durationMs)) : 0;
  const totalSeconds = Math.floor(safeDurationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}小时${minutes}分`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  }
  return `${seconds}秒`;
}

function getWaitDurationMs(item: SeedanceCliQueueItem, currentTimeMs: number) {
  if (Number.isFinite(item.waitDurationMs)) {
    return Math.max(0, Number(item.waitDurationMs));
  }

  const createdAtMs = Date.parse(item.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return 0;
  }

  const isStillWaiting = item.status === 'queued' || item.status === 'retry_wait';
  const endMs = isStillWaiting
    ? currentTimeMs
    : Date.parse(item.startedAt || item.finishedAt || item.lastCheckedAt || '');

  return Math.max(0, (Number.isFinite(endMs) ? endMs : currentTimeMs) - createdAtMs);
}

function getQueuePosition(items: SeedanceCliQueueItem[], itemId: string) {
  const activeItems = items.filter((item) => item.status === 'queued' || item.status === 'retry_wait' || item.status === 'submitting' || item.status === 'running');
  const index = activeItems.findIndex((item) => item.id === itemId);
  return index >= 0 ? index + 1 : 0;
}

export function SeedanceCliQueueWorkspace({
  items,
  activeCount,
  waitingCount,
  onCancelItem,
  onRemoveItem,
  onClearTerminalItems,
  onClearWaitingItems,
}: Props) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const orderedItems = [...items].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const terminalCount = items.filter((item) => item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled').length;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <StudioPage className="studio-page-wide">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100">活跃 {activeCount}</span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">等待 {waitingCount}</span>
          <span className="text-sm text-[var(--studio-muted)]">队列完成或失败后会自动继续下一个任务。</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClearWaitingItems}
            disabled={waitingCount === 0}
            className="studio-button studio-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消等待任务
          </button>
          <button
            type="button"
            onClick={onClearTerminalItems}
            disabled={terminalCount === 0}
            className="studio-button studio-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            清理已结束
          </button>
        </div>
      </div>

      {orderedItems.length === 0 ? (
        <StudioPanel className="mt-5 px-8 py-14 text-center" tone="soft">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white">
            <Clock3 className="h-6 w-6" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-[var(--studio-text)]">当前没有本地排队任务</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--studio-muted)]">
            当 CLI 返回并发上限时，你可以把 fast-video 任务加入这里，前序任务完成后会自动提交。
          </p>
        </StudioPanel>
      ) : (
        <div className="mt-5 space-y-3">
          {orderedItems.map((item) => {
            const position = getQueuePosition(items, item.id);
            const waitDuration = getWaitDurationMs(item, currentTimeMs);
            const canCancel = item.status === 'queued' || item.status === 'retry_wait';
            const canRemove = item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled';
            return (
              <StudioPanel key={item.id} className="p-4" tone="soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', getStatusTone(item.status))}>
                        <StatusIcon status={item.status} />
                        {STATUS_LABELS[item.status]}
                      </span>
                      {position > 0 ? (
                        <span className="rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-2.5 py-1 text-xs text-[var(--studio-muted)]">
                          第 {position} 位 · 前方 {Math.max(0, position - 1)} 个
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-2.5 py-1 text-xs text-[var(--studio-muted)]">
                        等待 {formatDuration(waitDuration)}
                      </span>
                      {item.submitId ? <span className="font-mono text-xs text-[var(--studio-dim)]">{item.submitId}</span> : null}
                    </div>
                    <div className="mt-3 truncate text-base font-semibold text-[var(--studio-text)]">{item.label}</div>
                    <div className="mt-1 text-xs text-[var(--studio-muted)]">
                      {item.projectName}{item.groupName ? ` / ${item.groupName}` : ''} · 创建 {formatTime(item.createdAt)}
                      {item.nextRetryAt && item.status === 'retry_wait' ? ` · 下次重试 ${formatTime(item.nextRetryAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canCancel ? (
                      <button type="button" onClick={() => onCancelItem(item.id)} className="studio-button studio-button-secondary">
                        <XCircle className="h-4 w-4" />
                        取消
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button type="button" onClick={() => onRemoveItem(item.id)} className="studio-button studio-button-secondary">
                        <Trash2 className="h-4 w-4" />
                        移除
                      </button>
                    ) : null}
                  </div>
                </div>
              </StudioPanel>
            );
          })}
        </div>
      )}
    </StudioPage>
  );
}
