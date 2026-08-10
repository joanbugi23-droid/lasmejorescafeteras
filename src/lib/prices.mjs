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

// Fecha del dato más reciente entre los precios cargados, formateada en es-ES.
// Nunca se escribe a mano: sale del propio momento en que se consultó la PA-API.
export function lastUpdatedLabel(prices) {
  const timestamps = Object.values(prices)
    .map((p) => p?.fetchedAt)
    .filter(Boolean)
    .map((t) => new Date(t).getTime());

  if (timestamps.length === 0) return null;

  const latest = new Date(Math.max(...timestamps));
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(latest);
}
