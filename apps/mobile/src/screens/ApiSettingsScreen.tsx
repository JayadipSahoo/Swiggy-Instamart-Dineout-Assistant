import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { theme } from "../theme";
import { getApiBaseUrl, setApiBaseUrl } from "../lib/storage";
import { healthCheck } from "../lib/api";
import { useNavigation } from "@react-navigation/native";

function sanitizeUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}

export function ApiSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "ok"; text: string } | { kind: "err"; text: string }
  >({ kind: "idle" });

  useEffect(() => {
    (async () => {
      const current = await getApiBaseUrl();
      setValue(current ?? "");
    })();
  }, []);

  const canSave = useMemo(() => sanitizeUrl(value).length > 0, [value]);

  async function onTest() {
    setBusy(true);
    setStatus({ kind: "idle" });
    try {
      const base = sanitizeUrl(value);
      if (!base) throw new Error("Paste your ngrok HTTPS URL first");
      await setApiBaseUrl(base);
      const res = await healthCheck();
      setStatus({ kind: "ok", text: res.service ? `Connected: ${res.service}` : "Connected" });
    } catch (e) {
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const base = sanitizeUrl(value);
    await setApiBaseUrl(base);
    navigation.goBack();
  }

  return (
    <ScreenBg>
      <View style={[styles.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>API Settings</Text>
            <Text style={styles.sub}>Paste your ngrok HTTPS URL (points to port 8787)</Text>
          </View>
          <Pressable onPress={() => navigation.goBack()} style={styles.close}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
          </Pressable>
        </View>

        <GlassCard style={styles.card} intensity={18}>
          <Text style={styles.label}>API Base URL</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="https://xxxxxx.ngrok-free.app"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />

          {status.kind !== "idle" ? (
            <View style={[styles.status, status.kind === "ok" ? styles.ok : styles.err]}>
              <Text style={styles.statusText}>{status.text}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onTest}
              disabled={!canSave || busy}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                (!canSave || busy) && { opacity: 0.5 },
                pressed && { transform: [{ translateY: 1 }] }
              ]}
            >
              <Text style={styles.btnText}>{busy ? "Testing..." : "Test"}</Text>
            </Pressable>

            <Pressable
              onPress={onSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSolid,
                !canSave && { opacity: 0.5 },
                pressed && { transform: [{ translateY: 1 }] }
              ]}
            >
              <Text style={styles.btnTextDark}>Save</Text>
            </Pressable>
          </View>
        </GlassCard>

        <GlassCard style={styles.tipCard} intensity={14}>
          <Text style={styles.tipTitle}>Where do I get this URL?</Text>
          <Text style={styles.tipText}>
            Run: <Text style={styles.mono}>ngrok http 8787</Text>{"\n"}
            Copy the HTTPS “Forwarding” URL and paste it above.
          </Text>
        </GlassCard>
      </View>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 18, gap: 14 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { color: theme.colors.text, fontSize: 20 },
  sub: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 16 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center"
  },
  card: { padding: 16, borderRadius: 22 },
  label: { color: "rgba(255,255,255,0.70)", fontSize: 12, marginBottom: 10 },
  input: {
    height: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.35)",
    color: theme.colors.text
  },
  status: { marginTop: 12, padding: 12, borderRadius: 18, borderWidth: 1 },
  ok: { borderColor: "rgba(46,233,166,0.35)", backgroundColor: "rgba(46,233,166,0.08)" },
  err: { borderColor: "rgba(255,77,109,0.35)", backgroundColor: "rgba(255,77,109,0.08)" },
  statusText: { color: theme.colors.text, fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginTop: 14 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  btnGhost: { borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.04)" },
  btnSolid: { borderColor: "rgba(255,138,42,0.35)", backgroundColor: theme.colors.accent },
  btnText: { color: theme.colors.text, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  btnTextDark: { color: "rgba(0,0,0,0.9)", fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  tipCard: { padding: 16, borderRadius: 22 },
  tipTitle: { color: "rgba(255,255,255,0.80)", fontSize: 14, marginBottom: 8 },
  tipText: { color: "rgba(255,255,255,0.60)", fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: "monospace", color: "rgba(255,255,255,0.80)" }
});

