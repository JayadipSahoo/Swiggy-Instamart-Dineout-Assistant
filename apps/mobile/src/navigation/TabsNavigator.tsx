import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";
import { AssistantHomeScreen } from "../screens/AssistantHomeScreen";
import { ExploreScreen } from "../screens/ExploreScreen";
import { CartsScreen } from "../screens/CartsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type TabsParamList = {
  Assistant: undefined;
  Explore:
    | { mode: "menu"; restaurantId: string; restaurantName: string; query: string }
    | { mode: "widget"; widgetUrl: string }
    | undefined;
  Carts: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabsParamList>();

function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Opaque base so the tab bar feels solid */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.68)" }]} />
      <LinearGradient
        colors={["rgba(255,138,42,0.10)", "rgba(255,255,255,0.01)"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function TabsNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="Assistant"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: Math.max(insets.bottom, Platform.OS === "ios" ? 14 : 10)
          }
        ],
        tabBarIcon: ({ focused }) => {
          const color = focused ? theme.colors.accent : "rgba(255,255,255,0.55)";
          const size = 24;
          const icon =
            route.name === "Assistant"
              ? "sparkles"
              : route.name === "Explore"
                ? "compass"
                : route.name === "Carts"
                  ? "bag-handle"
                  : "person";
          return (
            <View style={styles.iconWrap}>
              <Ionicons name={icon as any} size={size} color={color} />
              {focused ? <View style={styles.dot} /> : null}
            </View>
          );
        }
      })}
    >
      <Tab.Screen name="Assistant" component={AssistantHomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Carts" component={CartsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    left: 18,
    right: 18,
    paddingTop: 5,
    height: 50,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.75)"
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 50
  },
  dot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.accent
  }
});

