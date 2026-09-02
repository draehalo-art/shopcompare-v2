const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

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

function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let buf = '';
      res.on('data', chunk => buf += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

before(async () => {
  server = require('./server.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(() => { server.close(); });

describe('GET /api/health', () => {
  it('returns ok with version and demoMode', async () => {
    const { status, body } = await get('/api/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.service, 'shopcompare-api');
    assert.ok(body.version);
    assert.strictEqual(body.demoMode, true);
  });
});

describe('GET /api/search', () => {
  it('returns products for a query', async () => {
    const { status, body } = await get('/api/search?q=earbuds');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.demoMode, true);
    assert.ok(Array.isArray(body.results));
    assert.ok(body.results.length > 0);
  });

  it('returns a product with required fields', async () => {
    const { body } = await get('/api/search?q=earbuds');
    const p = body.results[0];
    assert.ok(p.id);
    assert.ok(p.name);
    assert.ok(p.store);
    assert.ok(typeof p.price === 'number');
    assert.ok(typeof p.valueScore === 'number');
    assert.ok(typeof p.opportunityScore === 'number');
  });

  it('filters by store', async () => {
    const { body } = await get('/api/search?q=earbuds&stores=Temu');
    body.results.forEach(p => assert.strictEqual(p.store, 'Temu'));
  });

  it('returns all products for empty query', async () => {
    const { body } = await get('/api/search?q=');
    assert.ok(body.results.length >= 7);
  });
});

describe('GET /api/opportunities', () => {
  it('returns scored opportunities', async () => {
    const { status, body } = await get('/api/opportunities?q=earbuds');
    assert.strictEqual(status, 200);
    assert.ok(body.results.length > 0);
    assert.ok(body.scoring);
  });

  it('results are sorted by opportunityScore descending', async () => {
    const { body } = await get('/api/opportunities?q=');
    for (let i = 1; i < body.results.length; i++) {
      assert.ok(body.results[i].opportunityScore <= body.results[i - 1].opportunityScore);
    }
  });

  it('filters by minScore', async () => {
    const { body } = await get('/api/opportunities?q=&minScore=60');
    body.results.forEach(p => assert.ok(p.opportunityScore >= 60));
  });

  it('includes pricing economics fields', async () => {
    const { body } = await get('/api/opportunities?q=earbuds');
    const p = body.results[0];
    assert.ok(typeof p.estimatedLandedCost === 'number');
    assert.ok(typeof p.estimatedGrossMargin === 'number');
    assert.ok(typeof p.estimatedContributionMargin === 'number');
    assert.ok(p.opportunityVerdict);
    assert.ok(Array.isArray(p.opportunityReasons));
  });
});

describe('POST /api/ai/analyze', () => {
  it('returns 503 when OPENAI_API_KEY is missing', async () => {
    const { status, body } = await postJson('/api/ai/analyze', {
      product: { name: 'Test', store: 'Amazon', price: 10 }
    });
    assert.strictEqual(status, 503);
    assert.strictEqual(body.code, 'AI_NOT_CONFIGURED');
  });

  it('returns 400 for invalid product', async () => {
    const { status } = await postJson('/api/ai/analyze', { product: null });
    assert.strictEqual(status, 400);
  });

  it('returns 400 for missing product', async () => {
    const { status } = await postJson('/api/ai/analyze', {});
    assert.strictEqual(status, 400);
  });
});
