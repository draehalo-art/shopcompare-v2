# ShopCompare V5

Added:
- Server-side value scoring.
- Normalized product schema.
- Search results sorted by value score.
- Amazon Creators API connector scaffold.
- Secure environment-variable placeholders.
- Retailer connector contract documentation.

Still intentionally demo-only:
- No live retailer API credentials.
- No scraping.
- No real affiliate redirects.
- No retailer ratings/reviews are copied outside approved sources.

Next:
1. Verify V5 deployment.
2. Add a real approved retailer connector when access is available.
3. Add product matching using identifiers/attributes.
4. Add affiliate redirect tracking.

## V5.1 — Stage 1 Product Opportunity Finder

- Added `/api/opportunities` for dropshipping opportunity screening.
- Added Opportunity Score (0–100) based on estimated margin, rating, reviews, shipping, delivery, price advantage and product type.
- Added estimated landed cost, test price, gross profit and gross margin.
- Added competition classification and short evidence-based reasons.
- Added Product Opportunity Finder UI with minimum-score filtering.
- Kept existing shopper Value Score and comparison engine separate from the new Opportunity Score.
- No external AI API key is required yet; this is the deterministic screening layer that can support an AI analyst in the next step.
- Demo data only; all commercial estimates must be validated before selling.

## V5.1.1 — API base fix
- Pointed the frontend Product Finder/search API base to the new `shopcompare-v2.onrender.com` backend instead of the old `shopcompare.onrender.com` service.
