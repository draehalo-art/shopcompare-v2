const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readEbayConfig, ebayConfigured } = require('./providers.js');

describe('Unit — readEbayConfig', () => {
  it('reads EBAY_CLIENT_ID and EBAY_CLIENT_SECRET and trims them', () => {
    const cfg = readEbayConfig({ EBAY_CLIENT_ID: '  abc  ', EBAY_CLIENT_SECRET: ' shh ' });
    assert.strictEqual(cfg.clientId, 'abc');
    assert.strictEqual(cfg.clientSecret, 'shh');
  });

  it('defaults environment to sandbox', () => {
    assert.strictEqual(readEbayConfig({}).environment, 'sandbox');
    assert.strictEqual(readEbayConfig({ EBAY_ENVIRONMENT: '' }).environment, 'sandbox');
  });

  it('treats any case-variant of production as production, anything else as sandbox', () => {
    assert.strictEqual(readEbayConfig({ EBAY_ENVIRONMENT: 'production' }).environment, 'production');
    assert.strictEqual(readEbayConfig({ EBAY_ENVIRONMENT: 'Production' }).environment, 'production');
    assert.strictEqual(readEbayConfig({ EBAY_ENVIRONMENT: 'PRODUCTION' }).environment, 'production');
    assert.strictEqual(readEbayConfig({ EBAY_ENVIRONMENT: 'prod' }).environment, 'sandbox');
    assert.strictEqual(readEbayConfig({ EBAY_ENVIRONMENT: 'sandbox' }).environment, 'sandbox');
  });

  it('defaults marketplace id to EBAY_US and trims the override', () => {
    assert.strictEqual(readEbayConfig({}).marketplaceId, 'EBAY_US');
    assert.strictEqual(readEbayConfig({ EBAY_MARKETPLACE_ID: ' EBAY_DE ' }).marketplaceId, 'EBAY_DE');
  });

  it('preserves the exact variable names that dotenv/.env must populate', () => {
    const env = {
      EBAY_CLIENT_ID: 'id-from-dotenv',
      EBAY_CLIENT_SECRET: 'secret-from-dotenv',
      EBAY_ENVIRONMENT: 'sandbox',
      EBAY_MARKETPLACE_ID: 'EBAY_US'
    };
    const cfg = readEbayConfig(env);
    assert.strictEqual(cfg.clientId, 'id-from-dotenv');
    assert.strictEqual(cfg.clientSecret, 'secret-from-dotenv');
    assert.strictEqual(cfg.environment, 'sandbox');
    assert.strictEqual(cfg.marketplaceId, 'EBAY_US');
  });
});

describe('Unit — ebayConfigured', () => {
  it('requires both a client id and a secret', () => {
    assert.strictEqual(ebayConfigured({ clientId: '', clientSecret: '' }), false);
    assert.strictEqual(ebayConfigured({ clientId: 'a' }), false);
    assert.strictEqual(ebayConfigured({ clientId: '', clientSecret: 'b' }), false);
    assert.strictEqual(ebayConfigured({ clientId: 'a', clientSecret: 'b' }), true);
  });

  it('returns false for missing config', () => {
    assert.strictEqual(ebayConfigured(null), false);
    assert.strictEqual(ebayConfigured({}), false);
  });
});