/** Format amounts as Australian dollars (UI convention: A$ prefix). */
export function formatAud(value, options = {}) {
  const n = Number(value);
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 2, ...options });
  return `A$${s}`;
}
