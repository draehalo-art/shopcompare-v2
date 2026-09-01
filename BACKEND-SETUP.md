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
