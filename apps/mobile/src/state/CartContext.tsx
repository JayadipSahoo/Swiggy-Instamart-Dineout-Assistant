import React, { createContext, useContext, useMemo, useState } from "react";
import type { CartItem, CartSummary } from "../lib/assistant";

type CartState = {
  restaurantId?: string | null;
  items: CartItem[];
  summary: CartSummary;
};

type CartCtx = {
  cart: CartState;
  setCart: (next: CartState) => void;
};

const empty: CartState = {
  items: [],
  summary: { subtotal: 0, taxes: 0, deliveryFee: 0, total: 0, count: 0 }
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartState>(empty);
  const value = useMemo(() => ({ cart, setCart }), [cart]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside CartProvider");
  return v;
}

