import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/catalog.generated.json"
);

// Cache persistente generada por scripts/fetch-catalog.mjs: productos
// (por ASIN), y las listas de ASINs elegidas por categoría / top / ofertas.
export function loadCatalog() {
  try {
    const data = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
    return {
      items: data.items ?? {},
      categories: data.categories ?? {},
      top: data.top ?? [],
      deals: data.deals ?? [],
    };
  } catch {
    return { items: {}, categories: {}, top: [], deals: [] };
  }
}

// Resuelve una lista de ASINs a sus datos completos, en el mismo orden,
// omitiendo cualquiera que aún no tenga datos en cache.
export function resolveItems(asins, items) {
  return (asins ?? []).map((asin) => items[asin]).filter(Boolean);
}

// Foto real de un producto de esa categoría, para representarla visualmente
// (portada, menú de categorías) en vez de un icono ilustrativo.
export function representativeImage(categorySlug, catalog) {
  const items = resolveItems(catalog.categories[categorySlug], catalog.items);
  return items.find((item) => item.image)?.image ?? null;
}

// Productos con descuento activo ahora mismo, según el último dato de la API.
export function activeDeals(catalog, limit = 5) {
  return resolveItems(catalog.deals, catalog.items)
    .filter((item) => item.available && item.discountPercent)
    .slice(0, limit);
}

// Texto relativo ("hoy", "ayer", "hace X días") a partir del dato más
// reciente en cache. Se genera solo a partir de fetchedAt, nunca a mano.
export function lastUpdatedLabel(items) {
  const timestamps = Object.values(items)
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
