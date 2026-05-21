import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { AppLocationBar } from "../components/AppLocationBar";
import { theme } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { useCart } from "../state/CartContext";
import type { TabsParamList } from "../navigation/TabsNavigator";
import {
  addFoodMenuItemToCart,
  fetchNearbyFoodRestaurants,
  fetchRestaurantMenuItems,
  type FoodMenuItem,
  type NearbyRestaurantCard
} from "../lib/api";

type ExploreNav = CompositeNavigationProp<
  BottomTabNavigationProp<TabsParamList, "Explore">,
  NativeStackNavigationProp<RootStackParamList>
>;

export function ExploreScreen() {
  const navigation = useNavigation<ExploreNav>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { cart, setCart } = useCart();
  const [adding, setAdding] = useState<string | null>(null);
  const rawParams = (route?.params ?? {}) as any;
  const mode =
    rawParams.mode ??
    (typeof rawParams.restaurantId === "string" && typeof rawParams.query === "string" ? "menu" : undefined);
  const restaurantId = mode === "menu" ? String(rawParams.restaurantId ?? "") : null;
  const restaurantName = mode === "menu" ? String(rawParams.restaurantName ?? "") : null;
  const query = mode === "menu" ? String(rawParams.query ?? "") : null;
  const [menuItems, setMenuItems] = useState<FoodMenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<NearbyRestaurantCard[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);

  useEffect(() => {
    if (mode !== "menu" || !restaurantId || !query) return;
    let cancelled = false;
    (async () => {
      setLoadingMenu(true);
      setMenuError(null);
      try {
        const items = await fetchRestaurantMenuItems(restaurantId, query);
        if (!cancelled) setMenuItems(items);
      } catch (e: any) {
        if (!cancelled) setMenuError(e?.message ?? "Failed to load menu");
      } finally {
        if (!cancelled) setLoadingMenu(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, restaurantId, query]);

  useFocusEffect(
    useCallback(() => {
      if (mode === "menu") return;
      let cancelled = false;
      (async () => {
        setLoadingNearby(true);
        try {
          const list = await fetchNearbyFoodRestaurants("popular");
          if (!cancelled) setNearby(list);
        } catch {
          if (!cancelled) setNearby([]);
        } finally {
          if (!cancelled) setLoadingNearby(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [mode])
  );

  const inCartQty = useMemo(() => {
    const m = new Map<string, number>();
    const rid = (cart as any)?.restaurantId;
    if (!restaurantId || !rid || String(rid) !== String(restaurantId)) return m;
    for (const row of cart.items ?? []) {
      m.set(String(row.id), Number(row.qty) || 0);
    }
    return m;
  }, [cart, restaurantId]);

  const cartCountText = useMemo(() => {
    const n = cart?.summary?.count ?? 0;
    return `${n} ITEM${n === 1 ? "" : "S"} IN CART`;
  }, [cart?.summary?.count]);

  const headerExtras = (
    <View style={styles.rightTop}>
      <ConnectionBadge />
      <View style={styles.avatar} />
    </View>
  );

  function navToRestaurant(r: NearbyRestaurantCard) {
    navigation.navigate(
      "Explore",
      {
        mode: "menu",
        restaurantId: r.id,
        restaurantName: r.name,
        query: "popular",
        _ts: Date.now()
      } as any
    );
  }

  return (
    <ScreenBg>
      {mode === "menu" && restaurantId && query ? (
        <View style={{ flex: 1, paddingTop: insets.top + 10 }}>
          <View style={{ paddingHorizontal: 18 }}>
            <Pressable onPress={() => navigation.navigate("Explore")} style={styles.backExplore}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
              <Text style={styles.backExploreText}>Explore</Text>
            </Pressable>
            <AppLocationBar rightSlot={headerExtras} />
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, { paddingTop: 14, paddingBottom: 120 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.tag}>MENU</Text>
            <GlassCard style={styles.heroCard} intensity={18}>
              <Text style={styles.heroText}>{restaurantName ?? "Restaurant"}</Text>
              <Text style={[styles.heroSubLine, { marginTop: 8 }]}>Showing matches for: {query}</Text>
              {loadingMenu ? <Text style={[styles.heroSubLine, { marginTop: 8 }]}>Loading…</Text> : null}
              {menuError ? <Text style={[styles.heroSubLine, { marginTop: 8 }]}>{menuError}</Text> : null}
              {!loadingMenu && !menuError && menuItems.length === 0 ? (
                <Text style={[styles.heroSubLine, { marginTop: 8 }]}>No items found for this query.</Text>
              ) : null}
            </GlassCard>

            {menuItems.map((it) => {
              const qty = inCartQty.get(it.id) ?? 0;
              const inCart = qty > 0;
              const busyLabel = adding === it.id ? "ADDING…" : inCart ? `ADDED (${qty})` : "ADD";
              return (
                <GlassCard key={it.id} style={styles.dishRow} intensity={18}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dishName}>{it.name}</Text>
                    <Text style={styles.price}>{typeof it.price === "number" ? `₹${it.price}` : " "}</Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      setAdding(it.id);
                      try {
                        const data = await addFoodMenuItemToCart(restaurantId, it.id, it.name);
                        if (data?.cart) setCart({ ...(data.cart as any), restaurantId } as any);
                      } catch (e: any) {
                        Alert.alert("Cart", e?.message ?? "Could not add item");
                      } finally {
                        setAdding(null);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.addBtn,
                      inCart ? styles.addBtnInCart : null,
                      pressed && { transform: [{ translateY: 1 }] }
                    ]}
                  >
                    <Text style={[styles.addText, inCart && styles.addTextInCart]}>{busyLabel}</Text>
                    <Ionicons
                      name={inCart ? "checkmark-circle" : "add"}
                      size={16}
                      color={inCart ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.9)"}
                    />
                  </Pressable>
                </GlassCard>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
          showsVerticalScrollIndicator={false}
        >
          <AppLocationBar rightSlot={headerExtras} />

          <GlassCard style={styles.assistantPromo} intensity={16}>
            <View style={styles.assistantPromoTop}>
              <Ionicons name="sparkles" size={22} color={theme.colors.accent} />
              <Text style={styles.assistantPromoTitle}>Recipe + Instamart flow lives here</Text>
            </View>
            <Text style={styles.assistantPromoBody}>
              Use the sparkles tab for the real assistant: food delivery, groceries, or cooking — with an ingredient
              checklist, grouped Instamart matches, and add-to-cart when you are cooking at home.
            </Text>
            <Pressable
              onPress={() => navigation.navigate("Assistant")}
              style={({ pressed }) => [styles.assistantPromoBtn, pressed && { transform: [{ translateY: 1 }] }]}
            >
              <Text style={styles.assistantPromoBtnText}>Go to Assistant</Text>
              <Ionicons name="arrow-forward" size={18} color="rgba(0,0,0,0.9)" />
            </Pressable>
          </GlassCard>

          <Text style={styles.tag}>NEARBY RESTAURANTS</Text>

          <GlassCard style={[styles.heroCard, { marginTop: 10 }]} intensity={16}>
            <Text style={[styles.heroText, { fontSize: 16, lineHeight: 22 }]}>
              Restaurants for your saved delivery address. Tap any card to browse the menu and order.
            </Text>
          </GlassCard>

          {loadingNearby ? <Text style={styles.heroSubLine}>Loading restaurants…</Text> : null}
          {!loadingNearby && nearby.length === 0 ? (
            <Text style={styles.heroSubLine}>
              No restaurants returned. Confirm your address via the picker above, then open the Assistant tab to search — or
              try again shortly.
            </Text>
          ) : null}

          {nearby.map((r) => (
            <Pressable key={`${r.id}:${r.name}`} onPress={() => navToRestaurant(r)} style={({ pressed }) => [pressed && styles.pressed]}>
              <GlassCard style={styles.restNearCard} intensity={18}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.restNearName}>{r.name}</Text>
                  {r.subtitle ? <Text style={styles.restNearSub}>{r.subtitle}</Text> : null}
                  {r.metaText ? <Text style={styles.restNearMeta}>{r.metaText}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.48)" />
              </GlassCard>
            </Pressable>
          ))}

          <Pressable
            onPress={() => navigation.navigate("Checkout")}
            style={({ pressed }) => [styles.cartBar, pressed && { transform: [{ translateY: 1 }] }]}
          >
            <View style={styles.cartLeft}>
              <Ionicons name="bag-handle" size={18} color="rgba(0,0,0,0.9)" />
              <Text style={styles.cartText}>{cartCountText}</Text>
            </View>
            <View style={styles.cartRight}>
              <Text style={styles.cartText}>VIEW CART</Text>
              <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.9)" />
            </View>
          </Pressable>

          <View style={{ height: 110 + insets.bottom }} />
        </ScrollView>
      )}
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18 },
  rightTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backExplore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
    alignSelf: "flex-start"
  },
  backExploreText: { color: theme.colors.accent, fontSize: 13, fontWeight: "700" },
  pressed: {
    opacity: 0.9
  },
  heroSubLine: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    marginTop: 2
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,138,42,0.65)",
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  assistantPromo: {
    marginTop: 16,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 200, 0.22)"
  },
  assistantPromoTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  assistantPromoTitle: {
    flex: 1,
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  assistantPromoBody: {
    marginTop: 10,
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    lineHeight: 17
  },
  assistantPromoBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  assistantPromoBtnText: { color: "rgba(0,0,0,0.9)", fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  tag: {
    marginTop: 18,
    color: theme.colors.accent,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "600"
  },
  heroCard: { marginTop: 10, padding: 16, borderRadius: 22 },
  heroText: { color: "rgba(255,255,255,0.86)", fontSize: 20, lineHeight: 28 },
  restNearCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  restNearName: { color: "rgba(255,255,255,0.92)", fontSize: 15, fontWeight: "700" },
  restNearSub: { color: "rgba(255,255,255,0.62)", fontSize: 12, marginTop: 6 },
  restNearMeta: { color: "rgba(46,233,166,0.85)", fontSize: 11, marginTop: 6, letterSpacing: 0.5 },
  dishRow: {
    marginTop: 12,
    padding: 14,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  dishName: { color: "rgba(255,255,255,0.84)", fontSize: 13, lineHeight: 18 },
  price: { marginTop: 6, color: theme.colors.accent, fontSize: 13, fontWeight: "700" },
  addBtn: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.accent,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  addBtnInCart: {
    backgroundColor: "rgba(28,164,126,0.95)"
  },
  addText: { color: "rgba(0,0,0,0.9)", fontSize: 11, letterSpacing: 0.6, fontWeight: "700" },
  addTextInCart: { color: "rgba(255,255,255,0.95)" },
  cartBar: {
    marginTop: 16,
    height: 54,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  cartLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cartRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  cartText: { color: "rgba(0,0,0,0.90)", fontSize: 12, fontWeight: "800", letterSpacing: 0.6 }
});
