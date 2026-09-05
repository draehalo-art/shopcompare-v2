const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  createEbayProvider,
  sanitizeQuery,
  clampLimit,
  inferBrand,
  KNOWN_BRANDS,
  SEARCH_URLS
} = require('./ebay.js');

const config = {
  clientId: 'test-client',
  clientSecret: 'test-secret',
  environment: 'sandbox',
  marketplaceId: 'EBAY_US'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function sampleItem(overrides = {}) {
  return {
    itemId: '1100000000001',
    title: 'Wireless Earbuds with Charging Case',
    image: { imageUrl: 'https://i.ebayimg.com/1.jpg' },
    price: { value: '24.99', currency: 'USD' },
    itemWebUrl: 'https://www.ebay.com/itm/1100000000001',
    condition: { conditionId: '1000', conditionDisplayName: 'New' },
    shippingOptions: [{ shippingCost: { value: '0.00', currency: 'USD' }, shippingCostType: 'FREE' }],
    categories: [{ categoryId: '15032' }],
    ...overrides
  };
}

describe('Unit — sanitizeQuery', () => {
  it('strips control characters and trims', () => {
    assert.strictEqual(sanitizeQuery('  abc\u0000def\t\n '), 'abcdef');
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(sanitizeQuery('   '), '');
    assert.strictEqual(sanitizeQuery(null), '');
  });

  it('limits length', () => {
    assert.strictEqual(sanitizeQuery('x'.repeat(500), 100).length, 100);
  });
});

describe('Unit — clampLimit', () => {
  it('defaults to 12 when not a number', () => {
    assert.strictEqual(clampLimit(undefined), 12);
    assert.strictEqual(clampLimit(NaN), 12);
    assert.strictEqual(clampLimit('abc'), 12);
  });

  it('clamps to 1..50', () => {
    assert.strictEqual(clampLimit(0), 1);
    assert.strictEqual(clampLimit(999), 50);
    assert.strictEqual(clampLimit(7), 7);
  });
});

describe('Unit — inferBrand', () => {
  it('infers a brand from an anchored title prefix', () => {
    assert.strictEqual(inferBrand('Apple AirPods Pro'), 'Apple');
    assert.strictEqual(inferBrand('Samsung Galaxy Watch 6'), 'Samsung');
    assert.strictEqual(inferBrand('Google Pixel Buds A-Series'), 'Google');
  });

  it('cleans markdown artifacts before inferring the brand', () => {
    assert.strictEqual(
      inferBrand('[Google](https://sandbox.ebay.com/itm/1) Pixel Buds A-Series'),
      'Google'
    );
  });

  it('returns null for brandless or misleading generic titles', () => {
    assert.strictEqual(inferBrand('Wireless Earbuds Bluetooth 5.3'), null);
    assert.strictEqual(inferBrand('Compatible with Apple AirPods'), null);
    assert.strictEqual(inferBrand(null), null);
  });

  it('exposes a non-empty list of known brands', () => {
    assert.ok(Array.isArray(KNOWN_BRANDS) && KNOWN_BRANDS.length >= 1);
  });
});

describe('Unit — createEbayProvider', () => {
  it('exposes a search function for the configured environment', () => {
    const p = createEbayProvider({ config, fetchImpl: async () => jsonResponse({}) });
    assert.strictEqual(typeof p.search, 'function');
    assert.strictEqual(p.environment, 'sandbox');
  });

  it('requests a client-credentials token with Basic auth and scopes', async () => {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url, opts });
      if (url.includes('/identity/v1/oauth2/token')) {
        assert.strictEqual(opts.method, 'POST');
        assert.ok(opts.headers.Authorization.startsWith('Basic '));
        assert.ok(opts.body.includes('grant_type=client_credentials'));
        assert.ok(opts.body.includes(encodeURIComponent('https://api.ebay.com/oauth/api_scope')));
        return jsonResponse({ access_token: 'token-1', expires_in: 7200 });
      }
      return jsonResponse({ itemSummaries: [] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    await p.search('earbuds');
    assert.strictEqual(calls.filter(c => c.url.includes('/identity/v1/oauth2/token')).length, 1);
  });

  it('caches the OAuth token across searches', async () => {
    let tokenCalls = 0;
    const fetchImpl = async (url, opts = {}) => {
      if (url.includes('/identity/v1/oauth2/token')) {
        tokenCalls++;
        return jsonResponse({ access_token: 'token', expires_in: 7200 });
      }
      assert.strictEqual(opts.headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_US');
      return jsonResponse({ itemSummaries: [] });
    };
    const p = createEbayProvider({ config, fetchImpl, now: () => 1000000000000 });
    await p.search('earbuds', { limit: 5 });
    await p.search('watch', { limit: 3 });
    assert.strictEqual(tokenCalls, 1);
  });

  it('maps an eBay item into the provider contract', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({ itemSummaries: [sampleItem()] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const items = await p.search('earbuds');
    assert.strictEqual(items.length, 1);
    const it = items[0];
    assert.strictEqual(it.provider, 'ebay');
    assert.strictEqual(it.store, 'eBay');
    assert.strictEqual(it.id, 'ebay:1100000000001');
    assert.strictEqual(it.title, 'Wireless Earbuds with Charging Case');
    assert.strictEqual(it.price.amount, 24.99);
    assert.strictEqual(it.price.currency, 'USD');
    assert.ok(it.shipping.isFree);
    assert.strictEqual(it.shipping.amount, 0);
    assert.strictEqual(it.condition, 'New');
    assert.strictEqual(it.imageUrl, 'https://i.ebayimg.com/1.jpg');
    assert.strictEqual(it.productUrl, 'https://www.ebay.com/itm/1100000000001');
    assert.strictEqual(it.affiliateUrl, null);
    assert.strictEqual(it.sourceMetadata.providerItemId, '1100000000001');
    assert.strictEqual(it.sourceMetadata.rawCategoryId, '15032');
    assert.strictEqual(it.rating, null);
    assert.strictEqual(it.reviewCount, null);
    assert.strictEqual(it.delivery, null);
  });

  it('marks paid shipping as not free', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({
        itemSummaries: [sampleItem({
          shippingOptions: [{ shippingCost: { value: '6.50', currency: 'USD' }, shippingCostType: 'FIXED' }]
        })]
      });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const [it] = await p.search('earbuds');
    assert.strictEqual(it.shipping.isFree, false);
    assert.strictEqual(it.shipping.amount, 6.5);
  });

  it('infers the brand from the title when the item has no brand', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({ itemSummaries: [sampleItem({ title: 'Apple AirPods Pro', itemBrand: null })] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const [it] = await p.search('earbuds');
    assert.strictEqual(it.brand, 'Apple');
  });

  it('cleans malformed titles and URLs when mapping items (V5.3.1 regression)', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({
        itemSummaries: [sampleItem({
          title: '[Google](https://sandbox.ebay.com/itm/2) Pixel Buds A-Series',
          itemWebUrl: '[https://sandbox.ebay.com/itm/2]'
        })]
      });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const [it] = await p.search('earbuds');
    assert.strictEqual(it.title, 'Google Pixel Buds A-Series');
    assert.strictEqual(it.productUrl, 'https://sandbox.ebay.com/itm/2');
    assert.strictEqual(it.brand, 'Google');
  });

  it('keeps a provided brand over title inference', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({ itemSummaries: [sampleItem({ title: 'Apple AirPods Pro', brand: 'CustomCo' })] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const [it] = await p.search('earbuds');
    assert.strictEqual(it.brand, 'CustomCo');
  });

  it('handles string conditions', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({ itemSummaries: [sampleItem({ condition: 'Refurbished' })] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const [it] = await p.search('x');
    assert.strictEqual(it.condition, 'Refurbished');
  });

  it('refreshes the token and retries once on a 401', async () => {
    let unauthorized = true;
    let tokenFetches = 0;
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) {
        tokenFetches++;
        return jsonResponse({ access_token: `t${tokenFetches}`, expires_in: 7200 });
      }
      if (unauthorized) {
        unauthorized = false;
        return jsonResponse({}, 401);
      }
      return jsonResponse({ itemSummaries: [sampleItem()] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    const items = await p.search('earbuds');
    assert.strictEqual(items.length, 1);
    assert.strictEqual(tokenFetches, 2);
  });

  it('returns empty items when searches keep failing with 401', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({}, 401);
    };
    const p = createEbayProvider({ config, fetchImpl });
    assert.deepStrictEqual(await p.search('earbuds'), []);
  });

  it('returns empty items for an empty query without calling the API', async () => {
    const fetchImpl = async () => { throw new Error('should not be called'); };
    const p = createEbayProvider({ config, fetchImpl });
    assert.deepStrictEqual(await p.search('   '), []);
  });

  it('throws EBAY_NOT_CONFIGURED when credentials are missing', async () => {
    const p = createEbayProvider({
      config: { clientId: '', clientSecret: '', environment: 'sandbox', marketplaceId: 'EBAY_US' },
      fetchImpl: async () => jsonResponse({})
    });
    await assert.rejects(() => p.search('earbuds'), { code: 'EBAY_NOT_CONFIGURED' });
  });

  it('passes the clamped limit into the search URL', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      if (url.includes('/identity/v1/oauth2/token')) return jsonResponse({ access_token: 't', expires_in: 7200 });
      return jsonResponse({ itemSummaries: [] });
    };
    const p = createEbayProvider({ config, fetchImpl });
    await p.search('earbuds', { limit: 999 });
    const searchUrl = urls.find(u => u.startsWith(SEARCH_URLS.sandbox));
    assert.ok(searchUrl && searchUrl.includes('limit=50'), `expected limit=50 in ${searchUrl}`);
  });
});