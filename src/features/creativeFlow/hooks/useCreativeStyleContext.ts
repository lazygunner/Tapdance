import { useMemo } from 'react';

import { applyStyleGuideToPrompt, buildStyleGuideText, findStylePresetById, getStylePresets } from '../../../services/styleCatalog.ts';
import type { Asset, Brief, Project, Shot } from '../../../types.ts';

export function useCreativeStyleContext(project: Project) {
  const stylePresets = getStylePresets();
  const inputAspectRatio = project.inputAspectRatio || project.brief?.aspectRatio || '16:9';
  const customStyleDescription = (project.customStyleDescription || '').trim();
  const activeStylePreset = customStyleDescription
    ? undefined
    : findStylePresetById(project.brief?.stylePresetId || project.selectedStyleId) || undefined;
  const activeStyleGuide = project.brief?.stylePrompt || customStyleDescription || buildStyleGuideText(activeStylePreset);

  const withStyledPrompt = useMemo(() => {
    return (prompt: string) => applyStyleGuideToPrompt(prompt, activeStyleGuide || '');
  }, [activeStyleGuide]);

  const withStyledBrief = useMemo(() => {
    return (brief: Brief): Brief => {
      if (customStyleDescription) {
        return {
          ...brief,
          style: brief.style || '自定义风格',
          stylePresetId: undefined,
          stylePrompt: brief.stylePrompt || customStyleDescription,
        };
      }

      if (activeStylePreset) {
        return {
          ...brief,
          style: activeStylePreset.name,
          stylePresetId: activeStylePreset.id,
          stylePrompt: brief.stylePrompt || activeStyleGuide,
        };
      }

      return brief;
    };
  }, [activeStyleGuide, activeStylePreset, customStyleDescription]);

  const getAssetGenerationBrief = useMemo(() => {
    return (): Brief | null => (project.brief ? withStyledBrief(project.brief) : null);
  }, [project.brief, withStyledBrief]);

  const withStyledShot = useMemo(() => {
    return (shot: Shot): Shot => ({
      ...shot,
      imagePrompt: shot.imagePrompt ? {
        ...shot.imagePrompt,
        basic: withStyledPrompt(shot.imagePrompt.basic),
        professional: withStyledPrompt(shot.imagePrompt.professional),
        lastFrameProfessional: shot.imagePrompt.lastFrameProfessional
          ? withStyledPrompt(shot.imagePrompt.lastFrameProfessional)
          : shot.imagePrompt.lastFrameProfessional,
      } : shot.imagePrompt,
      videoPrompt: shot.videoPrompt ? {
        ...shot.videoPrompt,
        textToVideo: withStyledPrompt(shot.videoPrompt.textToVideo),
        imageToVideo: withStyledPrompt(shot.videoPrompt.imageToVideo),
      } : shot.videoPrompt,
      transitionVideoPrompt: shot.transitionVideoPrompt ? withStyledPrompt(shot.transitionVideoPrompt) : shot.transitionVideoPrompt,
    });
  }, [withStyledPrompt]);

  return {
    stylePresets,
    inputAspectRatio,
    customStyleDescription,
    activeStylePreset,
    activeStyleGuide,
    withStyledPrompt,
    withStyledBrief,
    getAssetGenerationBrief,
    withStyledShot,
  };
}
