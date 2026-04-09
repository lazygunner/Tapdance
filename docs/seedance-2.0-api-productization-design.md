# Seedance 2.0 API 产品化设计

## 1. 目标

本次不是把一个新模型 ID 塞进现有“生成视频”按钮，而是把 Seedance 2.0 的能力真正产品化为一套可选模板。

目标：

- 在“火山引擎”服务商下，新增官方 Seedance 2.0 API 接入。
- 用户在生成视频前，先选择“功能模板”。
- 模板不只服务 `fast-video`，最终应可复用于 `creative-video`、`ad-video`、`fast-video` 三条流程。
- 覆盖 Seedance 2.0 官方核心能力：
  - 文生视频
  - 首帧图生
  - 首尾帧图生
  - 多图参考
  - 视频参考
  - 音频参考
  - 视频编辑
  - 视频延长
  - 轨道补齐
  - 字幕 / 气泡台词 / 广告语 / Logo 等提示词型能力
  - 有声/无声、尾帧返回、联网搜索、任务查询/删除

非目标：

- 不把 `callback_url` 做成 v1 前端能力。当前仓库是前端主导 + 浏览器直连，继续采用轮询。
- 不把 Seedance 2.0 的所有字段都直接裸露给用户。对用户暴露的是模板和少量高级选项，复杂字段由模板编排层生成。

## 2. 当前现状与差距

当前仓库已经有两套与 Seedance 相关的能力，但都不够：

### 2.1 现有 Ark 视频接入过窄

`[volcengineService.ts](src/services/volcengineService.ts)` 当前的 `startVideoGeneration()` 只覆盖：

- `text`
- `first_frame`
- `last_frame`
- 基础分辨率 / 时长 / 画幅

缺失：

- `reference_image`
- `reference_video`
- `reference_audio`
- `return_last_frame`
- `generate_audio`
- `tools.web_search`
- `GET 列表`
- `DELETE 取消/删除`
- 模板化输入校验与提示词编排

### 2.2 现有 fast flow 过度绑定 CLI

`[FastVideoView.tsx](src/features/fastVideoFlow/components/FastVideoView.tsx)` + `[seedanceBridge.mjs](server/seedanceBridge.mjs)` 当前只适合“分镜图 -> 本地 dreamina multimodal2video”。

这条链路只适合一个窄场景：

- 先生成 1-2 张图
- 再把图喂给本地 CLI

它不等于官方 Seedance 2.0 API 的完整能力，也不适合作为“全量产品化”的主架构。

### 2.3 当前数据结构不够表达 Seedance 2.0

现有限制包括：

- `[types.ts](src/types.ts)` 中 `AspectRatio` 只有 `16:9 / 9:16 / 1:1 / 4:3`，缺少 `3:4 / 21:9 / adaptive`。
- `[fastTypes.ts](src/features/fastVideoFlow/types/fastTypes.ts)` 只有单张 `referenceImageUrl`，无法表达多图 / 多视频 / 多音频。
- 当前视频执行状态主要围绕 Gemini / CLI，尚未统一成 Ark Seedance 任务模型。

### 2.4 当前模型目录需要真实化

官方文档要求使用具体 `Model ID` 或 `Endpoint ID`。当前 `[modelCatalog.json](src/config/modelCatalog.json)` 里的 `Doubao-Seedance-2.0` 更像展示值，不应直接作为最终实现的默认请求值。

实现时应改为：

- 使用用户实际配置的 `Endpoint ID`
- 或提供明确的 Seedance 2.0 / 2.0 fast 专用字段

## 3. 设计原则

### 3.1 模板要拆成“主模板 + 叠加模板”

如果把“字幕”“Logo 露出”“口播”“视频编辑”“视频延长”全都做成互斥模板，组合会爆炸。

因此建议拆成两层：

- 主模板：决定底层 `content` 结构和必填素材
- 叠加模板：决定提示词模块和少量附加参数

### 3.2 Seedance 2.0 要走统一编排层，而不是散落在各 flow 中

建议新增一个共享的 Seedance 编排层，供三条流程复用：

- creative shot 视频生成
- ad segment 视频生成
- fast video 实验流

而不是让 `App.tsx` 继续堆条件分支。

### 3.3 模板驱动校验，禁止静默猜测

`docs/seedance2.0/SKILL.md` 明确要求：

- 缺失映射要显式补齐
- 冲突运镜不要静默改写
- 多图 / 多视频顺序必须确认

所以前端要在模板层做“必填校验 + 映射确认 + 风险提示”，而不是只给一个自由文本框。

### 3.4 保留 CLI，但不以 CLI 为主架构

CLI 可以继续保留，定位为：

- 本地快速实验
- 与现有 `fast-video` 兼容

但完整产品化应以 Ark Seedance API 为主。

## 4. 模板体系

## 4.1 主模板

| 主模板 ID | 用户意图 | 必填素材 | API content 映射 | 备注 |
|---|---|---|---|---|
| `free_text` | 纯文生视频 | 文本 | `text` | 最基础模板 |
| `first_frame` | 从首帧起视频 | 1 张图 | `image_url(role=first_frame)` | 可选文本 |
| `first_last_frame` | 首尾帧过渡 | 2 张图 | `first_frame + last_frame` | 当前 creative/ad 最容易先接入 |
| `multi_image_reference` | 多图参考生成 | 1-9 张图 | `image_url(role=reference_image)` | 适合主体一致性 / 多元素组合 / Logo 参考 |
| `motion_reference` | 参考动作生成新画面 | 1-3 段视频，必要时加图 | `video_url(role=reference_video)` + 可选图 | 本质是视频参考的动作模板 |
| `camera_reference` | 参考运镜生成新画面 | 1-3 段视频，必要时加图 | `video_url(role=reference_video)` + 可选图 | 本质是视频参考的运镜模板 |
| `effect_reference` | 参考特效迁移 | 1-3 段视频，必要时加图 | `video_url(role=reference_video)` + 可选图 | 本质是视频参考的特效模板 |
| `video_edit` | 对现有视频增删改 | 1 段视频，必要时加图 | `reference_video` + 可选 `reference_image` | 用于替换元素、增删物体 |
| `video_extend` | 向前/向后延长 | 1 段视频 | `reference_video` | 通过 prompt 说明前延/后延 |
| `video_stitch` | 轨道补齐/拼接 | 2-3 段视频 | 多个 `reference_video` | 用于视频衔接 |
| `audio_guided` | 用音频驱动画面或节奏 | 至少 1 个视觉素材 + 1-3 段音频 | `reference_image/video` + `reference_audio` | 不能只有音频 |

说明：

- `motion_reference / camera_reference / effect_reference` 在 API 上都是“视频参考”，差异主要体现在提示词骨架和 UI 文案，所以应做成不同模板，而不是不同接口。
- `audio_guided` 也可做成叠加模板，但从素材要求上看它会改变输入槽位，因此更适合作为主模板。

## 4.2 叠加模板

叠加模板不改变 API 主体结构，主要影响提示词和少量请求参数。

| 叠加模板 ID | 作用 | 典型参数 | API 影响 |
|---|---|---|---|
| `auto_audio` | 生成有声视频 | 开/关 | `generate_audio=true/false` |
| `subtitle` | 自动字幕 | 字幕来源、位置、时机 | 仅 prompt |
| `bubble_dialogue` | 气泡台词 | 角色、台词、时机 | 仅 prompt |
| `slogan` | 广告语/口号 | 文案、位置、出现方式 | 仅 prompt |
| `logo_reveal` | Logo 露出 | Logo 图、位置、时机 | prompt + 参考图槽位 |
| `return_last_frame` | 返回尾帧 | 开/关 | `return_last_frame=true` |
| `web_search` | 联网搜索 | 开/关 | `tools=[{type:'web_search'}]` |

设计上允许：

- 1 个主模板
- 0-N 个叠加模板

例如：

- `multi_image_reference + subtitle + auto_audio`
- `video_edit + slogan + logo_reveal`
- `first_last_frame + return_last_frame`

## 4.3 模板选择 UX

视频生成前新增一个统一步骤：`选择 Seedance 功能模板`

建议 UI 分为四块：

1. 模板画廊
2. 模板说明与必填素材清单
3. 动态素材槽位
4. 模板化提示词编辑器

交互规则：

- 选中主模板后，页面动态渲染对应素材槽位。
- 选中叠加模板后，页面插入额外参数表单。
- 缺素材时，提交按钮禁用。
- 模板切换时，保留可复用字段，清理不兼容字段。

## 5. 三条流程怎么接

## 5.1 creative-video

在单个 `Shot` 的视频执行区域新增“模板选择器”。

默认推荐：

- 有首帧无尾帧：推荐 `first_frame`
- 有首尾帧：推荐 `first_last_frame`
- 有多个角色/商品资产：推荐 `multi_image_reference`

额外能力：

- 允许从当前 `Shot` 的首帧/尾帧/参考资产一键映射到模板槽位
- 允许将尾帧回灌为下一镜头首帧候选

## 5.2 ad-video

广告片更适合 Seedance 的模板化能力，尤其是：

- `multi_image_reference`
- `logo_reveal`
- `subtitle`
- `slogan`
- `video_edit`

建议在 `AdSegment` 视频执行前也走同一套模板选择器，并允许：

- 一键把品牌 Logo 资产映射到 `logo_reveal`
- 一键把卖点文案映射到 `slogan`

## 5.3 fast-video

当前 fast flow 不要直接删除，但应重新定位为：

- `Seedance 快速实验场`
- 适合快速从 prompt + 图像参考进入视频任务

改造方向：

- 保留当前“自动拆分分镜图”的能力，作为某些模板的前置辅助
- 最终提交不再只走 CLI 图片链路，而是也能走统一的 Seedance API 草稿

结论：

- `fast-video` 保留
- 但不再等同于 “Seedance 功能全集”

## 6. 技术设计

## 6.1 新增共享领域模型

建议新增一套共享 Seedance 领域对象，而不是继续把状态塞在 `FastVideoProject` 或 `Shot.videoPrompt` 的自由字段里。

建议抽象：

```ts
type SeedanceBaseTemplateId =
  | 'free_text'
  | 'first_frame'
  | 'first_last_frame'
  | 'multi_image_reference'
  | 'motion_reference'
  | 'camera_reference'
  | 'effect_reference'
  | 'video_edit'
  | 'video_extend'
  | 'video_stitch'
  | 'audio_guided';

type SeedanceOverlayTemplateId =
  | 'auto_audio'
  | 'subtitle'
  | 'bubble_dialogue'
  | 'slogan'
  | 'logo_reveal'
  | 'return_last_frame'
  | 'web_search';

type SeedanceMediaKind = 'image' | 'video' | 'audio';
type SeedanceMediaSource = 'upload' | 'url' | 'asset';

interface SeedanceInputAsset {
  id: string;
  kind: SeedanceMediaKind;
  source: SeedanceMediaSource;
  urlOrData: string;
  role: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';
  label?: string;
}

interface SeedancePromptDraft {
  rawPrompt: string;
  optimizedPrompt?: string;
  diagnostics: string[];
}

interface SeedanceRequestOptions {
  modelId: string;
  ratio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive';
  duration?: number;
  generateAudio: boolean;
  returnLastFrame: boolean;
  useWebSearch: boolean;
  safetyIdentifier?: string;
}

interface SeedanceDraft {
  baseTemplateId: SeedanceBaseTemplateId;
  overlayTemplateIds: SeedanceOverlayTemplateId[];
  assets: SeedanceInputAsset[];
  prompt: SeedancePromptDraft;
  options: SeedanceRequestOptions;
}
```

挂载位置建议：

- `Shot.seedanceDraft?: SeedanceDraft`
- `AdSegment.seedanceDraft?: SeedanceDraft`
- `FastVideoProject.seedanceDraft?: SeedanceDraft`

## 6.2 模板注册表

新增模板注册表，例如：

- `src/features/seedance/config/seedanceTemplateRegistry.ts`

每个模板配置：

- 标题 / 描述
- 适用流程
- 必填素材槽位
- 可选素材槽位
- 推荐的提示词骨架
- 可用叠加模板
- 默认参数
- 提交前校验器

这样 UI 和请求组装都由同一份配置驱动。

## 6.3 请求编排器

新增两个核心编排器：

- `compileSeedanceContent(draft)`
- `compileSeedancePrompt(draft)`

其中：

- `compileSeedanceContent()` 负责把模板槽位映射成 Ark `content[]`
- `compileSeedancePrompt()` 负责把主模板 + 叠加模板合成最终 prompt

不建议继续复用当前 `buildVideoContent()`，因为它只理解：

- `text`
- `first_frame`
- `last_frame`

## 6.4 新的服务接口

建议新增显式的 Seedance API service，而不是继续把所有能力都塞进旧的 `startVideoGeneration()`。

建议接口：

- `createSeedanceTask(draft, sourceId)`
- `getSeedanceTask(taskId)`
- `listSeedanceTasks(filters)`
- `deleteSeedanceTask(taskId)`

对应官方接口：

- `POST /contents/generations/tasks`
- `GET /contents/generations/tasks/{id}`
- `GET /contents/generations/tasks`
- `DELETE /contents/generations/tasks/{id}`

这套 service 依然归属“火山引擎” provider，但不再伪装成通用 video API。

## 6.5 状态模型

官方 Ark 任务状态建议统一映射为：

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `expired`

前端本地状态可再包一层：

- `idle`
- `submitting`
- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`
- `expired`

同时保存：

- `taskId`
- `createdAt`
- `updatedAt`
- `videoUrl`
- `lastFrameUrl`
- `usage`
- `error`

## 6.6 结果持久化

官方文档约束：

- 视频结果 URL 24 小时后清理
- 最近任务列表仅保留 7 天

因此前端仍应继续做本地持久化：

- 视频下载结果本地保存
- 尾帧图片本地保存
- 请求草稿本地保存

这部分可以继续复用 `[mediaStorage.ts](src/services/mediaStorage.ts)`，但要新增尾帧存储键。

## 7. 关键实现注意点

## 7.1 画幅类型要扩展

Seedance 2.0 支持：

- `16:9`
- `4:3`
- `1:1`
- `3:4`
- `9:16`
- `21:9`
- `adaptive`

当前通用 `AspectRatio` 不够。

建议：

- 保留现有通用画幅给 Gemini / 老流程
- 新增 `SeedanceAspectRatio`

不要为了 Seedance 直接污染所有旧逻辑。

## 7.2 本地视频上传是一个真实问题

官方文档里：

- 图片支持 URL / Base64 / asset ID
- 音频支持 URL / Base64 / asset ID
- 视频只看到 URL / asset ID

这意味着：

- 本地图像、本地音频可以直接浏览器转 Base64
- 本地视频不能简单照搬当前图片上传策略

可选方案：

### 方案 A：v1 仅支持“视频 URL / asset ID”

优点：

- 实现最稳
- 不需要额外 bridge

缺点：

- 用户体验一般

### 方案 B：本地 bridge 负责接收视频并转临时可访问 URL

优点：

- 用户体验更完整

缺点：

- 需要新增本地服务能力
- 还要解决 Ark 可访问地址问题

当前更建议：

- v1 先走方案 A
- 本地视频上传作为单独二期

## 7.3 真人人脸限制要显式提示

官方文档明确写了 Seedance 2.0 对“直接上传含真人人脸的参考图/视频”有限制。

因此模板 UI 里要有风险提示：

- 检测到用户使用真人参考素材时提示限制
- 不要等任务失败后才告知

## 7.4 文本型功能不要做成 API 字段，要做成 prompt module

这些功能本质上不是不同接口：

- 字幕
- 气泡台词
- 广告语
- Logo 露出

它们应作为 prompt module 被主模板调用，而不是拆出一堆独立 service。

## 7.5 `return_last_frame` 对创意流价值很高

这个开关对连续镜头很有用，建议在 creative/ad 中默认可见：

- 当前镜头返回尾帧
- 一键“作为下一镜头首帧建议”

这会比现在单纯依赖手工尾帧图更顺。

## 8. 推荐实施顺序

## Phase 1：Seedance API 内核

- 扩展类型与模板注册表
- 新增 Seedance draft 模型
- 新增 Ark Seedance service
- 打通 create/get/delete

## Phase 2：fast-video 先行接入

- 让 fast flow 先消费统一的 Seedance draft
- 保留 CLI，但改成可选执行器
- 先验证模板选择、prompt 编排、任务状态

## Phase 3：creative/ad 接入

- 在 shot / ad segment 视频执行前新增模板选择器
- 做首帧/尾帧/资产到模板槽位的自动映射

## Phase 4：任务中心与链式生成

- 接入任务列表 API
- 增加取消 / 删除
- 增加“上一任务尾帧 -> 下一任务首帧”的串联能力

## 9. 需要确认的决策点

下面几项建议尽快拍板：

1. Seedance 模板系统是否要覆盖三条流程？
   我的建议：是。`fast-video` 先落地，但目标必须是 creative/ad/fast 共用一套模板模型。

2. 本地视频输入 v1 是否接受“仅 URL / asset ID”？
   我的建议：是。否则会被本地视频上传的可访问性问题拖住。

3. CLI 是否继续保留？
   我的建议：保留，但定位成“快速实验执行器”，官方产品化主路径走 Ark API。

4. 高级开关是否全部对用户可见？
   我的建议：
   - 对用户直接可见：模板、画幅、时长、有声/无声、尾帧返回、联网搜索
   - 放入高级区或内部默认：`safety_identifier`

5. 模型配置是否单独开 Seedance 2.0 / 2.0 fast 字段？
   我的建议：开。不要复用当前模糊的 `volcengine.videoModel` 单字段。

## 10. 我的实现建议

如果按稳妥路径推进，我建议下一步直接做这三件事：

1. 先把共享 `SeedanceDraft + 模板注册表 + Ark service` 建起来。
2. 先在 `fast-video` 落第一版模板选择器，验证整条链路。
3. 再把相同模板选择器嵌回 creative/ad 的视频执行区。

这条路径改动最可控，也最容易在中途验收。
