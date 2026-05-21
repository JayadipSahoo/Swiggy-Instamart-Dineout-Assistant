import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet } from "react-native";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { theme } from "./src/theme";
import { CartProvider } from "./src/state/CartContext";
import { LocationProvider } from "./src/state/LocationContext";

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <CartProvider>
        <LocationProvider>
          <NavigationContainer
            theme={{
              ...DefaultTheme,
              colors: { ...DefaultTheme.colors, background: theme.colors.bg0 }
            }}
          >
            <RootNavigator />
          </NavigationContainer>
        </LocationProvider>
      </CartProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg0,
  }
});

