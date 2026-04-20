import type { ApiSettings, Asset, Brief, ModelSourceId, PromptLanguage, Shot } from '../../../types.ts';
import { getPromptLanguageBySourceId } from '../../modelSelection/utils/modelSelection.ts';

export function pickLocalizedPrompt(language: PromptLanguage, englishPrompt?: string, chinesePrompt?: string, fallback: string = '') {
  const english = (englishPrompt || '').trim();
  const chinese = (chinesePrompt || '').trim();
  const baseFallback = fallback.trim();

  if (language === 'zh') {
    return chinese || english || baseFallback;
  }

  return english || chinese || baseFallback;
}

export function getShotImagePromptBySource(apiSettings: ApiSettings, shot: Shot, sourceId: ModelSourceId, frame: 'first' | 'last') {
  const language = getPromptLanguageBySourceId(apiSettings, sourceId);
  if (frame === 'last') {
    return pickLocalizedPrompt(
      language,
      shot.imagePrompt?.lastFrameProfessional,
      shot.imagePrompt?.lastFrameProfessionalZh,
      shot.action,
    );
  }

  return pickLocalizedPrompt(
    language,
    shot.imagePrompt?.professional,
    shot.imagePrompt?.professionalZh,
    shot.action,
  );
}

export function getShotVideoPromptBySource(apiSettings: ApiSettings, shot: Shot, sourceId: ModelSourceId) {
  const language = getPromptLanguageBySourceId(apiSettings, sourceId);
  return pickLocalizedPrompt(
    language,
    shot.videoPrompt?.textToVideo,
    shot.videoPrompt?.textToVideoZh,
    shot.action,
  );
}

export function getShotVideoPromptByLanguage(shot: Shot, language: PromptLanguage) {
  return pickLocalizedPrompt(
    language,
    shot.videoPrompt?.textToVideo,
    shot.videoPrompt?.textToVideoZh,
    shot.action,
  );
}

export function formatTimelineSecond(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const fixed = Math.max(value, 0).toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

export function buildShotTimelineSegments(duration: number) {
  const safeDuration = Math.max(1, Number.isFinite(duration) ? duration : 3);
  const p1 = safeDuration * 0.34;
  const p2 = safeDuration * 0.67;
  return [
    { start: 0, end: p1 },
    { start: p1, end: p2 },
    { start: p2, end: safeDuration },
  ];
}

export function buildVideoExecutionPromptByLanguage(
  shot: Shot,
  language: PromptLanguage,
  referenceAssets: Asset[],
  applyStyledPrompt: (prompt: string) => string,
) {
  const basePrompt = applyStyledPrompt((shot.action || '').trim() || getShotVideoPromptByLanguage(shot, language));
  const segments = buildShotTimelineSegments(shot.duration);
  const subject = shot.subject || (language === 'zh' ? '主角' : 'the main subject');
  const action = shot.action || (language === 'zh' ? '推进剧情动作' : 'advance the narrative action');
  const mood = shot.mood || (language === 'zh' ? '自然' : 'natural');
  const dialog = (shot.dialog || '').trim();
  const movement = shot.cameraMovement || (language === 'zh' ? '平滑跟拍' : 'smooth tracking');
  const transition = shot.transition || (language === 'zh' ? '自然衔接' : 'natural transition');
  const referenceNames = referenceAssets.map((asset) => asset.name).filter(Boolean);

  if (language === 'zh') {
    const zhLines = [
      `镜头设定：景别 ${shot.shotSize || '中景'}，机位 ${shot.cameraAngle || '平视'}，运镜 ${movement}，总时长 ${Math.max(1, Math.round(shot.duration || 1))} 秒。`,
      `剧情目标：围绕“${subject}”执行“${action}”，情绪保持“${mood}”。`,
      '时间轴分段执行（严格按秒）：',
      `- ${formatTimelineSecond(segments[0].start)}秒-${formatTimelineSecond(segments[0].end)}秒：角色进入状态并开始动作，产生明确位移，表情先克制后逐步展开；镜头以${movement}建立空间关系。`,
      `- ${formatTimelineSecond(segments[1].start)}秒-${formatTimelineSecond(segments[1].end)}秒：动作主段，位移连续，表情变化明显，强调肢体节奏与视线方向；镜头继续${movement}并保持主体在构图安全区。`,
      dialog
        ? `- 台词要求：在${formatTimelineSecond(segments[1].start)}秒-${formatTimelineSecond(segments[2].end)}秒说出台词“${dialog}”，口型、停顿和情绪一致。`
        : '- 台词要求：本镜头无台词，用呼吸、眼神和肢体细节表达情绪。',
      `- ${formatTimelineSecond(segments[2].start)}秒-${formatTimelineSecond(segments[2].end)}秒：动作收束并形成可衔接下一镜头的结束姿态，镜头以“${transition}”的视觉节奏结束。`,
      referenceNames.length > 0 ? `一致性约束：保持资产一致（${referenceNames.join('、')}），服装、场景与道具不可突变。` : '',
      `风格补充：${basePrompt}`,
      '质量约束：动作连贯、物理合理、避免跳帧和突兀变形。',
    ];
    return zhLines.filter(Boolean).join('\n');
  }

  const enLines = [
    `Shot setup: ${shot.shotSize || 'medium shot'}, ${shot.cameraAngle || 'eye-level'} angle, camera movement ${movement}, total duration ${Math.max(1, Math.round(shot.duration || 1))}s.`,
    `Narrative goal: focus on "${subject}" to "${action}" with a "${mood}" emotional arc.`,
    'Timeline execution (strictly time-coded):',
    `- ${formatTimelineSecond(segments[0].start)}s-${formatTimelineSecond(segments[0].end)}s: establish scene and starting pose, begin movement with clear blocking shift, facial expression starts restrained and opens up; camera uses ${movement} to lock spatial continuity.`,
    `- ${formatTimelineSecond(segments[1].start)}s-${formatTimelineSecond(segments[1].end)}s: main action beat, continuous movement path, visible expression change, readable body rhythm and eye-line; keep ${movement} while preserving safe framing of the subject.`,
    dialog
      ? `- Dialogue beat: deliver "${dialog}" during ${formatTimelineSecond(segments[1].start)}s-${formatTimelineSecond(segments[2].end)}s with synchronized lip movement, pauses, and emotion.`
      : '- Dialogue beat: no spoken line; convey emotion through breathing, eyes, and body language.',
    `- ${formatTimelineSecond(segments[2].start)}s-${formatTimelineSecond(segments[2].end)}s: resolve motion into an ending pose that connects to next shot; finish with a "${transition}" visual rhythm.`,
    referenceNames.length > 0 ? `Consistency constraints: preserve these assets exactly (${referenceNames.join(', ')}); no sudden costume, prop, or environment drift.` : '',
    `Style extension: ${basePrompt}`,
    'Quality constraints: smooth motion, physically plausible dynamics, no temporal jitter or morphing artifacts.',
  ];
  return enLines.filter(Boolean).join('\n');
}

export function buildVideoExecutionPrompt(
  apiSettings: ApiSettings,
  shot: Shot,
  sourceId: ModelSourceId,
  referenceAssets: Asset[],
  applyStyledPrompt: (prompt: string) => string,
) {
  const language = getPromptLanguageBySourceId(apiSettings, sourceId);
  return buildVideoExecutionPromptByLanguage(shot, language, referenceAssets, applyStyledPrompt);
}

export function buildDualModeVideoPrompts(
  shot: Shot,
  referenceAssets: Asset[],
  applyStyledPrompt: (prompt: string) => string,
) {
  const zhPrompt = buildVideoExecutionPromptByLanguage(shot, 'zh', referenceAssets, applyStyledPrompt);
  const enPrompt = buildVideoExecutionPromptByLanguage(shot, 'en', referenceAssets, applyStyledPrompt);
  return {
    ...(shot.videoPrompt || {
      textToVideo: '',
      textToVideoZh: '',
      imageToVideo: '',
      imageToVideoZh: '',
    }),
    textToVideo: enPrompt,
    imageToVideo: enPrompt,
    textToVideoZh: zhPrompt,
    imageToVideoZh: zhPrompt,
  };
}

export function getTransitionPromptBySource(apiSettings: ApiSettings, shot: Shot, sourceId: ModelSourceId) {
  const language = getPromptLanguageBySourceId(apiSettings, sourceId);
  return pickLocalizedPrompt(
    language,
    shot.transitionVideoPrompt,
    shot.transitionVideoPromptZh,
    'A smooth and natural transition between the two scenes',
  );
}

export function buildFallbackTransitionPrompt(currentShot: Shot, nextShot: Shot, brief: Brief): { prompt: string; promptZh: string } {
  const currentFrame = currentShot.imagePrompt?.lastFrameProfessional
    || currentShot.imagePrompt?.professional
    || currentShot.action
    || currentShot.subject
    || 'the current shot';
  const nextFrame = nextShot.imagePrompt?.professional
    || nextShot.action
    || nextShot.subject
    || 'the next shot';
  const currentFrameZh = currentShot.imagePrompt?.lastFrameProfessionalZh
    || currentShot.imagePrompt?.professionalZh
    || currentShot.action
    || currentShot.subject
    || '当前镜头';
  const nextFrameZh = nextShot.imagePrompt?.professionalZh
    || nextShot.action
    || nextShot.subject
    || '下一个镜头';
  const style = brief.stylePrompt?.trim() || brief.style || 'cinematic';
  const styleZh = brief.stylePrompt?.trim() || brief.style || '电影感';
  const transition = currentShot.transition || 'smooth match cut';
  const cameraMovement = currentShot.cameraMovement || nextShot.cameraMovement || 'smooth camera movement';
  const mood = nextShot.mood || currentShot.mood || brief.mood || 'natural continuity';

  return {
    prompt: [
      `Create a smooth cinematic transition from "${currentFrame}" to "${nextFrame}".`,
      `Use ${transition} with ${cameraMovement}, preserving visual continuity, lighting direction, character placement, and spatial logic.`,
      `The emotional tone should shift toward "${mood}" while maintaining ${style} style.`,
      'Avoid sudden jumps, warped anatomy, flicker, abrupt background changes, and inconsistent props.',
    ].join(' '),
    promptZh: [
      `从“${currentFrameZh}”自然过渡到“${nextFrameZh}”。`,
      `使用“${transition}”的转场方式，配合“${cameraMovement}”，保持光线方向、人物位置、空间关系和道具连续。`,
      `情绪逐步过渡到“${mood}”，整体维持“${styleZh}”风格。`,
      '避免突然跳切、肢体变形、闪烁、背景突变和道具不一致。',
    ].join(' '),
  };
}
