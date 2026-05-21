import React, { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { theme } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { AppLocationBar } from "../components/AppLocationBar";
import { useCart } from "../state/CartContext";
import {
  fetchFoodCart,
  fetchInstamartCart,
  updateFoodCartItem,
  updateInstamartCartItem,
  type InstamartCartPayload
} from "../lib/api";

export function CartsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { cart, setCart } = useCart();
  const [syncingFood, setSyncingFood] = useState(false);
  const [syncingIm, setSyncingIm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [instamartCart, setInstamartCart] = useState<InstamartCartPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busySpin, setBusySpin] = useState<string | null>(null);

  function mergeRemoteFood(remote: any) {
    if (!remote) return;
    setCart({
      ...(remote as any),
      restaurantId: remote?.restaurantId ?? (cart as any)?.restaurantId ?? null
    } as any);
  }

  const syncAll = useCallback(async () => {
    setSyncingFood(true);
    setSyncingIm(true);
    try {
      const [food, im] = await Promise.all([fetchFoodCart(), fetchInstamartCart()]);
      mergeRemoteFood(food);
      setInstamartCart(im);
    } finally {
      setSyncingFood(false);
      setSyncingIm(false);
    }
  }, [cart, setCart]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          await syncAll();
        } catch {
          if (!cancelled) {
            // ignore
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [syncAll])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncAll();
    } finally {
      setRefreshing(false);
    }
  }, [syncAll]);

  const foodCount = cart?.summary?.count ?? 0;
  const foodTotal = cart?.summary?.total ?? 0;

  return (
    <ScreenBg>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10, paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.accent} />}
      >
        <AppLocationBar
          rightSlot={
            <View style={styles.rightTop}>
              <ConnectionBadge />
              <View style={styles.avatar} />
            </View>
          }
        />

        <View style={styles.header}>
          <Text style={styles.title}>Carts</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={() => navigation.navigate("Tracking")}
              style={({ pressed }) => [styles.syncBtn, pressed && { transform: [{ translateY: 1 }] }]}
            >
              <Ionicons name="navigate" size={16} color="rgba(255,255,255,0.80)" />
              <Text style={styles.syncText}>Track</Text>
            </Pressable>
            <Pressable
              onPress={refresh}
              style={({ pressed }) => [styles.syncBtn, pressed && { transform: [{ translateY: 1 }] }]}
            >
              <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.80)" />
              <Text style={styles.syncText}>Sync all</Text>
            </Pressable>
          </View>
        </View>

        <GlassCard style={styles.cartCard} intensity={18}>
          <View style={styles.cartTop}>
            <View>
              <Text style={styles.cartTitle}>Swiggy Food cart</Text>
              <Text style={styles.cartSub}>
                {syncingFood ? "Syncing…" : foodCount ? `${foodCount} item(s) • ₹${foodTotal}` : "No items yet"}
              </Text>
            </View>
          </View>

          {cart.items.map((it) => (
            <View key={it.id} style={styles.cartRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cartRowTitle} numberOfLines={2}>
                  {it.title}
                </Text>
                <Text style={styles.cartRowMeta}>₹{Math.round(it.price * it.qty)}</Text>
              </View>
              <View style={styles.cartQtyBar}>
                <Pressable
                  onPress={async () => {
                    setBusyId(it.id);
                    try {
                      const data = await updateFoodCartItem(String(it.id), it.qty - 1, (cart as any)?.restaurantId);
                      mergeRemoteFood(data?.cart);
                    } catch (e: any) {
                      Alert.alert("Cart", e?.message ?? "Could not update cart");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  disabled={!!busyId}
                  style={styles.cartQtyHit}
                >
                  <Ionicons name="remove" size={14} color="rgba(0,0,0,0.85)" />
                </Pressable>
                <Text style={styles.cartQtyNum}>{busyId === it.id ? "…" : it.qty}</Text>
                <Pressable
                  onPress={async () => {
                    if (it.qty >= 10) return;
                    setBusyId(it.id);
                    try {
                      const data = await updateFoodCartItem(String(it.id), it.qty + 1, (cart as any)?.restaurantId);
                      mergeRemoteFood(data?.cart);
                    } catch (e: any) {
                      Alert.alert("Cart", e?.message ?? "Could not update cart");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  disabled={it.qty >= 10 || !!busyId}
                  style={styles.cartQtyHit}
                >
                  <Ionicons name="add" size={14} color="rgba(0,0,0,0.85)" />
                </Pressable>
              </View>
              <Pressable
                onPress={async () => {
                  setBusyId(it.id);
                  try {
                    const data = await updateFoodCartItem(String(it.id), 0, (cart as any)?.restaurantId);
                    mergeRemoteFood(data?.cart);
                  } catch (e: any) {
                    Alert.alert("Cart", e?.message ?? "Could not remove item");
                  } finally {
                    setBusyId(null);
                  }
                }}
                disabled={!!busyId}
                style={styles.cartTrash}
              >
                <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.55)" />
              </Pressable>
            </View>
          ))}

          <Pressable
            disabled={!foodCount}
            onPress={() => navigation.navigate("Checkout")}
            style={({ pressed }) => [
              styles.cartCta,
              !foodCount ? { opacity: 0.45 } : undefined,
              pressed && foodCount ? { transform: [{ translateY: 1 }] } : undefined
            ]}
          >
            <Text style={styles.cartCtaText}>{foodCount ? `Checkout • ₹${foodTotal}` : "Cart is empty"}</Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.90)" />
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.cartCard} intensity={18}>
          <View style={styles.cartTop}>
            <View>
              <Text style={styles.cartTitle}>Instamart cart</Text>
              <Text style={styles.cartSub}>
                {syncingIm
                  ? "Syncing…"
                  : instamartCart?.summary?.count
                    ? `${instamartCart.summary.count} item(s)`
                    : "No items yet"}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                setSyncingIm(true);
                try {
                  const im = await fetchInstamartCart();
                  setInstamartCart(im);
                } finally {
                  setSyncingIm(false);
                }
              }}
              style={({ pressed }) => [styles.syncBtn, pressed && { transform: [{ translateY: 1 }] }]}
            >
              <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.80)" />
              <Text style={styles.syncText}>Sync</Text>
            </Pressable>
          </View>

          {(instamartCart?.items ?? []).map((it) => (
            <View key={it.spinId} style={styles.cartRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cartRowTitle} numberOfLines={2}>
                  {it.title || it.spinId}
                </Text>
                <Text style={styles.cartRowMeta}>
                  {typeof it.price === "number" ? `₹${Math.round(it.price * it.qty)}` : `Qty: ${it.qty}`}
                </Text>
              </View>
              <View style={[styles.cartQtyBar, { backgroundColor: "rgba(0,0,0,0.28)" }]}>
                <Pressable
                  onPress={async () => {
                    setBusySpin(it.spinId);
                    try {
                      const nextQty = Math.max(0, it.qty - 1);
                      const updated = await updateInstamartCartItem(it.spinId, nextQty);
                      setInstamartCart(updated);
                    } catch (e: any) {
                      Alert.alert("Instamart", e?.message ?? "Could not update cart");
                    } finally {
                      setBusySpin(null);
                    }
                  }}
                  disabled={!!busySpin}
                  style={styles.cartQtyHit}
                >
                  <Ionicons name="remove" size={14} color="rgba(255,255,255,0.85)" />
                </Pressable>
                <Text style={[styles.cartQtyNum, { color: "rgba(255,255,255,0.85)" }]}>
                  {busySpin === it.spinId ? "…" : it.qty}
                </Text>
                <Pressable
                  onPress={async () => {
                    setBusySpin(it.spinId);
                    try {
                      const nextQty = Math.min(99, it.qty + 1);
                      const updated = await updateInstamartCartItem(it.spinId, nextQty);
                      setInstamartCart(updated);
                    } catch (e: any) {
                      Alert.alert("Instamart", e?.message ?? "Could not update cart");
                    } finally {
                      setBusySpin(null);
                    }
                  }}
                  disabled={!!busySpin}
                  style={styles.cartQtyHit}
                >
                  <Ionicons name="add" size={14} color="rgba(255,255,255,0.85)" />
                </Pressable>
              </View>
              <Pressable
                onPress={async () => {
                  setBusySpin(it.spinId);
                  try {
                    const updated = await updateInstamartCartItem(it.spinId, 0);
                    setInstamartCart(updated);
                  } catch (e: any) {
                    Alert.alert("Instamart", e?.message ?? "Could not remove item");
                  } finally {
                    setBusySpin(null);
                  }
                }}
                disabled={!!busySpin}
                style={styles.cartTrash}
              >
                <Ionicons name="trash-outline" size={16} color="rgba(255,255,255,0.55)" />
              </Pressable>
            </View>
          ))}
          <Pressable
            disabled={!(instamartCart?.summary?.count ?? 0)}
            onPress={() => navigation.navigate("InstamartCheckout")}
            style={({ pressed }) => [
              styles.cartCta,
              !(instamartCart?.summary?.count ?? 0) ? { opacity: 0.45 } : undefined,
              pressed && (instamartCart?.summary?.count ?? 0) ? { transform: [{ translateY: 1 }] } : undefined
            ]}
          >
            <Text style={styles.cartCtaText}>
              {(instamartCart?.summary?.count ?? 0)
                ? `Checkout • ₹${instamartCart?.summary?.total ?? 0}`
                : "Cart is empty"}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.90)" />
          </Pressable>
        </GlassCard>
      </ScrollView>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18 },
  rightTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,138,42,0.65)",
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  title: { color: theme.colors.text, fontSize: 20 },
  cartCard: { marginTop: 14, padding: 16, borderRadius: 22 },
  cartTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cartTitle: { color: "rgba(255,255,255,0.86)", fontSize: 16, fontWeight: "700" },
  cartSub: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  syncBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.35)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  syncText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" },
  cartRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  cartRowTitle: { color: "rgba(255,255,255,0.82)", fontSize: 13 },
  cartRowMeta: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  cartQtyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    height: 32,
    paddingHorizontal: 2
  },
  cartQtyHit: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  cartQtyNum: { minWidth: 18, textAlign: "center", fontWeight: "900", fontSize: 12, color: "rgba(0,0,0,0.85)" },
  cartTrash: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  cartCta: {
    marginTop: 14,
    height: 46,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cartCtaText: { color: "rgba(0,0,0,0.90)", fontWeight: "900" }
});

