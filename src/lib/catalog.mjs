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

// Rankings objetivos dentro de una categoría, construidos solo con datos
// reales de la API (nunca una opinión editorial):
// - "Mejor precio": precio actual más bajo.
// - "Mejor relación calidad-precio": mayor ratio valoración/precio.
// - "Más vendida": websiteSalesRank más bajo (lo calcula la propia Amazon).
// Cada producto recibe como mucho una etiqueta (más vendida > calidad-precio
// > precio), para no saturar la tarjeta si coincide en varios criterios.
export function categoryHighlights(items) {
  const available = items.filter((item) => item.available);

  const bestSeller = available
    .filter((item) => item.salesRank != null)
    .sort((a, b) => a.salesRank - b.salesRank)[0];

  const bestValue = available
    .filter((item) => item.priceAmount && item.starRating)
    .sort((a, b) => b.starRating / b.priceAmount - a.starRating / a.priceAmount)[0];

  const bestPrice = available
    .filter((item) => item.priceAmount != null)
    .sort((a, b) => a.priceAmount - b.priceAmount)[0];

  const labels = {};
  if (bestSeller) labels[bestSeller.asin] = "Más vendida";
  if (bestValue && !labels[bestValue.asin]) labels[bestValue.asin] = "Mejor calidad-precio";
  if (bestPrice && !labels[bestPrice.asin]) labels[bestPrice.asin] = "Mejor precio";

  return labels;
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
