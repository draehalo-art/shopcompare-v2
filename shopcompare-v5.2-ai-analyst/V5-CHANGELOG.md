# ShopCompare V5.2 changelog

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
