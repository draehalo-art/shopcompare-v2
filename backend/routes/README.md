API routes planned for the production version:

GET /api/health
GET /api/search?q=...
GET /api/product/:id
GET /api/compare?ids=...
GET /api/redirect/:retailer/:productId

The redirect route should generate/use the approved affiliate URL and
record a privacy-conscious click event without exposing credentials.
