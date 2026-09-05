# ShopCompare V2 backend

## What changed

The project now has a small server-side API layer and a common normalized
product format. It is deliberately in DEMO MODE: no retailer secrets are
included and no retailer website is scraped.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

       npm start

4. Open:

       http://localhost:3000

API test:

       http://localhost:3000/api/search?q=wireless%20earbuds

Health check:

       http://localhost:3000/api/health

## Important

GitHub Pages can host the frontend/static files, but it cannot run this
Node.js backend. When we connect real retailer APIs, the backend needs to
be deployed to a server/container platform.

Never place API keys, access tokens, bank details, tax IDs, or affiliate
secrets in index.html, app.js, or any other public frontend file.


## AI Product Analyst (V5.2)

The AI Analyst is server-side. Set `OPENAI_API_KEY` as a secret environment variable on Render; do not put it in the GitHub Pages frontend. `OPENAI_MODEL` defaults to `gpt-5.6-luna`. The frontend calls `POST /api/ai/analyze` on the backend. The analyst receives only the structured opportunity data and is instructed not to invent live market facts, demand, competition or guaranteed profitability.

If `OPENAI_API_KEY` is missing, Product Finder still works normally and the AI button reports that the analyst is not configured.

## Tests

Run the unit and API tests with Node's built-in test runner (Node 18+):

    npm test

## CORS

By default CORS is open (`*`) for development. To restrict it, set a
comma-separated list of allowed origins on the backend:

    ALLOWED_ORIGINS=https://draehalo-art.github.io


## eBay provider (V5.3)

The backend can query the eBay Browse API for real product data.

1. Create an eBay developer app (https://developer.ebay.com).
2. Set these secret environment variables on the backend host (Render):
   - `EBAY_CLIENT_ID`
   - `EBAY_CLIENT_SECRET`
   - `EBAY_ENVIRONMENT=sandbox` (default) or `production`
   - `EBAY_MARKETPLACE_ID=EBAY_US` (default)
3. The API automatically returns the demo catalog when eBay is unconfigured,
   unreachable or returns no items, and reports `source`, `requestedProvider`,
   `fallbackUsed` and `warning` on the response.

Never put `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` in `app.js`, `index.html`,
or any GitHub Pages file. eBay is never scraped; querying uses the official
Browse API with server-side OAuth.
