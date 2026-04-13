import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { getAbi } from 'node-abi'
import {
  getBetterSqlite3BuildBinaryPath,
  getBetterSqlite3ElectronCachePath,
  getProjectRoot
} from '../server/betterSqlite3NativePaths.mjs'

const require = createRequire(import.meta.url)
const projectRoot = getProjectRoot()
const betterSqliteBinary = getBetterSqlite3BuildBinaryPath()
const electronRebuildCli = join(projectRoot, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')
const electronVersion = require('electron/package.json').version
const electronAbi = getAbi(electronVersion, 'electron')
const cachedElectronBinary = getBetterSqlite3ElectronCachePath({
  electronVersion,
  abi: electronAbi
})

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env
  })
}

function checkBetterSqliteInElectron(binaryPath) {
  if (!existsSync(binaryPath)) {
    return { ok: false, reason: `Missing native binary at ${binaryPath}` }
  }

  let electronBinary
  try {
    electronBinary = require('electron')
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error || 'Unable to resolve Electron binary')
    }
  }

  const probe = run(
    electronBinary,
    [
      '-e',
      `const Database = require('better-sqlite3'); const db = new Database(':memory:', { nativeBinding: ${JSON.stringify(binaryPath)} }); db.exec('SELECT 1'); db.close(); console.log(JSON.stringify({ ok: true, electron: process.versions.electron, node: process.versions.node, modules: process.versions.modules, binary: ${JSON.stringify(binaryPath)} }))`
    ],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      }
    }
  )

  if (probe.status === 0) {
    const details = probe.stdout.trim()
    return {
      ok: true,
      reason: details || 'Electron can load better-sqlite3'
    }
  }

  return {
    ok: false,
    reason: [probe.stdout, probe.stderr].map((value) => value.trim()).filter(Boolean).join('\n')
      || `Electron exited with status ${probe.status ?? 'unknown'}`
  }
}

function rebuildBetterSqlite() {
  const rebuild = run(
    process.execPath,
    [electronRebuildCli, '-f', '-w', 'better-sqlite3'],
    { stdio: 'inherit' }
  )
  if (rebuild.status !== 0) {
    process.exit(rebuild.status ?? 1)
  }
}

function cacheCurrentElectronBinary() {
  if (!existsSync(betterSqliteBinary)) {
    throw new Error(`Missing rebuilt Electron binary at ${betterSqliteBinary}`)
  }

  mkdirSync(dirname(cachedElectronBinary), { recursive: true })
  copyFileSync(betterSqliteBinary, cachedElectronBinary)
}

const initialCheck = checkBetterSqliteInElectron(cachedElectronBinary)
if (initialCheck.ok) {
  console.log(`[native-check] ${initialCheck.reason}`)
  process.exit(0)
}

const buildCheck = checkBetterSqliteInElectron(betterSqliteBinary)
if (buildCheck.ok) {
  cacheCurrentElectronBinary()
  console.log(`[native-check] ${buildCheck.reason}`)
  process.exit(0)
}

console.warn('[native-check] Electron native module mismatch detected. Rebuilding better-sqlite3...')
if (initialCheck.reason) {
  console.warn(initialCheck.reason)
}
if (buildCheck.reason) {
  console.warn(buildCheck.reason)
}

rebuildBetterSqlite()
cacheCurrentElectronBinary()

const finalCheck = checkBetterSqliteInElectron(cachedElectronBinary)
if (!finalCheck.ok) {
  console.error('[native-check] Rebuild completed, but Electron still cannot load better-sqlite3.')
  if (finalCheck.reason) {
    console.error(finalCheck.reason)
  }
  process.exit(1)
}

console.log(`[native-check] ${finalCheck.reason}`)
