// Provider manager: routes product searches to the requested provider and
// falls back to the demo catalog when a real provider is unconfigured,
// unreachable, or returns no matching items.

const { ebayProvider, sanitizeQuery, clampLimit } = require("./ebay.js");
const { enrichProducts, adaptForScoring } = require("./normalize.js");
const { searchDemo } = require("../scoring.js");
const { readEbayConfig, ebayConfigured } = require("../config/providers.js");

function defaultIsConfigured() {
  return ebayConfigured(readEbayConfig());
}

const VALID_PROVIDERS = /^(auto|demo|ebay)$/;

function createProviderManager({
  ebay = ebayProvider,
  demoSearch = searchDemo,
  isConfigured = defaultIsConfigured,
  defaultLimit = 12,
  maxQueryLength = 100
} = {}) {
  function demoResult(query, requestedProvider, fallbackUsed, warning) {
    return {
      products: demoSearch(query).map(p => ({ ...p })),
      source: "demo",
      requestedProvider,
      fallbackUsed,
      warning
    };
  }

  async function searchProducts({ query = "", provider = "auto", limit } = {}) {
    const q = sanitizeQuery(query, maxQueryLength);
    const n = clampLimit(limit == null ? defaultLimit : limit);
    const raw = String(provider).trim().toLowerCase();
    const requestedProvider = VALID_PROVIDERS.test(raw) ? raw : "auto";

    if (requestedProvider === "demo") {
      return demoResult(q, "demo", false, null);
    }

    if (!isConfigured()) {
      if (requestedProvider === "ebay") {
        return demoResult(q, "ebay", true, "eBay is not configured. Showing demo catalog instead.");
      }
      return demoResult(q, "auto", false, "eBay is not configured. Showing demo catalog.");
    }

    try {
      const items = await ebay.search(q, { limit: n });
      if (Array.isArray(items) && items.length) {
        const catalog = items.map(adaptForScoring).filter(Boolean);
        return {
          products: enrichProducts(items, { catalog }),
          source: "ebay",
          requestedProvider,
          fallbackUsed: false,
          warning: null
        };
      }
      return demoResult(q, requestedProvider, true, "eBay returned no matching items. Showing demo catalog instead.");
    } catch (err) {
      return demoResult(q, requestedProvider, true, "eBay is unavailable right now. Showing demo catalog instead.");
    }
  }

  return { searchProducts, isConfigured };
}

const manager = createProviderManager();

module.exports = {
  createProviderManager,
  searchProducts: manager.searchProducts,
  isConfigured: manager.isConfigured
};