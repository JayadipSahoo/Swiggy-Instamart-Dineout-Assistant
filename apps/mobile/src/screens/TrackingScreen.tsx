import React, { useCallback, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { theme } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { AppLocationBar } from "../components/AppLocationBar";
import {
  fetchFoodOrders,
  trackFoodOrder,
  type FoodOrderSummary,
  type FoodTrackPayload
} from "../lib/api";

function TimelineItem({
  title,
  time,
  desc,
  active
}: {
  title: string;
  time: string;
  desc: string;
  active?: boolean;
}) {
  return (
    <View style={styles.tItem}>
      <View style={styles.tLeft}>
        <View style={[styles.dot, active && styles.dotActive]} />
        <View style={styles.line} />
      </View>
      <View style={styles.tCardWrap}>
        {active ? (
          <GlassCard style={styles.activeCard} intensity={18}>
            <Text style={styles.activeTitle}>{title}</Text>
            <Text style={styles.activeDesc}>{desc}</Text>
            {time ? <Text style={styles.timeStamp}>{time}</Text> : null}
          </GlassCard>
        ) : (
          <View style={styles.mutedRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mutedTitle}>{title}</Text>
              <Text style={styles.mutedDesc}>{desc}</Text>
            </View>
            {time ? <Text style={styles.mutedTime}>{time}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

export function TrackingScreen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<FoodOrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [track, setTrack] = useState<FoodTrackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summaryFallback, setSummaryFallback] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const load = useCallback(async (preferOrderId?: string | null) => {
    setErr(null);
    const { orders: list, summaryText } = await fetchFoodOrders(10);
    setOrders(list);
    setSummaryFallback(summaryText);

    const seed = preferOrderId !== undefined ? preferOrderId : selectedIdRef.current;
    const pickId =
      seed && list.some((o) => o.orderId === seed) ? seed : list[0]?.orderId ?? null;
    setSelectedId(pickId);

    if (pickId) {
      const t = await trackFoodOrder(pickId);
      setTrack(t);
    } else {
      try {
        const t = await trackFoodOrder();
        setTrack(t);
      } catch {
        setTrack(null);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(selectedIdRef.current);
    } catch (e: any) {
      setErr(e?.message ?? "Could not load orders");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setErr(null);
        try {
          await load();
        } catch (e: any) {
          if (!cancelled) setErr(e?.message ?? "Could not load orders");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const timeline = track?.timeline?.length
    ? track.timeline
    : [
        {
          title: track?.status || "No active tracking",
          desc:
            track?.message ||
            summaryFallback?.slice(0, 280) ||
            (orders.length === 0
              ? "No in-progress Food orders for this address. Place an order or match the same saved address as in the Swiggy app."
              : "Tracking details will appear when Swiggy returns them."),
          time: "",
          active: true
        }
      ];

  const headerEta = track?.etaText || orders.find((o) => o.orderId === selectedId)?.etaText || null;
  const riderName = track?.riderName;
  const riderPhone = track?.riderPhone;

  return (
    <ScreenBg>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
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

        {err ? (
          <GlassCard style={styles.errCard} intensity={18}>
            <Text style={styles.errText}>{err}</Text>
            <Pressable onPress={refresh} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </GlassCard>
        ) : null}

        {loading && !refreshing ? (
          <Text style={styles.hint}>Loading your orders…</Text>
        ) : null}

        {orders.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orderChips}>
            {orders.map((o) => {
              const sel = o.orderId === selectedId;
              return (
                <Pressable
                  key={o.orderId}
                  onPress={async () => {
                    try {
                      await load(o.orderId);
                    } catch (e: any) {
                      setErr(e?.message ?? "Track failed");
                    }
                  }}
                  style={[styles.chip, sel && styles.chipSel]}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextSel]} numberOfLines={1}>
                    {o.restaurantName || "Order"} · {o.status}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <GlassCard style={styles.mapCard} intensity={16}>
          <View style={styles.mapBg} />
          <View style={styles.trackPill}>
            <View style={styles.trackDot} />
            <Text style={styles.trackText}>{orders.length ? "Live status" : "Orders"}</Text>
          </View>
          <View style={styles.bikeBadge}>
            <Ionicons name="bicycle" size={18} color={theme.colors.accent} />
          </View>
          <Text style={styles.eta}>{headerEta || (orders.length ? "Status updating…" : "No active orders")}</Text>

          <View style={styles.homeBtn}>
            <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.80)" />
          </View>
          <Pressable onPress={refresh} style={StyleSheet.absoluteFill} accessibilityLabel="Refresh tracking" />
        </GlassCard>

        {(riderName || riderPhone) && orders.length > 0 ? (
          <GlassCard style={styles.driverCard} intensity={18}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{riderName || "Delivery partner"}</Text>
              <Text style={styles.driverMeta}>{riderPhone ? `Tap call to connect` : "Details from Swiggy"}</Text>
            </View>
            {riderPhone ? (
              <Pressable
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${riderPhone.replace(/\s/g, "")}`)}
              >
                <Ionicons name="call" size={18} color="rgba(0,0,0,0.9)" />
              </Pressable>
            ) : null}
          </GlassCard>
        ) : null}

        <Text style={styles.section}>Order status</Text>

        <View style={styles.timeline}>
          {timeline.map((step, i) => (
            <TimelineItem
              key={`${step.title}-${i}`}
              title={step.title}
              desc={step.desc}
              time={step.time}
              active={Boolean(step.active)}
            />
          ))}
        </View>

        {selectedId ? (
          <View style={styles.orderRow}>
            <Text style={styles.orderId}>Order {track?.orderId || selectedId}</Text>
            <Text style={styles.viewDetails}>Swipe down to refresh</Text>
          </View>
        ) : null}

        {orders[0]?.items?.length ? (
          <View style={styles.itemsBlock}>
            <Text style={styles.itemsTitle}>Items</Text>
            {(orders.find((o) => o.orderId === selectedId) ?? orders[0]).items.map((it) => (
              <Text key={it.id} style={styles.itemLine}>
                {it.qty}× {it.name}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={{ height: 110 + insets.bottom }} />
      </ScrollView>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18 },
  rightTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "rgba(255,138,42,0.65)",
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  hint: { marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  errCard: { marginTop: 12, padding: 12, borderRadius: 20 },
  errText: { color: "rgba(255,180,180,0.95)", fontSize: 12, lineHeight: 16 },
  retryBtn: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
  retryText: { color: theme.colors.accent, fontSize: 12, fontWeight: "700" },
  orderChips: { marginTop: 12, gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginRight: 8,
    maxWidth: 260
  },
  chipSel: { borderColor: "rgba(255,138,42,0.35)", backgroundColor: "rgba(255,138,42,0.12)" },
  chipText: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "600" },
  chipTextSel: { color: "rgba(255,255,255,0.92)" },
  mapCard: { marginTop: 16, height: 250, borderRadius: 26 },
  mapBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  trackPill: {
    position: "absolute",
    right: 14,
    top: 14,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.35)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  trackDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: theme.colors.accent },
  trackText: { color: "rgba(255,255,255,0.78)", fontSize: 12 },
  bikeBadge: {
    position: "absolute",
    top: 62,
    left: "50%",
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,138,42,0.35)",
    alignItems: "center",
    justifyContent: "center"
  },
  eta: {
    position: "absolute",
    top: 104,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    paddingHorizontal: 16
  },
  homeBtn: {
    position: "absolute",
    left: 14,
    top: 94,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center"
  },
  driverCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  driverName: { color: "rgba(255,255,255,0.88)", fontSize: 14 },
  driverMeta: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  section: { marginTop: 18, color: "rgba(255,255,255,0.72)", fontSize: 13 },
  timeline: { marginTop: 12 },
  tItem: { flexDirection: "row", gap: 12, marginBottom: 12 },
  tLeft: { width: 18, alignItems: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.40)"
  },
  dotActive: { backgroundColor: theme.colors.accent },
  line: { flex: 1, width: 2, marginTop: 6, backgroundColor: "rgba(255,255,255,0.10)" },
  tCardWrap: { flex: 1 },
  activeCard: { padding: 14, borderRadius: 22, borderColor: "rgba(255,138,42,0.30)" },
  activeTitle: { color: theme.colors.accent, fontSize: 16, fontWeight: "700" },
  activeDesc: { marginTop: 8, color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 16 },
  timeStamp: { marginTop: 10, color: "rgba(255,255,255,0.40)", fontSize: 10 },
  mutedRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  mutedTitle: { color: "rgba(255,255,255,0.62)", fontSize: 12 },
  mutedDesc: { marginTop: 6, color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 15 },
  mutedTime: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 },
  orderRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between" },
  orderId: { color: "rgba(255,255,255,0.70)", fontSize: 13 },
  viewDetails: { color: theme.colors.accent, fontSize: 12 },
  itemsBlock: { marginTop: 14 },
  itemsTitle: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  itemLine: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 }
});
