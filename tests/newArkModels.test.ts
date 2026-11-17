import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultApiSettings, getFlowOverrideOptions, resolveModelSource, setCachedApiSettings, loadApiSettings } from '../src/services/apiConfig.ts';
import { SEEDANCE_API_MODEL_KEYS, SEEDANCE_API_MODELS } from '../src/features/seedance/modelVersions.ts';
import { getSeedanceCapabilities, normalizeSeedanceDraftOptions } from '../src/features/seedance/capabilities.ts';
import { validateSeedanceDraft } from '../src/features/seedance/services/seedanceDraft.ts';
import { createSeedanceTask } from '../src/features/seedance/services/seedanceApiService.ts';
import { generateStoryboardImage } from '../src/services/volcengineService.ts';
import { createEmptyFastVideoProject, normalizeFastVideoProject } from '../src/features/fastVideoFlow/services/fastFlowMappers.ts';
import { normalizeCanvasFlow } from '../src/features/infiniteCanvas/types.ts';
import { getSeedanceCostEstimate } from '../src/features/fastVideoFlow/utils/seedanceCostEstimate.ts';
import type { SeedanceDraft } from '../src/features/seedance/types.ts';

function draft(): SeedanceDraft {
  return { baseTemplateId: 'free_text', overlayTemplateIds: [], assets: [], prompt: { rawPrompt: '清晨咖啡馆，镜头缓慢推进', diagnostics: [] }, options: { ratio: '16:9', duration: 4, resolution: '720p', outputFormat: 'mp4', generateAudio: true, returnLastFrame: false, useWebSearch: false, watermark: false } };
}

test('canvas model options include every Seedance tier and the independent Seedream 5.5 slot', () => {
  assert.equal(defaultApiSettings.volcengine.imageModel, 'doubao-seedream-5-0-260128');
  const videos = getFlowOverrideOptions(defaultApiSettings, 'video');
  for (const key of SEEDANCE_API_MODEL_KEYS) {
    const model = SEEDANCE_API_MODELS[key];
    assert.equal(videos.filter((option) => option.id === model.sourceId).length, 1);
    assert.equal(resolveModelSource(defaultApiSettings, model.sourceId), model.modelId);
  }
  assert.equal(resolveModelSource(defaultApiSettings, 'volcengine.seedream55ImageModel'), 'doubao-seedream-5-5-261028');
  assert.ok(getFlowOverrideOptions(defaultApiSettings, 'image').some((option) => option.id === 'volcengine.seedream55ImageModel'));
});

test('old settings gain new slots without replacing existing customized endpoints', () => {
  const previous = loadApiSettings();
  try {
    const settings = structuredClone(defaultApiSettings);
    delete settings.seedance.miniApiModel;
    delete settings.seedance.flashApiModel;
    delete settings.volcengine.seedream55ImageModel;
    settings.seedance.apiModel = 'ep-user-standard';
    settings.volcengine.imageModel = 'ep-user-image';
    const normalized = setCachedApiSettings(settings);
    assert.equal(normalized.seedance.miniApiModel, SEEDANCE_API_MODELS.mini.modelId);
    assert.equal(normalized.seedance.flashApiModel, SEEDANCE_API_MODELS.flash.modelId);
    assert.equal(normalized.seedance.apiModel, 'ep-user-standard');
    assert.equal(normalized.volcengine.imageModel, 'ep-user-image');
    assert.equal(normalized.volcengine.seedream55ImageModel, 'doubao-seedream-5-5-261028');
  } finally { setCachedApiSettings(previous); }
});

test('Mini/Fast and Flash enforce their own limits instead of inheriting standard/2.5 limits', () => {
  const value = draft();
  value.options.resolution = '1080p';
  value.options.duration = 30;
  value.options.outputFormat = 'mov';
  for (const key of ['mini', 'fast', 'flash'] as const) {
    const normalized = normalizeSeedanceDraftOptions(value, key);
    assert.equal(normalized.options.resolution, '720p');
    assert.equal(normalized.options.duration, key === 'flash' ? 30 : 10);
    assert.equal(normalized.options.outputFormat, key === 'flash' ? 'mov' : 'mp4');
  }
  assert.deepEqual([getSeedanceCapabilities('flash').maxImages, getSeedanceCapabilities('flash').maxVideos, getSeedanceCapabilities('flash').maxAudios], [10, 5, 5]);
  const audio = { ...draft(), baseTemplateId: 'audio_guided' as const, assets: [{ id: 'audio', kind: 'audio' as const, source: 'url' as const, role: 'reference_audio' as const, urlOrData: 'https://example.com/audio.mp3', durationSec: 5 }] };
  assert.equal(validateSeedanceDraft(audio, 'flash').errors.length, 0);
  assert.ok(validateSeedanceDraft(audio, 'mini').errors.some((message) => message.includes('仅输入音频无效')));
});

test('accepted task requests use each model endpoint and preserve Flash MOV output', async () => {
  const previousSettings = loadApiSettings(), previousFetch = globalThis.fetch;
  const requests: Array<Record<string, unknown>> = [];
  try {
    const settings = structuredClone(defaultApiSettings);
    settings.volcengine.apiKey = 'test-only-key';
    settings.volcengine.baseUrl = 'https://ark.example.test/api/v3';
    settings.seedance.miniApiModel = 'ep-custom-mini';
    setCachedApiSettings(settings);
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /\/contents\/generations\/tasks$/);
      requests.push(JSON.parse(String(options?.body)));
      return new Response(JSON.stringify({ id: `task-${requests.length}`, status: 'queued' }));
    };
    for (const key of SEEDANCE_API_MODEL_KEYS) {
      const value = draft();
      if (key === 'flash') value.options.outputFormat = 'mov';
      await createSeedanceTask(value, key);
      assert.equal(requests.at(-1)?.model, key === 'mini' ? 'ep-custom-mini' : SEEDANCE_API_MODELS[key].modelId);
    }
    assert.equal(requests[1].output_format, 'mov');
    assert.equal(requests[1].resolution, '720p');
  } finally { globalThis.fetch = previousFetch; setCachedApiSettings(previousSettings); }
});

test('Seedream 5.5 sends the official model ID and uppercase 2K through the image service', async () => {
  const previousSettings = loadApiSettings(), previousFetch = globalThis.fetch;
  try {
    const settings = structuredClone(defaultApiSettings);
    settings.volcengine.apiKey = 'test-only-key';
    settings.volcengine.baseUrl = 'https://ark.example.test/api/v3';
    setCachedApiSettings(settings);
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /\/images\/generations$/);
      const payload = JSON.parse(String(options?.body));
      assert.equal(payload.model, 'doubao-seedream-5-5-261028');
      assert.equal(payload.size, '2K');
      assert.match(payload.prompt, /16:9/);
      return new Response(JSON.stringify({ data: [{ url: 'https://example.test/result.png' }] }));
    };
    const result = await generateStoryboardImage('一杯咖啡', '16:9', resolveModelSource(settings, 'volcengine.seedream55ImageModel'), [], false, undefined);
    assert.equal(result, 'https://example.test/result.png');
  } finally { globalThis.fetch = previousFetch; setCachedApiSettings(previousSettings); }
});

test('new task tiers survive project reopen and do not report unconfigured pricing as free', () => {
  for (const key of ['mini', 'flash'] as const) {
    const project = createEmptyFastVideoProject();
    project.executionConfig.apiModelKey = key;
    assert.equal(normalizeFastVideoProject(project).executionConfig.apiModelKey, key);
    const flow = normalizeCanvasFlow({ nodes: [{ id: 'v', type: 'video', videoGenerationConfig: { sourceId: SEEDANCE_API_MODELS[key].sourceId, seedanceModelKey: key, seedanceDraft: draft() } }] });
    assert.equal(flow.nodes[0].videoGenerationConfig?.seedanceModelKey, key);
    assert.equal(flow.nodes[0].videoGenerationConfig?.sourceId, SEEDANCE_API_MODELS[key].sourceId);
    const estimate = getSeedanceCostEstimate(project.input, draft(), { executor: 'ark', apiModelKey: key, cliModelVersion: 'seedance2.0' });
    assert.equal(estimate.pricingAvailable, false);
    assert.match(estimate.billingLabel, /尚未配置单价/);
  }
});
