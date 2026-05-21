import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { TabsNavigator } from "./TabsNavigator";
import { CheckoutScreen } from "../screens/CheckoutScreen";
import { ApiSettingsScreen } from "../screens/ApiSettingsScreen";
import { TrackingScreen } from "../screens/TrackingScreen";
import { InstamartCheckoutScreen } from "../screens/InstamartCheckoutScreen";

export type RootStackParamList = {
  Tabs: undefined;
  Checkout: undefined;
  ApiSettings: undefined;
  Tracking: undefined;
  InstamartCheckout: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" }
      }}
    >
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom"
        }}
      />
      <Stack.Screen
        name="ApiSettings"
        component={ApiSettingsScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom"
        }}
      />
      <Stack.Screen
        name="Tracking"
        component={TrackingScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom"
        }}
      />
      <Stack.Screen
        name="InstamartCheckout"
        component={InstamartCheckoutScreen}
        options={{
          presentation: "modal",
          animation: "slide_from_bottom"
        }}
      />
    </Stack.Navigator>
  );
}

