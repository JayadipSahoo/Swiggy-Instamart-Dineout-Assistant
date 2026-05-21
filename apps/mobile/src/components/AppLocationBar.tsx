import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { useUiLocation } from "../state/LocationContext";
import { LocationPickerSheet } from "./LocationPickerSheet";

/** Tappable delivery address row + shared location sheet (reuse on Assistant, Explore, Orders, Profile). */
export function AppLocationBar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const { location } = useUiLocation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.row}>
        <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.locRow, pressed && styles.pressed]}>
          <Ionicons name="location-sharp" size={16} color={theme.colors.accent} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.locTitle}>{location.title}</Text>
            <Text style={styles.locSub} numberOfLines={2}>
              {location.subtitle}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.45)" />
        </Pressable>
        {rightSlot != null ? <View style={styles.right}>{rightSlot}</View> : null}
      </View>
      <LocationPickerSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  right: { flexShrink: 0 },
  locRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0
  },
  pressed: {
    opacity: 0.88
  },
  locTitle: {
    color: theme.colors.accent,
    fontSize: 12,
    letterSpacing: 0.3
  },
  locSub: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    marginTop: 2,
    maxWidth: 260
  }
});
