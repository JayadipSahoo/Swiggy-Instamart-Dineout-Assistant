import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { theme } from "../theme";

export function IconButton({
  label,
  onPress,
  disabled,
  style,
  accessibilityLabel
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
        style
      ]}
    >
      <Text style={styles.txt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 46,
    minWidth: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  btnPressed: {
    transform: [{ translateY: 1 }],
    backgroundColor: "rgba(255,255,255,0.10)"
  },
  btnDisabled: {
    opacity: 0.45
  },
  txt: {
    color: theme.colors.text,
    fontSize: 14,
    letterSpacing: 0.2
  }
});

