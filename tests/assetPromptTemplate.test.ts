import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProductReferencePrompt } from '../src/services/assetPromptTemplate.ts';
import type { Asset, Brief } from '../src/types.ts';

const brief: Brief = {
  theme: '品牌广告',
  style: '高质感商业摄影',
  stylePrompt: 'clean studio lighting, premium commercial photography',
  characters: [],
  scenes: [],
  events: '主推新品上市',
  mood: '克制、专业',
  duration: '15s',
  aspectRatio: '9:16',
  platform: '抖音',
};

test('buildProductReferencePrompt creates a product-focused consistency prompt', () => {
  const asset: Asset = {
    id: 'product-1',
    type: 'product',
    name: '黑炉 F-01',
    description: '黑色金属桌面烧烤炉',
    productPrompt: {
      category: 'tabletop grill',
      materialFinish: 'matte black metal',
      heroFeatures: 'front vent holes, removable grill rack',
      logoBranding: 'engraved logo on front panel',
      avoidElements: 'hands, food crumbs',
    },
  };

  const prompt = buildProductReferencePrompt(asset, brief);

  assert.ok(prompt.includes('Product Consistency Reference Sheet'));
  assert.ok(prompt.includes('hero packshot'));
  assert.ok(prompt.includes('黑色金属桌面烧烤炉'));
  assert.ok(prompt.includes('engraved logo on front panel'));
  assert.ok(prompt.includes('Avoid: hands, food crumbs.'));
});
