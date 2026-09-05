const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createProviderManager } = require('./index.js');
const { normalizeProviderItem } = require('./normalize.js');

function ebayItem(n) {
  return normalizeProviderItem({
    provider: 'ebay', providerItemId: String(n), store: 'eBay',
    title: `Wireless Earbuds ${n}`,
    price: { amount: 15 + n, currency: 'USD' },
    shipping: { amount: 0, currency: 'USD', isFree: true },
    productUrl: `https://www.ebay.com/itm/${n}`
  });
}

function fakeEbay(items, { shouldThrow = false } = {}) {
  return {
    async search() {
      if (shouldThrow) throw new Error('network down');
      return items;
    }
  };
}

function makeDemoSearch(products) {
  return (query) => products.map(p => ({ ...p }));
}

describe('Unit — createProviderManager', () => {
  it('auto mode with unconfigured provider returns demo data', async () => {
    const demo = makeDemoSearch([{ id: 'd1', name: 'Demo', store: 'Temu' }]);
    const manager = createProviderManager({ demoSearch: demo, isConfigured: () => false });
    const out = await manager.searchProducts({ query: 'x' });
    assert.strictEqual(out.source, 'demo');
    assert.strictEqual(out.requestedProvider, 'auto');
    assert.strictEqual(out.fallbackUsed, false);
    assert.strictEqual(out.products.length, 1);
    assert.ok(out.warning);
  });

  it('explicit demo provider never touches eBay', async () => {
    const demo = makeDemoSearch([{ id: 'd1', name: 'Demo' }]);
    const ebay = {
      async search() { throw new Error('should not run'); }
    };
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => true });
    const out = await manager.searchProducts({ query: 'x', provider: 'demo' });
    assert.strictEqual(out.source, 'demo');
    assert.strictEqual(out.requestedProvider, 'demo');
    assert.strictEqual(out.fallbackUsed, false);
  });

  it('ebay provider when configured returns enriched products', async () => {
    const demo = makeDemoSearch([]);
    const ebay = fakeEbay([ebayItem(1), ebayItem(2)]);
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => true });
    const out = await manager.searchProducts({ query: 'earbuds', provider: 'ebay', limit: 5 });
    assert.strictEqual(out.source, 'ebay');
    assert.strictEqual(out.requestedProvider, 'ebay');
    assert.strictEqual(out.fallbackUsed, false);
    assert.strictEqual(out.products.length, 2);
    const p = out.products[0];
    assert.strictEqual(p.store, 'eBay');
    assert.strictEqual(p.provider, 'ebay');
    assert.ok(p.id.startsWith('ebay:'));
    assert.strictEqual(p.affiliateUrl, null);
    assert.strictEqual(typeof p.valueScore, 'number');
    assert.strictEqual(typeof p.opportunityScore, 'number');
    assert.ok(p.productUrl.startsWith('https://www.ebay.com/'));
  });

  it('auto mode uses eBay when configured and matching items exist', async () => {
    const demo = makeDemoSearch([]);
    const ebay = fakeEbay([ebayItem(1)]);
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => true });
    const out = await manager.searchProducts({ query: 'earbuds' });
    assert.strictEqual(out.source, 'ebay');
    assert.strictEqual(out.requestedProvider, 'auto');
    assert.strictEqual(out.fallbackUsed, false);
  });

  it('falls back to demo when eBay returns no items', async () => {
    const demo = makeDemoSearch([{ id: 'd1', name: 'Fallback' }]);
    const ebay = fakeEbay([]);
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => true });
    const out = await manager.searchProducts({ query: 'x', provider: 'auto' });
    assert.strictEqual(out.source, 'demo');
    assert.strictEqual(out.fallbackUsed, true);
    assert.ok(out.warning);
    assert.strictEqual(out.products[0].id, 'd1');
  });

  it('falls back to demo when eBay throws', async () => {
    const demo = makeDemoSearch([{ id: 'd1', name: 'Fallback' }]);
    const ebay = fakeEbay([], { shouldThrow: true });
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => true });
    const out = await manager.searchProducts({ query: 'x', provider: 'ebay' });
    assert.strictEqual(out.source, 'demo');
    assert.strictEqual(out.fallbackUsed, true);
    assert.ok(out.warning);
  });

  it('explicit ebay provider with unconfigured env falls back with a warning', async () => {
    const demo = makeDemoSearch([{ id: 'd1', name: 'F' }]);
    const manager = createProviderManager({
      demoSearch: demo, ebay: fakeEbay([ebayItem(1)]), isConfigured: () => false
    });
    const out = await manager.searchProducts({ query: 'x', provider: 'ebay' });
    assert.strictEqual(out.source, 'demo');
    assert.strictEqual(out.fallbackUsed, true);
    assert.ok(out.warning.toLowerCase().includes('not configured'));
  });

  it('sanitizes the query and clamps the limit before calling eBay', async () => {
    let seenQuery;
    let seenLimit;
    const demo = makeDemoSearch([]);
    const ebay = {
      async search(query, opts) {
        seenQuery = query;
        seenLimit = opts.limit;
        return [];
      }
    };
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => true });
    await manager.searchProducts({ query: ' earbuds\u0000\u0007 headphones ', provider: 'ebay', limit: 9999 });
    assert.strictEqual(seenQuery, 'earbuds headphones');
    assert.strictEqual(seenLimit, 50);
  });

  it('treats unknown provider values as auto', async () => {
    const demo = makeDemoSearch([{ id: 'd1' }]);
    const ebay = fakeEbay([ebayItem(1)]);
    const manager = createProviderManager({ demoSearch: demo, ebay, isConfigured: () => false });
    const out = await manager.searchProducts({ query: '', provider: 'unknown' });
    assert.strictEqual(out.requestedProvider, 'auto');
    assert.strictEqual(out.source, 'demo');
  });
});