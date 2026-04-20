import { AnimatePresence, motion } from 'motion/react';

type ThemeMode = 'light' | 'dark';

export type SeedanceErrorModalAction =
  | 'redo-images'
  | 'edit-references'
  | 'force-cancel-creative-video'
  | 'force-cancel-creative-transition';

export type SeedanceErrorModalPayload = {
  projectId?: string;
  shotId?: string;
  operationKey?: string;
};

export type SeedanceErrorModalState = {
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  action?: SeedanceErrorModalAction;
  actionLabel?: string;
  actionPayload?: SeedanceErrorModalPayload;
} | null;

type SeedanceErrorModalProps = {
  themeMode: ThemeMode;
  seedanceErrorModal: SeedanceErrorModalState;
  onClose: () => void;
  onAction: (action: SeedanceErrorModalAction, payload?: SeedanceErrorModalPayload) => void;
};

function getSeedanceErrorActionLabel(action: SeedanceErrorModalAction, explicitLabel?: string) {
  if (explicitLabel) {
    return explicitLabel;
  }

  if (action === 'redo-images') {
    return '返回重做图片';
  }
  if (action === 'edit-references') {
    return '返回编辑参考图';
  }
  return '强制取消';
}

export function SeedanceErrorModal({
  themeMode,
  seedanceErrorModal,
  onClose,
  onAction,
}: SeedanceErrorModalProps) {
  return (
    <AnimatePresence>
      {seedanceErrorModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`w-full max-w-xl rounded-3xl border shadow-2xl overflow-hidden ${themeMode === 'light'
              ? 'border-red-200 bg-stone-50'
              : 'border-red-500/20 bg-zinc-950'
              }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`px-6 py-6 border-b ${themeMode === 'light'
                ? 'border-red-100 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.18),rgba(255,247,237,0.95)_62%)]'
                : 'border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.18),rgba(24,24,27,0.94)_58%)]'
                }`}
            >
              <div className={`text-[11px] uppercase tracking-[0.26em] ${themeMode === 'light' ? 'text-red-500' : 'text-red-200/80'}`}>
                {seedanceErrorModal.eyebrow || (seedanceErrorModal.action ? 'Seedance Guardrail' : 'Fast Video Error')}
              </div>
              <h3 className={`mt-3 text-2xl font-semibold ${themeMode === 'light' ? 'text-stone-950' : 'text-white'}`}>{seedanceErrorModal.title}</h3>
              <p className={`mt-3 text-sm leading-6 ${themeMode === 'light' ? 'text-stone-700' : 'text-zinc-300'}`}>{seedanceErrorModal.message}</p>
            </div>

            <div className="px-6 py-5 space-y-4">
              {seedanceErrorModal.detail ? (
                <div className={`rounded-2xl border p-4 ${themeMode === 'light'
                  ? 'border-stone-200 bg-white'
                  : 'border-zinc-800 bg-zinc-900/70'
                  }`}>
                  <div className={`text-xs font-semibold uppercase tracking-[0.24em] ${themeMode === 'light' ? 'text-stone-500' : 'text-zinc-500'}`}>接口返回</div>
                  <div className={`mt-3 text-sm leading-6 whitespace-pre-wrap ${themeMode === 'light' ? 'text-stone-700' : 'text-zinc-300'}`}>
                    {seedanceErrorModal.detail}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className={`rounded-xl border px-4 py-2 text-sm transition-colors ${themeMode === 'light'
                    ? 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                    : 'border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                    }`}
                >
                  关闭
                </button>
                {seedanceErrorModal.action ? (
                  <button
                    type="button"
                    onClick={() => onAction(seedanceErrorModal.action!, seedanceErrorModal.actionPayload)}
                    className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-400 transition-colors"
                  >
                    {getSeedanceErrorActionLabel(seedanceErrorModal.action, seedanceErrorModal.actionLabel)}
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
