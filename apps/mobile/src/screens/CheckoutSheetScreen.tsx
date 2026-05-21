import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { GlassCard } from "../components/GlassCard";
import { theme } from "../theme";
import { useCart } from "../state/CartContext";
import { fetchFoodCart, updateFoodCartItem } from "../lib/api";

function RowItem({
  title,
  subtitle,
  qtyNum,
  price,
  busy,
  onMinus,
  onPlus,
  onRemove
}: {
  title: string;
  subtitle: string;
  qtyNum: number;
  price: string;
  busy?: boolean;
  onMinus?: () => void;
  onPlus?: () => void;
  onRemove?: () => void;
}) {
  return (
    <GlassCard style={styles.itemRow} intensity={18}>
      <View style={styles.thumb} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.itemSub}>{subtitle}</Text>
        <Text style={styles.price}>{price}</Text>
      </View>
      <View style={styles.qtyBar}>
        <Pressable onPress={onMinus} disabled={busy} style={({ pressed }) => [styles.qtyBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="remove" size={15} color="rgba(0,0,0,0.85)" />
        </Pressable>
        <Text style={styles.qtyVal}>{busy ? "…" : qtyNum}</Text>
        <Pressable onPress={onPlus} disabled={busy || qtyNum >= 10} style={({ pressed }) => [styles.qtyBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="add" size={15} color="rgba(0,0,0,0.85)" />
        </Pressable>
      </View>
      {onRemove ? (
        <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={10}>
          <Ionicons name={busy ? "time-outline" : "trash-outline"} size={16} color="rgba(255,255,255,0.65)" />
        </Pressable>
      ) : null}
    </GlassCard>
  );
}

export function CheckoutSheetScreen() {
  const navigation = useNavigation();
  const { cart, setCart } = useCart();
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const items = cart.items;
  const summary = cart.summary;

  function mergeCart(data: any) {
    if (!data?.cart) return;
    setCart((prev: any) => ({
      ...data.cart,
      restaurantId: data.cart?.restaurantId ?? prev?.restaurantId ?? null
    }));
  }

  async function patchQty(it: { id: string; qty: number }, next: number) {
    if (next < 0 || next > 10) return;
    setUpdatingId(it.id);
    try {
      const data = await updateFoodCartItem(String(it.id), next, (cart as any)?.restaurantId);
      mergeCart(data);
    } finally {
      setUpdatingId(null);
    }
  }

  useEffect(() => {
    // Always sync with real Food MCP cart on open.
    (async () => {
      try {
        const remote = await fetchFoodCart();
        if (remote)
          setCart((prev: any) => ({
            ...(remote as any),
            restaurantId: (remote as any)?.restaurantId ?? prev?.restaurantId ?? null
          }));
      } catch {
        // ignore
      }
    })();
  }, [setCart]);

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Review Your Order</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.close}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.70)" />
            </Pressable>
          </View>

          {items.length ? (
            items.map((it) => (
              <RowItem
                key={it.id}
                title={it.title}
                subtitle="Food delivery"
                qtyNum={it.qty}
                price={`₹${Math.round(it.price * it.qty)}`}
                busy={updatingId === it.id}
                onMinus={() => patchQty(it, it.qty - 1)}
                onPlus={() => patchQty(it, it.qty + 1)}
                onRemove={async () => {
                  setUpdatingId(it.id);
                  try {
                    const data = await updateFoodCartItem(String(it.id), 0, (cart as any)?.restaurantId);
                    mergeCart(data);
                  } finally {
                    setUpdatingId(null);
                  }
                }}
              />
            ))
          ) : (
            <GlassCard style={[styles.itemRow, { justifyContent: "center" }]} intensity={18}>
              <Text style={styles.itemTitle}>Your cart is empty</Text>
            </GlassCard>
          )}

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
              <Text style={[styles.tVal, { color: "rgba(46,233,166,0.85)" }]}>FREE</Text>
            </View>
            <View style={styles.sep} />
            <View style={styles.totalRow}>
              <Text style={styles.tKey}>Total</Text>
              <Text style={[styles.tVal, { fontWeight: "800" }]}>₹{summary.total}</Text>
            </View>
          </GlassCard>

          <View style={styles.notice}>
            <LinearGradient
              colors={["rgba(120,10,10,0.55)", "rgba(120,10,10,0.22)"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.noticeHead}>
              <Ionicons name="cash" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={styles.noticeTitle}>CASH ON DELIVERY NOTICE</Text>
            </View>
            <Text style={styles.noticeText}>
              Please ensure you have the exact change available. Our delivery partner will not
              be able to carry large amounts of cash for security reasons.
            </Text>
          </View>

          <View style={{ height: 18 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  sheetWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,10,10,0.82)",
    padding: 14,
    overflow: "hidden"
  },
  handle: {
    alignSelf: "center",
    width: 52,
    height: 4,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 10
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  title: { color: "rgba(255,255,255,0.82)", fontSize: 16 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  itemRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  qtyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    paddingHorizontal: 2,
    height: 34
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  qtyVal: { minWidth: 20, textAlign: "center", color: "rgba(0,0,0,0.85)", fontWeight: "900", fontSize: 12 },
  thumb: { width: 44, height: 44, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
  itemTitle: { color: "rgba(255,255,255,0.86)", fontSize: 14 },
  itemSub: { marginTop: 6, color: "rgba(255,255,255,0.45)", fontSize: 12 },
  right: { alignItems: "flex-end", gap: 8 },
  qty: { color: "rgba(255,255,255,0.50)", fontSize: 12 },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  price: { color: theme.colors.accent, fontSize: 14, fontWeight: "800" },
  totals: { marginTop: 12, padding: 14, borderRadius: 22 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  tKey: { color: "rgba(255,255,255,0.60)", fontSize: 13 },
  tVal: { color: "rgba(255,255,255,0.70)", fontSize: 13 },
  sep: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 8 },
  notice: {
    marginTop: 12,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,80,80,0.18)",
    overflow: "hidden"
  },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  noticeTitle: { color: "rgba(255,255,255,0.80)", fontSize: 12, letterSpacing: 1.2, fontWeight: "800" },
  noticeText: { marginTop: 10, color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 16 }
});

