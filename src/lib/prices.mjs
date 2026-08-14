import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRICES_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/prices.generated.json"
);

export function loadPrices() {
  try {
    return JSON.parse(readFileSync(PRICES_PATH, "utf8"));
  } catch {
    return {};
  }
}

// Texto relativo ("hoy", "ayer", "hace X días") a partir del dato más reciente
// entre los precios cargados. Se genera solo a partir de fetchedAt, nunca a mano.
export function lastUpdatedLabel(prices) {
  const timestamps = Object.values(prices)
    .map((p) => p?.fetchedAt)
    .filter(Boolean)
    .map((t) => new Date(t).getTime());

  if (timestamps.length === 0) return null;

  const latest = new Date(Math.max(...timestamps));
  const days = Math.floor((Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24));

  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}
