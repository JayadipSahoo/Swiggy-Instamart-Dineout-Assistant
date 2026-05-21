import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { theme } from "../theme";
import { IconButton } from "../components/IconButton";
import { GlowCard } from "../components/GlowCard";
import { SettingsSheet } from "../components/SettingsSheet";
import { getApiBaseUrl } from "../lib/storage";
import { sendChat } from "../lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: number;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bubbleColors(role: ChatMessage["role"]) {
  if (role === "user") {
    return {
      bg: "rgba(124,77,255,0.18)",
      border: "rgba(124,77,255,0.38)"
    };
  }
  if (role === "assistant") {
    return {
      bg: "rgba(46,233,166,0.12)",
      border: "rgba(46,233,166,0.30)"
    };
  }
  return {
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.12)"
  };
}

export function ChatScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiHint, setApiHint] = useState<string>("Not connected");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "system",
      text:
        "Hi. Set your ngrok API URL in Settings, then ask me for food under a budget or to build an Instamart recipe cart.",
      createdAt: Date.now()
    }
  ]);

  const listRef = useRef<FlatList<ChatMessage> | null>(null);

  useEffect(() => {
    (async () => {
      const base = await getApiBaseUrl();
      setApiHint(base ? base.replace(/^https?:\/\//, "") : "Not connected");
    })();
  }, []);

  const canSend = useMemo(() => text.trim().length > 0 && !sending, [text, sending]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;

    setText("");
    setSending(true);

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: content,
      createdAt: Date.now()
    };
    setMessages((m) => [...m, userMsg]);

    try {
      const res = await sendChat(content);
      const reply = res.reply ?? "No reply.";
      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        text: reply,
        createdAt: Date.now()
      };
      setMessages((m) => [...m, botMsg]);
    } catch (e) {
      const errText = e instanceof Error ? e.message : "Request failed";
      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        text: `Connection error: ${errText}\n\nOpen Settings and paste your ngrok URL.`,
        createdAt: Date.now()
      };
      setMessages((m) => [...m, botMsg]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  function openSettings() {
    setSettingsOpen(true);
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>Swiggy Assistant</Text>
          <Text style={styles.sub}>API: {apiHint}</Text>
        </View>

        <View style={styles.topActions}>
          <IconButton label="Settings" onPress={openSettings} />
        </View>
      </View>

      <GlowCard style={styles.feedCard}>
        <FlatList
          ref={(r) => {
            listRef.current = r;
          }}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.feedContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const colors = bubbleColors(item.role);
            const align = item.role === "user" ? "flex-end" : "flex-start";
            return (
              <View style={[styles.row, { justifyContent: align }]}>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: colors.bg,
                      borderColor: colors.border
                    }
                  ]}
                >
                  <Text style={styles.bubbleText}>{item.text}</Text>
                </View>
              </View>
            );
          }}
        />
      </GlowCard>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <View style={styles.composer}>
          <Pressable
            style={({ pressed }) => [styles.mic, pressed && styles.pressed]}
            onPress={() => {
              setMessages((m) => [
                ...m,
                {
                  id: uid(),
                  role: "assistant",
                  text: "Voice is coming next (Expo Audio + speech-to-text). For now, type your request.",
                  createdAt: Date.now()
                }
              ]);
            }}
          >
            <Text style={styles.micLabel}>Mic</Text>
          </Pressable>

          <View style={styles.inputWrap}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask: “I have ₹150, what can I eat?”"
              placeholderTextColor={theme.colors.textFaint}
              style={styles.input}
              multiline
              autoCorrect
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.send,
              (!canSend || sending) && styles.sendDisabled,
              pressed && canSend && styles.pressed
            ]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Text style={styles.sendLabel}>{sending ? "..." : "Send"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(baseUrl) => {
          setApiHint(baseUrl.replace(/^https?:\/\//, "") || "Not connected");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md
  },
  brand: {
    color: theme.colors.text,
    fontSize: 20,
    letterSpacing: 0.6
  },
  sub: {
    marginTop: 6,
    color: theme.colors.textFaint,
    fontSize: 12
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  feedCard: {
    flex: 1,
    padding: 0,
    overflow: "hidden"
  },
  feedContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm
  },
  row: {
    flexDirection: "row"
  },
  bubble: {
    maxWidth: "92%",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  bubbleText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm
  },
  mic: {
    height: 52,
    width: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  micLabel: {
    color: theme.colors.text,
    fontSize: 13,
    letterSpacing: 0.2
  },
  inputWrap: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  input: {
    minHeight: 52,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18
  },
  send: {
    height: 52,
    width: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(124,77,255,0.40)",
    backgroundColor: "rgba(124,77,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.neon,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 }
  },
  sendDisabled: {
    opacity: 0.5
  },
  sendLabel: {
    color: theme.colors.text,
    fontSize: 14,
    letterSpacing: 0.2
  },
  pressed: {
    transform: [{ translateY: 1 }]
  }
});

