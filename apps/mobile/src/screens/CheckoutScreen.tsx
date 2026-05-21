import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { GlassCard } from "../components/GlassCard";
import { ScreenBg } from "../components/ScreenBg";
import { theme } from "../theme";
import { useCart } from "../state/CartContext";
import { fetchFoodCheckoutSummary, placeFoodOrder, updateFoodCartItem } from "../lib/api";

function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: "rgba(46,233,166,0.16)", borderColor: "rgba(46,233,166,0.32)" }
      ]}
    >
      <Text style={[styles.chipText, active && { color: "rgba(46,233,166,0.95)" }]}>{label}</Text>
    </Pressable>
  );
}

export function CheckoutScreen() {
  const navigation = useNavigation();
  const { cart, setCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [canPlaceOrder, setCanPlaceOrder] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const items = cart.items ?? [];
  const summary = cart.summary;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const s = await fetchFoodCheckoutSummary();
        if (s?.cart)
          setCart((prev: any) => ({
            ...(s.cart as any),
            restaurantId: (s.cart as any)?.restaurantId ?? prev?.restaurantId ?? null
          }));
        const pm = s?.paymentMethods ?? [];
        setPaymentMethods(pm);
        setPaymentMethod(pm[0] ?? null);
        setCanPlaceOrder(Boolean(s?.canPlaceOrder));
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load checkout");
      } finally {
        setLoading(false);
      }
    })();
  }, [setCart]);

  const title = useMemo(() => {
    const n = summary?.count ?? 0;
    return n ? `Checkout (${n} item${n === 1 ? "" : "s"})` : "Checkout";
  }, [summary?.count]);

  function mergeCart(data: any) {
    if (!data?.cart) return;
    setCart((prev: any) => ({
      ...data.cart,
      restaurantId: data.cart?.restaurantId ?? prev?.restaurantId ?? null
    }));
  }

  async function removeItem(menuItemId: string) {
    setUpdatingId(menuItemId);
    setErr(null);
    try {
      const data = await updateFoodCartItem(String(menuItemId), 0, (cart as any)?.restaurantId);
      mergeCart(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to remove item");
    } finally {
      setUpdatingId(null);
    }
  }

  async function adjustQty(it: { id: string; qty: number }, nextQty: number) {
    if (nextQty < 0 || nextQty > 10) return;
    setUpdatingId(it.id);
    setErr(null);
    try {
      const data = await updateFoodCartItem(String(it.id), nextQty, (cart as any)?.restaurantId);
      mergeCart(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update quantity");
    } finally {
      setUpdatingId(null);
    }
  }

  async function place() {
    if (!canPlaceOrder) {
      setErr("Order placement is disabled (MCP beta limit or cart empty).");
      return;
    }
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    setPlacing(true);
    setErr(null);
    try {
      await placeFoodOrder(true, paymentMethod ?? undefined);
      setConfirmStep(false);
      // Refresh cart after placing.
      const s = await fetchFoodCheckoutSummary();
      if (s?.cart)
        setCart((prev: any) => ({
          ...(s.cart as any),
          restaurantId: (s.cart as any)?.restaurantId ?? prev?.restaurantId ?? null
        }));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <ScreenBg>
      <View style={styles.wrap}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.78)" />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? <Text style={styles.subtle}>Loading…</Text> : null}
          {err ? (
            <GlassCard style={styles.err} intensity={18}>
              <Text style={styles.errText}>{err}</Text>
            </GlassCard>
          ) : null}

          <Text style={styles.section}>Items</Text>
          {items.length ? (
            items.map((it) => (
              <GlassCard key={it.id} style={styles.row} intensity={18}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{it.title}</Text>
                  <Text style={styles.itemMeta}>₹{Math.round(it.price * it.qty)} total</Text>
                </View>
                <View style={styles.qtyBar}>
                  <Pressable
                    onPress={() => adjustQty(it, it.qty - 1)}
                    disabled={!!updatingId}
                    style={({ pressed }) => [styles.qtyBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="remove" size={16} color="rgba(0,0,0,0.85)" />
                  </Pressable>
                  <Text style={styles.qtyVal}>{updatingId === it.id ? "…" : it.qty}</Text>
                  <Pressable
                    onPress={() => adjustQty(it, it.qty + 1)}
                    disabled={it.qty >= 10 || !!updatingId}
                    style={({ pressed }) => [styles.qtyBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="add" size={16} color="rgba(0,0,0,0.85)" />
                  </Pressable>
                </View>
                <Pressable onPress={() => removeItem(String(it.id))} style={styles.trash} hitSlop={10}>
                  <Ionicons
                    name={updatingId === it.id ? "time-outline" : "trash-outline"}
                    size={16}
                    color="rgba(255,255,255,0.70)"
                  />
                </Pressable>
              </GlassCard>
            ))
          ) : (
            <GlassCard style={styles.row} intensity={18}>
              <Text style={styles.subtle}>Your cart is empty</Text>
            </GlassCard>
          )}

          <Text style={styles.section}>Payment</Text>
          <View style={styles.chips}>
            {(paymentMethods.length ? paymentMethods : ["(no methods)"]).map((pm) => (
              <Chip key={pm} label={pm} active={pm === paymentMethod} onPress={() => setPaymentMethod(pm)} />
            ))}
          </View>

          <GlassCard style={styles.totals} intensity={18}>
            <View style={styles.totalRow}>
              <Text style={styles.tKey}>Subtotal</Text>
              <Text style={styles.tVal}>₹{summary.subtotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.tKey}>Taxes & Charges</Text>
              <Text style={styles.tVal}>₹{summary.taxes}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.tKey}>Delivery Fee</Text>
              <Text style={styles.tVal}>₹{summary.deliveryFee}</Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.totalRow}>
              <Text style={styles.tKey}>Total</Text>
              <Text style={[styles.tVal, { fontWeight: "900", color: theme.colors.accent }]}>₹{summary.total}</Text>
            </View>
          </GlassCard>

          <GlassCard style={styles.confirm} intensity={18}>
            <Text style={styles.subtle}>
              {confirmStep
                ? "Tap again to confirm placing this order (MCP beta)."
                : "When ready, tap Place order. We'll ask for confirmation."}
            </Text>
          </GlassCard>

          <Pressable
            onPress={place}
            disabled={!items.length || placing || loading}
            style={({ pressed }) => [
              styles.placeBtn,
              (!items.length || placing || loading) && { opacity: 0.55 },
              pressed && { transform: [{ translateY: 1 }] }
            ]}
          >
            <Text style={styles.placeText}>
              {placing ? "PLACING…" : confirmStep ? "CONFIRM PLACE ORDER" : "PLACE ORDER"}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="rgba(0,0,0,0.9)" />
          </Pressable>

          <View style={{ height: 28 }} />
        </ScrollView>
      </View>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 10 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  title: { flex: 1, textAlign: "center", color: "rgba(255,255,255,0.82)", fontSize: 16, fontWeight: "700" },
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 },
  section: { marginTop: 16, color: "rgba(255,255,255,0.55)", fontSize: 12, letterSpacing: 1.2, fontWeight: "800" },
  row: { marginTop: 10, padding: 12, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    paddingHorizontal: 4,
    height: 36
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  qtyVal: { minWidth: 22, textAlign: "center", color: "rgba(0,0,0,0.85)", fontWeight: "900", fontSize: 13 },
  itemTitle: { color: "rgba(255,255,255,0.86)", fontSize: 14, fontWeight: "700" },
  itemMeta: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  subtle: { color: "rgba(255,255,255,0.62)", fontSize: 12 },
  trash: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  chipText: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "700" },
  totals: { marginTop: 12, padding: 14, borderRadius: 22 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  tKey: { color: "rgba(255,255,255,0.60)", fontSize: 13 },
  tVal: { color: "rgba(255,255,255,0.78)", fontSize: 13 },
  sep: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 8 },
  placeBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: theme.colors.accent
  },
  placeText: { color: "rgba(0,0,0,0.9)", fontSize: 13, fontWeight: "900", letterSpacing: 1.2 },
  err: { marginTop: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,80,80,0.20)" },
  errText: { color: "rgba(255,160,160,0.95)", fontSize: 12, lineHeight: 16 },
  confirm: { marginTop: 10, padding: 12, borderRadius: 18 }
});

