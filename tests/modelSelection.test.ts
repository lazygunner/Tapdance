import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultApiSettings } from '../src/services/apiConfig.ts';
import { getRoleModelSelectionOptions, resolveSelectionValue } from '../src/features/modelSelection/utils/modelSelection.ts';

test('video model selection includes Seedance 2.0 standard and fast API sources', () => {
  const options = getRoleModelSelectionOptions(defaultApiSettings, 'video');
  const seedanceStandard = options.find((option) => option.value === 'seedance.apiModel');
  const seedanceFast = options.find((option) => option.value === 'seedance.fastApiModel');

  assert.equal(seedanceStandard?.sourceId, 'seedance.apiModel');
  assert.equal(seedanceStandard?.modelName, defaultApiSettings.seedance.apiModel);
  assert.match(seedanceStandard?.label || '', /Seedance 2\.0/u);

  assert.equal(seedanceFast?.sourceId, 'seedance.fastApiModel');
  assert.equal(seedanceFast?.modelName, defaultApiSettings.seedance.fastApiModel);
  assert.match(seedanceFast?.label || '', /Seedance 2\.0 Fast/u);
});

test('Seedance API selection resolves to the configured model endpoint', () => {
  const resolved = resolveSelectionValue(defaultApiSettings, 'video', 'seedance.fastApiModel');

  assert.equal(resolved?.sourceId, 'seedance.fastApiModel');
  assert.equal(resolved?.modelName, defaultApiSettings.seedance.fastApiModel);
  assert.equal(resolved?.selectionValue, 'seedance.fastApiModel');
});

test('image model selection expands Gemini image catalog models', () => {
  const options = getRoleModelSelectionOptions(defaultApiSettings, 'image');
  const geminiImageModels = options
    .filter((option) => option.sourceId === 'gemini.imageModel')
    .map((option) => option.modelName);

  assert.ok(geminiImageModels.includes('gemini-2.5-flash-image'));
  assert.ok(geminiImageModels.includes('gemini-3.1-flash-image-preview'));
  assert.ok(geminiImageModels.includes('gemini-3-pro-image-preview'));
  assert.ok(options.some((option) => option.value === 'gemini.imageModel::gemini-2.5-flash-image'));

  const resolved = resolveSelectionValue(defaultApiSettings, 'image', 'gemini.imageModel::gemini-3.1-flash-image-preview');
  assert.equal(resolved?.sourceId, 'gemini.imageModel');
  assert.equal(resolved?.modelName, 'gemini-3.1-flash-image-preview');
});

test('legacy Gemini pro image source resolves to catalog image option without duplicating models', () => {
  const resolved = resolveSelectionValue(defaultApiSettings, 'image', 'gemini.proImageModel');

  assert.equal(resolved?.sourceId, 'gemini.imageModel');
  assert.equal(resolved?.modelName, defaultApiSettings.gemini.proImageModel);
  assert.equal(resolved?.selectionValue, `gemini.imageModel::${defaultApiSettings.gemini.proImageModel}`);
});
