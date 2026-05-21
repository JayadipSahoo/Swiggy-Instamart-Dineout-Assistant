/**
 * LLM-based router for user messages.
 *
 * Uses Gemini API (Google AI Studio).
 * Set env:
 * - GEMINI_API_KEY
 * - GEMINI_MODEL (optional) default: gemini-2.0-flash
 * - GEMINI_BASE_URL (optional) default: https://generativelanguage.googleapis.com/v1beta
 */

function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @typedef {"food"|"instamart"|"dineout"|"other"} Domain
 *
 * @typedef {Object} RouteDecision
 * @property {Domain} domain
 * @property {string} intent
 * @property {string=} query
 * @property {number=} budget
 * @property {("veg"|"nonveg"|"any")=} diet
 * @property {string=} notes
 */

/**
 * @param {{ message: string, hasActiveAddress: boolean }} input
 * @returns {Promise<RouteDecision>}
 */
export async function routeWithLlm(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const baseUrl = (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(
    /\/+$/,
    ""
  );
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const schemaHint = {
    domain: "food|instamart|dineout|other",
    intent:
      "food.search_restaurants | food.search_menu | instamart.cook_recipe | instamart.search_products | dineout.search_restaurants | general.help",
    query: "string (for search intents; for cook_recipe include the dish name e.g. 'butter chicken')",
    budget: "number (rupees) optional",
    diet: "veg|nonveg|any optional",
    notes: "string optional"
  };

  const system = [
    "You are a router for a personal Swiggy assistant.",
    "Return ONLY a single JSON object (no markdown).",
    "Pick exactly one domain: food, instamart, dineout, other.",
    "Extract a clean 'query' that can be sent to search tools.",
    "If the user mentions a budget, extract it as integer rupees in 'budget'.",
    "If the user wants to COOK AT HOME, get RECIPES/INGREDIENTS for a dish, or build a grocery list for cooking: domain=instamart and intent=instamart.cook_recipe (NOT search_products).",
    "If the user wants to BUY specific grocery items without a cooking/recipe context (e.g. 'milk', 'bread', 'order chips'): domain=instamart and intent=instamart.search_products.",
    "If user asks to book/table/slots/reservation, choose dineout.",
    "If user wants prepared food delivered (restaurants, biryani, pizza order): domain=food.",
    "CRITICAL: 'I want to cook …', 'need to cook', 'recipe for', 'ingredients for', or cooking at home with a dish name → domain=instamart, intent=instamart.cook_recipe — never food.",
    "If no active delivery address is available and domain=food/instamart, still route but set notes reminding address is required."
  ].join("\n");

  const user = {
    message: input.message,
    context: { hasActiveAddress: input.hasActiveAddress },
    outputSchemaHint: schemaHint
  };

  const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: { temperature: 0.1 },
      contents: [
        {
          role: "user",
          parts: [{ text: `${system}\n\nINPUT:\n${JSON.stringify(user)}` }]
        }
      ]
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM routing failed (${res.status}): ${txt.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.map?.((p) => p?.text).filter(Boolean).join("\n");
  const parsed = extractJsonObject(content);
  if (!parsed) throw new Error("LLM did not return valid JSON");

  const domain = parsed.domain;
  const intent = parsed.intent;
  if (!domain || !intent) throw new Error("LLM JSON missing domain/intent");

  return {
    domain,
    intent,
    query: typeof parsed.query === "string" ? parsed.query : undefined,
    budget: typeof parsed.budget === "number" ? parsed.budget : undefined,
    diet: typeof parsed.diet === "string" ? parsed.diet : undefined,
    notes: typeof parsed.notes === "string" ? parsed.notes : undefined
  };
}

