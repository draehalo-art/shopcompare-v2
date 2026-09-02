const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { shippingCost, valueScore, deliveryDays, categoryFor, roundPsychological, median, normalize } = require('./scoring.js');
const { cleanAiProduct } = require('./ai.js');

process.env.PORT = '0';
delete process.env.OPENAI_API_KEY;
let server;
let baseUrl;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    }).on('error', reject);
  });
}

before(async () => {
  server = require('./server.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(() => { server.close(); });

describe('Value Score', () => {
  it('is computed for every product', async () => {
    const { body } = await get('/api/search?q=');
    body.results.forEach(p => {
      assert.ok(typeof p.valueScore === 'number', `${p.name} missing valueScore`);
      assert.ok(p.valueScore >= 0 && p.valueScore <= 100, `${p.name} valueScore out of range: ${p.valueScore}`);
    });
  });

  it('free-shipping products score higher value than same-price paid-shipping', async () => {
    const { body } = await get('/api/search?q=earbuds');
    const freeShip = body.results.find(p => p.shipping === 'Free shipping' && p.price < 20);
    const paidShip = body.results.find(p => p.shipping !== 'Free shipping' && p.price < 20);
    if (freeShip && paidShip) {
      assert.ok(freeShip.valueScore > paidShip.valueScore,
        `Free ship ${freeShip.valueScore} should > paid ship ${paidShip.valueScore}`);
    }
  });
});

describe('Opportunity Score — Guardrails', () => {
  it('AirPods (high price, no same-brand comparables) gets capped score and validation verdict', async () => {
    const { body } = await get('/api/opportunities?q=airpods');
    const airpods = body.results.find(p => p.name.includes('AirPods'));
    assert.ok(airpods, 'AirPods should appear in results');
    assert.ok(airpods.opportunityScore <= 59,
      `AirPods score ${airpods.opportunityScore} should be capped at 59`);
    assert.ok(airpods.opportunityVerdict.includes('validation') || airpods.opportunityVerdict === 'Weak candidate',
      `AirPods verdict "${airpods.opportunityVerdict}" should indicate validation needed`);
  });

  it('Temu earbuds (low cost, comparables exist) gets higher score', async () => {
    const { body } = await get('/api/opportunities?q=earbuds');
    const temu = body.results.find(p => p.store === 'Temu' && p.name.includes('Earbuds'));
    assert.ok(temu, 'Temu earbuds should appear');
    assert.ok(temu.opportunityScore >= 60,
      `Temu earbuds score ${temu.opportunityScore} should be >= 60`);
    assert.ok(temu.estimatedTestPrice !== null,
      'Temu earbuds should have a suggested test price');
  });

  it('suggested test price is never above market ceiling', async () => {
    const { body } = await get('/api/opportunities?q=');
    body.results.forEach(p => {
      if (p.estimatedTestPrice !== null && p.marketCeilingPrice !== null) {
        assert.ok(p.estimatedTestPrice <= p.marketCeilingPrice,
          `${p.name}: test price ${p.estimatedTestPrice} > ceiling ${p.marketCeilingPrice}`);
      }
    });
  });

  it('suggested test price is always above landed cost', async () => {
    const { body } = await get('/api/opportunities?q=');
    body.results.forEach(p => {
      if (p.estimatedTestPrice !== null) {
        assert.ok(p.estimatedTestPrice > p.estimatedLandedCost,
          `${p.name}: test price ${p.estimatedTestPrice} <= landed ${p.estimatedLandedCost}`);
      }
    });
  });

  it('products with no comparable pricing get "Needs market validation" or "Weak candidate"', async () => {
    const { body } = await get('/api/opportunities?q=airpods');
    const airpods = body.results.find(p => p.name.includes('AirPods'));
    if (airpods && airpods.marketMedianComparablePrice === null) {
      assert.ok(
        airpods.opportunityVerdict === 'Needs market validation' ||
        airpods.opportunityVerdict === 'Weak candidate',
        `AirPods without market data should not get verdict: ${airpods.opportunityVerdict}`
      );
    }
  });
});

describe('Opportunity Score — Economics', () => {
  it('gross margin is non-negative when test price exists', async () => {
    const { body } = await get('/api/opportunities?q=');
    body.results.forEach(p => {
      if (p.estimatedTestPrice !== null) {
        assert.ok(p.estimatedGrossMargin >= 0,
          `${p.name}: negative gross margin ${p.estimatedGrossMargin}`);
      }
    });
  });

  it('contribution margin is lower than gross margin (reserves deducted)', async () => {
    const { body } = await get('/api/opportunities?q=');
    body.results.forEach(p => {
      if (p.estimatedTestPrice !== null && p.estimatedGrossMargin > 0) {
        assert.ok(p.estimatedContributionMargin < p.estimatedGrossMargin,
          `${p.name}: contribution ${p.estimatedContributionMargin} should be < gross ${p.estimatedGrossMargin}`);
      }
    });
  });

  it('opportunity reasons are non-empty strings', async () => {
    const { body } = await get('/api/opportunities?q=');
    body.results.forEach(p => {
      assert.ok(Array.isArray(p.opportunityReasons), `${p.name}: reasons not an array`);
      assert.ok(p.opportunityReasons.length > 0, `${p.name}: empty reasons`);
      p.opportunityReasons.forEach(r => {
        assert.ok(typeof r === 'string' && r.length > 0, `${p.name}: empty reason string`);
      });
    });
  });

  it('opportunity assumptions include expected cost model fields', async () => {
    const { body } = await get('/api/opportunities?q=');
    const p = body.results[0];
    assert.ok(p.opportunityAssumptions, 'missing opportunityAssumptions');
    assert.ok(typeof p.opportunityAssumptions.targetGrossMargin === 'number');
    assert.ok(typeof p.opportunityAssumptions.paymentFeeRate === 'number');
    assert.ok(typeof p.opportunityAssumptions.marketingReserveRate === 'number');
    assert.ok(typeof p.opportunityAssumptions.returnsReserveRate === 'number');
  });
});

describe('Unit — shippingCost', () => {
  it('free shipping returns 0', () => {
    assert.strictEqual(shippingCost({ shipping: 'Free shipping' }), 0);
  });
  it('parses $3.99 shipping', () => {
    assert.strictEqual(shippingCost({ shipping: '$3.99 shipping' }), 3.99);
  });
  it('missing shipping returns default 8', () => {
    assert.strictEqual(shippingCost({}), 8);
  });
  it('non-numeric shipping returns 0', () => {
    assert.strictEqual(shippingCost({ shipping: 'pickup only' }), 0);
  });
});

describe('Unit — valueScore', () => {
  it('scores 0 rating/reviews, high cheap price reasonably', () => {
    const s = valueScore({ price: 5, rating: 0, reviews: 0, shipping: 'Free shipping' });
    assert.ok(s >= 0 && s <= 100);
  });
  it('top-tier product scores high', () => {
    const s = valueScore({ price: 10, rating: 5, reviews: 100000, shipping: 'Free shipping' });
    assert.ok(s >= 80);
  });
  it('very expensive product scores low on price', () => {
    const s = valueScore({ price: 1000, rating: 5, reviews: 100000, shipping: 'Free shipping' });
    assert.ok(s < 70);
  });
  it('null rating falls back to baseline, not NaN', () => {
    const s = valueScore({ price: 20, rating: null, reviews: 100, shipping: 'Free shipping' });
    assert.ok(Number.isFinite(s));
  });
});

describe('Unit — deliveryDays', () => {
  it('parses range 2–3 days to 2.5', () => {
    assert.strictEqual(deliveryDays({ delivery: '2–3 days' }), 2.5);
  });
  it('parses range 6–10 days to 8', () => {
    assert.strictEqual(deliveryDays({ delivery: '6–10 days' }), 8);
  });
  it('returns null for missing text', () => {
    assert.strictEqual(deliveryDays({ delivery: '' }), null);
  });
  it('returns single number when only one given', () => {
    assert.strictEqual(deliveryDays({ delivery: '5 days' }), 5);
  });
});

describe('Unit — categoryFor', () => {
  it('classifies earbuds as Audio', () => {
    assert.strictEqual(categoryFor({ name: 'Wireless Earbuds', keywords: 'bluetooth' }), 'Audio');
  });
  it('classifies watch as Wearables', () => {
    assert.strictEqual(categoryFor({ name: 'Smart Watch', keywords: 'fitness tracker' }), 'Wearables');
  });
  it('classifies backpack as Bags & Travel', () => {
    assert.strictEqual(categoryFor({ name: 'Travel Backpack', keywords: 'bag' }), 'Bags & Travel');
  });
  it('defaults unknown to Other', () => {
    assert.strictEqual(categoryFor({ name: 'Random Widget', keywords: '' }), 'Other');
  });
});

describe('Unit — roundPsychological', () => {
  it('keeps small values as-is', () => {
    assert.strictEqual(roundPsychological(5), 5);
  });
  it('rounds 15 up to 15.99', () => {
    assert.strictEqual(roundPsychological(15), 15.99);
  });
  it('rounds 99 up to 99.99', () => {
    assert.strictEqual(roundPsychological(99), 99.99);
  });
});

describe('Unit — median', () => {
  it('odd count returns middle value', () => {
    assert.strictEqual(median([3, 1, 2]), 2);
  });
  it('even count returns average of two middles', () => {
    assert.strictEqual(median([1, 2, 3, 4]), 2.5);
  });
  it('empty returns null', () => {
    assert.strictEqual(median([]), null);
  });
  it('ignores non-finite values', () => {
    assert.strictEqual(median([1, NaN, 3]), 2);
  });
});

describe('Unit — normalize', () => {
  it('adds valueScore and opportunity fields', () => {
    const n = normalize({ id: 'demo-temu-earbuds', name: 'Wireless Bluetooth Earbuds with Noise Cancelling', store: 'Temu', price: 12.48, rating: 4.4, reviews: 8731, shipping: 'Free shipping', delivery: '6–10 days', url: 'https://www.temu.com/', keywords: 'wireless earbuds bluetooth headphones', brand: 'Generic' });
    assert.ok(typeof n.valueScore === 'number');
    assert.ok(typeof n.opportunityScore === 'number');
    assert.ok(n.productUrl === 'https://www.temu.com/');
    assert.ok(typeof n.id === 'string');
  });
});

describe('Unit — cleanAiProduct', () => {
  it('returns null for non-object input', () => {
    assert.strictEqual(cleanAiProduct(null), null);
    assert.strictEqual(cleanAiProduct('text'), null);
  });
  it('returns null when name/store missing', () => {
    assert.strictEqual(cleanAiProduct({ price: 10 }), null);
  });
  it('whitelists only allowed fields', () => {
    const out = cleanAiProduct({ name: 'X', store: 'Temu', price: 12, secret: 'should-not-pass', opportunityScore: 73 });
    assert.strictEqual(out.name, 'X');
    assert.strictEqual(out.store, 'Temu');
    assert.strictEqual(out.opportunityScore, 73);
    assert.strictEqual(out.secret, undefined);
  });
});
