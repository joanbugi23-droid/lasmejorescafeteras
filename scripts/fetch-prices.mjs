#!/usr/bin/env node
// Llama a Amazon Product Advertising API 5.0 (GetItems) para refrescar precio,
// disponibilidad, título e imagen de cada ASIN listado en src/data/products.json.
// Firma las peticiones con AWS Signature V4 usando solo el módulo "crypto" de
// Node (sin dependencias externas) para no depender de paquetes de terceros
// sin mantenimiento activo.
//
// Variables de entorno requeridas:
//   AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG
// Opcionales (por defecto: mercado España):
//   AMAZON_HOST=webservices.amazon.es
//   AMAZON_REGION=eu-west-1
//   AMAZON_MARKETPLACE=www.amazon.es

import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const OUTPUT_PATH = path.join(ROOT, "src/data/prices.generated.json");

const HOST = process.env.AMAZON_HOST || "webservices.amazon.es";
const REGION = process.env.AMAZON_REGION || "eu-west-1";
const MARKETPLACE = process.env.AMAZON_MARKETPLACE || "www.amazon.es";
const SERVICE = "ProductAdvertisingAPI";
const URI = "/paapi5/getitems";
const TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";

const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;

function sha256Hex(data) {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function amzTimestamp() {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function signedGetItemsRequest(asins) {
  const { amzDate, dateStamp } = amzTimestamp();

  const body = JSON.stringify({
    ItemIds: asins,
    ItemIdType: "ASIN",
    PartnerTag: PARTNER_TAG,
    PartnerType: "Associates",
    Marketplace: MARKETPLACE,
    Resources: [
      "Images.Primary.Large",
      "ItemInfo.Title",
      "Offers.Listings.Price",
      "Offers.Listings.Availability.Message",
      "Offers.Listings.DeliveryInfo.IsPrimeEligible",
    ],
  });

  const headersToSign = {
    "content-encoding": "amz-1.0",
    "content-type": "application/json; charset=UTF-8",
    host: HOST,
    "x-amz-date": amzDate,
    "x-amz-target": TARGET,
  };
  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${headersToSign[k]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    "POST",
    URI,
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(SECRET_KEY, dateStamp, REGION, SERVICE);
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${HOST}${URI}`, {
    method: "POST",
    headers: {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=UTF-8",
      host: HOST,
      "x-amz-date": amzDate,
      "x-amz-target": TARGET,
      authorization,
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PA-API respondió ${response.status} para [${asins.join(", ")}]: ${text}`);
  }
  return JSON.parse(text);
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function main() {
  const products = JSON.parse(await readFile(PRODUCTS_PATH, "utf8"));
  const uniqueAsins = [...new Set(products.map((p) => p.asin))];

  if (!ACCESS_KEY || !SECRET_KEY || !PARTNER_TAG) {
    console.warn(
      "[fetch-prices] Faltan credenciales de PA-API (AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY / AMAZON_PARTNER_TAG)."
    );
    console.warn("[fetch-prices] Se omite la llamada a Amazon y se conserva el archivo de precios existente (si lo hay).");
    try {
      await readFile(OUTPUT_PATH, "utf8");
    } catch {
      await writeFile(OUTPUT_PATH, "{}\n", "utf8");
    }
    return;
  }

  const result = {};
  const batches = chunk(uniqueAsins, 10); // GetItems admite hasta 10 ASINs por llamada

  for (const batch of batches) {
    try {
      const data = await signedGetItemsRequest(batch);
      for (const item of data.ItemsResult?.Items ?? []) {
        const listing = item.Offers?.Listings?.[0];
        result[item.ASIN] = {
          asin: item.ASIN,
          title: item.ItemInfo?.Title?.DisplayValue ?? null,
          image: item.Images?.Primary?.Large?.URL ?? null,
          price: listing?.Price?.DisplayAmount ?? null,
          priceAmount: listing?.Price?.Amount ?? null,
          currency: listing?.Price?.Currency ?? null,
          available: Boolean(listing),
          availabilityMessage: listing?.Availability?.Message ?? null,
          url: item.DetailPageURL ?? `https://www.amazon.es/dp/${item.ASIN}?tag=${PARTNER_TAG}`,
          fetchedAt: new Date().toISOString(),
        };
      }
      for (const err of data.Errors ?? []) {
        console.warn(`[fetch-prices] Aviso de PA-API: ${err.Code} - ${err.Message}`);
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
