import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiBaseUrl } from "../lib/storage";
import { healthCheck } from "../lib/api";
import { theme } from "../theme";
import { useNavigation } from "@react-navigation/native";

type Status =
  | { kind: "unset" }
  | { kind: "checking" }
  | { kind: "ok"; label: string }
  | { kind: "err"; label: string };

export function ConnectionBadge({
  onPress
}: {
  onPress?: () => void;
}) {
  const navigation = useNavigation<any>();
  const [status, setStatus] = useState<Status>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function runOnce() {
      try {
        const base = await getApiBaseUrl();
        if (!base) {
          if (!cancelled) setStatus({ kind: "unset" });
          return;
        }
        if (!cancelled) setStatus({ kind: "checking" });
        const res = await healthCheck();
        if (!cancelled) setStatus({ kind: "ok", label: res.service ?? "Connected" });
      } catch (_e) {
        if (!cancelled) setStatus({ kind: "err", label: "Offline" });
      }
    }

    runOnce();
    const t = setInterval(runOnce, 12000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const dot = useMemo(() => {
    if (status.kind === "ok") return "rgba(46,233,166,0.95)";
    if (status.kind === "checking") return "rgba(255,255,255,0.55)";
    return "rgba(255,77,109,0.95)";
  }, [status.kind]);

  const text =
    status.kind === "ok"
      ? ""
      : status.kind === "checking"
        ? ""
        : status.kind === "unset"
          ? "Set API"
          : "Offline";

  return (
    <Pressable
      onPress={onPress ?? (() => navigation.navigate("ApiSettings"))}
      style={({ pressed }) => [styles.badge, pressed && { transform: [{ translateY: 1 }] }]}
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={styles.txt}>{text}</Text>
      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.55)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  txt: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12
  }
});

