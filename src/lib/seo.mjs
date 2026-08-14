// Helpers para generar JSON-LD (Schema.org) a partir de los mismos datos
// reales que ya vienen de la API — nunca datos inventados a mano.

const SITE = "https://lasmejorescafeteras.com";

export function breadcrumbJsonLd(crumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE}${crumb.path}`,
    })),
  };
}

function productJsonLd(item) {
  const node = {
    "@type": "Product",
    name: item.title ?? "Cafetera",
    image: item.image ?? undefined,
    url: item.url,
    sku: item.asin,
    offers: item.priceAmount
      ? {
          "@type": "Offer",
          url: item.url,
          priceCurrency: item.currency ?? "EUR",
          price: item.priceAmount,
          availability: item.available
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        }
      : undefined,
  };
  if (item.starRating && item.reviewCount) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: item.starRating,
      reviewCount: item.reviewCount,
      bestRating: 5,
    };
  }
  return node;
}

export function itemListJsonLd(items, name) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: productJsonLd(item),
    })),
  };
}

export function faqJsonLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
