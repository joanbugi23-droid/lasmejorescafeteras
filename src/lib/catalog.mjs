// Import estático (como el resto de src/data/*.json) en vez de leer el
// archivo con fs en tiempo de ejecución: con fs + ruta calculada desde
// import.meta.url, el dev server funcionaba pero el build estático de Astro
// (que empaqueta este módulo de forma distinta) resolvía la ruta mal y
// generaba páginas sin productos. El import lo resuelve Vite en build time
// y funciona igual en dev y en build.
import catalogData from "../data/catalog.generated.json";

// Cache persistente generada por scripts/fetch-catalog.mjs: productos
// (por ASIN), y las listas de ASINs elegidas por categoría / top / ofertas.
export function loadCatalog() {
  return {
    items: catalogData.items ?? {},
    categories: catalogData.categories ?? {},
    top: catalogData.top ?? [],
    deals: catalogData.deals ?? [],
  };
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
function rankedPicks(items) {
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

  return { bestSeller, bestValue, bestPrice };
}

export function categoryHighlights(items) {
  const { bestSeller, bestValue, bestPrice } = rankedPicks(items);

  const labels = {};
  if (bestSeller) labels[bestSeller.asin] = "Más vendida";
  if (bestValue && !labels[bestValue.asin]) labels[bestValue.asin] = "Mejor calidad-precio";
  if (bestPrice && !labels[bestPrice.asin]) labels[bestPrice.asin] = "Mejor precio";

  return labels;
}

// Producto que encabeza la tabla comparativa ("Mejor opción"), con la misma
// prioridad objetiva que categoryHighlights (más vendida > calidad-precio >
// precio). Si ningún producto tiene datos suficientes para decidir, cae al
// primero de la lista tal cual venga de la API, sin opinión editorial.
export function pickBestAsin(items) {
  const { bestSeller, bestValue, bestPrice } = rankedPicks(items);
  return (bestSeller ?? bestValue ?? bestPrice ?? items[0])?.asin ?? null;
}

// Elemento señal del sitio: posición del precio de un producto dentro del
// rango de precios de su propio grupo (categoría, Top...), para el medidor
// de gama bajo cada precio. Devuelve null si no hay suficientes precios
// para que un rango tenga sentido.
export function priceGauge(item, groupItems) {
  const prices = groupItems.map((i) => i.priceAmount).filter((p) => p != null);
  if (item.priceAmount == null || prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return null;

  const position = Math.round(((item.priceAmount - min) / (max - min)) * 100);
  const tier = position < 33 ? "Gama económica" : position < 66 ? "Gama media" : "Gama premium";
  return { position, tier };
}

// Etiquetas de posición (Nº1, Top 3...) para un ranking ya ordenado por un
// criterio objetivo de la API (ej. AvgCustomerReviews). No decide el orden,
// solo lo etiqueta.
export function rankBadges(items) {
  const labels = {};
  items.forEach((item, index) => {
    if (index === 0) labels[item.asin] = "Nº1";
    else if (index < 3) labels[item.asin] = "Top 3";
  });
  return labels;
}

// Precio más bajo disponible en un grupo de productos, formateado en
// es-ES (ej. "24,60 €"), para usar en title/meta ("desde X €"). Se genera
// solo a partir de datos reales; si todavía no hay ningún precio, no se
// escribe ninguna cifra.
const EUR_FORMATTER = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function minPriceLabel(items) {
  const prices = items.filter((item) => item.available).map((item) => item.priceAmount).filter((p) => p != null);
  if (prices.length === 0) return null;
  return EUR_FORMATTER.format(Math.min(...prices));
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
