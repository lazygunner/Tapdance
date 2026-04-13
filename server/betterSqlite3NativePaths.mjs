import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = findProjectRoot(serverDir);
const nativeModulesRoot = join(projectRoot, 'local_data', 'native_modules', 'better-sqlite3');

export function getProjectRoot() {
  return projectRoot;
}

export function getBetterSqlite3BuildBinaryPath() {
  return join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
}

export function getBetterSqlite3NodeCachePath({
  abi = process.versions.modules,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  return join(nativeModulesRoot, `node-v${abi}-${platform}-${arch}`, 'better_sqlite3.node');
}

export function getBetterSqlite3ElectronCachePath({
  electronVersion = process.versions.electron,
  abi = process.versions.modules,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const electronTag = electronVersion ? `electron-v${electronVersion}` : 'electron';
  return join(nativeModulesRoot, `${electronTag}-abi${abi}-${platform}-${arch}`, 'better_sqlite3.node');
}

function findProjectRoot(startDir) {
  const candidates = [
    process.env.TAPDANCE_PROJECT_ROOT ? resolve(process.env.TAPDANCE_PROJECT_ROOT) : null,
    process.cwd(),
    startDir,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const discovered = findAncestorWithPackageJson(resolve(candidate));
    if (discovered) {
      return discovered;
    }
  }

  return resolve(startDir, '..');
}

function findAncestorWithPackageJson(startDir) {
  let currentDir = resolve(startDir);

  while (true) {
    if (existsSync(join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
