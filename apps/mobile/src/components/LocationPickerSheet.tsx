import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { useUiLocation } from "../state/LocationContext";

export function LocationPickerSheet({
  visible,
  onClose
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { location, saved, selectSaved, saveCurrentAs, refresh } = useUiLocation();
  const [label, setLabel] = useState("Home");

  const canSave = useMemo(() => !!location.coords && label.trim().length > 0, [location.coords, label]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.wrap}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Choose location</Text>
            <Pressable onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.70)" />
            </Pressable>
          </View>

          <Pressable
            onPress={() => refresh()}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Ionicons name="locate" size={16} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Use current location</Text>
              <Text style={styles.rowSub}>{location.subtitle}</Text>
            </View>
            <Ionicons name="refresh" size={16} color="rgba(255,255,255,0.55)" />
          </Pressable>

          {saved.length ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.section}>Saved</Text>
              {saved.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={async () => {
                    await selectSaved(s.id);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Ionicons name="home" size={16} color={theme.colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{s.label}</Text>
                    <Text style={styles.rowSub}>{s.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.55)" />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 12 }}>
            <Text style={styles.section}>Save current as</Text>
            <View style={styles.saveRow}>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Home / Work"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />
              <Pressable
                disabled={!canSave}
                onPress={async () => {
                  await saveCurrentAs(label.trim());
                }}
                style={({ pressed }) => [
                  styles.saveBtn,
                  !canSave && { opacity: 0.5 },
                  pressed && canSave && styles.pressed
                ]}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14 },
  sheet: {
    borderRadius: 26,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)"
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "rgba(255,255,255,0.86)", fontSize: 16 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.90)"
  },
  section: { marginTop: 10, marginBottom: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  row: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.90)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  rowTitle: { color: "rgba(255,255,255,0.82)", fontSize: 13 },
  rowSub: { marginTop: 4, color: "rgba(255,255,255,0.50)", fontSize: 12 },
  saveRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.90)"
  },
  saveBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  saveBtnText: { color: "rgba(0,0,0,0.90)", fontWeight: "800" },
  pressed: { transform: [{ translateY: 1 }] }
});

