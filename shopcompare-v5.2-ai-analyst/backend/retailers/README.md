# Retailer connector contract

Each retailer connector should expose:

    isConfigured() -> boolean
    search(query, options) -> Promise<NormalizedProduct[]>

Normalized fields:
- id
- name
- store
- price
- currency
- rating (only when permitted)
- reviews (only when permitted)
- shipping
- delivery
- productUrl
- affiliateUrl
- brand
- source
- valueScore

The Amazon connector is scaffolded but intentionally disabled until valid,
approved Creators API access and credentials are available. Credentials belong
only in server-side environment variables.
