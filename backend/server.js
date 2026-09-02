const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const APP_VERSION = "v5.1.6-market-price-guardrails";

const demoProducts = [
  {id:"demo-amazon-earbuds", name:"Apple AirPods Pro (2nd Generation) USB-C", store:"Amazon", price:189.99, rating:4.6, reviews:18542, shipping:"Free shipping", delivery:"2–3 days", url:"https://www.amazon.com/", keywords:"wireless earbuds airpods headphones apple", brand:"Apple"},
  {id:"demo-temu-earbuds", name:"Wireless Bluetooth Earbuds with Noise Cancelling", store:"Temu", price:12.48, rating:4.4, reviews:8731, shipping:"Free shipping", delivery:"6–10 days", url:"https://www.temu.com/", keywords:"wireless earbuds bluetooth headphones", brand:"Generic"},
  {id:"demo-shein-earbuds", name:"Wireless Earbuds Bluetooth 5.3 In-Ear Headphones", store:"SHEIN", price:15.20, rating:4.3, reviews:5102, shipping:"$3.99 shipping", delivery:"5–8 days", url:"https://www.shein.com/", keywords:"wireless earbuds bluetooth headphones", brand:"Generic"},
  {id:"demo-walmart-watch", name:"Smart Watch Fitness Tracker", store:"Walmart", price:39.88, rating:4.5, reviews:3221, shipping:"Free shipping", delivery:"2–4 days", url:"https://www.walmart.com/", keywords:"smart watch smartwatch fitness tracker", brand:"Generic"},
  {id:"demo-temu-watch", name:"Bluetooth Smart Watch Fitness Monitor", store:"Temu", price:18.99, rating:4.2, reviews:6400, shipping:"Free shipping", delivery:"6–10 days", url:"https://www.temu.com/", keywords:"smart watch smartwatch fitness tracker", brand:"Generic"},
  {id:"demo-amazon-backpack", name:"Travel Laptop Backpack", store:"Amazon", price:34.99, rating:4.7, reviews:9120, shipping:"Free shipping", delivery:"2–3 days", url:"https://www.amazon.com/", keywords:"backpack travel laptop bag school", brand:"Generic"},
  {id:"demo-shein-backpack", name:"Casual Travel Backpack", store:"SHEIN", price:22.00, rating:4.4, reviews:2100, shipping:"$3.99 shipping", delivery:"5–8 days", url:"https://www.shein.com/", keywords:"backpack travel laptop bag school", brand:"Generic"}
];

function shippingCost(p) {
  if (!p.shipping) return 8;
  const m = p.shipping.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  return m ? Number(m[1]) : 0;
}

function valueScore(p) {
  const ratingScore = p.rating == null ? 50 : (p.rating / 5) * 45;
  const reviewScore = p.reviews ? Math.min(Math.log10(p.reviews + 1) / 5, 1) * 15 : 0;
  const totalCost = p.price + shippingCost(p);
  const priceScore = Math.max(0, 40 - Math.min(totalCost / 10, 40));
  return Math.round(Math.min(100, ratingScore + reviewScore + priceScore));
}


function deliveryDays(p) {
  const text = String(p.delivery || "");
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (!nums.length) return null;
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  return nums[0];
}

function categoryFor(p) {
  const text = `${p.name} ${p.keywords || ""}`.toLowerCase();
  if (/earbud|headphone|earphone/.test(text)) return "Audio";
  if (/watch|fitness tracker/.test(text)) return "Wearables";
  if (/backpack|bag/.test(text)) return "Bags & Travel";
  if (/sneaker|shoe/.test(text)) return "Footwear";
  if (/phone|case|charger|cable/.test(text)) return "Phone Accessories";
  return "Other";
}

function roundPsychological(value) {
  const n = Number(value) || 0;
  if (n <= 10) return Number(n.toFixed(2));
  return Number((Math.floor(n) + 0.99).toFixed(2));
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function opportunityScore(p, catalog = demoProducts) {
  const price = Number(p.price) || 0;
  const shipping = shippingCost(p);
  const landed = price + shipping;
  const rating = Number(p.rating) || 0;
  const reviews = Number(p.reviews) || 0;
  const days = deliveryDays(p);
  const category = categoryFor(p);

  // These are transparent screening assumptions. They are intentionally kept
  // separate from the shopper-facing Value Score so the two scores answer
  // different questions.
  const assumptions = {
    targetGrossMargin: 0.55,
    paymentFeeRate: 0.029,
    paymentFeeFixed: 0.30,
    marketingReserveRate: 0.12,
    returnsReserveRate: 0.03
  };

  const categoryItems = catalog.filter(x => categoryFor(x) === category);
  const currentId = String(p.id || '');
  const sameBrandItems = categoryItems.filter(x => String(x.id || '') !== currentId &&
    String(x.brand || '').toLowerCase() === String(p.brand || '').toLowerCase());
  const genericItems = categoryItems.filter(x => String(x.id || '') !== currentId &&
    String(x.brand || '').toLowerCase() === 'generic');
  // Generic products are compared with other generic products. For a branded
  // item with no same-brand evidence, fall back to the broader category rather
  // than pretending the product has no market evidence.
  const currentBrand = String(p.brand || '').toLowerCase();
  const hasSameBrandEvidence = currentBrand !== 'generic' && sameBrandItems.length > 0;
  const comparableItems = currentBrand === 'generic'
    ? genericItems
    : (hasSameBrandEvidence ? sameBrandItems : []);
  const observedPrices = comparableItems
    .map(x => Number(x.price) + shippingCost(x))
    .filter(x => x > 0);
  const marketMedian = median(observedPrices);
  const marketMax = observedPrices.length ? Math.max(...observedPrices) : null;

  // Start from a 55% gross-margin target, but do NOT invent a market price.
  // When comparable evidence exists, the suggested test price must remain at
  // or below the observed market ceiling. When no comparable evidence exists,
  // the product gets no fabricated test price; it must be validated first.
  const targetPrice = landed > 0 ? landed / (1 - assumptions.targetGrossMargin) : 0;
  const marketCeiling = marketMax ? marketMax * 1.10 : null;
  let suggestedPrice = null;
  if (marketCeiling != null) {
    const candidate = Math.min(targetPrice, marketCeiling);
    const psychological = roundPsychological(Math.max(9.99, candidate));
    suggestedPrice = psychological <= marketCeiling ? psychological : Number((Math.floor(marketCeiling * 100) / 100).toFixed(2));
    if (suggestedPrice <= landed) suggestedPrice = null;
  }

  const grossProfit = suggestedPrice == null ? 0 : Math.max(0, suggestedPrice - landed);
  const grossMargin = suggestedPrice ? grossProfit / suggestedPrice : 0;
  const paymentFees = suggestedPrice == null ? 0 : suggestedPrice * assumptions.paymentFeeRate + assumptions.paymentFeeFixed;
  const marketingReserve = suggestedPrice == null ? 0 : suggestedPrice * assumptions.marketingReserveRate;
  const returnsReserve = suggestedPrice == null ? 0 : suggestedPrice * assumptions.returnsReserveRate;
  const estimatedVariableCosts = paymentFees + marketingReserve + returnsReserve;
  const estimatedContribution = suggestedPrice == null ? 0 : suggestedPrice - landed - estimatedVariableCosts;
  const contributionMargin = suggestedPrice ? estimatedContribution / suggestedPrice : 0;

  const marginPoints = Math.max(0, Math.min(grossMargin / 0.60, 1)) * 22;
  const contributionPoints = Math.max(0, Math.min(contributionMargin / 0.30, 1)) * 20;
  const ratingPoints = rating ? Math.min(rating / 5, 1) * 13 : 6;
  const reviewPoints = Math.min(Math.log10(reviews + 1) / 5, 1) * 13;
  const shippingPoints = p.shipping === 'Free shipping' ? 10 : shipping <= 5 ? 7 : 3;
  const deliveryPoints = days == null ? 5 : days <= 4 ? 10 : days <= 7 ? 7 : days <= 12 ? 4 : 1;

  // Catalog evidence is explicitly called "observed competition". It is not
  // a claim about the whole market and will later be replaced/enriched with
  // broader market signals.
  const observedCount = comparableItems.length;
  let competition = 'Medium observed competition';
  if (observedCount <= 2) competition = 'Low observed competition';
  else if (observedCount >= 4) competition = 'High observed competition';
  const competitionPoints = observedCount <= 2 ? 7 : observedCount >= 4 ? 2 : 5;

  let priceEvidencePoints = 2;
  if (marketMedian && landed < marketMedian) {
    const advantage = Math.min(1, (marketMedian - landed) / marketMedian);
    priceEvidencePoints = advantage * 10;
  } else if (marketMedian) {
    const ratio = landed / marketMedian;
    priceEvidencePoints = ratio <= 1.25 ? 7 : ratio <= 1.75 ? 4 : 0;
  }

  // Higher-ticket products can still be viable, but they carry more capital,
  // refund and customer-acquisition risk in a small dropshipping test.
  const ticketRiskPoints = landed <= 25 ? 5 : landed <= 50 ? 4 : landed <= 100 ? 2 : 0;

  const rawScore = marginPoints + contributionPoints + ratingPoints + reviewPoints +
    shippingPoints + deliveryPoints + competitionPoints + priceEvidencePoints + ticketRiskPoints;
  let score = Math.round(Math.min(100, (rawScore / 110) * 100));

  // A product cannot be a strong dropshipping candidate when we have no
  // comparable market-price evidence. Demand signals can still look good,
  // but the economics are not validated yet.
  if (marketMedian == null) score = Math.min(score, 59);

  let verdict = 'Needs review';
  if (score >= 80) verdict = 'Strong candidate';
  else if (score >= 65) verdict = 'Worth investigating';
  else if (score < 45) verdict = 'Weak candidate';
  if (marketMedian == null) verdict = score < 45 ? 'Weak candidate' : 'Needs market validation';
  if (marketMedian && suggestedPrice == null) verdict = 'Weak candidate';

  const reasons = [];
  if (grossMargin >= 0.5) reasons.push('healthy estimated gross margin');
  if (contributionMargin >= 0.25) reasons.push('room for payment, marketing and returns reserves');
  if (rating >= 4.4) reasons.push('strong customer rating');
  if (reviews >= 5000) reasons.push('substantial review volume');
  if (p.shipping === 'Free shipping') reasons.push('free shipping');
  if (days != null && days <= 7) reasons.push('reasonable delivery window');
  if (marketMedian && landed < marketMedian) reasons.push('landed cost is below observed comparable pricing');
  if (observedCount <= 2) reasons.push('limited observed catalog competition');
  if (targetPrice > marketCeiling && Number.isFinite(marketCeiling)) reasons.unshift('target margin price is above observed comparable pricing');
  if (suggestedPrice <= landed) reasons.unshift('observed market pricing does not support a healthy markup');
  if (marketMedian == null) reasons.unshift('limited market-price evidence for this product');
  if (landed > 100) reasons.unshift('higher-ticket item carries more test and return risk');
  if (contributionMargin < 0.15) reasons.push('thin estimated contribution after variable-cost reserves');
  if (!reasons.length) reasons.push('some positive signals, but more validation is needed');

  return {
    opportunityScore: score,
    opportunityVerdict: verdict,
    category,
    estimatedLandedCost: Number(landed.toFixed(2)),
    estimatedTestPrice: suggestedPrice == null ? null : Number(suggestedPrice.toFixed(2)),
    estimatedGrossProfit: Number(grossProfit.toFixed(2)),
    estimatedGrossMargin: Number((grossMargin * 100).toFixed(1)),
    estimatedContributionProfit: Number(estimatedContribution.toFixed(2)),
    estimatedContributionMargin: Number((contributionMargin * 100).toFixed(1)),
    estimatedVariableCosts: Number(estimatedVariableCosts.toFixed(2)),
    marketMedianComparablePrice: marketMedian == null ? null : Number(marketMedian.toFixed(2)),
    marketEvidence: marketMedian == null ? 'None' : (currentBrand === 'generic' ? 'Generic comparable products' : 'Same-brand comparable products'),
    observedComparableCount: observedCount,
    competition,
    opportunityReasons: reasons.slice(0, 4),
    targetMarginPrice: Number(targetPrice.toFixed(2)),
    marketCeilingPrice: marketCeiling == null ? null : Number(marketCeiling.toFixed(2)),
    opportunityAssumptions: assumptions,
    opportunityDisclaimer: 'Screening estimates only. Observed competition is limited to this catalog; validate current supplier pricing, shipping, fees, taxes, demand, returns and actual market prices before selling.'
  };
}
function normalize(p) {
  return {
    id: String(p.id),
    name: p.name,
    store: p.store,
    price: Number(p.price),
    currency: p.currency || "USD",
    rating: p.rating == null ? null : Number(p.rating),
    reviews: p.reviews == null ? null : Number(p.reviews),
    shipping: p.shipping || null,
    delivery: p.delivery || null,
    productUrl: p.url || null,
    affiliateUrl: p.affiliateUrl || p.url || null,
    brand: p.brand || null,
    source: p.source || p.store.toLowerCase(),
    valueScore: valueScore(p),
    ...opportunityScore(p)
  };
}

function searchDemo(query) {
  const q = String(query || "").trim().toLowerCase();
  return demoProducts
    .filter(p => !q || `${p.name} ${p.keywords} ${p.store} ${p.brand || ""}`.toLowerCase().includes(q))
    .map(normalize);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res, pathname) {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(__dirname, "..", safe));
  const rootDir = path.normalize(path.join(__dirname, ".."));
  if (!file.startsWith(rootDir)) return sendJson(res, 403, {error:"Forbidden"});
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, {error:"Not found"});
    const types = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json"};
    res.writeHead(200, {"Content-Type":(types[path.extname(file)] || "application/octet-stream")+"; charset=utf-8"});
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type"});
    return res.end();
  }

  const u = new URL(req.url, `http://${req.headers.host}`);

  if (u.pathname === "/api/health") {
    return sendJson(res, 200, {ok:true, service:"shopcompare-api", version:APP_VERSION, demoMode:true});
  }



  if (u.pathname === "/api/opportunities") {
    const query = u.searchParams.get("q") || "";
    const stores = (u.searchParams.get("stores") || "").split(",").filter(Boolean);
    const minScore = Math.max(0, Math.min(100, Number(u.searchParams.get("minScore") || 0)));
    let results = searchDemo(query).map(p => ({ ...p }));
    if (stores.length) results = results.filter(p => stores.includes(p.store));
    results = results.filter(p => p.opportunityScore >= minScore);
    results.sort((a, b) => b.opportunityScore - a.opportunityScore || b.valueScore - a.valueScore);
    return sendJson(res, 200, {
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

  if (u.pathname === "/api/search") {
    const query = u.searchParams.get("q") || "";
    const stores = (u.searchParams.get("stores") || "").split(",").filter(Boolean);
    let results = searchDemo(query);
    if (stores.length) results = results.filter(p => stores.includes(p.store));
    results.sort((a,b) => b.valueScore - a.valueScore);
    return sendJson(res, 200, {
      query,
      count: results.length,
      demoMode: true,
      results
    });
  }

  serveStatic(req, res, u.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ShopCompare V5 API running on port ${PORT}`);
});
