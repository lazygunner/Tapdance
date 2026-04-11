import { RefreshCw } from 'lucide-react';

import type { SeedanceHealth } from '../types/fastTypes.ts';

type SeedanceHealthPanelProps = {
  seedanceHealth: SeedanceHealth | null;
  isRefreshingSeedanceHealth: boolean;
  onRefreshSeedanceHealth: () => void | Promise<void>;
};

export function SeedanceHealthPanel({
  seedanceHealth,
  isRefreshingSeedanceHealth,
  onRefreshSeedanceHealth,
}: SeedanceHealthPanelProps) {
  return (
    <div className="space-y-3">
      {seedanceHealth?.error ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {seedanceHealth.error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void onRefreshSeedanceHealth()}
        disabled={isRefreshingSeedanceHealth}
        className={`rounded-xl border px-4 py-2 text-sm transition-colors ${isRefreshingSeedanceHealth ? 'border-zinc-800 text-zinc-600 cursor-not-allowed' : 'border-zinc-700 text-white hover:bg-zinc-800'}`}
      >
        {isRefreshingSeedanceHealth ? <span className="inline-flex items-center gap-2"><img src="./assets/loading.gif" alt="" className="w-4 h-4" />检查中</span> : <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />重新检查</span>}
      </button>
    </div>
  );
}
