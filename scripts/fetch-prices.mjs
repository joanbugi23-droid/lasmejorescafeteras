#!/usr/bin/env node
// Llama a la Amazon Creators API (sucesora de PA-API 5.0, que se retiró el
// 15/05/2026) para refrescar precio, disponibilidad, título e imagen de cada
// ASIN listado en src/data/products.json.
//
// Autenticación OAuth 2.0 (client_credentials) con las credenciales v3.x que
// se generan en Amazon Associates Central > Herramientas > Creators API:
// un Client ID (amzn1.application-oa2-client...) y un Client Secret
// (amzn1.oa2-cs.v1...). No requiere ninguna dependencia externa.
//
// Variables de entorno requeridas:
//   AMAZON_CREDENTIAL_ID, AMAZON_CREDENTIAL_SECRET, AMAZON_PARTNER_TAG
// Opcionales (por defecto: mercado España / región Europa):
//   AMAZON_TOKEN_ENDPOINT=https://api.amazon.co.uk/auth/o2/token
//   AMAZON_MARKETPLACE=www.amazon.es

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const OUTPUT_PATH = path.join(ROOT, "src/data/prices.generated.json");

// La versión de credencial (3.2 para la región Europa) determina el endpoint
// de token: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl#regional-endpoints
const TOKEN_ENDPOINT = process.env.AMAZON_TOKEN_ENDPOINT || "https://api.amazon.co.uk/auth/o2/token";
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
];

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
  if (!response.ok) {
    throw new Error(`No se pudo obtener el token de acceso (${response.status}): ${text}`);
  }
  const data = JSON.parse(text);
  return data.access_token;
}

async function getItems(accessToken, asins) {
  const response = await fetch(GETITEMS_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-marketplace": MARKETPLACE,
    },
    body: JSON.stringify({
      itemIds: asins,
      itemIdType: "ASIN",
      marketplace: MARKETPLACE,
      partnerTag: PARTNER_TAG,
      resources: RESOURCES,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Creators API respondió ${response.status} para [${asins.join(", ")}]: ${text}`);
  }
  return JSON.parse(text);
}

// Los nombres de campo exactos de la respuesta (mayúsculas/minúsculas) no
// están del todo documentados para todos los casos, así que se prueban las
// variantes más probables en vez de asumir una sola.
function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key];
  }
  return undefined;
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function main() {
  const products = JSON.parse(await readFile(PRODUCTS_PATH, "utf8"));
  const uniqueAsins = [...new Set(products.map((p) => p.asin))];

  if (!CREDENTIAL_ID || !CREDENTIAL_SECRET || !PARTNER_TAG) {
    console.warn(
      "[fetch-prices] Faltan credenciales (AMAZON_CREDENTIAL_ID / AMAZON_CREDENTIAL_SECRET / AMAZON_PARTNER_TAG)."
    );
    console.warn("[fetch-prices] Se omite la llamada a Amazon y se conserva el archivo de precios existente (si lo hay).");
    try {
      await readFile(OUTPUT_PATH, "utf8");
    } catch {
      await writeFile(OUTPUT_PATH, "{}\n", "utf8");
    }
    return;
  }

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("[fetch-prices] No se pudo autenticar con Creators API:", err.message);
    console.error(
      "[fetch-prices] Si el error es AssociateNotEligible, la cuenta aún no cumple el mínimo de 10 ventas válidas en 30 días (puede tardar hasta 48h en activarse tras crear la credencial)."
    );
    process.exitCode = 1;
    return;
  }

  const result = {};
  const batches = chunk(uniqueAsins, 10);

  for (const batch of batches) {
    try {
      const data = await getItems(accessToken, batch);
      const items = pick(pick(data, "itemsResult", "ItemsResult"), "items", "Items") ?? [];

      for (const item of items) {
        const asin = pick(item, "asin", "ASIN");
        const images = pick(item, "images", "Images");
        const image = pick(pick(images, "primary", "Primary"), "large", "Large");
        const itemInfo = pick(item, "itemInfo", "ItemInfo");
        const title = pick(pick(itemInfo, "title", "Title"), "displayValue", "DisplayValue");
        const offers = pick(item, "offersV2", "OffersV2");
        const listing = pick(offers, "listings", "Listings")?.[0];
        const price = pick(listing, "price", "Price");
        const availability = pick(listing, "availability", "Availability");

        result[asin] = {
          asin,
          title: title ?? null,
          image: pick(image, "url", "URL", "Url") ?? null,
          price: pick(price, "displayAmount", "DisplayAmount") ?? null,
          priceAmount: pick(price, "amount", "Amount") ?? null,
          currency: pick(price, "currency", "Currency") ?? null,
          available: Boolean(listing),
          availabilityMessage: pick(availability, "message", "Message", "type", "Type") ?? null,
          url: pick(item, "detailPageURL", "DetailPageURL") ?? `https://www.amazon.es/dp/${asin}?tag=${PARTNER_TAG}`,
          fetchedAt: new Date().toISOString(),
        };
      }

      const errors = pick(data, "errors", "Errors") ?? [];
      for (const err of errors) {
        console.warn(`[fetch-prices] Aviso de Creators API: ${pick(err, "code", "Code")} - ${pick(err, "message", "Message")}`);
      }
    } catch (err) {
      console.error(`[fetch-prices] Error consultando lote [${batch.join(", ")}]:`, err.message);
    }
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`[fetch-prices] Guardados ${Object.keys(result).length}/${uniqueAsins.length} productos en ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error("[fetch-prices] Fallo inesperado:", err);
  process.exit(1);
});
