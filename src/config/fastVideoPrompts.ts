export const FAST_VIDEO_PROMPT_CONFIG = {
  quickCut: {
    tooltipDescription: `快速剪辑描述：
[第 0-2 秒] 极特写。一只手在破旧的木头案...
[第 2-4 秒] 特写。连续快速...
[第 4-6 秒] 特写。快速、极具冲击力地切开...`,
    promptLead: '该提示词详细描述了一段充满动作感的15秒视频，特点是每2秒一次的快速节奏剪辑、高能量、戏剧性的光影、手绘质感、动态模糊以及复古爵士美学。',
    referenceTimeline: `[第 0-2 秒] 极特写。一只手在破旧的木头案板上飞快地切葱，金属菜刀快到留下残影。葱花飞溅。粗犷的厨房背景，金属表面，反射着霓虹灯光。
[第 2-4 秒] 特写。连续快速、富有节奏的剪辑：大蒜瓣被粗暴地拍碎并迅速剁成蒜末。汁水四溅。强烈的动态阴影。
[第 4-6 秒] 特写。快速、极具冲击力地切开一颗熟透的红番茄，果肉和籽伴随着漫画式的运动线条喷发而出。电影级构图。
[第 6-8 秒] 中景。一只手以流畅且极快的动作，单手将鸡蛋完美地打入碗中，随后立刻开始疯狂搅拌。动态倾斜视角，强烈的视觉焦点。
[第 8-10 秒] 低角度动态镜头。冒着青烟的炒锅瞬间燃起猛烈的火焰。葱蒜和番茄被猛地掷入锅中。疯狂翻炒，食材在剧烈的颠勺中腾空跃起。画面中充满浓烈的烟雾与热气。
[第 10-12 秒] 广角镜头，动态平移。倒入蛋液，用金属大汤勺狂野地翻炒，在锅中形成一个黄色与红色交织的漩涡。
[第 12-14 秒] 特写，装盘。在杂乱的厨房工作台上，刚出锅、热气腾腾的番茄炒蛋被极其爽快地浇在了一大碗白米饭上。热气升腾，食物看起来极其诱人。
[第 14-15 秒] 极速快切。一个眼神犀利、带着机械臂的男人（类似杰特·布莱克 Jet Black）一脚踢开生锈的金属舱门。他咧嘴一笑，气场全开地大吼一声，同时屏幕上伴随着极具视觉冲击力的粗体字幕闪烁：“吃饭了！”`,
    requirements: [
      'Preserve the user prompt subject, setting, and core action intent whenever they are explicit.',
      'Use the quick-cut reference as the primary editing rhythm and camera-language template for the final video prompt rather than treating it as disposable flavor text.',
      'Emphasize a new visual beat roughly every 2 seconds; if the selected duration is not 15 seconds, compress or extend the cadence proportionally while keeping the same intensity.',
      'Inject high energy, dramatic light-shadow contrast, hand-drawn texture, dynamic motion blur, and retro jazz aesthetics into the final video prompt.',
      'Do not generate storyboard image prompts in quick-cut mode; express the full fast-cut progression in the final video prompt.',
      'End on a punchy, high-impact closing beat rather than a soft fade.',
    ],
    fallbackVideoPromptZhSuffix: '整体按快速剪辑节奏推进，大约每 2 秒切换一次高能动作节点，强化戏剧性光影、手绘质感、动态模糊与复古爵士美学，并以极具冲击力的结尾收束画面。',
  },
  plan: {
    role: 'You are designing a fast video generation workflow for a local Seedance CLI pipeline.',
    referenceWithImage: (count: number) => `The user provided ${count} reference image${count > 1 ? 's' : ''}. Treat them as the strongest visual anchors for subject identity, environment, composition language, and continuity. You must respect each image's declared type and any provided description. If multiple images are present, preserve the role of each image distinctly in the plan.`,
    referenceWithoutImage: 'No reference image is provided. Infer the visual anchors from the text prompt.',
    tasks: [
      'Decide how many storyboard scenes the idea needs based on visual complexity, pacing, and scene transitions.',
      'Write storyboard image prompts that are optimized for still-image generation, not video generation.',
      'Make consecutive scenes explicitly preserve continuity whenever they share the same subject, environment, or visual style.',
      'Write one final video prompt for Dreamina Seedance multimodal2video that uses the storyboard images as the visual anchors.',
    ],
    outputRequirements: [
      'All titles and Chinese reference strings must be in Simplified Chinese.',
      'imagePrompt must be a professional English prompt optimized for still-image model execution.',
      'imagePromptZh should be a faithful Chinese reference.',
      'videoPrompt.prompt and videoPrompt.promptZh must both be Simplified Chinese prompts suitable for Seedance execution.',
      'negativePrompt should be a concise execution-oriented negative prompt in English.',
      'negativePromptZh should be the Chinese reference version.',
      'The video prompt must focus on opening state, motion, transition/progression, continuity, style, and exclusions.',
      'Do not include markdown fences or any explanation outside JSON.',
    ],
    responseShape: `{
  "scenes": [
    {
      "title": "string",
      "imagePrompt": "string",
      "imagePromptZh": "string",
      "negativePrompt": "string",
      "negativePromptZh": "string"
    }
  ],
  "videoPrompt": {
    "prompt": "string",
    "promptZh": "string"
  }
}`,
  },
  fallback: {
    openingSceneTitle: '开场分镜',
    progressionSceneTitle: '推进分镜',
    openingScenePromptSuffix: 'cinematic still frame, opening state, detailed environment, realistic lighting, no text, no watermark',
    progressionScenePromptSuffix: 'cinematic still frame, later progression, detailed environment, realistic lighting, no text, no watermark',
    defaultNegativePrompt: 'blurry, low quality, watermark, text, deformed anatomy',
    defaultNegativePromptZh: '模糊，低质量，水印，文字，结构变形',
    videoPromptSuffix: 'Use the storyboard images as the same subject in a coherent cinematic video. Keep composition continuity, realistic motion, restrained camera movement, clean image, no text, no watermark.',
    videoPromptZhSuffix: '将这些分镜图作为同一主体的连续电影化视频，保持构图连续、动作真实、运镜克制，画面干净，无文字，无水印。',
  },
} as const;
