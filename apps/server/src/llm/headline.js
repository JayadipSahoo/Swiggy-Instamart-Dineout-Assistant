/**
 * Short hero titles for Assistant UI (Gemini).
 * Requires GEMINI_API_KEY (same as router).
 */

/**
 * Clamp to ≤4 words for display consistency.
 * @param {string} raw
 */
function clampHeadline(raw) {
  if (typeof raw !== "string") return "";
  const firstLine = raw.split("\n")[0] ?? "";
  let t = firstLine
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  if (!t) return "";
  const words = t.split(/\s/).filter(Boolean);
  return words.slice(0, 4).join(" ");
}

/**
 * @param {string} userText trimmed user request (or recipe/context line)
 * @returns {Promise<string|null>}
 */
export async function headlineFromUserQuery(userText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const source = typeof userText === "string" ? userText.trim() : "";
  if (!apiKey || !source) return null;

  const baseUrl = (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(
    /\/+$/,
    ""
  );
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const prompt = [
    "Turn the user's assistant request into an ultra-short title.",
    "Rules:",
    "- Output ONLY the title line: exactly 3 or 4 common English words (no quotes, numbering, bullets, emojis).",
    "- Prefer Title Case (capitalize principal words).",
    "- Omit rupee amounts unless they ARE the topic; focus on craving, dish, or task.",
    "- If groceries/cooking/recipe/shopping-for-ingredients → mention that briefly (e.g. \"Cooking Butter Chicken\", \"Groceries For Pasta\").",
    "",
    "USER REQUEST:",
    source.slice(0, 520)
  ].join("\n");

  try {
    const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generationConfig: { temperature: 0.35, maxOutputTokens: 48 },
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join(" ") ?? "";
    const line = clampHeadline(text);
    const wc = line.split(/\s/).filter(Boolean).length;
    if (!line || wc < 2) return null;
    return line.slice(0, 80);
  } catch {
    return null;
  }
}
