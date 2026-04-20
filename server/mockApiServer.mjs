import express from 'express';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import crypto from 'node:crypto';

export const MOCK_API_DEFAULT_PORT = 3220;
export const MOCK_API_SCENARIOS = [
  'success',
  'slow_success',
  'concurrency_once',
  'concurrency_always',
  'submit_fail',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const sampleVideoPath = resolve(projectRoot, 'public/assets/temp.mp4');
const mockImagePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function normalizeScenario(value) {
  return MOCK_API_SCENARIOS.includes(value) ? value : 'success';
}

function nowUnixSeconds() {
  return Math.floor(Date.now() / 1000);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function extractPromptFromChatBody(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.map((message) => {
    const content = message?.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => part?.text || '').join('\n');
    }
    return '';
  }).join('\n\n');
}

function extractMainPrompt(prompt) {
  const candidates = [
    prompt.match(/-\s*Main prompt:\s*(.+)/iu)?.[1],
    prompt.match(/Idea:\s*"([^"]+)"/iu)?.[1],
    prompt.match(/User input:\s*[\s\S]*?-\s*Main prompt:\s*(.+)/iu)?.[1],
  ];
  return (candidates.find(Boolean) || '本地 MOCK 视频创意').trim();
}

function buildMockBrief(prompt) {
  const idea = extractMainPrompt(prompt);
  return {
    theme: '本地 MOCK 测试',
    style: '电影感、写实、干净构图',
    characters: ['测试主角'],
    scenes: ['本地模拟场景'],
    events: `${idea}。这是本地 MOCK API 返回的简报，不消耗真实 token。`,
    mood: '稳定、可验证',
    duration: '10s',
    aspectRatio: '16:9',
    platform: 'Internal Test',
  };
}

function buildMockFastVideoPlan(prompt) {
  const idea = extractMainPrompt(prompt);
  return {
    scenes: [
      {
        title: '开场分镜',
        imagePrompt: `${idea}, cinematic opening still frame, realistic light, no text, no watermark`,
        imagePromptZh: `${idea}，电影感开场静帧，真实光影，无文字，无水印`,
        negativePrompt: 'blurry, low quality, watermark, text',
        negativePromptZh: '模糊，低质量，水印，文字',
      },
      {
        title: '推进分镜',
        imagePrompt: `${idea}, cinematic progression frame, continuity preserved, no text, no watermark`,
        imagePromptZh: `${idea}，电影感推进静帧，保持连续性，无文字，无水印`,
        negativePrompt: 'blurry, low quality, watermark, text',
        negativePromptZh: '模糊，低质量，水印，文字',
      },
    ],
    videoPrompt: {
      prompt: `${idea}。本地 MOCK：保持主体和场景连续，镜头缓慢推进，真实光影，画面干净，无文字，无水印。`,
      promptZh: `${idea}。本地 MOCK：保持主体和场景连续，镜头缓慢推进，真实光影，画面干净，无文字，无水印。`,
    },
  };
}

function buildMockShotList() {
  return [
    {
      shotNumber: 1,
      duration: 3,
      shotSize: '中景',
      cameraAngle: '平视',
      cameraMovement: '缓慢推进',
      subject: '测试主角',
      action: '进入本地模拟场景',
      mood: '稳定',
      transition: '硬切',
      dialog: '',
      referenceAssets: [],
    },
    {
      shotNumber: 2,
      duration: 3,
      shotSize: '近景',
      cameraAngle: '低角度',
      cameraMovement: '轻微环绕',
      subject: '测试主角',
      action: '完成核心动作',
      mood: '明确',
      transition: '自然衔接',
      dialog: '',
      referenceAssets: [],
    },
  ];
}

function buildMockShotPrompts() {
  return {
    imagePrompt: {
      basic: 'Cinematic mock frame',
      basicZh: '电影感 MOCK 画面',
      professional: 'Cinematic mock frame, realistic lighting, high detail, 16:9 composition',
      professionalZh: '电影感 MOCK 画面，真实光影，高细节，16:9 构图',
      lastFrameProfessional: 'Cinematic mock ending frame, continuity preserved, 16:9 composition',
      lastFrameProfessionalZh: '电影感 MOCK 尾帧，保持连续性，16:9 构图',
      negative: 'blurry, low quality, text, watermark',
      negativeZh: '模糊，低质量，文字，水印',
    },
    videoPrompt: {
      textToVideo: '0.0s-1.5s camera pushes in slowly; 1.5s-3.0s subject performs the action; 3.0s-4.0s hold on the final pose.',
      textToVideoZh: '0.0s-1.5s 镜头缓慢推进；1.5s-3.0s 主体完成动作；3.0s-4.0s 停留在最终姿态。',
      imageToVideo: 'Animate the first frame with smooth camera movement and stable continuity.',
      imageToVideoZh: '从首帧开始生成平滑运动，并保持画面连续性。',
    },
  };
}

function buildMockChatContent(prompt, expectsJson) {
  if (!expectsJson) {
    return 'Cinematic mock asset prompt, clean background, high quality, detailed, no watermark.';
  }

  if (/Generate a detailed shot list/iu.test(prompt)) {
    return JSON.stringify(buildMockShotList());
  }

  if (/Generate professional image and video generation prompts/iu.test(prompt)) {
    return JSON.stringify(buildMockShotPrompts());
  }

  if (/Translate the following Chinese prompts/iu.test(prompt)) {
    return JSON.stringify({
      imagePrompt: {
        professional: 'Cinematic translated mock frame, realistic lighting, high detail',
        lastFrameProfessional: 'Cinematic translated mock ending frame, continuity preserved',
      },
      videoPrompt: {
        textToVideo: 'Cinematic translated mock video prompt with stable continuity.',
      },
    });
  }

  if (/smooth, coherent transition video|smooth and natural transition/iu.test(prompt)) {
    return JSON.stringify({
      prompt: 'A smooth local mock transition with coherent lighting and camera motion.',
      promptZh: '本地 MOCK 的平滑转场，保持光影和镜头运动连续。',
    });
  }

  if (/refining ONLY the final Seedance execution prompt/iu.test(prompt)) {
    const idea = extractMainPrompt(prompt);
    return JSON.stringify({
      prompt: `${idea}。本地 MOCK：连续运镜，主体一致，真实光影，无文字，无水印。`,
      promptZh: `${idea}。本地 MOCK：连续运镜，主体一致，真实光影，无文字，无水印。`,
    });
  }

  if (/fast video generation workflow|Return ONLY a JSON object with this shape/iu.test(prompt) && /"scenes"/iu.test(prompt)) {
    return JSON.stringify(buildMockFastVideoPlan(prompt));
  }

  if (/Analyze the following creative idea/iu.test(prompt)) {
    return JSON.stringify(buildMockBrief(prompt));
  }

  return JSON.stringify(buildMockFastVideoPlan(prompt));
}

function getTaskStatus(task) {
  if (task.status === 'cancelled' || task.status === 'failed') {
    return task.status;
  }
  if (Date.now() < task.readyAtMs) {
    return 'running';
  }
  return 'success';
}

function createConcurrencyPayload(submitId) {
  const logid = `${Date.now()}${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  return {
    submitId,
    genStatus: 'fail',
    raw: {
      submit_id: submitId,
      logid,
      gen_status: 'fail',
      fail_reason: `api error: ret=1310, message=ExceedConcurrencyLimit, logid=${logid}`,
    },
  };
}

async function sendMockImage(response) {
  response.setHeader('Content-Type', 'image/png');
  response.send(Buffer.from(mockImagePngBase64, 'base64'));
}

async function sendMockVideo(response) {
  response.setHeader('Content-Type', 'video/mp4');
  try {
    response.send(await readFile(sampleVideoPath));
  } catch {
    response.send(Buffer.alloc(0));
  }
}

function registerJsonRoute(app, method, paths, handler) {
  for (const path of paths) {
    app[method](path, handler);
  }
}

export async function startMockApiServer(options = {}) {
  const app = express();
  let httpServer;
  const state = new Map();
  const tasks = new Map();
  const assetKinds = new Map();
  const runtime = {
    scenario: normalizeScenario(options.scenario || process.env.MOCK_API_SCENARIO),
    concurrencyFailuresLeft: normalizeScenario(options.scenario || process.env.MOCK_API_SCENARIO) === 'concurrency_once' ? 1 : 0,
  };

  app.use(express.json({ limit: '100mb' }));
  app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS,DELETE');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-goog-api-key');
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });

  function setScenario(value) {
    runtime.scenario = normalizeScenario(value);
    runtime.concurrencyFailuresLeft = runtime.scenario === 'concurrency_once' ? 1 : 0;
  }

  function getBaseUrl(server) {
    const address = server.address();
    const resolvedPort = typeof address === 'object' && address ? address.port : Number(options.port || MOCK_API_DEFAULT_PORT);
    return `http://127.0.0.1:${resolvedPort}`;
  }

  function getStatus(server) {
    const baseUrl = getBaseUrl(server);
    return {
      running: true,
      port: Number(new URL(baseUrl).port),
      baseUrl,
      volcengineBaseUrl: `${baseUrl}/api/v3`,
      seedanceBridgeUrl: `${baseUrl}/api/seedance`,
      scenario: runtime.scenario,
      taskCount: tasks.size,
    };
  }

  function shouldFailSubmit() {
    if (runtime.scenario === 'concurrency_always') {
      return 'concurrency';
    }
    if (runtime.scenario === 'concurrency_once' && runtime.concurrencyFailuresLeft > 0) {
      runtime.concurrencyFailuresLeft -= 1;
      return 'concurrency';
    }
    if (runtime.scenario === 'submit_fail') {
      return 'submit_fail';
    }
    return '';
  }

  function createTask(kind, body, baseUrl) {
    const id = createId(kind === 'cli' ? 'mock-submit' : 'mock-task');
    const readyDelayMs = runtime.scenario === 'slow_success' ? 8000 : 0;
    const task = {
      id,
      kind,
      body,
      createdAt: nowUnixSeconds(),
      updatedAt: nowUnixSeconds(),
      readyAtMs: Date.now() + readyDelayMs,
      status: 'running',
      videoUrl: `${baseUrl}/api/seedance/file/${encodeURIComponent(id)}/mock-video.mp4`,
      imageUrl: `${baseUrl}/mock-media/image.png`,
    };
    tasks.set(id, task);
    return task;
  }

  app.get('/api/mock/status', (request, response) => {
    response.json(getStatus(httpServer));
  });

  app.post('/api/mock/scenario', (request, response) => {
    setScenario(request.body?.scenario);
    response.json(getStatus(httpServer));
  });

  registerJsonRoute(app, 'post', ['/api/v3/chat/completions', '/chat/completions', '/v1/chat/completions'], (request, response) => {
    const prompt = extractPromptFromChatBody(request.body);
    const expectsJson = request.body?.response_format?.type === 'json_object'
      || /Return ONLY|JSON object|JSON array/iu.test(prompt);
    response.json({
      id: createId('chatcmpl'),
      object: 'chat.completion',
      created: nowUnixSeconds(),
      model: request.body?.model || 'mock-text-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: buildMockChatContent(prompt, expectsJson),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });
  });

  registerJsonRoute(app, 'post', ['/api/v3/images/generations', '/images/generations', '/v1/images/generations'], (request, response) => {
    const baseUrl = `${request.protocol}://${request.get('host')}`;
    response.json({
      created: nowUnixSeconds(),
      model: request.body?.model || 'mock-image-model',
      data: [
        {
          url: `${baseUrl}/mock-media/image.png?t=${Date.now()}`,
        },
      ],
    });
  });

  registerJsonRoute(app, 'post', ['/api/v3/contents/generations/tasks', '/contents/generations/tasks'], (request, response) => {
    const baseUrl = `${request.protocol}://${request.get('host')}`;
    const task = createTask('ark', request.body, baseUrl);
    const status = getTaskStatus(task);
    response.json({
      id: task.id,
      status,
      model: request.body?.model || 'mock-seedance-model',
      content: {
        video_url: task.videoUrl,
        last_frame_url: task.imageUrl,
      },
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      ratio: request.body?.ratio || request.body?.parameters?.aspect_ratio || '16:9',
      resolution: request.body?.resolution || request.body?.parameters?.resolution || '720p',
      duration: request.body?.duration || request.body?.parameters?.duration || 4,
    });
  });

  registerJsonRoute(app, 'get', ['/api/v3/contents/generations/tasks/:taskId', '/contents/generations/tasks/:taskId'], (request, response) => {
    const task = tasks.get(request.params.taskId);
    if (!task) {
      response.status(404).json({ error: { message: 'Mock task not found.' } });
      return;
    }
    const status = getTaskStatus(task);
    task.updatedAt = nowUnixSeconds();
    response.json({
      id: task.id,
      status,
      model: task.body?.model || 'mock-video-model',
      content: {
        video_url: task.videoUrl,
        last_frame_url: task.imageUrl,
      },
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      ratio: task.body?.ratio || task.body?.parameters?.aspect_ratio || '16:9',
      resolution: task.body?.resolution || task.body?.parameters?.resolution || '720p',
      duration: task.body?.duration || task.body?.parameters?.duration || 4,
    });
  });

  registerJsonRoute(app, 'delete', ['/api/v3/contents/generations/tasks/:taskId', '/contents/generations/tasks/:taskId'], (request, response) => {
    const task = tasks.get(request.params.taskId);
    if (task) {
      task.status = 'cancelled';
      task.updatedAt = nowUnixSeconds();
    }
    response.json({ ok: true });
  });

  app.get('/api/seedance/health', (_request, response) => {
    response.json({
      cliAvailable: true,
      loginStatus: 'logged_in',
      modelVersions: ['seedance2.0', 'seedance2.0fast', 'seedance2.0_vip', 'seedance2.0fast_vip'],
      credit: {
        total_credit: 999999,
      },
      checkedAt: new Date().toISOString(),
      mock: true,
    });
  });

  app.post('/api/seedance/submit', (request, response) => {
    const baseUrl = `${request.protocol}://${request.get('host')}`;
    const failure = shouldFailSubmit();
    const submitId = createId('mock-submit');
    if (failure === 'concurrency') {
      response.json(createConcurrencyPayload(submitId));
      return;
    }
    if (failure === 'submit_fail') {
      response.json({
        submitId,
        genStatus: 'fail',
        raw: {
          submit_id: submitId,
          gen_status: 'fail',
          fail_reason: 'MOCK submit failure: configured submit_fail scenario.',
        },
      });
      return;
    }

    const task = createTask('cli', request.body, baseUrl);
    response.json({
      submitId: task.id,
      genStatus: getTaskStatus(task),
      raw: {
        submit_id: task.id,
        gen_status: getTaskStatus(task),
        model_version: request.body?.options?.modelVersion || 'seedance2.0',
        mock: true,
      },
    });
  });

  app.get('/api/seedance/task/:submitId', (request, response) => {
    const task = tasks.get(request.params.submitId);
    if (!task) {
      response.status(404).json({ error: 'Mock submitId not found.' });
      return;
    }
    const genStatus = getTaskStatus(task);
    response.json({
      submitId: task.id,
      genStatus,
      queueInfo: {
        queue_status: genStatus === 'success' ? 'MockDone' : 'MockRunning',
      },
      downloadedFiles: genStatus === 'success'
        ? [
          {
            name: 'mock-video.mp4',
            url: `/api/seedance/file/${encodeURIComponent(task.id)}/mock-video.mp4`,
            size: 0,
          },
        ]
        : [],
      raw: {
        submit_id: task.id,
        gen_status: genStatus,
        result_json: genStatus === 'success'
          ? {
            videos: [
              {
                video_url: task.videoUrl,
                format: 'mp4',
              },
            ],
          }
          : undefined,
        queue_info: {
          queue_status: genStatus === 'success' ? 'MockDone' : 'MockRunning',
        },
        mock: true,
      },
    });
  });

  app.get('/api/seedance/file/:submitId/:filename', async (_request, response) => {
    await sendMockVideo(response);
  });

  app.get('/api/seedance/assets/config', (_request, response) => {
    response.json({
      rootPath: 'mock://asset-library',
      defaultRootPath: 'mock://asset-library',
      usingDefaultPath: true,
    });
  });

  app.post('/api/seedance/assets/config', (_request, response) => {
    response.json({
      rootPath: 'mock://asset-library',
      defaultRootPath: 'mock://asset-library',
      usingDefaultPath: true,
    });
  });

  app.post('/api/seedance/assets/save', (request, response) => {
    const kind = request.body?.kind === 'video' ? 'video' : 'image';
    const extension = kind === 'video' ? 'mp4' : 'png';
    const relativePath = `mock/${kind}s/${createId('asset')}.${extension}`;
    assetKinds.set(relativePath, kind);
    response.json({
      rootPath: 'mock://asset-library',
      relativePath,
      absolutePath: `mock://asset-library/${relativePath}`,
      fileName: relativePath.split('/').pop(),
      kind,
      url: `/api/seedance/assets/file?path=${encodeURIComponent(relativePath)}&t=${Date.now()}`,
    });
  });

  app.get('/api/seedance/assets/file', async (request, response) => {
    const relativePath = String(request.query.path || '').trim();
    const kind = assetKinds.get(relativePath) || (extname(relativePath).toLowerCase() === '.mp4' ? 'video' : 'image');
    if (kind === 'video') {
      await sendMockVideo(response);
      return;
    }
    await sendMockImage(response);
  });

  app.post('/api/seedance/assets/copy-to-downloads', (request, response) => {
    const relativePaths = Array.isArray(request.body?.relativePaths)
      ? request.body.relativePaths.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    response.json({
      downloadsDir: 'mock://downloads',
      copiedFiles: relativePaths.map((relativePath) => ({
        relativePath,
        destinationPath: `mock://downloads/${relativePath.split('/').pop() || 'video.mp4'}`,
        fileName: relativePath.split('/').pop() || 'video.mp4',
      })),
    });
  });

  app.post('/api/seedance/state/reset', (_request, response) => {
    state.clear();
    response.json({
      ok: true,
      resetAt: new Date().toISOString(),
    });
  });

  app.get('/api/seedance/state/:key', (request, response) => {
    const key = String(request.params.key || '').trim();
    response.json(state.get(key) || { key, value: null, updatedAt: null });
  });

  app.put('/api/seedance/state/:key', (request, response) => {
    const key = String(request.params.key || '').trim();
    const entry = {
      key,
      value: request.body?.value ?? null,
      updatedAt: new Date().toISOString(),
    };
    state.set(key, entry);
    response.json(entry);
  });

  app.get('/mock-media/image.png', async (_request, response) => {
    await sendMockImage(response);
  });

  app.get('/mock-media/video.mp4', async (_request, response) => {
    await sendMockVideo(response);
  });

  const server = createServer(app);
  httpServer = server;
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : Number(process.env.MOCK_API_PORT || MOCK_API_DEFAULT_PORT);

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      const controller = {
        get port() {
          return getStatus(server).port;
        },
        get baseUrl() {
          return getStatus(server).baseUrl;
        },
        getStatus: () => getStatus(server),
        setScenario,
        close: () => new Promise((resolveClose, rejectClose) => {
          server.close((error) => {
            if (error) {
              rejectClose(error);
              return;
            }
            resolveClose();
          });
        }),
      };
      resolveServer(controller);
    });
  });
}

if (process.argv[1] === __filename) {
  const server = await startMockApiServer();
  console.log(`Mock API server listening on ${server.baseUrl}`);
  console.log(`Volcengine mock base URL: ${server.getStatus().volcengineBaseUrl}`);
  console.log(`Seedance bridge mock URL: ${server.getStatus().seedanceBridgeUrl}`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
