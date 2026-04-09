import { Clapperboard, Film, Image as ImageIcon, PlaySquare, Trash2, Users, Video } from 'lucide-react';

import { collectProjectPreviewImages } from '../../../services/projectGroups.ts';
import type { Project } from '../../../types.ts';

type ProjectCardProps = {
  project: Project;
  groupName: string;
  projectTypeLabel: string;
  summary: string;
  createdAtLabel: string;
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => void;
};

export function ProjectCard({
  project,
  groupName,
  projectTypeLabel,
  summary,
  createdAtLabel,
  onOpen,
  onDelete,
}: ProjectCardProps) {
  const isCreativeCard = project.projectType === 'creative-video';
  const projectName = project.name.trim() || '未命名项目';
  const previewImages = collectProjectPreviewImages(project);
  const cardBorderClass = isCreativeCard
    ? 'border-zinc-800 hover:border-indigo-500/50'
    : 'border-zinc-800 hover:border-sky-500/50';
  const badgeClass = isCreativeCard
    ? 'studio-accent-chip-indigo'
    : 'studio-accent-chip-sky';
  const nameClass = isCreativeCard
    ? 'text-white group-hover:text-indigo-400'
    : 'text-white group-hover:text-sky-300';

  return (
    <div
      key={project.id}
      className={`group cursor-pointer rounded-[1.6rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))] p-6 shadow-[0_22px_44px_rgba(2,6,23,0.16)] transition-all duration-300 hover:-translate-y-0.5 ${cardBorderClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(project);
        }
      }}
    >
      <div className="relative mb-5 pr-10">
        <div className="min-w-0">
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeClass}`}>
            {isCreativeCard ? <Clapperboard className="w-3.5 h-3.5" /> : <PlaySquare className="w-3.5 h-3.5" />}
            {projectTypeLabel}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className={`min-w-0 flex-1 truncate text-xl font-semibold ${nameClass}`} title={projectName}>
              {projectName}
            </div>
            <div className="ml-auto flex max-w-[48%] min-w-0 shrink-0 items-center justify-end gap-2 text-right text-sm">
              <div className="truncate text-[var(--studio-muted)]" title={`分组 · ${groupName}`}>
                分组 · {groupName}
              </div>
              <span className="shrink-0 text-[var(--studio-dim)]">·</span>
              <div className="shrink-0 whitespace-nowrap text-[var(--studio-dim)]" title={`创建时间 ${createdAtLabel}`}>
                {createdAtLabel}
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(project);
          }}
          className="absolute right-0 top-0 rounded-xl p-2 text-[var(--studio-dim)] transition-colors hover:bg-red-400/10 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <p className="mb-5 min-h-10 line-clamp-2 text-sm leading-6 text-[var(--studio-muted)]">{summary}</p>

      {previewImages.length > 0 ? (
        <div className="mb-5 flex items-center gap-3 overflow-hidden">
          <div className="flex shrink-0 items-center gap-1 text-[11px] uppercase tracking-[0.22em] text-[var(--studio-dim)]">
            <ImageIcon className="h-3.5 w-3.5" />
            图片素材
          </div>
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
            {previewImages.map((imageUrl, index) => (
              <div
                key={`${project.id}-preview-${index}`}
                className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5"
              >
                <img
                  src={imageUrl}
                  alt={`${projectName} 缩略图 ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-xs text-[var(--studio-dim)]">
        {isCreativeCard ? (
          <>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {project.assets.length} 资产</span>
            <span className="flex items-center gap-1"><Film className="w-3 h-3" /> {project.shots.length} 镜头</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {project.fastFlow.scenes.length} 分镜</span>
            <span className="flex items-center gap-1"><Video className="w-3 h-3" /> {project.fastFlow.task.taskId || project.fastFlow.task.submitId ? '已提交' : '未提交'}</span>
          </>
        )}
      </div>
    </div>
  );
}
