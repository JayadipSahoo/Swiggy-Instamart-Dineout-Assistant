import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  apiBaseUrl: "swiggy-assistant/apiBaseUrl",
  savedLocations: "swiggy-assistant/savedLocations"
} as const;

export async function getApiBaseUrl(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(KEYS.apiBaseUrl);
  return raw?.trim() ? raw.trim() : null;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.apiBaseUrl, url.trim());
}

export type SavedLocation = {
  id: string;
  label: string; // e.g. "Home"
  subtitle: string; // short address string
  // Some sources (like MCP addresses) may not provide coordinates.
  latitude?: number;
  longitude?: number;
  // Optional raw address id (from backend/MCP) for future ordering flows.
  addressId?: string;
};

export async function getSavedLocations(): Promise<SavedLocation[]> {
  const raw = await AsyncStorage.getItem(KEYS.savedLocations);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedLocation[];
  } catch {
    return [];
  }
}

export async function setSavedLocations(list: SavedLocation[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.savedLocations, JSON.stringify(list));
}

