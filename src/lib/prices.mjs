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
