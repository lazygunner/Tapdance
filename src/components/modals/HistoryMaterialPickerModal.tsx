import { AnimatePresence, motion } from 'motion/react';

import type { ProjectGroupImageAsset } from '../../services/projectGroups.ts';
import type { Shot } from '../../types.ts';

type ThemeMode = 'light' | 'dark';

type HistoryMaterialPickerState = {
  shotId: string;
  frameType: 'first' | 'last';
} | null;

type HistoryMaterialPickerModalProps = {
  themeMode: ThemeMode;
  historyMaterialPicker: HistoryMaterialPickerState;
  historyMaterialTargetShot?: Shot;
  availableHistoryMaterials: ProjectGroupImageAsset[];
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
};

export function HistoryMaterialPickerModal({
  themeMode,
  historyMaterialPicker,
  historyMaterialTargetShot,
  availableHistoryMaterials,
  onClose,
  onSelectImage,
}: HistoryMaterialPickerModalProps) {
  return (
    <AnimatePresence>
      {historyMaterialPicker && historyMaterialTargetShot && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <div
            className={`w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border ${themeMode === 'light' ? 'border-stone-300 bg-stone-50 text-stone-900' : 'border-zinc-800 bg-zinc-950 text-zinc-100'} shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${themeMode === 'light' ? 'border-stone-300 bg-stone-100/90' : 'border-zinc-800 bg-zinc-900/80'}`}>
              <div>
                <div className={`text-xs uppercase tracking-[0.24em] ${themeMode === 'light' ? 'text-stone-500' : 'text-zinc-500'}`}>History Materials</div>
                <h3 className="mt-2 text-2xl font-bold">
                  {historyMaterialPicker.frameType === 'first' ? '首帧' : '尾帧'}历史素材选择
                </h3>
                <p className={`mt-2 text-sm ${themeMode === 'light' ? 'text-stone-600' : 'text-zinc-400'}`}>
                  当前镜头：{historyMaterialTargetShot.shotNumber}。点击任意一张历史素材，会直接放置到当前{historyMaterialPicker.frameType === 'first' ? '首帧' : '尾帧'}位置。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${themeMode === 'light' ? 'border-stone-300 bg-white text-stone-700 hover:bg-stone-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}`}
              >
                关闭
              </button>
            </div>

            <div className="px-6 py-5 overflow-y-auto max-h-[70vh]">
              {availableHistoryMaterials.length === 0 ? (
                <div className={`rounded-xl border border-dashed p-8 text-center text-sm ${themeMode === 'light' ? 'border-stone-300 bg-stone-100 text-stone-500' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>
                  当前分组还没有可选的历史素材。
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {availableHistoryMaterials.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => onSelectImage(image.imageUrl)}
                      className={`rounded-xl border overflow-hidden text-left transition-colors ${themeMode === 'light' ? 'border-stone-300 hover:border-stone-400 bg-white' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900'}`}
                    >
                      <div className="relative aspect-square overflow-hidden bg-black/10">
                        <img src={image.imageUrl} alt={image.title} className="w-full h-full object-cover" />
                        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{image.sourceLabel}</span>
                      </div>
                      <div className="p-3">
                        <div className={`text-[11px] ${themeMode === 'light' ? 'text-stone-500' : 'text-zinc-500'}`}>{image.projectName}</div>
                        <div className="mt-1 text-sm line-clamp-2">{image.title}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
