import { useRef, useState } from 'react';

import type { ModelInvocationLogEntry } from '../../../services/modelInvocationLog';

function buildOperationFromLogResponse(response: unknown): any | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const operation = response as Record<string, any>;
  if (typeof operation.taskId === 'string' && operation.taskId.trim()) {
    return {
      provider: operation.provider === 'gemini' ? 'gemini' : 'volcengine',
      taskId: operation.taskId,
    };
  }

  if (typeof operation.name === 'string' && operation.name.trim()) {
    return {
      provider: operation.provider === 'volcengine' ? 'volcengine' : 'gemini',
      name: operation.name,
    };
  }

  return undefined;
}

export function useOperationRegistry(modelInvocationLogs: ModelInvocationLogEntry[]) {
  const operationRegistryRef = useRef<Record<string, any>>({});
  const pendingOperationCancelsRef = useRef<Record<string, boolean>>({});
  const [pendingOperationCancels, setPendingOperationCancels] = useState<Record<string, boolean>>({});

  const setOperationCancelPending = (operationKey: string, pending: boolean) => {
    const current = pendingOperationCancelsRef.current;

    if (pending) {
      if (current[operationKey]) {
        return;
      }

      const next = { ...current, [operationKey]: true };
      pendingOperationCancelsRef.current = next;
      setPendingOperationCancels(next);
      return;
    }

    if (!current[operationKey]) {
      return;
    }

    const next = { ...current };
    delete next[operationKey];
    pendingOperationCancelsRef.current = next;
    setPendingOperationCancels(next);
  };

  const isOperationCancelPending = (operationKey: string) => Boolean(pendingOperationCancels[operationKey]);

  const hasPendingOperationCancel = (operationKey: string) => Boolean(pendingOperationCancelsRef.current[operationKey]);

  const setOperationRecord = (operationKey: string, operation?: any) => {
    if (operation) {
      operationRegistryRef.current = {
        ...operationRegistryRef.current,
        [operationKey]: operation,
      };
      return;
    }

    if (!operationRegistryRef.current[operationKey]) {
      return;
    }

    const next = { ...operationRegistryRef.current };
    delete next[operationKey];
    operationRegistryRef.current = next;
  };

  const getOperationRecord = (operationKey: string) => operationRegistryRef.current[operationKey];

  const findLoggedVideoOperation = (matcher: (entry: ModelInvocationLogEntry) => boolean) => {
    const entry = modelInvocationLogs.find((item) => (
      item.operation === 'startVideoGeneration'
      && item.status === 'success'
      && matcher(item)
    ));
    return buildOperationFromLogResponse(entry?.response);
  };

  const findLoggedShotVideoOperation = (shotId: string) => findLoggedVideoOperation((entry) => (
    typeof (entry.request as any)?.shot?.id === 'string'
    && (entry.request as any).shot.id === shotId
  ));

  const findLoggedTransitionVideoOperation = (firstFrameUrl?: string, lastFrameUrl?: string) => {
    const entry = modelInvocationLogs.find((item) => (
      item.operation === 'startTransitionVideoGeneration'
      && item.status === 'success'
      && ((entryRequest: any) => (
        (!firstFrameUrl || entryRequest?.firstFrameUrl === firstFrameUrl)
        && (!lastFrameUrl || entryRequest?.lastFrameUrl === lastFrameUrl)
      ))(item.request)
    ));

    return buildOperationFromLogResponse(entry?.response);
  };

  return {
    isOperationCancelPending,
    hasPendingOperationCancel,
    setOperationCancelPending,
    setOperationRecord,
    getOperationRecord,
    findLoggedShotVideoOperation,
    findLoggedTransitionVideoOperation,
  };
}
