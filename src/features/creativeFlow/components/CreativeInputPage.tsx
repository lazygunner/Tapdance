import { FileText } from 'lucide-react';

import { StudioPage, StudioPageHeader, StudioPanel } from '../../../components/studio/StudioPrimitives.tsx';
import type { AspectRatio } from '../../../types.ts';

type StylePreset = {
  id: string;
  name: string;
  description: string;
  previewImage?: string;
  swatch: string;
  reversePrompt: string;
};

type CreativeInputPageProps = {
  idea: string;
  isGeneratingBrief: boolean;
  inputAspectRatio: AspectRatio;
  customStyleDescription: string;
  selectedStyleId: string;
  activeStylePreset?: Pick<StylePreset, 'name' | 'description'>;
  stylePresets: StylePreset[];
  aspectRatioOptions: Array<{ value: AspectRatio; label: string }>;
  onIdeaChange: (value: string) => void;
  onGenerateBrief: () => void;
  onInputAspectRatioChange: (value: AspectRatio) => void;
  onClearStyle: () => void;
  onCustomStyleDescriptionChange: (value: string) => void;
  onSelectStylePreset: (styleId: string) => void;
};

export function CreativeInputPage({
  idea,
  isGeneratingBrief,
  inputAspectRatio,
  customStyleDescription,
  selectedStyleId,
  activeStylePreset,
  stylePresets,
  aspectRatioOptions,
  onIdeaChange,
  onGenerateBrief,
  onInputAspectRatioChange,
  onClearStyle,
  onCustomStyleDescriptionChange,
  onSelectStylePreset,
}: CreativeInputPageProps) {
  return (
    <StudioPage>
      <StudioPageHeader
        eyebrow="Creative Intake"
        title="你的故事是什么？"
        description={(
          <p>
            先描述核心故事，再锁定画面比例和统一风格。这一页只负责输入与定调，不改后续业务链路。
          </p>
        )}
        actions={(
          <StudioPanel className="min-w-[16rem] px-5 py-4" tone="soft">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--studio-dim)]">Current Direction</div>
            <div className="mt-3 text-lg font-semibold text-[var(--studio-text)]">
              {customStyleDescription ? '自定义风格' : activeStylePreset?.name || '自动匹配'}
            </div>
            <div className="mt-2 text-sm leading-6 text-[var(--studio-muted)]">
              {customStyleDescription
                ? '本轮会优先使用你输入的风格描述。'
                : activeStylePreset?.description || '暂未显式指定风格，系统会按内容自动匹配。'}
            </div>
          </StudioPanel>
        )}
      />

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          <StudioPanel className="overflow-hidden p-2">
            <textarea
              value={idea}
              onChange={(event) => onIdeaChange(event.target.value)}
              placeholder="例如：在一个赛博朋克世界里，落魄调酒师发现自己被追杀，逃进雨夜霓虹街道，最后在天台举枪反抗。"
              className="studio-textarea h-56 border-0 bg-transparent p-5 shadow-none focus:border-0 focus:shadow-none"
            />
            <div className="flex justify-end px-3 pb-3">
              <button
                onClick={onGenerateBrief}
                disabled={isGeneratingBrief || !idea.trim()}
                className="studio-button studio-button-primary"
              >
                {isGeneratingBrief ? <img src="./assets/loading.gif" alt="" className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                生成简报
              </button>
            </div>
          </StudioPanel>

          <StudioPanel className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-[var(--studio-text)]">画面比例</h3>
                <p className="mt-1 text-[11px] text-[var(--studio-dim)]">支持 21:9、16:9、4:3、1:1、3:4、9:16，后续分镜和视频默认构图会跟随这里的设置。</p>
              </div>
              <div className="studio-segmented">
                {aspectRatioOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onInputAspectRatioChange(option.value)}
                    className={`studio-segmented-button ${inputAspectRatio === option.value ? 'active' : ''}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </StudioPanel>
        </div>

        <StudioPanel className="space-y-4 p-5" tone="soft">
          <div className="studio-eyebrow">Input Notes</div>
          <h3 className="text-xl font-semibold text-[var(--studio-text)]">创意输入的使用方式</h3>
          <ul className="space-y-3 text-sm leading-6 text-[var(--studio-muted)]">
            <li>故事描述尽量覆盖主角、场景、动作和情绪变化。</li>
            <li>比例决定后续分镜与视频默认构图，尽量先确认。</li>
            <li>如果你已经有明确风格，请直接在下方写清楚材质、光线和气质。</li>
          </ul>
        </StudioPanel>
      </div>

      <StudioPanel className="mt-6 p-5">
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-[var(--studio-text)]">风格清单</h3>
            <p className="mt-1 text-[11px] text-[var(--studio-dim)]">可直接选预设，也可以加入自己的风格描述；自定义内容优先生效。</p>
          </div>
          <button onClick={onClearStyle} className="studio-button studio-button-secondary">
            清空风格
          </button>
        </div>

        <StudioPanel className="mb-5 p-4" tone="soft">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-medium text-[var(--studio-text)]">自定义风格</h4>
              <p className="mt-1 text-[11px] text-[var(--studio-dim)]">例如：偏胶片颗粒的法式广告，奶油色调，慢门残影，产品高光要克制。</p>
            </div>
            {customStyleDescription ? (
              <span className="studio-accent-chip-sky inline-flex rounded-full border px-2.5 py-1 text-[10px]">当前生效</span>
            ) : null}
          </div>
          <textarea
            value={customStyleDescription}
            onChange={(event) => onCustomStyleDescriptionChange(event.target.value)}
            rows={3}
            placeholder="输入你自己的风格类型、气质、材质、光线、色彩和参考方向。"
            className="studio-textarea"
          />
        </StudioPanel>

        <div className="columns-1 sm:columns-2 gap-3">
          {stylePresets.map((style) => {
            const selected = !customStyleDescription && selectedStyleId === style.id;
            return (
              <button
                key={style.id}
                onClick={() => onSelectStylePreset(style.id)}
                className={`mb-3 w-full break-inside-avoid rounded-[1.35rem] border p-3 text-left transition-all ${selected ? 'border-sky-400/30 bg-sky-400/10' : 'border-white/10 bg-black/10 hover:border-white/18'}`}
              >
                <div
                  className="relative aspect-[16/7] overflow-hidden rounded-xl border border-white/6"
                  style={{ background: style.swatch }}
                >
                  {style.previewImage ? (
                    <>
                      <div
                        className="absolute inset-0 scale-110 opacity-30 blur-xl"
                        style={{
                          backgroundImage: `url(${style.previewImage})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/20" />
                      <img
                        src={style.previewImage}
                        alt={style.name}
                        className="relative z-10 h-full w-full object-contain"
                        loading="lazy"
                      />
                    </>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--studio-text)]">{style.name}</p>
                  {selected ? <span className="studio-accent-text-sky text-[10px]">已选择</span> : null}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--studio-muted)]">{style.description}</p>
                <p className="mt-2 line-clamp-3 text-[10px] text-[var(--studio-dim)]">{style.reversePrompt}</p>
              </button>
            );
          })}
        </div>
      </StudioPanel>
    </StudioPage>
  );
}
