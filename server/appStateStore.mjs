import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  getBetterSqlite3ElectronCachePath,
  getBetterSqlite3NodeCachePath,
} from './betterSqlite3NativePaths.mjs';

function normalizeStateKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized || !/^[a-zA-Z0-9._-]+$/u.test(normalized)) {
    throw new Error('状态键无效。');
  }
  return normalized;
}

export function createAppStateStore(dbPath) {
  const resolvedPath = resolve(String(dbPath || 'app-state.sqlite'));
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const nativeBinding = resolveNativeBinding();
  const database = nativeBinding
    ? new Database(resolvedPath, { nativeBinding })
    : new Database(resolvedPath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const selectStatement = database.prepare(`
    SELECT key, value_json AS valueJson, updated_at AS updatedAt
    FROM app_state
    WHERE key = ?
  `);
  const upsertStatement = database.prepare(`
    INSERT INTO app_state (key, value_json, updated_at)
    VALUES (@key, @valueJson, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `);
  const deleteStatement = database.prepare('DELETE FROM app_state WHERE key = ?');

  return {
    path: resolvedPath,
    get(key) {
      const normalizedKey = normalizeStateKey(key);
      const row = selectStatement.get(normalizedKey);
      if (!row) {
        return null;
      }

      return {
        key: row.key,
        value: JSON.parse(row.valueJson),
        updatedAt: row.updatedAt,
      };
    },
    set(key, value) {
      const normalizedKey = normalizeStateKey(key);
      const updatedAt = new Date().toISOString();
      upsertStatement.run({
        key: normalizedKey,
        valueJson: JSON.stringify(value ?? null),
        updatedAt,
      });

      return {
        key: normalizedKey,
        value: value ?? null,
        updatedAt,
      };
    },
    delete(key) {
      const normalizedKey = normalizeStateKey(key);
      deleteStatement.run(normalizedKey);
    },
    close() {
      database.close();
    },
  };
}

function resolveNativeBinding() {
  if (process.versions.electron) {
    const electronBindingPath = getBetterSqlite3ElectronCachePath();
    return existsSync(electronBindingPath) ? electronBindingPath : null;
  }

  const nodeBindingPath = getBetterSqlite3NodeCachePath();
  if (!existsSync(nodeBindingPath)) {
    throw new Error(
      `Missing Node better-sqlite3 binary for ABI ${process.versions.modules} at ${nodeBindingPath}. `
      + 'Run the bridge through npm so the preflight can build the runtime-specific binary.'
    );
  }

  return nodeBindingPath;
}
