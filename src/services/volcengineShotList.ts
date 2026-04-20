import type { Shot } from '../types.ts';

export function normalizeVolcengineShotListResult(result: unknown): Array<Omit<Shot, 'id'>> {
  const candidate = Array.isArray(result)
    ? result
    : (() => {
      if (!result || typeof result !== 'object') {
        return null;
      }

      const record = result as Record<string, unknown>;
      const preferredKeys = ['shots', 'shotList', 'shot_list', 'items', 'data', 'result'];
      for (const key of preferredKeys) {
        if (Array.isArray(record[key])) {
          return record[key];
        }
      }

      return Object.values(record).find(Array.isArray) || null;
    })();

  if (!Array.isArray(candidate) || candidate.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('火山引擎返回的分镜列表格式无效：期望 JSON 数组或包含 shots 数组的对象。');
  }

  return candidate as Array<Omit<Shot, 'id'>>;
}
