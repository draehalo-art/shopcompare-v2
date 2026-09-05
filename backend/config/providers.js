// Provider configuration from environment variables.
// Secrets (client ID/secret) are read here and used only on the server.
// They must never appear in app.js, index.html, or any public frontend file.

function readEbayConfig(env = process.env) {
  const environment = String(env.EBAY_ENVIRONMENT || "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
  return {
    clientId: String(env.EBAY_CLIENT_ID || "").trim(),
    clientSecret: String(env.EBAY_CLIENT_SECRET || "").trim(),
    environment,
    marketplaceId: String(env.EBAY_MARKETPLACE_ID || "").trim() || "EBAY_US"
  };
}

function ebayConfigured(config) {
  return Boolean(config && config.clientId && config.clientSecret);
}

module.exports = {
  readEbayConfig,
  ebayConfigured
};