const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const { searchDemo, normalize } = require("./scoring.js");
const { cleanAiProduct, analyzeWithOpenAI, OPENAI_MODEL } = require("./ai.js");

const PORT = process.env.PORT || 3000;
const APP_VERSION = "v5.2-ai-analyst";
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

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    const allowOrigin = corsOrigin(req);
    const headers = {
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
    if (allowOrigin && allowOrigin !== "*") headers["Vary"] = "Origin";
    res.writeHead(204, headers);
    return res.end();
  }

  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === "/api/health") {
    return sendJson(req, res, 200, {ok:true, service:"shopcompare-api", version:APP_VERSION, demoMode:true});
  }

  if (u.pathname === "/api/opportunities") {
    const query = u.searchParams.get("q") || "";
    const stores = (u.searchParams.get("stores") || "").split(",").filter(Boolean);
    const minScore = Math.max(0, Math.min(100, Number(u.searchParams.get("minScore") || 0)));
    let results = searchDemo(query).map(p => ({ ...p }));
    if (stores.length) results = results.filter(p => stores.includes(p.store));
    results = results.filter(p => p.opportunityScore >= minScore);
    results.sort((a, b) => b.opportunityScore - a.opportunityScore || b.valueScore - a.valueScore);
    return sendJson(req, res, 200, {
      query,
      count: results.length,
      demoMode: true,
      version: APP_VERSION,
      scoring: {
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
      },
      results
    });
  }

  if (u.pathname === "/api/ai/analyze" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 100000) req.destroy();
    });
    req.on("end", async () => {
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
    });
    return;
  }

  if (u.pathname === "/api/search") {
    const query = u.searchParams.get("q") || "";
    const stores = (u.searchParams.get("stores") || "").split(",").filter(Boolean);
    let results = searchDemo(query);
    if (stores.length) results = results.filter(p => stores.includes(p.store));
    results.sort((a,b) => b.valueScore - a.valueScore);
    return sendJson(req, res, 200, {
      query,
      count: results.length,
      demoMode: true,
      results
    });
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