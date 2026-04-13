import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  getBetterSqlite3BuildBinaryPath,
  getBetterSqlite3NodeCachePath,
  getProjectRoot
} from '../server/betterSqlite3NativePaths.mjs'

const projectRoot = getProjectRoot()
const betterSqliteBinary = getBetterSqlite3BuildBinaryPath()
const cachedNodeBinary = getBetterSqlite3NodeCachePath()
const betterSqliteModuleRoot = join(projectRoot, 'node_modules', 'better-sqlite3')
const nodeGypCli = join(projectRoot, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env
  })
}

function checkBetterSqliteInNode(binaryPath) {
  if (!existsSync(binaryPath)) {
    return { ok: false, reason: `Missing native binary at ${binaryPath}` }
  }

  const probe = run(process.execPath, [
    '-e',
    `const Database = require('better-sqlite3'); const db = new Database(':memory:', { nativeBinding: ${JSON.stringify(binaryPath)} }); db.exec('SELECT 1'); db.close(); console.log(JSON.stringify({ ok: true, node: process.versions.node, modules: process.versions.modules, binary: ${JSON.stringify(binaryPath)} }))`
  ])

  if (probe.status === 0) {
    const details = probe.stdout.trim()
    return {
      ok: true,
      reason: details || 'Node can load better-sqlite3'
    }
  }

  return {
    ok: false,
    reason: [probe.stdout, probe.stderr].map((value) => value.trim()).filter(Boolean).join('\n')
      || `Node exited with status ${probe.status ?? 'unknown'}`
  }
}

function rebuildBetterSqliteForNode() {
  const nodeRoot = resolve(dirname(process.execPath), '..')
  const rebuild = run(
    process.execPath,
    [nodeGypCli, 'rebuild', '--release', `--nodedir=${nodeRoot}`],
    {
      cwd: betterSqliteModuleRoot,
      stdio: 'inherit'
    }
  )
  if (rebuild.status !== 0) {
    process.exit(rebuild.status ?? 1)
  }
}

function cacheCurrentNodeBinary() {
  if (!existsSync(betterSqliteBinary)) {
    throw new Error(`Missing rebuilt Node binary at ${betterSqliteBinary}`)
  }

  mkdirSync(dirname(cachedNodeBinary), { recursive: true })
  copyFileSync(betterSqliteBinary, cachedNodeBinary)
}

const initialCheck = checkBetterSqliteInNode(cachedNodeBinary)
if (initialCheck.ok) {
  console.log(`[node-native-check] ${initialCheck.reason}`)
  process.exit(0)
}

const buildCheck = checkBetterSqliteInNode(betterSqliteBinary)
if (buildCheck.ok) {
  cacheCurrentNodeBinary()
  console.log(`[node-native-check] ${buildCheck.reason}`)
  process.exit(0)
}

console.warn('[node-native-check] Node native module mismatch detected. Rebuilding better-sqlite3...')
if (initialCheck.reason) {
  console.warn(initialCheck.reason)
}
if (buildCheck.reason) {
  console.warn(buildCheck.reason)
}

rebuildBetterSqliteForNode()
cacheCurrentNodeBinary()

const finalCheck = checkBetterSqliteInNode(cachedNodeBinary)
if (!finalCheck.ok) {
  console.error('[node-native-check] Rebuild completed, but Node still cannot load better-sqlite3.')
  if (finalCheck.reason) {
    console.error(finalCheck.reason)
  }
  process.exit(1)
}

console.log(`[node-native-check] ${finalCheck.reason}`)
