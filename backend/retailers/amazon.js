/*
 * Amazon Creators API connector placeholder.
 *
 * DO NOT put credentials in this file.
 * Expected private environment variables:
 *   AMAZON_CLIENT_ID
 *   AMAZON_CLIENT_SECRET
 *   AMAZON_PARTNER_TAG
 *   AMAZON_MARKETPLACE
 *
 * The connector remains disabled until valid, approved Creators API access
 * is available for the account/marketplace.
 *
 * When enabled, SearchItems should map Amazon's permitted response fields
 * into ShopCompare's normalized product model.
 */

function isConfigured() {
  return Boolean(
    process.env.AMAZON_CLIENT_ID &&
    process.env.AMAZON_CLIENT_SECRET &&
    process.env.AMAZON_PARTNER_TAG &&
    process.env.AMAZON_MARKETPLACE
  );
}

async function search() {
  if (!isConfigured()) return [];
  throw new Error("Amazon connector is scaffolded but not enabled in this build.");
}

module.exports = { isConfigured, search };
