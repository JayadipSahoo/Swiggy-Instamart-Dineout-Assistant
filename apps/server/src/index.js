import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { ActionType } from "./contract.js";
import { getMcp } from "./mcp/servers.js";
import { routeWithLlm } from "./llm/router.js";
import { headlineFromUserQuery } from "./llm/headline.js";
import { expandIngredientChecklist } from "./llm/ingredients.js";

function loadDotEnv() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Set if missing OR currently empty.
      if (!(key in process.env) || String(process.env[key] ?? "").trim() === "") process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadDotEnv();

const app = express();

function tryParseJsonText(maybeText) {
  if (typeof maybeText !== "string") return null;
  /** @type {string[]} */
  const attempts = [];
  const fence = maybeText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) attempts.push(fence[1].trim());
  attempts.push(maybeText.trim());

  const trySlice = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      const startCurly = s.indexOf("{");
      const endCurly = s.lastIndexOf("}");
      if (startCurly >= 0 && endCurly > startCurly) {
        try {
          return JSON.parse(s.slice(startCurly, endCurly + 1));
        } catch {
          // fall through to array slice
        }
      }
      const startBr = s.indexOf("[");
      const endBr = s.lastIndexOf("]");
      if (startBr >= 0 && endBr > startBr) {
        try {
          return JSON.parse(s.slice(startBr, endBr + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  };

  for (const chunk of attempts) {
    if (!chunk) continue;
    const parsed = trySlice(chunk);
    if (parsed != null && typeof parsed === "object") return parsed;
  }
  return null;
}

function parseRestaurantsFromMcpRemoteText(text) {
  if (typeof text !== "string") return [];
  // Example line:
  // 2. Eat Hygiene - North Indian, Chinese, Biryani | 3.8★ | 12 min | ₹300 for two (ID: 471147)
  const lines = text.split(/\r?\n/);
  /** @type {Array<any>} */
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\.\s+(.+?)\s+\(ID:\s*([0-9]+)\)\s*$/);
    if (!m) continue;
    const rest = m[2];
    const id = m[3];

    // Split "Name - cuisines | rating | time | cost"
    const parts = rest.split("|").map((s) => s.trim());
    const left = parts[0] ?? "";
    const nameAndCuisine = left.split(" - ").map((s) => s.trim());
    const name = nameAndCuisine[0] ?? "Restaurant";
    const cuisine = nameAndCuisine.slice(1).join(" - ");

    const rating = parts.find((p) => p.includes("★")) ?? null;
    const eta = parts.find((p) => p.toLowerCase().includes("min")) ?? null;
    const cost = parts.find((p) => p.toLowerCase().includes("for two")) ?? null;

    out.push({
      id,
      name,
      cuisines: cuisine,
      avgRating: rating ? rating.replace(/[^\d.★]/g, "") : undefined,
      eta,
      costForTwo: cost
    });
  }
  return out;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseMenuItemsFromMcpRemoteText(text) {
  if (typeof text !== "string") return [];
  // Example:
  // 1. Hyderabadi ... - ₹399 | 4.6★ (37) (ID: 188460984)
  // In some responses, ₹ is rendered as ? in plain text.
  const lines = text.split(/\r?\n/);
  /** @type {Array<any>} */
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*\d+\.\s+(.+?)\s+\(ID:\s*([0-9]+)\)\s*$/);
    const m2 = line.match(/^\s*\d+\.\s+(.+?)\s+\(ID:\s*([0-9]+)\)\s*$/);
    const idMatch = line.match(/\(ID:\s*([0-9]+)\)/);
    if (!idMatch) continue;
    const id = idMatch[1];
    // name is before price chunk
    const afterIndex = line.replace(/^\s*\d+\.\s+/, "").replace(/\(ID:.*$/, "").trim();
    const name = afterIndex.replace(/\s[-–—]\s.*$/, "").trim();
    // price after " - "
    const priceMatch = line.match(/[-–—]\s*(?:₹|\?)\s*([0-9]+)/);
    const price = priceMatch ? Number(priceMatch[1]) : undefined;
    out.push({ id, name, ...(typeof price === "number" && Number.isFinite(price) ? { price } : {}) });
  }
  return out;
}

function parseFirstVariantFromText(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/\(group:(\d+),\s*var:(\d+)\)/);
  if (!m) return null;
  return { group_id: m[1], variation_id: m[2] };
}

/** Cart lines may live under different keys depending on MCP / mcp-remote shape. */
function extractFoodCartItemsArray(data) {
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.items,
    data.cart?.items,
    data.cartItems,
    data.orderItems,
    data.line_items,
    data.lineItems,
    data.data?.items,
    data.mealitems,
    data.meal_items
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function pickAvailablePaymentMethods(data) {
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.availablePaymentMethods,
    data.available_payment_methods,
    data.paymentMethods,
    data.cart?.availablePaymentMethods,
    data.pricing?.availablePaymentMethods
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

/**
 * Normalizes get_food_cart tool results: structuredContent.data, bare structuredContent,
 * or JSON inside content[0].text (mcp-remote).
 */
function getFoodCartPayloadFromToolResult(raw) {
  const maybeText = raw?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
  const fromText = typeof maybeText === "string" ? tryParseJsonText(maybeText) : null;
  const textData = fromText?.data ?? fromText;

  let data = raw?.structuredContent?.data;
  if (!data || typeof data !== "object") {
    const sc = raw?.structuredContent;
    if (sc && typeof sc === "object" && (Array.isArray(sc.items) || sc.pricing || sc.availablePaymentMethods)) {
      data = { ...sc };
    }
  }
  if (!data || typeof data !== "object") data = {};

  if (textData && typeof textData === "object") {
    data = { ...textData, ...data };
  }

  let itemsRaw = extractFoodCartItemsArray(data);
  if (!itemsRaw.length && textData && typeof textData === "object" && Array.isArray(textData.items)) {
    itemsRaw = textData.items;
    data = { ...data, items: itemsRaw };
  }

  return { data, itemsRaw };
}

function normalizeFoodCartFromToolResult(raw) {
  const { data } = getFoodCartPayloadFromToolResult(raw);
  if (!data || typeof data !== "object") return null;
  return normalizeFoodCartData(data);
}

function pickRestaurantIdFromCartData(data) {
  if (!data || typeof data !== "object") return null;
  return (
    (typeof data.restaurantId === "string" && data.restaurantId) ||
    (typeof data.restaurant_id === "string" && data.restaurant_id) ||
    (data.restaurant_id != null ? String(data.restaurant_id) : null) ||
    (typeof data.restaurant?.id === "string" && data.restaurant.id) ||
    (data.restaurant?.id != null ? String(data.restaurant.id) : null) ||
    (typeof data?.meta?.restaurantId === "string" && data.meta.restaurantId) ||
    null
  );
}

function normalizeFoodCartData(data) {
  const itemsRaw = extractFoodCartItemsArray(data);
  const items = itemsRaw.map((it, idx) => {
    const id = String(
      it?.menu_item_id ??
        it?.menuItemId ??
        it?.id ??
        it?.dishId ??
        it?.dish_id ??
        it?.item_id ??
        it?.itemId ??
        it?.catalog_item_id ??
        idx
    );
    const line = {
      id,
      title: String(it?.name ?? it?.itemName ?? "Item"),
      qty: Number(it?.quantity ?? 1),
      price: Number(it?.final_price ?? it?.subtotal ?? it?.price ?? 0)
    };
    if (Array.isArray(it?.variantsV2) && it.variantsV2.length) line.variantsV2 = it.variantsV2;
    if (Array.isArray(it?.variants) && it.variants.length) line.variants = it.variants;
    if (Array.isArray(it?.addons) && it.addons.length) line.addons = it.addons;
    return line;
  });

  const restaurantId = pickRestaurantIdFromCartData(data);

  const pricing = data?.pricing ?? {};
  const subtotal = Number(pricing?.item_total ?? 0);
  const taxes = Number(pricing?.taxes_and_charges ?? 0);
  const deliveryFee = Number(pricing?.delivery_charge ?? 0);
  const total = Number(pricing?.to_pay ?? subtotal + taxes + deliveryFee);
  const count = items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 0), 0);

  return { restaurantId, items, summary: { subtotal, taxes, deliveryFee, total, count } };
}

function collectFoodCartLineIds(line) {
  if (!line || typeof line !== "object") return [];
  const raw = [
    line.menu_item_id,
    line.menuItemId,
    line.id,
    line.dishId,
    line.dish_id,
    line.item_id,
    line.itemId,
    line.catalog_item_id,
    line.menuItem?.id,
    line.menuItem?.menu_item_id,
    line.menu_item?.id
  ];
  return [...new Set(raw.filter((x) => x != null).map(String))];
}

function findFoodCartLineForMenuItem(itemsRaw, menuItemId) {
  const want = String(menuItemId ?? "");
  if (!want || !Array.isArray(itemsRaw)) return null;
  return itemsRaw.find((line) => collectFoodCartLineIds(line).includes(want)) ?? null;
}

function foodCartLineMatchesMenuItem(line, menuItemId) {
  const want = String(menuItemId ?? "");
  if (!want) return false;
  return collectFoodCartLineIds(line).includes(want);
}

function buildFoodCartUpdateItemFromLine(line, menuItemIdFallback, quantity) {
  const menu_item_id = String(line?.menu_item_id ?? line?.menuItemId ?? line?.id ?? menuItemIdFallback ?? "");
  const payload = { menu_item_id, quantity };
  if (Array.isArray(line?.variantsV2) && line.variantsV2.length) payload.variantsV2 = line.variantsV2;
  else if (Array.isArray(line?.variants) && line.variants.length) payload.variants = line.variants;
  if (Array.isArray(line?.addons) && line.addons.length) payload.addons = line.addons;
  return payload;
}

function pickOrdersArray(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) return obj;
  const candidates = [
    obj.orders,
    obj.activeOrders,
    obj.data?.orders,
    obj.data?.activeOrders,
    obj.data?.data?.orders,
    obj.result?.orders
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return null;
}

function normalizeFoodOrderSummary(o, idx) {
  const rawId = o?.orderId ?? o?.order_id ?? o?.id ?? o?.orderID;
  const orderId = rawId != null ? String(rawId) : "";
  const itemsRaw = Array.isArray(o?.items) ? o.items : Array.isArray(o?.orderItems) ? o.orderItems : [];
  const items = itemsRaw.map((it, i) => ({
    id: String(it?.id ?? it?.menu_item_id ?? i),
    name: String(it?.name ?? it?.itemName ?? it?.title ?? "Item"),
    qty: Number(it?.quantity ?? it?.qty ?? 1)
  }));
  return {
    orderId: orderId || `order-${idx}`,
    status: String(o?.status ?? o?.orderStatus ?? o?.state ?? o?.order_status ?? "In progress"),
    restaurantName: String(o?.restaurantName ?? o?.restaurant?.name ?? o?.brandName ?? o?.restaurant_name ?? ""),
    etaText:
      (typeof o?.eta === "string" && o.eta) ||
      (typeof o?.etaText === "string" && o.etaText) ||
      (o?.deliveryTime != null ? String(o.deliveryTime) : null) ||
      (o?.promisedDeliveryTime != null ? String(o.promisedDeliveryTime) : null),
    items
  };
}

function extractFoodOrdersFromToolResult(raw) {
  const structured = raw?.structuredContent?.data;
  if (structured) {
    const arr = pickOrdersArray(structured);
    if (arr) {
      return { orders: arr.map(normalizeFoodOrderSummary), source: "structured" };
    }
  }
  const maybeText = raw?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
  const json = typeof maybeText === "string" ? tryParseJsonText(maybeText) : null;
  if (json) {
    const arr = pickOrdersArray(json);
    if (arr) {
      return {
        orders: arr.map(normalizeFoodOrderSummary),
        source: "text-json",
        rawTextPreview: typeof maybeText === "string" ? maybeText.slice(0, 800) : null
      };
    }
  }
  return {
    orders: [],
    summaryText: typeof maybeText === "string" ? maybeText : null,
    rawTextPreview: typeof maybeText === "string" ? maybeText.slice(0, 800) : null
  };
}

function pickTimeline(obj) {
  if (!obj || typeof obj !== "object") return [];
  const candidates = [obj.timeline, obj.steps, obj.statusTimeline, obj.trackingSteps, obj.data?.timeline, obj.data?.steps];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function normalizeFoodTrackFromToolResult(raw) {
  const structured = raw?.structuredContent?.data;
  const base = {
    status: "",
    etaText: null,
    message: null,
    orderId: null,
    riderName: null,
    riderPhone: null,
    timeline: /** @type {Array<{ title: string; desc: string; time: string; active?: boolean }>} */ ([])
  };

  const src = structured && typeof structured === "object" ? structured : null;
  const maybeText = raw?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
  const json = !src && typeof maybeText === "string" ? tryParseJsonText(maybeText) : null;
  const data = src ?? json ?? {};

  base.status = String(data?.status ?? data?.orderStatus ?? data?.state ?? "");
  base.etaText =
    (typeof data?.eta === "string" && data.eta) ||
    (typeof data?.etaText === "string" && data.etaText) ||
    (data?.etaMinutes != null ? `${data.etaMinutes} min` : null) ||
    (data?.deliveryEta != null ? String(data.deliveryEta) : null);
  base.message = typeof data?.message === "string" ? data.message : typeof data?.statusMessage === "string" ? data.statusMessage : null;
  base.orderId = data?.orderId != null ? String(data.orderId) : data?.order_id != null ? String(data.order_id) : null;

  const rider = data?.rider ?? data?.deliveryPartner ?? data?.dp ?? {};
  base.riderName = rider?.name != null ? String(rider.name) : data?.riderName != null ? String(data.riderName) : null;
  base.riderPhone = rider?.phone != null ? String(rider.phone) : data?.riderPhone != null ? String(data.riderPhone) : null;

  const steps = pickTimeline(data);
  if (steps.length) {
    base.timeline = steps.map((s, i) => ({
      title: String(s?.title ?? s?.status ?? s?.name ?? `Step ${i + 1}`),
      desc: String(s?.description ?? s?.desc ?? s?.message ?? ""),
      time: String(s?.time ?? s?.timestamp ?? s?.updatedAt ?? ""),
      active: Boolean(s?.active ?? s?.isCurrent ?? s?.current)
    }));
    if (!base.timeline.some((t) => t.active) && base.timeline.length) {
      base.timeline = base.timeline.map((t, i) => ({ ...t, active: i === 0 }));
    }
  }

  if (!base.timeline.length && (base.status || base.message)) {
    base.timeline = [
      {
        title: base.status || "Status",
        desc: base.message || "Latest update from Swiggy.",
        time: "",
        active: true
      }
    ];
  }

  if (!base.status && typeof maybeText === "string" && maybeText.trim()) {
    base.message = base.message || maybeText.trim().slice(0, 500);
    if (!base.timeline.length) {
      base.timeline = [{ title: "Tracking", desc: base.message, time: "", active: true }];
    }
  }

  return { ...base, rawTextPreview: typeof maybeText === "string" ? maybeText.slice(0, 800) : null };
}

function extractAddressListFromGetAddressesResult(raw) {
  const textBlocks = Array.isArray(raw?.content)
    ? raw.content.filter((c) => c?.type === "text" && typeof c?.text === "string").map((c) => c.text)
    : [];
  const parsedFromText = textBlocks.map((t) => tryParseJsonText(t)).filter(Boolean);

  const roots = [
    raw,
    raw?.structuredContent,
    raw?.structuredContent?.data,
    ...parsedFromText,
    ...parsedFromText.map((x) => x?.data).filter(Boolean)
  ];

  for (const json of roots) {
    if (!json || typeof json !== "object") continue;
    if (Array.isArray(json?.addresses)) return json.addresses;
    if (Array.isArray(json?.savedAddresses)) return json.savedAddresses;
    if (Array.isArray(json?.addressList)) return json.addressList;
    if (Array.isArray(json?.data?.addresses)) return json.data.addresses;
    if (Array.isArray(json?.data?.savedAddresses)) return json.data.savedAddresses;
    if (Array.isArray(json?.data?.addressList)) return json.data.addressList;
    if (Array.isArray(json?.data?.data?.addresses)) return json.data.data.addresses;
    if (Array.isArray(json?.data?.data?.savedAddresses)) return json.data.data.savedAddresses;
    if (Array.isArray(json)) return json;
  }
  return [];
}

function pickAddressId(address) {
  if (!address || typeof address !== "object") return null;
  const id =
    address.addressId ??
    address.id ??
    address.address_id ??
    address.address?.id ??
    address.address?.addressId ??
    address.meta?.addressId ??
    null;
  if (id == null) return null;
  const out = String(id).trim();
  return out || null;
}

async function ensureActiveAddressId() {
  if (activeAddressId) return activeAddressId;
  // Prefer food server for delivery addresses.
  try {
    const food = getMcp("food");
    const addrRes = await food.callTool("get_addresses", {});
    const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
    const firstId = pickAddressId(first);
    if (firstId) {
      activeAddressId = firstId;
      return activeAddressId;
    }
  } catch {
    // ignore
  }
  // Fallback to instamart.
  try {
    const instamart = getMcp("instamart");
    const addrRes = await instamart.callTool("get_addresses", {});
    const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
    const firstId = pickAddressId(first);
    if (firstId) {
      activeAddressId = firstId;
      return activeAddressId;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractBudgetRupees(text) {
  if (typeof text !== "string") return null;
  // Match patterns like: ₹250, 250 rs, 250 rupees, under 250
  const candidates = [];
  const re = /(?:₹\s*)?(\d{2,5})\s*(?:rs\.?|rupees)?/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 50 && n <= 5000) candidates.push(n);
  }
  if (!candidates.length) return null;
  // Prefer the last mentioned number (often the budget).
  return candidates[candidates.length - 1];
}

function buildFoodQuery(originalText, budget) {
  if (typeof originalText !== "string") return budget ? `under ${budget}` : "popular";
  let q = originalText.toLowerCase();
  const hadUnder = q.includes("under");

  // Remove very common filler phrases so the MCP query is more focused.
  q = q
    .replace(/₹\s*\d{2,5}/g, " ")
    .replace(/\b\d{2,5}\b/g, " ")
    .replace(/\b(rupees|rs\.?)\b/g, " ")
    .replace(/\b(i have|i want|i need|i feel like|can i|what can i|suggest|show me|near me|nearby|please)\b/g, " ")
    .replace(/\b(food|eat|order|delivery|restaurants?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!q) q = "popular";

  // If user gave a budget, append it unless they already wrote "under".
  if (typeof budget === "number" && Number.isFinite(budget)) {
    if (!hadUnder) q = `${q} under ${budget}`;
    else if (!q.match(/\bunder\s+\d{2,5}\b/)) q = `${q} ${budget}`; // keep "under" + number
  }
  return q;
}

function extractRecipeFocus(message) {
  let t = String(message).toLowerCase();
  t = t
    .replace(/\b(i want to|i need to|i'd like to|please|can you|help me)\b/g, " ")
    .replace(/\b(cook|make|prepare|get|buy|add|instamart|grocery|groceries|cart|ingredients?|for|to)\b/g, " ")
    .replace(/[₹.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = t.match(/([a-z0-9][a-z0-9\s-]{2,60})/);
  return m ? m[1].trim().replace(/\s+/g, " ") : "recipe";
}

/** Map MCP tools/call `result` to a plain JSON object carrying product payloads. */
function instamartSearchResultToPayload(raw) {
  const contents = raw?.content;

  // Many MCP servers append human text first and JSON in a later content block — try every text part.
  if (Array.isArray(contents)) {
    for (const block of contents) {
      if (block?.type === "text" && typeof block?.text === "string") {
        const parsed = tryParseJsonText(block.text);
        if (parsed != null && typeof parsed === "object") return parsed;
      }
    }
    const merged = contents
      .filter((c) => c?.type === "text" && typeof c?.text === "string")
      .map((c) => c.text)
      .join("\n")
      .trim();
    if (merged) {
      const parsedMerged = tryParseJsonText(merged);
      if (parsedMerged != null && typeof parsedMerged === "object") return parsedMerged;
    }
  }

  const sc = raw?.structuredContent;
  if (sc && typeof sc === "object") {
    if (sc.data != null && typeof sc.data === "object") return sc.data;
    if (Array.isArray(sc) && sc.length && typeof sc[0] === "object") return { _arrayRoot: sc };
    if (!Array.isArray(sc)) return sc;
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (raw.products || raw.searchResults || raw.catalog || raw.data || raw.items) return raw;
  }
  if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") return { _arrayRoot: raw };
  return {};
}

/** Yield objects reached by stepping through common nesting keys (data/result/payload/response). */
function instamartUnwrapLayers(root) {
  /** @type {any[]} */
  const layers = [];
  let cur = root;
  const seen = new Set();
  let guard = 0;
  while (cur != null && typeof cur === "object" && guard++ < 12) {
    if (seen.has(cur)) break;
    seen.add(cur);
    layers.push(cur);
    if (Array.isArray(cur)) break;
    const next = cur?.data ?? cur?.payload ?? cur?.result ?? cur?.response ?? cur?.body;
    if (next == null || next === cur) break;
    cur = next;
  }
  return layers;
}

function dfsCollectObjectArrays(root, depth, maxDepth, out) {
  if (depth > maxDepth || root == null) return;
  if (Array.isArray(root)) {
    if (root.length && root.length <= 240 && typeof root[0] === "object" && root[0] !== null) out.push(root);
    for (const el of root) {
      if (el != null && typeof el === "object") dfsCollectObjectArrays(el, depth + 1, maxDepth, out);
    }
    return;
  }
  if (typeof root !== "object") return;
  for (const k of Object.keys(root)) dfsCollectObjectArrays(root[k], depth + 1, maxDepth, out);
}

/** Best-effort Instamart / grocery variant id extraction for cart/update_cart */
function pickInstamartSpinId(node, allowGenericId = true, depth = 0) {
  if (!node || typeof node !== "object" || depth > 2) return "";
  const pref = [
    node.spinId,
    node.spin_id,
    node.spinID,
    node.spin,
    node.catalogSpinId,
    node.variantSpinId,
    node.storeSpinId,
    node.productSpinId,
    node.inventorySpinId,
    node.skuSpinId,
    node.selectedSpinId,
    node.defaultSpinId,
    node.variantId,
    node.itemId,
    node.storeItemId,
    node.inventoryId,
    node.productVariantId,
    node.product_variant_id,
    node.nid
  ];
  for (const x of pref) {
    const s = x == null ? "" : String(x).trim();
    if (s && s !== "undefined") return s;
  }
  for (const nest of [node.meta, node.attributes, node.extra, node.props, node.storeProduct]) {
    if (nest && typeof nest === "object") {
      const inner = pickInstamartSpinId(nest, allowGenericId, depth + 1);
      if (inner) return inner;
    }
  }
  if (allowGenericId) {
    const id = node.id;
    if (id != null && (typeof id === "number" || (typeof id === "string" && id.trim()))) return String(id).trim();
  }
  return "";
}

function coerceRupeeCandidate(val) {
  if (val == null) return NaN;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = Number(String(val).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  if (typeof val === "object") {
    return coerceRupeeCandidate(val.value ?? val.amount ?? val.displayPrice ?? val.offerPrice ?? val.offer_price ?? val.final_price);
  }
  return NaN;
}

function pickDisplayPrice(variantRow, productRow) {
  const order = [
    variantRow?.finalPrice,
    variantRow?.mrp,
    variantRow?.price,
    variantRow?.cost,
    productRow?.finalPrice,
    productRow?.mrp,
    productRow?.price
  ];
  for (const c of order) {
    const n = coerceRupeeCandidate(c);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/** Arrays with 1 real product score too low vs old threshold ≥2 — use ≥1 unless clearly junk */
const INSTAMART_ARRAY_SCORE_MIN = 1;

function scoreInstamartProductArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  let spins = 0;
  let names = 0;
  let bundles = 0;
  const cap = Math.min(arr.length, 24);
  for (let i = 0; i < cap; i++) {
    const row = unwrapInstamartProductLike(arr[i]);
    if (!row || typeof row !== "object") continue;
    if (pickInstamartSpinId(row, true)) spins++;
    const vars = Array.isArray(row?.variants)
      ? row.variants
      : Array.isArray(row?.productVariants)
        ? row.productVariants
        : [];
    for (const vr of vars.slice(0, 8)) spins += pickInstamartSpinId(unwrapInstamartProductLike(vr), true) ? 1 : 0;
    if (row.name ?? row.productName ?? row.title ?? row.productTitle ?? row.displayName) names++;
    if (vars.length) bundles++;
  }
  return spins * 4 + names * 2 + bundles;
}

function unwrapInstamartProductLike(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const u =
    obj.product ??
    obj.item ??
    obj.card ??
    obj.listing ??
    obj.sku ??
    obj.details ??
    obj.widget?.data ??
    obj.data?.product ??
    obj.attributes?.product;
  return u && typeof u === "object" ? u : obj;
}

function extractInstamartProductList(payloadRoot) {
  if (payloadRoot == null) return [];

  /** @type {any} */
  const rootAny = payloadRoot;
  const rootResolved = rootAny?._arrayRoot ?? payloadRoot;

  if (Array.isArray(rootResolved) && rootResolved.length && typeof rootResolved[0] === "object") {
    if (scoreInstamartProductArray(rootResolved) >= INSTAMART_ARRAY_SCORE_MIN) return rootResolved;
  }

  /** @type {any[]} */
  const staticLists = [];

  for (const layer of instamartUnwrapLayers(payloadRoot)) {
    const L = layer?._arrayRoot ?? layer;
    if (Array.isArray(L)) staticLists.push(L);
    if (Array.isArray(layer?._arrayRoot)) staticLists.push(layer._arrayRoot);
    const candidates = [
      L.products,
      L.catalog,
      L.catalogList,
      L.productList,
      L.listings,
      L.results,
      L.hits,
      L.items,
      L.searchResults,
      L.productsList,
      L.widgets,
      L.cards,
      L.suggestions,
      L.data?.products,
      L.data?.items,
      L.data?.searchResults,
      L.data?.catalog,
      L.data?.cards,
      L.response?.products,
      L.response?.items
    ];
    for (const c of candidates) if (Array.isArray(c)) staticLists.push(c);
  }

  for (const c of staticLists) {
    if (c.length && scoreInstamartProductArray(c) >= INSTAMART_ARRAY_SCORE_MIN) return c;
  }
  /** @type {any[][]} */
  const dfs = [];
  for (const layer of instamartUnwrapLayers(payloadRoot)) dfsCollectObjectArrays(layer?._arrayRoot ?? layer, 0, 14, dfs);
  dfs.sort((a, b) => scoreInstamartProductArray(b) - scoreInstamartProductArray(a));
  const best = dfs[0];
  if (best && scoreInstamartProductArray(best) >= INSTAMART_ARRAY_SCORE_MIN) return best;

  for (const c of staticLists) {
    if (!c.length) continue;
    const looksNamed = c.some(
      (row) =>
        row &&
        typeof row === "object" &&
        (row.name ?? row.productName ?? row.title ?? row.productTitle ?? row.displayName ?? row.brand)
    );
    if (looksNamed) return c;
  }
  return [];
}

/** Build 2–4 search attempts per checklist row — Instamart often needs a simpler query than the LLM phrase. */
function instamartQueryVariantsForIngredient(ingredient) {
  const primary = String(ingredient?.searchQuery ?? "").trim();
  const label = String(ingredient?.label ?? "").trim();
  /** @type {string[]} */
  const variants = [];
  if (primary) variants.push(primary);
  if (label && label.toLowerCase() !== primary.toLowerCase()) variants.push(label);
  const parts = primary.split(/\s+/).filter(Boolean);
  if (parts.length > 3) variants.push(parts.slice(0, 3).join(" "));
  if (parts.length && parts[0].length >= 2) variants.push(parts[0]);
  if (label) {
    const lw = label.split(/\s+/)[0];
    if (lw && lw.length >= 2 && !variants.some((v) => v.toLowerCase() === lw.toLowerCase())) variants.push(lw);
  }
  const seen = new Set();
  return variants
    .map((q) => String(q).slice(0, 80).trim())
    .filter((q) => q && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()));
}

/**
 * @param {*} instamart mcp client
 * @param {string} addr
 * @param {{ label: string, searchQuery?: string }} ing
 */
async function instamartSearchCardsForIngredient(instamart, addr, ing) {
  const queries = instamartQueryVariantsForIngredient(ing);
  if (!queries.length) queries.push(String(ing.label || "").trim() || "groceries");
  const seenSpin = new Set();
  /** @type {any[]} */
  const rowCards = [];
  for (const q of queries) {
    if (rowCards.length >= 10) break;
    try {
      const raw = await instamart.callTool("search_products", { addressId: addr, query: q });
      const batch = normalizeInstamartSearchToCards(raw, ing.label);
      for (const c of batch) {
        const sid = String(c.spinId ?? "").trim();
        if (!sid || seenSpin.has(sid)) continue;
        seenSpin.add(sid);
        rowCards.push(c);
        if (rowCards.length >= 10) break;
      }
    } catch {
      // try next variant
    }
    if (rowCards.length >= 4) break;
  }
  return rowCards;
}

function normalizeInstamartSearchToCards(raw, ingredientLabel) {
  const payload = instamartSearchResultToPayload(raw);
  const products = extractInstamartProductList(payload);

  if (!products.length && process.env.INSTAMART_DEBUG) {
    try {
      const preview = JSON.stringify(raw ?? null);
      // eslint-disable-next-line no-console
      console.warn(`[instamart] No product list parsed for "${ingredientLabel}". Tool result preview:\n${preview.slice(0, 2000)}`);
    } catch {
      // ignore
    }
  }

  /** @type {any[]} */
  const cards = [];
  for (const rawP of products) {
    const p = unwrapInstamartProductLike(rawP);
    const name = String(p?.name ?? p?.productName ?? p?.title ?? p?.productTitle ?? p?.displayName ?? "Item");
    let variants = Array.isArray(p?.variants) ? p.variants : [];
    if (!variants.length && Array.isArray(p?.productVariants)) variants = p.productVariants;
    if (!variants.length && Array.isArray(p?.variations)) variants = p.variations;
    if (!variants.length) variants = [p];
    for (const rawV of variants.slice(0, 3)) {
      const v = unwrapInstamartProductLike(rawV);
      const spinId = pickInstamartSpinId(v, true) || pickInstamartSpinId(p, true);
      if (!spinId) continue;
      const n = pickDisplayPrice(v, p);

      cards.push({
        kind: "grocery",
        id: spinId,
        spinId,
        title: name,
        subtitle: [ingredientLabel ? `Match: ${ingredientLabel}` : null, v?.variantText ?? v?.packSize ?? v?.size ?? v?.label ?? p?.brand]
          .filter(Boolean)
          .join(" • "),
        priceText: Number.isFinite(n) ? `₹${Math.round(n)}` : undefined,
        metaText: "Instamart • Tap = add 1 to cart"
      });
    }
  }
  return cards;
}

function instamartToolResultErrorMessage(raw) {
  if (!raw) return "";
  const blocks = Array.isArray(raw?.content) ? raw.content : [];
  for (const b of blocks) {
    if (b?.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      const low = t.toLowerCase();
      if (low.startsWith("error") || low.includes('"success":false') || low.includes("invalid spin")) return t.slice(0, 400);
      const j = tryParseJsonText(t);
      if (j && typeof j === "object") {
        if (j.success === false && (j.message || j.error)) return String(j.message ?? j.error);
        const inner = j.data ?? j;
        if (inner && typeof inner === "object" && inner.success === false && (inner.message || inner.error)) {
          return String(inner.message ?? inner.error);
        }
      }
    }
  }
  const sc = raw?.structuredContent;
  if (sc && typeof sc === "object") {
    if (sc.error) return String(sc.error);
    if (sc.message && typeof sc.success === "boolean" && !sc.success) return String(sc.message);
  }
  return "";
}

function extractInstamartCartItemsFromResult(raw) {
  /** Same multi-block parsing as search — get_cart payloads often mirror search_products. */
  const payload = instamartSearchResultToPayload(raw);

  /** @type {any[]} */
  let items = [];

  /** @returns {boolean} */
  function tryDrain(obj) {
    if (!obj || typeof obj !== "object") return false;
    const cand =
      (Array.isArray(obj.items) && obj.items) ||
      (obj.cart && typeof obj.cart === "object" && Array.isArray(obj.cart.items) ? obj.cart.items : null) ||
      (Array.isArray(obj.cartItems) ? obj.cartItems : null) ||
      (obj.data?.items ?? null) ||
      (obj.data?.cart?.items ?? null);

    if (Array.isArray(cand) && cand.length) {
      items = cand;
      return true;
    }
    return false;
  }

  const layers = instamartUnwrapLayers(payload);
  for (const L of layers) {
    if (tryDrain(L)) break;
  }

  if (!items.length && payload && typeof payload === "object") {
    if (payload._arrayRoot && Array.isArray(payload._arrayRoot)) items = payload._arrayRoot;
  }

  const out = [];
  for (const it of items) {
    const spinId = pickInstamartSpinId(it, true);
    if (!spinId) continue;
    out.push({ spinId, quantity: Math.max(1, Math.min(99, Number(it?.quantity ?? it?.qty ?? 1))) });
  }
  return out;
}

function normalizeInstamartCartFromToolResult(raw) {
  const payload = instamartSearchResultToPayload(raw);
  const layers = instamartUnwrapLayers(payload);
  let items = null;
  for (const L of layers) {
    const cand =
      (Array.isArray(L?.items) && L.items) ||
      (Array.isArray(L?.cart?.items) && L.cart.items) ||
      (Array.isArray(L?.cartItems) && L.cartItems) ||
      (Array.isArray(L?.data?.items) && L.data.items) ||
      (Array.isArray(L?.data?.cart?.items) && L.data.cart.items) ||
      null;
    if (Array.isArray(cand)) {
      items = cand;
      break;
    }
  }
  if (!items && Array.isArray(payload?._arrayRoot)) items = payload._arrayRoot;
  if (!Array.isArray(items)) items = [];

  const normalized = items
    .map((it, idx) => {
      const spinId = pickInstamartSpinId(it, true);
      if (!spinId) return null;
      const title = String(
        it?.name ??
          it?.productName ??
          it?.title ??
          it?.displayName ??
          it?.itemName ??
          it?.product?.name ??
          `Item ${idx + 1}`
      ).trim();
      const qty = Math.max(1, Math.min(99, Number(it?.quantity ?? it?.qty ?? it?.count ?? 1) || 1));
      const price = pickDisplayPrice(it, it?.product ?? it) || NaN;
      return {
        spinId: String(spinId),
        title,
        qty,
        price: Number.isFinite(price) ? Number(price) : undefined
      };
    })
    .filter(Boolean);

  const count = normalized.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const subtotal = normalized.reduce(
    (s, it) => s + (Number.isFinite(it.price) ? Number(it.price) * (Number(it.qty) || 0) : 0),
    0
  );
  return {
    items: normalized,
    summary: {
      subtotal: Math.round(subtotal),
      taxes: 0,
      deliveryFee: 0,
      total: Math.round(subtotal),
      count
    }
  };
}

function pickInstamartAvailablePaymentMethodsFromCartResult(raw) {
  const payload = instamartSearchResultToPayload(raw);
  const layers = instamartUnwrapLayers(payload);
  for (const L of layers) {
    const cand = L?.availablePaymentMethods ?? L?.data?.availablePaymentMethods ?? L?.cart?.availablePaymentMethods;
    if (Array.isArray(cand) && cand.length) return cand.map(String).filter(Boolean);
  }
  return [];
}

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "swiggy-assistant-api" });
});

app.get("/debug/router", (_req, res) => {
  res.json({
    ok: true,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    baseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
    lastError: lastRouterError
  });
});

app.get("/mcp/tools", async (_req, res) => {
  try {
    const instamart = getMcp("instamart");
    const tools = await instamart.listTools();
    res.json({ ok: true, tools });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message ?? "Failed to list tools" });
  }
});

// Widget view (HTML) — best-effort.
app.get("/widget/food-search", async (req, res) => {
  try {
    const query = String(req.query.q ?? "").trim() || "popular";
    if (!activeAddressId) {
      try {
        const instamart = getMcp("instamart");
        const addrRes = await instamart.callTool("get_addresses", {});
        const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
        const firstId = pickAddressId(first);
        if (firstId) activeAddressId = firstId;
      } catch {
        // ignore
      }
    }
    if (!activeAddressId) return res.status(400).send("No active address set");

    const food = getMcp("food");
    const mcpRes = await food.callTool("search_restaurants", { addressId: activeAddressId, query });
    const maybeText = mcpRes?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
    const restaurants = typeof maybeText === "string" ? parseRestaurantsFromMcpRemoteText(maybeText) : [];

    // Try to read official widget HTML.
    const widget = await food.readResource("ui://widget/food-search.html");
    const htmlText =
      widget?.contents?.find?.((c) => typeof c?.text === "string")?.text ??
      widget?.contents?.find?.((c) => typeof c?.data === "string")?.data ??
      null;

    const injected = `<script>
window.__SWIGGY_ASSISTANT__ = ${JSON.stringify({
      query,
      restaurants,
      note:
        "This is a lightweight host. Full MCP widgets may require an MCP-capable runtime to become fully interactive."
    })};
</script>`;

    res.setHeader("content-type", "text/html; charset=utf-8");
    if (typeof htmlText === "string" && htmlText.trim()) {
      const idx = htmlText.toLowerCase().indexOf("</head>");
      if (idx >= 0) return res.send(htmlText.slice(0, idx) + injected + htmlText.slice(idx));
      return res.send(injected + htmlText);
    }

    // Fallback: simple HTML grid.
    const items = restaurants
      .slice(0, 20)
      .map(
        (r) => `<div class="card">
  <div class="title">${escapeHtml(r.name)}</div>
  <div class="sub">${escapeHtml(r.cuisines || "")}</div>
  <div class="meta">${escapeHtml([r.avgRating, r.eta, r.costForTwo].filter(Boolean).join(" • "))}</div>
</div>`
      )
      .join("\n");
    return res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Food search</title>
  <style>
    body{margin:0;font-family:system-ui;background:#0b0b0f;color:#fff;padding:16px}
    .h{font-size:18px;font-weight:700;margin:0 0 10px}
    .q{color:rgba(255,255,255,.65);margin:0 0 16px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:16px;padding:12px}
    .title{font-weight:700}
    .sub{margin-top:6px;color:rgba(255,255,255,.7);font-size:12px}
    .meta{margin-top:10px;color:rgba(255,255,255,.55);font-size:12px}
  </style>
</head>
<body>
  <p class="h">Results</p>
  <p class="q">Query: ${escapeHtml(query)}</p>
  <div class="grid">${items}</div>
</body>
</html>`);
  } catch (e) {
    res.status(500).send(`Widget error: ${escapeHtml(e?.message ?? e)}`);
  }
});

// Active address selection for subsequent tool calls.
let activeAddressId = null;

const COOK_SESSION_TTL_MS = 60 * 60 * 1000;
/** @type {Map<string, { recipeLabel: string, ingredients: { id: string, label: string, searchQuery: string }[], addressId: string, createdAt: number, pickProductGroups?: any[] }>} */
const cookSessions = new Map();

function pruneCookSessions() {
  const now = Date.now();
  for (const [k, v] of cookSessions.entries()) {
    if (now - v.createdAt > COOK_SESSION_TTL_MS) cookSessions.delete(k);
  }
}

function heuristicInstamartCookRecipe(message) {
  return /\b(cook|cooking|recipe|ingredients?|grocer(?:y|ies)\s+for|make\b|prepare|at\s+home|diy|home\s+made)\b/i.test(
    String(message || "")
  );
}

/** User is cooking at home — overrides LLM when it wrongly picks food delivery. */
function userExplicitlyCookingAtHome(message) {
  const t = String(message || "").toLowerCase().trim();
  if (/\b(want|need|going|gonna|trying|learning|planning)\s+to\s+cook\b/.test(t)) return true;
  if (/\b(i'll|i will|we'll|we will)\s+cook\b/.test(t)) return true;
  if (/\bcook(ing)?\s+at\s+home\b/.test(t)) return true;
  if (/\b(make|prepare)\b[^.!?]{0,48}\bat\s+home\b/.test(t)) return true;
  if (/\brecipe\s+(for|to\s+make)\b/.test(t)) return true;
  if (/\bingredients?\s+for\b/.test(t)) return true;
  if (/\bhome\s*-?\s*cook(ing)?\b/.test(t)) return true;
  if (/^(please\s+)?cook\s+/m.test(t)) return true;
  return false;
}

/** @param {{ domain?: string, intent?: string }} decision */
function shouldUseInstamartCookFlow(decision, message) {
  if (decision?.domain !== "instamart") return false;
  if (decision?.intent === "instamart.cook_recipe") return true;
  return heuristicInstamartCookRecipe(message);
}

async function mergeInstamartCartLines(addressId, additions) {
  const effective = additions
    .map((a) => ({
      spinId: String(a.spinId ?? "").trim(),
      quantity: Math.min(99, Math.max(1, Number(a.quantity ?? 1) || 1))
    }))
    .filter((a) => a.spinId);

  if (!effective.length) {
    throw new Error("No valid Instamart variant ids — try searching again and picking a product tile.");
  }

  const instamart = getMcp("instamart");
  const cartRes = await instamart.callTool("get_cart", {});
  const existing = extractInstamartCartItemsFromResult(cartRes);

  /** @type {{ spinId: string, quantity: number }[]} */
  const merged = existing.map((x) => ({ ...x }));
  for (const add of effective) {
    const idx = merged.findIndex((x) => x.spinId === add.spinId);
    if (idx >= 0) merged[idx].quantity = Math.min(99, merged[idx].quantity + add.quantity);
    else merged.push({ spinId: add.spinId, quantity: add.quantity });
  }

  const upd = await instamart.callTool("update_cart", {
    selectedAddressId: addressId,
    items: merged
  });
  const errUpd = instamartToolResultErrorMessage(upd);
  if (errUpd) throw new Error(errUpd);

  if (process.env.INSTAMART_DEBUG) {
    try {
      const errRd = instamartToolResultErrorMessage(cartRes);
      // eslint-disable-next-line no-console
      if (errRd) console.warn("[instamart] get_cart returned message:", errRd.slice(0, 260));
      // eslint-disable-next-line no-console
      console.warn("[instamart] merged lines:", merged.length, "effective adds:", effective.length);
    } catch {
      // ignore
    }
  }
}
let activeFoodRestaurantId = null;
let lastRouterError = null;

app.get("/address/active", (_req, res) => {
  res.json({ ok: true, addressId: activeAddressId });
});

app.post("/address/active", (req, res) => {
  const bodySchema = z.object({
    addressId: z.string().min(1)
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
  }
  activeAddressId = parsed.data.addressId;
  return res.json({ ok: true, addressId: activeAddressId });
});

// Saved addresses (MCP-backed).
app.get("/addresses", async (_req, res) => {
  try {
    const raws = [];
    const errors = [];
    const merged = [];
    const seen = new Set();

    async function pullFrom(serverKey) {
      const client = getMcp(serverKey);
      const result = await client.callTool("get_addresses", {});
      raws.push({ server: serverKey, raw: result });
      const list = extractAddressListFromGetAddressesResult(result);
      for (const a of list) {
        const addressId = String(pickAddressId(a) ?? "").trim();
        if (!addressId || seen.has(addressId)) continue;
        seen.add(addressId);
        merged.push({
          id: addressId,
          label: String(a?.addressTag ?? a?.addressTagName ?? a?.addressCategory ?? a?.label ?? "Saved"),
          subtitle: String(
            a?.addressLine ??
              a?.address ??
              a?.fullAddress ??
              a?.displayAddress ??
              a?.address?.fullAddress ??
              a?.address?.addressLine ??
              ""
          ).trim(),
          addressId
        });
      }
    }

    // Try both servers; if one fails, still return from the other.
    try {
      await pullFrom("instamart");
    } catch (e) {
      errors.push({ server: "instamart", error: String(e?.message ?? e) });
    }
    try {
      await pullFrom("food");
    } catch (e) {
      errors.push({ server: "food", error: String(e?.message ?? e) });
    }

    // Default active address to the first returned address (first run convenience).
    if (!activeAddressId && merged.length && merged[0].addressId) {
      activeAddressId = merged[0].addressId;
    }
    if (!merged.length) {
      return res.status(502).json({
        ok: false,
        error: "No saved addresses returned by MCP servers",
        raws,
        errors
      });
    }
    return res.json({ ok: true, raws, errors, addresses: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to fetch addresses" });
  }
});

// Very small in-memory cart for the demo loop.
// (Later: replace with persistent storage per user/device.)
const cart = {
  items: /** @type {Array<{ id: string, title: string, qty: number, price: number }>} */ ([]),
};

function cartSummary() {
  const subtotal = cart.items.reduce((s, it) => s + it.price * it.qty, 0);
  const taxes = Math.round(subtotal * 0.05);
  const deliveryFee = 0;
  const total = subtotal + taxes + deliveryFee;
  return { subtotal, taxes, deliveryFee, total, count: cart.items.reduce((s, it) => s + it.qty, 0) };
}

app.get("/cart", (_req, res) => {
  res.json({ ok: true, cart: { items: cart.items, summary: cartSummary() } });
});

app.post("/cart/add", (req, res) => {
  const bodySchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    price: z.number().nonnegative(),
    qty: z.number().int().min(1).max(20).default(1),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { id, title, price, qty } = parsed.data;
  const existing = cart.items.find((x) => x.id === id);
  if (existing) existing.qty += qty;
  else cart.items.push({ id, title, qty, price });

  return res.json({ ok: true, cart: { items: cart.items, summary: cartSummary() } });
});

app.post("/cart/clear", (_req, res) => {
  cart.items = [];
  res.json({ ok: true, cart: { items: cart.items, summary: cartSummary() } });
});

// ---- Food (MCP) native Explore flow ----
app.get("/food/menu-items", async (req, res) => {
  try {
    const restaurantId = String(req.query.restaurantId ?? "").trim();
    const q = String(req.query.q ?? "").trim();
    if (!restaurantId) return res.status(400).json({ ok: false, error: "restaurantId required" });
    if (!q) return res.status(400).json({ ok: false, error: "q required" });
    if (!activeAddressId) {
      try {
        const instamart = getMcp("instamart");
        const addrRes = await instamart.callTool("get_addresses", {});
        const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
        const firstId = pickAddressId(first);
        if (firstId) activeAddressId = firstId;
      } catch {
        // ignore
      }
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });

    const food = getMcp("food");
    const mcpRes = await food.callTool("search_menu", {
      addressId: activeAddressId,
      query: q,
      restaurantIdOfAddedItem: restaurantId
    });

    const maybeText = mcpRes?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
    const json = typeof maybeText === "string" ? tryParseJsonText(maybeText) ?? mcpRes : mcpRes;

    // Best-effort extraction.
    const items =
      (Array.isArray(json?.items) ? json.items : null) ??
      (Array.isArray(json?.data?.items) ? json.data.items : null) ??
      (Array.isArray(json?.data?.data?.items) ? json.data.data.items : null) ??
      [];

    const normalized = items.slice(0, 30).map((it, idx) => ({
      id: String(it?.id ?? it?.menu_item_id ?? it?.menuItemId ?? idx),
      name: String(it?.name ?? it?.title ?? it?.itemName ?? "Item"),
      price: typeof it?.price === "number" ? it.price : typeof it?.finalPrice === "number" ? it.finalPrice : undefined,
      isVeg: typeof it?.isVeg === "boolean" ? it.isVeg : undefined
    }));

    if (normalized.length) {
      return res.json({ ok: true, items: normalized, rawTextPreview: typeof maybeText === "string" ? maybeText.slice(0, 1200) : null });
    }

    const parsedFromText = typeof maybeText === "string" ? parseMenuItemsFromMcpRemoteText(maybeText).slice(0, 30) : [];
    return res.json({ ok: true, items: parsedFromText, rawTextPreview: typeof maybeText === "string" ? maybeText.slice(0, 1200) : null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to fetch menu items" });
  }
});

/** Nearby / search restaurants for Explore tab (same parsing as `/chat` food branch). */
app.get("/food/restaurants", async (req, res) => {
  try {
    const qIn = String(req.query.q ?? "popular").trim();
    const q = qIn || "popular";

    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });

    const food = getMcp("food");
    const mcpRes = await food.callTool("search_restaurants", {
      addressId: addr,
      query: q
    });

    const maybeText = mcpRes?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
    let json = mcpRes;
    if (typeof maybeText === "string") {
      json = tryParseJsonText(maybeText) ?? mcpRes;
    }

    const restaurantsRaw = (() => {
      if (Array.isArray(json?.restaurants)) return json.restaurants;
      if (Array.isArray(json?.data?.restaurants)) return json.data.restaurants;
      if (Array.isArray(json?.data?.data?.restaurants)) return json.data.data.restaurants;
      if (Array.isArray(json?.data?.cards)) return json.data.cards;
      if (Array.isArray(json?.data?.data?.cards)) return json.data.data.cards;
      if (typeof maybeText === "string") return parseRestaurantsFromMcpRemoteText(maybeText);
      return [];
    })();

    const restaurants = Array.isArray(restaurantsRaw) ? restaurantsRaw.slice(0, 24) : [];

    const normalized = restaurants.map((r, idx) => {
      const availability = r?.availabilityStatus ?? r?.availability ?? r?.isOpen ?? null;
      const isOpen =
        availability === "OPEN" || availability === true || String(availability ?? "").toLowerCase() === "open";
      const hasKnownStatus = availability !== null && availability !== undefined && String(availability) !== "";
      return {
        id: String(r?.id ?? r?.restaurantId ?? idx),
        name: String(r?.name ?? r?.title ?? "Restaurant"),
        subtitle: [
          r?.cuisines ? (Array.isArray(r.cuisines) ? r.cuisines.join(", ") : String(r.cuisines)) : null,
          r?.distanceKm ? `${r.distanceKm} km` : null,
          r?.avgRating
            ? String(r.avgRating).includes("★")
              ? String(r.avgRating)
              : `${r.avgRating}★`
            : null,
          r?.eta ? String(r.eta) : null,
          r?.costForTwo ? String(r.costForTwo) : null
        ]
          .filter(Boolean)
          .join(" • "),
        metaText: hasKnownStatus ? (isOpen ? "Open now" : "Closed") : undefined
      };
    });

    return res.json({ ok: true, query: q, restaurants: normalized });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to fetch restaurants" });
  }
});

app.post("/food/cart/add", async (req, res) => {
  try {
    const bodySchema = z.object({
      restaurantId: z.string().min(1),
      menuItemId: z.string().min(1),
      menuItemName: z.string().min(1).optional(),
      quantity: z.number().int().min(1).max(10).default(1)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    if (!activeAddressId) {
      try {
        const instamart = getMcp("instamart");
        const addrRes = await instamart.callTool("get_addresses", {});
        const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
        const firstId = pickAddressId(first);
        if (firstId) activeAddressId = firstId;
      } catch {
        // ignore
      }
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });

    const { restaurantId, menuItemId, quantity } = parsed.data;
    const food = getMcp("food");
    activeFoodRestaurantId = restaurantId;

    // MVP: try to pick first variant option if present in the textual search_menu output.
    let variantsV2 = undefined;
    try {
      if (parsed.data.menuItemName) {
        const menuRes = await food.callTool("search_menu", {
          addressId: activeAddressId,
          query: parsed.data.menuItemName,
          restaurantIdOfAddedItem: restaurantId
        });
        const menuText = menuRes?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
        const firstVar = typeof menuText === "string" ? parseFirstVariantFromText(menuText) : null;
        if (firstVar) variantsV2 = [firstVar];
      }
    } catch {
      // ignore; we will attempt add without variants
    }

    await food.callTool("update_food_cart", {
      restaurantId,
      addressId: addr,
      cartItems: [{ menu_item_id: menuItemId, quantity, ...(variantsV2 ? { variantsV2 } : {}) }]
    });

    const cartRes = await food.callTool("get_food_cart", { addressId: addr });
    const cartNormalized = normalizeFoodCartFromToolResult(cartRes);
    if (cartNormalized && !cartNormalized.restaurantId) cartNormalized.restaurantId = activeFoodRestaurantId;
    return res.json({ ok: true, cart: cartNormalized, raw: cartRes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to add to food cart" });
  }
});

app.get("/food/cart", async (_req, res) => {
  try {
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const food = getMcp("food");
    const cartRes = await food.callTool("get_food_cart", { addressId: addr });
    const cartNormalized = normalizeFoodCartFromToolResult(cartRes);
    if (cartNormalized && !cartNormalized.restaurantId) cartNormalized.restaurantId = activeFoodRestaurantId;
    return res.json({ ok: true, cart: cartNormalized, raw: cartRes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to fetch food cart" });
  }
});

app.post("/food/cart/update", async (req, res) => {
  try {
    const bodySchema = z.object({
      restaurantId: z.string().min(1).optional(),
      menuItemId: z.coerce.string().min(1),
      quantity: z.coerce.number().int().min(0).max(10)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });

    const { menuItemId, quantity } = parsed.data;
    const food = getMcp("food");

    const cartBefore = await food.callTool("get_food_cart", { addressId: addr });
    const { data: structuredBefore, itemsRaw } = getFoodCartPayloadFromToolResult(cartBefore);

    const restaurantId =
      parsed.data.restaurantId ??
      pickRestaurantIdFromCartData(structuredBefore) ??
      activeFoodRestaurantId;
    if (!restaurantId) {
      return res.status(400).json({ ok: false, error: "Could not resolve restaurantId (open menu and add an item, or sync cart)." });
    }
    activeFoodRestaurantId = String(restaurantId);

    let cartRes;

    // Removing an item: Swiggy Food MCP often ignores quantity:0. Always flush + re-add remaining lines.
    if (quantity === 0) {
      let dropped = false;
      const others = itemsRaw.filter((l) => {
        if (foodCartLineMatchesMenuItem(l, menuItemId) && !dropped) {
          dropped = true;
          return false;
        }
        return true;
      });
      if (itemsRaw.length > 0 && !dropped) {
        return res.status(400).json({
          ok: false,
          error:
            "Could not find that item in your Swiggy cart (id mismatch). Tap Sync on Profile, or remove from the Swiggy app and re-add from the menu."
        });
      }
      await food.callTool("flush_food_cart", {});
      if (others.length > 0) {
        const rebuildItems = others.map((l) =>
          buildFoodCartUpdateItemFromLine(
            l,
            String(l?.menu_item_id ?? l?.menuItemId ?? l?.id ?? menuItemId),
            Number(l.quantity ?? l.qty ?? l.count ?? 1)
          )
        );
        await food.callTool("update_food_cart", {
          restaurantId: String(restaurantId),
          addressId: addr,
          cartItems: rebuildItems
        });
      }
      cartRes = await food.callTool("get_food_cart", { addressId: addr });
    } else {
      const line = findFoodCartLineForMenuItem(itemsRaw, menuItemId);
      if (!line) {
        return res.status(400).json({
          ok: false,
          error: "Item not found in current cart — pull to refresh or re-add from the menu."
        });
      }
      const cartItem = buildFoodCartUpdateItemFromLine(line, menuItemId, quantity);
      await food.callTool("update_food_cart", {
        restaurantId: String(restaurantId),
        addressId: addr,
        cartItems: [cartItem]
      });
      cartRes = await food.callTool("get_food_cart", { addressId: addr });
    }

    const cartNormalized = normalizeFoodCartFromToolResult(cartRes);
    if (cartNormalized && !cartNormalized.restaurantId) cartNormalized.restaurantId = activeFoodRestaurantId;
    return res.json({ ok: true, cart: cartNormalized, raw: cartRes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to update food cart" });
  }
});

app.get("/food/checkout/summary", async (_req, res) => {
  try {
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const food = getMcp("food");
    const cartRes = await food.callTool("get_food_cart", { addressId: addr });
    const { data: structured } = getFoodCartPayloadFromToolResult(cartRes);
    const cartNormalized = normalizeFoodCartFromToolResult(cartRes);
    if (cartNormalized && !cartNormalized.restaurantId) cartNormalized.restaurantId = activeFoodRestaurantId;
    const paymentMethods = pickAvailablePaymentMethods(structured);
    const total = Number(cartNormalized?.summary?.total ?? 0);
    const canPlaceOrder = Number.isFinite(total) ? total < 1000 : false;
    return res.json({ ok: true, addressId: addr, cart: cartNormalized, paymentMethods, canPlaceOrder, raw: cartRes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to build checkout summary" });
  }
});

app.post("/food/order/place", async (req, res) => {
  try {
    const bodySchema = z.object({
      confirm: z.literal(true),
      paymentMethod: z.string().min(1).optional()
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const food = getMcp("food");

    const cartRes = await food.callTool("get_food_cart", { addressId: addr });
    const { data: structured } = getFoodCartPayloadFromToolResult(cartRes);
    const cartNormalized = normalizeFoodCartFromToolResult(cartRes);
    const total = Number(cartNormalized?.summary?.total ?? 0);
    if (!Number.isFinite(total) || total >= 1000) {
      return res.status(400).json({ ok: false, error: "Order placement not allowed for cart total ₹1000 or more via MCP beta." });
    }

    const paymentMethods = pickAvailablePaymentMethods(structured);
    const desired = parsed.data.paymentMethod;
    const paymentMethod = desired && paymentMethods.includes(desired) ? desired : undefined;

    const placeRes = await food.callTool("place_food_order", { addressId: addr, ...(paymentMethod ? { paymentMethod } : {}) });
    return res.json({ ok: true, message: "Swiggy order placed successfully", raw: placeRes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to place order" });
  }
});

app.get("/food/orders", async (req, res) => {
  try {
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const countRaw = Number(req.query.count);
    const orderCount = Number.isFinite(countRaw) ? Math.min(20, Math.max(1, Math.floor(countRaw))) : 10;
    const food = getMcp("food");
    const raw = await food.callTool("get_food_orders", { addressId: addr, orderCount });
    const extracted = extractFoodOrdersFromToolResult(raw);
    return res.json({
      ok: true,
      addressId: addr,
      orders: extracted.orders,
      summaryText: extracted.summaryText ?? null,
      rawTextPreview: extracted.rawTextPreview ?? null,
      raw
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to fetch food orders" });
  }
});

app.get("/food/orders/track", async (req, res) => {
  try {
    const food = getMcp("food");
    const orderId = typeof req.query.orderId === "string" && req.query.orderId.trim() ? req.query.orderId.trim() : undefined;
    const raw = await food.callTool("track_food_order", orderId ? { orderId } : {});
    const track = normalizeFoodTrackFromToolResult(raw);
    return res.json({ ok: true, track, raw });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to track order" });
  }
});

app.post("/instamart/cart/add", async (req, res) => {
  try {
    const bodySchema = z.object({
      spinId: z.coerce.string().min(1),
      quantity: z.coerce.number().int().min(1).max(20).default(1)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const { spinId, quantity } = parsed.data;
    const instamart = getMcp("instamart");
    const cartRes = await instamart.callTool("get_cart", {});
    const existing = extractInstamartCartItemsFromResult(cartRes);
    const merged = existing.map((x) => ({ ...x }));
    const idx = merged.findIndex((x) => x.spinId === spinId);
    if (idx >= 0) merged[idx].quantity = Math.min(99, merged[idx].quantity + quantity);
    else merged.push({ spinId, quantity });
    await instamart.callTool("update_cart", { selectedAddressId: addr, items: merged });
    const after = await instamart.callTool("get_cart", {});
    return res.json({ ok: true, items: merged, raw: after });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to update Instamart cart" });
  }
});

app.post("/instamart/cart/add-bulk", async (req, res) => {
  try {
    const bodySchema = z.object({
      items: z
        .array(
          z.object({
            spinId: z.coerce.string().min(1),
            quantity: z.coerce.number().int().min(1).max(20).default(1)
          })
        )
        .min(1)
        .max(40)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    await mergeInstamartCartLines(
      addr,
      parsed.data.items.map((x) => ({ spinId: x.spinId, quantity: x.quantity }))
    );
    const instamart = getMcp("instamart");
    const after = await instamart.callTool("get_cart", {});
    return res.json({ ok: true, raw: after });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to bulk-update Instamart cart" });
  }
});

app.get("/instamart/cart", async (_req, res) => {
  try {
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const instamart = getMcp("instamart");
    const raw = await instamart.callTool("get_cart", {});
    const cartNormalized = normalizeInstamartCartFromToolResult(raw);
    return res.json({ ok: true, cart: cartNormalized, raw });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to fetch Instamart cart" });
  }
});

app.post("/instamart/cart/update", async (req, res) => {
  try {
    const bodySchema = z.object({
      spinId: z.coerce.string().min(1),
      quantity: z.coerce.number().int().min(0).max(99)
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });

    const { spinId, quantity } = parsed.data;
    const instamart = getMcp("instamart");

    const cartRes = await instamart.callTool("get_cart", {});
    const existing = extractInstamartCartItemsFromResult(cartRes);
    const merged = existing.map((x) => ({ ...x }));
    const idx = merged.findIndex((x) => x.spinId === String(spinId));
    if (quantity <= 0) {
      if (idx >= 0) merged.splice(idx, 1);
    } else {
      if (idx >= 0) merged[idx].quantity = Math.min(99, Math.max(1, quantity));
      else merged.push({ spinId: String(spinId), quantity: Math.min(99, Math.max(1, quantity)) });
    }

    if (merged.length === 0) {
      await instamart.callTool("clear_cart", {});
    } else {
      await instamart.callTool("update_cart", { selectedAddressId: addr, items: merged });
    }

    const after = await instamart.callTool("get_cart", {});
    const cartNormalized = normalizeInstamartCartFromToolResult(after);
    return res.json({ ok: true, cart: cartNormalized, raw: after });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to update Instamart cart" });
  }
});

app.get("/instamart/checkout/summary", async (_req, res) => {
  try {
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });
    const instamart = getMcp("instamart");
    const raw = await instamart.callTool("get_cart", {});
    const cartNormalized = normalizeInstamartCartFromToolResult(raw);
    const paymentMethods = pickInstamartAvailablePaymentMethodsFromCartResult(raw);
    const total = Number(cartNormalized?.summary?.total ?? 0);
    const canPlaceOrder = cartNormalized.items.length > 0 && Number.isFinite(total) ? total < 1000 : false;
    return res.json({ ok: true, addressId: addr, cart: cartNormalized, paymentMethods, canPlaceOrder, raw });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to build Instamart checkout summary" });
  }
});

app.post("/instamart/order/place", async (req, res) => {
  try {
    const bodySchema = z.object({
      confirm: z.literal(true),
      paymentMethod: z.string().min(1).optional()
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    }
    const addr = await ensureActiveAddressId();
    if (!addr) return res.status(400).json({ ok: false, error: "active address required" });

    const instamart = getMcp("instamart");
    const cartRaw = await instamart.callTool("get_cart", {});
    const cartNormalized = normalizeInstamartCartFromToolResult(cartRaw);
    const paymentMethods = pickInstamartAvailablePaymentMethodsFromCartResult(cartRaw);
    const desired = parsed.data.paymentMethod;
    const paymentMethod = desired && paymentMethods.includes(desired) ? desired : undefined;
    const total = Number(cartNormalized?.summary?.total ?? 0);
    if (!Number.isFinite(total) || total >= 1000) {
      return res.status(400).json({ ok: false, error: "Checkout not allowed for Instamart cart total ₹1000 or more via MCP beta." });
    }

    const out = await instamart.callTool("checkout", { addressId: addr, ...(paymentMethod ? { paymentMethod } : {}) });
    return res.json({ ok: true, message: "Instamart order placed successfully", raw: out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Failed to place Instamart order" });
  }
});

app.post("/chat", async (req, res) => {
  const chatActionSchema = z.discriminatedUnion("type", [
    z.object({
      type: z.literal("cook_confirm_ingredients"),
      sessionId: z.string().min(1),
      selectedIds: z.array(z.string()).min(1)
    }),
    z.object({
      type: z.literal("cook_add_selected_to_cart"),
      sessionId: z.string().min(1),
      items: z
        .array(
          z.object({
            spinId: z.coerce.string().min(1),
            quantity: z.coerce.number().int().min(1).max(20).optional()
          })
        )
        .min(1)
    })
  ]);

  const bodySchema = z
    .object({
      message: z.string().default(""),
      action: chatActionSchema.optional()
    })
    .superRefine((body, ctx) => {
      if (!body.action && !String(body.message ?? "").trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "message or action required", path: ["message"] });
      }
    });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request body",
      details: parsed.error.flatten()
    });
  }

  const message = String(parsed.data.message ?? "").trim();
  const action = parsed.data.action;
  const text = message.toLowerCase();
  const actions = [];
  const cards = [];
  const cartPayload = () => ({ items: cart.items, summary: cartSummary() });

  // Cook-flow continuations (no Gemini router needed)
  pruneCookSessions();
  if (action?.type === "cook_confirm_ingredients") {
    const sess = cookSessions.get(action.sessionId);
    const addr = await ensureActiveAddressId();
    if (!addr) {
      return res.json({
        ok: true,
        reply: "Set a delivery address first, then I can search Instamart for each ingredient.",
        cards: [
          {
            kind: "info",
            id: "need-address-im",
            title: "Pick a delivery address",
            subtitle: "Open the location picker and select a saved address."
          }
        ],
        actions: [],
        cookFlow: null,
        cart: cartPayload()
      });
    }
    if (!sess) {
      return res.json({
        ok: true,
        reply: "That ingredient list expired. Tell me again what you want to cook.",
        cards: [],
        actions: [],
        cookFlow: null,
        cart: cartPayload()
      });
    }

    try {
      const instamart = getMcp("instamart");
      const want = new Set(action.selectedIds.map((x) => String(x ?? "").trim()).filter(Boolean));
      const picked = sess.ingredients.filter((i) => want.has(String(i.id ?? "").trim()));
      /** @type {{ ingredientId: string, title: string, cards: any[] }[]} */
      const productGroups = [];
      for (const ing of picked) {
        const rowCards = await instamartSearchCardsForIngredient(instamart, addr, ing);
        productGroups.push({
          ingredientId: String(ing.id).trim(),
          title: ing.label,
          cards: rowCards
        });
      }

      sess.addressId = addr;
      sess.pickProductGroups = productGroups;
      sess.createdAt = Date.now();

      let queryHeadlineCook = null;
      if (process.env.GEMINI_API_KEY && sess.recipeLabel) {
        try {
          queryHeadlineCook = await headlineFromUserQuery(
            `Groceries and ingredients for cooking: ${sess.recipeLabel}`
          );
        } catch {
          queryHeadlineCook = null;
        }
      }

      return res.json({
        ok: true,
        reply: `Grouped Instamart options for "${sess.recipeLabel}". Tap rows to toggle what you want, then tap add to cart.`,
        cards: [],
        actions: [],
        cookFlow: {
          phase: "pick_products",
          sessionId: action.sessionId,
          recipeTitle: sess.recipeLabel,
          productGroups
        },
        cart: cartPayload(),
        ...(queryHeadlineCook ? { queryHeadline: queryHeadlineCook } : {})
      });
    } catch (e) {
      return res.json({
        ok: true,
        reply: e?.message ?? "Instamart search failed for one or more ingredients.",
        cards: [],
        actions: [],
        cookFlow: null,
        cart: cartPayload()
      });
    }
  }

  if (action?.type === "cook_add_selected_to_cart") {
    const sess = cookSessions.get(action.sessionId);
    const addr = await ensureActiveAddressId();
    if (!addr) {
      return res.json({
        ok: true,
        reply: "Set a delivery address before adding groceries to cart.",
        cards: [],
        actions: [],
        cart: cartPayload()
      });
    }
    if (!sess) {
      return res.json({
        ok: true,
        reply: "That cooking session expired. Start again with what you want to cook.",
        cards: [],
        actions: [],
        cookFlow: null,
        cart: cartPayload()
      });
    }
    try {
      const additions = action.items.map((x) => ({
        spinId: String(x.spinId),
        quantity: Math.min(99, Math.max(1, Number(x.quantity ?? 1) || 1))
      }));
      await mergeInstamartCartLines(addr, additions);
      const recipeForHeadline = sess.recipeLabel;
      cookSessions.delete(action.sessionId);
      let queryHeadlineAdd = null;
      if (process.env.GEMINI_API_KEY && recipeForHeadline) {
        try {
          queryHeadlineAdd = await headlineFromUserQuery(`Instamart cart for cooking: ${recipeForHeadline}`);
        } catch {
          queryHeadlineAdd = null;
        }
      }
      return res.json({
        ok: true,
        reply: `Added ${additions.length} line(s) to your Instamart cart. Open the Swiggy Instamart app to review checkout.`,
        cards: [],
        actions: [],
        cookFlow: null,
        cart: cartPayload(),
        ...(queryHeadlineAdd ? { queryHeadline: queryHeadlineAdd } : {})
      });
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: e?.message ?? "Could not update Instamart cart.",
        reply: e?.message ?? "Could not update Instamart cart.",
        cards: [],
        actions: [],
        cart: cartPayload()
      });
    }
  }

  // LLM router (best). Fallback: simple heuristic router.
  /** @type {{ domain: "food"|"instamart"|"dineout"|"other", intent: string, query?: string, budget?: number }} */
  let decision = { domain: "food", intent: "food.search_restaurants" };
  const hasLlm = !!process.env.GEMINI_API_KEY;
  if (hasLlm) {
    try {
      decision = await routeWithLlm({ message, hasActiveAddress: !!activeAddressId });
      lastRouterError = null;
    } catch (e) {
      // If LLM fails, fall back to heuristic.
      // eslint-disable-next-line no-console
      console.warn(`[router] LLM failed: ${e?.message ?? e}`);
      lastRouterError = e?.message ?? String(e);
    }
  }

  if (!hasLlm) {
    // Heuristic fallback — align with Gemini intents
    if (text.includes("dineout") || text.includes("book") || text.includes("table") || text.includes("reservation")) {
      decision = { domain: "dineout", intent: "dineout.search_restaurants" };
    } else if (heuristicInstamartCookRecipe(message) || /\b(recipe\s+for|ingredients\s+for|want\s+to\s+cook)\b/i.test(message)) {
      decision = { domain: "instamart", intent: "instamart.cook_recipe" };
    } else if (text.includes("instamart") || text.includes("grocery") || text.includes("groceries")) {
      decision = { domain: "instamart", intent: "instamart.search_products" };
    } else {
      decision = { domain: "food", intent: "food.search_restaurants" };
    }
  }

  if (userExplicitlyCookingAtHome(message)) {
    decision = {
      ...decision,
      domain: "instamart",
      intent: "instamart.cook_recipe"
    };
  }

  // Budget/query extraction fallback if LLM didn't supply.
  const fallbackBudget = extractBudgetRupees(text);
  const budget = typeof decision.budget === "number" ? decision.budget : fallbackBudget;
  const llmQuery = typeof decision.query === "string" && decision.query.trim() ? decision.query.trim() : null;
  const foodQuery = llmQuery ?? buildFoodQuery(message, budget);

  /** 3–4 word Gemini title for Assistant hero */
  let queryHeadline = null;
  if (message && process.env.GEMINI_API_KEY) {
    try {
      queryHeadline = await headlineFromUserQuery(message.slice(0, 520));
    } catch {
      queryHeadline = null;
    }
  }

  /** @returns {Record<string,string>} */
  function headlinePatch() {
    return queryHeadline ? { queryHeadline } : {};
  }

  // Food search → Swiggy Food MCP
  if (decision.domain === "food") {
    // If no active address yet, auto-pick the most recent saved address (so the app shows results immediately).
    if (!activeAddressId) {
      try {
        const instamart = getMcp("instamart");
        const addrRes = await instamart.callTool("get_addresses", {});
        const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
        const firstId = pickAddressId(first);
        if (firstId) activeAddressId = firstId;
      } catch {
        // ignore; we'll fall back to asking user to select.
      }
    }

    if (!activeAddressId) {
      cards.push({
        kind: "info",
        id: "need-address",
        title: "Pick a delivery address",
        subtitle: "Open the location picker and select one of your saved addresses."
      });
      return res.json({
        ok: true,
        reply: "I need a delivery address to fetch live nearby options.",
        cards,
        actions,
        cookFlow: null,
        cart: { items: cart.items, summary: cartSummary() },
        ...headlinePatch()
      });
    }

    try {
      const food = getMcp("food");
      const mcpRes = await food.callTool("search_restaurants", {
        addressId: activeAddressId,
        query: foodQuery
      });
      let json = mcpRes;
      const maybeText = mcpRes?.content?.find?.((c) => c?.type === "text" && typeof c?.text === "string")?.text;
      if (typeof maybeText === "string") {
        json = tryParseJsonText(maybeText) ?? mcpRes;
      }

      const restaurants = (() => {
        if (Array.isArray(json?.restaurants)) return json.restaurants;
        if (Array.isArray(json?.data?.restaurants)) return json.data.restaurants;
        if (Array.isArray(json?.data?.data?.restaurants)) return json.data.data.restaurants;
        if (Array.isArray(json?.data?.cards)) return json.data.cards;
        if (Array.isArray(json?.data?.data?.cards)) return json.data.data.cards;
        // mcp-remote often returns a textual list; parse it.
        if (typeof maybeText === "string") return parseRestaurantsFromMcpRemoteText(maybeText);
        return [];
      })();

      // Best-effort normalize → top restaurants as cards
      const picks = restaurants.slice(0, 8).map((r, idx) => {
        const availability = r?.availabilityStatus ?? r?.availability ?? r?.isOpen ?? null;
        const isOpen =
          availability === "OPEN" || availability === true || String(availability ?? "").toLowerCase() === "open";
        const hasKnownStatus = availability !== null && availability !== undefined && String(availability) !== "";
        return {
          kind: "restaurant",
          id: String(r?.id ?? r?.restaurantId ?? idx),
          title: String(r?.name ?? r?.title ?? "Restaurant"),
          subtitle: [
            r?.cuisines ? (Array.isArray(r.cuisines) ? r.cuisines.join(", ") : String(r.cuisines)) : null,
            r?.distanceKm ? `${r.distanceKm} km` : null,
            r?.avgRating ? String(r.avgRating).includes("★") ? String(r.avgRating) : `${r.avgRating}★` : null,
            r?.eta ? String(r.eta) : null,
            r?.costForTwo ? String(r.costForTwo) : null
          ]
            .filter(Boolean)
            .join(" • "),
          metaText: hasKnownStatus ? (isOpen ? "Open now" : "Closed") : undefined
        };
      });

      return res.json({
        ok: true,
        reply: `Here are some nearby options${budget ? ` under ₹${budget}` : ""}.`,
        cards:
          picks.length > 0
            ? picks
            : [
                {
                  kind: "info",
                  id: "no-restaurants",
                  title: "No restaurants parsed from MCP response",
                  subtitle: "The MCP response shape changed. I can adjust the parser once we inspect the raw payload."
                }
              ],
        actions,
        cookFlow: null,
        cart: { items: cart.items, summary: cartSummary() },
        debug: {
          restaurantsType: typeof restaurants,
          restaurantsCount: restaurants.length,
          rawTextPreview: typeof maybeText === "string" ? maybeText.slice(0, 1600) : null,
          budget,
          query: foodQuery,
          router: hasLlm ? "llm" : "heuristic",
          domain: decision.domain,
          intent: decision.intent
        },
        ...headlinePatch()
      });
    } catch (e) {
      cards.push({
        kind: "info",
        id: "food-mcp-error",
        title: "Couldn’t fetch live options",
        subtitle: e?.message ?? "Food MCP error"
      });
      return res.json({
        ok: true,
        reply: "I hit an issue fetching live results. Try again in a moment.",
        cards,
        actions,
        cookFlow: null,
        cart: { items: cart.items, summary: cartSummary() },
        ...headlinePatch()
      });
    }
  }

  if (decision.domain === "instamart") {
    if (!activeAddressId) {
      try {
        const instamart = getMcp("instamart");
        const addrRes = await instamart.callTool("get_addresses", {});
        const first = extractAddressListFromGetAddressesResult(addrRes)[0] ?? null;
        const firstId = pickAddressId(first);
        if (firstId) activeAddressId = firstId;
      } catch {
        // ignore
      }
    }

    if (!activeAddressId) {
      cards.push({
        kind: "info",
        id: "need-address-im",
        title: "Pick a delivery address",
        subtitle: "Instamart needs your saved address. Open the location picker and select one."
      });
      return res.json({
        ok: true,
        reply: "Choose a delivery address first — then I can search Instamart for ingredients.",
        cards,
        actions,
        cookFlow: null,
        cart: { items: cart.items, summary: cartSummary() },
        ...headlinePatch()
      });
    }

    const recipeLabel = (llmQuery && llmQuery.length > 1 ? llmQuery : null) || extractRecipeFocus(message);
    const useCookFlow = shouldUseInstamartCookFlow(decision, message);

    try {
      if (useCookFlow) {
        const checklist = await expandIngredientChecklist({ recipeLabel, message });
        const sessionId = crypto.randomUUID();
        cookSessions.set(sessionId, {
          recipeLabel,
          ingredients: checklist,
          addressId: activeAddressId,
          createdAt: Date.now()
        });
        return res.json({
          ok: true,
          reply: `For “${recipeLabel}”: uncheck anything you already have at home, then tap Search to load Instamart matches for each ingredient.`,
          cards: [],
          cookFlow: {
            phase: "ingredient_checklist",
            sessionId,
            recipeTitle: recipeLabel,
            items: checklist.map((c) => ({ id: c.id, label: c.label, defaultSelected: true }))
          },
          actions,
          cart: { items: cart.items, summary: cartSummary() },
          debug: {
            router: hasLlm ? "llm" : "heuristic",
            domain: decision.domain,
            intent: decision.intent,
            cookPhase: "ingredient_checklist"
          },
          ...headlinePatch()
        });
      }

      const instamart = getMcp("instamart");
      const groceryQ =
        llmQuery && llmQuery.length > 1 ? llmQuery : String(message || "").trim().slice(0, 100) || "groceries";
      let instamartQueryError = null;
      /** @type {any[]} */
      let allCards = [];
      try {
        const raw = await instamart.callTool("search_products", {
          addressId: activeAddressId,
          query: String(groceryQ).slice(0, 80)
        });
        allCards = normalizeInstamartSearchToCards(raw, groceryQ);
      } catch (e) {
        instamartQueryError = e?.message ?? String(e);
      }

      const unique = [];
      const seen = new Set();
      for (const c of allCards) {
        if (!c.spinId || seen.has(c.spinId)) continue;
        seen.add(c.spinId);
        unique.push(c);
        if (unique.length >= 24) break;
      }

      return res.json({
        ok: true,
        reply: `Instamart results for “${groceryQ}”. Tap a row to add one to your Instamart cart (Food cart stays separate).`,
        cards:
          unique.length > 0
            ? unique
            : [
                {
                  kind: "info",
                  id: "instamart-empty",
                  title: "No Instamart products parsed",
                  subtitle: instamartQueryError ?? "Try another search or check Instamart MCP / address."
                }
              ],
        actions,
        cookFlow: null,
        cart: { items: cart.items, summary: cartSummary() },
        debug: {
          router: hasLlm ? "llm" : "heuristic",
          domain: decision.domain,
          intent: decision.intent,
          groceryQuery: groceryQ,
          instamartQueryError,
          groceryParsedBeforeDedupe: allCards.length
        },
        ...headlinePatch()
      });
    } catch (e) {
      cards.push({
        kind: "info",
        id: "instamart-error",
        title: "Instamart search failed",
        subtitle: e?.message ?? "MCP error"
      });
      return res.json({
        ok: true,
        reply: "I couldn’t reach Instamart right now. Check MCP_INSTAMART_CMD and try again.",
        cards,
        actions,
        cookFlow: null,
        cart: { items: cart.items, summary: cartSummary() },
        ...headlinePatch()
      });
    }
  }
  if (decision.domain === "dineout") {
    cards.push({
      kind: "info",
      id: "dineout-next",
      title: "Dineout flow next",
      subtitle: "Next: saved locations → search restaurants → slots → book table (MCP)."
    });
    return res.json({
      ok: true,
      reply: "Dineout routing is detected. I’ll wire the real Dineout tool calls next.",
      cards,
      actions,
      cookFlow: null,
      cart: { items: cart.items, summary: cartSummary() },
      debug: { router: hasLlm ? "llm" : "heuristic", domain: decision.domain, intent: decision.intent },
      ...headlinePatch()
    });
  }

  // If nothing matched, return a helpful prompt.
  cards.push({
    kind: "info",
    id: "help",
    title: "Tell me what you want",
    subtitle: 'Try: "biryani", "pizza under 250", "healthy veg", or "butter chicken ingredients (Instamart)"'
  });
  actions.push({ type: ActionType.SET_CHIPS, payload: { chips: ["Biryani", "Pizza under 250", "Healthy veg"] } });

  return res.json({
    ok: true,
    reply: `Got it. Here are some options based on: "${message}"`,
    cards,
    actions,
    cookFlow: null,
    cart: { items: cart.items, summary: cartSummary() },
    ...headlinePatch()
  });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  // Keep log minimal; useful during ngrok testing
  console.log(`API listening on http://localhost:${port}`);
});
