// Client helpers for the ShopCompare backend.
const SHOPCOMPARE_API_BASE = 'https://shopcompare-v2.onrender.com';

async function searchShopCompareApi(query, stores = []) {
  const params = new URLSearchParams({ q: query });
  if (stores.length) params.set("stores", stores.join(","));
  const response = await fetch(`${SHOPCOMPARE_API_BASE}/api/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  return response.json();
}

async function analyzeShopCompareProduct(product) {
  const response = await fetch(`${SHOPCOMPARE_API_BASE}/api/ai/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `AI analysis failed: ${response.status}`);
    error.code = data.code;
    throw error;
  }
  return data;
}
