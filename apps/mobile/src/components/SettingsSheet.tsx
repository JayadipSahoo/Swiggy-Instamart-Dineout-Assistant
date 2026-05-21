import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../theme";
import { getApiBaseUrl, setApiBaseUrl } from "../lib/storage";
import { healthCheck } from "../lib/api";
import { IconButton } from "./IconButton";
import { GlowCard } from "./GlowCard";

function sanitizeUrl(input: string): string {
  let s = input.trim();
  s = s.replace(/\/+$/, "");
  return s;
}

export function SettingsSheet({
  visible,
  onClose,
  onSaved
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: (baseUrl: string) => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "ok"; text: string } | { kind: "err"; text: string }
  >({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const existing = await getApiBaseUrl();
      setValue(existing ?? "");
      setStatus({ kind: "idle" });
    })();
  }, [visible]);

  const canSave = useMemo(() => sanitizeUrl(value).length > 0, [value]);

  async function onTest() {
    setBusy(true);
    setStatus({ kind: "idle" });
    try {
      const baseUrl = sanitizeUrl(value);
      if (!baseUrl) throw new Error("Enter an API base URL first");
      await setApiBaseUrl(baseUrl);
      const res = await healthCheck();
      setStatus({
        kind: "ok",
        text: res.service ? `Connected: ${res.service}` : "Connected"
      });
    } catch (e) {
      setStatus({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const baseUrl = sanitizeUrl(value);
    await setApiBaseUrl(baseUrl);
    onSaved?.(baseUrl);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <GlowCard style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Connection</Text>
            <IconButton label="Close" onPress={onClose} />
          </View>

          <Text style={styles.label}>API Base URL (ngrok)</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="https://xxxxxx.ngrok-free.app"
            placeholderTextColor={theme.colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />

          <Text style={styles.hint}>
            Tip: start your API on port 8787, run ngrok, then paste the HTTPS URL here.
          </Text>

          {status.kind !== "idle" ? (
            <View
              style={[
                styles.status,
                status.kind === "ok" ? styles.statusOk : styles.statusErr
              ]}
            >
              <Text style={styles.statusText}>{status.text}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <IconButton
              label={busy ? "Testing..." : "Test"}
              onPress={onTest}
              disabled={busy || !canSave}
              style={styles.actionBtn}
            />
            <IconButton
              label="Save"
              onPress={onSave}
              disabled={!canSave}
              style={[styles.actionBtn, styles.saveBtn]}
            />
          </View>
        </GlowCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing.lg
  },
  sheet: {
    backgroundColor: "rgba(11,16,32,0.92)"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    letterSpacing: 0.4
  },
  label: {
    color: theme.colors.textDim,
    fontSize: 12,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs
  },
  input: {
    height: 48,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: theme.colors.text
  },
  hint: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textFaint,
    fontSize: 12,
    lineHeight: 16
  },
  status: {
    marginTop: theme.spacing.sm,
    padding: 12,
    borderRadius: theme.radius.lg,
    borderWidth: 1
  },
  statusOk: {
    borderColor: "rgba(46,233,166,0.35)",
    backgroundColor: "rgba(46,233,166,0.08)"
  },
  statusErr: {
    borderColor: "rgba(255,77,109,0.35)",
    backgroundColor: "rgba(255,77,109,0.08)"
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 13
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md
  },
  actionBtn: {
    flex: 1
  },
  saveBtn: {
    borderColor: "rgba(124,77,255,0.45)",
    shadowColor: theme.colors.neon,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  }
});

