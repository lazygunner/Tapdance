import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { createAppStateStore } from './appStateStore.mjs';

const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.SEEDANCE_BRIDGE_PORT || 3210);
const cliBin = (process.env.SEEDANCE_CLI_BIN || 'dreamina').trim() || 'dreamina';
const bridgeRoot = join(tmpdir(), 'renren-ai-video', 'seedance');
const persistentDataRoot = resolve(process.env.RENREN_APP_DATA_DIR || join(process.cwd(), 'local_data'));
const bridgeConfigPath = join(persistentDataRoot, 'bridge-config.json');
const appStateStore = createAppStateStore(join(persistentDataRoot, 'app-state.sqlite'));
const defaultAssetLibraryRoot = resolve(process.cwd(), 'local_asset_library');
const allowedVideoExtensions = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi']);
const supportedModelVersions = ['seedance2.0', 'seedance2.0fast', 'seedance2.0_vip', 'seedance2.0fast_vip'];

app.use(express.json({ limit: '100mb' }));
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS,DELETE');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  next();
});

function taskDir(submitId) {
  return join(bridgeRoot, 'tasks', submitId);
}

function uploadDir(projectId, uploadId) {
  return join(bridgeRoot, 'uploads', projectId, uploadId);
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown error');
}

function extractJsonCandidate(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  const directCandidates = [trimmed];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    directCandidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of directCandidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Continue searching.
    }
  }

  return '';
}

function parseCommandJson(stdout, stderr) {
  const candidate = extractJsonCandidate(stdout) || extractJsonCandidate(`${stdout}\n${stderr}`);
  if (!candidate) {
    throw new Error((stderr || stdout || '命令未返回可解析 JSON').trim());
  }

  return JSON.parse(candidate);
}

async function runDreaminaJson(args) {
  try {
    const { stdout, stderr } = await execFileAsync(cliBin, args, {
      cwd: bridgeRoot,
      maxBuffer: 20 * 1024 * 1024,
    });

    return {
      payload: parseCommandJson(stdout, stderr),
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';

    try {
      // Even if exit code is non-zero (e.g. CLI internal warning or bug),
      // the CLI might still have printed a valid JSON response before exiting.
      const payload = parseCommandJson(stdout, stderr);
      return {
        payload,
        stdout,
        stderr,
        exitCode: error.code || 1,
      };
    } catch {
      // If no valid JSON was found in the output, propagate the original error.
      throw error;
    }
  }
}

async function commandSucceeds(args) {
  try {
    await execFileAsync(cliBin, args, {
      cwd: bridgeRoot,
      maxBuffer: 2 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

function inferLoginStatus(errorText) {
  const normalized = errorText.toLowerCase();
  if (!normalized) {
    return 'unknown';
  }

  if (
    normalized.includes('login')
    || normalized.includes('relogin')
    || normalized.includes('session')
    || normalized.includes('credential')
    || normalized.includes('account')
    || normalized.includes('未登录')
  ) {
    return 'logged_out';
  }

  return 'error';
}

async function checkHealth() {
  const cliAvailable = await commandSucceeds(['-h']);
  if (!cliAvailable) {
    return {
      cliAvailable: false,
      loginStatus: 'unknown',
      modelVersions: supportedModelVersions,
      checkedAt: new Date().toISOString(),
      error: `未检测到 ${cliBin} 命令`,
    };
  }

  try {
    const { payload } = await runDreaminaJson(['user_credit']);

    return {
      cliAvailable: true,
      loginStatus: 'logged_in',
      modelVersions: supportedModelVersions,
      credit: payload,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    return {
      cliAvailable: true,
      loginStatus: inferLoginStatus(message),
      modelVersions: supportedModelVersions,
      checkedAt: new Date().toISOString(),
      error: message,
    };
  }
}

async function writeBase64File(targetPath, dataBase64) {
  await writeFile(targetPath, Buffer.from(dataBase64, 'base64'));
}

async function saveRawPayload(path, payload) {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function loadBridgeConfig() {
  try {
    const text = await readFile(bridgeConfigPath, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function saveBridgeConfig(config) {
  await ensureDir(persistentDataRoot);
  await writeFile(bridgeConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function normalizeAssetLibraryRoot(path) {
  const trimmed = String(path || '').trim();
  return trimmed ? resolve(trimmed) : defaultAssetLibraryRoot;
}

function sanitizePathSegment(value, fallback = 'untitled') {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^\.+|\.+$/gu, '')
    .trim();

  const compact = normalized || fallback;
  return compact.slice(0, 80);
}

function sanitizeRelativePath(relativePath) {
  const segments = String(relativePath || '')
    .split(/[\\/]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('资产文件路径无效。');
  }

  return segments.join('/');
}

function normalizeModelVersion(value) {
  const normalized = String(value || '').trim();
  return supportedModelVersions.includes(normalized) ? normalized : 'seedance2.0';
}

function getRequestOrigin(request) {
  const protocol = String(request.protocol || 'http').trim() || 'http';
  const host = String(request.get('host') || `127.0.0.1:${port}`).trim() || `127.0.0.1:${port}`;
  return `${protocol}://${host}`;
}

function resolveSourceUrl(sourceUrl, request) {
  const normalizedSourceUrl = String(sourceUrl || '').trim();
  if (!normalizedSourceUrl) {
    return '';
  }

  try {
    return new URL(normalizedSourceUrl).toString();
  } catch {
    return new URL(normalizedSourceUrl, `${getRequestOrigin(request)}/`).toString();
  }
}

function getMimeExtension(mimeType, kind) {
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

function inferMimeTypeFromSourceUrl(sourceUrl, kind) {
  try {
    const parsed = new URL(sourceUrl);
    const inferredType = detectContentType(parsed.pathname);
    if (inferredType && inferredType !== 'application/octet-stream') {
      return inferredType;
    }
    return kind === 'video' ? 'video/mp4' : 'image/png';
  } catch {
    return kind === 'video' ? 'video/mp4' : 'image/png';
  }
}

function validateAssetMimeType(kind, mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  const isExpectedType = kind === 'video'
    ? normalized.startsWith('video/')
    : normalized.startsWith('image/');

  if (!isExpectedType) {
    throw new Error(kind === 'video' ? '写入的资源不是视频文件。' : '写入的资源不是图片文件。');
  }
}

function detectContentType(fileName) {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

function createAssetBaseName(assetId, title) {
  const titleSlug = sanitizePathSegment(title, 'asset').replace(/\s+/gu, '-');
  const hash = crypto.createHash('sha1').update(String(assetId || titleSlug)).digest('hex').slice(0, 8);
  return `${titleSlug}-${hash}`.slice(0, 120);
}

function extractBase64Payload(body, kind) {
  const dataUrl = String(body?.dataUrl || '').trim();
  if (dataUrl) {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/u);
    if (!match) {
      throw new Error('媒体数据格式无效。');
    }
    return {
      mimeType: match[1],
      dataBase64: match[2],
    };
  }

  const dataBase64 = String(body?.dataBase64 || '').trim();
  if (!dataBase64) {
    throw new Error('媒体内容不能为空。');
  }

  return {
    mimeType: String(body?.mimeType || '').trim() || (kind === 'video' ? 'video/mp4' : 'image/png'),
    dataBase64,
  };
}

async function resolveAssetPayload(body, kind, request) {
  const sourceUrl = String(body?.sourceUrl || '').trim();
  if (sourceUrl) {
    if (sourceUrl.startsWith('blob:')) {
      throw new Error('bridge 无法直接读取浏览器 blob 地址，请先转换为 data URL。');
    }

    const resolvedSourceUrl = resolveSourceUrl(sourceUrl, request);
    try {
      const response = await fetch(resolvedSourceUrl);
      if (!response.ok) {
        throw new Error(`读取媒体文件失败 (${response.status})`);
      }

      const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim()
        || inferMimeTypeFromSourceUrl(resolvedSourceUrl, kind);
      const dataBase64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        mimeType,
        dataBase64,
      };
    } catch (error) {
      throw new Error(`读取媒体文件失败：${normalizeErrorMessage(error)}`);
    }
  }

  return extractBase64Payload(body, kind);
}

function buildUploadFileName(entry, index, kind, mimeType) {
  const requestedFileName = basename(String(entry?.filename || '').trim());
  const extension = getMimeExtension(mimeType, kind);
  const baseName = requestedFileName
    ? requestedFileName.replace(/\.[^.]+$/u, '')
    : `scene-${index + 1}`;
  return `${baseName}.${extension}`;
}

function resolveAssetLibraryAbsolutePath(rootPath, relativePath) {
  const safeRelativePath = sanitizeRelativePath(relativePath);
  const absolutePath = resolve(rootPath, ...safeRelativePath.split('/'));
  const normalizedRoot = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
  if (absolutePath !== rootPath && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error('资产文件路径越界。');
  }

  return {
    safeRelativePath,
    absolutePath,
  };
}

async function getAssetLibraryConfig() {
  await ensureDir(persistentDataRoot);
  const config = await loadBridgeConfig();
  const rootPath = normalizeAssetLibraryRoot(config.assetLibraryRootPath);
  await ensureDir(rootPath);

  return {
    rootPath,
    defaultRootPath: defaultAssetLibraryRoot,
    usingDefaultPath: rootPath === defaultAssetLibraryRoot,
  };
}

async function updateAssetLibraryConfig(rootPathInput, migrateExistingFiles = true) {
  const previous = await getAssetLibraryConfig();
  const nextRootPath = normalizeAssetLibraryRoot(rootPathInput);

  if (migrateExistingFiles && previous.rootPath !== nextRootPath && await pathExists(previous.rootPath)) {
    await ensureDir(nextRootPath);
    await cp(previous.rootPath, nextRootPath, {
      recursive: true,
      force: true,
    });
  } else {
    await ensureDir(nextRootPath);
  }

  await saveBridgeConfig({
    assetLibraryRootPath: nextRootPath === defaultAssetLibraryRoot ? '' : nextRootPath,
  });

  return getAssetLibraryConfig();
}

function buildAssetLibraryRelativePath(body, mimeType) {
  const kind = body?.kind === 'video' ? 'video' : 'image';
  const groupFolder = sanitizePathSegment(body?.groupName, '未分组');
  const projectFolder = sanitizePathSegment(body?.projectName, '未命名项目');
  const mediaFolder = kind === 'video' ? 'videos' : 'images';
  const explicitFileName = sanitizePathSegment(body?.fileName, '');
  const baseName = explicitFileName
    ? explicitFileName.replace(/\.[^.]+$/u, '')
    : createAssetBaseName(body?.assetId, body?.title);
  const extension = explicitFileName && extname(explicitFileName)
    ? extname(explicitFileName).replace(/^\./u, '')
    : getMimeExtension(mimeType, kind);

  return `${groupFolder}/${projectFolder}/${mediaFolder}/${baseName}.${extension}`;
}

async function listDownloadedFiles(submitId) {
  const directory = taskDir(submitId);
  await ensureDir(directory);
  const entries = await readdir(directory);
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      continue;
    }
    if (!allowedVideoExtensions.has(extname(entry).toLowerCase())) {
      continue;
    }
    files.push({
      name: entry,
      url: `/api/seedance/file/${encodeURIComponent(submitId)}/${encodeURIComponent(entry)}`,
      size: fileStat.size,
    });
  }

  return files.sort((left, right) => left.name.localeCompare(right.name));
}

app.get('/api/seedance/health', async (_request, response) => {
  try {
    await ensureDir(bridgeRoot);
    response.json(await checkHealth());
  } catch (error) {
    response.status(500).json({
      cliAvailable: false,
      loginStatus: 'error',
      modelVersions: supportedModelVersions,
      checkedAt: new Date().toISOString(),
      error: normalizeErrorMessage(error),
    });
  }
});

app.get('/api/seedance/state/:key', (request, response) => {
  try {
    const entry = appStateStore.get(request.params.key);
    response.json(entry || {
      key: String(request.params.key || '').trim(),
      value: null,
      updatedAt: null,
    });
  } catch (error) {
    response.status(400).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.put('/api/seedance/state/:key', (request, response) => {
  try {
    response.json(appStateStore.set(request.params.key, request.body?.value ?? null));
  } catch (error) {
    response.status(400).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.get('/api/seedance/assets/config', async (_request, response) => {
  try {
    response.json(await getAssetLibraryConfig());
  } catch (error) {
    response.status(500).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.post('/api/seedance/assets/config', async (request, response) => {
  try {
    response.json(await updateAssetLibraryConfig(
      request.body?.rootPath,
      request.body?.migrateExistingFiles !== false,
    ));
  } catch (error) {
    response.status(500).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.post('/api/seedance/assets/save', async (request, response) => {
  try {
    const kind = request.body?.kind === 'video' ? 'video' : 'image';
    const { rootPath } = await getAssetLibraryConfig();
    const { mimeType, dataBase64 } = await resolveAssetPayload(request.body, kind, request);
    validateAssetMimeType(kind, mimeType);
    const relativePath = buildAssetLibraryRelativePath(request.body, mimeType);
    const { safeRelativePath, absolutePath } = resolveAssetLibraryAbsolutePath(rootPath, relativePath);

    await ensureDir(dirname(absolutePath));
    await writeFile(absolutePath, Buffer.from(dataBase64, 'base64'));

    response.json({
      rootPath,
      relativePath: safeRelativePath,
      absolutePath,
      fileName: basename(absolutePath),
      kind,
      url: `/api/seedance/assets/file?path=${encodeURIComponent(safeRelativePath)}&t=${Date.now()}`,
    });
  } catch (error) {
    response.status(500).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.get('/api/seedance/assets/file', async (request, response) => {
  try {
    const relativePath = String(request.query.path || '').trim();
    const { rootPath } = await getAssetLibraryConfig();
    const { absolutePath } = resolveAssetLibraryAbsolutePath(rootPath, relativePath);
    const fileBuffer = await readFile(absolutePath);
    const fileName = basename(absolutePath);
    response.setHeader('Content-Type', detectContentType(fileName));
    response.send(fileBuffer);
  } catch (error) {
    response.status(404).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.post('/api/seedance/submit', async (request, response) => {
  try {
    const projectId = String(request.body?.projectId || '').trim() || 'fast-project';
    const prompt = String(request.body?.prompt || '').trim();
    const modelVersion = normalizeModelVersion(request.body?.options?.modelVersion);
    const ratio = String(request.body?.options?.ratio || '16:9').trim() || '16:9';
    const duration = Math.max(4, Math.min(15, Number(request.body?.options?.duration) || 10));
    const videoResolution = request.body?.options?.videoResolution === '480p' ? '480p' : '720p';
    const images = Array.isArray(request.body?.images) ? request.body.images : [];

    if (!prompt) {
      response.status(400).json({ error: '视频提示词不能为空。' });
      return;
    }

    if (images.length === 0) {
      response.status(400).json({ error: '至少需要 1 张分镜图才能提交 Seedance。' });
      return;
    }

    const uploadId = crypto.randomUUID();
    const workingDir = uploadDir(projectId, uploadId);
    await ensureDir(workingDir);

    const imagePaths = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const { mimeType, dataBase64 } = await resolveAssetPayload(image, 'image', request);
      validateAssetMimeType('image', mimeType);
      const safeName = basename(buildUploadFileName(image, index, 'image', mimeType));
      const targetPath = join(workingDir, safeName);
      await writeBase64File(targetPath, dataBase64);
      imagePaths.push(targetPath);
    }

    const args = [
      'multimodal2video',
      ...imagePaths.flatMap((imagePath) => ['--image', imagePath]),
      `--prompt=${prompt}`,
      `--model_version=${modelVersion}`,
      `--ratio=${ratio}`,
      `--video_resolution=${videoResolution}`,
      `--duration=${duration}`,
      '--poll=0',
    ];

    const { payload } = await runDreaminaJson(args);
    const submitId = String(payload?.submit_id || payload?.submitId || '').trim();
    const genStatus = String(payload?.gen_status || payload?.genStatus || '').trim();

    if (!submitId) {
      throw new Error('Dreamina 未返回 submit_id。');
    }

    await ensureDir(taskDir(submitId));
    await saveRawPayload(join(taskDir(submitId), 'submit.json'), payload);

    response.json({
      submitId,
      genStatus,
      raw: payload,
    });
  } catch (error) {
    response.status(500).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.get('/api/seedance/task/:submitId', async (request, response) => {
  try {
    const submitId = String(request.params.submitId || '').trim();
    if (!submitId) {
      response.status(400).json({ error: 'submitId 不能为空。' });
      return;
    }

    const directory = taskDir(submitId);
    await ensureDir(directory);

    let payload;
    let fallbackUsed = false;

    try {
      // Priority 1: Use query_result (WITHOUT --download_dir to avoid CLI bug)
      const result = await runDreaminaJson([
        'query_result',
        `--submit_id=${submitId}`,
      ]);
      payload = result.payload;
    } catch (queryError) {
      console.warn(`[SeedanceBridge] query_result failed for ${submitId}, attempting list_task fallback:`, normalizeErrorMessage(queryError));

      try {
        // Priority 2: Fallback to list_task (only provides status, NO download)
        const listResult = await runDreaminaJson([
          'list_task',
          `--submit_id=${submitId}`,
        ]);

        const tasks = Array.isArray(listResult.payload) ? listResult.payload : [];
        const task = tasks.find((t) => t.submit_id === submitId || t.submitId === submitId);

        if (!task) {
          throw new Error('未在任务列表中找到该任务 ID。');
        }

        payload = task;
        fallbackUsed = true;
      } catch (fallbackError) {
        // Both failed, throw the original query_result error so user knows the first failure reason
        throw queryError;
      }
    }


    // Custom media downloader to bypass CLI bug where --download_dir creates corrupt files
    if (payload && payload.result_json) {
      const { videos = [], images = [] } = payload.result_json;
      
      for (let i = 0; i < videos.length; i++) {
        const url = videos[i].video_url;
        if (url) {
          const extension = videos[i].format ? `.${videos[i].format.replace(/^\./, '')}` : '.mp4';
          const fileName = `${submitId}_video_${i + 1}${extension}`;
          const filePath = resolve(directory, fileName);
          
          let needsDownload = true;
          try {
            const stats = await stat(filePath);
            if (stats.size > 200000) { // 200KB min size heuristic for a video
              needsDownload = false;
            }
          } catch {}
          
          if (needsDownload) {
            try {
              const res = await fetch(url);
              if (res.ok) {
                const buffer = await res.arrayBuffer();
                await writeFile(filePath, Buffer.from(buffer));
              }
            } catch (err) {
              console.warn(`[SeedanceBridge] failed to fetch video ${fileName}:`, err);
            }
          }
        }
      }
      
      for (let i = 0; i < images.length; i++) {
        const url = images[i].image_url;
        if (url) {
          const fileName = `${submitId}_image_${i + 1}.png`;
          const filePath = resolve(directory, fileName);
          
          let needsDownload = true;
          try {
            const stats = await stat(filePath);
            if (stats.size > 1000) {
              needsDownload = false;
            }
          } catch {}
          
          if (needsDownload) {
            try {
              const res = await fetch(url);
              if (res.ok) {
                const buffer = await res.arrayBuffer();
                await writeFile(filePath, Buffer.from(buffer));
              }
            } catch (err) {
              console.warn(`[SeedanceBridge] failed to fetch image ${fileName}:`, err);
            }
          }
        }
      }
    }

    await saveRawPayload(join(directory, 'result.json'), payload);
    response.json({
      submitId,
      genStatus: payload?.gen_status || payload?.genStatus || '',
      queueInfo: payload?.queue_info || payload?.queueInfo || {},
      downloadedFiles: await listDownloadedFiles(submitId),
      fallbackUsed,
      raw: payload,
    });
  } catch (error) {
    response.status(500).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.get('/api/seedance/file/:submitId/:filename', async (request, response) => {
  try {
    const submitId = String(request.params.submitId || '').trim();
    const requestedFileName = basename(String(request.params.filename || '').trim());
    if (!submitId || !requestedFileName) {
      response.status(400).json({ error: '文件参数无效。' });
      return;
    }

    const absolutePath = resolve(taskDir(submitId), requestedFileName);
    const fileBuffer = await readFile(absolutePath);
    response.setHeader('Content-Type', 'video/mp4');
    response.send(fileBuffer);
  } catch (error) {
    response.status(404).json({
      error: normalizeErrorMessage(error),
    });
  }
});

app.delete('/api/seedance/file/:submitId/:filename', async (request, response) => {
  try {
    const submitId = String(request.params.submitId || '').trim();
    const requestedFileName = basename(String(request.params.filename || '').trim());
    if (!submitId || !requestedFileName) {
      response.status(400).json({ error: '文件参数无效。' });
      return;
    }

    await unlink(resolve(taskDir(submitId), requestedFileName));
    response.json({ ok: true });
  } catch (error) {
    response.status(404).json({
      error: normalizeErrorMessage(error),
    });
  }
});

async function start() {
  await ensureDir(bridgeRoot);
  app.listen(port, '127.0.0.1', () => {
    console.log(`Seedance bridge listening on http://127.0.0.1:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start Seedance bridge', error);
  process.exitCode = 1;
});
