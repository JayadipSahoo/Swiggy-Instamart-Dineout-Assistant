import React from "react";
import { BlurView } from "expo-blur";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../theme";

export function GlassCard({
  children,
  style,
  intensity = 22
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    ...theme.shadow.card
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)"
  }
});

