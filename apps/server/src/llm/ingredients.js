/**
 * Expand a cooking request into Instamart search_queries (Gemini if configured).
 */

function extractJsonArray(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function fallbackIngredientQueries(recipeLabel) {
  const base = String(recipeLabel || "cooking")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "cooking";
  const out = [
    base,
    `${base} masala`,
    "onion",
    "tomato",
    "ginger garlic paste",
    "cooking oil",
    "fresh cream",
    "butter",
    "salt",
    "red chilli powder",
    "turmeric powder",
    "garam masala"
  ];
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))].slice(0, 10);
}

/**
 * @param {{ recipeLabel: string, message: string }} input
 * @returns {Promise<string[]>}
 */
export async function expandIngredientQueries(input) {
  const recipeLabel = String(input.recipeLabel || "").trim() || "home cooking";
  const message = String(input.message || "");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackIngredientQueries(recipeLabel);

  const baseUrl = (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const system = [
    "You help build a grocery list for cooking one dish in India (Swiggy Instamart).",
    "Return ONLY a JSON array of strings — each string is a short product search query (2–5 words).",
    "Include proteins, produce, spices, dairy, and staples actually needed for the dish.",
    "No markdown, no keys, no explanation — only the JSON array."
  ].join("\n");

  const user = { recipeLabel, userMessage: message.slice(0, 400) };

  try {
    const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2 },
        contents: [{ role: "user", parts: [{ text: `${system}\n\nINPUT:\n${JSON.stringify(user)}` }] }]
      })
    });
    if (!res.ok) return fallbackIngredientQueries(recipeLabel);
    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.map?.((p) => p?.text).filter(Boolean).join("\n");
    const parsed = extractJsonArray(content);
    if (Array.isArray(parsed) && parsed.length) {
      return [...new Set(parsed.map((s) => String(s).trim()).filter(Boolean))].slice(0, 12);
    }
  } catch {
    // fall through
  }
  return fallbackIngredientQueries(recipeLabel);
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function titleCasePhrase(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

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

function fallbackIngredientChecklist(recipeLabel) {
  const queries = fallbackIngredientQueries(recipeLabel);
  return queries.map((searchQuery, i) => ({
    id: `ing-${i}-${slugify(searchQuery) || "item"}`,
    label: titleCasePhrase(searchQuery),
    searchQuery
  }));
}

/**
 * Checklist rows for the cook flow (display label + Instamart search query per ingredient).
 * @param {{ recipeLabel: string, message: string }} input
 * @returns {Promise<{ id: string, label: string, searchQuery: string }[]>}
 */
export async function expandIngredientChecklist(input) {
  const recipeLabel = String(input.recipeLabel || "").trim() || "home cooking";
  const message = String(input.message || "");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackIngredientChecklist(recipeLabel);

  const baseUrl = (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const system = [
    "You list ingredients needed to cook ONE dish for home cooking in India (Swiggy Instamart groceries).",
    "Return ONLY a JSON object {\"ingredients\": [...]} — no markdown.",
    "Each ingredient is {\"id\":\"kebab-case-unique\",\"label\":\"Short shopping-list name\",\"searchQuery\":\"2-5 words for Instamart search\"}.",
    "Include proteins, vegetables, spices, dairy, staples the recipe needs. Aim for 10–14 items.",
    "Ids must be unique slugs."
  ].join("\n");

  try {
    const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2 },
        contents: [{ role: "user", parts: [{ text: `${system}\n\nINPUT:\n${JSON.stringify({ recipeLabel, userMessage: message.slice(0, 400) })}` }] }]
      })
    });
    if (!res.ok) return fallbackIngredientChecklist(recipeLabel);
    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.map?.((p) => p?.text).filter(Boolean).join("\n");
    let parsed = extractJsonObject(content);
    if (!parsed || !Array.isArray(parsed.ingredients)) {
      const arr = extractJsonArray(content);
      if (Array.isArray(arr)) parsed = { ingredients: arr };
    }
    const rows = parsed?.ingredients;
    if (!Array.isArray(rows) || !rows.length) return fallbackIngredientChecklist(recipeLabel);

    const out = [];
    let i = 0;
    for (const row of rows) {
      const searchQuery = String(row.searchQuery ?? row.query ?? row.q ?? "").trim();
      const label = String(row.label ?? row.name ?? row.title ?? searchQuery ?? "").trim();
      let id = String(row.id ?? "").trim();
      if (!searchQuery || !label) continue;
      if (!id) id = slugify(label) || `ing-${i}`;
      id = slugify(id) || `ing-${i}`;
      out.push({ id, label: titleCasePhrase(label), searchQuery });
      i++;
      if (out.length >= 16) break;
    }
    return out.length ? out : fallbackIngredientChecklist(recipeLabel);
  } catch {
    return fallbackIngredientChecklist(recipeLabel);
  }
}
