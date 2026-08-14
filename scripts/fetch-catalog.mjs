#!/usr/bin/env node
// Rellena cada categoría automáticamente vía Amazon Creators API SearchItems
// (por palabras clave), en vez de depender de una lista de ASINs escrita a
// mano: https://afiliados.amazon.es/creatorsapi/docs/en-us/api-reference/operations/search-items
//
// - src/data/searchQueries.json define las palabras clave por categoría, más
//   una búsqueda general ("top") y una de ofertas (minSavingPercent).
// - src/data/products.json es el "método secundario": ASINs puntuales que se
//   quieren forzar en una categoría (se resuelven con GetItems y van primero).
// - src/data/tops.json son las páginas "Top Cafeteras {año}" (lista fija de
//   ASINs decidida una vez al año; aquí solo se refresca su precio/stock).
//
// Autenticación OAuth 2.0 (client_credentials), igual que Creators API en
// general. Variables de entorno requeridas: AMAZON_CREDENTIAL_ID,
// AMAZON_CREDENTIAL_SECRET, AMAZON_PARTNER_TAG. Opcionales:
// AMAZON_TOKEN_ENDPOINT (por defecto región Europa), AMAZON_MARKETPLACE.
//
// src/data/catalog.generated.json es una cache persistente que se sube al
// repositorio. Cada ejecución solo sobrescribe lo que la API respondió con
// éxito; si una búsqueda o un ASIN falla, se conserva el último dato válido
// para que la web nunca se quede sin productos ni con datos rotos.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const QUERIES_PATH = path.join(ROOT, "src/data/searchQueries.json");
const TOPS_PATH = path.join(ROOT, "src/data/tops.json");
const OUTPUT_PATH = path.join(ROOT, "src/data/catalog.generated.json");

const TOKEN_ENDPOINT = process.env.AMAZON_TOKEN_ENDPOINT || "https://api.amazon.co.uk/auth/o2/token";
const SEARCHITEMS_ENDPOINT = "https://creatorsapi.amazon/catalog/v1/searchItems";
const GETITEMS_ENDPOINT = "https://creatorsapi.amazon/catalog/v1/getItems";
const MARKETPLACE = process.env.AMAZON_MARKETPLACE || "www.amazon.es";

const CREDENTIAL_ID = process.env.AMAZON_CREDENTIAL_ID;
const CREDENTIAL_SECRET = process.env.AMAZON_CREDENTIAL_SECRET;
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;

const RESOURCES = [
  "images.primary.large",
  "itemInfo.title",
  "offersV2.listings.price",
  "offersV2.listings.availability",
  "customerReviews.starRating",
  "customerReviews.count",
  "browseNodeInfo.websiteSalesRank",
];

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key];
  }
  return undefined;
}

async function getAccessToken() {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CREDENTIAL_ID,
      client_secret: CREDENTIAL_SECRET,
      scope: "creatorsapi::default",
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`No se pudo obtener el token de acceso (${response.status}): ${text}`);
  return JSON.parse(text).access_token;
}

async function callCreatorsApi(endpoint, accessToken, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-marketplace": MARKETPLACE,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text}`);
  return JSON.parse(text);
}

async function searchItems(accessToken, { keywords, sortBy, itemCount, minSavingPercent }) {
  const data = await callCreatorsApi(SEARCHITEMS_ENDPOINT, accessToken, {
    keywords,
    itemCount: itemCount ?? 5,
    partnerTag: PARTNER_TAG,
    marketplace: MARKETPLACE,
    resources: RESOURCES,
    ...(sortBy ? { sortBy } : {}),
    ...(minSavingPercent ? { minSavingPercent } : {}),
  });
  const items = pick(pick(data, "searchResult", "SearchResult"), "items", "Items") ?? [];
  return items.map(parseItem);
}

async function getItems(accessToken, asins) {
  const data = await callCreatorsApi(GETITEMS_ENDPOINT, accessToken, {
    itemIds: asins,
    itemIdType: "ASIN",
    marketplace: MARKETPLACE,
    partnerTag: PARTNER_TAG,
    resources: RESOURCES,
  });
  const items = pick(pick(data, "itemsResult", "ItemsResult"), "items", "Items") ?? [];
  return items.map(parseItem);
}

// Los nombres de campo exactos de la respuesta (mayúsculas/minúsculas) no
// están del todo documentados para todos los casos, así que se prueban las
// variantes más probables en vez de asumir una sola.
function parseItem(item) {
  const asin = pick(item, "asin", "ASIN");
  const images = pick(item, "images", "Images");
  const image = pick(pick(images, "primary", "Primary"), "large", "Large");
  const itemInfo = pick(item, "itemInfo", "ItemInfo");
  const title = pick(pick(itemInfo, "title", "Title"), "displayValue", "DisplayValue");
  const offers = pick(item, "offersV2", "OffersV2");
  const listing = pick(offers, "listings", "Listings")?.[0];
  const price = pick(listing, "price", "Price");
  const availability = pick(listing, "availability", "Availability");
  const savings = pick(price, "savings", "Savings");
  const savingBasis = pick(price, "savingBasis", "SavingBasis");
  const reviews = pick(item, "customerReviews", "CustomerReviews");
  const browseNodeInfo = pick(item, "browseNodeInfo", "BrowseNodeInfo");
  const salesRank = pick(browseNodeInfo, "websiteSalesRank", "WebsiteSalesRank");

  return {
    asin,
    title: title ?? null,
    image: pick(image, "url", "URL", "Url") ?? null,
    price: pick(price, "displayAmount", "DisplayAmount") ?? null,
    priceAmount: pick(price, "amount", "Amount") ?? null,
    currency: pick(price, "currency", "Currency") ?? null,
    previousPrice: pick(savingBasis, "displayAmount", "DisplayAmount") ?? null,
    discountPercent: pick(savings, "percentage", "Percentage") ?? null,
    available: Boolean(listing),
    availabilityMessage: pick(availability, "message", "Message", "type", "Type") ?? null,
    starRating: pick(reviews, "starRating", "StarRating") ?? null,
    reviewCount: pick(reviews, "count", "Count") ?? null,
    salesRank: pick(salesRank, "salesRank", "SalesRank") ?? null,
    url: pick(item, "detailPageURL", "DetailPageURL") ?? `https://www.amazon.es/dp/${asin}?tag=${PARTNER_TAG}`,
    fetchedAt: new Date().toISOString(),
  };
}

function uniqueAsins(list) {
  return [...new Set(list.filter(Boolean))];
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const manualPicks = await loadJson(PRODUCTS_PATH, []);
  const queries = await loadJson(QUERIES_PATH, { categories: [], top: null, deals: null });
  const tops = await loadJson(TOPS_PATH, []);
  const catalog = await loadJson(OUTPUT_PATH, { items: {}, categories: {}, top: [], deals: [] });
  catalog.items ??= {};
  catalog.categories ??= {};

  if (!CREDENTIAL_ID || !CREDENTIAL_SECRET || !PARTNER_TAG) {
    console.warn("[fetch-catalog] Faltan credenciales (AMAZON_CREDENTIAL_ID / AMAZON_CREDENTIAL_SECRET / AMAZON_PARTNER_TAG).");
    console.warn("[fetch-catalog] Se omite la llamada a Amazon y se conserva la cache de catálogo existente (si la hay).");
    return;
  }

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("[fetch-catalog] No se pudo autenticar con Creators API:", err.message);
    console.error("[fetch-catalog] Se conserva la cache de catálogo existente sin cambios.");
    return;
  }

  function saveItems(items) {
    for (const item of items) {
      if (item.asin) catalog.items[item.asin] = item;
    }
  }

  // Categorías: búsqueda por palabras clave + ASINs forzados a mano (van primero)
  for (const query of queries.categories ?? []) {
    const pinnedAsins = uniqueAsins(manualPicks.filter((p) => p.category === query.slug).map((p) => p.asin));
    let pinnedItems = [];
    if (pinnedAsins.length > 0) {
      try {
        pinnedItems = await getItems(accessToken, pinnedAsins);
        saveItems(pinnedItems);
      } catch (err) {
        console.error(`[fetch-catalog] Error obteniendo ASINs forzados de "${query.slug}":`, err.message);
      }
    }

    try {
      const found = await searchItems(accessToken, query);
      saveItems(found);
      const combined = uniqueAsins([...pinnedItems.map((i) => i.asin), ...found.map((i) => i.asin)]);
      catalog.categories[query.slug] = combined.slice(0, query.count ?? 5);
    } catch (err) {
      console.error(`[fetch-catalog] Error buscando "${query.slug}" (se conserva la lista anterior):`, err.message);
    }
  }

  // Top Cafeteras general (portada)
  if (queries.top) {
    try {
      const found = await searchItems(accessToken, queries.top);
      saveItems(found);
      catalog.top = uniqueAsins(found.map((i) => i.asin)).slice(0, queries.top.count ?? 5);
    } catch (err) {
      console.error("[fetch-catalog] Error buscando el Top general (se conserva el anterior):", err.message);
    }
  }

  // Ofertas del mes
  if (queries.deals) {
    try {
      const found = await searchItems(accessToken, queries.deals);
      saveItems(found);
      catalog.deals = uniqueAsins(found.map((i) => i.asin)).slice(0, queries.deals.count ?? 5);
    } catch (err) {
      console.error("[fetch-catalog] Error buscando ofertas (se conserva la lista anterior):", err.message);
    }
  }

  // Páginas "Top Cafeteras {año}": lista fija de ASINs, solo se refresca el precio
  for (const top of tops) {
    try {
      const items = await getItems(accessToken, uniqueAsins(top.asins));
      saveItems(items);
    } catch (err) {
      console.error(`[fetch-catalog] Error refrescando Top Cafeteras ${top.year}:`, err.message);
    }
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(
    `[fetch-catalog] Guardado: ${Object.keys(catalog.items).length} productos en cache, ${Object.keys(catalog.categories).length} categorías, top=${catalog.top?.length ?? 0}, ofertas=${catalog.deals?.length ?? 0}`
  );
}

main().catch((err) => {
  console.error("[fetch-catalog] Fallo inesperado:", err);
  process.exit(1);
});
