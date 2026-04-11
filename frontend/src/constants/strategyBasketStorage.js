const KEY = "corrie_backtest_strategy_basket_v1";

/** @typedef {{ id: string, title: string, code: string, savedAt?: string }} BasketStrategy */

/** @returns {BasketStrategy[]} */
export function loadStrategyBasket() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) => x && typeof x.id === "string" && typeof x.title === "string" && typeof x.code === "string"
    );
  } catch {
    return [];
  }
}

/** @param {BasketStrategy[]} items */
export function saveStrategyBasket(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}
