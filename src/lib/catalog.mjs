// Utilidades de catálogo compartidas entre páginas: nunca usan iconos ni
// dibujos genéricos, solo datos reales (imágenes, precios) que vienen de la
// cache de la API de Amazon.

// Foto real de un producto de esa categoría, para representarla visualmente
// (portada, menú de categorías) en vez de un icono ilustrativo.
export function representativeImage(categorySlug, products, prices) {
  const inCategory = products.filter((p) => p.category === categorySlug);
  for (const product of inCategory) {
    const image = prices[product.asin]?.image;
    if (image) return image;
  }
  return null;
}

// Productos con descuento activo ahora mismo, según el último dato de la API.
export function activeDeals(products, prices, limit = 5) {
  const seen = new Set();
  const deals = [];
  for (const product of products) {
    if (seen.has(product.asin)) continue;
    const data = prices[product.asin];
    if (!data?.available || !data?.discountPercent) continue;
    seen.add(product.asin);
    deals.push({ ...product, data });
  }
  return deals
    .sort((a, b) => (b.data.discountPercent ?? 0) - (a.data.discountPercent ?? 0))
    .slice(0, limit);
}
