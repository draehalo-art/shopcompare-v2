// Optional client for the future production backend.
// The current GitHub Pages build continues using local demo data.
async function searchShopCompareApi(query, stores = []) {
  const base = 'https://shopcompare-v2.onrender.com';
  if (!base) throw new Error("SHOPCOMPARE_API_BASE is not configured.");
  const params = new URLSearchParams({ q: query });
  if (stores.length) params.set("stores", stores.join(","));
  const response = await fetch(`${base}/api/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  return response.json();
}
