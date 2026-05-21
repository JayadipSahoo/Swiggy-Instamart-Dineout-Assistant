import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { theme } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { AppLocationBar } from "../components/AppLocationBar";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <ScreenBg>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10, paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <AppLocationBar rightSlot={<ConnectionBadge />} />
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        <GlassCard style={styles.card}>
          <Text style={styles.text}>Your account & preferences (next).</Text>
          <Text style={[styles.text, { marginTop: 10, opacity: 0.8 }]}>
            Your carts and tracking are available from the Carts tab.
          </Text>
        </GlassCard>

        <GlassCard style={styles.cartCard} intensity={18}>
          <Text style={styles.cartTitle}>Carts & Tracking</Text>
          <Text style={styles.cartSub}>
            Open the Carts tab to view Swiggy Food cart, Instamart cart, and tracking.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Carts")}
            style={({ pressed }) => [styles.cartCta, pressed && { transform: [{ translateY: 1 }] }]}
          >
            <Text style={styles.cartCtaText}>Go to Carts</Text>
            <Ionicons name="arrow-forward" size={18} color="rgba(0,0,0,0.90)" />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("Tracking")}
            style={({ pressed }) => [styles.trackBtn, pressed && { transform: [{ translateY: 1 }] }]}
          >
            <Ionicons name="navigate" size={16} color="rgba(255,255,255,0.78)" />
            <Text style={styles.trackText}>Track orders</Text>
          </Pressable>
        </GlassCard>
      </ScrollView>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  title: { color: theme.colors.text, fontSize: 20 },
  card: { marginTop: 16, padding: 16, borderRadius: 22 },
  text: { color: "rgba(255,255,255,0.70)", lineHeight: 18 },
  cartCard: { marginTop: 14, padding: 16, borderRadius: 22 },
  cartTitle: { color: "rgba(255,255,255,0.86)", fontSize: 16, fontWeight: "700" },
  cartSub: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
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
  cartCtaText: { color: "rgba(0,0,0,0.90)", fontWeight: "900" },
  trackBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  trackText: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 }
});

