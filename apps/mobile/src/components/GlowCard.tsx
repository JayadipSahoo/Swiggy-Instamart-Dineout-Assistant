import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../theme";

export function GlowCard({
  style,
  children
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    padding: theme.spacing.md,
    shadowColor: theme.colors.neon,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  }
});

