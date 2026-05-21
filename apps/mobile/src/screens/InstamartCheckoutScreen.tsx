import React, { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { AppLocationBar } from "../components/AppLocationBar";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { theme } from "../theme";
import { fetchInstamartCheckoutSummary, placeInstamartOrder } from "../lib/api";

export function InstamartCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const load = useCallback(async () => {
    const s = await fetchInstamartCheckoutSummary();
    setSummary(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          await load();
        } catch (e: any) {
          if (!cancelled) Alert.alert("Instamart", e?.message ?? "Failed to load checkout");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const items = summary?.cart?.items ?? [];
  const total = summary?.cart?.summary?.total ?? 0;
  const paymentMethods: string[] = Array.isArray(summary?.paymentMethods) ? summary.paymentMethods : [];
  const canPlace = Boolean(summary?.canPlaceOrder);

  return (
    <ScreenBg>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10, paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.accent} />}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
          <Text style={styles.backText}>Carts</Text>
        </Pressable>

        <AppLocationBar rightSlot={<ConnectionBadge />} />

        <GlassCard style={styles.card} intensity={18}>
          <Text style={styles.title}>Instamart checkout</Text>
          <Text style={styles.sub}>
            {loading ? "Loading…" : items.length ? `${items.length} line(s) • Total ₹${total}` : "Cart is empty"}
          </Text>
          {paymentMethods.length ? (
            <Text style={[styles.sub, { marginTop: 10 }]}>Payment methods: {paymentMethods.join(", ")}</Text>
          ) : (
            <Text style={[styles.sub, { marginTop: 10 }]}>Payment methods will be fetched from Instamart cart.</Text>
          )}
        </GlassCard>

        {items.map((it: any) => (
          <GlassCard key={it.spinId} style={styles.row} intensity={18}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {it.title || it.spinId}
              </Text>
              <Text style={styles.rowSub}>
                Qty: {it.qty}
                {typeof it.price === "number" ? ` • ₹${Math.round(it.price * it.qty)}` : ""}
              </Text>
            </View>
          </GlassCard>
        ))}

        <Pressable
          disabled={!items.length || busy || !canPlace}
          onPress={async () => {
            setBusy(true);
            try {
              const preferred = paymentMethods[0];
              const res = await placeInstamartOrder(true, preferred);
              Alert.alert("Instamart", res?.message ?? "Instamart order placed successfully");
              navigation.goBack();
            } catch (e: any) {
              Alert.alert("Instamart", e?.message ?? "Could not place order");
            } finally {
              setBusy(false);
            }
          }}
          style={({ pressed }) => [
            styles.cta,
            (!items.length || busy || !canPlace) ? { opacity: 0.45 } : undefined,
            pressed && items.length && !busy && canPlace ? { transform: [{ translateY: 1 }] } : undefined
          ]}
        >
          <Text style={styles.ctaText}>
            {busy
              ? "PLACING…"
              : !items.length
                ? "CART IS EMPTY"
                : canPlace
                  ? "PLACE ORDER"
                  : "USE SWIGGY APP TO CHECKOUT"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.90)" />
        </Pressable>

        {!canPlace && items.length ? (
          <Text style={[styles.sub, { marginTop: 12 }]}>
            Instamart MCP checkout is restricted for higher totals. You can still edit cart here, then complete payment in
            the Swiggy app.
          </Text>
        ) : null}
      </ScrollView>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginBottom: 6 },
  backText: { color: theme.colors.accent, fontSize: 13, fontWeight: "700" },
  card: { marginTop: 12, padding: 16, borderRadius: 22 },
  title: { color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "800" },
  sub: { marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 16 },
  row: { marginTop: 12, padding: 14, borderRadius: 22 },
  rowTitle: { color: "rgba(255,255,255,0.86)", fontSize: 13, fontWeight: "700" },
  rowSub: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  cta: {
    marginTop: 16,
    height: 54,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  ctaText: { color: "rgba(0,0,0,0.90)", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 }
});

