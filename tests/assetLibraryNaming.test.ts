import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAssetLibraryFileName } from '../server/assetLibraryNaming.mjs';

function sanitizePathSegment(value: unknown, fallback = 'untitled') {
  const normalized = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^\.+|\.+$/gu, '')
    .trim();
  const compact = normalized || fallback;
  return compact.slice(0, 80);
}

function getMimeExtension(mimeType: unknown, kind: 'image' | 'video') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('webm')) return 'webm';
  return kind === 'video' ? 'mp4' : 'png';
}

test('buildAssetLibraryFileName keeps clipboard images unique even when filenames match', () => {
  const first = buildAssetLibraryFileName({
    assetId: 'project-1:fast-reference:ref-a',
    title: '参考图 1',
    fileName: 'image.png',
    mimeType: 'image/png',
    kind: 'image',
    sanitizePathSegment,
    getMimeExtension,
  });

  const second = buildAssetLibraryFileName({
    assetId: 'project-1:fast-reference:ref-b',
    title: '参考图 2',
    fileName: 'image.png',
    mimeType: 'image/png',
    kind: 'image',
    sanitizePathSegment,
    getMimeExtension,
  });

  assert.notEqual(first, second);
  assert.match(first, /\.png$/u);
  assert.match(second, /\.png$/u);
});

test('buildAssetLibraryFileName stays deterministic for the same asset slot', () => {
  const first = buildAssetLibraryFileName({
    assetId: 'project-1:fast-reference:ref-a',
    title: '参考图 1',
    fileName: 'image.png',
    mimeType: 'image/png',
    kind: 'image',
    sanitizePathSegment,
    getMimeExtension,
  });

  const second = buildAssetLibraryFileName({
    assetId: 'project-1:fast-reference:ref-a',
    title: '参考图 1',
    fileName: 'another-name.png',
    mimeType: 'image/png',
    kind: 'image',
    sanitizePathSegment,
    getMimeExtension,
  });

  assert.equal(first, second);
});
