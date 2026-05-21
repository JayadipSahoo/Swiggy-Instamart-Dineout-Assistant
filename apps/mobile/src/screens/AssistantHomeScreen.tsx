import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenBg } from "../components/ScreenBg";
import { GlassCard } from "../components/GlassCard";
import { theme } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { addInstamartToCart, sendChat } from "../lib/api";
import type { AssistantCard, CookFlow } from "../lib/assistant";
import { useNavigation } from "@react-navigation/native";
import { useCart } from "../state/CartContext";
import { AppLocationBar } from "../components/AppLocationBar";
import { getApiBaseUrl } from "../lib/storage";

const INTRO_LINES = [
  "Hi. I’m your assistant — think Jarvis, but for food, groceries, and bookings.",
  "Hello. I’m your smart assistant. Tell me what you’re craving and your budget.",
  "Welcome back. I can recommend, add to cart, and guide you through checkout safely.",
  "Hi. Ask me for something like: “I have ₹150, what can I eat?”",
  "Hey. I’m online and ready — what should we order today?"
];

function pickIntro() {
  return INTRO_LINES[Math.floor(Math.random() * INTRO_LINES.length)];
}

/** Fallback when Gemini headline is unavailable: first few words only. */
function naiveShortHeroTitle(q: string) {
  const w = q.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  return w.join(" ");
}

export function AssistantHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { setCart } = useCart();
  const inputRef = useRef<TextInput>(null);
  const hadAssistantSessionRef = useRef(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(true);
  const [assistantText, setAssistantText] = useState(pickIntro());
  const [cards, setCards] = useState<AssistantCard[]>([]);
  const [cookFlow, setCookFlow] = useState<CookFlow | null>(null);
  const [ingredientChecked, setIngredientChecked] = useState<Record<string, boolean>>({});
  const [pickedSpins, setPickedSpins] = useState<Record<string, true>>({});
  const [kbVisible, setKbVisible] = useState(false);
  const [lastQuery, setLastQuery] = useState<string>("");
  /** From server `queryHeadline` — Gemini summary of the user's ask */
  const [heroHeadline, setHeroHeadline] = useState("");

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  /** Any active assistant “session” beyond the idle hero — show floating AI when collapsed */
  const hasAssistantSession = (cards?.length ?? 0) > 0 || !!cookFlow;

  const displayQuery = useMemo(() => {
    const q = lastQuery.trim();
    if (q) return q;
    if (cookFlow?.recipeTitle) return cookFlow.recipeTitle;
    return "";
  }, [lastQuery, cookFlow]);

  const showCurrentQueryHero = hasAssistantSession || displayQuery.length > 0;

  const heroTitleText = useMemo(() => {
    const gh = heroHeadline.trim();
    if (gh) return gh;
    const naive = naiveShortHeroTitle(displayQuery);
    return naive || "Your request";
  }, [heroHeadline, displayQuery]);

  const cookPickStats = useMemo(() => {
    if (cookFlow?.phase !== "pick_products") return null;
    const groups = cookFlow.productGroups;
    let productCount = 0;
    let sectionsWithHits = 0;
    for (const g of groups) {
      const n = g.cards?.length ?? 0;
      if (n > 0) sectionsWithHits += 1;
      productCount += n;
    }
    return { productCount, sectionsWithHits, sectionCount: groups.length };
  }, [cookFlow]);

  useEffect(() => {
    // New line each time screen mounts.
    setAssistantText(pickIntro());
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (hasAssistantSession && !hadAssistantSessionRef.current) {
      setComposerExpanded(false);
      Keyboard.dismiss();
    }
    if (!hasAssistantSession) setComposerExpanded(true);
    hadAssistantSessionRef.current = hasAssistantSession;
  }, [hasAssistantSession]);

  useEffect(() => {
    if (!showCurrentQueryHero) setHeroHeadline("");
  }, [showCurrentQueryHero]);

  useEffect(() => {
    if (cookFlow?.phase === "ingredient_checklist") {
      const m: Record<string, boolean> = {};
      for (const it of cookFlow.items) {
        m[it.id] = it.defaultSelected !== false;
      }
      setIngredientChecked(m);
    } else if (cookFlow?.phase === "pick_products") {
      setPickedSpins({});
    } else if (!cookFlow) {
      setIngredientChecked({});
      setPickedSpins({});
    }
  }, [cookFlow]);

  function expandComposerFocusKeyboard() {
    setComposerExpanded(true);
    requestAnimationFrame(() =>
      setTimeout(() => inputRef.current?.focus(), Platform.OS === "ios" ? 80 : 50)
    );
  }

  function collapseComposerDismissKeyboard() {
    Keyboard.dismiss();
    setComposerExpanded(false);
  }

  async function onSend() {
    if (!canSend) return;
    setBusy(true);
    const msg = input.trim();
    setInput("");
    try {
      const res = await sendChat(msg);
      setAssistantText(res.reply);
      setCards(res.cards ?? []);
      if ("cookFlow" in res) setCookFlow((res.cookFlow as CookFlow | null | undefined) ?? null);
      setLastQuery(((res as any)?.debug?.query as string) || msg);
      if (typeof res.queryHeadline === "string" && res.queryHeadline.trim()) setHeroHeadline(res.queryHeadline.trim());
      if (res.cart) setCart(res.cart);
      for (const a of res.actions ?? []) {
        if (a.type === "navigate" && a.payload?.tab) navigation.navigate(a.payload.tab);
      }
      const hasOutcome = ((res.cards?.length ?? 0) > 0 || !!res.cookFlow) && res.ok;
      if (hasOutcome) {
        Keyboard.dismiss();
        setComposerExpanded(false);
      }
    } catch (e: any) {
      Alert.alert("Assistant", e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmCookIngredients() {
    if (cookFlow?.phase !== "ingredient_checklist") return;
    const selectedIds = Object.entries(ingredientChecked)
      .filter(([, on]) => on)
      .map(([id]) => id.trim())
      .filter(Boolean);
    if (!selectedIds.length) {
      Alert.alert("Ingredients", "Select at least one ingredient to shop for.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendChat("", {
        type: "cook_confirm_ingredients",
        sessionId: cookFlow.sessionId,
        selectedIds
      });
      setAssistantText(res.reply);
      setCards(res.cards ?? []);
      if ("cookFlow" in res) setCookFlow((res.cookFlow as CookFlow | null | undefined) ?? null);
      if (res.cart) setCart(res.cart);
      if (typeof res.queryHeadline === "string" && res.queryHeadline.trim()) setHeroHeadline(res.queryHeadline.trim());
      if (res.cookFlow?.phase === "pick_products") {
        setLastQuery((prev) => (prev.trim() ? prev : cookFlow.recipeTitle));
        Keyboard.dismiss();
        setComposerExpanded(false);
      }
    } catch (e: any) {
      Alert.alert("Could not search", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  }

  function togglePickSpin(spinId: string) {
    setPickedSpins((prev) => {
      const next = { ...prev };
      if (next[spinId]) delete next[spinId];
      else next[spinId] = true;
      return next;
    });
  }

  async function onAddCookPicksToCart() {
    if (cookFlow?.phase !== "pick_products") return;
    const keys = Object.keys(pickedSpins);
    if (!keys.length) {
      Alert.alert("Instamart", "Tap products to select what you want in your cart.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendChat("", {
        type: "cook_add_selected_to_cart",
        sessionId: cookFlow.sessionId,
        items: keys.map((spinId) => ({ spinId, quantity: 1 }))
      });
      setAssistantText(res.reply);
      setCards(res.cards ?? []);
      if ("cookFlow" in res) setCookFlow((res.cookFlow as CookFlow | null | undefined) ?? null);
      if (typeof res.queryHeadline === "string" && res.queryHeadline.trim()) setHeroHeadline(res.queryHeadline.trim());
      if (res.cart) setCart(res.cart);
      if (!res.cookFlow) Keyboard.dismiss();
    } catch (e: any) {
      Alert.alert("Could not add", e?.message ?? "Check server and address.");
    } finally {
      setBusy(false);
    }
  }

  function quickAsk(text: string) {
    setInput(text);
    // Optional: auto-send if you want
    // void onSend();
  }

  return (
    <ScreenBg>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom:
                Math.max(insets.bottom, 10) +
                (kbVisible ? 12 : 78) +
                (composerExpanded || !hasAssistantSession ? (kbVisible ? 76 : 98) : 72)
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Location header (reverted) */}
            <AppLocationBar rightSlot={<ConnectionBadge />} />

            {/* Hero — idle greeting vs active search */}
            <View style={styles.hero}>
              <Text style={styles.hi}>Hi jayadip</Text>
              {showCurrentQueryHero ? (
                <>
                  <Text style={styles.heroTitle}>{heroTitleText}</Text>
                  {displayQuery.trim() &&
                  displayQuery.trim().toLowerCase() !== heroTitleText.trim().toLowerCase() ? (
                    <Text style={styles.heroQuery} numberOfLines={6}>
                      {displayQuery.trim()}
                    </Text>
                  ) : null}
                  <Text style={styles.heroSub}>{assistantText}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.heroTitle}>Where should we start?</Text>
                  <Text style={styles.heroSub}>{assistantText}</Text>
                </>
              )}
            </View>

            {/* Quick actions */}
            {!kbVisible && cards.length === 0 && !cookFlow ? (
              <View style={styles.quickList}>
                <Pressable
                  onPress={() => quickAsk("I have ₹150, what can I eat nearby?")}
                  style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                >
                  <Ionicons name="flame" size={16} color={theme.colors.accent} />
                  <Text style={styles.quickText}>Find food under ₹150</Text>
                </Pressable>

                <Pressable
                  onPress={() => quickAsk("I want to cook butter chicken")}
                  style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                >
                  <Ionicons name="fast-food" size={16} color={theme.colors.accent} />
                  <Text style={styles.quickText}>Cook butter chicken</Text>
                </Pressable>

                <Pressable
                  onPress={() => quickAsk("Find me a good dineout place and book a table for 2 tonight.")}
                  style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                >
                  <Ionicons name="calendar" size={16} color={theme.colors.accent} />
                  <Text style={styles.quickText}>Book a table</Text>
                </Pressable>

                <Pressable
                  onPress={() => quickAsk("Suggest something healthy and spicy.")}
                  style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                >
                  <Ionicons name="create" size={16} color={theme.colors.accent} />
                  <Text style={styles.quickText}>Write anything</Text>
                </Pressable>
              </View>
            ) : null}

            {cookFlow?.phase === "ingredient_checklist" ? (
              <View style={styles.cookBlock}>
                <LinearGradient
                  colors={["rgba(255,138,42,0.45)", "rgba(37, 185, 0, 0.35)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.cookStepPill}
                >
                  <Text style={styles.cookStepNo}>1</Text>
                  <Text style={styles.cookStepLbl}>Ingredient list</Text>
                </LinearGradient>
                <Text style={styles.cookHead}>{cookFlow.recipeTitle}</Text>
                <Text style={styles.cookHint}>
                  Untick what you already have. We'll fetch Instamart options for everything else.
                </Text>
                <GlassCard style={styles.checklistCard} intensity={18}>
                  {cookFlow.items.map((it, ix) => {
                    const on = ingredientChecked[it.id] ?? false;
                    return (
                      <Pressable
                        key={it.id}
                        onPress={() =>
                          setIngredientChecked((prev) => ({
                            ...prev,
                            [it.id]: !(prev[it.id] ?? false)
                          }))
                        }
                        style={({ pressed }) => [
                          styles.checkRow,
                          ix < cookFlow.items.length - 1 && styles.checkRowBorder,
                          pressed && styles.pressed
                        ]}
                      >
                        <View style={[styles.checkboxRing, on && styles.checkboxRingOn]}>
                          {on ? <Ionicons name="checkmark" size={14} color="rgba(0,0,0,0.88)" /> : null}
                        </View>
                        <Text style={styles.checkLabel}>{it.label}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    disabled={busy}
                    onPress={() => void onConfirmCookIngredients()}
                    style={({ pressed }) => [
                      styles.cookPrimaryBtn,
                      busy && { opacity: 0.55 },
                      pressed && !busy && styles.pressed
                    ]}
                  >
                    <LinearGradient
                      colors={[theme.colors.accent2, theme.colors.accent]}
                      style={styles.cookPrimaryGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Ionicons name="storefront-outline" size={18} color="rgba(0,0,0,0.88)" />
                      <Text style={styles.cookPrimaryBtnText}>Search Instamart</Text>
                    </LinearGradient>
                  </Pressable>
                </GlassCard>
              </View>
            ) : null}

            {cookFlow?.phase === "pick_products" ? (
              <View style={styles.cookBlock}>
                <LinearGradient
                  colors={["rgba(46,233,166,0.42)", "rgba(255,138,42,0.35)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.cookStepPill}
                >
                  <Text style={styles.cookStepNo}>2</Text>
                  <Text style={styles.cookStepLbl}>Choose packs</Text>
                </LinearGradient>
                <Text style={styles.cookHead}>{cookFlow.recipeTitle}</Text>
                <Text style={styles.cookHint}>
                  Tap cards to select. Selected items are outlined; add them all at once below.
                </Text>
                {cookPickStats ? (
                  <View style={styles.cookSummaryBar}>
                    <Ionicons name="nutrition-outline" size={16} color={theme.colors.accent2} />
                    <Text style={styles.cookSummaryBarText}>
                      {cookPickStats.productCount} products found · {cookPickStats.sectionsWithHits} /
                      {cookPickStats.sectionCount} sections
                    </Text>
                  </View>
                ) : null}

                {cookFlow.productGroups.map((g) => (
                  <View key={g.ingredientId} style={styles.ingredientSection}>
                    <LinearGradient
                      colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0.02)"]}
                      style={styles.ingredientSectionHeader}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.ingredientSectionTitle}>{g.title}</Text>
                      <View
                        style={[
                          styles.hitBadge,
                          g.cards.length ? styles.hitBadgeOk : styles.hitBadgeEmpty
                        ]}
                      >
                        <Text style={styles.hitBadgeText}>
                          {g.cards.length ? `${g.cards.length} options` : "No hits"}
                        </Text>
                      </View>
                    </LinearGradient>

                    {g.cards.length ? (
                      g.cards.map((c, idx) => {
                        const sid = String(c.spinId ?? c.id);
                        const selected = !!pickedSpins[sid];
                        return (
                          <Pressable
                            key={`${g.ingredientId}:${sid}:${idx}`}
                            onPress={() => togglePickSpin(sid)}
                            style={({ pressed }) => [pressed && styles.pressed]}
                          >
                            <GlassCard
                              style={[styles.pickProductCard, selected && styles.pickProductCardSelected]}
                              intensity={selected ? 20 : 16}
                            >
                              <View style={styles.pickRow}>
                                <View style={[styles.pickTick, selected && styles.pickTickOn]}>
                                  {selected ? (
                                    <Ionicons name="checkmark" size={12} color="rgba(0,0,0,0.85)" />
                                  ) : (
                                    <View style={styles.pickTickDot} />
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.pickProductTitle}>{c.title}</Text>
                                  {c.subtitle ? <Text style={styles.pickProductSub}>{c.subtitle}</Text> : null}
                                  {c.priceText ? (
                                    <Text style={styles.pickProductPrice}>{c.priceText}</Text>
                                  ) : (
                                    <Text style={styles.pickProductMeta}>Instamart</Text>
                                  )}
                                </View>
                              </View>
                            </GlassCard>
                          </Pressable>
                        );
                      })
                    ) : (
                      <GlassCard style={styles.emptySectionCard} intensity={12}>
                        <Ionicons name="bag-remove-outline" size={28} color="rgba(255,255,255,0.35)" />
                        <Text style={styles.emptySectionTitle}>Nothing surfaced for "{g.title}"</Text>
                        <Text style={styles.emptySectionSub}>
                          The app retried simpler searches automatically. Availability varies by city — skip this section
                          or try a grocery search from the composer.
                        </Text>
                      </GlassCard>
                    )}
                  </View>
                ))}
                <Pressable
                  disabled={busy || !Object.keys(pickedSpins).length}
                  onPress={() => void onAddCookPicksToCart()}
                  style={({ pressed }) => [
                    !Object.keys(pickedSpins).length || busy ? { opacity: 0.45 } : {},
                    pressed && !!Object.keys(pickedSpins).length && !busy && styles.pressed
                  ]}
                >
                  <LinearGradient
                    colors={
                      Object.keys(pickedSpins).length ? [theme.colors.neon2, "#1bc495"] : ["rgba(255,255,255,0.12)", "rgba(255,255,255,0.08)"]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.cookCartBtn}
                  >
                    <Ionicons
                      name="cart"
                      size={18}
                      color={Object.keys(pickedSpins).length ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.38)"}
                    />
                    <Text
                      style={[
                        styles.cookCartBtnText,
                        !Object.keys(pickedSpins).length && styles.cookCartBtnTextMuted
                      ]}
                    >
                      Add {Object.keys(pickedSpins).length || "…"} selected to Instamart cart
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            ) : null}

            {/* Results (food / plain Instamart) */}
            {cards.length ? (
              <View style={styles.cardsWrap}>
                <Text style={styles.sectionTitle}>Results</Text>
                {cards.map((c) => (
                  <Pressable
                    key={`${c.kind}:${c.id}`}
                    onPress={async () => {
                      if (c.kind === "grocery") {
                        try {
                          const spinId = c.spinId ?? c.id;
                          await addInstamartToCart(spinId, 1);
                          Alert.alert(
                            "Instamart",
                            `Added 1× “${c.title}” to your Instamart cart. Open the Swiggy Instamart app to review checkout.`
                          );
                        } catch (e: any) {
                          Alert.alert("Could not add", e?.message ?? "Check API server and active address.");
                        }
                        return;
                      }
                      if (c.kind !== "restaurant") return;
                      navigation.navigate(
                        "Explore",
                        {
                          mode: "menu",
                          restaurantId: c.id,
                          restaurantName: c.title,
                          query: lastQuery || c.title,
                          // Helps force param update on already-mounted tab screens
                          _ts: Date.now()
                        } as any
                      );
                    }}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <GlassCard style={styles.suggestCard} intensity={14}>
                      <Text style={styles.suggestTitle}>{c.title}</Text>
                      {c.subtitle ? <Text style={styles.suggestSub}>{c.subtitle}</Text> : null}
                      {c.priceText ? <Text style={styles.suggestPrice}>{c.priceText}</Text> : null}
                      {c.metaText ? <Text style={styles.suggestMeta}>{c.metaText}</Text> : null}
                      {c.kind === "restaurant" ? <Text style={styles.tapHint}>Tap to view menu</Text> : null}
                      {c.kind === "grocery" ? (
                        <Text style={styles.tapHint}>Tap to add 1 to Instamart cart</Text>
                      ) : null}
                    </GlassCard>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom composer dock — hides when scrolling results; use floating Meta-style AI */}
          {composerExpanded ? (
            <View
              style={[
                styles.dock,
                {
                  paddingBottom: kbVisible
                    ? Math.max(insets.bottom, 8)
                    : Math.max(insets.bottom, 10) + 78
                }
              ]}
            >
              <View style={styles.dockInnerOpaque}>
                {hasAssistantSession ? (
                  <Pressable
                    accessibilityLabel="Collapse assistant input"
                    onPress={collapseComposerDismissKeyboard}
                    style={({ pressed }) => [styles.dockShrinkBtn, pressed && styles.pressed]}
                    hitSlop={10}
                  >
                    <Ionicons name="chevron-down-circle" size={30} color="rgba(255,255,255,0.72)" />
                  </Pressable>
                ) : null}
                <TextInput
                  ref={inputRef}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask Assistant"
                  placeholderTextColor="rgba(255,255,255,0.42)"
                  style={styles.dockInput}
                  autoCorrect
                  autoCapitalize="sentences"
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={onSend}
                  blurOnSubmit={false}
                />

                <View style={styles.dockRight}>
                  <Pressable
                    style={({ pressed }) => [styles.dockIcon, pressed && styles.pressed]}
                    onPress={() => setAssistantText("Voice is next. For now, type your request.")}
                  >
                    <Ionicons name="mic" size={20} color="rgba(255,255,255,0.72)" />
                  </Pressable>
                  <Pressable
                    disabled={!canSend}
                    onPress={onSend}
                    style={({ pressed }) => [
                      styles.sendRound,
                      !canSend && { opacity: 0.5 },
                      pressed && canSend && styles.pressed
                    ]}
                  >
                    <Ionicons name="send" size={18} color="rgba(0,0,0,0.92)" />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {!composerExpanded && hasAssistantSession ? (
            <Pressable
              accessibilityLabel="Open assistant"
              style={[
                styles.aiFabOuter,
                {
                  bottom:
                    Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 10) +
                    (kbVisible ? 8 : 66)
                }
              ]}
              onPress={expandComposerFocusKeyboard}
            >
              <LinearGradient
                colors={[theme.colors.neon, "#c4b5fd", theme.colors.accent]}
                locations={[0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.aiFabGradient}
              >
                <Ionicons name="sparkles" size={26} color="rgba(255,255,255,0.96)" />
              </LinearGradient>
            </Pressable>
          ) : null}

        </View>
      </KeyboardAvoidingView>
    </ScreenBg>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 18
  },
  hero: {
    marginTop: 34,
    gap: 6
  },
  hi: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 18
  },
  heroTitle: {
    color: "rgba(255,255,255,0.94)",
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.4
  },
  heroQuery: {
    marginTop: 8,
    color: "rgba(255,255,255,0.88)",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    maxWidth: 340
  },
  heroSub: {
    marginTop: 10,
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 340
  },
  quickList: {
    marginTop: 18,
    gap: 12
  },
  quickPill: {
    height: 54,
    borderRadius: 26,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  quickText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14
  },
  sectionTitle: { marginTop: 18, color: "rgba(255,255,255,0.70)", fontSize: 12, letterSpacing: 0.4 },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10
  },
  dockInner: {
    borderRadius: 26,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dockInnerOpaque: {
    borderRadius: 26,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)"
  },
  dockShrinkBtn: {
    justifyContent: "center",
    alignItems: "center"
  },
  aiFabOuter: {
    position: "absolute",
    left: 18,
    zIndex: 50,
    borderRadius: 28,
    overflow: "hidden",
    elevation: 12,
    shadowColor: theme.colors.neon,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
  aiFabGradient: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)"
  },
  dockIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  dockInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 8,
    paddingVertical: 0,
    color: theme.colors.text,
    fontSize: 14
  },
  dockRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  sendRound: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  pressed: {
    transform: [{ translateY: 1 }]
  },
  // Keep old styles for future suggestion cards (used when server returns cards)
  cardsWrap: { marginTop: 14, gap: 12 },
  suggestCard: { padding: 14, borderRadius: 22 },
  suggestTitle: { color: "rgba(255,255,255,0.90)", fontSize: 14 },
  suggestSub: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 12 },
  suggestPrice: { marginTop: 8, color: theme.colors.accent, fontSize: 13, fontWeight: "800" },
  suggestMeta: { marginTop: 6, color: "rgba(255,255,255,0.50)", fontSize: 11, lineHeight: 15 },
  tapHint: { marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 11 },
  suggestBtn: {
    marginTop: 12,
    height: 40,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  suggestBtnText: { color: "rgba(0,0,0,0.90)", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  cookBlock: {
    marginTop: 12,
    gap: 10
  },
  cookStepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 4
  },
  cookStepNo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.42)",
    textAlign: "center",
    lineHeight: 26,
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "900"
  },
  cookStepLbl: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase"
  },
  cookHead: {
    marginTop: 4,
    color: "rgba(255,255,255,0.94)",
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.35
  },
  cookHint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8
  },
  cookSummaryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(46,233,166,0.28)"
  },
  cookSummaryBarText: {
    flex: 1,
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600"
  },
  checklistCard: {
    padding: 4,
    borderRadius: 24,
    overflow: "hidden"
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12
  },
  checkRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)"
  },
  checkboxRing: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center"
  },
  checkboxRingOn: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent
  },
  checkLabel: {
    flex: 1,
    color: "rgba(255,255,255,0.90)",
    fontSize: 15,
    letterSpacing: 0.15
  },
  cookPrimaryBtn: {
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 22,
    overflow: "hidden"
  },
  cookPrimaryGradient: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  cookPrimaryBtnText: {
    color: "rgba(0,0,0,0.88)",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3
  },
  ingredientSection: {
    marginBottom: 14,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.02)"
  },
  ingredientSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14
  },
  ingredientSectionTitle: {
    flex: 1,
    color: "rgba(255,255,255,0.92)",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2
  },
  hitBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20
  },
  hitBadgeOk: {
    backgroundColor: "rgba(46,233,166,0.18)",
    borderWidth: 1,
    borderColor: "rgba(46,233,166,0.42)"
  },
  hitBadgeEmpty: {
    backgroundColor: "rgba(255,77,109,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.28)"
  },
  hitBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.35
  },
  pickProductCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    marginTop: 12,
    borderRadius: 20
  },
  pickProductCardSelected: {
    borderWidth: 2,
    borderColor: theme.colors.neon2,
    backgroundColor: "rgba(46,233,166,0.06)"
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12
  },
  pickTick: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  pickTickOn: {
    borderColor: theme.colors.neon2,
    backgroundColor: theme.colors.neon2
  },
  pickTickDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)"
  },
  pickProductTitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "700"
  },
  pickProductSub: { marginTop: 6, color: "rgba(255,255,255,0.52)", fontSize: 12, lineHeight: 16 },
  pickProductPrice: { marginTop: 10, color: theme.colors.accent2, fontSize: 14, fontWeight: "900" },
  pickProductMeta: {
    marginTop: 10,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    letterSpacing: 0.35
  },
  emptySectionCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 4,
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 10
  },
  emptySectionTitle: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center"
  },
  emptySectionSub: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  cookCartBtn: {
    marginTop: 8,
    height: 56,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  cookCartBtnText: {
    color: "rgba(0,0,0,0.88)",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.25
  },
  cookCartBtnTextMuted: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 14
  }
});

