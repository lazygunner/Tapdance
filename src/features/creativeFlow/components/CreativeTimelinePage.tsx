import type { ReactNode } from 'react';

import { Video } from 'lucide-react';
import { motion } from 'motion/react';

import type { Project } from '../../../types.ts';
import { getTimelineTotalDuration } from '../utils/timeline.ts';

type CreativeTimelinePageProps = {
  project: Project;
  renderTimelineStrip: () => ReactNode;
  onProceedToVideos: () => void;
};

export function CreativeTimelinePage({
  project,
  renderTimelineStrip,
  onProceedToVideos,
}: CreativeTimelinePageProps) {
  const totalDuration = getTimelineTotalDuration(project.shots);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">时间线预览</h2>
          <p className="text-zinc-400 text-sm mt-1">镜头的动态预览。</p>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium text-zinc-400 bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">
          <span>总时长：</span>
          <span className="text-white">{totalDuration}s</span>
        </div>
      </div>
      {renderTimelineStrip()}
      <div className="mt-8 flex justify-end">
        <button
          onClick={onProceedToVideos}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Video className="w-5 h-5" />
          前往视频生成
        </button>
      </div>
    </motion.div>
  );
}
