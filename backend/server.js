const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// Load the local .env file before any module reads environment variables
// (EBAY_*, OPENAI_*, PORT, ALLOWED_ORIGINS). Skipped under the test runner so
// tests stay deterministic even when a .env with real credentials exists.
if (process.env.NODE_ENV !== "test") {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
}

const { cleanAiProduct, analyzeWithOpenAI, OPENAI_MODEL } = require("./ai.js");
const { searchProducts, isConfigured } = require("./providers/index.js");

const PORT = process.env.PORT || 3000;
const APP_VERSION = "v5.3-ebay-provider";
// Comma-separated allowed origins. If empty, CORS stays open for development.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

function corsOrigin(req) {
  const origin = req.headers.origin;
  if (!ALLOWED_ORIGINS.length) return "*";
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

function sendJson(req, res, status, body) {
  const allowOrigin = corsOrigin(req);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  if (allowOrigin !== "*") headers["Vary"] = "Origin";
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function serveStatic(req, res, pathname) {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(__dirname, "..", safe));
  const rootDir = path.normalize(path.join(__dirname, ".."));
  if (!file.startsWith(rootDir)) return sendJson(req, res, 403, {error:"Forbidden"});
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(req, res, 404, {error:"Not found"});
    const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json"};
    res.writeHead(200, {"Content-Type":(types[path.extname(file)] || "application/octet-stream")+"; charset=utf-8"});
    res.end(data);
  });
}

// Run an async API handler and degrade to an empty, demo-mode response rather
// than crashing or leaking provider errors to the client.
function runApi(req, res, task) {
  Promise.resolve().then(task).catch(() => {
    sendJson(req, res, 200, {
      count: 0,
      demoMode: true,
      source: "demo",
      requestedProvider: "auto",
      fallbackUsed: true,
      warning: "Search engine error. Try again shortly.",
      version: APP_VERSION,
      results: []
    });
  });
}

function queryStores(u) {
  return (u.searchParams.get("stores") || "").split(",").filter(Boolean);
}

function requestParams(u) {
  const limitParam = u.searchParams.get("limit");
  return {
    provider: u.searchParams.get("provider") || "auto",
    limit: limitParam === null || limitParam === "" ? undefined : Number(limitParam)
  };
}

async function handleSearch(req, res, u) {
  const query = u.searchParams.get("q") || "";
  const stores = queryStores(u);
  const { provider, limit } = requestParams(u);
  let out;
  try {
    out = await searchProducts({ query, provider, limit });
  } catch (_) {
    return sendJson(req, res, 200, {
      query, count: 0, demoMode: true, source: "demo", requestedProvider: provider,
      fallbackUsed: true, warning: "Search engine is unavailable right now. Try again shortly.",
      version: APP_VERSION, results: []
    });
  }
  let results = out.products;
  if (stores.length) results = results.filter(p => stores.includes(p.store));
  results.sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0));
  return sendJson(req, res, 200, {
    query,
    count: results.length,
    demoMode: out.source === "demo",
    source: out.source,
    requestedProvider: out.requestedProvider,
    fallbackUsed: out.fallbackUsed,
    warning: out.warning,
    version: APP_VERSION,
    results
  });
}

async function handleOpportunities(req, res, u) {
  const query = u.searchParams.get("q") || "";
  const stores = queryStores(u);
  const minScore = Math.max(0, Math.min(100, Number(u.searchParams.get("minScore") || 0)));
  const { provider, limit } = requestParams(u);
  let out;
  try {
    out = await searchProducts({ query, provider, limit });
  } catch (_) {
    return sendJson(req, res, 200, {
      query, count: 0, demoMode: true, source: "demo", requestedProvider: provider,
      fallbackUsed: true, warning: "Opportunity engine is unavailable right now. Try again shortly.",
      version: APP_VERSION, results: [], scoring: OPPORTUNITY_SCORING
    });
  }
  let results = out.products.filter(p => typeof p.opportunityScore === "number");
  if (stores.length) results = results.filter(p => stores.includes(p.store));
  results = results.filter(p => p.opportunityScore >= minScore);
  results.sort((a, b) => b.opportunityScore - a.opportunityScore || (b.valueScore ?? 0) - (a.valueScore ?? 0));
  return sendJson(req, res, 200, {
    query,
    count: results.length,
    demoMode: out.source === "demo",
    source: out.source,
    requestedProvider: out.requestedProvider,
    fallbackUsed: out.fallbackUsed,
    warning: out.warning,
    version: APP_VERSION,
    scoring: OPPORTUNITY_SCORING,
    results
  });
}

const OPPORTUNITY_SCORING = {
  grossMargin: "22%",
  contributionMargin: "20%",
  rating: "13%",
  reviews: "13%",
  shipping: "10%",
  delivery: "10%",
  observedCompetition: "7%",
  priceEvidence: "10%",
  ticketRisk: "5%",
  costModel: "Payment 2.9% + $0.30; marketing reserve 12%; returns reserve 3%",
  note: "Heuristic screening score. Market competition is catalog-observed only; AI analysis can be layered on later."
};

async function handleAiAnalyze(req, res) {
  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 100000) req.destroy();
  });
  await new Promise(resolve => req.on("end", resolve));
  try {
    const parsed = JSON.parse(body || "{}");
    const product = cleanAiProduct(parsed.product);
    if (!product) return sendJson(req, res, 400, {error:"A valid product is required."});
    const analysis = await analyzeWithOpenAI(product);
    return sendJson(req, res, 200, {
      ok: true,
      model: OPENAI_MODEL,
      analysis,
      disclaimer: "AI interpretation only. It does not verify live demand, market competition, supplier quality or guaranteed profitability."
    });
  } catch (err) {
    const status = err.code === "AI_NOT_CONFIGURED" ? 503 : (err.status === 429 ? 429 : 502);
    return sendJson(req, res, status, {
      ok: false,
      error: err.message || "AI analysis failed.",
      code: err.code || "AI_REQUEST_FAILED"
    });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    const allowOrigin = corsOrigin(req);
    const headers = {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowOrigin && allowOrigin !== "*") headers["Vary"] = "Origin";
    res.writeHead(204, headers);
    return res.end();
  }

  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === "/api/health") {
    return sendJson(req, res, 200, {
      ok: true,
      service: "shopcompare-api",
      version: APP_VERSION,
      demoMode: !isConfigured(),
      providers: { ebay: isConfigured() ? "configured" : "not-configured" }
    });
  }

  if (u.pathname === "/api/opportunities") {
    return runApi(req, res, () => handleOpportunities(req, res, u));
  }

  if (u.pathname === "/api/ai/analyze" && req.method === "POST") {
    return runApi(req, res, () => handleAiAnalyze(req, res));
  }

  if (u.pathname === "/api/search") {
    return runApi(req, res, () => handleSearch(req, res, u));
  }

  serveStatic(req, res, u.pathname);
});

// Only start listening when run directly (not when required by tests).
if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`ShopCompare V5 API running on port ${PORT}`);
  });
}

module.exports = server;