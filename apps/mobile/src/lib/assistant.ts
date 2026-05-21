export type AssistantCard = {
  kind: "dish" | "restaurant" | "info" | "grocery";
  id: string;
  /** Instamart variant id from search_products */
  spinId?: string;
  title: string;
  subtitle?: string;
  priceText?: string;
  metaText?: string;
};

export type CookFlowProductGroup = {
  ingredientId: string;
  title: string;
  cards: AssistantCard[];
};

export type CookFlow =
  | {
      phase: "ingredient_checklist";
      sessionId: string;
      recipeTitle: string;
      items: { id: string; label: string; defaultSelected?: boolean }[];
    }
  | {
      phase: "pick_products";
      sessionId: string;
      recipeTitle: string;
      productGroups: CookFlowProductGroup[];
    };

export type AssistantAction =
  | { type: "navigate"; payload: { tab: "Assistant" | "Explore" | "Carts" | "Profile" } }
  | { type: "open_checkout"; payload?: {} }
  | { type: "add_to_cart"; payload: { id: string; title: string; price: number; qty?: number } }
  | { type: "set_chips"; payload: { chips: string[] } };

export type CartSummary = {
  subtotal: number;
  taxes: number;
  deliveryFee: number;
  total: number;
  count: number;
};

export type CartItem = {
  id: string;
  title: string;
  qty: number;
  price: number;
  /** Echoed from Swiggy cart so +/- / remove can round-trip variants */
  variantsV2?: { group_id: string | number; variation_id: string | number }[];
  variants?: unknown[];
  addons?: unknown[];
};

export type ChatResponse = {
  ok: boolean;
  reply: string;
  cards?: AssistantCard[];
  actions?: AssistantAction[];
  cart?: { items: CartItem[]; summary: CartSummary };
  /** Multi-step Instamart cook flow; `null` clears local UI */
  cookFlow?: CookFlow | null;
  /** Gemini: 3–4 word hero title for the user's request */
  queryHeadline?: string;
};

