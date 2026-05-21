import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";

export function ScreenBg({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[theme.colors.bg0, "#0D0F12", "#070708"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,138,42,0.22)", "rgba(255,138,42,0)", "rgba(0,0,0,0)"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.55 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg0
  }
});

