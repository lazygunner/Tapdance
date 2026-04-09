import { useRef, useState } from 'react';

import type { ProjectGroupImageAsset } from '../../../services/projectGroups.ts';
import type { Project } from '../../../types.ts';

export type HistoryMaterialPickerState = {
  shotId: string;
  frameType: 'first' | 'last';
} | null;

export function useCreativeFlowUiState(project: Project, currentGroupImageAssets: ProjectGroupImageAsset[]) {
  const [frameEditPrompts, setFrameEditPrompts] = useState<Record<string, string>>({});
  const [historyMaterialPicker, setHistoryMaterialPicker] = useState<HistoryMaterialPickerState>(null);
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null);
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null);
  const videoSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const transitionSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToVideoSection = (shotId: string) => {
    const section = videoSectionRefs.current[shotId];
    if (!section) {
      return;
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToTransitionSection = (fromShotId: string) => {
    const section = transitionSectionRefs.current[fromShotId];
    if (!section) {
      return;
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const historyMaterialTargetShot = historyMaterialPicker
    ? project.shots.find((shot) => shot.id === historyMaterialPicker.shotId)
    : undefined;
  const availableHistoryMaterials = historyMaterialTargetShot
    ? currentGroupImageAssets.filter((item) => item.imageUrl !== historyMaterialTargetShot.imageUrl && item.imageUrl !== historyMaterialTargetShot.lastFrameImageUrl)
    : [];

  return {
    frameEditPrompts,
    setFrameEditPrompts,
    historyMaterialPicker,
    setHistoryMaterialPicker,
    draggingShotId,
    setDraggingShotId,
    dragOverShotId,
    setDragOverShotId,
    videoSectionRefs,
    transitionSectionRefs,
    scrollToVideoSection,
    scrollToTransitionSection,
    historyMaterialTargetShot,
    availableHistoryMaterials,
  };
}
