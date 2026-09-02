// ShopCompare AI Product Analyst module.
// Handles the server-side OpenAI call only. The API key stays on the server.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

// Whitelist the product fields sent to the AI. Never send the entire request.
function cleanAiProduct(input) {
  if (!input || typeof input !== "object") return null;
  const allowed = [
    "id","name","store","price","rating","reviews","shipping","delivery",
    "category","competition","opportunityScore","opportunityVerdict",
    "estimatedLandedCost","estimatedTestPrice","estimatedGrossProfit","estimatedGrossMargin",
    "estimatedContributionProfit","estimatedContributionMargin","marketEvidence",
    "marketMedianComparablePrice","observedComparableCount","opportunityReasons","opportunityDisclaimer"
  ];
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  return out.name && out.store ? out : null;
}

async function analyzeWithOpenAI(product) {
  if (!OPENAI_API_KEY) {
    const err = new Error("OPENAI_API_KEY is not configured on the backend.");
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      whyInteresting: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      validateNext: { type: "array", items: { type: "string" } },
      sellingAngle: { type: "string" },
      recommendation: { type: "string" },
      confidence: { type: "string", enum: ["Low", "Medium", "High"] }
    },
    required: ["summary","whyInteresting","risks","validateNext","sellingAngle","recommendation","confidence"]
  };

  const instructions = `You are the ShopCompare AI Product Analyst. Analyze one candidate product for possible dropshipping research.\n\nRULES:\n- Use ONLY the product data supplied below.\n- Do not invent demand, sales volume, competitor counts, trends, market prices, supplier reliability, or customer behavior.\n- Treat the opportunity score as a screening signal, not a prediction.\n- Treat "observed competition" as catalog evidence only, not the whole market.\n- Clearly distinguish facts from things that still need validation.\n- Never guarantee profit or sales.\n- Keep the answer practical and concise.\n- The selling angle is a hypothesis to test, not a claim that customers want it.\n\nReturn JSON matching the supplied schema.`;
  const userText = `Product data:\n${JSON.stringify(product, null, 2)}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      instructions,
      input: userText,
      text: {
        format: {
          type: "json_schema",
          name: "shopcompare_product_analysis",
          strict: true,
          schema
        }
      }
    })
  });

  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch (_) {}
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI API request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  let text = data.output_text;
  if (!text && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        const part = item.content.find(x => x.type === "output_text");
        if (part?.text) { text = part.text; break; }
      }
    }
  }
  if (!text) throw new Error("The AI returned no analysis text.");
  try { return JSON.parse(text); }
  catch (_) {
    const err = new Error("The AI returned an invalid structured response.");
    err.code = "AI_INVALID_RESPONSE";
    throw err;
  }
}

module.exports = {
  cleanAiProduct,
  analyzeWithOpenAI,
  OPENAI_MODEL
};