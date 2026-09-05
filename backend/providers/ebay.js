// Server-side eBay Browse API connector (V5.3).
// OAuth client-credentials flow with an in-memory token cache. The client
// ID/secret stay on the server. Responses are mapped into the normalized
// provider contract from ./normalize.js. All HTTP calls use fetchImpl so the
// connector can be tested with a mock transport.

const { readEbayConfig, ebayConfigured } = require("../config/providers.js");
const { normalizeProviderItem, cleanTitle } = require("./normalize.js");

const TOKEN_URLS = {
  production: "https://api.ebay.com/identity/v1/oauth2/token",
  sandbox: "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
};

const SEARCH_URLS = {
  production: "https://api.ebay.com/buy/browse/v1/item_summary/search",
  sandbox: "https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search"
};

const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";

function sanitizeQuery(query, maxLength = 100) {
  return String(query || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function clampLimit(limit, { min = 1, max = 50, fallback = 12 } = {}) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function abortable(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (typeof timer.unref === "function") timer.unref();
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

function itemCondition(item) {
  if (!item || !item.condition) return null;
  if (typeof item.condition === "string") return item.condition;
  return item.condition.conditionDisplayName || String(item.condition.conditionId || "");
}

// The Browse item_summary search does not return a brand field, so it must be
// inferred from the title. Only anchored title prefixes are matched so generic
// listings like "Compatible with Apple AirPods" are not mislabelled. If no
// brand is inferred the item stays brandless and normalizes to "Generic" for
// screening purposes.
const KNOWN_BRANDS = [
  { test: /^apple\b/i, label: "Apple" },
  { test: /^samsung\b/i, label: "Samsung" },
  { test: /^google\b/i, label: "Google" },
  { test: /^sony\b/i, label: "Sony" },
  { test: /^jbl\b/i, label: "JBL" },
  { test: /^bose\b/i, label: "Bose" },
  { test: /^beats\b/i, label: "Beats" },
  { test: /^anker\b/i, label: "Anker" },
  { test: /^skullcandy\b/i, label: "Skullcandy" }
];

function inferBrand(title) {
  const clean = cleanTitle(title);
  if (!clean) return null;
  for (const entry of KNOWN_BRANDS) {
    if (entry.test.test(clean)) return entry.label;
  }
  return null;
}

function createEbayProvider({
  config,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs = 10000,
  refreshBeforeMs = 60000
} = {}) {
  const cfg = config || readEbayConfig();
  let tokenCache = null;

  async function fetchToken() {
    const { signal, cancel } = abortable(timeoutMs);
    let res;
    try {
      res = await fetchImpl(TOKEN_URLS[cfg.environment], {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials&scope=" + encodeURIComponent(OAUTH_SCOPE),
        signal
      });
    } catch (err) {
      cancel();
      const e = new Error(`eBay OAuth request failed: ${err.message}`);
      e.code = "EBAY_AUTH_FAILED";
      throw e;
    }
    cancel();
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error_description || `eBay OAuth failed (${res.status})`);
      err.status = res.status;
      err.code = "EBAY_AUTH_FAILED";
      throw err;
    }
    const token = data.access_token;
    if (!token) {
      const err = new Error("eBay OAuth returned no access token.");
      err.code = "EBAY_AUTH_FAILED";
      throw err;
    }
    const expiresInMs = (Number(data.expires_in) || 7200) * 1000;
    tokenCache = { token, expiresAt: now() + expiresInMs };
    return token;
  }

  function cachedToken() {
    if (tokenCache && tokenCache.token && tokenCache.expiresAt > now() + refreshBeforeMs) {
      return tokenCache.token;
    }
    return null;
  }

  async function getToken() {
    const cached = cachedToken();
    return cached || fetchToken();
  }

  function mapItem(item) {
    if (!item) return null;
    const shippingOpt = Array.isArray(item.shippingOptions) ? item.shippingOptions[0] : null;
    const cost = shippingOpt && shippingOpt.shippingCost ? Number(shippingOpt.shippingCost.value) : null;
    const costCurrency = shippingOpt && shippingOpt.shippingCost ? shippingOpt.shippingCost.currency : null;
    const shipType = shippingOpt ? String(shippingOpt.shippingCostType || "") : "";
    const category = Array.isArray(item.categories) && item.categories[0] ? item.categories[0] : null;
    return normalizeProviderItem({
      provider: "ebay",
      store: "eBay",
      providerItemId: item.itemId ? String(item.itemId) : null,
      rawCategoryId: category ? String(category.categoryId || "") : null,
      title: item.title || null,
      brand: item.brand || inferBrand(item.title) || null,
      imageUrl: (item.image && item.image.imageUrl) || null,
      price: {
        amount: item.price ? item.price.value : null,
        currency: item.price ? item.price.currency : "USD"
      },
      shipping: {
        amount: Number.isFinite(cost) ? cost : null,
        currency: costCurrency || "USD",
        isFree: shipType === "FREE" || (Number.isFinite(cost) && cost === 0)
      },
      condition: itemCondition(item),
      availability: null,
      delivery: null,
      rating: null,
      reviewCount: null,
      productUrl: item.itemWebUrl || null,
      affiliateUrl: null
    });
  }

  async function searchOnce(query, limit, token) {
    const url = new URL(SEARCH_URLS[cfg.environment]);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    const { signal, cancel } = abortable(timeoutMs);
    let res;
    try {
      res = await fetchImpl(url.toString(), {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": cfg.marketplaceId
        },
        signal
      });
    } catch (err) {
      cancel();
      const e = new Error(`eBay search request failed: ${err.message}`);
      e.code = "EBAY_SEARCH_FAILED";
      throw e;
    }
    cancel();
    const raw = await res.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (_) {}
    if (res.status === 401) return { ok: false, status: 401, items: [] };
    if (!res.ok) {
      const message = data.errorMessage && data.errorMessage.error && data.errorMessage.error[0]
        ? data.errorMessage.error[0].message
        : `eBay search failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.code = "EBAY_SEARCH_FAILED";
      throw err;
    }
    const items = Array.isArray(data.itemSummaries) ? data.itemSummaries.map(mapItem).filter(Boolean) : [];
    return { ok: true, status: res.status, items };
  }

  async function search(query, { limit = 12 } = {}) {
    if (!ebayConfigured(cfg)) {
      const err = new Error("eBay provider is not configured (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing).");
      err.code = "EBAY_NOT_CONFIGURED";
      throw err;
    }
    const q = sanitizeQuery(query);
    const n = clampLimit(limit);
    if (!q) return [];
    let token = await getToken();
    let result = await searchOnce(q, n, token);
    if (result.status === 401) {
      tokenCache = null;
      token = await getToken();
      result = await searchOnce(q, n, token);
    }
    return result.items;
  }

  return {
    config: cfg,
    environment: cfg.environment,
    search,
    mapItem,
    _debug: { clearTokenCache: () => { tokenCache = null; } }
  };
}

const ebayProvider = createEbayProvider();

module.exports = {
  createEbayProvider,
  ebayProvider,
  sanitizeQuery,
  clampLimit,
  inferBrand,
  KNOWN_BRANDS,
  OAUTH_SCOPE,
  TOKEN_URLS,
  SEARCH_URLS
};