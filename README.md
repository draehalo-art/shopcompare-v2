# ShopCompare

A comparison-shopping website prototype.

Current version:
- Static frontend suitable for GitHub Pages.
- Demo product catalog for testing UI.
- Server-side Node.js API skeleton.
- Normalized retailer product model.
- Server-side eBay Browse API connector (V5.3) with automatic demo-catalog fallback.
- No retailer secrets in the repo or the browser.

Next production work:
1. Deploy the backend.
2. Add affiliate/deep-link handling (eBay products open on eBay; affiliateUrl stays null unless a provider supplies a real link).
3. Expand provider coverage with approved retailer APIs.
4. Add product matching and comparison scoring.

## V5.2 AI Analyst
The Product Finder now has an optional AI Analyst. It interprets the deterministic opportunity evidence and returns a structured explanation. Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL` on the backend.

## V5.3 eBay Provider
The backend can query real eBay data through the provider manager:

- `provider=auto` (default) uses eBay when configured, otherwise the demo catalog.
- `provider=demo` always uses the demo catalog.
- `provider=ebay` requests eBay and falls back to demo with a warning if unconfigured, empty or unreachable.
- Responses include `source`, `requestedProvider`, `fallbackUsed` and `warning` metadata.
- Set `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, optional `EBAY_ENVIRONMENT` (default `sandbox`) and `EBAY_MARKETPLACE_ID` (default `EBAY_US`) on the backend.
