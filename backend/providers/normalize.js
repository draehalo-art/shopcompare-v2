// Common normalized product contract for marketplace/retailer providers.
// Provider data is adapted to the existing scoring engine here — the scoring
// formulas themselves are never changed to fit a provider.

const scoring = require("../scoring.js");

function money(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function slugify(text) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

// Strip markdown/URL artifacts from product titles. Sandbox aggregators wrap
// titles in "[text](https://...)" link syntax; titles must be plain text with
// no URLs, brackets or excess whitespace.
function cleanTitle(title) {
  if (title == null) return null;
  const s = String(title)
    .replace(/\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\[https?:\/\/[^\]]*\]/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

// Validate and de-bracket a product URL. Returns a clean http(s) URL or null.
function cleanUrl(url) {
  if (url == null) return null;
  let s = String(url).trim();
  const md = s.match(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/);
  if (md) s = md[2];
  s = s.replace(/[\[\]'"()]/g, "").trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).href;
  } catch (_) {
    return null;
  }
}

// Build the common contract from a provider-mapped raw item.
// affiliateUrl is only ever copied from the provider — it is never invented,
// and never falls back to productUrl.
function normalizeProviderItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const priceAmount = money(raw.price && raw.price.amount);
  return {
    id: raw.id ||
      (raw.providerItemId
        ? `${raw.provider}:${raw.providerItemId}`
        : `${raw.provider}:${slugify(raw.title)}`),
    provider: String(raw.provider || "unknown"),
    store: String(raw.store || raw.provider || "Unknown"),
    title: cleanTitle(raw.title),
    brand: raw.brand || null,
    imageUrl: raw.imageUrl || null,
    price: {
      amount: priceAmount,
      currency: (raw.price && raw.price.currency) || "USD"
    },
    shipping: {
      amount: money(raw.shipping && raw.shipping.amount),
      currency: (raw.shipping && raw.shipping.currency) || (raw.price && raw.price.currency) || "USD",
      isFree: Boolean(raw.shipping && raw.shipping.isFree)
    },
    condition: raw.condition || null,
    availability: raw.availability || null,
    delivery: raw.delivery || null,
    rating: raw.rating == null ? null : Number(raw.rating),
    reviewCount: raw.reviewCount == null ? null : Number(raw.reviewCount),
    productUrl: cleanUrl(raw.productUrl),
    affiliateUrl: raw.affiliateUrl || null,
    sourceMetadata: {
      providerItemId: raw.providerItemId || null,
      rawCategoryId: raw.rawCategoryId || null
    }
  };
}

function shippingText(item) {
  if (item.shipping && item.shipping.isFree) return "Free shipping";
  if (item.shipping && item.shipping.amount != null) return `$${item.shipping.amount.toFixed(2)} shipping`;
  return null;
}

// Convert a contract item into the record shape the scoring engine expects.
// Unknown brands are treated as "Generic" for screening purposes only.
function adaptForScoring(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: item.id,
    name: item.title,
    store: item.store,
    price: item.price && item.price.amount,
    currency: (item.price && item.price.currency) || "USD",
    rating: item.rating,
    reviews: item.reviewCount,
    shipping: shippingText(item),
    delivery: item.delivery,
    url: item.productUrl,
    affiliateUrl: item.affiliateUrl,
    brand: item.brand || "Generic",
    keywords: `${item.title || ""} ${item.brand || ""}`.trim(),
    source: item.provider || "provider"
  };
}

// Merge a provider contract item with its Value/Opportunity scores.
// scoring.normalize fills affiliateUrl = url, so it is re-cleared here to keep
// the provider contract's rule: affiliateUrl exists only when the provider
// actually supplied one.
function scoreProductView(item, { catalog } = {}) {
  const record = adaptForScoring(item);
  if (!record) return null;
  const scored = catalog ? scoring.normalize(record, catalog) : scoring.normalize(record);
  // The contract "title" is dropped from the scored view: the scoring engine
  // exposes it as "name" (what the frontend renders), and having both leaks a
  // duplicated product field.
  const { title, ...rest } = item;
  return {
    ...rest,
    ...scored,
    affiliateUrl: item.affiliateUrl && String(item.affiliateUrl).trim()
      ? String(item.affiliateUrl).trim()
      : null
  };
}

function enrichProducts(items, { catalog } = {}) {
  return (Array.isArray(items) ? items : [])
    .map(item => scoreProductView(item, { catalog }))
    .filter(Boolean);
}

module.exports = {
  money,
  slugify,
  cleanTitle,
  cleanUrl,
  normalizeProviderItem,
  shippingText,
  adaptForScoring,
  scoreProductView,
  enrichProducts
};