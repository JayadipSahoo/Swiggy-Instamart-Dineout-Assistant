import { getApiBaseUrl } from "./storage";
import type { ChatResponse } from "./assistant";

export type ChatClientAction =
  | { type: "cook_confirm_ingredients"; sessionId: string; selectedIds: string[] }
  | { type: "cook_add_selected_to_cart"; sessionId: string; items: { spinId: string; quantity?: number }[] };

type HealthResponse = { ok: boolean; service?: string };
type LegacyChatResponse = { ok: boolean; reply?: string; error?: string };
export type SavedAddress = {
  id: string;
  label: string;
  subtitle: string;
  addressId?: string;
};

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  return trimmed;
}

export async function healthCheck(): Promise<HealthResponse> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/health`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return (await res.json()) as HealthResponse;
}

export async function sendChat(message: string, chatAction?: ChatClientAction): Promise<ChatResponse> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/chat`;
  const body: { message: string; action?: ChatClientAction } = { message };
  if (chatAction) body.action = chatAction;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `Request failed: ${res.status}`);
  }
  if (data && typeof data === "object" && data.ok === false) {
    throw new Error(typeof data.error === "string" ? data.error : data.reply ?? "Request failed");
  }
  // Ensure reply exists (back-compat).
  if (typeof data?.reply !== "string") {
    return { ok: true, reply: "OK" } as ChatResponse;
  }
  return data as ChatResponse;
}

export async function fetchSavedAddresses(): Promise<SavedAddress[]> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/addresses`;
  const res = await fetch(url);
  const data = (await res.json()) as { ok: boolean; addresses?: SavedAddress[] };
  if (!res.ok || !data.ok) return [];
  return Array.isArray(data.addresses) ? data.addresses : [];
}

export type FoodMenuItem = {
  id: string;
  name: string;
  price?: number;
  isVeg?: boolean;
};

export type NearbyRestaurantCard = {
  id: string;
  name: string;
  subtitle?: string;
  metaText?: string;
};

export async function fetchNearbyFoodRestaurants(query = "popular"): Promise<NearbyRestaurantCard[]> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/restaurants?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { ok?: boolean; restaurants?: NearbyRestaurantCard[] };
  if (!res.ok || !data.ok) return [];
  return Array.isArray(data.restaurants) ? data.restaurants : [];
}

export async function fetchRestaurantMenuItems(restaurantId: string, query: string): Promise<FoodMenuItem[]> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/menu-items?restaurantId=${encodeURIComponent(
    restaurantId
  )}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { ok: boolean; items?: FoodMenuItem[] };
  if (!res.ok || !data.ok) return [];
  return Array.isArray(data.items) ? data.items : [];
}

export async function addFoodMenuItemToCart(restaurantId: string, menuItemId: string, menuItemName: string): Promise<any> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/cart/add`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restaurantId, menuItemId, menuItemName, quantity: 1 })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Failed to add item");
  return data;
}

export async function fetchFoodCart(): Promise<{ items: any[]; summary: any } | null> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/cart`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.ok) return null;
  return data.cart ?? null;
}

export async function fetchFoodCheckoutSummary(): Promise<{
  addressId: string;
  cart: any;
  paymentMethods: string[];
  canPlaceOrder: boolean;
} | null> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/checkout/summary`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.ok) return null;
  return {
    addressId: String(data.addressId),
    cart: data.cart ?? null,
    paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
    canPlaceOrder: Boolean(data.canPlaceOrder)
  };
}

export async function placeFoodOrder(confirm: true, paymentMethod?: string): Promise<any> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/order/place`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm, ...(paymentMethod ? { paymentMethod } : {}) })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to place order");
  return data;
}

export type FoodOrderSummary = {
  orderId: string;
  status: string;
  restaurantName: string;
  etaText: string | null;
  items: { id: string; name: string; qty: number }[];
};

export type FoodTrackTimelineItem = { title: string; desc: string; time: string; active?: boolean };

export type FoodTrackPayload = {
  status: string;
  etaText: string | null;
  message: string | null;
  orderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  timeline: FoodTrackTimelineItem[];
};

export async function fetchFoodOrders(count = 10): Promise<{
  orders: FoodOrderSummary[];
  summaryText: string | null;
}> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/orders?count=${encodeURIComponent(String(count))}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to fetch orders");
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    summaryText: typeof data.summaryText === "string" ? data.summaryText : null
  };
}

export async function trackFoodOrder(orderId?: string): Promise<FoodTrackPayload> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const q = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  const url = `${normalizeBaseUrl(base)}/food/orders/track${q}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to track order");
  const t = data.track ?? {};
  return {
    status: String(t.status ?? ""),
    etaText: t.etaText ?? null,
    message: t.message ?? null,
    orderId: t.orderId ?? null,
    riderName: t.riderName ?? null,
    riderPhone: t.riderPhone ?? null,
    timeline: Array.isArray(t.timeline) ? t.timeline : []
  };
}

/** Add/update line in Swiggy Instamart grocery cart (not Food cart). */
export async function addInstamartToCart(spinId: string, quantity = 1): Promise<{ ok: boolean; items?: { spinId: string; quantity: number }[] }> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/instamart/cart/add`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spinId, quantity })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to add to Instamart cart");
  return data;
}

export type InstamartCartLine = { spinId: string; title: string; qty: number; price?: number };
export type InstamartCartPayload = { items: InstamartCartLine[]; summary: { subtotal: number; taxes: number; deliveryFee: number; total: number; count: number } };

export async function fetchInstamartCart(): Promise<InstamartCartPayload | null> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/instamart/cart`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.ok) return null;
  return (data.cart as any) ?? null;
}

export async function updateInstamartCartItem(spinId: string, quantity: number): Promise<InstamartCartPayload | null> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/instamart/cart/update`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spinId, quantity })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to update Instamart cart");
  return (data.cart as any) ?? null;
}

export async function fetchInstamartCheckoutSummary(): Promise<{
  addressId: string;
  cart: InstamartCartPayload;
  paymentMethods: string[];
  canPlaceOrder: boolean;
} | null> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/instamart/checkout/summary`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data?.ok) return null;
  return {
    addressId: String(data.addressId),
    cart: data.cart ?? null,
    paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
    canPlaceOrder: Boolean(data.canPlaceOrder)
  };
}

export async function placeInstamartOrder(confirm: true, paymentMethod?: string): Promise<any> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/instamart/order/place`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm, ...(paymentMethod ? { paymentMethod } : {}) })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to place Instamart order");
  return data;
}

export async function updateFoodCartItem(
  menuItemId: string,
  quantity: number,
  restaurantId?: string | null
): Promise<any> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/food/cart/update`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      menuItemId,
      quantity,
      ...(restaurantId ? { restaurantId } : {})
    })
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Failed to update cart");
  return data;
}

export async function getActiveAddress(): Promise<{ addressId: string | null }> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/address/active`;
  const res = await fetch(url);
  const data = (await res.json()) as { ok: boolean; addressId?: string | null };
  if (!res.ok || !data.ok) return { addressId: null };
  return { addressId: typeof data.addressId === "string" ? data.addressId : null };
}

export async function setActiveAddress(addressId: string): Promise<void> {
  const base = await getApiBaseUrl();
  if (!base) throw new Error("API base URL not set");
  const url = `${normalizeBaseUrl(base)}/address/active`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addressId })
  });
  const data = (await res.json()) as { ok: boolean };
  if (!res.ok || !data.ok) throw new Error("Failed to set active address");
}

