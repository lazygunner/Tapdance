import { useEffect } from 'react';

type UseFastVideoTaskPollingArgs = {
  taskId?: string;
  submitId?: string;
  status?: string;
  pollIntervalSec: number;
  onRefreshTask: (taskId?: string) => Promise<void>;
};

export function useFastVideoTaskPolling({
  taskId,
  submitId,
  status,
  pollIntervalSec,
  onRefreshTask,
}: UseFastVideoTaskPollingArgs) {
  useEffect(() => {
    const activeTaskId = (taskId || submitId || '').trim();
    if (!activeTaskId || status !== 'generating') {
      return;
    }

    const interval = window.setInterval(() => {
      void onRefreshTask(activeTaskId);
    }, Math.max(5, pollIntervalSec) * 1000);

    return () => window.clearInterval(interval);
  }, [taskId, submitId, status, pollIntervalSec]);
}
