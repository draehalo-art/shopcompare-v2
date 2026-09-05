# ShopCompare changelog

## V5.3 — eBay provider
- Added a server-side eBay Browse API connector (`backend/providers/ebay.js`) with OAuth client-credentials flow, token caching and an automatic one-retry on a 401.
- Added a provider manager (`backend/providers/index.js`) with `auto` / `demo` / `ebay` modes and demo-catalog fallback on unconfigured, error or empty results.
- Added a common normalized provider product contract (`backend/providers/normalize.js`). Provider data is adapted to the existing scoring engine; scoring formulas are unchanged.
- `affiliateUrl` is always null for eBay products (never fabricated; outbound links use `productUrl`).
- Extracted the demo catalog to `backend/data/demo-products.js`; `scoring.normalize` got an optional `catalog` parameter (additive only).
- `GET /api/search` and `GET /api/opportunities` now accept `provider` and `limit`, and report `source`, `requestedProvider`, `fallbackUsed` and `warning`.
- Frontend: added an eBay store filter, a results-source indicator, real product image display, and `affiliateUrl || productUrl` outbound links.
- New tests for `backend/providers/` (normalize, eBay connector, provider manager) using mocked HTTP only.
- `npm test` now runs `backend/*.test.js` plus `backend/providers/*.test.js`.

## V5.2 — AI Product Analyst
- Added server-side `POST /api/ai/analyze`.
- Added structured AI output for summary, strengths, risks, validation steps, selling-angle hypothesis, recommendation and confidence.
- Added an AI Analysis button to each Product Opportunity card.
- AI receives the existing deterministic opportunity evidence; it does not calculate the score.
- Added Render environment configuration for `OPENAI_API_KEY` and `OPENAI_MODEL`.
- The API key is never exposed to the browser.
- If the key is absent, the rest of ShopCompare remains usable.

## Safety of interpretation
The analyst is explicitly instructed not to claim live demand, market-wide competition, supplier quality, sales volume or guaranteed profitability unless those facts are actually supplied as evidence.

## V5.2.x — maintenance
- Added `npm test` using Node's built-in test runner (`node:test`).
- Split `backend/server.js` into `backend/scoring.js` (scores + demo catalog) and `backend/ai.js` (AI client). Server behavior unchanged.
- Added optional `ALLOWED_ORIGINS` environment variable to restrict CORS; defaults to open for development.
- Fixed stale/out-of-sync frontend fallback demo data in `app.js` so offline results match the backend catalog.
- Unminified `styles.css` for maintainability (no visual changes).
- Made `server.js` testable via `require.main === module` guard and exported the server instance.
