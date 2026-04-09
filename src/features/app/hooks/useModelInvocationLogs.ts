import { useEffect, useState } from 'react';

import {
  MODEL_INVOCATION_LOG_EVENT,
  hydrateModelInvocationLogs,
  loadModelInvocationLogs,
  type ModelInvocationLogEntry,
} from '../../../services/modelInvocationLog.ts';

export function useModelInvocationLogs() {
  const [modelInvocationLogs, setModelInvocationLogs] = useState<ModelInvocationLogEntry[]>(() => loadModelInvocationLogs());

  useEffect(() => {
    void hydrateModelInvocationLogs().then((logs) => {
      setModelInvocationLogs(logs);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleLogUpdate = () => setModelInvocationLogs(loadModelInvocationLogs());
    window.addEventListener(MODEL_INVOCATION_LOG_EVENT, handleLogUpdate);
    return () => window.removeEventListener(MODEL_INVOCATION_LOG_EVENT, handleLogUpdate);
  }, []);

  return {
    modelInvocationLogs,
  };
}
