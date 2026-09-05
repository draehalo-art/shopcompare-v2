const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeProviderItem,
  adaptForScoring,
  scoreProductView,
  enrichProducts,
  cleanTitle,
  cleanUrl
} = require('./normalize.js');

describe('Unit — cleanTitle', () => {
  it('returns null for empty input', () => {
    assert.strictEqual(cleanTitle(null), null);
    assert.strictEqual(cleanTitle('   '), null);
  });

  it('strips markdown link syntax but keeps the link text', () => {
    assert.strictEqual(
      cleanTitle('[Google](https://sandbox.ebay.com/itm/1) Pixel Buds A-Series'),
      'Google Pixel Buds A-Series'
    );
  });

  it('removes bare URLs, leftover brackets and collapses whitespace', () => {
    assert.strictEqual(
      cleanTitle('Apple AirPods http://example.com/itm/x [refurbished]'),
      'Apple AirPods refurbished'
    );
  });
});

describe('Unit — cleanUrl', () => {
  it('returns null for empty or invalid input', () => {
    assert.strictEqual(cleanUrl(null), null);
    assert.strictEqual(cleanUrl('   '), null);
    assert.strictEqual(cleanUrl('not a url'), null);
    assert.strictEqual(cleanUrl('mailto:test@example.com'), null);
  });

  it('strips wrapping brackets and quotes from a URL', () => {
    assert.strictEqual(cleanUrl('[https://sandbox.ebay.com/itm/123]'), 'https://sandbox.ebay.com/itm/123');
    assert.strictEqual(cleanUrl('"https://sandbox.ebay.com/itm/123"'), 'https://sandbox.ebay.com/itm/123');
  });

  it('extracts a URL from markdown link syntax', () => {
    assert.strictEqual(cleanUrl('[link](https://sandbox.ebay.com/itm/123)'), 'https://sandbox.ebay.com/itm/123');
  });

  it('keeps a valid http(s) URL unmodified', () => {
    assert.strictEqual(cleanUrl('https://www.ebay.com/itm/1100000000001'), 'https://www.ebay.com/itm/1100000000001');
  });
});

describe('Unit — normalizeProviderItem', () => {
  it('cleans malformed titles and URLs (V5.3.1 regression)', () => {
    const item = normalizeProviderItem({
      provider: 'ebay', providerItemId: 'malformed-1',
      title: '[Google](https://sandbox.ebay.com/itm/1) Pixel Buds A-Series',
      productUrl: '[https://sandbox.ebay.com/itm/malformed-1]',
      price: { amount: '20', currency: 'USD' }
    });
    assert.strictEqual(item.title, 'Google Pixel Buds A-Series');
    assert.strictEqual(item.productUrl, 'https://sandbox.ebay.com/itm/malformed-1');
  });
  it('returns null for non-object input', () => {
    assert.strictEqual(normalizeProviderItem(null), null);
    assert.strictEqual(normalizeProviderItem('text'), null);
  });

  it('builds the common contract with defaults', () => {
    const item = normalizeProviderItem({
      provider: 'ebay', providerItemId: '123', store: 'eBay', title: 'Test Item',
      price: { amount: '19.99', currency: 'USD' }
    });
    assert.strictEqual(item.id, 'ebay:123');
    assert.strictEqual(item.provider, 'ebay');
    assert.strictEqual(item.store, 'eBay');
    assert.strictEqual(item.title, 'Test Item');
    assert.strictEqual(item.price.amount, 19.99);
    assert.strictEqual(item.price.currency, 'USD');
    assert.strictEqual(item.shipping.isFree, false);
    assert.strictEqual(item.productUrl, null);
    assert.strictEqual(item.affiliateUrl, null);
    assert.strictEqual(item.condition, null);
    assert.strictEqual(item.sourceMetadata.providerItemId, '123');
  });

  it('never invents an affiliateUrl', () => {
    const item = normalizeProviderItem({
      provider: 'ebay', providerItemId: '1', title: 'X', productUrl: 'https://ebay.com/itm/1'
    });
    assert.strictEqual(item.affiliateUrl, null);
  });

  it('keeps a provider-supplied affiliateUrl only', () => {
    const item = normalizeProviderItem({
      provider: 'x', providerItemId: '1', title: 'X', productUrl: 'https://example.com',
      affiliateUrl: 'https://track.example.com'
    });
    assert.strictEqual(item.affiliateUrl, 'https://track.example.com');
  });

  it('parses numeric strings for price and shipping', () => {
    const item = normalizeProviderItem({
      provider: 'ebay', providerItemId: '2', title: 'Y',
      price: { amount: '9.50', currency: 'USD' },
      shipping: { amount: '3.25', currency: 'USD', isFree: true }
    });
    assert.strictEqual(item.price.amount, 9.5);
    assert.strictEqual(item.shipping.amount, 3.25);
    assert.strictEqual(item.shipping.isFree, true);
  });
});

describe('Unit — adaptForScoring', () => {
  it('converts contract to a scoring record with Generic brand fallback', () => {
    const contract = normalizeProviderItem({
      provider: 'ebay', providerItemId: 'abc', store: 'eBay', title: 'Noise Cancelling Headphones',
      price: { amount: 30, currency: 'USD' },
      shipping: { amount: 0, currency: 'USD', isFree: true },
      productUrl: 'https://ebay.com/itm/abc'
    });
    const rec = adaptForScoring(contract);
    assert.strictEqual(rec.store, 'eBay');
    assert.strictEqual(rec.shipping, 'Free shipping');
    assert.strictEqual(rec.brand, 'Generic');
    assert.strictEqual(rec.name, 'Noise Cancelling Headphones');
    assert.strictEqual(rec.url, 'https://ebay.com/itm/abc');
  });

  it('maps paid shipping to a shipping string', () => {
    const contract = normalizeProviderItem({
      provider: 'ebay', providerItemId: 'd', title: 'Z',
      price: { amount: 5, currency: 'USD' },
      shipping: { amount: 4.99, currency: 'USD', isFree: false }
    });
    assert.strictEqual(adaptForScoring(contract).shipping, '$4.99 shipping');
  });
});

describe('Unit — scoreProductView', () => {
  it('produces a scored view with score fields and null affiliateUrl', () => {
    const contract = normalizeProviderItem({
      provider: 'ebay', providerItemId: 'abc', store: 'eBay', title: 'Wireless Earbuds',
      brand: null, price: { amount: 25, currency: 'USD' },
      shipping: { amount: 0, currency: 'USD', isFree: true },
      productUrl: 'https://ebay.com/itm/abc'
    });
    const view = scoreProductView(contract);
    assert.strictEqual(view.store, 'eBay');
    assert.strictEqual(view.name, 'Wireless Earbuds');
    assert.strictEqual(typeof view.price, 'number');
    assert.strictEqual(typeof view.valueScore, 'number');
    assert.strictEqual(typeof view.opportunityScore, 'number');
    assert.strictEqual(view.affiliateUrl, null);
    assert.strictEqual(view.productUrl, 'https://ebay.com/itm/abc');
    assert.strictEqual(view.provider, 'ebay');
    assert.ok(view.category);
    assert.ok(Array.isArray(view.opportunityReasons));
  });

  it('does not leak a product URL into affiliateUrl', () => {
    const contract = normalizeProviderItem({
      provider: 'ebay', providerItemId: 'z', title: 'Item',
      price: { amount: 5, currency: 'USD' }, productUrl: 'https://ebay.com/itm/z'
    });
    assert.strictEqual(scoreProductView(contract).affiliateUrl, null);
  });

  it('scores against a provided catalog of adapted contracts', () => {
    const make = id => normalizeProviderItem({
      provider: 'ebay', providerItemId: id, title: `Wireless Earbuds ${id}`,
      price: { amount: 20, currency: 'USD' }, shipping: { amount: 0, currency: 'USD', isFree: true }
    });
    const c1 = make('1');
    const c2 = make('2');
    const catalog = [c1, c2].map(adaptForScoring);
    const view = scoreProductView(c1, { catalog });
    assert.ok(view.opportunityScore >= 0 && view.opportunityScore <= 100);
    assert.ok(view.marketMedianComparablePrice != null, 'catalog should provide market evidence');
  });

  it('exposes the product as name and does not duplicate a title field', () => {
    const contract = normalizeProviderItem({
      provider: 'ebay', providerItemId: 'abc', store: 'eBay', title: 'Wireless Earbuds',
      brand: null, price: { amount: 25, currency: 'USD' },
      shipping: { amount: 0, currency: 'USD', isFree: true },
      productUrl: 'https://www.ebay.com/itm/abc'
    });
    const view = scoreProductView(contract);
    assert.strictEqual(view.name, 'Wireless Earbuds');
    assert.strictEqual(view.title, undefined);
  });
});

describe('Unit — enrichProducts', () => {
  it('returns an empty array for non-array input', () => {
    assert.deepStrictEqual(enrichProducts(null), []);
    assert.deepStrictEqual(enrichProducts('x'), []);
  });

  it('enriches every item', () => {
    const items = [1, 2].map(n => normalizeProviderItem({
      provider: 'ebay', providerItemId: String(n), title: `Item ${n}`,
      price: { amount: n * 10, currency: 'USD' }
    }));
    const out = enrichProducts(items);
    assert.strictEqual(out.length, 2);
    out.forEach(v => {
      assert.ok(v.id.startsWith('ebay:'));
      assert.strictEqual(typeof v.valueScore, 'number');
      assert.strictEqual(v.affiliateUrl, null);
    });
  });
});