import express from 'express'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { constants } from 'node:fs'
import { access, cp, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import crypto from 'node:crypto'
import { app as electronApp } from 'electron'
import { createAppStateStore } from '../../server/appStateStore.mjs'
import { buildAssetLibraryFileName } from '../../server/assetLibraryNaming.mjs'

const execFileAsync = promisify(execFile)
const COMMON_CLI_PATH_ENTRIES = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]

export async function startBridge(port = 3210) {
  const app = express()
  const cliBin = (process.env.SEEDANCE_CLI_BIN || 'dreamina').trim() || 'dreamina'
  
  // Use Electron's userData for persistent data in desktop mode
  const persistentDataRoot = resolve(electronApp.getPath('userData'), 'local_data')
  const defaultAssetLibraryRoot = resolve(electronApp.getPath('userData'), 'local_asset_library')
  
  console.log(`[Bridge] UserData Path: ${electronApp.getPath('userData')}`)
  console.log(`[Bridge] Persistent Data Root: ${persistentDataRoot}`)
  
  // Explicitly ensure directories exist before creating stores
  await mkdir(persistentDataRoot, { recursive: true })
  await mkdir(defaultAssetLibraryRoot, { recursive: true })
  
  // Keep temp files in system temp but under our app name
  const bridgeRoot = join(tmpdir(), 'tapdance-ai-director', 'seedance')
  await mkdir(bridgeRoot, { recursive: true })

  const bridgeConfigPath = join(persistentDataRoot, 'bridge-config.json')
  const dbPath = join(persistentDataRoot, 'app-state.sqlite')
  console.log(`[Bridge] DB Path: ${dbPath}`)
  
  const appStateStore = createAppStateStore(dbPath)
  
  const allowedVideoExtensions = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi'])
  const supportedModelVersions = ['seedance2.0', 'seedance2.0fast', 'seedance2.0_vip', 'seedance2.0fast_vip']
  const homeDir = String(process.env.HOME || '').trim()
  const preferredCliPathEntries = [
    homeDir ? join(homeDir, '.local', 'bin') : '',
    homeDir ? join(homeDir, '.bun', 'bin') : '',
    homeDir ? join(homeDir, '.volta', 'bin') : '',
    ...COMMON_CLI_PATH_ENTRIES,
  ]
  let cachedCliEnv: NodeJS.ProcessEnv | null = null
  let cachedResolvedCliBin = ''

  app.use(express.json({ limit: '100mb' }))
  app.use((request, response, next) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS,DELETE')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }
    next()
  })

  // Helper functions (replicated from seedanceBridge.mjs)
  function taskDir(submitId) {
    return join(bridgeRoot, 'tasks', submitId)
  }

  function uploadDir(projectId, uploadId) {
    return join(bridgeRoot, 'uploads', projectId, uploadId)
  }

  async function ensureDir(path) {
    await mkdir(path, { recursive: true })
  }

  async function pathExists(path) {
    try {
      await stat(path)
      return true
    } catch {
      return false
    }
  }

  function mergePathEntries(...pathValues: Array<string | undefined>) {
    const entries = pathValues
      .flatMap((value) => String(value || '').split(delimiter))
      .map((value) => value.trim())
      .filter(Boolean)

    return Array.from(new Set(entries)).join(delimiter)
  }

  async function getLoginShellPath() {
    if (process.platform === 'win32') {
      return ''
    }

    for (const shellPath of ['/bin/zsh', '/bin/bash']) {
      try {
        const { stdout } = await execFileAsync(shellPath, ['-lc', 'printf %s "$PATH"'], {
          env: process.env,
          maxBuffer: 1024 * 1024,
        })
        const resolvedPath = String(stdout || '').trim()
        if (resolvedPath) {
          return resolvedPath
        }
      } catch {
        // Ignore login shell lookup failures and fall back to the current process env.
      }
    }

    return ''
  }

  async function getCliEnv() {
    if (cachedCliEnv) {
      return cachedCliEnv
    }

    const loginShellPath = await getLoginShellPath()
    cachedCliEnv = {
      ...process.env,
      PATH: mergePathEntries(process.env.PATH, loginShellPath, preferredCliPathEntries.join(delimiter)),
    }
    return cachedCliEnv
  }

  async function isExecutableFile(filePath: string) {
    try {
      await access(filePath, constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  async function resolveCliCommand() {
    if (cachedResolvedCliBin) {
      return cachedResolvedCliBin
    }

    if (isAbsolute(cliBin) || /[\\/]/u.test(cliBin)) {
      cachedResolvedCliBin = cliBin
      return cachedResolvedCliBin
    }

    const cliEnv = await getCliEnv()
    const pathEntries = String(cliEnv.PATH || '')
      .split(delimiter)
      .map((value) => value.trim())
      .filter(Boolean)

    for (const pathEntry of pathEntries) {
      const candidatePath = join(pathEntry, cliBin)
      if (await isExecutableFile(candidatePath)) {
        cachedResolvedCliBin = candidatePath
        console.log(`[Bridge] Resolved ${cliBin} to ${candidatePath}`)
        return cachedResolvedCliBin
      }
    }

    return cliBin
  }

  function normalizeErrorMessage(error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return `未检测到 ${cliBin} 命令。请确认 dreamina 已安装，或通过 SEEDANCE_CLI_BIN 指向可执行文件。`
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EACCES') {
      return `${cliBin} 无执行权限。请检查可执行文件权限，或通过 SEEDANCE_CLI_BIN 指向正确的 CLI。`
    }
    if (error instanceof Error) return error.message
    return String(error || 'Unknown error')
  }

  function extractJsonCandidate(text) {
    const trimmed = text.trim()
    if (!trimmed) return ''
    const directCandidates = [trimmed]
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      directCandidates.push(trimmed.slice(firstBrace, lastBrace + 1))
    }
    for (const candidate of directCandidates) {
      try {
        JSON.parse(candidate)
        return candidate
      } catch {}
    }
    return ''
  }

  function parseCommandJson(stdout, stderr) {
    const candidate = extractJsonCandidate(stdout) || extractJsonCandidate(`${stdout}\n${stderr}`)
    if (!candidate) throw new Error((stderr || stdout || '命令未返回可解析 JSON').trim())
    return JSON.parse(candidate)
  }

  async function runDreaminaJson(args) {
    const cliCommand = await resolveCliCommand()
    const cliEnv = await getCliEnv()

    try {
      const { stdout, stderr } = await execFileAsync(cliCommand, args, {
        cwd: bridgeRoot,
        env: cliEnv,
        maxBuffer: 20 * 1024 * 1024
      })
      return {
        payload: parseCommandJson(stdout, stderr),
        stdout,
        stderr,
        exitCode: 0
      }
    } catch (error: any) {
      const stdout = error.stdout || ''
      const stderr = error.stderr || ''
      try {
        const payload = parseCommandJson(stdout, stderr)
        return { payload, stdout, stderr, exitCode: error.code || 1 }
      } catch {
        throw error
      }
    }
  }

  async function commandSucceeds(args) {
    const cliCommand = await resolveCliCommand()
    const cliEnv = await getCliEnv()

    try {
      await execFileAsync(cliCommand, args, {
        cwd: bridgeRoot,
        env: cliEnv,
        maxBuffer: 2 * 1024 * 1024,
      })
      return true
    } catch {
      return false
    }
  }

  function inferLoginStatus(errorText) {
    const normalized = errorText.toLowerCase()
    if (!normalized) return 'unknown'
    if (
      normalized.includes('login') ||
      normalized.includes('relogin') ||
      normalized.includes('session') ||
      normalized.includes('credential') ||
      normalized.includes('account') ||
      normalized.includes('未登录')
    ) {
      return 'logged_out'
    }
    return 'error'
  }

  async function checkHealth() {
    const cliAvailable = await commandSucceeds(['-h'])
    if (!cliAvailable) {
      return {
        cliAvailable: false,
        loginStatus: 'unknown',
        modelVersions: supportedModelVersions,
        checkedAt: new Date().toISOString(),
        error: `未检测到 ${cliBin} 命令`
      }
    }
    try {
      const { payload } = await runDreaminaJson(['user_credit'])
      return {
        cliAvailable: true,
        loginStatus: 'logged_in',
        modelVersions: supportedModelVersions,
        credit: payload,
        checkedAt: new Date().toISOString()
      }
    } catch (error) {
      const message = normalizeErrorMessage(error)
      return {
        cliAvailable: true,
        loginStatus: inferLoginStatus(message),
        modelVersions: supportedModelVersions,
        checkedAt: new Date().toISOString(),
        error: message
      }
    }
  }

  async function writeBase64File(targetPath, dataBase64) {
    await writeFile(targetPath, Buffer.from(dataBase64, 'base64'))
  }

  async function saveRawPayload(path, payload) {
    await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }

  async function loadBridgeConfig() {
    try {
      const text = await readFile(bridgeConfigPath, 'utf8')
      return JSON.parse(text)
    } catch {
      return {}
    }
  }

  async function saveBridgeConfig(config) {
    await ensureDir(persistentDataRoot)
    const currentConfig = await loadBridgeConfig()
    await writeFile(bridgeConfigPath, `${JSON.stringify({ ...currentConfig, ...config }, null, 2)}\n`, 'utf8')
  }

  function normalizeAssetLibraryRoot(path) {
    const trimmed = String(path || '').trim()
    return trimmed ? resolve(trimmed) : defaultAssetLibraryRoot
  }

  function normalizePortraitLibraryRoot(path) {
    const trimmed = String(path || '').trim()
    return trimmed ? resolve(trimmed) : ''
  }

  function sanitizePathSegment(value, fallback = 'untitled') {
    const normalized = String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/gu, '-')
      .replace(/\s+/gu, ' ')
      .replace(/^\.+|\.+$/gu, '')
      .trim()
    const compact = normalized || fallback
    return compact.slice(0, 80)
  }

  function sanitizeRelativePath(relativePath) {
    const segments = String(relativePath || '')
      .split(/[\\/]+/u)
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error('资产文件路径无效。')
    }
    return segments.join('/')
  }

  function normalizeModelVersion(value) {
    const normalized = String(value || '').trim()
    return supportedModelVersions.includes(normalized) ? normalized : 'seedance2.0'
  }

  function getRequestOrigin(request) {
    const protocol = String(request.protocol || 'http').trim() || 'http'
    const host = String(request.get('host') || `127.0.0.1:${port}`).trim() || `127.0.0.1:${port}`
    return `${protocol}://${host}`
  }

  function resolveSourceUrl(sourceUrl, request) {
    const normalizedSourceUrl = String(sourceUrl || '').trim()
    if (!normalizedSourceUrl) return ''
    try {
      return new URL(normalizedSourceUrl).toString()
    } catch {
      return new URL(normalizedSourceUrl, `${getRequestOrigin(request)}/`).toString()
    }
  }

  function getMimeExtension(mimeType, kind) {
    const normalized = String(mimeType || '').toLowerCase()
    if (normalized.includes('png')) return 'png'
    if (normalized.includes('webp')) return 'webp'
    if (normalized.includes('gif')) return 'gif'
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
    if (normalized.includes('mp4')) return 'mp4'
    if (normalized.includes('quicktime')) return 'mov'
    if (normalized.includes('webm')) return 'webm'
    return kind === 'video' ? 'mp4' : 'png'
  }

  function inferMimeTypeFromSourceUrl(sourceUrl, kind) {
    try {
      const parsed = new URL(sourceUrl)
      const inferredType = detectContentType(parsed.pathname)
      if (inferredType && inferredType !== 'application/octet-stream') return inferredType
      return kind === 'video' ? 'video/mp4' : 'image/png'
    } catch {
      return kind === 'video' ? 'video/mp4' : 'image/png'
    }
  }

  function validateAssetMimeType(kind, mimeType) {
    const normalized = String(mimeType || '').toLowerCase()
    const isExpectedType = kind === 'video' ? normalized.startsWith('video/') : normalized.startsWith('image/')
    if (!isExpectedType) {
      throw new Error(kind === 'video' ? '写入的资源不是视频文件。' : '写入的资源不是图片文件。')
    }
  }

  function detectContentType(fileName) {
    const extension = extname(fileName).toLowerCase()
    if (extension === '.png') return 'image/png'
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
    if (extension === '.webp') return 'image/webp'
    if (extension === '.gif') return 'image/gif'
    if (extension === '.mp4') return 'video/mp4'
    if (extension === '.mov') return 'video/quicktime'
    if (extension === '.webm') return 'video/webm'
    return 'application/octet-stream'
  }

  function extractBase64Payload(body, kind) {
    const dataUrl = String(body?.dataUrl || '').trim()
    if (dataUrl) {
      const match = dataUrl.match(/^data:(.+);base64,(.+)$/u)
      if (!match) throw new Error('媒体数据格式无效。')
      return { mimeType: match[1], dataBase64: match[2] }
    }
    const dataBase64 = String(body?.dataBase64 || '').trim()
    if (!dataBase64) throw new Error('媒体内容不能为空。')
    return {
      mimeType: String(body?.mimeType || '').trim() || (kind === 'video' ? 'video/mp4' : 'image/png'),
      dataBase64
    }
  }

  async function resolveAssetPayload(body, kind, request) {
    const sourceUrl = String(body?.sourceUrl || '').trim()
    if (sourceUrl) {
      if (sourceUrl.startsWith('blob:')) throw new Error('bridge 无法直接读取浏览器 blob 地址，请先转换为 data URL。')
      const resolvedSourceUrl = resolveSourceUrl(sourceUrl, request)
      try {
        const response = await fetch(resolvedSourceUrl)
        if (!response.ok) throw new Error(`读取媒体文件失败 (${response.status})`)
        const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim() || inferMimeTypeFromSourceUrl(resolvedSourceUrl, kind)
        const dataBase64 = Buffer.from(await response.arrayBuffer()).toString('base64')
        return { mimeType, dataBase64 }
      } catch (error) {
        throw new Error(`读取媒体文件失败：${normalizeErrorMessage(error)}`)
      }
    }
    return extractBase64Payload(body, kind)
  }

  function buildUploadFileName(entry, index, kind, mimeType) {
    const requestedFileName = basename(String(entry?.filename || '').trim())
    const extension = getMimeExtension(mimeType, kind)
    const baseName = requestedFileName ? requestedFileName.replace(/\.[^.]+$/u, '') : `scene-${index + 1}`
    return `${baseName}.${extension}`
  }

  function resolveAssetLibraryAbsolutePath(rootPath, relativePath) {
    const safeRelativePath = sanitizeRelativePath(relativePath)
    const absolutePath = resolve(rootPath, ...safeRelativePath.split('/'))
    const normalizedRoot = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`
    if (absolutePath !== rootPath && !absolutePath.startsWith(normalizedRoot)) {
      throw new Error('资产文件路径越界。')
    }
    return { safeRelativePath, absolutePath }
  }

  function resolvePortraitLibraryAbsolutePath(rootPath, relativePath) {
    if (!rootPath) {
      throw new Error('尚未配置图片素材文件夹。')
    }
    const safeRelativePath = sanitizeRelativePath(relativePath)
    const absolutePath = resolve(rootPath, ...safeRelativePath.split('/'))
    const normalizedRoot = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`
    if (absolutePath !== rootPath && !absolutePath.startsWith(normalizedRoot)) {
      throw new Error('人像素材文件路径越界。')
    }
    return { safeRelativePath, absolutePath }
  }

  async function getAssetLibraryConfig() {
    await ensureDir(persistentDataRoot)
    const config = await loadBridgeConfig()
    const rootPath = normalizeAssetLibraryRoot(config.assetLibraryRootPath)
    await ensureDir(rootPath)
    return { rootPath, defaultRootPath: defaultAssetLibraryRoot, usingDefaultPath: rootPath === defaultAssetLibraryRoot }
  }

  async function updateAssetLibraryConfig(rootPathInput, migrateExistingFiles = true) {
    const previous = await getAssetLibraryConfig()
    const nextRootPath = normalizeAssetLibraryRoot(rootPathInput)
    if (migrateExistingFiles && previous.rootPath !== nextRootPath && (await pathExists(previous.rootPath))) {
      await ensureDir(nextRootPath)
      await cp(previous.rootPath, nextRootPath, { recursive: true, force: true })
    } else {
      await ensureDir(nextRootPath)
    }
    await saveBridgeConfig({ assetLibraryRootPath: nextRootPath === defaultAssetLibraryRoot ? '' : nextRootPath })
    return getAssetLibraryConfig()
  }

  async function getPortraitLibraryConfig() {
    await ensureDir(persistentDataRoot)
    const config = await loadBridgeConfig()
    const rootPath = normalizePortraitLibraryRoot(config.portraitLibraryRootPath)
    return {
      rootPath,
      configured: Boolean(rootPath)
    }
  }

  async function updatePortraitLibraryConfig(rootPathInput) {
    const nextRootPath = normalizePortraitLibraryRoot(rootPathInput)
    if (nextRootPath) {
      const directoryStat = await stat(nextRootPath).catch(() => null)
      if (!directoryStat) {
        throw new Error('所选图片素材文件夹不存在。')
      }
      if (!directoryStat.isDirectory()) {
        throw new Error('所选路径不是文件夹。')
      }
    }
    await saveBridgeConfig({ portraitLibraryRootPath: nextRootPath })
    return getPortraitLibraryConfig()
  }

  function buildAssetLibraryRelativePath(body, mimeType) {
    const kind = body?.kind === 'video' ? 'video' : 'image'
    const groupFolder = sanitizePathSegment(body?.groupName, '未分组')
    const projectFolder = sanitizePathSegment(body?.projectName, '未命名项目')
    const mediaFolder = kind === 'video' ? 'videos' : 'images'
    const fileName = buildAssetLibraryFileName({
      assetId: body?.assetId,
      title: body?.title,
      fileName: body?.fileName,
      mimeType,
      kind,
      sanitizePathSegment,
      getMimeExtension,
    })
    return `${groupFolder}/${projectFolder}/${mediaFolder}/${fileName}`
  }

  async function listDownloadedFiles(submitId) {
    const directory = taskDir(submitId)
    await ensureDir(directory)
    const entries = await readdir(directory)
    const files = []
    for (const entry of entries) {
      const absolutePath = join(directory, entry)
      const fileStat = await stat(absolutePath)
      if (!fileStat.isFile()) continue
      if (!allowedVideoExtensions.has(extname(entry).toLowerCase())) continue
      files.push({
        name: entry,
        url: `/api/seedance/file/${encodeURIComponent(submitId)}/${encodeURIComponent(entry)}`,
        size: fileStat.size
      })
    }
    return files.sort((left, right) => left.name.localeCompare(right.name))
  }

  // Routes
  app.get('/api/seedance/health', async (_request, response) => {
    try {
      await ensureDir(bridgeRoot)
      response.json(await checkHealth())
    } catch (error) {
      response.status(500).json({
        cliAvailable: false,
        loginStatus: 'error',
        modelVersions: supportedModelVersions,
        checkedAt: new Date().toISOString(),
        error: normalizeErrorMessage(error)
      })
    }
  })

  app.post('/api/seedance/state/reset', (_request, response) => {
    try {
      response.json({
        ok: true,
        ...appStateStore.reset(),
      })
    } catch (error) {
      console.error('[Bridge] Failed to reset app state store:', error)
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/state/:key', (request, response) => {
    try {
      const entry = appStateStore.get(request.params.key)
      response.json(entry || { key: String(request.params.key || '').trim(), value: null, updatedAt: null })
    } catch (error) {
      console.error(`[Bridge] Failed to get state for key "${request.params.key}":`, error)
      response.status(400).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.put('/api/seedance/state/:key', (request, response) => {
    try {
      const result = appStateStore.set(request.params.key, request.body?.value ?? null)
      response.json(result)
    } catch (error) {
      console.error(`[Bridge] Failed to set state for key "${request.params.key}":`, error)
      response.status(400).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/assets/config', async (_request, response) => {
    try {
      response.json(await getAssetLibraryConfig())
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.post('/api/seedance/assets/config', async (request, response) => {
    try {
      response.json(await updateAssetLibraryConfig(request.body?.rootPath, request.body?.migrateExistingFiles !== false))
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.post('/api/seedance/assets/save', async (request, response) => {
    try {
      const kind = request.body?.kind === 'video' ? 'video' : 'image'
      const { rootPath } = await getAssetLibraryConfig()
      const { mimeType, dataBase64 } = await resolveAssetPayload(request.body, kind, request)
      validateAssetMimeType(kind, mimeType)
      const relativePath = buildAssetLibraryRelativePath(request.body, mimeType)
      const { safeRelativePath, absolutePath } = resolveAssetLibraryAbsolutePath(rootPath, relativePath)
      await ensureDir(dirname(absolutePath))
      await writeFile(absolutePath, Buffer.from(dataBase64, 'base64'))
      response.json({
        rootPath,
        relativePath: safeRelativePath,
        absolutePath,
        fileName: basename(absolutePath),
        kind,
        url: `/api/seedance/assets/file?path=${encodeURIComponent(safeRelativePath)}&t=${Date.now()}`
      })
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/assets/file', async (request, response) => {
    try {
      const relativePath = String(request.query.path || '').trim()
      const { rootPath } = await getAssetLibraryConfig()
      const { absolutePath } = resolveAssetLibraryAbsolutePath(rootPath, relativePath)
      const fileBuffer = await readFile(absolutePath)
      const fileName = basename(absolutePath)
      response.setHeader('Content-Type', detectContentType(fileName))
      response.send(fileBuffer)
    } catch (error) {
      response.status(404).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/portraits/config', async (_request, response) => {
    try {
      response.json(await getPortraitLibraryConfig())
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.post('/api/seedance/portraits/config', async (request, response) => {
    try {
      response.json(await updatePortraitLibraryConfig(request.body?.rootPath))
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/portraits/file', async (request, response) => {
    try {
      const relativePath = String(request.query.path || '').trim()
      const { rootPath } = await getPortraitLibraryConfig()
      const { absolutePath } = resolvePortraitLibraryAbsolutePath(rootPath, relativePath)
      const fileBuffer = await readFile(absolutePath)
      const fileName = basename(absolutePath)
      response.setHeader('Content-Type', detectContentType(fileName))
      response.send(fileBuffer)
    } catch (error) {
      response.status(404).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.post('/api/seedance/submit', async (request, response) => {
    try {
      const projectId = String(request.body?.projectId || '').trim() || 'fast-project'
      const prompt = String(request.body?.prompt || '').trim()
      const modelVersion = normalizeModelVersion(request.body?.options?.modelVersion)
      const ratio = String(request.body?.options?.ratio || '16:9').trim() || '16:9'
      const duration = Math.max(4, Math.min(15, Number(request.body?.options?.duration) || 10))
      const videoResolution = request.body?.options?.videoResolution === '480p' ? '480p' : '720p'
      const images = Array.isArray(request.body?.images) ? request.body.images : []
      if (!prompt) {
        response.status(400).json({ error: '视频提示词不能为空。' })
        return
      }
      if (images.length === 0) {
        response.status(400).json({ error: '至少需要 1 张分镜图才能提交 Seedance。' })
        return
      }
      const uploadId = crypto.randomUUID()
      const workingDir = uploadDir(projectId, uploadId)
      await ensureDir(workingDir)
      const imagePaths: string[] = []
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index]
        const { mimeType, dataBase64 } = await resolveAssetPayload(image, 'image', request)
        validateAssetMimeType('image', mimeType)
        const safeName = basename(buildUploadFileName(image, index, 'image', mimeType))
        const targetPath = join(workingDir, safeName)
        await writeBase64File(targetPath, dataBase64)
        imagePaths.push(targetPath)
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
      ]
      const { payload } = await runDreaminaJson(args)
      const submitId = String(payload?.submit_id || payload?.submitId || '').trim()
      const genStatus = String(payload?.gen_status || payload?.genStatus || '').trim()
      if (!submitId) throw new Error('Dreamina 未返回 submit_id。')
      await ensureDir(taskDir(submitId))
      await saveRawPayload(join(taskDir(submitId), 'submit.json'), payload)
      response.json({ submitId, genStatus, raw: payload })
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/task/:submitId', async (request, response) => {
    try {
      const submitId = String(request.params.submitId || '').trim()
      if (!submitId) {
        response.status(400).json({ error: 'submitId 不能为空。' })
        return
      }
      const directory = taskDir(submitId)
      await ensureDir(directory)
      let payload
      let fallbackUsed = false
      try {
        const result = await runDreaminaJson(['query_result', `--submit_id=${submitId}`])
        payload = result.payload
      } catch (queryError) {
        console.warn(`[SeedanceBridge] query_result failed for ${submitId}:`, normalizeErrorMessage(queryError))
        try {
          const listResult = await runDreaminaJson(['list_task', `--submit_id=${submitId}`])
          const tasks = Array.isArray(listResult.payload) ? listResult.payload : []
          const task = tasks.find((t) => t.submit_id === submitId || t.submitId === submitId)
          if (!task) throw new Error('未在任务列表中找到该任务 ID。')
          payload = task
          fallbackUsed = true
        } catch (fallbackError) {
          throw queryError
        }
      }
      if (payload && payload.result_json) {
        const { videos = [], images = [] } = payload.result_json
        for (let i = 0; i < videos.length; i++) {
          const url = videos[i].video_url
          if (url) {
            const extension = videos[i].format ? `.${videos[i].format.replace(/^\./, '')}` : '.mp4'
            const fileName = `${submitId}_video_${i + 1}${extension}`
            const filePath = resolve(directory, fileName)
            let needsDownload = true
            try {
              const stats = await stat(filePath)
              if (stats.size > 200000) needsDownload = false
            } catch {}
            if (needsDownload) {
              try {
                const res = await fetch(url)
                if (res.ok) await writeFile(filePath, Buffer.from(await res.arrayBuffer()))
              } catch (err) {
                console.warn(`[SeedanceBridge] failed to fetch video ${fileName}:`, err)
              }
            }
          }
        }
        for (let i = 0; i < images.length; i++) {
          const url = images[i].image_url
          if (url) {
            const fileName = `${submitId}_image_${i + 1}.png`
            const filePath = resolve(directory, fileName)
            let needsDownload = true
            try {
              const stats = await stat(filePath)
              if (stats.size > 1000) needsDownload = false
            } catch {}
            if (needsDownload) {
              try {
                const res = await fetch(url)
                if (res.ok) await writeFile(filePath, Buffer.from(await res.arrayBuffer()))
              } catch (err) {
                console.warn(`[SeedanceBridge] failed to fetch image ${fileName}:`, err)
              }
            }
          }
        }
      }
      await saveRawPayload(join(directory, 'result.json'), payload)
      response.json({
        submitId,
        genStatus: payload?.gen_status || payload?.genStatus || '',
        queueInfo: payload?.queue_info || payload?.queueInfo || {},
        downloadedFiles: await listDownloadedFiles(submitId),
        fallbackUsed,
        raw: payload
      })
    } catch (error) {
      response.status(500).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.get('/api/seedance/file/:submitId/:filename', async (request, response) => {
    try {
      const submitId = String(request.params.submitId || '').trim()
      const requestedFileName = basename(String(request.params.filename || '').trim())
      if (!submitId || !requestedFileName) {
        response.status(400).json({ error: '文件参数无效。' })
        return
      }
      const absolutePath = resolve(taskDir(submitId), requestedFileName)
      const fileBuffer = await readFile(absolutePath)
      response.setHeader('Content-Type', 'video/mp4')
      response.send(fileBuffer)
    } catch (error) {
      response.status(404).json({ error: normalizeErrorMessage(error) })
    }
  })

  app.delete('/api/seedance/file/:submitId/:filename', async (request, response) => {
    try {
      const submitId = String(request.params.submitId || '').trim()
      const requestedFileName = basename(String(request.params.filename || '').trim())
      if (!submitId || !requestedFileName) {
        response.status(400).json({ error: '文件参数无效。' })
        return
      }
      await unlink(resolve(taskDir(submitId), requestedFileName))
      response.json({ ok: true })
    } catch (error) {
      response.status(404).json({ error: normalizeErrorMessage(error) })
    }
  })

  await ensureDir(bridgeRoot)
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`Seedance bridge (Electron) listening on http://127.0.0.1:${port}`)
      resolve({
        port,
        close: () => server.close()
      })
    })

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Bridge] Port ${port} is already in use. Please stop other instances of the bridge.`)
        reject(err)
      } else {
        console.error(`[Bridge] Failed to start server:`, err)
        reject(err)
      }
    })
  })
}
