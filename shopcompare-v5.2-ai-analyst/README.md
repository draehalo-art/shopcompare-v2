# ShopCompare

A comparison-shopping website prototype.

Current version:
- Static frontend suitable for GitHub Pages.
- Demo product catalog for testing UI.
- Server-side Node.js API skeleton.
- Normalized retailer product model.
- No real retailer credentials or scraped data.

Next production work:
1. Deploy the backend.
2. Add approved retailer connectors one at a time.
3. Add affiliate/deep-link handling.
4. Replace demo data with permitted API/feed data.
5. Add product matching and comparison scoring.


## V5.2 AI Analyst
The Product Finder now has an optional AI Analyst. It interprets the deterministic opportunity evidence and returns a structured explanation. Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL` on the backend.
