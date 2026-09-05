// Regression tests for comparable-product selection (V5.3.1).
// Ensure branded items are not compared against unrelated generic items, and
// that generics pool only with generics, via the real scoring engine.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeProviderItem, adaptForScoring, scoreProductView } = require('./normalize.js');
const { opportunityScore } = require('../scoring.js');

function makeAudio(id, opts = {}) {
  const title = opts.title || 'Wireless Earbuds Bluetooth 5.3';
  const brand = opts.brand == null ? 'Generic' : opts.brand;
  const price = opts.price == null ? 10 : opts.price;
  return adaptForScoring(normalizeProviderItem({
    provider: 'ebay',
    providerItemId: id,
    title,
    brand,
    price: { amount: price, currency: 'USD' },
    shipping: { amount: 0, currency: 'USD', isFree: true },
    productUrl: `https://www.ebay.com/itm/${id}`
  }));
}

describe('Comparable selection regression (V5.3.1)', () => {
  it('does not compare a branded item against every generic in the category', () => {
    const catalog = [
      makeAudio('a-apple', { title: 'Apple AirPods with Wireless Earbuds', brand: 'Apple', price: 250 }),
      makeAudio('a-google', { title: 'Google Pixel Buds Earbuds True Wireless', brand: 'Google', price: 150 }),
      makeAudio('g-1', { price: 6 }),
      makeAudio('g-2', { price: 12 }),
      makeAudio('g-3', { price: 39.49 })
    ];
    const score = opportunityScore(catalog[0], catalog);
    assert.strictEqual(score.observedComparableCount, 0);
    assert.strictEqual(score.marketMedianComparablePrice, null);
    assert.strictEqual(score.marketEvidence, 'None');
    assert.ok(score.opportunityScore <= 59, 'no market evidence must cap the score');
  });

  it('pools generics only with other generics and keeps a real median', () => {
    const catalog = [
      makeAudio('a-apple', { title: 'Apple AirPods with Wireless Earbuds', brand: 'Apple', price: 250 }),
      makeAudio('a-google', { title: 'Google Pixel Buds Earbuds True Wireless', brand: 'Google', price: 150 }),
      makeAudio('g-cur', { price: 8 }),
      makeAudio('g-1', { price: 6 }),
      makeAudio('g-2', { price: 12 }),
      makeAudio('g-3', { price: 39.49 })
    ];
    const score = opportunityScore(catalog[2], catalog);
    assert.strictEqual(score.observedComparableCount, 3);
    assert.strictEqual(score.marketMedianComparablePrice, 12);
    assert.strictEqual(score.marketEvidence, 'Generic comparable products');
    assert.ok(score.opportunityScore > 0);
  });

  it('flows cleaned comparable evidence through the scored product view', () => {
    const catalog = [
      makeAudio('a-apple', { title: 'Apple AirPods with Wireless Earbuds', brand: 'Apple', price: 250 }),
      makeAudio('g-cur', { title: 'Wireless Earbuds Bluetooth 5.3', brand: 'Generic', price: 8 }),
      makeAudio('g-1', { title: 'Wireless Earbuds Bluetooth 5.3', brand: 'Generic', price: 6 })
    ];
    const current = normalizeProviderItem({
      provider: 'ebay',
      providerItemId: 'g-cur',
      title: 'Wireless Earbuds Bluetooth 5.3',
      brand: 'Generic',
      price: { amount: 8, currency: 'USD' },
      shipping: { amount: 0, currency: 'USD', isFree: true },
      productUrl: 'https://www.ebay.com/itm/g-cur'
    });
    const view = scoreProductView(current, { catalog });
    assert.strictEqual(view.name, 'Wireless Earbuds Bluetooth 5.3');
    assert.strictEqual(view.title, undefined);
    assert.strictEqual(view.marketEvidence, 'Generic comparable products');
    assert.ok(view.observedComparableCount >= 1);
  });
});