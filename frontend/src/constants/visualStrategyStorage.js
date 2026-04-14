const KEY = "corrie_visual_saved_strategies_v1";

export const VISUAL_SAVED_STRATEGIES_MAX = 30;

/**
 * @typedef {{ id: string; title: string; blocks: { id?: string; type: string; params?: Record<string, unknown>}[]; savedAt: string }} SavedVisualStrategy
 */

/** @returns {SavedVisualStrategy[]} */
export function loadVisualStrategies() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.title === "string" &&
        Array.isArray(x.blocks) &&
        x.blocks.every((b) => b && typeof b.type === "string")
    );
  } catch {
    return [];
  }
}

/** @param {SavedVisualStrategy[]} items */
export function saveVisualStrategies(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}
